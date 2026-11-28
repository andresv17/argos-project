import { describe, expect, it } from 'vitest';
import { loadEmergencyModule, type PhoneModule } from '../../fixtures/emergency-modules.ts';
import { domainErrorOf, expectNoEcho } from './_support.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; PRUEBAS ROJAS hasta T1675; `/keymaker`): validación y normalización E.164 de `users.phone` en el DOMINIO (`src/domain/emergency/phone.ts`).
 * Falla hoy porque el módulo no existe (T1675 lo crea). Firma SUPUESTA por este archivo: `normalizeE164(input: unknown): string`; lanza `DomainError` `ERR-QR12-PHONE-INVALID` (422) sin eco del valor.
 * No hay CHECK regex en BD (`data-model.md`): la paridad de motores la da esta única función (los tres motores la invocan antes de escribir; ver `schema-parity.spec.ts` para la ausencia de CHECK).
 *
 * @implements REQ-QR12-001, INV-QR12-003
 * Cubre SC-012-041, SC-012-127.
 */
const m = await loadEmergencyModule<PhoneModule>('domain/emergency/phone');
const normalizeE164 = (input: unknown): string => m.normalizeE164(input);
const INVALID = 'ERR-QR12-PHONE-INVALID';

describe('T1674 normalizeE164 (paridad de motores: una sola función de dominio)', () => {
  it.each([
    ['+573001234567', '+573001234567'],
    ['+57 300 123 4567', '+573001234567'],
    ['+57-300-123-4567', '+573001234567'],
    ['+57 (300) 123-4567', '+573001234567'],
    ['  +34 612 345 678  ', '+34612345678'],
    ['+12025550123', '+12025550123'],
    ['+12345678', '+12345678'], // 8 dígitos: mínimo del patrón ^\+[1-9][0-9]{7,14}$
    ['+123456789012345', '+123456789012345'], // 15 dígitos: máximo
  ])('[SC-012-041] normaliza %j a %j', (input, expected) => {
    expect(normalizeE164(input)).toBe(expected);
  });

  it.each([
    ['sin signo más', '573001234567'],
    ['prefijo 00', '00573001234567'],
    ['cero tras el más', '+0573001234567'],
    ['7 dígitos (corto)', '+1234567'],
    ['16 dígitos (largo)', '+1234567890123456'],
    ['letras', '+57300ABC4567'],
    ['vacío', ''],
    ['solo espacios', '   '],
    ['solo el más', '+'],
    ['más intermedio', '+57300+1234567'],
    ['extensión', '+573001234567 ext 12'],
    ['dígitos árabe-índicos', '+٥٧٣٠٠١٢٣٤٥٦٧'],
    ['más de ancho completo', '＋573001234567'],
    ['dígitos de ancho completo', '+５７３００１２３４５６７'],
    ['salto de línea', '+57300\n1234567'],
    ['carácter de control', '+57300\u00001234567'],
    ['bidi', '‮+573001234567'],
  ])('[SC-012-041] rechaza %s con 422 ERR-QR12-PHONE-INVALID sin eco', (_name, input) => {
    const error = domainErrorOf(() => normalizeE164(input));
    expect(error.code).toBe(INVALID);
    expect(error.status).toBe(422);
    if (input.trim() !== '') expectNoEcho(error, input.trim());
  });

  it('[SC-012-041] rechaza entradas que no son cadena (número, objeto, arreglo, undefined) y más de 32 caracteres', () => {
    for (const bad of [573001234567, {}, ['+573001234567'], undefined, true]) expect(domainErrorOf(() => normalizeE164(bad)).code).toBe(INVALID);
    expect(domainErrorOf(() => normalizeE164(`+57${' '.repeat(40)}3001234567`)).code).toBe(INVALID);
  });

  it('[SC-012-127] es idempotente: normalizar lo ya normalizado no cambia el valor', () => {
    const once = normalizeE164('+57 (300) 123-4567');
    expect(normalizeE164(once)).toBe(once);
  });
});
