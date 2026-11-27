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
 * - B4/B5/B6 se releen dentro de la transacción (T249): hogar compartido, mascotas asignadas a un hogar con otros
 *   miembros ACTIVE y aserción de asignaciones ajenas en los hogares en cascada.
 * - T265: la fila ACCOUNT_DELETE (HMAC) y la seudonimización pasan por AuditLogPort/AuditPseudonymPort; el checkpoint del WAL va tras el commit (ADR-002-13).
 *
 * @implements REQ-ACC-001, REQ-ACC-002, REQ-AUTH2-003, REQ-TIME-001, STATE-ACCOUNT-DELETE-001, INV-AUTH2-001, INV-AUTH-005, INV-AUTH-003, INV-ARCH-001, INV-ARCH-005, ERR-AUTH-TOO-MANY-ATTEMPTS, ERR-AUTH-INVALID-CREDENTIALS, ERR-ACCOUNT-CONFIRMATION-MISMATCH, ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD, ERR-ACCOUNT-OWNS-SHARED-PETS, ERR-INTERNAL-UNEXPECTED
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
import { isConfirmationTokenShape, planHouseholdsForDeletion, planPetAssignmentsForDeletion } from '../../domain/account/account-deletion-guards.ts';
import type { LegacyHouseholdMember } from '../../domain/households/household-policies.ts';
import { userAvatarObjectKey } from '../../domain/media/media-keys.ts';
import { assertIanaTimeZone } from '../../domain/account/profile-policy.ts';
import { assertNotLockedOut, evaluateLoginAttempt, invalidCredentialsError, normalizeLoginIdentifier } from '../../domain/auth/auth-policies.ts';
import { sessionStateAt } from '../../domain/auth/session-policy.ts';
import type { RepositorySet, UserAccount } from '../ports/repositories.port.ts';
import { recordAudit } from './audit-support.ts';
import { purgeObjects, reinforcePrefix, reinforceUserPrefix } from './media-use-cases.ts';
import { chooseSuccessor } from '../../domain/pet/co-ownership.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import { runOwnershipTransaction, settledRequest, withEffectiveStatus } from './co-ownership-support.ts';
import { applyLeave } from './co-ownership-use-cases.ts';
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
export async function verifyCurrentPassword(deps: ApplicationDeps, repositories: RepositorySet, account: UserAccount, password: string, now: string): Promise<boolean> {
  const failureKey = normalizeLoginIdentifier(account.username);
  const failures = await repositories.loginAttempts.listFailures(failureKey);
  assertNotLockedOut(failures, now);
  const matches = await deps.hasher.verify(password, account.passwordHash);
  const outcome = evaluateLoginAttempt(failures, now, () => matches);
  if (outcome.event === 'LOGIN_FAILURE') await repositories.loginAttempts.replaceFailures(failureKey, outcome.failures);
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
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: 'USER', entityId: userId, previous: account, next: updated });
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
      const changedAccount: UserAccount = { ...account, passwordHash: await this.deps.hasher.hash(valid.newPassword) };
      await repositories.users.update(changedAccount);
      // La vista canónica excluye passwordHash: la fila existe pero ambos hashes coinciden (INV-AUD-001).
      await recordAudit(this.deps, repositories, { executorUserId: userId, mutationType: 'UPDATE', entityType: 'USER', entityId: userId, previous: account, next: changedAccount });
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
    // A3: seudónimo HMAC-SHA256 del userId (cálculo puro, mismo secreto y formato para executorUserId y entityId).
    const pseudonym = this.deps.auditPseudonym.hmacUserId(userId, this.deps.auditHmacSecret);

    // REQ-GCS-004: claves de medios y avatares de todas las mascotas propias; se encolan en la transacción y se borran tras el COMMIT.
    const objectKeys: string[] = [];
    let ownedPetIdsForCleanup: string[] = [];
    await runOwnershipTransaction(this.deps, async (repositories) => {
      objectKeys.length = 0;
      // B2: la sesión y la cuenta siguen vigentes (petición simultánea).
      const account = await repositories.users.findById(userId);
      const session = sessionToken === null ? null : await repositories.sessions.findByToken(sessionToken);
      if (account === null || session === null || session.userId !== userId || sessionStateAt(session, now) !== 'AUTHENTICATED') {
        throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      }
      // B3: consumo condicional del token; el rollback posterior lo revierte.
      if (!(await this.deps.backupTokens.consume(repositories, userId, token, now))) throw new DomainError('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
      // B4..B10: bloqueos por hogar y mascotas compartidas, escena, auditoría y borrado de hoja a raíz (cascada compartida con la vía de Google de 009).
      const erased = await eraseAccountInTransaction(this.deps, repositories, {
        userId,
        account,
        pseudonym,
        now,
        rejectBlocked: (block) => new DomainError(block.blockingHouseholdIds.length > 0 ? 'ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD' : 'ERR-ACCOUNT-OWNS-SHARED-PETS'),
      });
      objectKeys.push(...erased.objectKeys);
      ownedPetIdsForCleanup = erased.ownedPetIds;
    });
    // Tras el commit: borrado inmediato de los objetos y refuerzo por `list` (REQ-GCS-004); lo que falle lo reintenta el mantenimiento.
    await purgeObjects(this.deps, objectKeys);
    await reinforcePrefix(this.deps, ownedPetIdsForCleanup);
    await reinforceUserPrefix(this.deps, userId); // 011 (INV-PRF11-001): la foto de perfil y lo que sobre bajo `users/<userId>/`
    // Checkpoint del WAL con truncado (ADR-002-13). Un fallo no revierte la eliminación.
    await this.deps.uow.checkpointAfterCommit?.();
    return 204;
  }
}

/** Lo que impide eliminar la cuenta: hogares de la persona con otro miembro ACTIVE y/o mascotas suyas asignadas a un hogar con otro miembro ACTIVE (REQ-ACC-002, D9-24 = A). */
export interface ErasureBlock {
  readonly blockingHouseholdIds: readonly string[];
  readonly blockingAssignments: ReadonlyArray<{ readonly petId: string; readonly householdId: string }>;
  /** Membresías de todos los hogares implicados (propios y de asignación), para contar miembros ACTIVE sin otra lectura. */
  readonly memberships: readonly LegacyHouseholdMember[];
}

export interface ErasureOutcome {
  /** Claves de medios encoladas en la transacción; se borran tras el COMMIT (REQ-GCS-004). */
  readonly objectKeys: string[];
  readonly ownedPetIds: string[];
}

/**
 * Cascada de la eliminación de cuenta de REQ-ACC-002 dentro de la transacción de la fase B (B4..B10): plan de hogares y de mascotas releído, rechazo si algo bloquea
 * (`rejectBlocked` elige el código: la vía por contraseña de 004 usa ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD / ERR-ACCOUNT-OWNS-SHARED-PETS y la vía de Google de 009,
 * ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE con la lista de hogares), escena, auditoría ACCOUNT_DELETE con seudónimo HMAC y borrado de hoja a raíz con su poscondición.
 * Una sola implementación para las dos vías de eliminación (T1284: no se duplica la regla).
 * @implements REQ-ACC-002, STATE-ACCOUNT-DELETE-001, REQ-AUD-001, REQ-DEL9-001
 */
export async function eraseAccountInTransaction(
  deps: ApplicationDeps,
  repositories: RepositorySet,
  params: { readonly userId: string; readonly account: UserAccount; readonly pseudonym: string; readonly now: string; readonly rejectBlocked: (block: ErasureBlock) => Error },
): Promise<ErasureOutcome> {
  const { userId, account, pseudonym, now } = params;
  const objectKeys: string[] = [];
  // B4: hogares de la persona con otro miembro ACTIVE (releído dentro de la transacción).
  const own = await repositories.households.listMembershipsOfUsers([userId]);
  const householdIds = [...new Set(own.map((m) => m.householdId))];
  const memberships = (await Promise.all(householdIds.map((id) => repositories.households.listMemberships(id)))).flat();
  const plan = planHouseholdsForDeletion(userId, memberships);
  // 012 (REQ-OWN12-008 (c), REQ-OWN12-011): una mascota con un co-propietario ACTIVE NO se elimina con la cuenta de su principal: hereda el de menor `joined_at`. Solo se eliminan las que no tienen sucesor.
  // Las mascotas se procesan en orden estable `pet_id ASC` (sin interbloqueos) y el bloqueo por mascota lo toma `applyLeave`.
  const allOwnedPets = (await repositories.pets.listByOwners([userId])).sort((a, b) => (a.id < b.id ? -1 : 1));
  const coOwnedPetIds = (await repositories.coOwners.listByUser(userId)).filter((row) => row.status === 'ACTIVE').map((row) => row.petId);
  const inheriting: string[] = [];
  const ownedPets: PetProfile[] = [];
  for (const pet of allOwnedPets) {
    const successor = chooseSuccessor({ leavingUserId: userId, coOwners: withEffectiveStatus(await repositories.coOwners.listByPet(pet.id), now), accountDeletion: true });
    if (successor === null) ownedPets.push(pet);
    else inheriting.push(pet.id);
  }
  const ownedPetIds = ownedPets.map((p) => p.id);
  const staying = [...new Set([...inheriting, ...coOwnedPetIds])];
  // B5: mascotas propias SIN sucesor asignadas a un hogar con otro miembro ACTIVE; B6: aserción de seguridad (las de co-propiedad se desasignan antes de la cascada).
  const assignmentLists = await Promise.all([
    ...[...ownedPetIds, ...staying].map((id) => repositories.assignments.listByPet(id)),
    ...plan.cascadeHouseholdIds.map((id) => repositories.assignments.listByHousehold(id)),
  ]);
  const assignments = assignmentLists.flat();
  const assignedHouseholdIds = [...new Set(assignments.map((a) => a.householdId))];
  const assignedMemberships = (await Promise.all(assignedHouseholdIds.map((id) => repositories.households.listMemberships(id)))).flat();
  const petPlan = planPetAssignmentsForDeletion(userId, ownedPetIds, assignments, assignedMemberships, plan.cascadeHouseholdIds);
  if (plan.blockingHouseholdIds.length > 0 || petPlan.blockingAssignments.length > 0) {
    throw params.rejectBlocked({ blockingHouseholdIds: plan.blockingHouseholdIds, blockingAssignments: petPlan.blockingAssignments, memberships: [...memberships, ...assignedMemberships] });
  }
  if (planPetAssignmentsForDeletion(userId, [...ownedPetIds, ...staying], assignments, assignedMemberships, plan.cascadeHouseholdIds).foreignAssignmentsInCascade.length > 0) {
    throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'Un hogar en cascada contiene asignaciones de mascotas de otra persona; se revierte sin borrar datos ajenos.');
  }
  // 012: sucesión del principal y salida del co-propietario ANTES de la auditoría de la cuenta (así B8 seudonimiza también sus filas), en orden `pet_id ASC` bajo el bloqueo por mascota.
  for (const petId of [...staying].sort()) await applyLeave(deps, repositories, { petId, leavingUserId: userId, accountDeletion: true });
  // 006 (T865, REQ-ESC6-029, REQ-ESC6-032): ANTES de borrar nada, la escena encola sus objetos y la foto, arrastra la cuota y seudonimiza sus columnas sin FK; misma transacción.
  await deps.sceneHooks?.onAccountDeleting(repositories, { userId, pseudonym, householdIds: [...plan.cascadeHouseholdIds], now });
  // B7: una sola fila ACCOUNT_DELETE/USER con el HMAC en executorUserId y entityId (sin userId en claro).
  await recordAudit(deps, repositories, { executorUserId: pseudonym, mutationType: 'ACCOUNT_DELETE', entityType: 'USER', entityId: pseudonym, previous: account, next: null });
  // B8: el historial previo del usuario (executorUserId y entityId de filas USER) pasa a su HMAC.
  await deps.auditLog.pseudonymizeUser(repositories, userId, pseudonym);
  // B9: de hoja a raíz.
  for (const pet of ownedPets) {
    // 012 (REQ-PET-004, NFR-012-009): las invitaciones se cancelan y las solicitudes no-disputa `PENDING` pasan a `CANCELLED` (se conservan 90 días; el expediente de una disputa sobrevive con `pet_id` nulo, INV-CHP12-005).
    for (const row of await repositories.coOwners.listByPet(pet.id)) if (row.status === 'INVITED') await repositories.coOwners.transition(row.id, 'INVITED', { status: 'CANCELLED', leftAt: now });
    for (const request of await repositories.ownerRequests.listByPet(pet.id)) {
      if (request.status === 'PENDING' && request.action !== 'CHIP_DISPUTE') await repositories.ownerRequests.update(settledRequest(request, { status: 'CANCELLED', decidedAt: now }), 'PENDING');
    }
    objectKeys.push(...(await repositories.mediaQueue.enqueueObjectsOfPet(pet.id, now)));
    await repositories.records.deleteForPet(pet.id);
    await repositories.assignments.deleteForPet(pet.id);
    await repositories.pets.delete(pet.id);
  }
  await repositories.invitations.deleteForUser(userId);
  for (const householdId of plan.cascadeHouseholdIds) {
    await repositories.invitations.deleteForHousehold(householdId);
    await repositories.assignments.deleteForHousehold(householdId);
  }
  await repositories.households.deleteMembershipsOfUser(userId);
  for (const householdId of plan.cascadeHouseholdIds) await repositories.households.deleteWithMemberships(householdId);
  await repositories.sessions.deleteByUser(userId);
  await repositories.confirmationTokens.deleteForUser(userId);
  await repositories.rateLimits.deleteForUser(userId);
  // Feature 005 (REQ-VET-008, REQ-VET-010): los enlaces del creador caen por cascada con `users.delete`; la auditoría no tiene clave foránea y pasa a actor nulo en esta misma transacción.
  await repositories.shareAudit.clearActor(userId);
  await repositories.loginAttempts.deleteFailures(normalizeLoginIdentifier(account.username));
  // 011 (#78, INV-PRF11-001, SC-011-060, Trinity H-8/H-9): la foto de perfil entra en la cola con `DELETE` en ESTA transacción, con el candado del usuario tomado (un `PUT` en vuelo ya no
  // puede publicar una foto nueva: su transacción final ve la fila ausente y descarta su objeto). Mismo camino para la vía con contraseña y la de Google.
  await repositories.users.findByIdForUpdate(userId);
  // 012 (NFR-012-009, SC-012-076, SC-012-108): `user_id`, `invited_by_user_id`, `requester`, `target`, `rejected_by`, `resolved_by`, `second_approver`, `approver_set` y `approvals` pasan a NULL / seudónimo.
  await repositories.coOwners.pseudonymizeUser(userId, pseudonym);
  await repositories.ownerRequests.pseudonymizeUser(userId, pseudonym);
  await repositories.shareLinks.pseudonymizePetOwnerSnapshot(userId, pseudonym); // rama R-04: enlaces de OTROS creadores que guardaron al principal que se va
  const avatar = await repositories.users.findAvatar(userId);
  if (avatar !== null && avatar.objectId !== null) {
    const avatarKey = userAvatarObjectKey(userId, avatar.objectId);
    await repositories.mediaQueue.enqueue(avatarKey, 'DELETE', now);
    objectKeys.push(avatarKey);
  }
  await repositories.users.delete(userId);
  // B10: poscondición: ninguna fila referencia al usuario (la cascada de la clave foránea elimina también `auth_identities` y los estados de flujo).
  if ((await repositories.users.countReferences(userId)) !== 0) {
    throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'La eliminación de la cuenta dejó filas que referencian al usuario; se revierte.');
  }
  return { objectKeys, ownedPetIds };
}
