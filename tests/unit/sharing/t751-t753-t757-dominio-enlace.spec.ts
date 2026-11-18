/**
 * T751 / T753 / T757 [US4] dominio `sharing/` (REQ-VET-002..005, STATE-SHARE-001): formato del token y `hashToken` en el dominio con SHA-256 puro verificado contra `node:crypto` (MIF-005-09; INV-ARCH-004 prohíbe `node:*` en `src/domain`), caducidad
 * {1,7,30} con el instante exacto ya VENCIDO, estado derivado REVOKED > EXPIRED > ACTIVE, `EXPIRED -> REVOKED` como no-op, TTL de la URL firmada pública
 * (<= 300 s, <= restante, mínimo 1 s), rótulo de archivo escapado («Archivo» si queda vacío) e IP efectiva (IPv6 por /64).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EXPIRY_DAYS,
  MAX_ACTIVE_SHARE_LINKS,
  computeExpiresAt,
  deriveStatus,
  isExpiryDays,
  isRevocationNoop,
  signedUrlTtlSeconds,
} from '../../../src/domain/sharing/share-link.ts';
import { SHARE_TOKEN_PATTERN, hashToken, hashesEqual, isWellFormedShareToken } from '../../../src/domain/sharing/share-token.ts';
import { fileLabel } from '../../../src/domain/sharing/file-label.ts';
import { normalizeClientIp } from '../../../src/domain/sharing/client-ip.ts';

const T0 = '2026-11-18T12:00:00.000Z';
const TOKEN = 'Xk3_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJK0';

describe('T751 token y hash en el dominio (REQ-VET-003, MIF-005-09)', () => {
  it('[REQ-VET-003] hashToken es SHA-256 hexadecimal de 64 caracteres, determinista y coincide con node:crypto', () => {
    expect(TOKEN).toHaveLength(43);
    expect(hashToken(TOKEN)).toBe(createHash('sha256').update(TOKEN, 'utf8').digest('hex'));
    expect(hashToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(TOKEN)).toBe(hashToken(TOKEN));
    expect(hashToken(`${TOKEN}x`)).not.toBe(hashToken(TOKEN));
  });

  it('[REQ-VET-003][INV-005-007] el patrón es de 43 caracteres base64url; un token mal formado sigue teniendo hash (no se valida en el borde)', () => {
    expect(SHARE_TOKEN_PATTERN.source).toBe('^[A-Za-z0-9_-]{43}$');
    expect([isWellFormedShareToken(TOKEN), isWellFormedShareToken('corto'), isWellFormedShareToken(`${TOKEN}=`), isWellFormedShareToken('é'.repeat(43))]).toEqual([true, false, false, false]);
    expect(hashToken('corto')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('[REQ-VET-003] hashesEqual compara en tiempo constante: iguales true; distintos o de distinta longitud false sin lanzar', () => {
    const a = hashToken('a');
    expect([hashesEqual(a, a), hashesEqual(a, hashToken('b')), hashesEqual(a, 'abc'), hashesEqual('', '')]).toEqual([true, false, false, true]);
  });
});

describe('T753 caducidad {1,7,30} (REQ-VET-004, SC-005-018)', () => {
  it('[REQ-VET-004] solo 1, 7 y 30 días son válidos; cualquier otro valor no', () => {
    expect([...EXPIRY_DAYS]).toEqual([1, 7, 30]);
    expect([1, 7, 30].map(isExpiryDays)).toEqual([true, true, true]);
    expect([0, 2, 8, 31, 365, -1, 7.5, '7', null, undefined].map((v) => isExpiryDays(v))).toEqual(Array(10).fill(false));
  });

  it('[REQ-VET-004][SC-005-018] expiresAt = createdAt + n días exactos (UTC) con el reloj inyectado', () => {
    expect(computeExpiresAt(T0, 1)).toBe('2026-11-19T12:00:00.000Z');
    expect(computeExpiresAt(T0, 7)).toBe('2026-11-25T12:00:00.000Z');
    expect(computeExpiresAt(T0, 30)).toBe('2026-12-18T12:00:00.000Z');
    expect(computeExpiresAt('2026-02-27T23:59:59.999Z', 7)).toBe('2026-03-06T23:59:59.999Z');
  });

  it('[REQ-VET-004][SC-005-018] el instante exacto expiresAt ya es VENCIDO; un milisegundo antes sigue ACTIVO', () => {
    const link = { revokedAt: null, expiresAt: '2026-11-25T12:00:00.000Z' };
    expect(deriveStatus(link, '2026-11-25T11:59:59.999Z')).toBe('ACTIVE');
    expect(deriveStatus(link, '2026-11-25T12:00:00.000Z')).toBe('EXPIRED');
    expect(deriveStatus(link, '2026-11-26T00:00:00.000Z')).toBe('EXPIRED');
  });

  it('[REQ-VET-004][EDGE-005-23] TTL de la URL firmada = min(300, restante) en segundos enteros; con menos de 1 s no se emite (null)', () => {
    const expiresAt = '2026-11-18T12:10:00.000Z';
    expect(signedUrlTtlSeconds('2026-11-18T12:00:00.000Z', expiresAt)).toBe(300);
    expect(signedUrlTtlSeconds('2026-11-18T12:07:30.500Z', expiresAt)).toBe(149);
    expect(signedUrlTtlSeconds('2026-11-18T12:09:59.000Z', expiresAt)).toBe(1);
    expect(signedUrlTtlSeconds('2026-11-18T12:09:59.001Z', expiresAt)).toBeNull();
    expect(signedUrlTtlSeconds('2026-11-18T12:10:00.000Z', expiresAt)).toBeNull();
    expect(signedUrlTtlSeconds('2026-11-18T12:30:00.000Z', expiresAt)).toBeNull();
  });
});

describe('T757 estado derivado y revocación (REQ-VET-005, STATE-SHARE-001, MIF-005-08)', () => {
  const expiresAt = '2026-11-25T12:00:00.000Z';
  it('[STATE-SHARE-001] REVOKED gana a EXPIRED y a ACTIVE (orden REVOKED > EXPIRED > ACTIVE)', () => {
    expect(deriveStatus({ revokedAt: '2026-11-19T00:00:00.000Z', expiresAt }, '2026-11-20T00:00:00.000Z')).toBe('REVOKED');
    expect(deriveStatus({ revokedAt: '2026-11-19T00:00:00.000Z', expiresAt }, '2027-01-01T00:00:00.000Z')).toBe('REVOKED');
    expect(deriveStatus({ revokedAt: null, expiresAt }, '2026-11-20T00:00:00.000Z')).toBe('ACTIVE');
  });

  it('[REQ-VET-005][MIF-005-08] revocar un enlace VENCIDO o ya REVOCADO es un no-op; solo uno ACTIVO se revoca', () => {
    expect([isRevocationNoop('ACTIVE'), isRevocationNoop('EXPIRED'), isRevocationNoop('REVOKED')]).toEqual([false, true, true]);
  });

  it('[REQ-VET-012] el tope de enlaces activos por alcance es 20', () => {
    expect(MAX_ACTIVE_SHARE_LINKS).toBe(20);
  });
});

describe('T763 rótulo de archivo (REQ-VET-009, EDGE-005-27, INV-005-009)', () => {
  it('[SC-005-035] el nombre original se conserva como texto (sin escapar HTML: lo escapa la vista) y se recorta a 120 caracteres', () => {
    expect(fileLabel('Análisis Luna.pdf')).toBe('Análisis Luna.pdf');
    expect(fileLabel('<img src=x onerror=alert(1)>.png')).toBe('<img src=x onerror=alert(1)>.png');
    expect([...fileLabel('a'.repeat(300))]).toHaveLength(120);
  });

  it('[EDGE-005-27] un nombre vacío tras el saneado (controles, bidi, ceros de ancho, espacios) se rotula «Archivo»', () => {
    expect(['', '   ', '\u0000\u001f', '‮​⁦', '\n\t'].map(fileLabel)).toEqual(Array(5).fill('Archivo'));
  });

  it('[REQ-VET-009] se eliminan controles y marcas bidireccionales y se colapsan los espacios', () => {
    expect(fileLabel('  a‮b\u0007  c​ ')).toBe('ab c');
  });
});

describe('T760 IP efectiva (REQ-VET-007, SC-005-021)', () => {
  it('[REQ-VET-007] IPv4 queda igual; IPv6 se reduce a su prefijo /64 (varias formas de la misma red colisionan)', () => {
    expect(normalizeClientIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeClientIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(normalizeClientIp('2001:0db8:0001:0002::1'));
    expect(normalizeClientIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).not.toBe(normalizeClientIp('2001:db8:1:3:aaaa:bbbb:cccc:dddd'));
  });

  it('[REQ-VET-007] una IPv4 mapeada en IPv6 (::ffff:a.b.c.d) se trata como la IPv4; un valor vacío o ilegible no lanza', () => {
    expect(normalizeClientIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeClientIp('')).toBe('unknown');
    expect(normalizeClientIp('no-es-una-ip')).toBe('unknown');
  });
});
