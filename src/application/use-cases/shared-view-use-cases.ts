/**
 * Resumen clínico de solo lectura (feature 005, US4/US5): la ruta PÚBLICA por token (`GetSharedSummaryUseCase`, `GetSharedFileUseCase`) y la vista previa
 * autenticada del propietario (`PreviewClinicalSummaryUseCase`, D5-15). Las tres comparten UN solo camino de código (`buildSharedView`, MIF-005-04): lo único
 * que cambia es el autorizador y `validUntil` (nulo en la vista previa).
 *
 * Reglas de la ruta pública:
 * - UN único `ClockPort.nowIsoTimestamp()` por petición: el mismo instante alimenta el estado, `generatedAt`, `validUntil`, la edad y `X-Goog-Expires` (EDGE-005-24).
 * - La lectura corre en una transacción de solo lectura con aislamiento explícito (PostgreSQL `REPEATABLE READ READ ONLY`, SQLite sobre el WAL): una sola
 *   vista entre las consultas (EDGE-005-14, SC-005-049). La auditoría va en una transacción de escritura aparte.
 * - Resolución sin salida anticipada: la secuencia de consultas es la misma para token inexistente, mal formado, vencido, revocado, creador sin autoridad,
 *   alcance vacío y mascota retirada (INV-005-007, SC-005-021); el token se trata como texto opaco y siempre tiene hash.
 * - Revalida en CADA acceso la autoridad del creador (PET: rol efectivo OWNER|ADMIN y `pets.owner_user_id = pet_owner_user_id_at_creation`, PN-08; HOUSEHOLD: propietario o ADMIN
 *   ACTIVE del hogar y propiedad legal de las mascotas servidas) y el conjunto de mascotas por consulta, sin caché (REQ-VET-011, D5-05, D5-19).
 * - Límite de tasa por IP efectiva ANTES de tocar la base (429 sin escritura ni resolución); todo fallo cuenta una vez; sin exención de token válido (PN-11).
 * - La auditoría de un acceso válido es fail-closed: si falla, no se sirve el resumen (error interno).
 *
 * @implements REQ-VET-002, REQ-VET-006, REQ-VET-007, REQ-VET-008, REQ-VET-009, REQ-VET-011, REQ-SUM-004, INV-005-001, INV-005-002, INV-005-006, INV-005-007, INV-005-008, INV-005-009, SC-005-016, SC-005-017, SC-005-021, SC-005-022, SC-005-023, SC-005-026, SC-005-035, SC-005-036, SC-005-037, SC-005-049, NFR-005-001, NFR-005-002, EDGE-005-14, EDGE-005-23, EDGE-005-24, MIF-005-04
 */
import { toRoleMembership, isOwnerRow } from '../../domain/households/household-policies.ts';
import { effectiveRole } from '../../domain/access/effective-role.ts';
import { MEDIA_PAGE_SIZE, mediaObjectKey, neutralFilename, type MediaMime } from '../../domain/media/index.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import { normalizeClientIp } from '../../domain/sharing/client-ip.ts';
import { fileLabel } from '../../domain/sharing/file-label.ts';
import { deriveStatus, failureWindowStart, signedUrlTtlSeconds, type ShareLinkRecord } from '../../domain/sharing/share-link.ts';
import { hashToken } from '../../domain/sharing/share-token.ts';
import { buildClinicalSummary, type SummaryClinicalFileInput, type SummaryPetInput } from '../../domain/summary/clinical-summary.ts';
import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV33, type SharedSummaryView } from '../../generated/v33/index.ts';
import type { MediaStoragePort } from '../ports/media-storage.port.ts';
import type { PetMediaRecord, RepositorySet } from '../ports/repositories.port.ts';
import { requireShareAuthority, type ShareScopeRef } from '../sharing/share-access.ts';
import { mapStorageError, requireMedia } from './media-use-cases.ts';
import { requireSharing } from './share-link-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Identificador que no existe en ninguna tabla: las consultas de relleno mantienen la misma secuencia cuando el token no resuelve (INV-005-007). */
const NIL = '00000000-0000-0000-0000-000000000000';
const MAX_FILES_PER_PET = 5000;

/** Lectura coherente de una instantánea; sin soporte en la unidad de trabajo, una transacción ordinaria. */
function readSnapshot<T>(deps: Pick<ApplicationDeps, 'uow'>, work: (r: RepositorySet) => Promise<T>): Promise<T> {
  return deps.uow.runReadOnly === undefined ? deps.uow.runInTransaction(work) : deps.uow.runReadOnly(work);
}

export interface ResolvedShare {
  readonly link: ShareLinkRecord;
  readonly pets: PetProfile[];
}

/**
 * Resuelve el token con la secuencia FIJA de consultas (enlace, mascota, membresías del creador, asignaciones de la mascota y del hogar, mascotas del creador) y
 * decide después, en memoria, sin salida anticipada. Devuelve null en cualquier fallo.
 * @implements REQ-VET-007, REQ-VET-011, INV-005-006, INV-005-007, STATE-SHARE-001
 */
export async function resolveShare(r: RepositorySet, token: string, now: string): Promise<ResolvedShare | null> {
  const link = await r.shareLinks.findByTokenHash(hashToken(token));
  const creator = link?.createdByUserId ?? NIL;
  const pet = await r.pets.findById(link?.petId ?? NIL);
  const memberships = await r.households.listMembershipsOfUsers([creator]);
  const petAssignments = await r.assignments.listByPet(link?.petId ?? NIL);
  const householdAssignments = await r.assignments.listByHousehold(link?.householdId ?? NIL);
  const owned = await r.pets.listByOwners([creator]);
  if (link === null || deriveStatus(link, now) !== 'ACTIVE') return null;
  if (link.scope === 'PET') {
    if (pet === null || pet.ownerUserId !== link.petOwnerUserIdAtCreation) return null;
    const role = effectiveRole({ id: creator }, pet, memberships.map(toRoleMembership), petAssignments);
    return role === 'OWNER' || role === 'ADMIN' ? { link, pets: [pet] } : null;
  }
  const manager = memberships.some((m) => m.householdId === link.householdId && m.status === 'ACTIVE' && (isOwnerRow(m) || m.role === 'ADMIN'));
  const assigned = new Set(householdAssignments.map((a) => a.petId));
  const pets = owned.filter((p) => assigned.has(p.id));
  return manager && pets.length > 0 ? { link, pets } : null;
}

async function clinicalFilesOf(r: RepositorySet, petId: string): Promise<PetMediaRecord[]> {
  const files: PetMediaRecord[] = [];
  for (let offset = 0; files.length < MAX_FILES_PER_PET; offset += MEDIA_PAGE_SIZE) {
    const page = await r.media.listPage(petId, 'FILE', MEDIA_PAGE_SIZE, offset);
    files.push(...page.items);
    if (offset + MEDIA_PAGE_SIZE >= page.total) break;
  }
  return files;
}

export interface ViewOptions {
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
}

/**
 * ÚNICO camino que arma el `SharedSummaryView` (ruta pública y vistas previas): lee los registros de las mascotas del conjunto con los repositorios existentes,
 * delega la construcción por allow-list en el dominio y arma `fileLabels` desde `pet_media.original_name` SOLO de los archivos que el resumen incluyó.
 * @implements REQ-SUM-004, REQ-VET-009, INV-005-009, MIF-005-04, SC-005-035
 */
export async function buildSharedView(r: RepositorySet, pets: readonly PetProfile[], scope: 'PET' | 'HOUSEHOLD', now: string, options: ViewOptions, validUntil: string | null): Promise<SharedSummaryView> {
  const names = new Map<string, string>();
  const inputs: SummaryPetInput[] = [];
  for (const pet of pets) {
    const records = await r.records.listForPet(pet.id);
    const files: SummaryClinicalFileInput[] = [];
    if (options.includeClinicalFiles) {
      for (const file of await clinicalFilesOf(r, pet.id)) {
        files.push({ id: file.id, mime: file.mime as SummaryClinicalFileInput['mime'], sizeBytes: file.sizeBytes, createdAt: file.createdAt });
        names.set(file.id, file.originalName);
      }
    }
    inputs.push({ pet, records, files });
  }
  const summary = buildClinicalSummary(scope, inputs, now, options);
  const fileLabels = summary.pets.flatMap((p) => p.clinicalFiles).map((f) => ({ fileId: f.id, displayName: fileLabel(names.get(f.id) ?? '') }));
  return { summary, fileLabels, validUntil };
}

/** Respuesta uniforme de la superficie pública. */
const notFound = (): DomainErrorV33 => new DomainErrorV33('ERR-SHARE-NOT-FOUND');

/** Parte común de las dos rutas públicas: límite de tasa, instante único, HMAC de la IP y registro de fallos y accesos. */
class PublicAccess {
  readonly now: string;
  readonly key: string;
  private readonly ipHmac: string;

  constructor(
    private readonly deps: ApplicationDeps,
    clientIp: string,
  ) {
    const sharing = requireSharing(deps);
    this.now = deps.clock.nowIsoTimestamp();
    this.key = normalizeClientIp(clientIp);
    this.ipHmac = deps.auditPseudonym.hmacUserId(this.key, sharing.ipHmacSecret);
  }

  /** 429 sin tocar la base de datos ni resolver el token. */
  assertNotLimited(): void {
    if (requireSharing(this.deps).limiter.isLimited(this.key, this.now)) throw new DomainErrorV33('ERR-SHARE-RATE-LIMITED');
  }

  /** Cuenta el fallo, lo agrega a la auditoría (un fallo de la auditoría no cambia la respuesta uniforme) y lanza el 404. */
  async fail(): Promise<never> {
    requireSharing(this.deps).limiter.recordFailure(this.key, this.now);
    try {
      await this.deps.uow.runInTransaction((r) => r.shareAudit.recordFailure(this.deps.auditIds.nextId(), this.ipHmac, failureWindowStart(this.now)));
    } catch {
      // la respuesta sigue siendo el 404 uniforme; el contador de la instancia ya cuenta el fallo
    }
    throw notFound();
  }

  /** Acceso válido: auditoría FAIL-CLOSED (si falla, la excepción llega al llamador y no se sirve nada). */
  async ok(linkId: string): Promise<void> {
    await this.deps.uow.runInTransaction((r) =>
      r.shareAudit.insert({ id: this.deps.auditIds.nextId(), shareLinkId: linkId, eventType: 'ACCESS_OK', occurredAt: this.now, actorUserId: null, ipHmac: this.ipHmac, failCount: 1 }),
    );
  }
}

/** @implements REQ-VET-006, REQ-VET-007, REQ-VET-008, REQ-VET-011, INV-005-001, INV-005-002, SC-005-016, SC-005-021, SC-005-022, SC-005-037, SC-005-049 */
export class GetSharedSummaryUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(token: string, clientIp: string): Promise<SharedSummaryView> {
    const access = new PublicAccess(this.deps, clientIp);
    access.assertNotLimited();
    const found = await readSnapshot(this.deps, async (r) => {
      const resolved = await resolveShare(r, token, access.now);
      if (resolved === null) return null;
      const { link } = resolved;
      const view = await buildSharedView(r, resolved.pets, link.scope, access.now, { includeMicrochip: link.includeMicrochip, includeClinicalFiles: link.includeClinicalFiles }, link.expiresAt);
      return { view, linkId: link.id };
    });
    if (found === null) return access.fail();
    await access.ok(found.linkId);
    return found.view;
  }
}

export interface SharedFileRedirect {
  readonly url: string;
}

/** @implements REQ-VET-009, INV-005-001, INV-005-002, INV-005-008, SC-005-023, SC-005-036, EDGE-005-23 */
export class GetSharedFileUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Re-resuelve el token SIN construir el resumen: solo el alcance y la pertenencia de `mediaId` (MIF-005-04). */
  async execute(token: string, mediaId: string, clientIp: string): Promise<SharedFileRedirect> {
    const access = new PublicAccess(this.deps, clientIp);
    access.assertNotLimited();
    const found = await readSnapshot(this.deps, async (r) => {
      const resolved = await resolveShare(r, token, access.now);
      const media = await r.media.findInPets(resolved === null ? [NIL] : resolved.pets.map((p) => p.id), mediaId);
      if (resolved === null || !resolved.link.includeClinicalFiles || media === null || media.kind !== 'FILE') return null;
      const ttl = signedUrlTtlSeconds(access.now, resolved.link.expiresAt);
      return ttl === null ? null : { media, ttl, linkId: resolved.link.id };
    });
    if (found === null) return access.fail();
    const storage: MediaStoragePort = requireMedia(this.deps).storage;
    const mime = found.media.mime as MediaMime;
    let url: string;
    try {
      ({ url } = await storage.createReadUrl({
        key: mediaObjectKey(found.media.petId, 'FILE', found.media.id),
        contentType: mime,
        filename: neutralFilename('FILE', mime),
        ttlSeconds: found.ttl,
        allowShortTtl: true,
      }));
    } catch (error) {
      throw mapStorageError(error);
    }
    await access.ok(found.linkId);
    return { url };
  }
}

function parseFlag(value: unknown, field: string): boolean {
  if (value === undefined) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', `${field} debe ser true o false.`, field);
}

/**
 * Vista previa autenticada (D5-15, REQ-SUM-004): el propietario ve lo que verá el veterinario, con las casillas de la consulta; no crea token, fila ni auditoría
 * y `validUntil` es nulo. Mismo autorizador que crear (CREATE_SHARE_LINK; 404 si ajena).
 * @implements REQ-SUM-004, D5-15, MIF-005-04
 */
export class PreviewClinicalSummaryUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, ref: ShareScopeRef, query: { readonly includeMicrochip?: unknown; readonly includeClinicalFiles?: unknown }): Promise<SharedSummaryView> {
    const now = this.deps.clock.nowIsoTimestamp();
    return readSnapshot(this.deps, async (r) => {
      const { pets } = await requireShareAuthority(r, userId, ref, true);
      const options = { includeMicrochip: parseFlag(query.includeMicrochip, 'includeMicrochip'), includeClinicalFiles: parseFlag(query.includeClinicalFiles, 'includeClinicalFiles') };
      return buildSharedView(r, pets, ref.scope, now, options, null);
    });
  }
}
