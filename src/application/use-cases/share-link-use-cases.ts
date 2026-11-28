/**
 * Casos de uso autenticados del enlace veterinario (feature 005, US4): crear (con `Idempotency-Key`), listar (solo metadatos), revocar.
 *
 * Crear (REQ-VET-001, data-model.md §3.1): el token se genera en memoria y, en UNA transacción: candado del ALCANCE (mascota u hogar, nunca el usuario creador,
 * EDGE-005-15) -> permiso `CREATE_SHARE_LINK` (404 antes que 403) -> validación de la clave y del cuerpo (422) -> búsqueda de `(creador, clave)`: con el mismo
 * alcance y opciones es REPLAY (200 sin token, sin fila ni auditoría; con otro alcance u opciones, 422) -> conjunto servido no vacío -> conteo de activos BAJO el
 * candado (20 o más: ERR-SHARE-LINK-LIMIT) -> fila (solo `token_hash`) y auditoría `CREATED` -> COMMIT. Solo entonces se devuelve el token (INV-005-005); cualquier
 * fallo descarta todo.
 * Revocar (REQ-VET-005, STATE-SHARE-001): `UPDATE … WHERE revoked_at IS NULL AND expires_at > now` + auditoría `REVOKED` en la misma transacción; ya revocado o VENCIDO
 * es un no-op (204 sin escribir ni auditar); sin autoridad o inexistente, el mismo 404.
 *
 * @implements REQ-VET-001, REQ-VET-003, REQ-VET-004, REQ-VET-005, REQ-VET-008, REQ-VET-012, STATE-SHARE-001, INV-005-005, SC-005-015, SC-005-019, SC-005-025, SC-005-038, SC-005-046, SC-005-051, ERR-SHARE-LINK-LIMIT, ERR-SHARE-NOT-FOUND, EDGE-005-15, EDGE-005-16, EDGE-005-17-bis
 */
import { assertNever, retentionCutoffs, computeExpiresAt, deriveStatus, isExpiryDays, isRevocationNoop, DEFAULT_EXPIRY_DAYS, MAX_ACTIVE_SHARE_LINKS, type ShareLinkRecord } from '../../domain/sharing/share-link.ts';
import { hashToken } from '../../domain/sharing/share-token.ts';
import { isOwnerOfPet } from '../../domain/access/pet-ownership.ts';
import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV33, type CreateShareLinkInput, type ShareLinkList, type ShareLinkView } from '../../generated/v33/index.ts';
import { validateCreateShareLinkInput } from '../../generated/v33/index.ts';
import { isHouseholdManager, requireShareAuthority, scopeIdOf, type ShareScopeRef } from '../sharing/share-access.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { ShareLinkIdempotencyConflictError } from '../ports/share-link.port.ts';
import { assertMatchesSchema, type ApplicationDeps, type SharingServices } from './use-case-support.ts';

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_LISTED = 200;

export function requireSharing(deps: Pick<ApplicationDeps, 'sharing'>): SharingServices {
  if (deps.sharing === undefined) throw new DomainErrorV33('ERR-INTERNAL-UNEXPECTED', 'El enlace veterinario no está configurado.');
  return deps.sharing;
}

/** `ShareLinkView` de la API: metadatos sin token, sin hash, sin clave de idempotencia y sin el propietario de la mascota al crear. */
export function toShareLinkView(link: ShareLinkRecord, now: string): ShareLinkView {
  return {
    id: link.id,
    scope: link.scope,
    petId: link.petId,
    householdId: link.householdId,
    status: deriveStatus(link, now),
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    includeMicrochip: link.includeMicrochip,
    includeClinicalFiles: link.includeClinicalFiles,
    includeDeceasedAt: link.includeDeceasedAt,
  };
}

export type CreateShareLinkOutcome = { readonly kind: 'CREATED'; readonly link: ShareLinkView; readonly token: string } | { readonly kind: 'REPLAY'; readonly link: ShareLinkView };

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Idempotency-Key debe ser un UUID v4 en minúsculas.', 'Idempotency-Key');
  }
  return value;
}

function parseCreateInput(body: unknown): { expiresInDays: 1 | 7 | 30; includeMicrochip: boolean; includeClinicalFiles: boolean; includeDeceasedAt: boolean } {
  const input = assertMatchesSchema<CreateShareLinkInput>('CreateShareLinkInput', validateCreateShareLinkInput, body);
  const expiresInDays = input.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  if (!isExpiryDays(expiresInDays)) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'expiresInDays debe ser 1, 7 o 30.', 'expiresInDays');
  return { expiresInDays, includeMicrochip: input.includeMicrochip ?? false, includeClinicalFiles: input.includeClinicalFiles ?? false, includeDeceasedAt: input.includeDeceasedAt ?? false };
}

const sameCreation = (link: ShareLinkRecord, ref: ShareScopeRef, input: ReturnType<typeof parseCreateInput>): boolean =>
  link.scope === ref.scope &&
  (ref.scope === 'PET' ? link.petId === ref.petId : link.householdId === ref.householdId) &&
  link.expiresInDays === input.expiresInDays &&
  link.includeMicrochip === input.includeMicrochip &&
  link.includeClinicalFiles === input.includeClinicalFiles &&
  link.includeDeceasedAt === input.includeDeceasedAt;

/** @implements REQ-VET-001, REQ-VET-003, REQ-VET-004, REQ-VET-008, REQ-VET-012, INV-005-005, SC-005-015, SC-005-025, SC-005-038, SC-005-051, SC-007-016 */
export class CreateShareLinkUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, ref: ShareScopeRef, idempotencyKey: unknown, body: unknown): Promise<CreateShareLinkOutcome> {
    const { deps } = this;
    if (ref.scope === 'PETS') throw new DomainErrorV33('ERR-SHARE-NOT-FOUND'); // el alcance `PETS` lo crea `CreatePetsShareLinkUseCase` (annex §3)
    const sharing = requireSharing(deps);
    const now = deps.clock.nowIsoTimestamp();
    const token = sharing.tokens.nextShareToken();
    const tokenHash = hashToken(token);
    return deps.uow.runInTransaction(async (r): Promise<CreateShareLinkOutcome> => {
      await r.shareLinks.lockScope(ref.scope, scopeIdOf(ref));
      const authority = await requireShareAuthority(r, userId, ref, false);
      const key = parseIdempotencyKey(idempotencyKey);
      const input = parseCreateInput(body);
      const existing = await r.shareLinks.findByIdempotencyKey(userId, key);
      if (existing !== null) {
        if (!sameCreation(existing, ref, input)) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Idempotency-Key ya se usó con otro alcance u otras opciones.', 'Idempotency-Key');
        return { kind: 'REPLAY', link: toShareLinkView(existing, now) };
      }
      if (authority.pets.length === 0) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
      if ((await r.shareLinks.countActive(ref.scope, scopeIdOf(ref), now)) >= MAX_ACTIVE_SHARE_LINKS) throw new DomainErrorV33('ERR-SHARE-LINK-LIMIT');
      const link: ShareLinkRecord = {
        id: deps.ids.nextId(),
        tokenHash,
        scope: ref.scope,
        petId: ref.scope === 'PET' ? ref.petId : null,
        householdId: ref.scope === 'HOUSEHOLD' ? ref.householdId : null,
        createdByUserId: userId,
        createdAt: now,
        expiresInDays: input.expiresInDays,
        expiresAt: computeExpiresAt(now, input.expiresInDays),
        revokedAt: null,
        includeMicrochip: input.includeMicrochip,
        includeClinicalFiles: input.includeClinicalFiles,
        includeDeceasedAt: input.includeDeceasedAt,
        idempotencyKey: key,
        petOwnerUserIdAtCreation: authority.petOwnerUserId,
      };
      try {
        await r.shareLinks.insert(link);
      } catch (error) {
        // EDGE-005-17-bis: la misma clave con otro alcance que llega al UNIQUE sin que la búsqueda la viera es el mismo 422 de contrato, sin detalles de la base.
        if (error instanceof ShareLinkIdempotencyConflictError) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Idempotency-Key ya se usó con otro alcance u otras opciones.', 'Idempotency-Key');
        throw error;
      }
      await r.shareAudit.insert({ id: deps.auditIds.nextId(), shareLinkId: link.id, eventType: 'CREATED', occurredAt: now, actorUserId: userId, ipHmac: null, failCount: 1 });
      return { kind: 'CREATED', link: toShareLinkView(link, now), token };
    });
  }
}

/** @implements REQ-VET-001, REQ-VET-005, REQ-VET-013, SC-005-015, SC-005-025 */
export class ListShareLinksUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, ref: ShareScopeRef): Promise<ShareLinkList> {
    const { deps } = this;
    if (ref.scope === 'PETS') throw new DomainErrorV33('ERR-SHARE-NOT-FOUND'); // los `PETS` viven en `listHouseholdPetsShareLinks` (annex §5.5)
    const now = deps.clock.nowIsoTimestamp();
    return deps.uow.runInTransaction(async (r) => {
      await requireShareAuthority(r, userId, ref, false);
      const items = (await r.shareLinks.listByScope(ref.scope, scopeIdOf(ref), retentionCutoffs(now).links)).map((link) => toShareLinkView(link, now));
      // ENM-005-E §5.5 (R2-03): `activeCount` del hogar cuenta también los `PETS` activos de todos los creadores (es el número del 409); `items` no los trae.
      const petsActive = ref.scope === 'HOUSEHOLD' ? (await r.shareLinks.listPetsByHousehold(ref.householdId, retentionCutoffs(now).links)).filter((l) => deriveStatus(l, now) === 'ACTIVE').length : 0;
      return { items: items.slice(0, MAX_LISTED), activeCount: items.filter((i) => i.status === 'ACTIVE').length + petsActive, maxActiveLinks: MAX_ACTIVE_SHARE_LINKS };
    });
  }
}

/**
 * Quién revoca (switch exhaustivo con default-deny, ENM-005-E §8.2.1): el creador siempre; PET: cualquier propietario ACTIVE (012); HOUSEHOLD: propietario o ADMIN del hogar; PETS: el principal o un co-propietario
 * ACTIVE de AL MENOS UNA mascota del enlace según las filas de `share_link_pets` (§5.2; el propietario u ADMIN del hogar no titular recibe 404, D5-19). Cualquier otro valor: false (404 uniforme).
 */
async function mayRevoke(r: RepositorySet, userId: string, link: ShareLinkRecord): Promise<boolean> {
  if (link.createdByUserId === userId) return true;
  const scope = link.scope;
  switch (scope) {
    case 'PET': {
      const pet = await r.pets.findById(link.petId!);
      return pet !== null && isOwnerOfPet(userId, { ownerUserId: pet.ownerUserId, coOwners: await r.coOwners.listByPet(pet.id) }); // 012: cualquier propietario ACTIVE puede revocar
    }
    case 'HOUSEHOLD':
      return isHouseholdManager(await r.households.listMembershipsOfUsers([userId]), link.householdId!);
    case 'PETS': {
      for (const petId of await r.shareLinkPets.listPetIds(link.id)) {
        const state = await r.pets.findOwnership(petId);
        if (state !== null && isOwnerOfPet(userId, { ownerUserId: state.ownerUserId, coOwners: await r.coOwners.listByPet(petId) })) return true;
      }
      return false;
    }
    default:
      assertNever(scope);
      return false;
  }
}

/** @implements REQ-VET-005, REQ-VET-008, STATE-SHARE-001, MIF-005-08, SC-005-019, SC-005-046 */
export class RevokeShareLinkUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, shareLinkId: string): Promise<void> {
    const { deps } = this;
    const now = deps.clock.nowIsoTimestamp();
    await deps.uow.runInTransaction(async (r) => {
      let link = await r.shareLinks.findById(shareLinkId);
      if (link !== null && link.scope === 'PETS') {
        await r.shareLinks.lockLink(link.id); // §6 paso 3: la revocación de un `PETS` toma el bloqueo de la fila del enlace (serializa con las retiradas) y relee bajo él
        link = await r.shareLinks.findById(shareLinkId);
      }
      if (link === null || !(await mayRevoke(r, userId, link))) throw new DomainErrorV33('ERR-SHARE-NOT-FOUND');
      if (isRevocationNoop(deriveStatus(link, now))) return;
      if (await r.shareLinks.revoke(link.id, now)) {
        await r.shareAudit.insert({ id: deps.auditIds.nextId(), shareLinkId: link.id, eventType: 'REVOKED', occurredAt: now, actorUserId: userId, ipHmac: null, failCount: 1 });
      }
    });
  }
}
