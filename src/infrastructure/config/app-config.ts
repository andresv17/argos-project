/**
 * Configuración de la aplicación. Único lugar de `src/` que lee `process.env`
 * (INV-ARCH-006). Las variables se validan contra `APP_CONFIG_SCHEMA` (JSON Schema, Ajv) antes de convertirse.
 * - `PORT` 1–65535 (3100), `HOST` solo `127.0.0.1`, `DATABASE_PATH` no vacía (`./data/argos.sqlite`),
 *   `APP_TIMEZONE` zona IANA válida (`America/Bogota`, F6), `COOKIE_SECURE` `true` o `false` (`false`).
 * - Límites de frecuencia (ADR-002-12, T216): `EXPORT_MAX_PER_WINDOW` (5), `EXPORT_WINDOW_MINUTES` (15),
 *   `INVITE_MAX_PER_WINDOW` (20) e `INVITE_WINDOW_MINUTES` (15): enteros positivos de hasta 4 dígitos, sin ceros a la izquierda.
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
 * - `ARGOS_PG_POOL_MAX` (REQ-PG-010): entero 1..10 sin ceros a la izquierda (5).
 * - `ARGOS_SCHEDULER_EMAIL` y `ARGOS_OIDC_AUDIENCE` (REQ-SEC-007, D-A1): obligatorias con `postgres` (correo
 *   `*.iam.gserviceaccount.com`; URL `https:` sin credenciales ni espacios); `null` con sqlite o memory. El error nombra solo la variable.
 * - Una variable inválida produce `AppConfigError` con la lista de variables afectadas; no se arranca con valores
 *   por defecto silenciosos. Ningún valor es secreto (`.env.example`).
 *
 * @implements INV-ARCH-006, INV-ARCH-004, ERR-RATE-LIMITED, REQ-AUD-001, INV-AUD-001
 */

import { createHash } from 'node:crypto';
import { Ajv, type JSONSchemaType } from 'ajv';
import { DEFAULT_APP_TIMEZONE, isSupportedTimeZone } from '../adapters/system-clock.adapter.ts';

export interface AppConfig {
  readonly port: number;
  readonly host: '127.0.0.1' | '0.0.0.0';
  readonly databasePath: string;
  readonly appTimezone: string;
  readonly cookieSecure: boolean;
  readonly exportMaxPerWindow: number;
  readonly exportWindowMinutes: number;
  readonly inviteMaxPerWindow: number;
  readonly inviteWindowMinutes: number;
  /** Retención de la auditoría en días (ARGOS_AUDIT_RETENTION_DAYS, 730 = 24 meses). */
  readonly auditRetentionDays: number;
  /** Clave HMAC de auditoría en hexadecimal (>= 32 bytes) o null si falta con NODE_ENV=test. Es un secreto: no se registra. */
  readonly auditHmacSecret: string | null;
  /** Adaptador de persistencia (ARGOS_DB_DRIVER). */
  readonly dbDriver: 'sqlite' | 'postgres' | 'memory';
  /** Tamaño máximo del pool de PostgreSQL (ARGOS_PG_POOL_MAX, 1..10). */
  readonly pgPoolMax: number;
  /** Cuenta de servicio del Scheduler (ARGOS_SCHEDULER_EMAIL); obligatoria con postgres, null en otro driver. No se registra. */
  readonly schedulerEmail: string | null;
  /** Audiencia OIDC https (ARGOS_OIDC_AUDIENCE); obligatoria con postgres, null en otro driver. No se registra. */
  readonly oidcAudience: string | null;
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
  ARGOS_AUDIT_RETENTION_DAYS: string;
  ARGOS_DB_DRIVER: 'sqlite' | 'postgres' | 'memory';
  ARGOS_PG_POOL_MAX: string;
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
  ARGOS_AUDIT_RETENTION_DAYS: '730',
  ARGOS_DB_DRIVER: 'sqlite',
  ARGOS_PG_POOL_MAX: '5',
};

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
    ARGOS_AUDIT_RETENTION_DAYS: { type: 'string', pattern: POSITIVE_INTEGER },
    ARGOS_DB_DRIVER: { type: 'string', enum: ['sqlite', 'postgres', 'memory'] },
    ARGOS_PG_POOL_MAX: { type: 'string', pattern: '^(?:[1-9]|10)$' },
  },
  required: ['PORT', 'HOST', 'DATABASE_PATH', 'APP_TIMEZONE', 'COOKIE_SECURE', 'EXPORT_MAX_PER_WINDOW', 'EXPORT_WINDOW_MINUTES', 'INVITE_MAX_PER_WINDOW', 'INVITE_WINDOW_MINUTES', 'ARGOS_AUDIT_RETENTION_DAYS', 'ARGOS_DB_DRIVER', 'ARGOS_PG_POOL_MAX'],
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
function isValidSchedulerEmail(value: string | undefined): boolean {
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

const AUDIT_SECRET_NAME = 'ARGOS_AUDIT_HMAC_SECRET';
/** >= 32 bytes en hexadecimal: 64 o más caracteres hexadecimales, en número par. */
const AUDIT_SECRET_PATTERN = /^(?:[0-9a-fA-F]{2}){32,}$/;

const validateRawConfig = new Ajv({ allErrors: true }).compile(APP_CONFIG_SCHEMA);

/** Configuración inválida: `variables` lista las variables de entorno rechazadas. */
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
const STRICT_EMPTY_KEYS: ReadonlySet<string> = new Set(['HOST', 'ARGOS_DB_DRIVER', 'ARGOS_PG_POOL_MAX']);

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * Lee y valida la configuración. `env` por defecto es `process.env`; las pruebas pasan su propio objeto.
 * Una variable ausente o vacía toma su valor por defecto, salvo `HOST`, `ARGOS_DB_DRIVER` y `ARGOS_PG_POOL_MAX`
 * (solo la ausente toma el defecto; vacía se rechaza).
 * @implements INV-ARCH-006
 */
export function loadAppConfig(env: EnvironmentSource = process.env): AppConfig {
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
  const rawSecret = env[AUDIT_SECRET_NAME];
  const auditHmacSecret = rawSecret === undefined || rawSecret === '' ? null : rawSecret;
  const invalidSecret = auditHmacSecret === null ? env['NODE_ENV'] !== 'test' : !AUDIT_SECRET_PATTERN.test(auditHmacSecret) || (env['NODE_ENV'] !== 'test' && isKnownPublicAuditSecret(auditHmacSecret));
  if (invalid.size > 0 || invalidSecret || invalidDatabaseUrl || invalidSchedulerEmail || invalidOidcAudience) {
    throw new AppConfigError([...keys.filter((key) => invalid.has(key)), ...(invalidDatabaseUrl ? [DATABASE_URL_NAME] : []), ...(invalidSchedulerEmail ? [SCHEDULER_EMAIL_NAME] : []), ...(invalidOidcAudience ? [OIDC_AUDIENCE_NAME] : []), ...(invalidSecret ? [AUDIT_SECRET_NAME] : [])]);
  }
  return {
    port: Number(raw.PORT),
    host: raw.HOST as AppConfig['host'],
    databasePath: raw.DATABASE_PATH,
    appTimezone: raw.APP_TIMEZONE,
    cookieSecure: raw.COOKIE_SECURE === 'true',
    exportMaxPerWindow: Number(raw.EXPORT_MAX_PER_WINDOW),
    exportWindowMinutes: Number(raw.EXPORT_WINDOW_MINUTES),
    inviteMaxPerWindow: Number(raw.INVITE_MAX_PER_WINDOW),
    inviteWindowMinutes: Number(raw.INVITE_WINDOW_MINUTES),
    auditRetentionDays: Number(raw.ARGOS_AUDIT_RETENTION_DAYS),
    auditHmacSecret,
    dbDriver: raw.ARGOS_DB_DRIVER,
    pgPoolMax: Number(raw.ARGOS_PG_POOL_MAX),
    schedulerEmail: isPostgres ? env[SCHEDULER_EMAIL_NAME]! : null,
    oidcAudience: isPostgres ? env[OIDC_AUDIENCE_NAME]! : null,
  };
}
