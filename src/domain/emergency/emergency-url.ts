/**
 * URL del QR (Feature 012, Bloque D, #32; REQ-QR12-005, INV-QR12-005, SC-012-087): `ARGOS_PUBLIC_BASE_URL` + `/e/` + token (43). ASCII y a lo sumo `QR_URL_MAX_BYTES` = 106 bytes ANTES de codificar;
 * si no, `ERR-QR12-URL-TOO-LONG` (422, error de configuración). Jamás se forma con `Host` ni `X-Forwarded-*`: la base la entrega la configuración (única fuente).
 *
 * @implements REQ-QR12-005, INV-QR12-005, SC-012-087
 */
import { DomainError } from '../../generated/v38/index.ts';
import { QR_URL_MAX_BYTES } from '../platform/feature-012-limits.ts';

const ASCII_PRINTABLE = /^[\x21-\x7E]+$/;

/** Base normalizada (sin barras finales) o `null` si no es una URL absoluta `http(s)` ASCII sin consulta ni ancla. */
export function normalizePublicBaseUrl(base: string): string | null {
  const trimmed = base.replace(/\/+$/, '');
  if (!ASCII_PRINTABLE.test(trimmed) || !/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(trimmed)) return null;
  return trimmed;
}

/** `${base}/e/${token}`; lanza `ERR-QR12-URL-TOO-LONG` si la base no es válida/ASCII o la URL supera 106 bytes. */
export function buildEmergencyUrl(publicBaseUrl: string, token: string): string {
  const base = normalizePublicBaseUrl(publicBaseUrl);
  if (base === null) throw new DomainError('ERR-QR12-URL-TOO-LONG');
  const url = `${base}/e/${token}`;
  if (Buffer.byteLength(url, 'utf8') > QR_URL_MAX_BYTES) throw new DomainError('ERR-QR12-URL-TOO-LONG');
  return url;
}
