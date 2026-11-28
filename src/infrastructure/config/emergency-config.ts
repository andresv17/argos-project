/**
 * Configuración de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1684; REQ-QR12-005, REQ-QR12-006, INV-QR12-005, SC-012-087): el ÚNICO lugar que lee `PHONE_HMAC_KEY` y valida la base pública del QR
 * (INV-ARCH-006). La URL del QR se forma SOLO con `ARGOS_PUBLIC_BASE_URL` (ya validada por `app-config.ts` y recibida por parámetro) + `/e/` + token: jamás con `Host` ni `X-Forwarded-*`.
 *
 * - Sin `PHONE_HMAC_KEY` la ficha NO se conecta (`null`): las rutas de la ficha no existen (404) y la activación en producción queda cerrada (anexo §6, criterio de T1685).
 * - Con la clave, la base debe ser ASCII y `base + "/e/" + token(43)` debe caber en `QR_URL_MAX_BYTES` = 106 bytes: si no, el arranque falla nombrando SOLO la variable (nunca su valor).
 * - La clave es DEDICADA (distinta de la de sesión, de la de IP y de la de auditoría): mínimo 32 caracteres; nunca se registra.
 *
 * @implements REQ-QR12-005, REQ-QR12-006, INV-QR12-005, INV-ARCH-006, SC-012-087
 */
import type { EmergencyServices } from '../../application/use-cases/use-case-support.ts';
import { PHONE_HMAC_KEY_MIN_LENGTH } from '../../domain/emergency/phone-hmac.ts';
import { normalizePublicBaseUrl } from '../../domain/emergency/emergency-url.ts';
import { EMERGENCY_NOTICE_EFFECTIVE_AT, EMERGENCY_NOTICE_VERSION, QR_URL_MAX_BYTES } from '../../domain/platform/feature-012-limits.ts';
import { CryptoEmergencyEntropyAdapter } from '../adapters/crypto-emergency-entropy.adapter.ts';

export const PHONE_HMAC_KEY_ENV = 'PHONE_HMAC_KEY';
export const PUBLIC_BASE_URL_ENV = 'ARGOS_PUBLIC_BASE_URL';
/** `/e/` + token de 43 caracteres: lo que se suma a la base para formar la URL del QR. */
const URL_SUFFIX_BYTES = '/e/'.length + 43;

/** Error de configuración de la ficha: nombra SOLO las variables inválidas, nunca sus valores. */
export class EmergencyConfigError extends Error {
  constructor(readonly invalidVariables: readonly string[]) {
    super(`Configuración de la ficha QR inválida: ${invalidVariables.join(', ')}`);
    this.name = 'EmergencyConfigError';
  }
}

/** `true` si `base + /e/ + token` cabe en `QR_URL_MAX_BYTES` y la base es una URL `http(s)` ASCII sin consulta ni ancla. */
export function isValidQrPublicBaseUrl(base: string | null): boolean {
  if (base === null) return false;
  const normalized = normalizePublicBaseUrl(base);
  return normalized !== null && Buffer.byteLength(normalized, 'utf8') + URL_SUFFIX_BYTES <= QR_URL_MAX_BYTES;
}

/**
 * Construye los servicios de la ficha o `null` si no está habilitada (`PHONE_HMAC_KEY` ausente). `publicBaseUrl` es `AppConfig.publicBaseUrl` (única fuente de `ARGOS_PUBLIC_BASE_URL`).
 * @throws EmergencyConfigError con la clave presente pero inválida o con una base pública que no sirve para el QR.
 */
export function loadEmergencyServices(env: Readonly<Record<string, string | undefined>>, publicBaseUrl: string | null): EmergencyServices | null {
  const key = env[PHONE_HMAC_KEY_ENV];
  if (key === undefined || key === '') return null;
  const invalid: string[] = [];
  if (key.length < PHONE_HMAC_KEY_MIN_LENGTH || !/^[\x21-\x7e]+$/.test(key)) invalid.push(PHONE_HMAC_KEY_ENV);
  if (!isValidQrPublicBaseUrl(publicBaseUrl)) invalid.push(PUBLIC_BASE_URL_ENV);
  if (invalid.length > 0) throw new EmergencyConfigError(invalid);
  return {
    phoneHmacKey: key,
    publicBaseUrl: normalizePublicBaseUrl(publicBaseUrl!)!,
    noticeVersion: EMERGENCY_NOTICE_VERSION,
    noticeEffectiveAt: EMERGENCY_NOTICE_EFFECTIVE_AT,
    entropy: new CryptoEmergencyEntropyAdapter(),
  };
}
