/**
 * Eliminación de una cuenta nacida con Google (Feature 009, Fase 2, deuda #17 = `DEUDA-008-GOOGLE-ACCOUNT-DELETE`, `D9-15` = A, `D9-17` = A, `D9-24` = A, ADR-009-04).
 * - `StartAccountDeletionReauthUseCase` (`startAccountDeletionReauth`): solo para una cuenta SIN contraseña con Google vinculado; guarda el estado de flujo con intención DELETE
 *   (usuario, hash de la sesión de origen) y devuelve la URL de Google con `max_age` y `prompt=login`. El retorno es el callback de 008, que solo registra la prueba.
 * - `DeleteAccountWithGoogleUseCase` (`deleteAccountWithGoogleReauth`): fase A sin escrituras (esquema cerrado, prueba vigente ligada a ESTA sesión y al `sub` vinculado, forma del
 *   token de respaldo opcional) y fase B en una transacción (consume la prueba por compare-and-set, consume el token si vino, rechaza si la persona es propietaria de hogares con
 *   miembros ACTIVE o mascotas compartidas, y aplica la cascada de REQ-ACC-002 compartida con la vía por contraseña). Un fallo de B revierte todo, incluido el consumo de la prueba.
 * - Toda ausencia, vencimiento, reutilización, ajenidad o cuenta con contraseña es el MISMO `ERR-ACCOUNT-DELETE-REAUTH-REQUIRED` (403): no revela el `sub` ni el correo.
 *
 * @implements REQ-DEL9-001, INV-DEL9-001, REQ-ACC-002, EDGE-009-031, EDGE-009-032, EDGE-009-049, ERR-ACCOUNT-DELETE-REAUTH-REQUIRED, ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE, INV-ARCH-001, INV-ARCH-005
 */

import { isConfirmationTokenShape } from '../../domain/account/account-deletion-guards.ts';
import { ACCOUNT_DELETE_REAUTH_MAX_AGE_SECONDS } from '../../domain/auth/reauthentication-policy.ts';
import { hasPassword } from '../../domain/auth/password-sentinel.ts';
import { hashSessionToken, sessionStateAt } from '../../domain/auth/session-policy.ts';
import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV35 } from '../../generated/v35/index.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { eraseAccountInTransaction, type ErasureBlock } from './account-use-cases.ts';
import { beginAuthorization, requireGoogle, serverMisconfigured, type GoogleAuthorizationStart } from './google-auth-use-cases.ts';
import { purgeObjects, reinforcePrefix, reinforceUserPrefix } from './media-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Frase literal de `DeleteAccountWithGoogleInput` (igual que `STATE-ACCOUNT-DELETE-001`). */
const CONFIRMATION_PHRASE = 'ELIMINAR MI CUENTA';
const MAX_LISTED_HOUSEHOLDS = 100;

/** El único error de toda prueba de titularidad que falla (ausente, vencida, reutilizada, ajena o cuenta con contraseña). */
export const reauthRequired = (): DomainErrorV35 => new DomainErrorV35('ERR-ACCOUNT-DELETE-REAUTH-REQUIRED');

export interface AffectedHousehold {
  readonly householdId: string;
  readonly name: string;
  /** Otros miembros ACTIVE (sin contar a la persona). */
  readonly activeMembers: number;
  /** Mascotas de la persona asignadas a ese hogar. */
  readonly sharedPets: number;
}

/** 409 de la vía de Google (D9-24 = A): `ProblemDetails` más la lista estructurada de hogares afectados (extensión cerrada de RFC 9457). */
export class HouseholdsActiveError extends DomainErrorV35 {
  public readonly households: readonly AffectedHousehold[];

  constructor(households: readonly AffectedHousehold[]) {
    const template = new DomainErrorV35('ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE').detail;
    super('ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE', `${template} Hogares afectados: ${households.map((h) => h.name).join(', ')}.`);
    this.households = households;
  }

  public override toProblemDetails(instance: string | null = null) {
    return { ...super.toProblemDetails(instance), households: this.households.map((h) => ({ ...h })) };
  }
}

/** @implements REQ-DEL9-001, INV-DEL9-001, EDGE-009-032 */
export class StartAccountDeletionReauthUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, sessionToken: string): Promise<GoogleAuthorizationStart> {
    const google = requireGoogle(this.deps, serverMisconfigured);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const account = await repositories.users.findById(userId);
      if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      // EDGE-009-032: con contraseña (o sin Google vinculado) esta vía no aplica; el borrado por contraseña de 004 no cambia.
      if (hasPassword(account.passwordHash) || (await repositories.authIdentities.listByUser(userId)).length === 0) throw reauthRequired();
      return beginAuthorization(google, repositories, now, 'DELETE', userId, hashSessionToken(sessionToken), ACCOUNT_DELETE_REAUTH_MAX_AGE_SECONDS);
    });
  }
}

interface DeleteWithGoogleRequest {
  readonly backupConfirmationToken: string | undefined;
}

/** Esquema cerrado de `DeleteAccountWithGoogleInput`: solo `confirmationPhrase` (literal) y `backupConfirmationToken` (cadena; su forma se juzga después como MISMATCH). */
function parseDeleteInput(input: unknown): DeleteWithGoogleRequest {
  const fail = (field: string | null): never => {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `DeleteAccountWithGoogleInput: ${field ?? '(raíz)'} no cumple el esquema.`, field);
  };
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail(null);
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) if (key !== 'confirmationPhrase' && key !== 'backupConfirmationToken') return fail(key);
  if (body['confirmationPhrase'] !== CONFIRMATION_PHRASE) return fail('confirmationPhrase');
  const token = body['backupConfirmationToken'];
  if (token !== undefined && typeof token !== 'string') return fail('backupConfirmationToken');
  return { backupConfirmationToken: token };
}

/** Hogares afectados (D9-24 = A) a partir de lo que bloquea: nombre, otros miembros ACTIVE y mascotas de la persona asignadas al hogar. */
async function describeAffectedHouseholds(repositories: RepositorySet, userId: string, block: ErasureBlock): Promise<AffectedHousehold[]> {
  const ids = [...new Set([...block.blockingHouseholdIds, ...block.blockingAssignments.map((a) => a.householdId)])].slice(0, MAX_LISTED_HOUSEHOLDS);
  const listed: AffectedHousehold[] = [];
  for (const householdId of ids) {
    const household = await repositories.households.findById(householdId);
    if (household === null) continue;
    const others = new Set(block.memberships.filter((m) => m.householdId === householdId && m.status === 'ACTIVE' && m.userId !== userId).map((m) => m.userId));
    listed.push({
      householdId,
      name: household.name,
      activeMembers: others.size,
      sharedPets: block.blockingAssignments.filter((a) => a.householdId === householdId).length,
    });
  }
  return listed;
}

/** @implements REQ-DEL9-001, INV-DEL9-001, REQ-ACC-002, EDGE-009-031, EDGE-009-049, REQ-AUD-001 */
export class DeleteAccountWithGoogleUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, sessionToken: string | null, input: unknown): Promise<204> {
    // A1: esquema cerrado (frase literal; sin contraseña, sub, correo ni prueba en el cuerpo).
    const request = parseDeleteInput(input);
    if (sessionToken === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
    const originHash = hashSessionToken(sessionToken);
    const now = this.deps.clock.nowIsoTimestamp();
    // A2 (sin escrituras): cuenta sin contraseña y prueba vigente, no consumida, ligada a ESTA sesión y al `sub` vinculado; luego la forma del token de respaldo si vino.
    await this.deps.uow.runInTransaction(async (repositories) => {
      await this.requireProof(repositories, userId, originHash, now);
    });
    const token = request.backupConfirmationToken;
    if (token !== undefined && !isConfirmationTokenShape(token)) throw new DomainError('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
    // A3: seudónimo HMAC-SHA256 del userId (mismo secreto y formato que la vía por contraseña).
    const pseudonym = this.deps.auditPseudonym.hmacUserId(userId, this.deps.auditHmacSecret);

    const objectKeys: string[] = [];
    let ownedPetIdsForCleanup: string[] = [];
    await this.deps.uow.runInTransaction(async (repositories) => {
      objectKeys.length = 0;
      // B2: la sesión y la cuenta siguen vigentes (petición simultánea).
      const account = await repositories.users.findById(userId);
      const session = await repositories.sessions.findByToken(sessionToken);
      if (account === null || session === null || session.userId !== userId || sessionStateAt(session, now) !== 'AUTHENTICATED') throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      // B3: consumo condicional de la prueba (exactamente 1 fila); el rollback de un rechazo posterior la devuelve y sigue vigente hasta su vencimiento.
      const proof = await this.requireProof(repositories, userId, originHash, now);
      if (!(await repositories.oauthFlows.consumeDeletionProof(proof.tokenHash, now))) throw reauthRequired();
      // B3b: token de respaldo opcional (decisión de Neo en T1217): si viene, se consume con la semántica de REQ-ACC-002 (5).
      if (token !== undefined && !(await this.deps.backupTokens.consume(repositories, userId, token, now))) throw new DomainError('ERR-ACCOUNT-CONFIRMATION-MISMATCH');
      // B4..B10: la cascada de REQ-ACC-002; el rechazo por hogares es el de D9-24 = A con la lista de hogares afectados.
      const erased = await eraseAccountInTransaction(this.deps, repositories, {
        userId,
        account,
        pseudonym,
        now,
        rejectBlocked: (block) => new HouseholdsActiveErrorPending(block),
      });
      objectKeys.push(...erased.objectKeys);
      ownedPetIdsForCleanup = erased.ownedPetIds;
    }).catch(async (error: unknown) => {
      if (!(error instanceof HouseholdsActiveErrorPending)) throw error;
      // La transacción ya se revirtió (incluido el consumo de la prueba): la lista se arma en una lectura aparte, sin escribir.
      throw new HouseholdsActiveError(await this.deps.uow.runInTransaction((repositories) => describeAffectedHouseholds(repositories, userId, error.block)));
    });
    // Tras el commit: borrado inmediato de los objetos y refuerzo por `list` (REQ-GCS-004); lo que falle lo reintenta el mantenimiento.
    await purgeObjects(this.deps, objectKeys);
    await reinforcePrefix(this.deps, ownedPetIdsForCleanup);
    await reinforceUserPrefix(this.deps, userId); // 011 (INV-PRF11-001): la foto de perfil y lo que sobre bajo `users/<userId>/`
    // Checkpoint del WAL con truncado (ADR-002-13). Un fallo no revierte la eliminación.
    await this.deps.uow.checkpointAfterCommit?.();
    return 204;
  }

  /** La prueba vigente de ESTA sesión; cualquier otra situación es el mismo `ERR-ACCOUNT-DELETE-REAUTH-REQUIRED`. */
  private async requireProof(repositories: RepositorySet, userId: string, originHash: string, now: string) {
    const account = await repositories.users.findById(userId);
    if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
    if (hasPassword(account.passwordHash)) throw reauthRequired();
    const proof = await repositories.oauthFlows.findDeletionProof(userId, originHash, now);
    if (proof === null || proof.pendingSubject === null) throw reauthRequired();
    const linked = await repositories.authIdentities.listByUser(userId);
    if (!linked.some((identity) => identity.providerSubject === proof.pendingSubject)) throw reauthRequired();
    return proof;
  }
}

/** Señal interna entre la transacción (que se revierte) y la construcción del 409 con la lista de hogares; no sale de este módulo. */
class HouseholdsActiveErrorPending extends Error {
  constructor(public readonly block: ErasureBlock) {
    super('hogares con miembros activos');
  }
}
