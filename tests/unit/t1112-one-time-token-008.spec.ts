import { createHash, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ONE_TIME_TOKEN_BYTES,
  ONE_TIME_TOKEN_TTL_SECONDS,
  codeChallengeS256,
  consumeOneTimeToken,
  constantTimeEqual,
  evaluateOneTimeToken,
  generateOneTimeToken,
  hashOneTimeToken,
  isWellFormedOneTimeToken,
  issueOneTimeToken,
  type OneTimeTokenEntropyPort,
  type OneTimeTokenRecord,
} from '../../src/domain/auth/one-time-token.ts';

/**
 * T1112 (pruebas rojas, Feature 008, [GH:#16]): funciones puras del identificador opaco de un solo uso del estado del flujo de Google.
 * REQ-SSO8-004, SC-008-005. La entropía y el reloj entran por parámetro (Principio II): ninguna prueba lee `Date` ni `crypto` para el dominio.
 * El SHA-256 y la comparación se contrastan aquí contra `node:crypto` como oráculo independiente.
 */

const NOW = '2026-11-21T12:00:00.000Z';

const fixedEntropy = (fill: number): OneTimeTokenEntropyPort & { readonly asked: number[] } => {
  const asked: number[] = [];
  return {
    asked,
    randomBytes(length: number): Uint8Array {
      asked.push(length);
      return new Uint8Array(length).fill(fill);
    },
  };
};

const sequenceEntropy = (): OneTimeTokenEntropyPort => {
  let counter = 0;
  return {
    randomBytes(length: number): Uint8Array {
      counter += 1;
      return Uint8Array.from({ length }, (_, i) => (counter * 31 + i * 7) % 256);
    },
  };
};

describe('[REQ-SSO8-004] generación del identificador opaco', () => {
  it('pide exactamente 32 bytes a la entropía y los codifica en base64url sin relleno (43 caracteres)', () => {
    const entropy = fixedEntropy(0xff);
    const token = generateOneTimeToken(entropy);
    expect(entropy.asked).toEqual([ONE_TIME_TOKEN_BYTES]);
    expect(ONE_TIME_TOKEN_BYTES).toBe(32);
    expect(token).toHaveLength(43);
    expect(token).toBe(Buffer.alloc(32, 0xff).toString('base64url'));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('codifica bytes arbitrarios igual que base64url de Node (incluye los alfabetos - y _)', () => {
    const entropy = sequenceEntropy();
    for (let i = 0; i < 20; i += 1) {
      const bytes = entropy.randomBytes(32);
      const probe: OneTimeTokenEntropyPort = { randomBytes: () => bytes };
      expect(generateOneTimeToken(probe)).toBe(Buffer.from(bytes).toString('base64url'));
    }
  });

  it('rechaza una entropía que devuelve una longitud distinta de 32 (fail-closed)', () => {
    const short: OneTimeTokenEntropyPort = { randomBytes: () => new Uint8Array(16) };
    expect(() => generateOneTimeToken(short)).toThrow();
  });

  it('dos llamadas con entropía distinta producen identificadores distintos', () => {
    const entropy = sequenceEntropy();
    expect(generateOneTimeToken(entropy)).not.toBe(generateOneTimeToken(entropy));
  });

  it('isWellFormedOneTimeToken exige 43 caracteres base64url y nada más', () => {
    expect(isWellFormedOneTimeToken('A'.repeat(43))).toBe(true);
    expect(isWellFormedOneTimeToken('A'.repeat(42))).toBe(false);
    expect(isWellFormedOneTimeToken('A'.repeat(44))).toBe(false);
    expect(isWellFormedOneTimeToken(`${'A'.repeat(42)}=`)).toBe(false);
    expect(isWellFormedOneTimeToken(`${'A'.repeat(42)}+`)).toBe(false);
    expect(isWellFormedOneTimeToken('')).toBe(false);
  });
});

describe('[REQ-SSO8-004] SHA-256 del identificador (solo el hash se guarda)', () => {
  it('hashOneTimeToken coincide con SHA-256 hexadecimal de node:crypto (64 caracteres)', () => {
    const token = generateOneTimeToken(sequenceEntropy());
    expect(hashOneTimeToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashOneTimeToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el hash no contiene el identificador en claro', () => {
    const token = generateOneTimeToken(fixedEntropy(7));
    expect(hashOneTimeToken(token)).not.toContain(token.slice(0, 8));
  });

  it('codeChallengeS256 es base64url(SHA-256(verificador)) sin relleno (RFC 7636, vector del apéndice B)', () => {
    expect(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const verifier = generateOneTimeToken(sequenceEntropy());
    expect(codeChallengeS256(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('[REQ-SSO8-004] vencimiento a 900 s', () => {
  it('issueOneTimeToken devuelve token, hash y expiresAt = ahora + 900 s', () => {
    const issued = issueOneTimeToken(fixedEntropy(1), NOW);
    expect(ONE_TIME_TOKEN_TTL_SECONDS).toBe(900);
    expect(issued.expiresAt).toBe('2026-11-21T12:15:00.000Z');
    expect(issued.tokenHash).toBe(hashOneTimeToken(issued.token));
    expect(issued.token).toHaveLength(43);
  });

  it('cruza correctamente el límite de día y de mes', () => {
    expect(issueOneTimeToken(fixedEntropy(1), '2026-11-30T23:50:00.000Z').expiresAt).toBe('2026-12-01T00:05:00.000Z');
  });

  const record = (over: Partial<OneTimeTokenRecord> = {}, token = 'T'.repeat(43)): OneTimeTokenRecord => ({
    tokenHash: hashOneTimeToken(token),
    expiresAt: '2026-11-21T12:15:00.000Z',
    consumedAt: null,
    ...over,
  });

  it('VALID un milisegundo antes del vencimiento; EXPIRED exactamente en expiresAt y después', () => {
    const token = 'T'.repeat(43);
    expect(evaluateOneTimeToken(record(), token, '2026-11-21T12:14:59.999Z')).toBe('VALID');
    expect(evaluateOneTimeToken(record(), token, '2026-11-21T12:15:00.000Z')).toBe('EXPIRED');
    expect(evaluateOneTimeToken(record(), token, '2026-11-21T13:00:00.000Z')).toBe('EXPIRED');
  });

  it('MALFORMED para una cadena sin la forma de identificador (no calcula coincidencia)', () => {
    expect(evaluateOneTimeToken(record(), 'corto', NOW)).toBe('MALFORMED');
    expect(evaluateOneTimeToken(record(), '', NOW)).toBe('MALFORMED');
    expect(evaluateOneTimeToken(record(), `${'T'.repeat(42)}!`, NOW)).toBe('MALFORMED');
  });

  it('MISMATCH cuando el identificador bien formado no corresponde al hash guardado', () => {
    expect(evaluateOneTimeToken(record(), 'U'.repeat(43), NOW)).toBe('MISMATCH');
  });

  it('CONSUMED cuando el registro ya fue usado, aunque no haya vencido', () => {
    expect(evaluateOneTimeToken(record({ consumedAt: '2026-11-21T12:01:00.000Z' }), 'T'.repeat(43), NOW)).toBe('CONSUMED');
  });

  it('un token distinto de un registro consumido y vencido sigue siendo MISMATCH (la coincidencia manda)', () => {
    expect(evaluateOneTimeToken(record({ consumedAt: NOW, expiresAt: '2026-01-01T00:00:00.000Z' }), 'U'.repeat(43), NOW)).toBe('MISMATCH');
  });
});

describe('[REQ-SSO8-004] un solo uso por compare-and-set (SC-008-005)', () => {
  const token = 'K'.repeat(43);
  const fresh = (): OneTimeTokenRecord => ({ tokenHash: hashOneTimeToken(token), expiresAt: '2026-11-21T12:15:00.000Z', consumedAt: null });

  it('el primer consumo gana: devuelve VALID con el registro marcado y el original intacto', () => {
    const original = fresh();
    const result = consumeOneTimeToken(original, token, NOW);
    expect(result.outcome).toBe('VALID');
    expect(result.record.consumedAt).toBe(NOW);
    expect(original.consumedAt).toBeNull();
  });

  it('el segundo consumo del registro ya marcado pierde (state reutilizado = CONSUMED) y no cambia el instante', () => {
    const first = consumeOneTimeToken(fresh(), token, NOW);
    const second = consumeOneTimeToken(first.record, token, '2026-11-21T12:05:00.000Z');
    expect(second.outcome).toBe('CONSUMED');
    expect(second.record).toEqual(first.record);
  });

  it('un consumo que no es VALID nunca marca el registro (vencido, desconocido, malformado)', () => {
    expect(consumeOneTimeToken(fresh(), token, '2026-11-21T12:15:00.000Z')).toEqual({ outcome: 'EXPIRED', record: fresh() });
    expect(consumeOneTimeToken(fresh(), 'J'.repeat(43), NOW)).toEqual({ outcome: 'MISMATCH', record: fresh() });
    expect(consumeOneTimeToken(fresh(), 'x', NOW)).toEqual({ outcome: 'MALFORMED', record: fresh() });
  });
});

describe('[REQ-SSO8-004] comparación a tiempo constante', () => {
  it('constantTimeEqual coincide con timingSafeEqual en igualdad, diferencia en cualquier posición y longitudes distintas', () => {
    const a = 'a'.repeat(64);
    expect(constantTimeEqual(a, a)).toBe(true);
    expect(timingSafeEqual(Buffer.from(a), Buffer.from(a))).toBe(true);
    for (const position of [0, 31, 63]) {
      const b = `${a.slice(0, position)}b${a.slice(position + 1)}`;
      expect(constantTimeEqual(a, b)).toBe(false);
    }
    expect(constantTimeEqual(a, a.slice(0, 63))).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('é', 'e')).toBe(false);
  });
});
