/**
 * Configuración de la aplicación. Único lugar de `src/` que lee `process.env`
 * (INV-ARCH-006). Las variables se validan contra `APP_CONFIG_SCHEMA` (JSON Schema, Ajv) antes de convertirse.
 * - `PORT` 1–65535 (3000), `HOST` solo `127.0.0.1`, `DATABASE_PATH` no vacía (`./data/argos.sqlite`),
 *   `APP_TIMEZONE` zona IANA válida (`America/Bogota`, F6), `COOKIE_SECURE` `true` o `false` (`false`).
 * - Una variable inválida produce `AppConfigError` con la lista de variables afectadas; no se arranca con valores
 *   por defecto silenciosos. Ningún valor es secreto (`.env.example`).
 *
 * @implements INV-ARCH-006, INV-ARCH-004
 */

import { Ajv, type JSONSchemaType } from 'ajv';
import { DEFAULT_APP_TIMEZONE, isSupportedTimeZone } from '../adapters/system-clock.adapter.ts';

export interface AppConfig {
  readonly port: number;
  readonly host: '127.0.0.1';
  readonly databasePath: string;
  readonly appTimezone: string;
  readonly cookieSecure: boolean;
}

interface RawAppConfig {
  PORT: string;
  HOST: string;
  DATABASE_PATH: string;
  APP_TIMEZONE: string;
  COOKIE_SECURE: string;
}

export const APP_CONFIG_DEFAULTS: Readonly<RawAppConfig> = {
  PORT: '3000',
  HOST: '127.0.0.1',
  DATABASE_PATH: './data/argos.sqlite',
  APP_TIMEZONE: DEFAULT_APP_TIMEZONE,
  COOKIE_SECURE: 'false',
};

/** Esquema de las variables de entorno (todas llegan como texto). */
export const APP_CONFIG_SCHEMA: JSONSchemaType<RawAppConfig> = {
  type: 'object',
  properties: {
    PORT: { type: 'string', pattern: '^(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$' },
    HOST: { type: 'string', enum: ['127.0.0.1'] },
    DATABASE_PATH: { type: 'string', minLength: 1, pattern: '\\S' },
    APP_TIMEZONE: { type: 'string', minLength: 1, pattern: '^[A-Za-z][A-Za-z0-9_+/-]*$' },
    COOKIE_SECURE: { type: 'string', enum: ['true', 'false'] },
  },
  required: ['PORT', 'HOST', 'DATABASE_PATH', 'APP_TIMEZONE', 'COOKIE_SECURE'],
  additionalProperties: false,
};

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
  if (invalid.size > 0) throw new AppConfigError(keys.filter((key) => invalid.has(key)));
  return {
    port: Number(raw.PORT),
    host: '127.0.0.1',
    databasePath: raw.DATABASE_PATH,
    appTimezone: raw.APP_TIMEZONE,
    cookieSecure: raw.COOKIE_SECURE === 'true',
  };
}
