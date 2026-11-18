/**
 * Repositorios en memoria de la escena (feature 006, T834): misma semántica que SQLite y PostgreSQL (compare-and-set de T1, claim, hash de la última clave,
 * contadores, arrastre de cuota con máximo, un consentimiento vigente por clave). Opera sobre el borrador de la transacción de `InMemoryUnitOfWork`: si la
 * transacción lanza, el borrador se descarta y nada se escribe (INV-ESC6-012). Sin claves foráneas: el estado en memoria no las modela.
 *
 * @implements INV-ESC6-003, INV-ESC6-004, INV-ESC6-012, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036, EDGE-ESC6-016, EDGE-ESC6-033, INV-ARCH-005
 */
import type {
  HouseholdPhotoRecord,
  SceneAttemptRecord,
  SceneConsentRecord,
  SceneConsentRepository,
  SceneRecord,
  SceneRepository,
} from '../../../application/ports/scene-repositories.port.ts';

export interface SceneQuotaCarryRow {
  readonly ownerUserId: string;
  readonly quotaWindow: string;
  readonly consumedGenerations: number;
}

/** Parte de `MemoryState` que usa la escena. */
export interface SceneMemoryState {
  householdPhotos?: HouseholdPhotoRecord[];
  scenes?: SceneRecord[];
  sceneAttempts?: SceneAttemptRecord[];
  sceneConsents?: SceneConsentRecord[];
  sceneQuotaCarry?: SceneQuotaCarryRow[];
  /** `scene_image_sources`: de qué dueños proviene la imagen vigente. */
  sceneImageSources?: SceneImageSourceRow[];
}

export interface SceneImageSourceRow {
  readonly sceneId: string;
  readonly ownerUserId: string;
}

const copy = <T>(value: T): T => structuredClone(value);

export function memorySceneRepository(state: SceneMemoryState): SceneRepository {
  const scenes = (): SceneRecord[] => (state.scenes ??= []);
  const attempts = (): SceneAttemptRecord[] => (state.sceneAttempts ??= []);
  const carry = (): SceneQuotaCarryRow[] => (state.sceneQuotaCarry ??= []);
  const photos = (): HouseholdPhotoRecord[] => (state.householdPhotos ??= []);
  const sources = (): SceneImageSourceRow[] => (state.sceneImageSources ??= []);
  const replaceScene = (id: string, change: Partial<SceneRecord>): void => {
    state.scenes = scenes().map((s) => (s.id === id ? { ...s, ...change } : s));
  };
  const replaceAttempt = (id: string, change: Partial<SceneAttemptRecord>): void => {
    state.sceneAttempts = attempts().map((a) => (a.id === id ? { ...a, ...change } : a));
  };
  return {
    async findById(sceneId) {
      const found = scenes().find((s) => s.id === sceneId);
      return found === undefined ? null : copy(found);
    },
    async findByHouseholdId(householdId) {
      const found = scenes().find((s) => s.householdId === householdId);
      return found === undefined ? null : copy(found);
    },
    async findByOwnerUserId(ownerUserId) {
      const found = scenes().find((s) => s.ownerUserId === ownerUserId);
      return found === undefined ? null : copy(found);
    },
    async insert(scene) {
      const taken = scenes().some((s) => s.id === scene.id || (scene.householdId !== null && s.householdId === scene.householdId) || (scene.ownerUserId !== null && s.ownerUserId === scene.ownerUserId));
      if (taken) return false;
      state.scenes = [...scenes(), copy(scene)];
      return true;
    },
    async lockScene() {
      // La unidad de trabajo en memoria serializa las transacciones: no hace falta candado.
    },
    async beginGeneration({ sceneId, attempt, now, leaseExpiresAt }) {
      const current = scenes().find((s) => s.id === sceneId);
      if (current === undefined) return false;
      const open = current.runState === null || current.runState === 'failed' || (current.runState === 'generating' && current.leaseExpiresAt !== null && current.leaseExpiresAt <= now);
      if (!open) return false;
      replaceScene(sceneId, { runState: 'generating', currentAttemptId: attempt.id, leaseExpiresAt, updatedAt: now });
      state.sceneAttempts = attempts().map((a) => (a.sceneId === sceneId ? { ...a, idempotencyKeyHash: null, idempotencyExpiresAt: null } : a));
      if (attempt.idempotencyKeyHash !== null && attempts().some((a) => a.idempotencyKeyHash === attempt.idempotencyKeyHash)) {
        throw Object.assign(new Error('UNIQUE constraint failed: scene_attempts.idempotency_key_hash'), { code: 'SQLITE_CONSTRAINT' });
      }
      state.sceneAttempts = [...attempts(), copy(attempt)];
      return true;
    },
    async claimAttempt({ sceneId, attemptId, now, leaseExpiresAt }) {
      const found = attempts().find((a) => a.id === attemptId && a.sceneId === sceneId && a.phase === 'PENDING');
      if (found === undefined) return false;
      replaceAttempt(attemptId, { phase: 'RUNNING', claimedAt: now });
      const scene = scenes().find((s) => s.id === sceneId);
      if (scene !== undefined && scene.currentAttemptId === attemptId && scene.runState === 'generating') replaceScene(sceneId, { leaseExpiresAt });
      return true;
    },
    async findAttemptById(attemptId) {
      const found = attempts().find((a) => a.id === attemptId);
      return found === undefined ? null : copy(found);
    },
    async findAttemptByIdempotencyKeyHash(hash) {
      const found = attempts().find((a) => a.idempotencyKeyHash === hash);
      return found === undefined ? null : copy(found);
    },
    async countAttemptsByScene(sceneId, since) {
      return attempts().filter((a) => a.sceneId === sceneId && a.startedAt >= since).length;
    },
    async countFailedAttemptsByScene(sceneId, since) {
      const failed = attempts().filter((a) => a.sceneId === sceneId && a.outcome === 'FAILED' && a.startedAt >= since);
      const oldest = failed.reduce<string | null>((min, a) => (min === null || a.startedAt < min ? a.startedAt : min), null);
      return { count: failed.length, oldestAt: oldest };
    },
    async countAttemptsByActor(actorUserId, since) {
      return attempts().filter((a) => a.actorUserId === actorUserId && a.startedAt >= since).length;
    },
    async upsertQuotaCarry(ownerUserId, quotaWindow, consumedGenerations) {
      const existing = carry().find((c) => c.ownerUserId === ownerUserId && c.quotaWindow === quotaWindow);
      if (existing === undefined) {
        state.sceneQuotaCarry = [...carry(), { ownerUserId, quotaWindow, consumedGenerations }];
        return;
      }
      state.sceneQuotaCarry = carry().map((c) => (c === existing ? { ...c, consumedGenerations: Math.max(c.consumedGenerations, consumedGenerations) } : c));
    },
    async findQuotaCarry(ownerUserId, quotaWindow) {
      return carry().find((c) => c.ownerUserId === ownerUserId && c.quotaWindow === quotaWindow)?.consumedGenerations ?? null;
    },
    async purgeTerminalAttempts(finishedBefore) {
      const current = new Set(scenes().map((s) => s.currentAttemptId).filter((id): id is string => id !== null));
      const before = attempts().length;
      state.sceneAttempts = attempts().filter((a) => !(a.outcome !== null && a.finishedAt !== null && a.finishedAt < finishedBefore && !current.has(a.id)));
      return before - state.sceneAttempts.length;
    },
    async clearExpiredIdempotencyHashes(now) {
      let cleared = 0;
      state.sceneAttempts = attempts().map((a) => {
        if (a.idempotencyKeyHash === null || a.idempotencyExpiresAt === null || a.idempotencyExpiresAt > now) return a;
        cleared += 1;
        return { ...a, idempotencyKeyHash: null, idempotencyExpiresAt: null };
      });
      return cleared;
    },
    async purgeQuotaCarryBefore(quotaWindow) {
      const before = carry().length;
      state.sceneQuotaCarry = carry().filter((c) => c.quotaWindow >= quotaWindow);
      return before - state.sceneQuotaCarry.length;
    },
    async findHouseholdPhoto(householdId) {
      const found = photos().find((p) => p.householdId === householdId);
      return found === undefined ? null : copy(found);
    },
    async putHouseholdPhoto(photo) {
      state.householdPhotos = [...photos().filter((p) => p.householdId !== photo.householdId), copy(photo)];
    },
    async findImageSources(sceneId) {
      return sources().filter((x) => x.sceneId === sceneId).map((x) => x.ownerUserId).sort();
    },
    async replaceImageSources(sceneId, ownerUserIds) {
      state.sceneImageSources = [...sources().filter((x) => x.sceneId !== sceneId), ...[...new Set(ownerUserIds)].map((ownerUserId) => ({ sceneId, ownerUserId }))];
    },
    async retireImage(sceneId, now) {
      const scene = scenes().find((s) => s.id === sceneId);
      state.sceneImageSources = sources().filter((x) => x.sceneId !== sceneId);
      if (scene === undefined || scene.image === null) return null;
      replaceScene(sceneId, { image: null, imageDegraded: false, updatedAt: now });
      return scene.image.id;
    },
    async cancelInFlight(sceneId, now) {
      const scene = scenes().find((s) => s.id === sceneId);
      if (scene === undefined || scene.runState !== 'generating' || scene.currentAttemptId === null) return null;
      const attempt = attempts().find((a) => a.id === scene.currentAttemptId);
      if (attempt !== undefined) replaceAttempt(attempt.id, { phase: 'DONE', outcome: 'CANCELLED', finishedAt: now });
      replaceScene(sceneId, { runState: null, currentAttemptId: null, leaseExpiresAt: null, updatedAt: now });
      return attempt === undefined ? null : { attemptId: attempt.id, resultObjectId: attempt.resultObjectId };
    },
    async adoptOwnerScene(ownerUserId, householdId, now) {
      const own = scenes().find((s) => s.ownerUserId === ownerUserId);
      if (own === undefined) return null;
      const other = scenes().find((s) => s.householdId === householdId && s.id !== own.id);
      if (other !== undefined) {
        state.scenes = scenes().filter((s) => s.id !== other.id);
        state.sceneAttempts = attempts().filter((a) => a.sceneId !== other.id);
        state.sceneImageSources = sources().filter((x) => x.sceneId !== other.id);
      }
      replaceScene(own.id, { householdId, ownerUserId: null, updatedAt: now });
      return own.id;
    },
    async raiseConsumed(sceneId, quotaWindow, consumed) {
      const scene = scenes().find((s) => s.id === sceneId);
      if (scene !== undefined && scene.quotaWindow === quotaWindow && scene.consumedGenerations < consumed) replaceScene(sceneId, { consumedGenerations: consumed });
    },
    async deleteScene(sceneId) {
      state.scenes = scenes().filter((s) => s.id !== sceneId);
      state.sceneAttempts = attempts().filter((a) => a.sceneId !== sceneId);
      state.sceneImageSources = sources().filter((x) => x.sceneId !== sceneId);
    },
    async deleteHouseholdPhoto(householdId) {
      state.householdPhotos = photos().filter((p) => p.householdId !== householdId);
    },
    async pseudonymizeUser(userId, pseudonym) {
      state.sceneImageSources = [...new Map(sources().map((x) => [`${x.sceneId}|${x.ownerUserId === userId ? pseudonym : x.ownerUserId}`, x.ownerUserId === userId ? { ...x, ownerUserId: pseudonym } : x])).values()];
      state.householdPhotos = photos().map((p) => (p.uploadedByUserId === userId ? { ...p, uploadedByUserId: pseudonym } : p));
      state.sceneAttempts = attempts().map((a) => (a.actorUserId === userId ? { ...a, actorUserId: pseudonym } : a));
    },
  };
}

export function memorySceneConsentRepository(state: SceneMemoryState): SceneConsentRepository {
  const consents = (): SceneConsentRecord[] => (state.sceneConsents ??= []);
  return {
    async findByUserId(userId) {
      const own = consents().filter((c) => c.userId === userId);
      const latest = [...own].sort((a, b) => (a.grantedAt === b.grantedAt ? (a.id < b.id ? 1 : -1) : a.grantedAt < b.grantedAt ? 1 : -1))[0];
      return latest === undefined ? null : copy(latest);
    },
    async findActive(userId, scope, providerId, noticeVersion) {
      const found = consents().find((c) => c.userId === userId && c.scope === scope && c.providerId === providerId && c.noticeVersion === noticeVersion && c.revokedAt === null);
      return found === undefined ? null : copy(found);
    },
    async grant(consent) {
      if (consents().some((c) => c.id === consent.id)) throw Object.assign(new Error('UNIQUE constraint failed: scene_consents.id'), { code: 'SQLITE_CONSTRAINT' });
      const active = consents().some((c) => c.userId === consent.userId && c.scope === consent.scope && c.providerId === consent.providerId && c.noticeVersion === consent.noticeVersion && c.revokedAt === null);
      if (active && consent.revokedAt === null) return false;
      state.sceneConsents = [...consents(), copy(consent)];
      return true;
    },
    async revoke(consentId, revokedAt) {
      const found = consents().find((c) => c.id === consentId && c.revokedAt === null);
      if (found === undefined) return false;
      state.sceneConsents = consents().map((c) => (c === found ? { ...c, revokedAt } : c));
      return true;
    },
  };
}
