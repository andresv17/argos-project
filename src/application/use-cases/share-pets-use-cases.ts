/**
 * Casos de uso autenticados del alcance `PETS` del enlace veterinario (feature 012, Bloque E, #81; ENM-005-E 0.2.2 APPROVED): crear (`createPetsShareLink`), listar por hogar y por mascota, retirar una mascota
 * (`withdrawPetFromShareLink`) y la vista previa de un subconjunto candidato (`previewPetsClinicalSummary`). La revocación entera del enlace (`PN-08`) vive en `sharing/pets-link-revocation.ts`.
 *
 * Crear (annex §3): bandera OFF -> 404 del hogar (antes de la clave); `Idempotency-Key`; bloqueos en el orden de §6 (mascotas `pet_id ASC` -> candado del HOGAR -> fila del enlace); 404 hogar -> 403 creador (solo del
 * creador, independiente del cuerpo; se revalida dentro del candado) -> replay (compara `householdId`, conjunto de `petIds` y opciones) -> forma (422) -> 422 `ERR-VET12-PETS-EMPTY` uniforme (repetidos ANTES de la
 * elegibilidad; la consulta de elegibilidad se ejecuta SIEMPRE) -> 409 tope del hogar (cuenta `HOUSEHOLD` + `PETS`, D12-21). Estático: nada se reactiva ni se añade después.
 *
 * @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-005, REQ-VET12-006, REQ-VET12-007, REQ-VET12-008, INV-VET12-001, INV-VET12-002, INV-VET12-003, INV-VET12-004, SC-012-053..066, EDGE-012-071, EDGE-012-073, EDGE-012-074, EDGE-012-075
 */
import { isOwnerOfPet } from '../../domain/access/pet-ownership.ts';
import { hasRepeatedIds, isValidPetCount, sameIdSet } from '../../domain/sharing/pets-subset.ts';
import { computeExpiresAt, deriveStatus, isExpiryDays, DEFAULT_EXPIRY_DAYS, MAX_ACTIVE_SHARE_LINKS, MAX_SHARE_LINK_PETS, retentionCutoffs, type ShareLinkRecord } from '../../domain/sharing/share-link.ts';
import { hashToken } from '../../domain/sharing/share-token.ts';
import { orderPetsForSummary } from '../../domain/summary/clinical-summary.ts';
import { DomainError, validateCreatePetsShareLinkInput, type CreatePetsShareLinkInput, type PetsShareLinkList, type PetsShareLinkView } from '../../generated/v38/index.ts';
import type { SharedSummaryView } from '../../generated/v33/index.ts';
import { SharedAccessLimiter } from '../sharing/shared-access-limiter.ts';
import { isHouseholdManager } from '../sharing/share-access.ts';
import { resolveEligiblePets } from '../sharing/resolve-eligible-pets.ts';
import { revokeLinkNow } from '../sharing/pets-link-revocation.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { ShareLinkIdempotencyConflictError } from '../ports/share-link.port.ts';
import { runOwnershipTransaction } from './co-ownership-support.ts';
import { parseIdempotencyKey, requireSharing } from './share-link-use-cases.ts';
import { buildSharedView, parseFlag } from './shared-view-use-cases.ts';
import { assertMatchesSchema, type ApplicationDeps } from './use-case-support.ts';

export { PetsLinkRevocation } from '../sharing/pets-link-revocation.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_LISTED = 200;
/** Vista previa: 30 llamadas por usuario y ventana de 10 minutos (una instancia; construye hasta 20 resúmenes por llamada). */
const PREVIEW_MAX_CALLS = 30;
const PREVIEW_WINDOW_MS = 600_000;

const houseNotFound = (): DomainError => new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
const petsEmpty = (): DomainError => new DomainError('ERR-VET12-PETS-EMPTY');
const shareNotFound = (): DomainError => new DomainError('ERR-SHARE-NOT-FOUND');

/** Ids con forma de UUID de la entrada (para el bloqueo y la consulta de elegibilidad siempre ejecutada): sin eco, máximo 20, sin repetidos; el 422 de forma lo decide después el esquema. */
function lenientIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return [...new Set(list.filter((v): v is string => typeof v === 'string' && UUID.test(v)))].sort().slice(0, MAX_SHARE_LINK_PETS);
}

/** 404 si no es miembro ACTIVE del hogar; 403 si no es propietario ni ADMIN ACTIVE o no es titular de ninguna mascota asignada al hogar (annex §3.2). Una sola consulta de elegibilidad. */
async function requirePetsCreator(r: RepositorySet, userId: string, householdId: string, ids: readonly string[]) {
  const memberships = await r.households.listMembershipsOfUsers([userId]);
  if (!memberships.some((m) => m.householdId === householdId && m.status === 'ACTIVE')) throw houseNotFound();
  const eligibility = await resolveEligiblePets(r, { userId, householdId, petIds: ids });
  if (!isHouseholdManager(memberships, householdId) || !eligibility.hasAnyEligibleInHousehold) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
  return eligibility;
}

export function toPetsView(link: ShareLinkRecord, petIds: readonly string[], createdByMe: boolean, now: string): PetsShareLinkView {
  return {
    id: link.id,
    scope: 'PETS',
    status: deriveStatus(link, now),
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    includeMicrochip: link.includeMicrochip,
    includeClinicalFiles: link.includeClinicalFiles,
    includeDeceasedAt: link.includeDeceasedAt,
    petIds: [...petIds] as PetsShareLinkView['petIds'],
    petCount: petIds.length,
    createdByMe,
  } as PetsShareLinkView;
}

function parseOptions(input: CreatePetsShareLinkInput): { expiresInDays: 1 | 7 | 30; includeMicrochip: boolean; includeClinicalFiles: boolean; includeDeceasedAt: boolean } {
  const expiresInDays = input.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  if (!isExpiryDays(expiresInDays)) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'expiresInDays debe ser 1, 7 o 30.', 'expiresInDays');
  return { expiresInDays, includeMicrochip: input.includeMicrochip ?? false, includeClinicalFiles: input.includeClinicalFiles ?? false, includeDeceasedAt: input.includeDeceasedAt ?? false };
}

export type CreatePetsShareLinkOutcome =
  | { readonly kind: 'CREATED'; readonly link: PetsShareLinkView; readonly token: string; readonly url: string }
  | { readonly kind: 'REPLAY'; readonly link: PetsShareLinkView };

/** @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-006, REQ-VET12-008, INV-VET12-001, INV-VET12-002, SC-012-053, SC-012-062, SC-012-063, SC-012-066, EDGE-012-073, EDGE-012-074, EDGE-012-075 */
export class CreatePetsShareLinkUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, idempotencyKey: unknown, body: unknown): Promise<CreatePetsShareLinkOutcome> {
    const { deps } = this;
    const sharing = requireSharing(deps);
    if (sharing.petsCreateEnabled !== true) throw houseNotFound(); // §8.2.2: tras sesión/CSRF y ANTES de Idempotency-Key (también en un replay)
    const key = parseIdempotencyKey(idempotencyKey);
    const now = deps.clock.nowIsoTimestamp();
    const token = sharing.tokens.nextShareToken();
    const tokenHash = hashToken(token);
    const requested = lenientIds((body as { petIds?: unknown } | null | undefined)?.petIds);
    return runOwnershipTransaction(deps, async (r): Promise<CreatePetsShareLinkOutcome> => {
      for (const petId of requested) await r.pets.findOwnershipForUpdate(petId); // §6 (1): bloqueo por mascota, pet_id ASC (solo filas existentes)
      await r.shareLinks.lockScope('PETS', householdId); // §6 (2): candado del HOGAR
      const eligibility = await requirePetsCreator(r, userId, householdId, requested); // 404 hogar -> 403 creador, revalidados dentro del candado
      const existing = await r.shareLinks.findByIdempotencyKey(userId, key);
      if (existing !== null) {
        const rows = existing.scope === 'PETS' ? await r.shareLinkPets.listPetIds(existing.id) : [];
        const input = assertMatchesSchema<CreatePetsShareLinkInput>('CreatePetsShareLinkInput', validateCreatePetsShareLinkInput, body);
        const options = parseOptions(input);
        const same =
          existing.scope === 'PETS' &&
          existing.householdId === householdId &&
          sameIdSet(rows, input.petIds) &&
          existing.expiresInDays === options.expiresInDays &&
          existing.includeMicrochip === options.includeMicrochip &&
          existing.includeClinicalFiles === options.includeClinicalFiles &&
          existing.includeDeceasedAt === options.includeDeceasedAt;
        if (!same) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Idempotency-Key ya se usó con otro hogar, otras mascotas u otras opciones.', 'Idempotency-Key');
        return { kind: 'REPLAY', link: toPetsView(existing, rows, true, now) };
      }
      const input = assertMatchesSchema<CreatePetsShareLinkInput>('CreatePetsShareLinkInput', validateCreatePetsShareLinkInput, body);
      const options = parseOptions(input);
      const ids = input.petIds as readonly string[];
      // §3.3: repetidos ANTES de la elegibilidad (E-2); la consulta de elegibilidad ya se ejecutó (siempre); todo falla con el MISMO 422 sin eco.
      const eligibleIds = new Set(eligibility.eligible.map((p) => p.id));
      if (hasRepeatedIds(ids) || !isValidPetCount(ids.length) || !ids.every((id) => eligibleIds.has(id))) throw petsEmpty();
      if ((await r.shareLinks.countActive('PETS', householdId, now)) >= MAX_ACTIVE_SHARE_LINKS) throw new DomainError('ERR-SHARE-LINK-LIMIT');
      const link: ShareLinkRecord = {
        id: deps.ids.nextId(),
        tokenHash,
        scope: 'PETS',
        petId: null,
        householdId,
        createdByUserId: userId,
        createdAt: now,
        expiresInDays: options.expiresInDays,
        expiresAt: computeExpiresAt(now, options.expiresInDays),
        revokedAt: null,
        includeMicrochip: options.includeMicrochip,
        includeClinicalFiles: options.includeClinicalFiles,
        includeDeceasedAt: options.includeDeceasedAt,
        idempotencyKey: key,
        petOwnerUserIdAtCreation: null,
      };
      try {
        await r.shareLinks.insert(link);
      } catch (error) {
        if (error instanceof ShareLinkIdempotencyConflictError) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'Idempotency-Key ya se usó con otro hogar, otras mascotas u otras opciones.', 'Idempotency-Key');
        throw error;
      }
      await r.shareLinkPets.insertMany(link.id, [...ids].sort());
      await r.shareAudit.insert({ id: deps.auditIds.nextId(), shareLinkId: link.id, eventType: 'CREATED', occurredAt: now, actorUserId: userId, ipHmac: null, failCount: 1 });
      return { kind: 'CREATED', link: toPetsView(link, orderPetsForSummary(eligibility.eligible).map((p) => p.id), true, now), token, url: `/shared/${token}` };
    });
  }
}

/** Mascotas de `ids` sobre las que `userId` es propietario principal o co-propietario ACTIVE (autoridad de lectura de la lista; una consulta por mascota distinta, memoizada). */
async function titularOf(r: RepositorySet, userId: string, ids: readonly string[]): Promise<Set<string>> {
  const owned = new Set<string>();
  for (const petId of new Set(ids)) {
    const state = await r.pets.findOwnership(petId);
    if (state !== null && isOwnerOfPet(userId, { ownerUserId: state.ownerUserId, coOwners: await r.coOwners.listByPet(petId) })) owned.add(petId);
  }
  return owned;
}

/** @implements REQ-VET12-001, REQ-VET12-007, INV-VET12-003, SC-012-066 */
export class ListHouseholdPetsShareLinksUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string): Promise<PetsShareLinkList> {
    const { deps } = this;
    const now = deps.clock.nowIsoTimestamp();
    return deps.uow.runInTransaction(async (r) => {
      const memberships = await r.households.listMembershipsOfUsers([userId]);
      if (!memberships.some((m) => m.householdId === householdId && m.status === 'ACTIVE')) throw houseNotFound();
      if (!isHouseholdManager(memberships, householdId)) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
      const links = (await r.shareLinks.listPetsByHousehold(householdId, retentionCutoffs(now).links)).slice(0, MAX_LISTED);
      const rows = await r.shareLinkPets.listPetIdsOfLinks(links.map((l) => l.id));
      const mine = await titularOf(r, userId, [...rows.values()].flat());
      const items: PetsShareLinkView[] = [];
      for (const link of links) {
        const visible = (rows.get(link.id) ?? []).filter((id) => mine.has(id));
        if (visible.length > 0) items.push(toPetsView(link, visible, link.createdByUserId === userId, now));
      }
      return { items, activeCount: await r.shareLinks.countActive('HOUSEHOLD', householdId, now), maxActiveLinks: MAX_ACTIVE_SHARE_LINKS } as PetsShareLinkList;
    });
  }
}

/** @implements REQ-VET12-007, REQ-VET12-008, INV-VET12-003 */
export class ListPetPetsShareLinksUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, petId: string): Promise<PetsShareLinkList> {
    const { deps } = this;
    const now = deps.clock.nowIsoTimestamp();
    return deps.uow.runInTransaction(async (r) => {
      const state = await r.pets.findOwnership(petId);
      if (state === null || !isOwnerOfPet(userId, { ownerUserId: state.ownerUserId, coOwners: await r.coOwners.listByPet(petId) })) throw new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId'); // un ADMIN de hogar no titular: 404
      const cutoff = retentionCutoffs(now).links;
      const links: ShareLinkRecord[] = [];
      for (const id of await r.shareLinkPets.listLinkIdsByPet(petId)) {
        const link = await r.shareLinks.findById(id);
        if (link !== null && link.scope === 'PETS' && !(link.expiresAt < cutoff || (link.revokedAt !== null && link.revokedAt < cutoff))) links.push(link);
      }
      links.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
      const rows = await r.shareLinkPets.listPetIdsOfLinks(links.map((l) => l.id));
      const mine = await titularOf(r, userId, [...rows.values()].flat());
      const items: PetsShareLinkView[] = [];
      for (const link of links.slice(0, MAX_LISTED)) {
        const visible = (rows.get(link.id) ?? []).filter((id) => mine.has(id)); // sin IDs de mascotas sobre las que no tiene autoridad, sin householdId ni identidad de otro creador (§5.3)
        if (visible.length > 0) items.push(toPetsView(link, visible, link.createdByUserId === userId, now));
      }
      return { items, activeCount: items.filter((i) => i.status === 'ACTIVE').length, maxActiveLinks: MAX_ACTIVE_SHARE_LINKS } as PetsShareLinkList;
    });
  }
}

/** @implements REQ-VET12-007, INV-VET12-003, EDGE-012-071, SC-012-066 */
export class WithdrawPetFromShareLinkUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `204` solo si se borró la fila en esta petición; cualquier otro caso: el MISMO `404 ERR-SHARE-NOT-FOUND` (sin idempotencia ambigua). Retirar la última mascota revoca el enlace en la misma transacción. */
  async execute(userId: string, shareLinkId: string, petId: string): Promise<void> {
    const { deps } = this;
    const now = deps.clock.nowIsoTimestamp();
    await runOwnershipTransaction(deps, async (r) => {
      const state = await r.pets.findOwnershipForUpdate(petId); // §6 (1): bloqueo de la mascota
      await r.shareLinks.lockLink(shareLinkId); // §6 (3): fila del enlace; las retiradas concurrentes se serializan aquí
      const link = await r.shareLinks.findById(shareLinkId);
      if (state === null || link === null || link.scope !== 'PETS' || deriveStatus(link, now) !== 'ACTIVE') throw shareNotFound();
      if (!isOwnerOfPet(userId, { ownerUserId: state.ownerUserId, coOwners: await r.coOwners.listByPet(petId) })) throw shareNotFound();
      if (!(await r.shareLinkPets.deleteRow(shareLinkId, petId))) throw shareNotFound();
      if ((await r.shareLinkPets.listPetIds(shareLinkId)).length === 0) await revokeLinkNow(deps, r, link, userId, now); // un PETS activo nunca queda con cero filas
    });
  }
}

export interface PetsPreviewQuery {
  readonly petIds?: unknown;
  readonly includeMicrochip?: unknown;
  readonly includeClinicalFiles?: unknown;
  readonly includeDeceasedAt?: unknown;
}

/** @implements REQ-VET12-003, REQ-VET12-005, REQ-SUM-004, SC-012-065, INV-VET12-001, INV-VET12-004 */
export class PreviewPetsClinicalSummaryUseCase {
  private readonly limiter = new SharedAccessLimiter({ maxFailures: PREVIEW_MAX_CALLS, windowMs: PREVIEW_WINDOW_MS });

  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, householdId: string, query: PetsPreviewQuery): Promise<SharedSummaryView & { petIds: string[] }> {
    const { deps } = this;
    if (requireSharing(deps).petsCreateEnabled !== true) throw houseNotFound(); // §4.7: la bandera precede al 422 por `petIds` ausente
    const now = deps.clock.nowIsoTimestamp();
    const raw = query.petIds;
    const requested = lenientIds(raw);
    const readSnapshot = deps.uow.runReadOnly === undefined ? deps.uow.runInTransaction.bind(deps.uow) : deps.uow.runReadOnly.bind(deps.uow);
    return readSnapshot(async (r) => {
      const eligibility = await requirePetsCreator(r, userId, householdId, requested);
      if (this.limiter.isLimited(userId, now)) throw new DomainError('ERR-RATE-LIMITED');
      this.limiter.recordFailure(userId, now); // cuenta cada llamada (construye hasta 20 resúmenes)
      if (raw === undefined) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'petIds es obligatorio.', 'petIds');
      const list = Array.isArray(raw) ? raw : [raw];
      if (list.length === 1 && list[0] === '') throw petsEmpty(); // `?petIds=`: el valor vacío equivale a la lista vacía y se evalúa antes del `items: Uuid`
      if (list.length > MAX_SHARE_LINK_PETS || !list.every((v) => typeof v === 'string' && UUID.test(v))) throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'petIds debe ser una lista de hasta 20 UUID en minúsculas.', 'petIds');
      const ids = list as string[];
      const eligibleIds = new Set(eligibility.eligible.map((p) => p.id));
      if (hasRepeatedIds(ids) || !ids.every((id) => eligibleIds.has(id))) throw petsEmpty();
      const options = { includeMicrochip: parseFlag(query.includeMicrochip, 'includeMicrochip'), includeClinicalFiles: parseFlag(query.includeClinicalFiles, 'includeClinicalFiles'), includeDeceasedAt: parseFlag(query.includeDeceasedAt, 'includeDeceasedAt') };
      const pets = orderPetsForSummary(eligibility.eligible.filter((p) => ids.includes(p.id)));
      const view = await buildSharedView(r, pets, 'PETS', now, options, null);
      return { ...view, petIds: pets.map((p) => p.id) };
    });
  }
}
