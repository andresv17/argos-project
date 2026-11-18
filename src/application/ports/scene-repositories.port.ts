/**
 * Repositorios de la escena (feature 006, ADR-006-07), parte del `UnitOfWork` existente (T827 los introdujo nulos; T834 les da forma real: compare-and-set a
 * `generating`, claim `PENDING -> RUNNING`, T1 que anula el hash de intentos previos, contadores de `REQ-ESC6-034` y arrastre de cuota por `UPSERT`).
 * Todo es `Promise` (INV-ARCH-005). Sin dependencia del dominio de escena: las reglas de negocio (condición de cambios pendientes, cuota, consentimiento) las
 * decide el caso de uso; el repositorio solo aplica las condiciones de estado de `data-model.md` §7.
 *
 * Orden de candados en toda transacción de la 006 (ADR-006-07, INV-ESC6-003, INV-ESC6-012): propietario -> mascota -> hogar -> escena. El caso de uso toma los
 * suyos primero; el repositorio de escena toma el de la escena al final (`lockScene`: PostgreSQL `SELECT ... FOR UPDATE`; SQLite ya está bajo `BEGIN IMMEDIATE`).
 *
 * @implements INV-ESC6-003, INV-ESC6-004, INV-ESC6-012, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036, EDGE-ESC6-016, EDGE-ESC6-033, INV-ARCH-005
 */

export const SCENE_LOCK_ORDER = ['OWNER', 'PET', 'HOUSEHOLD', 'SCENE'] as const;
export type SceneLockLevel = (typeof SCENE_LOCK_ORDER)[number];

/** Lo único del estado que se persiste (H-MIF-006-01); `idle`, `outdated` y `ready` se derivan en lectura. */
export type SceneRunState = 'generating' | 'failed';
export type SceneAttemptAction = 'UPDATE' | 'REGENERATE';
export type SceneAttemptMode = 'FROM_SCRATCH' | 'INCREMENTAL_ADD' | 'INCREMENTAL_REMOVE' | 'INCREMENTAL_REPLACE' | 'INCREMENTAL_MIXED' | 'REGENERATE';
export type SceneAttemptPhase = 'PENDING' | 'RUNNING' | 'DONE';
export type SceneAttemptOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type SceneConsentScope = 'HOUSEHOLD_PHOTO' | 'PET_PHOTOS';

/** Imagen vigente (columnas `image_*` de `home_scenes`): a lo sumo una por escena (D6-13 = A). */
export interface SceneImage {
  readonly id: string;
  readonly mime: 'image/png' | 'image/webp';
  readonly sizeBytes: number;
  readonly fingerprint: string;
  readonly inputsSnapshot: string;
  readonly createdAt: string;
}

/** Fila lógica de `home_scenes` (data-model.md §2.1): hogar o, sin hogar, propietario. */
export interface SceneRecord {
  readonly id: string;
  readonly householdId: string | null;
  readonly ownerUserId: string | null;
  readonly runState: SceneRunState | null;
  readonly currentAttemptId: string | null;
  readonly leaseExpiresAt: string | null;
  readonly image: SceneImage | null;
  readonly imageDegraded: boolean;
  readonly consumedGenerations: number;
  readonly quotaWindow: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Fila lógica de `scene_attempts` (data-model.md §2.5). Nunca guarda la clave de idempotencia, solo su hash (C8). */
export interface SceneAttemptRecord {
  readonly id: string;
  readonly sceneId: string;
  readonly actorUserId: string;
  readonly action: SceneAttemptAction;
  readonly mode: SceneAttemptMode;
  readonly fingerprint: string;
  readonly inputsSnapshot: string;
  readonly resultObjectId: string;
  readonly phase: SceneAttemptPhase;
  readonly claimedAt: string | null;
  readonly providerCallStartedAt: string | null;
  readonly quotaWindow: string;
  readonly quotaMax: number;
  readonly outcome: SceneAttemptOutcome | null;
  readonly errorCode: string | null;
  readonly degraded: boolean;
  readonly idempotencyKeyHash: string | null;
  readonly idempotencyExpiresAt: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/** T1: el intento nuevo, su instante y el arrendamiento (`ahora + T_QUEUE`) que fija el caso de uso. */
export interface BeginGenerationInput {
  readonly sceneId: string;
  readonly attempt: SceneAttemptRecord;
  readonly now: string;
  readonly leaseExpiresAt: string;
}

/** Claim del worker: `PENDING -> RUNNING` y arrendamiento `claimed_at + T_LEASE`. */
export interface ClaimAttemptInput {
  readonly sceneId: string;
  readonly attemptId: string;
  readonly now: string;
  readonly leaseExpiresAt: string;
}

export interface SceneRepository {
  findById(sceneId: string): Promise<SceneRecord | null>;
  findByHouseholdId(householdId: string): Promise<SceneRecord | null>;
  findByOwnerUserId(ownerUserId: string): Promise<SceneRecord | null>;
  /** Creación perezosa: `false` si ya existe la escena del hogar o del propietario sin hogar (índices únicos parciales). */
  insert(scene: SceneRecord): Promise<boolean>;
  /** Candado de la escena, el último del orden (ADR-006-07). */
  lockScene(sceneId: string): Promise<void>;
  /**
   * T1 (INV-ESC6-003, INV-ESC6-004, EDGE-ESC6-016): compare-and-set `run_state = 'generating'` solo si la escena está sin intento, fallida o con arrendamiento
   * vencido (`lease_expires_at <= now`); si cambia una fila, anula `idempotency_key_hash` de los intentos previos de la escena (solo se recuerda la última clave)
   * e inserta el intento. `false` = 0 filas: no se escribe nada.
   */
  beginGeneration(input: BeginGenerationInput): Promise<boolean>;
  /** Claim `PENDING -> RUNNING` con `claimed_at` y, en la misma transacción, el arrendamiento de la escena si el intento es el vigente. `false` = 0 filas. */
  claimAttempt(input: ClaimAttemptInput): Promise<boolean>;
  findAttemptById(attemptId: string): Promise<SceneAttemptRecord | null>;
  findAttemptByIdempotencyKeyHash(hash: string): Promise<SceneAttemptRecord | null>;
  /** Contadores de `REQ-ESC6-034`: intentos de la escena o del actor con `started_at >= since`. */
  countAttemptsByScene(sceneId: string, since: string): Promise<number>;
  countAttemptsByActor(actorUserId: string, since: string): Promise<number>;
  /** Arrastre de cuota (EDGE-ESC6-033): `UPSERT` con `consumed := max(valor previo, consumed)`. */
  upsertQuotaCarry(ownerUserId: string, quotaWindow: string, consumedGenerations: number): Promise<void>;
  findQuotaCarry(ownerUserId: string, quotaWindow: string): Promise<number | null>;
}

/** Fila lógica de `scene_consents` (data-model.md §2.7). Se conserva al retirarlo (prueba de la retirada). */
export interface SceneConsentRecord {
  readonly id: string;
  readonly userId: string;
  readonly scope: SceneConsentScope;
  readonly providerId: string;
  readonly noticeVersion: string;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

export interface SceneConsentRepository {
  /** El consentimiento más reciente (por `granted_at`) del usuario, vigente o retirado; `null` si nunca consintió. */
  findByUserId(userId: string): Promise<SceneConsentRecord | null>;
  findActive(userId: string, scope: SceneConsentScope, providerId: string, noticeVersion: string): Promise<SceneConsentRecord | null>;
  /** `false` si ya hay uno vigente para (usuario, ámbito, proveedor, versión) (índice único parcial). */
  grant(consent: SceneConsentRecord): Promise<boolean>;
  /** Retira un consentimiento vigente; `false` si no existe o ya estaba retirado. */
  revoke(consentId: string, revokedAt: string): Promise<boolean>;
}
