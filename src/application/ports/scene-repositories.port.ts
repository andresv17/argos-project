/**
 * Repositorios de la escena (feature 006, ADR-006-07), parte del `UnitOfWork` existente (T827 los introdujo nulos; T834 les da forma real: compare-and-set a
 * `generating`, claim `PENDING -> RUNNING`, T1 que anula el hash de intentos previos, contadores de `REQ-ESC6-034` y arrastre de cuota por `UPSERT`).
 * Todo es `Promise` (INV-ARCH-005). Sin dependencia del dominio de escena: las reglas de negocio (condición de cambios pendientes, cuota, consentimiento) las
 * decide el caso de uso; el repositorio solo aplica las condiciones de estado de `data-model.md` §7.
 *
 * Orden de candados en toda transacción de la 006 (ADR-006-07, INV-ESC6-003, INV-ESC6-012): propietario -> mascota -> hogar -> escena. El caso de uso toma los
 * suyos primero; el repositorio de escena toma el de la escena al final (`lockScene`: PostgreSQL `SELECT ... FOR UPDATE`; SQLite ya está bajo `BEGIN IMMEDIATE`).
 *
 * @implements INV-LIM9-001, REQ-LIM9-004, REQ-LIM9-005, INV-ESC6-003, INV-ESC6-004, INV-ESC6-012, REQ-ESC6-012, REQ-ESC6-034, REQ-ESC6-036, EDGE-ESC6-016, EDGE-ESC6-033, INV-ARCH-005
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
  readonly mime: 'image/png' | 'image/webp' | 'image/jpeg';
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
  /** Modelo y region de SU llamada (D9-22 = A, EDGE-009-045; T1298); `null` si el intento no llego a la llamada o es una fila previa. Opcionales al insertar (se guardan al marcar la llamada). */
  readonly providerModel?: string | null;
  readonly providerLocation?: string | null;
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

/** Cierre de un intento que no publica (`FAILED` o `CANCELLED`); si es el vigente de la escena, `FAILED` la deja `failed` y `CANCELLED` sin `run_state`. */
export interface CloseAttemptInput {
  readonly sceneId: string;
  readonly attemptId: string;
  readonly outcome: 'FAILED' | 'CANCELLED';
  readonly errorCode: string | null;
  readonly degraded: boolean;
  readonly now: string;
}

/** T2 (publicación atómica, INV-ESC6-004/005): el caso de uso ya verificó las condiciones bajo el candado de la escena; el repositorio solo escribe. */
export interface PublishImageInput {
  readonly sceneId: string;
  readonly attemptId: string;
  readonly image: SceneImage;
  readonly degraded: boolean;
  readonly consumedGenerations: number;
  readonly quotaWindow: string;
  /** Dueños de los datos de la imagen (`scene_image_sources`). */
  readonly ownerUserIds: readonly string[];
  readonly now: string;
}

/** Fila lógica de `household_photos` (data-model.md §2.4): una por hogar, sin nombre original (INV-ESC6-009). */
export interface HouseholdPhotoRecord {
  readonly householdId: string;
  readonly objectId: string;
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly sizeBytes: number;
  readonly uploadedByUserId: string;
  readonly createdAt: string;
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
  /**
   * Vencimiento del arrendamiento (data-model.md §7, `H-TRI-006-12`): CAS idempotente `run_state = 'generating' AND lease_expires_at <= now` -> `failed`, sin
   * arrendamiento, con el intento vigente cerrado `FAILED`/`ERR-SCENE-LEASE-EXPIRED` si seguía abierto. Devuelve el intento transicionado (su objeto resultante pasa a `DELETE`
   * y su `actorUserId` es el actor de la auditoría `SCENE_FAILED`, `H-KEY-F5-5`) o `null` si no cambió nada (otra lectura ganó la carrera o el arrendamiento sigue vigente).
   */
  expireLease(sceneId: string, now: string): Promise<SceneAttemptRecord | null>;
  /** Escribe `provider_call_started_at` y el modelo y la region de la llamada (D9-22 = A) antes de llamar al proveedor (H-LCK-006-04). Sin valores de prompt. */
  markProviderCall(attemptId: string, now: string, call: { readonly model: string | null; readonly location: string | null }): Promise<void>;
  /** Cierra el intento sin publicar; `false` si el intento no existe, no es de la escena o ya estaba cerrado. */
  closeAttempt(input: CloseAttemptInput): Promise<boolean>;
  /** T2: publica la imagen y cierra el intento `SUCCEEDED`; devuelve el id de la imagen anterior (para encolar su borrado) o `null`. */
  publishImage(input: PublishImageInput): Promise<string | null>;
  /** Inicio del intento más reciente de la escena (base del enfriamiento de 60 s y de su `Retry-After`) o `null`. */
  lastAttemptStartedAt(sceneId: string): Promise<string | null>;
  /** Resultado del intento más reciente de la escena por inicio (`null` si no hay intentos o el último sigue en vuelo): el enfriamiento solo aplica tras `SUCCEEDED` (REQ-ESC6-034, enmienda 2026-11-24). */
  lastAttemptOutcome(sceneId: string): Promise<'SUCCEEDED' | 'FAILED' | 'CANCELLED' | null>;
  /** Inicio más antiguo de los intentos del actor con `started_at >= since` (base de `Retry-After` del tope por actor) o `null`. */
  oldestActorAttemptAt(actorUserId: string, since: string): Promise<string | null>;
  /** Contador de `REQ-ESC6-034` (enfriamiento de 60 s): TODO intento de la escena con `started_at >= since`, con o sin llamada al proveedor (EDGE-009-030). */
  countAttemptsByScene(sceneId: string, since: string): Promise<number>;
  /**
   * Tope por actor de `REQ-ESC6-034` (3) (feature 009, `#60`, REQ-LIM9-002, INV-LIM9-001): intentos del actor con `started_at >= since` que SÍ llegaron a la llamada
   * (`provider_call_started_at IS NOT NULL`) MÁS los intentos en vuelo (`outcome IS NULL`, aún sin marca) mientras estén activos. Un intento cerrado sin llamada y las
   * filas heredadas sin marca no cuentan (EDGE-009-029). «Activo» lo acota `cancelStaleUnmarkedAttempts` (plazo único de 10 min, EDGE-009-041). Sin migración.
   */
  countAttemptsByActor(actorUserId: string, since: string): Promise<number>;
  /**
   * Tope de fallos de `REQ-ESC6-034` (2) (`H-KEY-F5-3`; feature 009, REQ-LIM9-001): intentos de la escena con `outcome = 'FAILED'` **y**
   * `provider_call_started_at IS NOT NULL` y `started_at >= since`; `oldestAt` es el menor `started_at` de esas filas (`null` si `count = 0`) y es la base de
   * `Retry-After` (`oldestAt + 24 h - now`). Tres fallos sin llamada a Vertex AI no bloquean 24 h. `countAttemptsByScene` queda para el enfriamiento de 60 s.
   */
  /**
   * Marcas de reinicio de limites (D9-31, T1315): `limits_reset_at` de la escena y la del actor (`null` = nunca reiniciada). `evaluateLimits` cuenta solo intentos con inicio estrictamente
   * posterior a `max(ahora - 24 h, marca)`. Solo lectura: las marcas las escribe `resetAdminAccountsSceneQuota`.
   */
  findLimitResetMarks(sceneId: string, actorUserId: string): Promise<{ readonly scene: string | null; readonly actor: string | null }>;
  countFailedAttemptsByScene(sceneId: string, since: string): Promise<{ readonly count: number; readonly oldestAt: string | null }>;
  /**
   * Tope diario de intentos CERRADOS sin llamada (EDGE-009-043, `D9-25`): intentos de la escena con `outcome` no nulo, `provider_call_started_at IS NULL` y
   * `started_at >= since`; `oldestAt` es el menor `started_at` (`null` si `count = 0`). Se evalúa con el código de `FAILED_LIMIT`.
   */
  countClosedWithoutCallByScene(sceneId: string, since: string): Promise<{ readonly count: number; readonly oldestAt: string | null }>;
  /**
   * Plazo único de 10 min del intento sin marca (EDGE-009-041, `P5-01` = B): cierra `CANCELLED` (sin llamada, `finished_at = now`) los intentos de la escena o del actor
   * sin `outcome` y sin `provider_call_started_at` con `started_at <= startedBefore`; si el intento era el vigente de su escena la libera (`run_state = NULL`, igual
   * que `closeAttempt` CANCELLED). Devuelve cuántos cerró. Idempotente; nunca toca intentos con marca.
   */
  cancelStaleUnmarkedAttempts(sceneId: string, actorUserId: string, startedBefore: string, now: string): Promise<number>;
  /** Arrastre de cuota (EDGE-ESC6-033): `UPSERT` con `consumed := max(valor previo, consumed)`. */
  upsertQuotaCarry(ownerUserId: string, quotaWindow: string, consumedGenerations: number): Promise<void>;
  findQuotaCarry(ownerUserId: string, quotaWindow: string): Promise<number | null>;
  /**
   * Mantenimiento diario (N2-11, SC-ESC6-095). Intentos terminales (`outcome` no nulo) con `finished_at < finishedBefore` que no sean el `current_attempt_id` de
   * una escena (la derivación del estado fallido lo lee); devuelve las filas borradas.
   */
  purgeTerminalAttempts(finishedBefore: string): Promise<number>;
  /** Pone a NULL `idempotency_key_hash` e `idempotency_expires_at` de los intentos con `idempotency_expires_at <= now` (las filas se conservan). */
  clearExpiredIdempotencyHashes(now: string): Promise<number>;
  /** Borra los arrastres de cuota de ventanas anteriores a `quotaWindow` (`YYYY-MM`, orden lexicográfico). */
  purgeQuotaCarryBefore(quotaWindow: string): Promise<number>;
  /** Foto del hogar (una por hogar): la conciliación diaria la lee para no encolar su objeto; T857 la escribe desde los casos de uso. */
  findHouseholdPhoto(householdId: string): Promise<HouseholdPhotoRecord | null>;
  /** Reemplaza (o crea) la foto del hogar. */
  putHouseholdPhoto(photo: HouseholdPhotoRecord): Promise<void>;

  // --- Ciclo de vida y privacidad (T862..T868): los ganchos de 002/004/005 solo escriben filas, en la transacción de la causa (plan.md §1.2, regla 1). ---
  /** Usuarios cuyos datos aportaron a la imagen vigente (`scene_image_sources`), sin duplicados y en orden ascendente. */
  findImageSources(sceneId: string): Promise<string[]>;
  /** Reemplaza completo el conjunto de fuentes de la imagen vigente (se vacía al retirarla). */
  replaceImageSources(sceneId: string, ownerUserIds: readonly string[]): Promise<void>;
  /** Retira la imagen vigente (`image_*` a NULL, `image_degraded` a 0) y vacía las fuentes; conserva cuota y estado. Devuelve el `image_id` retirado o `null` si no había. */
  retireImage(sceneId: string, now: string): Promise<string | null>;
  /** Cancela el intento en vuelo (`run_state = 'generating'`): intento `DONE`/`CANCELLED`, escena sin `run_state`; devuelve su `result_object_id` o `null` si no había intento en vuelo. */
  cancelInFlight(sceneId: string, now: string): Promise<{ readonly attemptId: string; readonly resultObjectId: string } | null>;
  /**
   * `D6-09` (EDGE-ESC6-030): la escena sin hogar del propietario pasa a ser la del hogar (`household_id := :h`, `owner_user_id := NULL`; imagen y cuota migran sin llamar a la IA).
   * Si el hogar ya tenía otra escena (sin imagen) se elimina y se conserva la migrada. Devuelve el id de la escena migrada o `null` si el propietario no tenía escena.
   */
  adoptOwnerScene(ownerUserId: string, householdId: string, now: string): Promise<string | null>;
  /** Sube `consumed_generations` a `max(actual, consumed)` solo si la escena está en esa ventana (arrastre de cuota, EDGE-ESC6-033). */
  raiseConsumed(sceneId: string, quotaWindow: string, consumed: number): Promise<void>;
  /** Borra la escena con sus intentos y fuentes (cascada); no toca la cola de borrado: la encola el gancho antes. */
  deleteScene(sceneId: string): Promise<void>;
  /** Borra la foto del hogar (idempotente). */
  deleteHouseholdPhoto(householdId: string): Promise<void>;
  /** Seudonimiza (HMAC) al usuario en `scene_image_sources.owner_user_id`, `household_photos.uploaded_by_user_id` y `scene_attempts.actor_user_id` (B10; REQ-ESC6-029). */
  pseudonymizeUser(userId: string, pseudonym: string): Promise<void>;
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
