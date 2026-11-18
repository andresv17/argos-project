/**
 * Configuración del enlace veterinario (feature 005, REQ-VET-008, PN-06). Lugar de `src/` para leer `ARGOS_SHARE_IP_HMAC_SECRET` sin abrir otro punto de lectura
 * de `process.env` (INV-ARCH-006; mismo patrón que `migrator-config.ts`): no forma parte de `AppConfig`.
 * - `ARGOS_SHARE_IP_HMAC_SECRET`: clave HMAC DEDICADA de la IP de la auditoría de accesos (Secret Manager, >= 32 bytes en hexadecimal), distinta de la clave de
 *   auditoría y de las de sesión. SIN rotación en 005 (la rotación y `ip_key_version` se difieren a 006, `PN-06`; los 30 días de retención acotan la correlación).
 * - Ausente: `null`. Fuera de `NODE_ENV=test` la clave fija de desarrollo se rechaza. Es un secreto: el error nombra solo la variable, nunca el valor.
 *
 * @implements INV-ARCH-006, REQ-VET-008
 */
import { AppConfigError, type EnvironmentSource } from './app-config.ts';

export interface ShareConfig {
  /** Clave HMAC de la IP en hexadecimal (>= 32 bytes) o null si falta. Secreto: no se registra. */
  readonly ipHmacSecret: string | null;
}

const NAME = 'ARGOS_SHARE_IP_HMAC_SECRET';
const SECRET_PATTERN = /^(?:[0-9a-fA-F]{2}){32,}$/;

/** Clave fija de desarrollo y pruebas: solo se usa en local (host 127.0.0.1) cuando la variable falta; en producción la ausencia desactiva el enlace. */
export const DEVELOPMENT_SHARE_IP_HMAC_SECRET = 'ba'.repeat(32);

export function loadShareConfig(env: EnvironmentSource = process.env): ShareConfig {
  const raw = env[NAME];
  if (raw === undefined || raw === '') return { ipHmacSecret: null };
  if (!SECRET_PATTERN.test(raw) || (env['NODE_ENV'] !== 'test' && raw.toLowerCase() === DEVELOPMENT_SHARE_IP_HMAC_SECRET)) throw new AppConfigError([NAME]);
  return { ipHmacSecret: raw };
}
