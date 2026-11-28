import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEmergencyModule, type RulesModule, type TokenModule } from '../../fixtures/emergency-modules.ts';
import * as limitsModule from '../../../src/domain/platform/feature-012-limits.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; PRUEBAS ROJAS hasta T1675; `/keymaker`): dominio puro de la ficha QR: token opaco (solo hash), aviso compatible y espera de 90 días, selección de teléfonos,
 * guarda, `lastChange` (lista blanca de 4 tipos), `criticalAllergiesChange` y granularidad de `last_scanned_at`. Falla hoy porque `src/domain/emergency/{token,emergency-card-rules}.ts` no existen
 * y `feature-012-limits.ts` no exporta las constantes del Bloque D. Firmas SUPUESTAS por este archivo (el plan fija nombres de archivo, no firmas); sin reloj ni I/O (`now` por parámetro).
 *
 * @implements REQ-QR12-003, REQ-QR12-004, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-002, INV-QR12-003
 * Cubre SC-012-046, SC-012-047, SC-012-050, SC-012-052, SC-012-083, SC-012-084, SC-012-085, SC-012-087, SC-012-106, SC-012-122, SC-012-123, SC-012-124.
 */
const tokenModule = await loadEmergencyModule<TokenModule>('domain/emergency/token');
const rules = await loadEmergencyModule<RulesModule>('domain/emergency/emergency-card-rules');
const limits = limitsModule as Record<string, unknown>;
const generateEmergencyToken = (e: Uint8Array): string => tokenModule.generateEmergencyToken(e);
const hashEmergencyToken = (t: string): string => tokenModule.hashEmergencyToken(t);
const isWellFormedEmergencyToken = (t: string): boolean => tokenModule.isWellFormedEmergencyToken(t);
const isNoticeCompatible = (a: string, b: string): boolean => rules.isNoticeCompatible(a, b);
const isNoticeWaitExpired = (a: string, b: string): boolean => rules.isNoticeWaitExpired(a, b);
const selectContactPhones = (c: Parameters<RulesModule['selectContactPhones']>[0]): string[] => rules.selectContactPhones(c);
const evaluateGuard = (g: { visiblePhones: number; allergies: number }): boolean => rules.evaluateGuard(g);
const deriveLastChange = (...a: Parameters<RulesModule['deriveLastChange']>) => rules.deriveLastChange(...a);
const deriveCriticalAllergiesChange = (...a: Parameters<RulesModule['deriveCriticalAllergiesChange']>) => rules.deriveCriticalAllergiesChange(...a);
const truncateLastScanned = (n: string): string => rules.truncateLastScanned(n);
const shouldRefreshLastScanned = (p: string | null, n: string): boolean => rules.shouldRefreshLastScanned(p, n);
/** Un `toThrow` solo cuenta si el error NO es el de «módulo ausente» (si no, la prueba pasaría en vacío). */
const NOT_ABSENT = /^(?!módulo ausente)/;
const NOW = '2026-11-27T15:00:00.000Z';
const daysAgo = (days: number, from = NOW): string => new Date(Date.parse(from) - days * 86_400_000).toISOString();

describe('T1674 token opaco y solo hash [SC-012-052]', () => {
  const entropy = Uint8Array.from({ length: 32 }, (_, i) => i);

  it('el token son 256 bits en base64url sin relleno (43 caracteres, QR_TOKEN_PATTERN) y es determinista dado el CSPRNG inyectado', () => {
    const token = generateEmergencyToken(entropy);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).toBe(Buffer.from(entropy).toString('base64url'));
    expect(generateEmergencyToken(Uint8Array.from(entropy).reverse())).not.toBe(token);
  });

  it('exige exactamente 32 bytes de entropía', () => {
    expect(() => generateEmergencyToken(new Uint8Array(31))).toThrow(NOT_ABSENT);
    expect(() => generateEmergencyToken(new Uint8Array(33))).toThrow(NOT_ABSENT);
  });

  it('el hash es SHA-256 hexadecimal de 64 caracteres y nunca contiene el token', () => {
    const token = generateEmergencyToken(entropy);
    const hash = hashEmergencyToken(token);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });

  it('se calcula hash también para tokens mal formados (sin cortocircuito) y la forma se valida aparte', () => {
    expect(hashEmergencyToken('corto')).toBe(createHash('sha256').update('corto').digest('hex'));
    expect(hashEmergencyToken('x'.repeat(200))).toHaveLength(64);
    expect(isWellFormedEmergencyToken(generateEmergencyToken(entropy))).toBe(true);
    for (const bad of ['', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}+`, `${'a'.repeat(42)}/`, `${'a'.repeat(42)}\n`]) expect(isWellFormedEmergencyToken(bad)).toBe(false);
  });
});

describe('T1674 aviso: compatibilidad MAJOR.MINOR y espera de 90 días [SC-012-084][SC-012-085]', () => {
  it('PATCH es editorial: 0.1.0 y 0.1.7 son compatibles; cambia MINOR o MAJOR y deja de serlo', () => {
    expect(isNoticeCompatible('0.1.0', '0.1.7')).toBe(true);
    expect(isNoticeCompatible('0.1.0', '0.1.0')).toBe(true);
    expect(isNoticeCompatible('0.1.0', '0.2.0')).toBe(false);
    expect(isNoticeCompatible('0.1.0', '1.0.0')).toBe(false);
    expect(isNoticeCompatible('1.0.0', '0.1.0')).toBe(false);
  });

  it('la espera dura como máximo EMERGENCY_NOTICE_WAIT_DAYS = 90 desde EMERGENCY_NOTICE_EFFECTIVE_AT: vigente a los 89 días, vencida a los 91', () => {
    expect(limits.EMERGENCY_NOTICE_WAIT_DAYS).toBe(90);
    const effectiveAt = '2026-12-01T00:00:00.000Z';
    expect(isNoticeWaitExpired(effectiveAt, '2027-02-28T00:00:00.000Z')).toBe(false); // día 89
    expect(isNoticeWaitExpired(effectiveAt, '2027-03-02T00:00:00.000Z')).toBe(true); // día 91
    expect(isNoticeWaitExpired(effectiveAt, effectiveAt)).toBe(false);
  });
});

describe('T1674 selectContactPhones: máximo 2, principal -> joined_at -> user_id, deduplicados [SC-012-083]', () => {
  const c = (userId: string, phone: string, joinedAt: string, isPrincipal = false) => ({ userId, phone, joinedAt, isPrincipal });

  it('el principal va primero; luego joined_at ascendente; luego user_id ascendente; tope de 2', () => {
    const rows = [c('u3', '+573000000003', '2026-01-03T00:00:00.000Z'), c('u2', '+573000000002', '2026-01-02T00:00:00.000Z'), c('u1', '+573000000001', '2026-01-04T00:00:00.000Z', true)];
    expect(selectContactPhones(rows)).toEqual(['+573000000001', '+573000000002']);
  });

  it('empate de joined_at se resuelve por user_id ascendente', () => {
    const at = '2026-01-02T00:00:00.000Z';
    expect(selectContactPhones([c('uB', '+573000000002', at), c('uA', '+573000000001', at)])).toEqual(['+573000000001', '+573000000002']);
  });

  it('dos titulares con el MISMO teléfono cuentan una sola vez y no ocupan el segundo lugar', () => {
    const rows = [c('u1', '+573000000001', '2026-01-01T00:00:00.000Z', true), c('u2', '+573000000001', '2026-01-02T00:00:00.000Z'), c('u3', '+573000000003', '2026-01-03T00:00:00.000Z')];
    expect(selectContactPhones(rows)).toEqual(['+573000000001', '+573000000003']);
  });

  it('sin candidatos devuelve una lista vacía y no muta la entrada', () => {
    expect(selectContactPhones([])).toEqual([]);
    const rows = [c('u2', '+573000000002', '2026-01-02T00:00:00.000Z'), c('u1', '+573000000001', '2026-01-01T00:00:00.000Z')];
    const before = JSON.stringify(rows);
    selectContactPhones(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('T1674 guarda de activación [REQ-QR12-010][SC-012-046]', () => {
  it('se cumple con al menos un teléfono visible o al menos una alergia; no con ninguno', () => {
    expect(evaluateGuard({ visiblePhones: 1, allergies: 0 })).toBe(true);
    expect(evaluateGuard({ visiblePhones: 0, allergies: 1 })).toBe(true);
    expect(evaluateGuard({ visiblePhones: 0, allergies: 0 })).toBe(false);
  });
});

describe('T1674 lastChange: lista blanca de 4 tipos, 90 días, byMe sin cruce de identidad [SC-012-087][SC-012-124]', () => {
  const ev = (type: string, actorUserId: string | null, occurredAt: string) => ({ type, actorUserId, occurredAt });

  it('mapea solo EMERGENCY_CARD_ACTIVATED/REGENERATED/DEACTIVATED/AUTO_DEACTIVATED y toma el más reciente', () => {
    const events = [
      ev('EMERGENCY_CARD_ACTIVATED', 'u1', daysAgo(5)),
      ev('EMERGENCY_CARD_REGENERATED', 'u2', daysAgo(3)),
      ev('EMERGENCY_CARD_DEACTIVATED', 'u1', daysAgo(2)),
      ev('EMERGENCY_CARD_AUTO_DEACTIVATED', null, daysAgo(1)),
    ];
    expect(deriveLastChange(events, 'u1', NOW)).toEqual({ kind: 'AUTO_DEACTIVATED', at: daysAgo(1), byMe: false });
    expect(deriveLastChange(events.slice(0, 3), 'u1', NOW)).toEqual({ kind: 'DEACTIVATED', at: daysAgo(2), byMe: true });
    expect(deriveLastChange(events.slice(0, 2), 'u1', NOW)).toEqual({ kind: 'REGENERATED', at: daysAgo(3), byMe: false });
    expect(deriveLastChange(events.slice(0, 1), 'u1', NOW)).toEqual({ kind: 'ACTIVATED', at: daysAgo(5), byMe: true });
  });

  it('EMERGENCY_PHONE_CONSENT_CHANGED y PET_CRITICAL_ALLERGIES_UPDATED NO producen lastChange (aunque sean los más recientes)', () => {
    const events = [ev('EMERGENCY_CARD_ACTIVATED', 'u1', daysAgo(5)), ev('EMERGENCY_PHONE_CONSENT_CHANGED', 'u2', daysAgo(1)), ev('PET_CRITICAL_ALLERGIES_UPDATED', 'u2', daysAgo(0.5))];
    expect(deriveLastChange(events, 'u1', NOW)).toEqual({ kind: 'ACTIVATED', at: daysAgo(5), byMe: true });
    expect(deriveLastChange(events.slice(1), 'u1', NOW)).toBeNull();
  });

  it('solo dentro de 90 días: a 89 días existe y a 91 días es null (con la ficha ON o no)', () => {
    expect(deriveLastChange([ev('EMERGENCY_CARD_ACTIVATED', 'u1', daysAgo(89))], 'u1', NOW)).toEqual({ kind: 'ACTIVATED', at: daysAgo(89), byMe: true });
    expect(deriveLastChange([ev('EMERGENCY_CARD_ACTIVATED', 'u1', daysAgo(91))], 'u1', NOW)).toBeNull();
  });

  it('un actor seudonimizado o el actor nulo de un evento de sistema da byMe = false y no expone la identidad', () => {
    const anonymized = deriveLastChange([ev('EMERGENCY_CARD_DEACTIVATED', 'pseudonym-abc', daysAgo(1))], 'u1', NOW);
    expect(anonymized).toEqual({ kind: 'DEACTIVATED', at: daysAgo(1), byMe: false });
    expect(Object.keys(anonymized!).sort()).toEqual(['at', 'byMe', 'kind']);
    expect(deriveLastChange([ev('EMERGENCY_CARD_AUTO_DEACTIVATED', null, daysAgo(1))], 'u1', NOW)?.byMe).toBe(false);
  });
});

describe('T1674 criticalAllergiesChange: último PET_CRITICAL_ALLERGIES_UPDATED dentro de 90 días, sin contenido ni identidad [SC-012-048]', () => {
  const ev = (type: string, actorUserId: string | null, occurredAt: string) => ({ type, actorUserId, occurredAt });

  it('devuelve {at, byMe} del evento más reciente y nada más', () => {
    const events = [ev('PET_CRITICAL_ALLERGIES_UPDATED', 'u9', daysAgo(10)), ev('PET_CRITICAL_ALLERGIES_UPDATED', 'u1', daysAgo(2)), ev('EMERGENCY_CARD_ACTIVATED', 'u3', daysAgo(0.1))];
    const change = deriveCriticalAllergiesChange(events, 'u1', NOW);
    expect(change).toEqual({ at: daysAgo(2), byMe: true });
    expect(deriveCriticalAllergiesChange(events, 'u2', NOW)).toEqual({ at: daysAgo(2), byMe: false });
  });

  it('null si no hay evento o si el último tiene más de 90 días', () => {
    expect(deriveCriticalAllergiesChange([], 'u1', NOW)).toBeNull();
    expect(deriveCriticalAllergiesChange([ev('PET_CRITICAL_ALLERGIES_UPDATED', 'u1', daysAgo(91))], 'u1', NOW)).toBeNull();
    expect(deriveCriticalAllergiesChange([ev('EMERGENCY_CARD_ACTIVATED', 'u1', daysAgo(1))], 'u1', NOW)).toBeNull();
  });
});

describe('T1674 last_scanned_at: solo marca de tiempo, granularidad 60 min [SC-012-050]', () => {
  it('trunca a la hora en punto (UTC) y solo refresca si pasó la granularidad', () => {
    expect(limits.QR_LAST_SCANNED_GRANULARITY_MINUTES).toBe(60);
    expect(truncateLastScanned('2026-11-27T15:42:17.123Z')).toBe('2026-11-27T15:00:00.000Z');
    expect(shouldRefreshLastScanned(null, '2026-11-27T15:42:17.123Z')).toBe(true);
    expect(shouldRefreshLastScanned('2026-11-27T15:00:00.000Z', '2026-11-27T15:59:59.000Z')).toBe(false);
    expect(shouldRefreshLastScanned('2026-11-27T15:00:00.000Z', '2026-11-27T16:00:00.000Z')).toBe(true);
  });
});
