import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveSceneSeed } from '../../src/domain/scene/scene-seed.ts';

/**
 * T1073 (007, Bloque G): `deriveSceneSeed(attempt.id)`, FNV-1a de 32 bits sobre los code points con máscara 0x7fffffff (REQ-ESC7-007, EDGE-007-025, SC-007-042).
 * Oráculo independiente: FNV-1a con BigInt (la implementación usa aritmética entera de 32 bits).
 */
const MAX_SEED = 2 ** 31 - 1;

/** FNV-1a de 32 bits con BigInt: no comparte código con la implementación. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5n;
  for (const ch of text) {
    hash ^= BigInt(ch.codePointAt(0)!);
    hash = (hash * 0x01000193n) & 0xffffffffn;
  }
  return Number(hash & 0x7fffffffn);
}

/** UUID v4 deterministas a partir de un contador (LCG de 32 bits), sin entropía. */
function uuids(count: number): string[] {
  let state = 123456789;
  const hex = (bytes: number): string => {
    let out = '';
    for (let i = 0; i < bytes; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      out += (state >>> 24).toString(16).padStart(2, '0');
    }
    return out;
  };
  return Array.from({ length: count }, () => `${hex(4)}-${hex(2)}-4${hex(2).slice(1)}-8${hex(2).slice(1)}-${hex(6)}`);
}

describe('deriveSceneSeed (REQ-ESC7-007, SC-007-042)', () => {
  it('REQ-ESC7-007: devuelve un entero en [0, 2^31-1] para 1000 UUID', () => {
    for (const id of uuids(1000)) {
      const seed = deriveSceneSeed(id);
      expect([Number.isInteger(seed), seed >= 0, seed <= MAX_SEED]).toEqual([true, true, true]);
    }
  });

  it('REQ-ESC7-007: coincide con FNV-1a de 32 bits sobre los code points enmascarado a 31 bits (vectores conocidos y UUID)', () => {
    expect([deriveSceneSeed(''), deriveSceneSeed('a'), deriveSceneSeed('foobar')]).toEqual([0x011c9dc5, 0x640c292c, 0x3f9cf968]);
    for (const id of uuids(200)) expect(deriveSceneSeed(id)).toBe(fnv1a(id));
  });

  it('REQ-ESC7-007: es idéntica en 100 llamadas con el mismo attempt.id', () => {
    const id = 'c4000000-0000-4000-8000-000000000001';
    const first = deriveSceneSeed(id);
    expect(Array.from({ length: 100 }, () => deriveSceneSeed(id)).every((seed) => seed === first)).toBe(true);
  });

  it('SC-007-042: difiere entre UUID distintos en al menos el 99 % de los pares comprobados por muestreo (1000 UUID)', () => {
    const ids = uuids(1000);
    const seeds = ids.map(deriveSceneSeed);
    let different = 0;
    for (let i = 0; i + 1 < seeds.length; i += 1) if (seeds[i] !== seeds[i + 1]) different += 1;
    expect(different / (seeds.length - 1)).toBeGreaterThanOrEqual(0.99);
    expect(new Set(seeds).size).toBeGreaterThanOrEqual(990);
  });

  it('EDGE-007-025: es total ante entradas vacías, que no son UUID, con code points fuera del BMP y muy largas (siempre entero en rango)', () => {
    for (const id of ['', ' ', 'no-es-uuid', '\u{1F415}\u{1F408}', 'ñandú-ü', 'x'.repeat(10_000), '0'.repeat(36)]) {
      const seed = deriveSceneSeed(id);
      expect([Number.isInteger(seed), seed >= 0, seed <= MAX_SEED]).toEqual([true, true, true]);
      expect(seed).toBe(fnv1a(id));
    }
  });

  it('REQ-ESC7-007: pureza del módulo, sin reloj, entropía, node:* ni variables de entorno y sin importar nada (INV-ARCH-001, INV-ARCH-002)', () => {
    const source = readFileSync(join(process.cwd(), 'src/domain/scene/scene-seed.ts'), 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/\bDate\b|\bMath\s*\.\s*random\b|\bcrypto\b|\bprocess\s*\.\s*env\b|\brandomUUID\b|\bperformance\b/);
    expect(source).not.toMatch(/^\s*import\b/m);
  });
});
