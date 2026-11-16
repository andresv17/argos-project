/**
 * Configuración del migrador de PostgreSQL (T429, REQ-PG-010, H-MERO-018). Lugar de `src/` para leer `DATABASE_URL_DIRECT`
 * sin abrir un segundo punto de lectura de `process.env` (INV-ARCH-006): el script `scripts/migrate-postgres.ts` solo llama a esta función.
 * - `DATABASE_URL_DIRECT`: URL `postgres:`/`postgresql:` con `sslmode=require` y host SIN `-pooler` (conexión directa, REQ-CICD-009),
 *   porque el candado de sesión no es válido a través del pooler.
 * - Es un secreto: `AppConfigError` nombra solo la variable, nunca el valor. No forma parte de `AppConfig` (la aplicación nunca la lee).
 *
 * @implements INV-ARCH-006, REQ-PG-010, REQ-PG-006
 */

import { AppConfigError, type EnvironmentSource } from './app-config.ts';

export interface MigratorConfig {
  /** URL directa de PostgreSQL (secreto: no se registra). */
  readonly databaseUrlDirect: string;
}

const NAME = 'DATABASE_URL_DIRECT';

function isValidDirectUrl(value: string | undefined): value is string {
  if (value === undefined || value === '') return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      url.searchParams.get('sslmode') === 'require' &&
      !url.hostname.toLowerCase().includes('-pooler')
    );
  } catch {
    return false;
  }
}

/** @implements INV-ARCH-006 */
export function loadMigratorConfig(env: EnvironmentSource = process.env): MigratorConfig {
  const value = env[NAME];
  if (!isValidDirectUrl(value)) throw new AppConfigError([NAME]);
  return { databaseUrlDirect: value };
}
