/**
 * Configuración de la aplicación. Único lugar de `src/` que lee `process.env`
 * (INV-ARCH-006). Las variables se validan contra `APP_CONFIG_SCHEMA` (JSON Schema, Ajv) antes de convertirse.
 * - `PORT` 1–65535 (3100), `HOST` solo `127.0.0.1`, `DATABASE_PATH` no vacía (`./data/argos.sqlite`),
 *   `APP_TIMEZONE` zona IANA válida (`America/Bogota`, F6), `COOKIE_SECURE` `true` o `false` (`false`).
 * - Límites de frecuencia (ADR-002-12, T216): `EXPORT_MAX_PER_WINDOW` (5), `EXPORT_WINDOW_MINUTES` (15),
 *   `INVITE_MAX_PER_WINDOW` (20) e `INVITE_WINDOW_MINUTES` (15): enteros positivos de hasta 4 dígitos, sin ceros a la izquierda.
 * - Límite de duplicados de microchip (REQ-PET4-002, ADR-004-04, T556/T557): `MICROCHIP_DUPLICATE_MAX_PER_WINDOW` (5) y
 *   `MICROCHIP_DUPLICATE_WINDOW_MINUTES` (1440 = ventana deslizante de 24 h), con el mismo formato de entero que los anteriores.
 * - `ARGOS_AUDIT_RETENTION_DAYS` (REQ-AUD-001, INV-AUD-001): retención de la auditoría en días, entero positivo de hasta 4
 *   dígitos sin ceros a la izquierda (730 = 24 meses). Inválida: `AppConfigError` nombra solo la variable, no el valor.
 * - `ARGOS_AUDIT_HMAC_SECRET` (REQ-AUD-001, SC-014): clave HMAC de la seudonimización de la auditoría, >= 32 bytes en
 *   hexadecimal (64 o más caracteres, longitud par). Es obligatoria en cualquier entorno salvo `NODE_ENV=test` (D-1 de Neo);
 *   solo en pruebas puede faltar (`auditHmacSecret` nulo y el servidor usa la clave fija de prueba). Si está presente e
 *   inválida se rechaza en todo entorno. Su valor nunca aparece en el mensaje
 *   del error, en logs ni en excepciones: `AppConfigError` solo nombra la variable.
 * - `HOST` (REQ-CLD-003, D-26): `127.0.0.1` por defecto; `0.0.0.0` solo con `NODE_ENV=production` o `ARGOS_DB_DRIVER=postgres`.
 *   Solo la variable ausente toma el defecto: `HOST=""` se rechaza.
 * - `ARGOS_DB_DRIVER` (REQ-PG-010): `sqlite` (defecto), `postgres` o `memory` (solo con `NODE_ENV` test o staging).
 * - `DATABASE_URL` (REQ-CLD-005, REQ-SEC-003): obligatoria solo con `postgres`; URL `postgres:`/`postgresql:` con `sslmode=require`.
 *   Es un secreto: el error nombra solo la variable, nunca el valor.
 *   Con postgres sale en `AppConfig.databaseUrl` (único lector de `process.env`, T428); `null` con sqlite o memory.
 * - `ARGOS_PG_POOL_MAX` (REQ-PG-010): entero 1..10 sin ceros a la izquierda (5).
 * - `ARGOS_TRUST_PROXY_HOPS` (REQ-EDG10-001): entero 0..3 (defecto 1); vacía o inválida se rechaza nombrando solo la variable.
 * - `ARGOS_SCHEDULER_EMAIL` y `ARGOS_OIDC_AUDIENCE` (REQ-SEC-007, D-A1): obligatorias con `postgres` (correo
 *   `*.iam.gserviceaccount.com`; URL `https:` sin credenciales ni espacios); `null` con sqlite o memory. El error nombra solo la variable.
 * - Medios (T566, REQ-GCS-003, REQ-ARC-001, REQ-ARC-005, SC-ALM-023): `ARGOS_MEDIA_DRIVER` `gcs` o `memory` (`memory` por defecto; vacío se
 *   rechaza), `ARGOS_MEDIA_BUCKET` (obligatoria con `gcs`; nombre de bucket de GCS; `null` con `memory`),
 *   `ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS` 30–900 (300), `ARGOS_MEDIA_MAX_BYTES` 1–10485760 (10 MiB), `ARGOS_MEDIA_MAX_BYTES_PER_OWNER`
 *   entero positivo (1 GiB) y `ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS` 1–8 (4). Con `NODE_ENV=production` el driver debe ser `gcs` y
 *   el bucket obligatorio; el error nombra solo la variable.
 * - Escena del hogar (feature 006, T830, INV-ESC6-013, INV-ESC6-018; SC-ESC6-025/034/087/092): las 9 variables `ARGOS_SCENE_*` solo se leen aquí.
 *   `ARGOS_SCENE_DRIVER` `fake` (defecto), `gemini-api` (T891, REQ-ESC6-037, INV-ESC6-020: solo con `NODE_ENV` distinto de `production`, exige `GEMINI_API_KEY` de 20..256
 *   caracteres sin espacios ni saltos de línea y `ARGOS_SCENE_GEMINI_MODEL`; con `fake` o `real` ambas se ignoran; la clave nunca entra en un mensaje de error ni es enumerable) o `real`; `ARGOS_SCENE_MAX_PETS` 1–32 (8), `ARGOS_SCENE_QUOTA_MAX` 1–50 (10), `ARGOS_SCENE_GEN_TIMEOUT_SECONDS` 10–105 (90 = T_GEN),
 *   `ARGOS_SCENE_QUEUE` (`argos-scene`, identificador), y sin valor por defecto `ARGOS_SCENE_MODEL`, `ARGOS_SCENE_PROJECT_ID`, `ARGOS_SCENE_TASKS_SA_EMAIL` y
 *   `ARGOS_SCENE_WORKER_URL` (https, host `*.run.app`, ruta exacta `/internal/scene-worker`, sin consulta, fragmento, puerto ni credenciales). Con
 *   `NODE_ENV=production` se rechaza `fake`; `real` exige la constante de activación del código (`SCENE_REAL_DRIVER_ACTIVATED`, true desde T885), el modelo y el
 *   proyecto, y en producción además la cuenta de Cloud Tasks y la URL del worker. `T_LEASE = T_GEN + 60` y `T_QUEUE = 600` son constantes de código. Fase 14 (T948/T952,
 *   D6-22): `ARGOS_SCENE_LOCATION` (lista cerrada de regiones; obligatoria con `real`) y `ARGOS_SCENE_GLOBAL_QUOTA_MAX` (1..techo derivado de la tabla de costes aprobada, 5 por defecto; cuota GLOBAL mensual, N2-02) son el
 *   RESPALDO de las filas de `platform_parameters`, que prevalecen (`scene-provider-parameters.ts`). Con `real` el driver es Vertex AI por el metadata server (sin clave de API).
 *   El error nombra solo la variable, nunca el valor.
 * - Una variable inválida produce `AppConfigError` con la lista de variables afectadas; no se arranca con valores
 *   por defecto silenciosos. Ningún valor es secreto (`.env.example`).
 *
 * @implements INV-ARCH-006, INV-ARCH-004, ERR-RATE-LIMITED, REQ-AUD-001, INV-AUD-001
 */

import { createHash } from 'node:crypto';
import { Ajv, type JSONSchemaType } from 'ajv';
import { SCENE_DEFAULT_GLOBAL_QUOTA_MAX, isAllowedSceneLocation, parseSceneGlobalQuotaMax } from '../../domain/scene/provider-parameters.ts';
import { DEFAULT_APP_TIMEZONE, isSupportedTimeZone } from '../adapters/system-clock.adapter.ts';

export interface AppConfig {
  readonly port: number;
  readonly host: '127.0.0.1' | '0.0.0.0';
  readonly databasePath: string;
  readonly appTimezone: string;
  readonly cookieSecure: boolean;
  /** Base pública de los enlaces (`ARGOS_PUBLIC_BASE_URL`, REQ-TIP10-004, EDGE-010-012): origen http(s) sin barra final; `null` si no se definió (solo fuera de producción; con `NODE_ENV=production` es obligatoria, T1443). */
  readonly publicBaseUrl: string | null;
  readonly exportMaxPerWindow: number;
  readonly exportWindowMinutes: number;
  readonly inviteMaxPerWindow: number;
  readonly inviteWindowMinutes: number;
  readonly microchipDuplicateMaxPerWindow: number;
  readonly microchipDuplicateWindowMinutes: number;
  /** Retención de la auditoría en días (ARGOS_AUDIT_RETENTION_DAYS, 730 = 24 meses). */
  readonly auditRetentionDays: number;
  /** Clave HMAC de auditoría en hexadecimal (>= 32 bytes) o null si falta con NODE_ENV=test. Es un secreto: no se registra. */
  readonly auditHmacSecret: string | null;
  /** Adaptador de persistencia (ARGOS_DB_DRIVER). */
  readonly dbDriver: 'sqlite' | 'postgres' | 'memory';
  /** Tamaño máximo del pool de PostgreSQL (ARGOS_PG_POOL_MAX, 1..10). */
  readonly pgPoolMax: number;
  /** Saltos de proxy de confianza (`ARGOS_TRUST_PROXY_HOPS`, REQ-EDG10-001, D10-03): entero 0..3, defecto 1; `2` solo con Cloudflare activo. `trustProxy: true` está prohibido. */
  readonly trustProxyHops: 0 | 1 | 2 | 3;
  /** Cuenta de servicio del Scheduler (ARGOS_SCHEDULER_EMAIL); obligatoria con postgres, null en otro driver. No se registra. */
  readonly schedulerEmail: string | null;
  /** Audiencia OIDC https (ARGOS_OIDC_AUDIENCE); obligatoria con postgres, null en otro driver. No se registra. */
  readonly oidcAudience: string | null;
  /** DATABASE_URL ya validada (T428); obligatoria con postgres, null en otro driver. Es un secreto: no se registra. */
  readonly databaseUrl: string | null;
  /** Adaptador de medios (ARGOS_MEDIA_DRIVER): `gcs` en producción, `memory` en desarrollo y pruebas. */
  readonly mediaDriver: 'gcs' | 'memory';
  /** Bucket de medios (ARGOS_MEDIA_BUCKET); obligatorio con `gcs`, null con `memory`. */
  readonly mediaBucket: string | null;
  /** Caducidad de la URL firmada de lectura en segundos (30–900). */
  readonly mediaSignedUrlTtlSeconds: number;
  /** Tamaño máximo de un archivo en bytes (<= 10 MiB). */
  readonly mediaMaxBytes: number;
  /** Cuota en bytes por propietario legal. */
  readonly mediaMaxBytesPerOwner: number;
  /** Subidas simultáneas por instancia (1–8). */
  readonly mediaMaxConcurrentUploads: number;
  /** Escena del hogar (feature 006): las 9 variables `ARGOS_SCENE_*` ya validadas y las constantes derivadas de T_GEN. */
  readonly scene: SceneConfig;
  /** Acceso con Google (feature 008, REQ-SSO8-007): presente solo si las tres variables `GOOGLE_OAUTH_*` están definidas y son válidas; ausente = ruta desactivada (falla cerrado). */
  readonly google?: GoogleOAuthConfig;
  /** Administración de plataforma (feature 009, T1227, REQ-ADM9-003): lista cerrada de correos normalizados (minúsculas); vacía = nadie entra (falla cerrado). */
  readonly adminEmails: readonly string[];
}

/** @implements REQ-SSO8-007, NFR-008-004, INV-ARCH-006 */
/** Credenciales de Google OAuth (feature 008). El client id y la URI de redirección son parámetros públicos; el secreto es una propiedad NO enumerable (no sale en JSON, spread ni registros). */
export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly clientSecret: string;
}

/** Configuración de la escena (feature 006, plan §1.3). */
export interface SceneConfig {
  readonly driver: 'fake' | 'gemini-api' | 'real';
  readonly maxPets: number;
  readonly quotaMax: number;
  /** T_GEN en segundos (10–105). */
  readonly genTimeoutSeconds: number;
  /** T_LEASE = T_GEN + 60 s, contado desde el claim del worker. */
  readonly leaseSeconds: number;
  /** T_QUEUE = 600 s: espera máxima en cola antes del claim. */
  readonly queueWaitSeconds: number;
  readonly model: string | null;
  readonly queue: string;
  /** Cuenta `argos-scene-tasks` (`ARGOS_SCENE_TASKS_SA_EMAIL`); no se registra. */
  readonly tasksServiceAccountEmail: string | null;
  /** Destino y audiencia de la tarea (`ARGOS_SCENE_WORKER_URL`); solo de configuración (INV-ESC6-018). */
  readonly workerUrl: string | null;
  readonly projectId: string | null;
  /** Región de Vertex AI (`ARGOS_SCENE_LOCATION`, lista cerrada); `null` si no se definió. Respaldo de `platform_parameters` (T948). */
  readonly location: string | null;
  /** Cuota GLOBAL mensual de respaldo (`ARGOS_SCENE_GLOBAL_QUOTA_MAX`, 1..techo derivado de la tabla de costes (111); 5 por defecto): la fila de `platform_parameters` prevalece (N2-02 = A, T948). */
  readonly globalQuotaMax: number;
  /** Modelo del driver `gemini-api` (`ARGOS_SCENE_GEMINI_MODEL`); `null` con `fake` o `real`. */
  readonly geminiModel: string | null;
  /**
   * Clave del driver `gemini-api` (`GEMINI_API_KEY`); `null` con `fake` y, con `real`, si no se definio (proveedor `gemini-api` sin credenciales, D9-30). Propiedad NO enumerable (la definen `loadAppConfig`): no sale en `JSON.stringify`,
   * spread, `Object.entries` ni registros (REQ-ESC6-038, INV-ESC6-016). Solo se lee por nombre al construir el adaptador.
   */
  readonly geminiApiKey: string | null;
}

/** T_QUEUE (INV-ESC6-013): espera máxima en cola antes del claim del worker, en segundos. */
export const SCENE_QUEUE_WAIT_SECONDS = 600;
/**
 * Plazo único del intento de escena sin marca de llamada (feature 009, `#60`, EDGE-009-041, `P5-01` = B, ADR-009-16 (2)): a los 10 min de su inicio un intento sin `outcome`
 * ni `provider_call_started_at` deja de contar para `ACTOR_LIMIT` y se cierra `CANCELLED` sin llamada. No depende de `lease_expires_at`.
 */
export const SCENE_UNMARKED_ATTEMPT_TTL_SECONDS = 600;
/**
 * Tope diario de intentos cerrados sin llamada al proveedor por escena (feature 009, `#60`, EDGE-009-043, `D9-25` aprobado por Neo): 20 en 24 h, además del cooldown de
 * 60 s; responde con el código de `FAILED_LIMIT`. ÚNICA fuente del valor (el dominio lo recibe como dato).
 */
export const SCENE_MAX_CLOSED_WITHOUT_CALL_PER_DAY = 20;
/**
 * Tope de hogares ACTIVOS por persona (feature 011, `#74`, REQ-HOG11-004, INV-HOG11-001, D11-12 = B+C aprobado por Neo). ÚNICA fuente del valor (el dominio lo recibe como dato;
 * la interfaz lleva un espejo en `household-limit.ts`). Aplica al crear un hogar y al aceptar una invitación.
 */
export const MAX_HOUSEHOLDS_PER_USER = 5;
/**
 * Foto de perfil de la cuenta (feature 011, `#78`, REQ-PRF11-001, SC-011-061, INV-ARCH-006; anexo `user-avatar-annex.md` §4). ÚNICA fuente de los límites: 512 KiB, imagen cuadrada de 64..1024 px
 * y 10 subidas por hora y usuario (contador en memoria por instancia).
 */
export { USER_AVATAR_MAX_BYTES, USER_AVATAR_MIN_SIDE, USER_AVATAR_MAX_SIDE } from '../../domain/media/user-avatar-limits.ts';
export const USER_AVATAR_PUT_MAX_PER_WINDOW = 10;
export const USER_AVATAR_PUT_WINDOW_MINUTES = 60;
/** T_LEASE = T_GEN + 60 s (INV-ESC6-013; cumple T_LEASE >= T_GEN + 30 s). */
export const sceneLeaseSeconds = (genTimeoutSeconds: number): number => genTimeoutSeconds + 60;
/**
 * Constante de activación del driver real (REQ-ESC6-028, REQ-ESC6-031, N2-10): `true` desde la activación de T885 (Fase 14, D6-22; Vertex AI por el metadata server). Con
 * `false` (solo por `options.sceneRealDriverActivated` en pruebas) `ARGOS_SCENE_DRIVER=real` no arranca y, por tanto, `NODE_ENV=production` tampoco.
 */
export const SCENE_REAL_DRIVER_ACTIVATED: boolean = true;

/** Opciones de arranque; `sceneRealDriverActivated` permite a las pruebas fijar la constante de activación sin tocar el código. */
export interface LoadAppConfigOptions {
  readonly sceneRealDriverActivated?: boolean;
}

interface RawAppConfig {
  PORT: string;
  HOST: string;
  DATABASE_PATH: string;
  APP_TIMEZONE: string;
  COOKIE_SECURE: string;
  EXPORT_MAX_PER_WINDOW: string;
  EXPORT_WINDOW_MINUTES: string;
  INVITE_MAX_PER_WINDOW: string;
  INVITE_WINDOW_MINUTES: string;
  MICROCHIP_DUPLICATE_MAX_PER_WINDOW: string;
  MICROCHIP_DUPLICATE_WINDOW_MINUTES: string;
  ARGOS_AUDIT_RETENTION_DAYS: string;
  ARGOS_DB_DRIVER: 'sqlite' | 'postgres' | 'memory';
  ARGOS_PG_POOL_MAX: string;
  ARGOS_TRUST_PROXY_HOPS: string;
  ARGOS_MEDIA_DRIVER: 'gcs' | 'memory';
  ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: string;
  ARGOS_MEDIA_MAX_BYTES: string;
  ARGOS_MEDIA_MAX_BYTES_PER_OWNER: string;
  ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: string;
  ARGOS_SCENE_DRIVER: 'fake' | 'gemini-api' | 'real';
  ARGOS_SCENE_MAX_PETS: string;
  ARGOS_SCENE_QUOTA_MAX: string;
  ARGOS_SCENE_GEN_TIMEOUT_SECONDS: string;
  ARGOS_SCENE_QUEUE: string;
}

export const APP_CONFIG_DEFAULTS: Readonly<RawAppConfig> = {
  PORT: '3100',
  HOST: '127.0.0.1',
  DATABASE_PATH: './data/argos.sqlite',
  APP_TIMEZONE: DEFAULT_APP_TIMEZONE,
  COOKIE_SECURE: 'false',
  EXPORT_MAX_PER_WINDOW: '5',
  EXPORT_WINDOW_MINUTES: '15',
  INVITE_MAX_PER_WINDOW: '20',
  INVITE_WINDOW_MINUTES: '15',
  MICROCHIP_DUPLICATE_MAX_PER_WINDOW: '5',
  MICROCHIP_DUPLICATE_WINDOW_MINUTES: '1440',
  ARGOS_AUDIT_RETENTION_DAYS: '730',
  ARGOS_DB_DRIVER: 'sqlite',
  ARGOS_PG_POOL_MAX: '5',
  ARGOS_TRUST_PROXY_HOPS: '1',
  ARGOS_MEDIA_DRIVER: 'memory',
  ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: '300',
  ARGOS_MEDIA_MAX_BYTES: '10485760',
  ARGOS_MEDIA_MAX_BYTES_PER_OWNER: '1073741824',
  ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: '4',
  ARGOS_SCENE_DRIVER: 'fake',
  ARGOS_SCENE_MAX_PETS: '8',
  ARGOS_SCENE_QUOTA_MAX: '10',
  ARGOS_SCENE_GEN_TIMEOUT_SECONDS: '90',
  ARGOS_SCENE_QUEUE: 'argos-scene',
};

/** Tope duro de `ARGOS_MEDIA_MAX_BYTES` (REQ-ARC-001: 10 MiB). */
const MEDIA_MAX_BYTES_CEILING = 10485760;
const MEDIA_BUCKET_NAME = 'ARGOS_MEDIA_BUCKET';
const MEDIA_BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{1,62}$/;

const POSITIVE_INTEGER = '^[1-9][0-9]{0,3}$';

/** Esquema de las variables de entorno (todas llegan como texto). */
export const APP_CONFIG_SCHEMA: JSONSchemaType<RawAppConfig> = {
  type: 'object',
  properties: {
    PORT: { type: 'string', pattern: '^(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$' },
    HOST: { type: 'string', enum: ['127.0.0.1', '0.0.0.0'] },
    DATABASE_PATH: { type: 'string', minLength: 1, pattern: '\\S' },
    APP_TIMEZONE: { type: 'string', minLength: 1, pattern: '^[A-Za-z][A-Za-z0-9_+/-]*$' },
    COOKIE_SECURE: { type: 'string', enum: ['true', 'false'] },
    EXPORT_MAX_PER_WINDOW: { type: 'string', pattern: POSITIVE_INTEGER },
    EXPORT_WINDOW_MINUTES: { type: 'string', pattern: POSITIVE_INTEGER },
    INVITE_MAX_PER_WINDOW: { type: 'string', pattern: POSITIVE_INTEGER },
    INVITE_WINDOW_MINUTES: { type: 'string', pattern: POSITIVE_INTEGER },
    MICROCHIP_DUPLICATE_MAX_PER_WINDOW: { type: 'string', pattern: POSITIVE_INTEGER },
    MICROCHIP_DUPLICATE_WINDOW_MINUTES: { type: 'string', pattern: POSITIVE_INTEGER },
    ARGOS_AUDIT_RETENTION_DAYS: { type: 'string', pattern: POSITIVE_INTEGER },
    ARGOS_DB_DRIVER: { type: 'string', enum: ['sqlite', 'postgres', 'memory'] },
    ARGOS_PG_POOL_MAX: { type: 'string', pattern: '^(?:[1-9]|10)$' },
    ARGOS_TRUST_PROXY_HOPS: { type: 'string', pattern: '^[0-3]$' },
    ARGOS_MEDIA_DRIVER: { type: 'string', enum: ['gcs', 'memory'] },
    ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS: { type: 'string', pattern: '^(?:[3-9][0-9]|[1-8][0-9]{2}|900)$' },
    ARGOS_MEDIA_MAX_BYTES: { type: 'string', pattern: '^[1-9][0-9]{0,7}$' },
    ARGOS_MEDIA_MAX_BYTES_PER_OWNER: { type: 'string', pattern: '^[1-9][0-9]{0,12}$' },
    ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS: { type: 'string', pattern: '^[1-8]$' },
    ARGOS_SCENE_DRIVER: { type: 'string', enum: ['fake', 'gemini-api', 'real'] },
    ARGOS_SCENE_MAX_PETS: { type: 'string', pattern: '^(?:[1-9]|[12][0-9]|3[0-2])$' },
    ARGOS_SCENE_QUOTA_MAX: { type: 'string', pattern: '^(?:[1-9]|[1-4][0-9]|50)$' },
    ARGOS_SCENE_GEN_TIMEOUT_SECONDS: { type: 'string', pattern: '^(?:[1-9][0-9]|10[0-5])$' },
    ARGOS_SCENE_QUEUE: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,99}$' },
  },
  required: ['PORT', 'HOST', 'DATABASE_PATH', 'APP_TIMEZONE', 'COOKIE_SECURE', 'EXPORT_MAX_PER_WINDOW', 'EXPORT_WINDOW_MINUTES', 'INVITE_MAX_PER_WINDOW', 'INVITE_WINDOW_MINUTES', 'MICROCHIP_DUPLICATE_MAX_PER_WINDOW', 'MICROCHIP_DUPLICATE_WINDOW_MINUTES', 'ARGOS_AUDIT_RETENTION_DAYS', 'ARGOS_DB_DRIVER', 'ARGOS_PG_POOL_MAX', 'ARGOS_TRUST_PROXY_HOPS', 'ARGOS_MEDIA_DRIVER', 'ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS', 'ARGOS_MEDIA_MAX_BYTES', 'ARGOS_MEDIA_MAX_BYTES_PER_OWNER', 'ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS', 'ARGOS_SCENE_DRIVER', 'ARGOS_SCENE_MAX_PETS', 'ARGOS_SCENE_QUOTA_MAX', 'ARGOS_SCENE_GEN_TIMEOUT_SECONDS', 'ARGOS_SCENE_QUEUE'],
  additionalProperties: false,
};

const DATABASE_URL_NAME = 'DATABASE_URL';

/** DATABASE_URL válida para PostgreSQL: URL `postgres:`/`postgresql:` con `sslmode=require`. No lanza ni devuelve el valor. */
function isValidDatabaseUrl(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.searchParams.get('sslmode') === 'require';
  } catch {
    return false;
  }
}

const SCHEDULER_EMAIL_NAME = 'ARGOS_SCHEDULER_EMAIL';
const OIDC_AUDIENCE_NAME = 'ARGOS_OIDC_AUDIENCE';
const SCHEDULER_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/;

/** Correo de cuenta de servicio (`*.iam.gserviceaccount.com`, sin espacios). Nunca devuelve el valor. */
export function isValidSchedulerEmail(value: string | undefined): boolean {
  return value !== undefined && SCHEDULER_EMAIL_PATTERN.test(value);
}

/** URL `https:` sin credenciales, con host y sin espacios. Nunca devuelve el valor. */
function isValidOidcAudience(value: string | undefined): boolean {
  if (value === undefined || value === '' || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

const SCENE_MODEL_NAME = 'ARGOS_SCENE_MODEL';
const SCENE_PROJECT_NAME = 'ARGOS_SCENE_PROJECT_ID';
const SCENE_TASKS_SA_NAME = 'ARGOS_SCENE_TASKS_SA_EMAIL';
const SCENE_WORKER_URL_NAME = 'ARGOS_SCENE_WORKER_URL';
const SCENE_LOCATION_NAME = 'ARGOS_SCENE_LOCATION';
const SCENE_GLOBAL_QUOTA_NAME = 'ARGOS_SCENE_GLOBAL_QUOTA_MAX';
const GEMINI_API_KEY_NAME = 'GEMINI_API_KEY';
const PUBLIC_BASE_URL_NAME = 'ARGOS_PUBLIC_BASE_URL';
/** Origen http(s) sin ruta, consulta, fragmento ni credenciales; se tolera una barra final. */
function normalizePublicBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/' || /[?#]/.test(value)) return null;
    return url.origin;
  } catch {
    return null;
  }
}
const GEMINI_MODEL_NAME = 'ARGOS_SCENE_GEMINI_MODEL';
/** Clave de la Developer API: sin patrón de formato del proveedor; 20..256 caracteres visibles (sin espacios ni saltos de línea: evita inyectar cabeceras). */
const GEMINI_API_KEY_PATTERN = /^[\x21-\x7e]{20,256}$/;
/** Modelo del driver `gemini-api`: empieza por `gemini-`, sin `/`, `?`, `..` ni espacios (se interpola en la URL constante del proveedor, INV-ESC6-018). */
const GEMINI_MODEL_PATTERN = /^gemini-[A-Za-z0-9][A-Za-z0-9._-]{0,56}$/;
const isValidGeminiModel = (value: string): boolean => GEMINI_MODEL_PATTERN.test(value) && !value.includes('..');
/** Modelo del proveedor: identificador sin `/`, `?`, `..` ni espacios (se interpola en la URL del proveedor, INV-ESC6-018). */
const SCENE_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** Identificador de proyecto de Google Cloud. */
const SCENE_PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SCENE_WORKER_HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.run\.app$/;
const SCENE_WORKER_PATH = '/internal/scene-worker';
const SCENE_QUEUE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
/** Nombre de cola de Cloud Tasks (mismo patrón que `ARGOS_SCENE_QUEUE`). */
export const isValidSceneQueue = (value: string): boolean => SCENE_QUEUE_PATTERN.test(value);

const isValidSceneModel = (value: string): boolean => SCENE_MODEL_PATTERN.test(value) && !value.includes('..');
export const isValidSceneProject = (value: string): boolean => SCENE_PROJECT_PATTERN.test(value) && !value.includes('..');

/** URL del worker: `https`, host `*.run.app`, ruta exacta, sin consulta, fragmento, puerto ni credenciales (INV-ESC6-018). Nunca devuelve el valor. */
export function isValidSceneWorkerUrl(value: string): boolean {
  if (/[\s?#]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.port === '' && url.pathname === SCENE_WORKER_PATH && SCENE_WORKER_HOST_PATTERN.test(url.hostname);
  } catch {
    return false;
  }
}

const GOOGLE_CLIENT_ID_NAME = 'GOOGLE_OAUTH_CLIENT_ID';
const GOOGLE_CLIENT_SECRET_NAME = 'GOOGLE_OAUTH_CLIENT_SECRET';
const GOOGLE_REDIRECT_URI_NAME = 'GOOGLE_OAUTH_REDIRECT_URI';
/** Identificador o secreto de OAuth: visible, sin espacios ni comas (misma guardia que el despliegue). */
const GOOGLE_OAUTH_VALUE_PATTERN = /^[\x21-\x7e]{1,512}$/;

/** URI de redirección fija por entorno: `https` (o `http` solo hacia localhost/127.0.0.1 en desarrollo), sin credenciales, consulta ni fragmento, sin espacios ni comas. Nunca devuelve el valor. */
export function isValidGoogleRedirectUri(value: string): boolean {
  if (/[\s,?#]/.test(value) || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return (url.protocol === 'https:' || (url.protocol === 'http:' && local)) && url.hostname !== '' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

const AUDIT_SECRET_NAME = 'ARGOS_AUDIT_HMAC_SECRET';
/** >= 32 bytes en hexadecimal: 64 o más caracteres hexadecimales, en número par. */
const AUDIT_SECRET_PATTERN = /^(?:[0-9a-fA-F]{2}){32,}$/;

const validateRawConfig = new Ajv({ allErrors: true }).compile(APP_CONFIG_SCHEMA);

/** Configuración inválida: `variables` lista las variables de entorno rechazadas. */
/** Variable de la lista cerrada de administradores de plataforma (feature 009, T1227). Solo se lee aquí (INV-ARCH-006). */
export const ADMIN_EMAILS_NAME = 'ARGOS_ADMIN_EMAILS';

/**
 * Administradores delegados de `/admin` (feature 011, REQ-ADM11-001, D11-03 = B+A, H-1; INV-ARCH-006: viven SOLO aquí y los lee la capa de aplicación por inyección).
 * - `ADMIN_DELEGATE_ACTIVE_LIMIT`: tope de delegados vigentes (`ACTIVE` + `INVITED` no caducadas).
 * - `ADMIN_DELEGATE_INVITATION_TTL_HOURS`: caducidad de la invitación (`invited_expires_at = invited_at + 72 h`).
 * - `ADMIN_DELEGATE_ROW_LIMIT`: tope de filas totales de la tabla (incluidas `DISABLED`); mismo código de error que el tope de vigentes.
 *
 * @implements REQ-ADM11-001, INV-ARCH-006
 */
export const ADMIN_DELEGATE_ACTIVE_LIMIT = 20;
export const ADMIN_DELEGATE_INVITATION_TTL_HOURS = 72;
export const ADMIN_DELEGATE_ROW_LIMIT = 100;
/**
 * Retención de delegados `DISABLED` (D-1, aprobada por Neo, Logos iter 228): al vencer los 365 días se anonimizan correo y `sub`. La purga automática NO existe aún: DEUDA-011-PURGA-DELEGADOS (fuera de #63).
 * @implements REQ-ADM11-001, INV-ARCH-006
 */
export const ADMIN_DELEGATE_DISABLED_RETENTION_DAYS = 365;
/**
 * Retención de invitaciones caducadas (D-2, aprobada por Neo, Logos iter 228): días tras la caducidad de las 72 h; al vencer se purga la fila `INVITED` caducada. Purga pendiente: DEUDA-011-PURGA-DELEGADOS (fuera de #63).
 * @implements REQ-ADM11-001, INV-ARCH-006
 */
export const ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS = 30;
/** Ruta fija del callback de administración (009-A, (c)): nunca derivada de `Host`. */
export const ADMIN_GOOGLE_CALLBACK_PATH = '/api/admin/auth/google/callback';
/**
 * Límite de fallos del flujo de Google de administración por IP efectiva (feature 009, T1234, EDGE-009-035, D9-25 aprobado por Neo, ADR-009-15): al llegar a `maxFailures` fallos del
 * callback en `windowMinutes`, el inicio y el callback de esa IP responden `429` con `Retry-After` hasta que expire la ventana. Solo aquí viven los números (INV-ARCH-006).
 */
export const ADMIN_ACCESS_LIMIT = { maxFailures: 10, windowMinutes: 15 } as const;
/**
 * Tope de INICIOS del flujo de Google de administración por IP efectiva (feature 009, decisión O-2 de Neo): `maxStarts` inicios en `windowMinutes`; el siguiente responde `429`
 * `ERR-ADMIN-RATE-LIMITED` con `Retry-After`. Independiente del límite de fallos. Solo aquí viven los números (INV-ARCH-006).
 */
export const ADMIN_START_LIMIT = { maxStarts: 20, windowMinutes: 15 } as const;
/**
 * Límite de registros NUEVOS por IP efectiva (feature 009, T1289, EDGE-009-040, REQ-APR9-002, D9-25 aprobado por Neo, ADR-009-15): `maxNewAccounts` cuentas creadas en `windowMinutes`
 * (24 h); la siguiente responde `429` `ERR-ACCOUNT-REGISTRATION-RATE-LIMITED` con `Retry-After`, sin crear fila. Aplica al registro con contraseña y al primer acceso con Google
 * (elegir username). Solo aquí viven los números (INV-ARCH-006).
 */
export const REGISTRATION_LIMIT = { maxNewAccounts: 5, windowMinutes: 24 * 60 } as const;
/**
 * Umbral de aviso de solicitudes `PENDING` (feature 009, T1289, EDGE-009-040, REQ-APR9-005, D9-25 aprobado por Neo): con MÁS de este número el operador recibe el aviso (el contador
 * de `/admin` lo muestra; T1247/T1250 lo conectan). Solo aquí vive el número (INV-ARCH-006).
 */
export const PENDING_WARNING_THRESHOLD = 50;
const ADMIN_EMAIL_MAX_LENGTH = 254;
const ADMIN_EMAIL_LOCAL_MAX_LENGTH = 64;
const ADMIN_EMAIL_PATTERN = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

/** Formato de correo de administración: ASCII, sin espacios ni comas, longitud acotada. Nunca devuelve ni registra el valor. */
export function isValidAdminEmail(value: string): boolean {
  if (value.length === 0 || value.length > ADMIN_EMAIL_MAX_LENGTH) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at > ADMIN_EMAIL_LOCAL_MAX_LENGTH) return false;
  return ADMIN_EMAIL_PATTERN.test(value);
}

/** Lee `ARGOS_ADMIN_EMAILS` (separada por comas): recorta, normaliza a minúsculas, rechaza vacíos, duplicados y formatos inválidos. Ausente o vacía = lista vacía. */
export function parseAdminEmails(raw: string | undefined): { ok: true; emails: string[] } | { ok: false } {
  if (raw === undefined || raw.trim() === '') return { ok: true, emails: [] };
  const parts = raw.split(',').map((part) => part.trim().toLowerCase());
  if (parts.some((part) => !isValidAdminEmail(part))) return { ok: false };
  if (new Set(parts).size !== parts.length) return { ok: false };
  return { ok: true, emails: parts };
}

export class AppConfigError extends Error {
  constructor(public readonly variables: readonly string[]) {
    super(`Configuración inválida: ${variables.join(', ')}. Revisa .env.example.`);
    this.name = 'AppConfigError';
  }
}

/**
 * Clave fija de desarrollo y pruebas (REQ-AUD-001: «en desarrollo y pruebas se admite un valor fijo de prueba explícito»).
 * Solo se usa cuando `ARGOS_AUDIT_HMAC_SECRET` falta con `NODE_ENV=test`; en cualquier otro entorno la configuración exige la variable.
 */
export const DEVELOPMENT_AUDIT_HMAC_SECRET = 'de'.repeat(32);

/**
 * Denylist de secretos públicos (REQ-AUD-001, INV-AUD-001, SC-014): fuera de `NODE_ENV=test` se rechazan el secreto de los
 * fixtures de prueba (comparado por huella SHA-256, sin copiar el valor en claro) y la clave fija de desarrollo.
 */
const FIXTURE_AUDIT_SECRET_SHA256 = 'eaa93b9fcd229b8446cacff0a963d1afe33fa3fd3b6f63343c3227c987f6c592';

function isKnownPublicAuditSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === DEVELOPMENT_AUDIT_HMAC_SECRET || createHash('sha256').update(normalized).digest('hex') === FIXTURE_AUDIT_SECRET_SHA256;
}

/** Variables cuyo valor vacío explícito no equivale a «ausente» (D-26 y T409). */
const STRICT_EMPTY_KEYS: ReadonlySet<string> = new Set(['HOST', 'ARGOS_DB_DRIVER', 'ARGOS_PG_POOL_MAX', 'ARGOS_TRUST_PROXY_HOPS', 'ARGOS_MEDIA_DRIVER']);

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * Lee y valida la configuración. `env` por defecto es `process.env`; las pruebas pasan su propio objeto.
 * Una variable ausente o vacía toma su valor por defecto, salvo `HOST`, `ARGOS_DB_DRIVER` y `ARGOS_PG_POOL_MAX`
 * (solo la ausente toma el defecto; vacía se rechaza).
 * @implements INV-ARCH-006
 */
export function loadAppConfig(env: EnvironmentSource = process.env, options: LoadAppConfigOptions = {}): AppConfig {
  const keys = Object.keys(APP_CONFIG_DEFAULTS) as Array<keyof RawAppConfig>;
  const raw = Object.fromEntries(keys.map((key) => [key, env[key] === undefined || (env[key] === '' && !STRICT_EMPTY_KEYS.has(key)) ? APP_CONFIG_DEFAULTS[key] : env[key]])) as unknown as RawAppConfig;
  const invalid = new Set<string>();
  if (!validateRawConfig(raw)) {
    for (const error of validateRawConfig.errors ?? []) invalid.add(error.instancePath.replace(/^\//, ''));
  }
  if (!invalid.has('APP_TIMEZONE') && !isSupportedTimeZone(raw.APP_TIMEZONE)) invalid.add('APP_TIMEZONE');
  const nodeEnv = env['NODE_ENV'];
  if (!invalid.has('HOST') && raw.HOST === '0.0.0.0' && nodeEnv !== 'production' && raw.ARGOS_DB_DRIVER !== 'postgres') invalid.add('HOST');
  if (!invalid.has('ARGOS_DB_DRIVER') && raw.ARGOS_DB_DRIVER === 'memory' && nodeEnv !== 'test' && nodeEnv !== 'staging') invalid.add('ARGOS_DB_DRIVER');
  const invalidDatabaseUrl = raw.ARGOS_DB_DRIVER === 'postgres' && !isValidDatabaseUrl(env[DATABASE_URL_NAME]);
  const isPostgres = raw.ARGOS_DB_DRIVER === 'postgres';
  const invalidSchedulerEmail = isPostgres && !isValidSchedulerEmail(env[SCHEDULER_EMAIL_NAME]);
  const invalidOidcAudience = isPostgres && !isValidOidcAudience(env[OIDC_AUDIENCE_NAME]);
  if (!invalid.has('ARGOS_MEDIA_MAX_BYTES') && Number(raw.ARGOS_MEDIA_MAX_BYTES) > MEDIA_MAX_BYTES_CEILING) invalid.add('ARGOS_MEDIA_MAX_BYTES');
  if (nodeEnv === 'production' && !invalid.has('ARGOS_MEDIA_DRIVER') && raw.ARGOS_MEDIA_DRIVER !== 'gcs') invalid.add('ARGOS_MEDIA_DRIVER');
  const mediaBucketValue = env[MEDIA_BUCKET_NAME];
  const invalidMediaBucket = raw.ARGOS_MEDIA_DRIVER === 'gcs' && (mediaBucketValue === undefined || !MEDIA_BUCKET_PATTERN.test(mediaBucketValue));
  const present = (name: string): string | undefined => (env[name] === undefined || env[name] === '' ? undefined : env[name]);
  const sceneInvalid: string[] = [];
  const sceneActivated = options.sceneRealDriverActivated ?? SCENE_REAL_DRIVER_ACTIVATED;
  const sceneIsReal = raw.ARGOS_SCENE_DRIVER === 'real';
  const sceneIsGemini = raw.ARGOS_SCENE_DRIVER === 'gemini-api';
  const production = nodeEnv === 'production';
  if (!invalid.has('ARGOS_SCENE_DRIVER') && ((production && !sceneIsReal) || (sceneIsReal && !sceneActivated))) invalid.add('ARGOS_SCENE_DRIVER');
  const sceneModel = present(SCENE_MODEL_NAME);
  const sceneProject = present(SCENE_PROJECT_NAME);
  const sceneTasksSa = present(SCENE_TASKS_SA_NAME);
  const sceneWorkerUrl = present(SCENE_WORKER_URL_NAME);
  const needsRealSettings = sceneIsReal && sceneActivated;
  const geminiKey = present(GEMINI_API_KEY_NAME);
  const geminiModel = present(GEMINI_MODEL_NAME);
  const geminiActive = sceneIsGemini && !production;
  // T1314 (D9-30 (3)(8)): con `real` (Vertex, produccion incluida) `GEMINI_API_KEY` es OPCIONAL: si esta presente y es valida compone el proveedor `gemini-api` seleccionable desde /admin; si esta
  // presente e invalida rechaza el arranque (solo el nombre). Ausente = el proveedor `gemini-api` no tiene credenciales (falla cerrado).
  const geminiRouted = sceneIsReal && sceneActivated && geminiKey !== undefined;
  if ((geminiActive || geminiRouted) && (geminiKey === undefined || !GEMINI_API_KEY_PATTERN.test(geminiKey))) sceneInvalid.push(GEMINI_API_KEY_NAME);
  if (geminiActive && (geminiModel === undefined || !isValidGeminiModel(geminiModel))) sceneInvalid.push(GEMINI_MODEL_NAME);
  if (sceneModel === undefined ? needsRealSettings : !isValidSceneModel(sceneModel)) sceneInvalid.push(SCENE_MODEL_NAME);
  const sceneLocation = present(SCENE_LOCATION_NAME);
  const sceneGlobalQuota = present(SCENE_GLOBAL_QUOTA_NAME);
  if (sceneLocation === undefined ? needsRealSettings : !isAllowedSceneLocation(sceneLocation)) sceneInvalid.push(SCENE_LOCATION_NAME);
  if (sceneGlobalQuota !== undefined && parseSceneGlobalQuotaMax(sceneGlobalQuota) === null) sceneInvalid.push(SCENE_GLOBAL_QUOTA_NAME);
  if (sceneProject === undefined ? needsRealSettings || (production && sceneIsReal) : !isValidSceneProject(sceneProject)) sceneInvalid.push(SCENE_PROJECT_NAME);
  if (sceneTasksSa === undefined ? production && needsRealSettings : !isValidSchedulerEmail(sceneTasksSa)) sceneInvalid.push(SCENE_TASKS_SA_NAME);
  if (sceneWorkerUrl === undefined ? production && needsRealSettings : !isValidSceneWorkerUrl(sceneWorkerUrl)) sceneInvalid.push(SCENE_WORKER_URL_NAME);
  // N2-07 = A (T870, SC-ESC6-087): audiencia y correo PROPIOS por ruta; la cuenta de la cola no es la del Planificador y la URL del worker no es la audiencia de mantenimiento.
  const sameAudience = (a: string, b: string): boolean => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
  const tasksEmailClash = sceneTasksSa !== undefined && isPostgres && env[SCHEDULER_EMAIL_NAME] === sceneTasksSa;
  const audienceClash = sceneWorkerUrl !== undefined && isPostgres && env[OIDC_AUDIENCE_NAME] !== undefined && sameAudience(sceneWorkerUrl, env[OIDC_AUDIENCE_NAME]);
  if (tasksEmailClash && !sceneInvalid.includes(SCENE_TASKS_SA_NAME)) sceneInvalid.push(SCENE_TASKS_SA_NAME);
  if (audienceClash && !sceneInvalid.includes(SCENE_WORKER_URL_NAME)) sceneInvalid.push(SCENE_WORKER_URL_NAME);
  // 008 (REQ-SSO8-007): las tres variables o ninguna. Solo se nombran las variables rechazadas, nunca sus valores.
  const googleId = present(GOOGLE_CLIENT_ID_NAME);
  const googleSecret = present(GOOGLE_CLIENT_SECRET_NAME);
  const googleRedirect = present(GOOGLE_REDIRECT_URI_NAME);
  const googleInvalid: string[] = [];
  if (googleId !== undefined || googleSecret !== undefined || googleRedirect !== undefined) {
    if (googleId === undefined || !GOOGLE_OAUTH_VALUE_PATTERN.test(googleId) || googleId.includes(',')) googleInvalid.push(GOOGLE_CLIENT_ID_NAME);
    if (googleSecret === undefined || !GOOGLE_OAUTH_VALUE_PATTERN.test(googleSecret) || googleSecret.includes(',')) googleInvalid.push(GOOGLE_CLIENT_SECRET_NAME);
    if (googleRedirect === undefined || !isValidGoogleRedirectUri(googleRedirect)) googleInvalid.push(GOOGLE_REDIRECT_URI_NAME);
  }
  // 009 (T1227, REQ-ADM9-003): lista cerrada de administración; un valor inválido rechaza el arranque nombrando solo la variable.
  const adminParsed = parseAdminEmails(env[ADMIN_EMAILS_NAME]);
  // 011 (F-03, H-2b, EDGE-011-011): con NODE_ENV=production la lista raíz NO puede estar vacía (siempre hay al menos un SUPER_ADMIN raíz); en desarrollo y pruebas se permite vacía.
  const adminInvalid = !adminParsed.ok || (env['NODE_ENV'] === 'production' && adminParsed.emails.length === 0);
  const publicBaseRaw = present(PUBLIC_BASE_URL_NAME);
  const publicBaseUrl = publicBaseRaw === undefined ? null : normalizePublicBaseUrl(publicBaseRaw);
  // T1443 (EDGE-010-003, decisión de Neo): con NODE_ENV=production la base es OBLIGATORIA (falla cerrado); en desarrollo el servidor usa http://127.0.0.1:<port>.
  const invalidPublicBase = publicBaseRaw === undefined ? env['NODE_ENV'] === 'production' : publicBaseUrl === null;
  const rawSecret = env[AUDIT_SECRET_NAME];
  const auditHmacSecret = rawSecret === undefined || rawSecret === '' ? null : rawSecret;
  const invalidSecret = auditHmacSecret === null ? env['NODE_ENV'] !== 'test' : !AUDIT_SECRET_PATTERN.test(auditHmacSecret) || (env['NODE_ENV'] !== 'test' && isKnownPublicAuditSecret(auditHmacSecret));
  if (invalid.size > 0 || sceneInvalid.length > 0 || googleInvalid.length > 0 || adminInvalid || invalidMediaBucket || invalidSecret || invalidDatabaseUrl || invalidSchedulerEmail || invalidOidcAudience || invalidPublicBase) {
    throw new AppConfigError([...keys.filter((key) => invalid.has(key)), ...(invalidDatabaseUrl ? [DATABASE_URL_NAME] : []), ...(invalidSchedulerEmail ? [SCHEDULER_EMAIL_NAME] : []), ...(invalidOidcAudience ? [OIDC_AUDIENCE_NAME] : []), ...(invalidMediaBucket ? [MEDIA_BUCKET_NAME] : []), ...sceneInvalid, ...googleInvalid, ...(adminInvalid ? [ADMIN_EMAILS_NAME] : []), ...(invalidPublicBase ? [PUBLIC_BASE_URL_NAME] : []), ...(invalidSecret ? [AUDIT_SECRET_NAME] : [])]);
  }
  const scene: SceneConfig = Object.defineProperty(
    {
      driver: raw.ARGOS_SCENE_DRIVER,
      maxPets: Number(raw.ARGOS_SCENE_MAX_PETS),
      quotaMax: Number(raw.ARGOS_SCENE_QUOTA_MAX),
      genTimeoutSeconds: Number(raw.ARGOS_SCENE_GEN_TIMEOUT_SECONDS),
      leaseSeconds: sceneLeaseSeconds(Number(raw.ARGOS_SCENE_GEN_TIMEOUT_SECONDS)),
      queueWaitSeconds: SCENE_QUEUE_WAIT_SECONDS,
      model: sceneModel ?? null,
      queue: raw.ARGOS_SCENE_QUEUE,
      tasksServiceAccountEmail: sceneTasksSa ?? null,
      workerUrl: sceneWorkerUrl ?? null,
      projectId: sceneProject ?? null,
      location: sceneLocation ?? null,
      globalQuotaMax: sceneGlobalQuota === undefined ? SCENE_DEFAULT_GLOBAL_QUOTA_MAX : (parseSceneGlobalQuotaMax(sceneGlobalQuota) ?? SCENE_DEFAULT_GLOBAL_QUOTA_MAX),
      geminiModel: geminiActive ? geminiModel! : null,
    },
    'geminiApiKey',
    { value: geminiActive || geminiRouted ? geminiKey! : null, enumerable: false, writable: false, configurable: false },
  ) as SceneConfig;
  return {
    port: Number(raw.PORT),
    host: raw.HOST as AppConfig['host'],
    databasePath: raw.DATABASE_PATH,
    appTimezone: raw.APP_TIMEZONE,
    cookieSecure: raw.COOKIE_SECURE === 'true',
    publicBaseUrl,
    exportMaxPerWindow: Number(raw.EXPORT_MAX_PER_WINDOW),
    exportWindowMinutes: Number(raw.EXPORT_WINDOW_MINUTES),
    inviteMaxPerWindow: Number(raw.INVITE_MAX_PER_WINDOW),
    inviteWindowMinutes: Number(raw.INVITE_WINDOW_MINUTES),
    microchipDuplicateMaxPerWindow: Number(raw.MICROCHIP_DUPLICATE_MAX_PER_WINDOW),
    microchipDuplicateWindowMinutes: Number(raw.MICROCHIP_DUPLICATE_WINDOW_MINUTES),
    auditRetentionDays: Number(raw.ARGOS_AUDIT_RETENTION_DAYS),
    auditHmacSecret,
    dbDriver: raw.ARGOS_DB_DRIVER,
    pgPoolMax: Number(raw.ARGOS_PG_POOL_MAX),
    trustProxyHops: Number(raw.ARGOS_TRUST_PROXY_HOPS) as AppConfig['trustProxyHops'],
    schedulerEmail: isPostgres ? env[SCHEDULER_EMAIL_NAME]! : null,
    oidcAudience: isPostgres ? env[OIDC_AUDIENCE_NAME]! : null,
    databaseUrl: isPostgres ? env[DATABASE_URL_NAME]! : null,
    mediaDriver: raw.ARGOS_MEDIA_DRIVER,
    mediaBucket: raw.ARGOS_MEDIA_DRIVER === 'gcs' ? mediaBucketValue! : null,
    mediaSignedUrlTtlSeconds: Number(raw.ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS),
    mediaMaxBytes: Number(raw.ARGOS_MEDIA_MAX_BYTES),
    mediaMaxBytesPerOwner: Number(raw.ARGOS_MEDIA_MAX_BYTES_PER_OWNER),
    mediaMaxConcurrentUploads: Number(raw.ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS),
    scene,
    adminEmails: adminParsed.ok ? adminParsed.emails : [],
    ...(googleId === undefined || googleSecret === undefined || googleRedirect === undefined
      ? {}
      : { google: Object.defineProperty({ clientId: googleId, redirectUri: googleRedirect }, 'clientSecret', { value: googleSecret, enumerable: false, writable: false, configurable: false }) as GoogleOAuthConfig }),
  };
}
