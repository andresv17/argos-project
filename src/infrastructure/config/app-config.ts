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
 *   hexadecimal (64 o más caracteres, longitud par). Con `NODE_ENV=production` es obligatoria; fuera de producción puede
 *   faltar (`auditHmacSecret` nulo), pero si está presente e inválida se rechaza. Su valor nunca aparece en el mensaje
 *   del error, en logs ni en excepciones: `AppConfigError` solo nombra la variable.
 * - Una variable inválida produce `AppConfigError` con la lista de variables afectadas; no se arranca con valores
 *   por defecto silenciosos. Ningún valor es secreto (`.env.example`).
 *
 * @implements INV-ARCH-006, INV-ARCH-004, ERR-RATE-LIMITED, REQ-AUD-001, INV-AUD-001
 */

import { Ajv, type JSONSchemaType } from 'ajv';
import { DEFAULT_APP_TIMEZONE, isSupportedTimeZone } from '../adapters/system-clock.adapter.ts';

export interface AppConfig {
  readonly port: number;
  readonly host: '127.0.0.1';
  readonly databasePath: string;
  readonly appTimezone: string;
  readonly cookieSecure: boolean;
  readonly exportMaxPerWindow: number;
  readonly exportWindowMinutes: number;
  readonly inviteMaxPerWindow: number;
  readonly inviteWindowMinutes: number;
  /** Retención de la auditoría en días (ARGOS_AUDIT_RETENTION_DAYS, 730 = 24 meses). */
  readonly auditRetentionDays: number;
  /** Clave HMAC de auditoría en hexadecimal (>= 32 bytes) o null si falta fuera de producción. Es un secreto: no se registra. */
  readonly auditHmacSecret: string | null;
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
};

const POSITIVE_INTEGER = '^[1-9][0-9]{0,3}$';

/** Esquema de las variables de entorno (todas llegan como texto). */
export const APP_CONFIG_SCHEMA: JSONSchemaType<RawAppConfig> = {
  type: 'object',
  properties: {
    PORT: { type: 'string', pattern: '^(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$' },
    HOST: { type: 'string', enum: ['127.0.0.1'] },
    DATABASE_PATH: { type: 'string', minLength: 1, pattern: '\\S' },
    APP_TIMEZONE: { type: 'string', minLength: 1, pattern: '^[A-Za-z][A-Za-z0-9_+/-]*$' },
    COOKIE_SECURE: { type: 'string', enum: ['true', 'false'] },
    EXPORT_MAX_PER_WINDOW: { type: 'string', pattern: POSITIVE_INTEGER },
    EXPORT_WINDOW_MINUTES: { type: 'string', pattern: POSITIVE_INTEGER },
    INVITE_MAX_PER_WINDOW: { type: 'string', pattern: POSITIVE_INTEGER },
    INVITE_WINDOW_MINUTES: { type: 'string', pattern: POSITIVE_INTEGER },
    ARGOS_AUDIT_RETENTION_DAYS: { type: 'string', pattern: POSITIVE_INTEGER },
  },
  required: ['PORT', 'HOST', 'DATABASE_PATH', 'APP_TIMEZONE', 'COOKIE_SECURE', 'EXPORT_MAX_PER_WINDOW', 'EXPORT_WINDOW_MINUTES', 'INVITE_MAX_PER_WINDOW', 'INVITE_WINDOW_MINUTES', 'ARGOS_AUDIT_RETENTION_DAYS'],
  additionalProperties: false,
};

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

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * Lee y valida la configuración. `env` por defecto es `process.env`; las pruebas pasan su propio objeto.
 * Una variable ausente o vacía toma su valor por defecto.
 * @implements INV-ARCH-006
 */
export function loadAppConfig(env: EnvironmentSource = process.env): AppConfig {
  const keys = Object.keys(APP_CONFIG_DEFAULTS) as Array<keyof RawAppConfig>;
  const raw = Object.fromEntries(keys.map((key) => [key, env[key] === undefined || env[key] === '' ? APP_CONFIG_DEFAULTS[key] : env[key]])) as unknown as RawAppConfig;
  const invalid = new Set<string>();
  if (!validateRawConfig(raw)) {
    for (const error of validateRawConfig.errors ?? []) invalid.add(error.instancePath.replace(/^\//, ''));
  }
  if (!invalid.has('APP_TIMEZONE') && !isSupportedTimeZone(raw.APP_TIMEZONE)) invalid.add('APP_TIMEZONE');
  const rawSecret = env[AUDIT_SECRET_NAME];
  const auditHmacSecret = rawSecret === undefined || rawSecret === '' ? null : rawSecret;
  const invalidSecret = auditHmacSecret === null ? env['NODE_ENV'] === 'production' : !AUDIT_SECRET_PATTERN.test(auditHmacSecret);
  if (invalid.size > 0 || invalidSecret) {
    throw new AppConfigError([...keys.filter((key) => invalid.has(key)), ...(invalidSecret ? [AUDIT_SECRET_NAME] : [])]);
  }
  return {
    port: Number(raw.PORT),
    host: '127.0.0.1',
    databasePath: raw.DATABASE_PATH,
    appTimezone: raw.APP_TIMEZONE,
    cookieSecure: raw.COOKIE_SECURE === 'true',
    exportMaxPerWindow: Number(raw.EXPORT_MAX_PER_WINDOW),
    exportWindowMinutes: Number(raw.EXPORT_WINDOW_MINUTES),
    inviteMaxPerWindow: Number(raw.INVITE_MAX_PER_WINDOW),
    inviteWindowMinutes: Number(raw.INVITE_WINDOW_MINUTES),
    auditRetentionDays: Number(raw.ARGOS_AUDIT_RETENTION_DAYS),
    auditHmacSecret,
  };
}
