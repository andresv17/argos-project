/**
 * Casos de uso de la cuenta: perfil, cambio de contraseña y eliminación de cuenta en dos fases.
 * - REQ-ACC-001: edición de displayName, correo, idioma y zona horaria de pantalla (REQ-TIME-001: el timezone nunca
 *   altera un cálculo; los días civiles salen de ClockPort).
 * - REQ-AUTH2-003 / INV-AUTH-005: la contraseña actual incorrecta cuenta para el mismo limitador que el login (el
 *   fallo se confirma antes de responder), la nueva cumple INV-AUTH2-001 y las demás sesiones se revocan en la misma
 *   transacción que el cambio de hash, conservando la actual.
 * - REQ-ACC-002 / STATE-ACCOUNT-DELETE-001: la fase A (esquema, contraseña, forma del token, seudónimo) no escribe nada
 *   salvo el contador de fallos de contraseña; la fase B es una única transacción: consume el token, relee los
 *   bloqueos, borra de hoja a raíz, comprueba poscondiciones y confirma. Cualquier fallo de B revierte todo, incluido el
 *   consumo del token.
 * - T243 PENDIENTE: ERR-ACCOUNT-OWNS-SHARED-PETS y la aserción B6 llegan con las asignaciones mascota-hogar.
 * - T265 PENDIENTE: la fila ACCOUNT_DELETE y la seudonimización pasan por AuditLogPort (nulo en la rebanada 1).
 *
 * @implements REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003, REQ-TIME-001, STATE-ACCOUNT-DELETE-001, INV-AUTH2-001, INV-AUTH-005, INV-AUTH-003, INV-ARCH-001, INV-ARCH-005, ERR-AUTH-TOO-MANY-ATTEMPTS, ERR-AUTH-INVALID-CREDENTIALS, ERR-ACCOUNT-CONFIRMATION-MISMATCH, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-INTERNAL-UNEXPECTED
 */

import {
  DomainError,
  validateChangePasswordInput,
  validateDeleteAccountInput,
  validateUpdateProfileInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type UpdateProfileInput,
  type UserSelfProfile,
} from '../../generated/index.ts';
import { isConfirmationTokenShape, planHouseholdsForDeletion } from '../../domain/account/account-deletion-guards.ts';
import { assertIanaTimeZone } from '../../domain/account/profile-policy.ts';
import { assertNotLockedOut, evaluateLoginAttempt, invalidCredentialsError } from '../../domain/auth/auth-policies.ts';
import { sessionStateAt } from '../../domain/auth/session-policy.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import { assertMatchesAnnotatedSchema, assertMatchesSchema, toSelfProfile, type ApplicationDeps } from './use-case-support.ts';

async function requireAccount(repositories: RepositorySet, userId: string): Promise<UserAccount> {
  const account = await repositories.users.findById(userId);
  if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
  return account;
}

/**
 * Verifica la contraseña actual con el limitador de INV-AUTH-005 (T3). Un intento bloqueado lanza
 * ERR-AUTH-TOO-MANY-ATTEMPTS sin verificar ni registrar; un fallo se registra y devuelve false. El éxito no borra los
 * fallos previos (T210 PENDIENTE: la spec solo fija ese borrado para el inicio de sesión; se elige el comportamiento
 * conservador).
 */
async function verifyCurrentPassword(deps: ApplicationDeps, repositories: RepositorySet, account: UserAccount, password: string, now: string): Promise<boolean> {
  const failures = await repositories.loginAttempts.listFailures(account.username);
  assertNotLockedOut(failures, now);
  const matches = await deps.hasher.verify(password, account.passwordHash);
  const outcome = evaluateLoginAttempt(failures, now, () => matches);
  if (outcome.event === 'LOGIN_FAILURE') await repositories.loginAttempts.replaceFailures(account.username, outcome.failures);
  return matches;
}

/** @implements REQ-ACC-001, REQ-TIME-001 */
export class UpdateProfileUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, input: unknown): Promise<UserSelfProfile> {
    const patch = assertMatchesSchema<UpdateProfileInput>('UpdateProfileInput', validateUpdateProfileInput, input);
    if (patch.timezone !== undefined) assertIanaTimeZone(patch.timezone);
    return this.deps.uow.runInTransaction(async (repositories) => {
      const account = await requireAccount(repositories, userId);
      const updated: UserAccount = {
        ...account,
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
        ...(patch.email === undefined ? {} : { email: patch.email }),
        ...(patch.preferredLanguage === undefined ? {} : { preferredLanguage: patch.preferredLanguage }),
        ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
      };
      await repositories.users.update(updated);
      return toSelfProfile(updated);
    });
  }
}

/** @implements REQ-AUTH2-003, INV-AUTH2-001, INV-AUTH-005 */
export class ChangePasswordUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** 204 al cambiar; la sesión de `sessionToken` se conserva y las demás de la persona se revocan. */
  async execute(userId: string, sessionToken: string | null, input: unknown): Promise<204> {
    const valid = assertMatchesAnnotatedSchema<ChangePasswordInput>('ChangePasswordInput', validateChangePasswordInput, input);
    const now = this.deps.clock.nowIsoTimestamp();
    const changed = await this.deps.uow.runInTransaction(async (repositories) => {
      const account = await requireAccount(repositories, userId);
      if (!(await verifyCurrentPassword(this.deps, repositories, account, valid.currentPassword, now))) return false;
      await repositories.users.update({ ...account, passwordHash: await this.deps.hasher.hash(valid.newPassword) });
      if (sessionToken !== null) await repositories.sessions.revokeOthers(userId, sessionToken, now);
      return true;
    });
    if (!changed) throw invalidCredentialsError();
    return 204;
  }
}

/** @implements REQ-ACC-002, STATE-ACCOUNT-DELETE-001, REQ-AUD-001 */
export class DeleteAccountUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, sessionToken: string | null, input: unknown): Promise<204> {
    // A1: esquema (frase literal y contraseña). El token es opcional en el esquema: su forma se resuelve en A2.
    const request = assertMatchesSchema<DeleteAccountInput>('DeleteAccountInput', validateDeleteAccountInput, input);
    const now = this.deps.clock.nowIsoTimestamp();
    // A2: contraseña actual con el limitador (único efecto: el contador de fallos) y forma del token.
    const verified = await this.deps.uow.runInTransaction(async (repositories) =>
      verifyCurrentPassword(this.deps, repositories, await requireAccount(repositories, userId), request.password, now),
    );
    if (!verified) throw invalidCredentialsError();
    const token = request.backupConfirmationToken;
    if (!isConfirmationTokenShape(token)) throw new DomainError('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
    // A3: seudónimo del userId (cálculo puro).
    const pseudonym = this.deps.audit.pseudonymOf(userId);

    return this.deps.uow.runInTransaction(async (repositories) => {
      // B2: la sesión y la cuenta siguen vigentes (petición simultánea).
      const account = await repositories.users.findById(userId);
      const session = sessionToken === null ? null : await repositories.sessions.findByToken(sessionToken);
      if (account === null || session === null || session.userId !== userId || sessionStateAt(session, now) !== 'AUTHENTICATED') {
        throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      }
      // B3: consumo condicional del token; el rollback posterior lo revierte.
      if (!(await this.deps.backupTokens.consume(repositories, userId, token, now))) throw new DomainError('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
      // B4: bloqueo por hogar compartido; B5/B6 (mascotas asignadas) llegan con T243.
      const own = await repositories.households.listMembershipsOfUsers([userId]);
      const householdIds = [...new Set(own.map((m) => m.householdId))];
      const memberships = (await Promise.all(householdIds.map((id) => repositories.households.listMemberships(id)))).flat();
      const plan = planHouseholdsForDeletion(userId, memberships);
      if (plan.blockingHouseholdIds.length > 0) throw new DomainError('ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD');
      // B7 y B8: auditoría y seudonimización (nula en la rebanada 1).
      await this.deps.audit.recordAccountDeletion(repositories, pseudonym, now);
      // B9: de hoja a raíz.
      for (const pet of await repositories.pets.listByOwners([userId])) {
        await repositories.records.deleteForPet(pet.id);
        await repositories.pets.delete(pet.id);
      }
      await repositories.invitations.deleteForUser(userId);
      for (const householdId of plan.cascadeHouseholdIds) await repositories.invitations.deleteForHousehold(householdId);
      await repositories.households.deleteMembershipsOfUser(userId);
      for (const householdId of plan.cascadeHouseholdIds) await repositories.households.deleteWithMemberships(householdId);
      await repositories.sessions.deleteByUser(userId);
      await repositories.confirmationTokens.deleteForUser(userId);
      await repositories.rateLimits.deleteForUser(userId);
      await repositories.loginAttempts.deleteFailures(account.username);
      await repositories.users.delete(userId);
      // B10: poscondición: ninguna fila referencia al usuario.
      if ((await repositories.users.countReferences(userId)) !== 0) {
        throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'La eliminación de la cuenta dejó filas que referencian al usuario; se revierte.');
      }
      return 204 as const;
    });
  }
}
