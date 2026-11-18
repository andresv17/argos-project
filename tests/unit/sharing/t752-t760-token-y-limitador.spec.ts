/**
 * T752 / T760 [US4] `CryptoTokenGenerator` (REQ-VET-003, INV-005-005, SC-005-015) y el límite de tasa en memoria `SharedAccessLimiter`
 * (REQ-VET-007, SC-005-021, SC-005-041, MIF-005-12, PN-11): `Map` con barrido de ventanas y tope duro de entradas; con el tope lleno, 429 fail-closed.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SharedAccessLimiter } from '../../../src/application/sharing/shared-access-limiter.ts';
import { hashToken, hashesEqual, SHARE_TOKEN_PATTERN } from '../../../src/domain/sharing/share-token.ts';
import { CryptoTokenGenerator } from '../../../src/infrastructure/adapters/crypto-token-generator.adapter.ts';

describe('T752 CryptoTokenGenerator (REQ-VET-003, INV-005-005)', () => {
  it('[REQ-VET-003][SC-005-015] genera 32 bytes aleatorios en base64url de 43 caracteres y el SHA-256 del dominio coincide con node:crypto', () => {
    const generator = new CryptoTokenGenerator();
    const token = generator.nextShareToken();
    expect(token).toMatch(SHARE_TOKEN_PATTERN);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hashToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('[REQ-VET-003] 2 000 tokens consecutivos nunca coinciden (entropía de 256 bits) y ninguno deriva de un contador ni de una fecha', () => {
    const generator = new CryptoTokenGenerator();
    const tokens = Array.from({ length: 2000 }, () => generator.nextShareToken());
    expect(new Set(tokens).size).toBe(2000);
    expect(tokens.filter((t) => /^(?:A{10}|0{10})/.test(t))).toEqual([]);
  });

  it('[INV-005-005][REQ-VET-003] el puerto solo genera: no expone hash ni comparación, y el adaptador usa randomBytes de node:crypto, nunca Math.random', () => {
    const source = readFileSync(new URL('../../../src/infrastructure/adapters/crypto-token-generator.adapter.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/randomBytes\(32\)/);
    expect(source).not.toMatch(/Math\.random|createHash|timingSafeEqual/);
    expect(Object.getOwnPropertyNames(CryptoTokenGenerator.prototype).sort()).toEqual(['constructor', 'nextShareToken']);
  });

  it('[REQ-VET-003][INV-ARCH-004] la comparación del hash del dominio es en tiempo constante (acumula XOR de todos los caracteres, sin ===) y el dominio no importa node:*', () => {
    const source = readFileSync(new URL('../../../src/domain/sharing/share-token.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).toMatch(/\^ \(b\.charCodeAt/);
    expect(source).not.toMatch(/from 'node:|return a === b|a === b/);
    for (const probe of ['', 'a', hashToken('x'), hashToken('y')]) expect(hashesEqual(hashToken('x'), probe)).toBe(probe === hashToken('x'));
  });
});

describe('T760 SharedAccessLimiter (REQ-VET-007, D5-13, MIF-005-12)', () => {
  const at = (seconds: number) => new Date(Date.parse('2026-11-18T12:00:00.000Z') + seconds * 1000).toISOString();

  it('[SC-005-021] 20 fallos en 10 minutos desde la misma IP: el 21.º intento está limitado; otra IP no', () => {
    const limiter = new SharedAccessLimiter();
    for (let n = 0; n < 20; n += 1) {
      expect(limiter.isLimited('1.1.1.1', at(n))).toBe(false);
      limiter.recordFailure('1.1.1.1', at(n));
    }
    expect(limiter.isLimited('1.1.1.1', at(21))).toBe(true);
    expect(limiter.isLimited('2.2.2.2', at(21))).toBe(false);
  });

  it('[SC-005-021] pasados 10 minutos desde el primer fallo de la ventana el contador se reinicia', () => {
    const limiter = new SharedAccessLimiter();
    for (let n = 0; n < 20; n += 1) limiter.recordFailure('1.1.1.1', at(n));
    expect(limiter.isLimited('1.1.1.1', at(599))).toBe(true);
    expect(limiter.isLimited('1.1.1.1', at(600))).toBe(false);
  });

  it('[MIF-005-12] el mapa tiene un tope duro de entradas: con el tope lleno tras el barrido, una IP nueva queda limitada (429 fail-closed) y el tamaño nunca lo supera', () => {
    const limiter = new SharedAccessLimiter({ maxEntries: 5 });
    for (let n = 0; n < 5; n += 1) limiter.recordFailure(`10.0.0.${n}`, at(0));
    expect(limiter.size).toBe(5);
    expect(limiter.isLimited('10.0.0.99', at(1))).toBe(true);
    limiter.recordFailure('10.0.0.99', at(1));
    expect(limiter.size).toBe(5);
    expect(limiter.isLimited('10.0.0.1', at(2))).toBe(false);
  });

  it('[MIF-005-12] el barrido retira las ventanas vencidas: tras 10 minutos el mapa vuelve a admitir IPs nuevas', () => {
    const limiter = new SharedAccessLimiter({ maxEntries: 3 });
    for (let n = 0; n < 3; n += 1) limiter.recordFailure(`10.0.0.${n}`, at(0));
    expect(limiter.isLimited('10.0.9.9', at(1))).toBe(true);
    expect(limiter.isLimited('10.0.9.9', at(601))).toBe(false);
    limiter.recordFailure('10.0.9.9', at(601));
    expect(limiter.size).toBe(1);
  });

  it('[PN-11] no hay exención por token válido: la limitación solo mira la IP y los éxitos no se registran', () => {
    const limiter = new SharedAccessLimiter();
    for (let n = 0; n < 20; n += 1) limiter.recordFailure('1.1.1.1', at(n));
    expect(limiter.isLimited('1.1.1.1', at(30))).toBe(true);
    expect(limiter.size).toBe(1);
  });

  it('[REQ-VET-007] reset vacía el mapa (solo para pruebas) y el Retry-After fijo es 600 s', () => {
    const limiter = new SharedAccessLimiter();
    limiter.recordFailure('1.1.1.1', at(0));
    limiter.reset();
    expect(limiter.size).toBe(0);
    expect(SharedAccessLimiter.RETRY_AFTER_SECONDS).toBe(600);
  });
});
