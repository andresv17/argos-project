/**
 * Casos de uso de la escena del hogar (feature 006, T852+): lectura del estado y entrega de la imagen. La autorización y el 404 ocurren ANTES de cualquier
 * escritura (INV-ESC6-007, INV-ESC6-019, SC-ESC6-093): un tercero, un invitado o un hogar inexistente reciben `ERR-HOUSE-NOT-FOUND` y no se crea ninguna fila. La
 * escena se crea perezosamente en la primera lectura de un miembro ACTIVE. El estado `idle|outdated|ready` NO se guarda: se deriva en cada lectura con
 * `deriveStatus` sobre la huella del estado vivo (REQ-ESC6-003, ADR-006-09); lo único que la lectura materializa es el vencimiento del arrendamiento, por
 * compare-and-set idempotente bajo el candado de la escena (data-model.md §7, `H-TRI-006-12`). El reloj y los identificadores salen de los puertos (INV-ARCH-001/002).
 *
 * @implements REQ-UX8-002, REQ-FAL7-006, REQ-ESC6-003, REQ-ESC6-004, REQ-ESC6-005, REQ-ESC6-008, REQ-ESC6-011, REQ-ESC6-019, REQ-ESC6-020, REQ-ESC6-024, REQ-ESC6-032, REQ-ESC6-034, INV-ESC6-007, INV-ESC6-014, INV-ESC6-019, EDGE-ESC6-003, EDGE-ESC6-006, SC-ESC6-014, SC-ESC6-018, SC-ESC6-081, SC-ESC6-093
 */

import { sha256Hex } from '../../domain/audit/sha256.ts';
import { householdPhotoObjectKey, sceneImageObjectKey } from '../../domain/media/media-keys.ts';
import { isOwnerRow } from '../../domain/households/household-policies.ts';
import { ATTEMPT_WINDOW_SECONDS, evaluateAttemptLimits } from '../../domain/scene/attempt-limits.ts';
import { buildInputsSnapshot, computeFingerprint, countPendingChanges, hasInputs, parseInputsSnapshot, serializeInputsSnapshot, type InputsSnapshot, type SnapshotPet } from '../../domain/scene/inputs-snapshot.ts';
import { decideMode } from '../../domain/scene/decide-mode.ts';
import { quotaWindowOf, remainingQuota, windowResetsAt } from '../../domain/scene/quota-window.ts';
import { canGenerateScene, canManageHouseholdPhoto, type SceneRole } from '../../domain/scene/scene-policy.ts';
import { deriveStatus, type DerivedStatus } from '../../domain/scene/scene-state.ts';
import { selectVisiblePets } from '../../domain/scene/select-visible-pets.ts';
import { shiftIsoTimestamp } from '../../domain/shared/date-utils.ts';
import { DomainError } from '../../generated/index.ts';
import { DomainError as DomainErrorV34 } from '../../generated/v34/index.ts';
import type { SceneErrorCode, SceneView } from '../../generated/v34/schemas/types.ts';
import { DomainError as DomainErrorV31 } from '../../generated/v31/index.ts';
import type { MediaReadUrl } from '../ports/media-storage.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { SceneAttemptMode, SceneAttemptRecord, SceneConsentScope, SceneRecord } from '../ports/scene-repositories.port.ts';
import { requireMedia } from './media-use-cases.ts';
import { opaqueRef, recordSceneAttemptAudit, recordSceneAudit } from './scene-audit.ts';
import type { ApplicationDeps, SceneServices } from './use-case-support.ts';

export type SceneTarget = { readonly kind: 'HOUSEHOLD'; readonly householdId: string } | { readonly kind: 'OWNER' };

/** Quién consulta y sobre qué escena: hogar (con su rol) o propietario sin hogar. */
export interface SceneAccess {
  readonly householdId: string | null;
  readonly ownerUserId: string | null;
  readonly role: SceneRole;
}

/** Los servicios de la escena no están conectados en la composición: falla cerrado con un error interno. */
export function requireScene(deps: ApplicationDeps): SceneServices {
  if (deps.scene === undefined) throw new DomainErrorV31('ERR-INTERNAL-UNEXPECTED', 'La escena del hogar no está configurada.');
  return deps.scene;
}

/**
 * Autoriza ANTES de leer o escribir nada de la escena: hogar inexistente, usuario sin membresía ACTIVE o invitado = `ERR-HOUSE-NOT-FOUND` (404 sin revelar,
 * INV-ESC6-007). El propietario del hogar es `OWNER`; la escena sin hogar es del propietario (`OWNER`).
 */
export async function resolveSceneAccess(r: RepositorySet, userId: string, target: SceneTarget): Promise<SceneAccess> {
  if (target.kind === 'OWNER') return { householdId: null, ownerUserId: userId, role: 'OWNER' };
  const household = await r.households.findById(target.householdId);
  const membership = (await r.households.listMembershipsOfUsers([userId])).find((m) => m.householdId === target.householdId && m.status === 'ACTIVE');
  if (household === null || membership === undefined) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
  const role: SceneRole = isOwnerRow(membership) ? 'OWNER' : membership.role === 'ADMIN' ? 'ADMIN' : membership.role === 'CAREGIVER' ? 'CAREGIVER' : 'READER';
  return { householdId: target.householdId, ownerUserId: null, role };
}

export const findSceneOf = (r: RepositorySet, access: SceneAccess): Promise<SceneRecord | null> =>
  access.householdId !== null ? r.scenes.findByHouseholdId(access.householdId) : r.scenes.findByOwnerUserId(access.ownerUserId ?? '');

/** Consentimiento vigente del usuario para el ámbito, la versión del aviso y el proveedor actuales (REQ-ESC6-023). */
export async function hasActiveConsent(r: RepositorySet, svc: SceneServices, userId: string, scope: SceneConsentScope): Promise<boolean> {
  return (await r.sceneConsents.findActive(userId, scope, svc.providerId, svc.noticeVersion)) !== null;
}

export interface LiveInputs {
  readonly snapshot: InputsSnapshot;
  readonly fingerprint: string;
  /** Mascotas visibles (`N`) y asignadas (`M`) para «Se muestran N de M». */
  readonly shown: number;
  readonly total: number;
}

/**
 * Estado vivo de las entradas de la escena (REQ-ESC6-004, REQ-ESC6-008, REQ-ESC6-024): las primeras `N` mascotas asignadas al hogar (o, sin hogar, las del
 * propietario no asignadas a ninguno), con su avatar solo si su Propietario Legal tiene consentimiento vigente (driver real; con el simulado cuenta siempre,
 * REQ-ESC6-023), y la foto del hogar si quien la subió lo tiene. NUNCA nombres ni datos clínicos (INV-ESC6-010).
 */
export async function loadLiveInputs(deps: ApplicationDeps, r: RepositorySet, access: SceneAccess): Promise<LiveInputs> {
  const svc = requireScene(deps);
  const candidates: Array<{ id: string; assignedAt: string }> = [];
  if (access.householdId !== null) {
    for (const assignment of await r.assignments.listByHousehold(access.householdId)) candidates.push({ id: assignment.petId, assignedAt: assignment.assignedAt });
  } else {
    for (const pet of await r.pets.listByOwners([access.ownerUserId ?? ''])) {
      if ((await r.assignments.listByPet(pet.id)).length === 0) candidates.push({ id: pet.id, assignedAt: pet.createdAt });
    }
  }
  // REQ-FAL7-006: una mascota DECEASED no se dibuja ni cuenta en `pets.shown/total`; el filtro va ANTES de elegir las visibles y de `buildInputsSnapshot` (sin campos nuevos en `SnapshotPet`).
  const alive: Array<{ id: string; assignedAt: string }> = [];
  // EDGE-007-031 (fail-closed): una mascota no encontrada queda EXCLUIDA, no dibujada.
  for (const candidate of candidates) {
    const pet = await r.pets.findById(candidate.id);
    if (pet !== null && pet.lifeStatus !== 'DECEASED') alive.push(candidate);
  }
  const { visible, total } = selectVisiblePets(alive, svc.maxPets);
  const pets: SnapshotPet[] = [];
  for (const entry of visible) {
    const pet = await r.pets.findById(entry.id);
    if (pet === null) continue;
    const objectId = (await r.pets.findAvatar(pet.id))?.objectId ?? null;
    const photo = objectId !== null && (!svc.realDriver || (await hasActiveConsent(r, svc, pet.ownerUserId, 'PET_PHOTOS'))) ? objectId : null;
    pets.push({ id: pet.id, species: pet.species, speciesOther: pet.speciesOther ?? null, breed: pet.breed, breedCode: pet.breedCode ?? null, sex: pet.sex, photo });
  }
  let householdPhoto: string | null = null;
  if (access.householdId !== null) {
    const stored = await r.scenes.findHouseholdPhoto(access.householdId);
    if (stored !== null && (!svc.realDriver || (await hasActiveConsent(r, svc, stored.uploadedByUserId, 'HOUSEHOLD_PHOTO')))) householdPhoto = stored.objectId;
  }
  const snapshot = buildInputsSnapshot({ householdPhoto, pets });
  return { snapshot, fingerprint: computeFingerprint(snapshot), shown: pets.length, total };
}

/** Contadores de `REQ-ESC6-034` leídos bajo el candado de la escena y evaluados por la función pura de dominio (con `Retry-After` exacto). */
async function evaluateLimits(deps: ApplicationDeps, r: RepositorySet, sceneId: string, actorUserId: string, now: string): Promise<ReturnType<typeof evaluateAttemptLimits>> {
  const svc = requireScene(deps);
  const since = shiftIsoTimestamp(now, -ATTEMPT_WINDOW_SECONDS * 1000);
  // EDGE-009-041 (P5-01 = B): a los 10 min de su inicio el intento sin marca y sin `outcome` se cierra CANCELLED sin llamada y deja de contar para ACTOR_LIMIT.
  await r.scenes.cancelStaleUnmarkedAttempts(sceneId, actorUserId, shiftIsoTimestamp(now, -svc.unmarkedAttemptTtlSeconds * 1000), now);
  const failed = await r.scenes.countFailedAttemptsByScene(sceneId, since);
  const closedWithoutCall = await r.scenes.countClosedWithoutCallByScene(sceneId, since);
  return evaluateAttemptLimits({
    now,
    lastStartedAt: await r.scenes.lastAttemptStartedAt(sceneId),
    failedInWindow: failed.count,
    oldestFailedStartedAt: failed.oldestAt,
    startedByActor: await r.scenes.countAttemptsByActor(actorUserId, since),
    oldestActorStartedAt: await r.scenes.oldestActorAttemptAt(actorUserId, since),
    closedWithoutCall: { count: closedWithoutCall.count, oldestAt: closedWithoutCall.oldestAt, max: svc.maxClosedWithoutCallPerDay },
  });
}

interface SceneReading {
  readonly scene: SceneRecord;
  readonly live: LiveInputs;
  readonly derived: DerivedStatus;
  readonly last: InputsSnapshot | null;
  readonly window: string;
  readonly now: string;
}

/** Deriva el estado de una escena ya cargada; el intento fallido vigente aporta su huella y su código (data-model.md §4). */
async function readScene(deps: ApplicationDeps, r: RepositorySet, access: SceneAccess, scene: SceneRecord, now: string, window: string): Promise<SceneReading> {
  const live = await loadLiveInputs(deps, r, access);
  const attempt: SceneAttemptRecord | null = scene.runState === 'failed' && scene.currentAttemptId !== null ? await r.scenes.findAttemptById(scene.currentAttemptId) : null;
  const derived = deriveStatus({
    now,
    runState: scene.runState,
    leaseExpiresAt: scene.leaseExpiresAt,
    hasImage: scene.image !== null,
    imageFingerprint: scene.image?.fingerprint ?? null,
    imageDegraded: scene.imageDegraded,
    fingerprintNow: live.fingerprint,
    hasInputs: hasInputs(live.snapshot),
    failedAttemptFingerprint: attempt?.fingerprint ?? null,
    lastErrorCode: (attempt?.errorCode ?? null) as SceneErrorCode | null,
  });
  const last = scene.image === null ? null : parseInputsSnapshot(scene.image.inputsSnapshot);
  return { scene, live, derived, last, window, now };
}

/** Vista de la escena (contrato `SceneView`): estado derivado, cambios pendientes, cuota, acciones habilitadas y consentimiento del usuario que consulta. */
async function buildView(deps: ApplicationDeps, r: RepositorySet, userId: string, access: SceneAccess, reading: SceneReading): Promise<SceneView> {
  const svc = requireScene(deps);
  const { scene, live, derived, last, window, now } = reading;
  const pending = countPendingChanges(last, live.snapshot);
  const remaining = remainingQuota({ max: svc.quotaMax, consumed: scene.consumedGenerations, consumedWindow: scene.quotaWindow, currentWindow: window });
  const petPhotosGranted = await hasActiveConsent(r, svc, userId, 'PET_PHOTOS');
  const householdPhotoGranted = await hasActiveConsent(r, svc, userId, 'HOUSEHOLD_PHOTO');
  const consentRequired = svc.realDriver && !petPhotosGranted && !householdPhotoGranted;
  const limits = await evaluateLimits(deps, r, scene.id, userId, now);
  const roleOk = canGenerateScene(access.role);
  const hasChange = pending >= 1 || derived.status === 'failed' || (scene.image === null && hasInputs(live.snapshot));
  const statusOk = derived.status === 'outdated' || derived.status === 'failed';
  let blockedReason: SceneView['actions']['blockedReason'] = null;
  if (!roleOk) blockedReason = 'ROLE';
  else if (derived.status === 'generating') blockedReason = 'GENERATING';
  else if (consentRequired) blockedReason = 'CONSENT_REQUIRED';
  else if (remaining < 1) blockedReason = 'QUOTA_EXHAUSTED';
  else if (!statusOk || !hasChange) blockedReason = 'NO_CHANGES';
  else if (!limits.allowed) blockedReason = 'COOLDOWN';
  return {
    sceneId: scene.id,
    owner: access.householdId !== null ? 'HOUSEHOLD' : 'OWNER',
    status: derived.status,
    imageTag: scene.image?.id ?? null,
    pending,
    quota: { max: svc.quotaMax, remaining, window, resetsAt: windowResetsAt(window, svc.utcOffsetMinutes) },
    pets: { shown: live.shown, total: live.total, maxPets: svc.maxPets },
    actions: {
      canUpdate: blockedReason === null,
      canRegenerate: roleOk && remaining >= 1 && !consentRequired && derived.status !== 'generating' && limits.allowed,
      canUploadHouseholdPhoto: access.householdId !== null && canManageHouseholdPhoto(access.role),
      blockedReason,
      retryAfterSeconds: limits.allowed ? null : limits.retryAfterSeconds,
    },
    consent: { required: consentRequired, noticeVersion: svc.noticeVersion, providerId: svc.providerId, householdPhotoGranted, petPhotosGranted },
    lastError: derived.status === 'failed' ? derived.lastError : null,
    stale: scene.image !== null && derived.status !== 'ready',
    updatedAt: scene.updatedAt,
  };
}

/**
 * Escena perezosa nueva con el arrastre de cuota vigente del propietario (REQ-ESC6-011, REQ-ESC6-032, EDGE-ESC6-033, SC-ESC6-076): borrar y recrear un hogar
 * no reinicia el consumo mensual aunque no hubiera escena previa que migrar. El arrastre solo cuenta si es de la ventana vigente (`findQuotaCarry`).
 */
async function newSceneRecord(deps: ApplicationDeps, r: RepositorySet, access: SceneAccess, now: string, window: string): Promise<SceneRecord> {
  const ownerId = access.householdId === null ? access.ownerUserId : ((await r.households.findById(access.householdId))?.ownerUserId ?? null);
  const carried = ownerId === null ? null : await r.scenes.findQuotaCarry(ownerId, window);
  return {
    id: deps.ids.nextId(), householdId: access.householdId, ownerUserId: access.ownerUserId, runState: null, currentAttemptId: null, leaseExpiresAt: null,
    image: null, imageDegraded: false, consumedGenerations: carried ?? 0, quotaWindow: window, createdAt: now, updatedAt: now,
  };
}

/** `getHouseholdScene` / `getOwnerScene` (REQ-ESC6-003, REQ-ESC6-019, SC-ESC6-093). */
export class GetSceneUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, target: SceneTarget): Promise<SceneView> {
    const { deps } = this;
    requireScene(deps);
    return deps.uow.runInTransaction(async (r) => {
      const access = await resolveSceneAccess(r, userId, target);
      const now = deps.clock.nowIsoTimestamp();
      const window = quotaWindowOf(deps.clock.todayIsoDate());
      let scene = await findSceneOf(r, access);
      if (scene === null) {
        const fresh = await newSceneRecord(deps, r, access, now, window);
        await r.scenes.insert(fresh);
        scene = (await findSceneOf(r, access)) ?? fresh;
      }
      let reading = await readScene(deps, r, access, scene, now, window);
      if (reading.derived.leaseExpired) {
        await r.scenes.lockScene(scene.id);
        const expired = await r.scenes.expireLease(scene.id, now);
        if (expired !== null) {
          await r.mediaQueue.enqueue(sceneImageObjectKey(scene.id, expired.resultObjectId), 'DELETE', now);
          await recordSceneAttemptAudit(deps, r, scene, expired, 'SCENE_FAILED', 'ERR-SCENE-LEASE-EXPIRED');
        }
        scene = (await findSceneOf(r, access)) ?? scene;
        reading = await readScene(deps, r, access, scene, now, window);
      }
      return buildView(deps, r, userId, access, reading);
    });
  }
}

const SCENE_IMAGE_FILENAME = 'escena.png';

const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3})\d*)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

/** Milisegundos desde la época de un instante ISO 8601 con zona, por aritmética de calendario (sin `Date`: la escena es pura, INV-ESC6-002). `null` si no es legible. */
function epochMsOfIso(iso: string): number | null {
  const m = ISO_INSTANT.exec(iso);
  if (m === null) return null;
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  const fraction = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  const offsetMin = m[8] === undefined ? 0 : (m[8] === '-' ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10]));
  return ((days * 24 + hour) * 60 + minute - offsetMin) * 60_000 + second * 1000 + fraction;
}

/**
 * Nombre fijo de la descarga (REQ-UX8-002, contrato 006 3.5.0): `argos-hogar-AAAA-MM-DD.png` con el día de la generación de la imagen vigente en la zona de la
 * aplicación (`APP_TIMEZONE`). Sin nombre de mascota ni de hogar (PII). `null` si el instante no es legible.
 */
export function sceneDownloadFilenameOf(createdAt: string, timeZone: string): string | null {
  const ms = epochMsOfIso(createdAt);
  if (ms === null) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(ms).map((p) => [p.type, p.value]));
  return `argos-hogar-${parts['year']}-${parts['month']}-${parts['day']}.png`;
}

export interface SceneImageReadOptions {
  /** `download=1` (REQ-UX8-002): la URL firmada fija `attachment` y el nombre fijo; no elige imagen (INV-ESC6-019). */
  readonly download?: boolean;
}

export interface SceneImageAccess extends MediaReadUrl {
  readonly mime: string;
  /** Solo con descarga: nombre fijo `argos-hogar-AAAA-MM-DD.png`. */
  readonly downloadFilename: string | null;
  /** Solo con descarga y un almacenamiento sin URL firmada (URL no `https`): cuerpo de la imagen para el `200` con `attachment`. */
  readonly bytes: Uint8Array | null;
}

/**
 * `getHouseholdSceneImage` / `getOwnerSceneImage` (REQ-ESC6-019, INV-ESC6-019, SC-ESC6-081): resuelve SIEMPRE la imagen vigente de la escena autorizada (la clave sale
 * del registro, nunca de parámetros); `v` es solo una etiqueta de caché y un valor distinto o antiguo se ignora. Sin acceso o sin imagen: 404 sin escribir nada.
 * Con `download` (REQ-UX8-002) la URL se firma como `attachment` y, si el almacenamiento no firma, se devuelve el cuerpo para el `200`.
 */
export class GetSceneImageUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, target: SceneTarget, _v: string | undefined, options: SceneImageReadOptions = {}): Promise<SceneImageAccess> {
    const { deps } = this;
    const media = requireMedia(deps);
    requireScene(deps);
    const found = await deps.uow.runInTransaction(async (r) => {
      const access = await resolveSceneAccess(r, userId, target);
      const scene = await findSceneOf(r, access);
      if (scene === null || scene.image === null) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
      return { key: sceneImageObjectKey(scene.id, scene.image.id), mime: scene.image.mime, createdAt: scene.image.createdAt };
    });
    const inlineName = found.mime === 'image/webp' ? 'escena.webp' : SCENE_IMAGE_FILENAME;
    const downloadFilename = options.download === true ? sceneDownloadFilenameOf(found.createdAt, deps.clock.timeZone) : null;
    const access = await media.storage.createReadUrl({
      key: found.key,
      contentType: found.mime,
      ttlSeconds: media.limits.signedUrlTtlSeconds,
      ...(downloadFilename === null ? { filename: inlineName } : { filename: downloadFilename, disposition: 'attachment' as const }),
    });
    let bytes: Uint8Array | null = null;
    if (downloadFilename !== null && !access.url.startsWith('https://')) {
      const object = await media.storage.get(found.key);
      if (object === null) throw new DomainError('ERR-HOUSE-NOT-FOUND', undefined, 'householdId');
      bytes = object.bytes;
    }
    return { ...access, mime: found.mime, downloadFilename, bytes };
  }
}

/** Clave de objeto de la foto del hogar para la lectura autorizada (la usa `getHouseholdPhoto`, T857). */
export const householdPhotoKeyOf = householdPhotoObjectKey;

/** 429 `ERR-RATE-LIMITED` con `Retry-After` en segundos y `blockedReason = COOLDOWN` (REQ-ESC6-034); la capa HTTP lo traduce a la cabecera. */
export class SceneRateLimitedError extends DomainError {
  readonly blockedReason = 'COOLDOWN';
  constructor(readonly retryAfterSeconds: number) {
    super('ERR-RATE-LIMITED');
    this.name = 'SceneRateLimitedError';
  }
}

export type SceneGenerateAction = 'UPDATE' | 'REGENERATE';

export interface RequestSceneResult {
  /** `true` = intento nuevo aceptado (202); `false` = estado vigente sin intento nuevo (200). */
  readonly accepted: boolean;
  readonly view: SceneView;
}

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDEMPOTENCY_TTL_MS = 86_400_000;

/** Clave efectiva (REQ-ESC6-012): SHA-256 de `actorId ‖ sceneId ‖ action ‖ clave`; la clave del cliente nunca se guarda. */
export const sceneIdempotencyHash = (actorUserId: string, sceneId: string, action: SceneGenerateAction, key: string): string =>
  sha256Hex([actorUserId, sceneId, action, key].join('\u001f'));

const invalid = (field: string, detail: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);

function parseGenerateInput(input: unknown, key: unknown): { action: SceneGenerateAction; key: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw invalid('action', 'El cuerpo debe ser un objeto con action.');
  const body = input as Record<string, unknown>;
  const action = body['action'];
  if (Object.keys(body).some((k) => k !== 'action') || (action !== 'UPDATE' && action !== 'REGENERATE')) throw invalid('action', 'action debe ser UPDATE o REGENERATE.');
  if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) throw invalid('Idempotency-Key', 'Idempotency-Key debe ser un UUID v4.');
  return { action, key };
}

/** Códigos de un encolado cuyo resultado se ignora (la tarea pudo crearse): el arrendamiento `T_QUEUE` resuelve el caso (EDGE-ESC6-032). */
const AMBIGUOUS_ENQUEUE = new Set(['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'ABORTED', 'ETIMEDOUT', 'TIMEOUT']);

export function classifyEnqueueError(error: unknown): 'EXISTS' | 'AMBIGUOUS' | 'REJECTED' {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  const name = error instanceof Error ? error.name : '';
  if (code === 'ALREADY_EXISTS' || code === 6) return 'EXISTS';
  if ((typeof code === 'string' && AMBIGUOUS_ENQUEUE.has(code)) || name === 'TimeoutError' || name === 'AbortError') return 'AMBIGUOUS';
  return 'REJECTED';
}

/**
 * `generateHouseholdScene` / `generateOwnerScene` (T1; REQ-ESC6-005, REQ-ESC6-007, REQ-ESC6-011, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036). En UNA transacción y bajo el
 * candado de la escena: rol (403 tras el 404), consentimiento del driver real (403), idempotencia, estado, cambios pendientes (`UPDATE` sin ellos responde el
 * estado sin intento, D14), cuota (409), contadores (429), modo, intento `PENDING`, `INTENT` del objeto resultante y arrendamiento `ahora + T_QUEUE` (compare-and-set,
 * INV-ESC6-003). Después del `COMMIT` encola `{ sceneId, attemptId }`: `ALREADY_EXISTS` es éxito, un resultado ambiguo no marca `failed` y solo un rechazo
 * determinista cierra el intento `FAILED` y pasa su `INTENT` a `DELETE` (EDGE-ESC6-032). Nunca llama al generador.
 */
export class RequestSceneGenerationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(userId: string, target: SceneTarget, input: unknown, idempotencyKey: unknown): Promise<RequestSceneResult> {
    const { deps } = this;
    const svc = requireScene(deps);
    const { action, key } = parseGenerateInput(input, idempotencyKey);
    const outcome = await deps.uow.runInTransaction(async (r) => {
      const access = await resolveSceneAccess(r, userId, target);
      if (!canGenerateScene(access.role)) throw new DomainError('ERR-ACC-FORBIDDEN', undefined, 'householdId');
      if (svc.realDriver && !(await hasActiveConsent(r, svc, userId, 'PET_PHOTOS')) && !(await hasActiveConsent(r, svc, userId, 'HOUSEHOLD_PHOTO'))) {
        throw new DomainErrorV34('ERR-SCENE-CONSENT-REQUIRED');
      }
      const now = deps.clock.nowIsoTimestamp();
      const window = quotaWindowOf(deps.clock.todayIsoDate());
      let scene = await findSceneOf(r, access);
      if (scene === null) {
        const fresh = await newSceneRecord(deps, r, access, now, window);
        await r.scenes.insert(fresh);
        scene = (await findSceneOf(r, access)) ?? fresh;
      }
      await r.scenes.lockScene(scene.id);
      const current = (): Promise<SceneRecord> => findSceneOf(r, access).then((found) => found ?? scene!);
      const respond = async (accepted: boolean): Promise<{ accepted: boolean; view: SceneView; job: null }> => ({ accepted, view: await buildView(deps, r, userId, access, await readScene(deps, r, access, await current(), now, window)), job: null });

      // Idempotencia con alcance (actor, escena, acción), vigencia de 24 h y una sola clave recordada (la última).
      const other: SceneGenerateAction = action === 'UPDATE' ? 'REGENERATE' : 'UPDATE';
      const known = await r.scenes.findAttemptByIdempotencyKeyHash(sceneIdempotencyHash(userId, scene.id, action, key));
      if (known !== null && known.sceneId === scene.id && known.idempotencyExpiresAt !== null && known.idempotencyExpiresAt > now) return respond(false);
      const crossed = await r.scenes.findAttemptByIdempotencyKeyHash(sceneIdempotencyHash(userId, scene.id, other, key));
      if (crossed !== null && crossed.sceneId === scene.id && crossed.idempotencyExpiresAt !== null && crossed.idempotencyExpiresAt > now) {
        throw invalid('Idempotency-Key', 'La misma clave no puede usarse con otra acción.');
      }

      let reading = await readScene(deps, r, access, scene, now, window);
      if (reading.derived.leaseExpired) {
        const expired = await r.scenes.expireLease(scene.id, now);
        if (expired !== null) {
          await r.mediaQueue.enqueue(sceneImageObjectKey(scene.id, expired.resultObjectId), 'DELETE', now);
          await recordSceneAttemptAudit(deps, r, scene, expired, 'SCENE_FAILED', 'ERR-SCENE-LEASE-EXPIRED');
        }
        reading = await readScene(deps, r, access, await current(), now, window);
      }
      const { derived, live, last } = reading;
      if (derived.status === 'generating') return respond(false);
      const hasChange = countPendingChanges(last, live.snapshot) >= 1 || derived.status === 'failed' || (reading.scene.image === null && hasInputs(live.snapshot));
      if (action === 'UPDATE' && !((derived.status === 'outdated' || derived.status === 'failed') && hasChange)) return respond(false);
      if (remainingQuota({ max: svc.quotaMax, consumed: reading.scene.consumedGenerations, consumedWindow: reading.scene.quotaWindow, currentWindow: window }) < 1) {
        throw new DomainErrorV34('ERR-SCENE-QUOTA-EXCEEDED');
      }
      const limits = await evaluateLimits(deps, r, scene.id, userId, now);
      if (!limits.allowed) throw new SceneRateLimitedError(limits.retryAfterSeconds);

      const hasImage = reading.scene.image !== null;
      const plan = decideMode({ last, now: live.snapshot, hasImage, action }) ?? decideMode({ last: null, now: live.snapshot, hasImage: false, action: 'UPDATE' });
      const mode: SceneAttemptMode = plan?.mode ?? 'FROM_SCRATCH';
      const attemptId = deps.ids.nextId();
      const resultObjectId = deps.ids.nextId();
      const began = await r.scenes.beginGeneration({
        sceneId: scene.id,
        attempt: {
          id: attemptId, sceneId: scene.id, actorUserId: userId, action, mode, fingerprint: live.fingerprint, inputsSnapshot: serializeInputsSnapshot(live.snapshot), resultObjectId,
          phase: 'PENDING', claimedAt: null, providerCallStartedAt: null, quotaWindow: window, quotaMax: svc.quotaMax, outcome: null, errorCode: null, degraded: false,
          idempotencyKeyHash: sceneIdempotencyHash(userId, scene.id, action, key), idempotencyExpiresAt: shiftIsoTimestamp(now, IDEMPOTENCY_TTL_MS), startedAt: now, finishedAt: null,
        },
        now,
        leaseExpiresAt: shiftIsoTimestamp(now, svc.queueWaitSeconds * 1000),
      });
      if (!began) return respond(false);
      await r.mediaQueue.enqueue(sceneImageObjectKey(scene.id, resultObjectId), 'INTENT', now);
      await recordSceneAudit(deps, r, {
        executorUserId: userId, mutationType: 'UPDATE', entityType: 'HOME_SCENE', entityId: scene.id, event: 'SCENE_REQUESTED',
        detail: { householdRef: opaqueRef(deps, access.householdId ?? access.ownerUserId ?? scene.id), mode, pets: live.snapshot.pets.length, result: 'ACCEPTED' },
      });
      const view = await buildView(deps, r, userId, access, await readScene(deps, r, access, await current(), now, window));
      return { accepted: true, view, job: { sceneId: scene.id, attemptId, resultObjectId } };
    });
    if (outcome.job === null) return { accepted: outcome.accepted, view: outcome.view };
    return this.dispatch(userId, target, outcome.job, outcome.view);
  }

  /** Encolado tras el COMMIT (EDGE-ESC6-032). */
  private async dispatch(userId: string, target: SceneTarget, job: { sceneId: string; attemptId: string; resultObjectId: string }, view: SceneView): Promise<RequestSceneResult> {
    const { deps } = this;
    const svc = requireScene(deps);
    try {
      await svc.dispatcher.enqueue({ sceneId: job.sceneId, attemptId: job.attemptId });
      return { accepted: true, view };
    } catch (error) {
      const kind = classifyEnqueueError(error);
      if (kind !== 'REJECTED') return { accepted: true, view };
      await deps.uow.runInTransaction(async (r) => {
        const now = deps.clock.nowIsoTimestamp();
        await r.scenes.lockScene(job.sceneId);
        if (await r.scenes.closeAttempt({ sceneId: job.sceneId, attemptId: job.attemptId, outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now })) {
          await r.mediaQueue.enqueue(sceneImageObjectKey(job.sceneId, job.resultObjectId), 'DELETE', now);
        }
      });
      return { accepted: false, view: await new GetSceneUseCase(deps).execute(userId, target) };
    }
  }
}
