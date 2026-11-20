/**
 * Worker de la escena (feature 006, T856): `runSceneGeneration` ejecuta UN intento y siempre termina (REQ-ESC6-013, REQ-ESC6-036). Protocolo: (1) CLAIM
 * `PENDING -> RUNNING` por compare-and-set y arrendamiento `claimed_at + T_LEASE` (sin ganarlo, `NOOP`: sin leer referencias ni llamar al proveedor; una entrega
 * duplicada, tardía o ajena es `NOOP` sin oráculo); (2) reverificación de los dueños de los datos (cuenta, mascota asignada, consentimiento del driver real);
 * (3) lectura de referencias con límites y degradación (una referencia ausente o ilegible se omite y el intento queda `degraded`, EDGE-ESC6-028), prompt determinista
 * y `provider_call_started_at` ANTES de llamar al generador; (4) validación de la salida por firma; (5) comprobación de la señal y del arrendamiento inmediatamente
 * antes del `put` (un worker cortado no sube objetos tras el vencimiento, H-LCK-006-11); (6) T2 atómico bajo el candado de la escena (intento vigente, arrendamiento,
 * dueños de datos, cuota con la ventana y el máximo FIJADOS en T1, EDGE-ESC6-031), que publica y borra la imagen anterior y el `INTENT`, o cierra el intento sin
 * publicar y encola el objeto para borrar. Un fallo o timeout no descuenta cuota y deja intacta la imagen anterior. La señal de `T_GEN` entra por parámetro
 * (los temporizadores viven en `infrastructure`). Solo escribe tablas de la escena (INV-ESC6-012). Sin reloj ni entropía propios (INV-ARCH-001/002).
 *
 * @implements REQ-FAL7-006, EDGE-007-014, REQ-ESC6-013, REQ-ESC6-014, REQ-ESC6-027, REQ-ESC6-036, INV-ESC6-003, INV-ESC6-004, INV-ESC6-005, INV-ESC6-012, EDGE-ESC6-003, EDGE-ESC6-004, EDGE-ESC6-005, EDGE-ESC6-006, EDGE-ESC6-009, EDGE-ESC6-021, EDGE-ESC6-024, EDGE-ESC6-025, EDGE-ESC6-026, EDGE-ESC6-027, EDGE-ESC6-028, EDGE-ESC6-031, SC-ESC6-017, SC-ESC6-018, SC-ESC6-020, SC-ESC6-032, SC-ESC6-059, SC-ESC6-062, SC-ESC6-063, SC-ESC6-068, SC-ESC6-069, SC-ESC6-070, SC-ESC6-071
 */

import { avatarObjectKey, householdPhotoObjectKey, sceneImageObjectKey } from '../../domain/media/media-keys.ts';
import { buildImagePrompt } from '../../domain/scene/build-image-prompt.ts';
import { decideMode, type ModePlan } from '../../domain/scene/decide-mode.ts';
import { deriveSceneSeed } from '../../domain/scene/scene-seed.ts';
import { parseInputsSnapshot, type InputsSnapshot } from '../../domain/scene/inputs-snapshot.ts';
import { applyPublication, quotaWindowOf } from '../../domain/scene/quota-window.ts';
import { buildScenePayload } from '../../domain/scene/scene-payload.ts';
import { shiftIsoTimestamp } from '../../domain/shared/date-utils.ts';
import type { AssetRef, SceneErrorCode } from '../../generated/v34/schemas/types.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { SceneReferenceImage } from '../ports/scene-image-generator.port.ts';
import type { SceneAttemptRecord, SceneRecord } from '../ports/scene-repositories.port.ts';
import { purgeObjects, requireMedia } from './media-use-cases.ts';
import { recordSceneAttemptAudit } from './scene-audit.ts';
import { hasActiveConsent, loadLiveInputs, requireScene } from './scene-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

export type RunSceneOutcome = 'PUBLISHED' | 'FAILED' | 'CANCELLED' | 'NOOP';

/** Cuerpo de la tarea: solo identificadores opacos (contrato `SceneWorkerTask`). */
export interface SceneWorkerJob {
  readonly sceneId: string;
  readonly attemptId: string;
}

interface Claimed {
  readonly scene: SceneRecord;
  readonly attempt: SceneAttemptRecord;
  readonly snapshot: InputsSnapshot;
  readonly totalPets: number;
}

/** Fotos EFECTIVAMENTE enviadas al proveedor tras los filtros del worker (H-KEY-F5-6): solo ellas definen `scene_image_sources` y el consentimiento recomprobado en T2. */
interface SentPhotos {
  readonly petIds: ReadonlySet<string>;
  readonly household: boolean;
  /** La imagen vigente viajó como referencia (modo incremental): hereda las fuentes de la imagen previa. */
  readonly previousImage: boolean;
}

const REFERENCE_MIMES = new Set(['image/png', 'image/webp', 'image/jpeg']);
const resultKey = (attempt: SceneAttemptRecord, sceneId: string): string => sceneImageObjectKey(sceneId, attempt.resultObjectId);

/** Número de una ranura `IMG_n`. */
const slotNumber = (ref: AssetRef): number => Number(ref.slice(4));

/** Renumera las ranuras `IMG_n` conservando las referencias que sobreviven (en su orden) y poniendo a `null` las omitidas. */
function renumber(plan: ModePlan, dropped: ReadonlySet<AssetRef>): ModePlan {
  const kept = new Map<AssetRef, AssetRef>();
  const ordered = [plan.currentSceneRef, plan.householdRef, ...plan.pets.map((p) => p.ref)].filter((ref): ref is AssetRef => ref !== null).sort((a, b) => slotNumber(a) - slotNumber(b));
  for (const ref of ordered) if (!dropped.has(ref)) kept.set(ref, `IMG_${kept.size + 1}` as AssetRef);
  const map = (ref: AssetRef | null): AssetRef | null => (ref === null ? null : (kept.get(ref) ?? null));
  return { ...plan, currentSceneRef: map(plan.currentSceneRef), householdRef: map(plan.householdRef), pets: plan.pets.map((p) => ({ ...p, ref: map(p.ref) })), slotCount: kept.size };
}

export class RunSceneGenerationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Fila `SCENE_PUBLISHED` o `SCENE_FAILED` del intento, en la transacción que lo cierra (REQ-ESC6-021). */
  private audit(r: RepositorySet, scene: SceneRecord, attempt: SceneAttemptRecord, event: 'SCENE_PUBLISHED' | 'SCENE_FAILED', result: string): Promise<void> {
    return recordSceneAttemptAudit(this.deps, r, scene, attempt, event, result);
  }

  async execute(job: SceneWorkerJob, signal: AbortSignal): Promise<RunSceneOutcome> {
    const { deps } = this;
    const svc = requireScene(deps);
    const media = requireMedia(deps);
    const claim = await this.claim(job);
    if ('outcome' in claim) return claim.outcome;
    const { scene, attempt, snapshot } = claim;

    // Referencias, prompt y llamada al proveedor (fuera de toda transacción).
    let degraded = attempt.degraded;
    let references: SceneReferenceImage[] = [];
    let prompt = '';
    let sent: SentPhotos = { petIds: new Set(), household: false, previousImage: false };
    try {
      const last = scene.image === null ? null : parseInputsSnapshot(scene.image.inputsSnapshot);
      const plan = decideMode({ last, now: snapshot, hasImage: scene.image !== null, action: attempt.action }) ?? decideMode({ last: null, now: snapshot, hasImage: false, action: 'UPDATE' });
      if (plan === null || plan.mode !== attempt.mode) return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', degraded);
      const slots: Array<{ ref: AssetRef; key: string; required: boolean; petId?: string; household?: true; keep?: true }> = [];
      if (plan.currentSceneRef !== null && scene.image !== null) slots.push({ ref: plan.currentSceneRef, key: sceneImageObjectKey(scene.id, scene.image.id), required: true });
      if (plan.householdRef !== null && scene.householdId !== null && snapshot.household !== null) slots.push({ ref: plan.householdRef, key: householdPhotoObjectKey(scene.householdId, snapshot.household), required: false, household: true });
      for (const entry of plan.pets) {
        const pet = snapshot.pets.find((p) => p.id === entry.petId);
        if (entry.ref !== null && pet?.photo != null) slots.push({ ref: entry.ref, key: avatarObjectKey(pet.id, pet.photo), required: false, petId: pet.id, ...(entry.action === 'KEEP' ? { keep: true as const } : {}) });
      }
      // N2-16 (B): las ranuras se entregan y se recortan por número de ranura (escena previa, hogar, ADD/REPLACE y, al final, las KEEP).
      slots.sort((a, b) => slotNumber(a.ref) - slotNumber(b.ref));
      const loaded: Array<{ ref: AssetRef; required: boolean; mime: string; bytes: Uint8Array; petId?: string; household?: true; keep?: true }> = [];
      const dropped = new Set<AssetRef>();
      for (const slot of slots) {
        let object: Awaited<ReturnType<typeof media.storage.get>> = null;
        for (let tries = 0; tries < 2 && object === null; tries += 1) {
          try {
            object = await media.storage.get(slot.key);
          } catch {
            object = null;
          }
        }
        const stripped = object !== null && REFERENCE_MIMES.has(object.contentType) ? svc.images.strip(object.contentType, object.bytes) : { ok: false as const };
        if (!stripped.ok) {
          if (slot.required) return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', degraded);
          dropped.add(slot.ref);
          degraded = true;
          continue;
        }
        loaded.push({ ...slot, mime: stripped.mime, bytes: stripped.bytes });
      }
      const fit = svc.images.fit(loaded.map((l) => l.bytes.length));
      if (fit.degraded) {
        // N2-16 (C): omitir por el tope solo fotos KEEP (su apariencia ya está en la escena previa) no marca el intento como degradado.
        for (const l of loaded.slice(fit.kept)) {
          if (l.required) return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', true);
          dropped.add(l.ref);
          if (l.keep !== true) degraded = true;
        }
      }
      const adjusted = renumber(plan, dropped);
      const delivered = loaded.filter((l) => !dropped.has(l.ref));
      sent = {
        petIds: new Set(delivered.flatMap((l) => (l.petId === undefined ? [] : [l.petId]))),
        household: delivered.some((l) => l.household === true),
        previousImage: delivered.some((l) => l.required),
      };
      references = loaded.filter((l) => !dropped.has(l.ref)).map((l, i) => ({ ref: `IMG_${i + 1}` as SceneReferenceImage['ref'], mime: l.mime, bytes: l.bytes }));
      prompt = buildImagePrompt(buildScenePayload({ plan: adjusted, last, now: snapshot, householdId: scene.householdId, maxPets: svc.maxPets, totalPets: claim.totalPets }));
    } catch {
      return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', degraded);
    }

    // Cuota GLOBAL mensual (Fase 14, T948, N2-02 = A): descuento atómico ANTES de llamar al proveedor; agotada o ilegible = fallo estable sin llamada (el código visible es el
    // estable, como en T2; el motivo interno no se expone).
    if (svc.globalQuota !== undefined) {
      let allowed = false;
      try {
        allowed = await svc.globalQuota.tryConsume(quotaWindowOf(deps.clock.todayIsoDate()));
      } catch {
        allowed = false;
      }
      if (!allowed) return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', degraded);
    }

    // `provider_call_started_at` se escribe ANTES de llamar al proveedor (H-LCK-006-04).
    const started = await deps.uow.runInTransaction(async (r) => {
      await r.scenes.lockScene(scene.id);
      const current = await r.scenes.findById(scene.id);
      if (current === null || current.runState !== 'generating' || current.currentAttemptId !== attempt.id) return false;
      await r.scenes.markProviderCall(attempt.id, deps.clock.nowIsoTimestamp());
      return true;
    });
    if (!started) return this.close(scene.id, attempt, 'CANCELLED', null, degraded);

    let generated: Awaited<ReturnType<typeof svc.generator.generate>>;
    try {
      generated = await svc.generator.generate({ prompt, references, seed: deriveSceneSeed(attempt.id), signal });
    } catch {
      return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', degraded);
    }
    if (!generated.ok) return this.close(scene.id, attempt, 'FAILED', generated.code, degraded);
    const verdict = svc.images.validateOutput(generated.image.mime, generated.image.bytes);
    if (!verdict.ok) return this.close(scene.id, attempt, 'FAILED', verdict.code, degraded);
    if (signal.aborted) return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-TIMEOUT', degraded);

    // Antes del `put`: la señal y el arrendamiento vigentes (H-LCK-006-11).
    const gate = await deps.uow.runInTransaction(async (r) => {
      await r.scenes.lockScene(scene.id);
      const current = await r.scenes.findById(scene.id);
      if (current === null || current.runState !== 'generating' || current.currentAttemptId !== attempt.id) return 'CANCELLED' as const;
      const now = deps.clock.nowIsoTimestamp();
      if (current.leaseExpiresAt === null || current.leaseExpiresAt <= now) return 'EXPIRED' as const;
      return 'OK' as const;
    });
    if (gate === 'CANCELLED') return this.close(scene.id, attempt, 'CANCELLED', null, degraded);
    if (gate === 'EXPIRED') return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-LEASE-EXPIRED', degraded);
    const key = resultKey(attempt, scene.id);
    try {
      await media.storage.put(key, verdict.bytes, verdict.mime);
    } catch {
      return this.close(scene.id, attempt, 'FAILED', 'ERR-SCENE-GENERATION-FAILED', degraded);
    }

    // T2 atómico.
    const published = await deps.uow.runInTransaction(async (r) => {
      await r.scenes.lockScene(scene.id);
      const current = await r.scenes.findById(scene.id);
      const live = await r.scenes.findAttemptById(attempt.id);
      const now = deps.clock.nowIsoTimestamp();
      const finish = async (outcome: 'FAILED' | 'CANCELLED', code: SceneErrorCode | null, internalReason?: string) => {
        if (live !== null && live.outcome === null && (await r.scenes.closeAttempt({ sceneId: scene.id, attemptId: attempt.id, outcome, errorCode: code, degraded, now }))) {
          await r.mediaQueue.enqueue(key, 'DELETE', now);
          await this.audit(r, scene, attempt, 'SCENE_FAILED', internalReason ?? code ?? outcome);
        }
        return { outcome } as const;
      };
      if (current === null || live === null || live.outcome !== null || current.runState !== 'generating' || current.currentAttemptId !== attempt.id) {
        if (current !== null) await r.mediaQueue.enqueue(key, 'DELETE', now);
        return { outcome: 'CANCELLED' } as const;
      }
      if (current.leaseExpiresAt === null || current.leaseExpiresAt <= now) return finish('FAILED', 'ERR-SCENE-LEASE-EXPIRED');
      const owners = await this.dataOwners(r, current, snapshot, attempt.actorUserId, sent);
      if (owners === null) return finish('CANCELLED', null);
      const quota = applyPublication({ consumed: current.consumedGenerations, window: current.quotaWindow, attemptWindow: attempt.quotaWindow, attemptMax: attempt.quotaMax });
      // H-KEY-F5-7: el código visible es el estable; el motivo interno (no es un ERR-*) solo va a la auditoría.
      if (!quota.allowed) return finish('FAILED', 'ERR-SCENE-GENERATION-FAILED', 'SCENE_QUOTA_AT_T2');
      const previous = await r.scenes.publishImage({
        sceneId: scene.id,
        attemptId: attempt.id,
        image: { id: attempt.resultObjectId, mime: verdict.mime, sizeBytes: verdict.bytes.length, fingerprint: attempt.fingerprint, inputsSnapshot: attempt.inputsSnapshot, createdAt: now },
        degraded,
        consumedGenerations: quota.consumed,
        quotaWindow: quota.window,
        ownerUserIds: owners,
        now,
      });
      if (previous !== null) await r.mediaQueue.enqueue(sceneImageObjectKey(scene.id, previous), 'DELETE', now);
      await r.mediaQueue.remove(key);
      await this.audit(r, scene, attempt, 'SCENE_PUBLISHED', 'OK');
      return { outcome: 'PUBLISHED', previous } as const;
    });
    if (published.outcome === 'PUBLISHED') {
      if (published.previous !== null) await purgeObjects(deps, [sceneImageObjectKey(scene.id, published.previous)]);
      return 'PUBLISHED';
    }
    await purgeObjects(deps, [key]);
    return published.outcome;
  }

  /** Claim, reverificación y datos para el prompt; `{ outcome }` si no hay nada que ejecutar. */
  private async claim(job: SceneWorkerJob): Promise<Claimed | { readonly outcome: RunSceneOutcome }> {
    const { deps } = this;
    const svc = requireScene(deps);
    const result = await deps.uow.runInTransaction(async (r): Promise<Claimed | { readonly outcome: RunSceneOutcome; readonly purge?: string }> => {
      const attempt = await r.scenes.findAttemptById(job.attemptId);
      if (attempt === null || attempt.sceneId !== job.sceneId || attempt.phase !== 'PENDING') return { outcome: 'NOOP' };
      const scene = await r.scenes.findById(job.sceneId);
      if (scene === null) return { outcome: 'NOOP' };
      await r.scenes.lockScene(scene.id);
      const now = deps.clock.nowIsoTimestamp();
      const key = resultKey(attempt, scene.id);
      const abandon = async (outcome: 'FAILED' | 'CANCELLED', code: SceneErrorCode | null) => {
        if (await r.scenes.closeAttempt({ sceneId: scene.id, attemptId: attempt.id, outcome, errorCode: code, degraded: false, now })) {
          await r.mediaQueue.enqueue(key, 'DELETE', now);
          await this.audit(r, scene, attempt, 'SCENE_FAILED', code ?? outcome);
        }
        return { outcome: 'NOOP' as const, purge: key };
      };
      if (scene.currentAttemptId !== attempt.id) return abandon('CANCELLED', null);
      if (scene.runState === 'generating' && scene.leaseExpiresAt !== null && scene.leaseExpiresAt <= now) {
        const expired = await r.scenes.expireLease(scene.id, now);
        if (expired !== null) {
          await r.mediaQueue.enqueue(key, 'DELETE', now);
          await this.audit(r, scene, expired, 'SCENE_FAILED', 'ERR-SCENE-LEASE-EXPIRED');
        }
        return { outcome: 'NOOP', purge: key };
      }
      if (!(await r.scenes.claimAttempt({ sceneId: scene.id, attemptId: attempt.id, now, leaseExpiresAt: shiftIsoTimestamp(now, svc.leaseSeconds * 1000) }))) return { outcome: 'NOOP' };
      const snapshot = parseInputsSnapshot(attempt.inputsSnapshot);
      if (snapshot === null) {
        await r.scenes.closeAttempt({ sceneId: scene.id, attemptId: attempt.id, outcome: 'FAILED', errorCode: 'ERR-SCENE-GENERATION-FAILED', degraded: false, now });
        await r.mediaQueue.enqueue(key, 'DELETE', now);
        await this.audit(r, scene, attempt, 'SCENE_FAILED', 'ERR-SCENE-GENERATION-FAILED');
        return { outcome: 'FAILED', purge: key };
      }
      const owners = await this.dataOwners(r, scene, snapshot, attempt.actorUserId, null);
      if (owners === null) return { ...(await abandon('CANCELLED', null)), outcome: 'CANCELLED' };
      const live = await loadLiveInputs(deps, r, { householdId: scene.householdId, ownerUserId: scene.ownerUserId, role: 'OWNER' });
      return { scene, attempt: { ...attempt, phase: 'RUNNING', claimedAt: now }, snapshot, totalPets: live.total };
    });
    if ('outcome' in result) {
      if (result.purge !== undefined) await purgeObjects(deps, [result.purge]);
      return { outcome: result.outcome };
    }
    return result;
  }

  /** Cierra el intento sin publicar (`FAILED` o `CANCELLED`), encola su objeto para borrar y lo purga tras el COMMIT. */
  private async close(sceneId: string, attempt: SceneAttemptRecord, outcome: 'FAILED' | 'CANCELLED', code: SceneErrorCode | null, degraded: boolean): Promise<RunSceneOutcome> {
    const { deps } = this;
    const key = resultKey(attempt, sceneId);
    await deps.uow.runInTransaction(async (r) => {
      await r.scenes.lockScene(sceneId);
      const now = deps.clock.nowIsoTimestamp();
      const scene = await r.scenes.findById(sceneId);
      if (scene === null) return;
      if (code === 'ERR-SCENE-LEASE-EXPIRED') {
        const expired = await r.scenes.expireLease(sceneId, now);
        if (expired !== null) {
          await r.mediaQueue.enqueue(key, 'DELETE', now);
          await this.audit(r, scene, expired, 'SCENE_FAILED', code);
          return;
        }
      }
      if (await r.scenes.closeAttempt({ sceneId, attemptId: attempt.id, outcome, errorCode: code, degraded, now })) {
        await r.mediaQueue.enqueue(key, 'DELETE', now);
        await this.audit(r, scene, attempt, 'SCENE_FAILED', code ?? outcome);
      }
    });
    await purgeObjects(deps, [key]);
    return outcome;
  }

  /**
   * Dueños de los datos de la imagen (REQ-ESC6-036 (4), H-KEY-F5-6). Existencia de cuenta y mascota asignada (o, sin hogar, del propietario sin asignar): TODOS los
   * dueños del snapshot, hayan viajado o no sus fotos. Consentimiento vigente (driver real): el actor y los dueños de fotos ENVIADAS (`sent`); en el claim, que aún no
   * conoce los filtros, `sent` es `null` y se exige para toda foto del snapshot. `null` si falta algo (EDGE-ESC6-025) o si una mascota de la huella está DECEASED (REQ-FAL7-006, EDGE-007-014); si no, los ids únicos de `scene_image_sources`:
   * quien subió la foto del hogar y cada dueño de foto de mascota enviadas, más las fuentes de la imagen previa si viajó como referencia (la imagen nueva deriva de ella).
   */
  private async dataOwners(r: RepositorySet, scene: SceneRecord, snapshot: InputsSnapshot, actorUserId: string, sent: SentPhotos | null): Promise<string[] | null> {
    const svc = requireScene(this.deps);
    const sources = new Set<string>();
    if ((await r.users.findById(actorUserId)) === null) return null;
    if (svc.realDriver && !(await hasActiveConsent(r, svc, actorUserId, 'PET_PHOTOS')) && !(await hasActiveConsent(r, svc, actorUserId, 'HOUSEHOLD_PHOTO'))) return null;
    for (const entry of snapshot.pets) {
      const pet = await r.pets.findById(entry.id);
      if (pet === null || (await r.users.findById(pet.ownerUserId)) === null) return null;
      // REQ-FAL7-006, EDGE-007-014: una mascota de la huella que pasó a DECEASED durante la generación cancela la publicación (CANCELLED, sin cuota).
      if (pet.lifeStatus === 'DECEASED') return null;
      const assignments = await r.assignments.listByPet(pet.id);
      const placed = scene.householdId !== null ? assignments.some((a) => a.householdId === scene.householdId) : pet.ownerUserId === scene.ownerUserId && assignments.length === 0;
      if (!placed) return null;
      const photoSent = entry.photo !== null && (sent === null || sent.petIds.has(pet.id));
      if (photoSent) {
        if (svc.realDriver && !(await hasActiveConsent(r, svc, pet.ownerUserId, 'PET_PHOTOS'))) return null;
        sources.add(pet.ownerUserId);
      }
    }
    if (snapshot.household !== null && scene.householdId !== null) {
      const photo = await r.scenes.findHouseholdPhoto(scene.householdId);
      if (photo === null || photo.objectId !== snapshot.household || (await r.users.findById(photo.uploadedByUserId)) === null) return null;
      if (sent === null || sent.household) {
        if (svc.realDriver && !(await hasActiveConsent(r, svc, photo.uploadedByUserId, 'HOUSEHOLD_PHOTO'))) return null;
        sources.add(photo.uploadedByUserId);
      }
    }
    if (sent !== null && sent.previousImage) for (const owner of await r.scenes.findImageSources(scene.id)) sources.add(owner);
    return [...sources].sort();
  }
}
