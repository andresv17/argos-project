/**
 * Teléfono de la cuenta en E.164 (Feature 012, Bloque D, #32; REQ-QR12-001, INV-QR12-003, SC-012-041, SC-012-127): UNA sola función de dominio, la misma en los tres motores (sin CHECK regex en BD).
 * Entrada libre de hasta 32 caracteres (espacios, guiones y paréntesis); salida `^\+[1-9][0-9]{7,14}$`. Sin eco del valor rechazado: el `DomainError` lleva el detalle genérico del catálogo.
 *
 * @implements REQ-QR12-001, INV-QR12-003, SC-012-041, SC-012-127
 */
import { DomainError } from '../../generated/v38/index.ts';

export const PHONE_INPUT_MAX_LENGTH = 32;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
/** Solo dígitos ASCII, espacio, guion y paréntesis tras el `+` inicial: cualquier otro carácter (letras, `+` intermedio, control, bidi, anchura completa) se rechaza. */
const FREE_FORM_PATTERN = /^\+[0-9 ()-]+$/;

/**
 * Detalle propio (sin el ejemplo «+57 …» de la plantilla del catálogo): la prueba de «sin eco» (`expectNoEcho`) rechaza que el detalle contenga el valor recibido, y un valor
 * rechazado puede ser solo «+». El texto sigue siendo genérico y accionable (INV-QR12-003).
 */
const INVALID_PHONE_DETAIL = 'Agrega o corrige el teléfono de tu cuenta: empieza con el signo más y el código de país, y usa de 8 a 15 dígitos.';
export const invalidPhone = (): DomainError => new DomainError('ERR-QR12-PHONE-INVALID', INVALID_PHONE_DETAIL, 'phone');

/** Normaliza a E.164 o lanza `ERR-QR12-PHONE-INVALID` (422) sin eco. */
export function normalizeE164(input: unknown): string {
  if (typeof input !== 'string' || input.length > PHONE_INPUT_MAX_LENGTH) throw invalidPhone();
  const trimmed = input.replace(/^ +| +$/g, '');
  if (!FREE_FORM_PATTERN.test(trimmed)) throw invalidPhone();
  const normalized = trimmed.replace(/[ ()-]/g, '');
  if (!E164_PATTERN.test(normalized)) throw invalidPhone();
  return normalized;
}
