import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { phoneHmac, sameHex } from '../../../src/domain/emergency/phone-hmac.ts';
import { domainErrorOf } from './_support.ts';
import { encodeQr, qrToSvg, QR_SIZE } from '../../../src/domain/emergency/qr-encoder.ts';

/**
 * T1675 (Feature 012, Bloque D, #32; `/keymaker`): `phone_hmac` es HMAC-SHA-256 REAL (RFC 2104) con clave propia, calculado sobre el SHA-256 puro del dominio (el dominio no importa `node:crypto`), y la guarda BAJA-1
 * de `qrToSvg` (la matriz debe ser la 41x41 de la versión 6).
 *
 * @implements REQ-QR12-006, REQ-QR12-005, INV-QR12-003, SC-012-122, SC-012-049
 */
describe('T1675 phoneHmac coincide con node:crypto HMAC-SHA-256 [SC-012-122]', () => {
  it.each([
    ['clave corta', 'k', '+573001234567'],
    ['clave de 43 caracteres', 'phone-hmac-key-A-0123456789abcdef0123456789', '+573001112233'],
    ['clave exacta de 64 bytes', 'x'.repeat(64), '+12025550123'],
    ['clave de más de 64 bytes (se reduce con SHA-256)', 'y'.repeat(100), '+34612345678'],
    ['clave con UTF-8 multibyte', 'clave-ñandú-€'.repeat(5), '+573009990011'],
  ])('%s', (_name, key, phone) => {
    expect(phoneHmac(key, phone)).toBe(createHmac('sha256', key).update(phone, 'utf8').digest('hex'));
  });

  it('no es el SHA-256 del teléfono y cambia con la clave (una rotación recalcula)', () => {
    const a = phoneHmac('phone-hmac-key-A-0123456789abcdef0123456789', '+573001112233');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(phoneHmac('phone-hmac-key-B-0123456789abcdef0123456789', '+573001112233'));
  });

  it('sameHex compara en tiempo constante y distingue longitud', () => {
    expect(sameHex('ab12', 'ab12')).toBe(true);
    expect(sameHex('ab12', 'ab13')).toBe(false);
    expect(sameHex('ab12', 'ab1')).toBe(false);
  });
});

describe('T1675 BAJA-1: qrToSvg exige la matriz 41x41 [SC-012-049]', () => {
  it('una matriz de otro tamaño o con filas cortas lanza en vez de emitir un SVG que no escanea', () => {
    const qr = encodeQr('https://argos.example/e/x');
    expect(qr.size).toBe(QR_SIZE);
    for (const bad of [{ ...qr, size: 21 }, { ...qr, modules: qr.modules.slice(1) }, { ...qr, modules: qr.modules.map((row, index) => (index === 3 ? row.slice(1) : row)) }]) {
      expect(domainErrorOf(() => qrToSvg(bad)).code).toBe('ERR-INTERNAL-UNEXPECTED');
    }
    expect(qrToSvg(qr).startsWith('<svg')).toBe(true);
  });
});
