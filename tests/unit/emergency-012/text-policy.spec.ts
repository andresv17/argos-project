import { describe, expect, it } from 'vitest';
import { loadEmergencyModule, type TextPolicyModule } from '../../fixtures/emergency-modules.ts';
import { domainErrorOf, expectNoEcho } from './_support.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; PRUEBAS ROJAS hasta T1675; `/keymaker`): `TEXT_POLICY` (`emergency-card.schema.json`, 0.3.0; anexo §2) en `src/domain/emergency/text-policy.ts`, una sola función para
 * `criticalAllergies` (entrada) y `petName` (emisión pública). Falla hoy porque el módulo no existe. Firmas SUPUESTAS: `normalizeCriticalAllergies(input: unknown): string[]` (lanza `DomainError`
 * `ERR-SCHEMA-VALIDATION-FAILED` 422 sin eco) y `sanitizePublicPetName(name: string): string | null` (`null` = 404 uniforme, falla cerrada).
 *
 * @implements REQ-QR12-002, REQ-QR12-009, INV-QR12-002
 * Cubre SC-012-042, SC-012-043, SC-012-044, SC-012-045, SC-012-048 (normalización), SC-012-110.
 */
const m = await loadEmergencyModule<TextPolicyModule>('domain/emergency/text-policy');
const normalizeCriticalAllergies = (input: unknown): string[] => m.normalizeCriticalAllergies(input);
const sanitizePublicPetName = (name: string): string | null => m.sanitizePublicPetName(name);
const INVALID = 'ERR-SCHEMA-VALIDATION-FAILED';
const rejects = (items: unknown): Error & { code: string; status: number } => domainErrorOf(() => normalizeCriticalAllergies(items));

describe('T1674 normalizeCriticalAllergies (entrada)', () => {
  it('[SC-012-042] aplica NFC y trim, y devuelve la lista (0 a 5)', () => {
    expect(normalizeCriticalAllergies(['  Penicilina  ', 'Café'])).toEqual(['Penicilina', 'Café']);
    expect(normalizeCriticalAllergies([])).toEqual([]);
  });

  it('[SC-012-042] deduplica sin distinguir mayúsculas DESPUÉS de NFC y conserva la primera aparición con su grafía', () => {
    expect(normalizeCriticalAllergies(['Polen', 'polen', 'POLEN', 'Ácaros'])).toEqual(['Polen', 'Ácaros']);
    expect(normalizeCriticalAllergies(['CAFÉ', 'café'])).toEqual(['CAFÉ']);
  });

  it('[SC-012-042] NO elimina tildes: «Ácaro» y «Acaro» son distintos', () => {
    expect(normalizeCriticalAllergies(['Ácaro', 'Acaro'])).toEqual(['Ácaro', 'Acaro']);
  });

  it('[SC-012-110] el plegado de mayúsculas no depende de la configuración regional (la «I» turca no cambia el resultado)', () => {
    const original = process.env.LC_ALL;
    try {
      process.env.LC_ALL = 'tr_TR.UTF-8';
      expect(normalizeCriticalAllergies(['I', 'i', 'ı'])).toEqual(['I', 'ı']);
      expect(normalizeCriticalAllergies(['İ', 'i'])).toEqual(['İ', 'i']);
    } finally {
      if (original === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = original;
    }
  });

  it('[SC-012-043] longitud en puntos de código tras NFC y trim: 60 pasa, 61 falla (un emoji simple cuenta 1)', () => {
    expect(normalizeCriticalAllergies(['a'.repeat(60)])).toEqual(['a'.repeat(60)]);
    expect(normalizeCriticalAllergies(['😀'.repeat(60)])).toEqual(['😀'.repeat(60)]);
    expect(rejects(['a'.repeat(61)]).code).toBe(INVALID);
    expect(rejects(['😀'.repeat(61)]).code).toBe(INVALID);
  });

  it('[SC-012-043] más de 5 elementos, un elemento vacío o solo espacios, y entradas que no son lista de cadenas: 422 ERR-SCHEMA-VALIDATION-FAILED', () => {
    expect(normalizeCriticalAllergies(['a', 'b', 'c', 'd', 'e'])).toHaveLength(5);
    const six = rejects(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(six.code).toBe(INVALID);
    expect(six.status).toBe(422);
    expect(rejects(['']).code).toBe(INVALID);
    expect(rejects(['   ']).code).toBe(INVALID);
    expect(rejects([' ']).code).toBe(INVALID); // NBSP lo quita trim
    for (const bad of ['Penicilina', null, undefined, 7, {}, [1], [null], [['a']]]) expect(rejects(bad).code).toBe(INVALID);
  });

  it('[SC-012-043] los elementos duplicados cuentan una vez para el tope de 5 (se deduplica antes de contar)', () => {
    expect(normalizeCriticalAllergies(['a', 'A', 'b', 'B', 'c', 'C', 'd', 'e'])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  describe('[SC-012-044] categorías y caracteres rechazados (422 ERR-SCHEMA-VALIDATION-FAILED sin eco del valor)', () => {
    it.each([
      ['Cc (BEL)', 'Pen\u0007icilina'],
      ['Cc (NUL)', 'Pen\u0000icilina'],
      ['Cc (LF)', 'Pen\nicilina'],
      ['Cc (TAB)', 'Pen\ticilina'],
      ['Cf (espacio de ancho cero U+200B)', 'Pen​icilina'],
      ['Cf (ZWJ U+200D, limitación documentada)', 'Pen‍icilina'],
      ['Cf (guion blando U+00AD)', 'Pen­icilina'],
      ['Cf (BOM U+FEFF)', 'Pen﻿icilina'],
      ['bidi RLO U+202E', 'Pen‮icilina'],
      ['bidi LRI U+2066', 'Pen⁦icilina'],
      ['bidi LRM U+200E', 'Pen‎icilina'],
      ['bidi ALM U+061C', 'Pen؜icilina'],
      ['Zl U+2028', 'Pen icilina'],
      ['Zp U+2029', 'Pen icilina'],
      ['Co (uso privado U+E000)', 'Penicilina'],
      ['Cn (sin asignar U+0378)', 'Pen͸icilina'],
      ['Cs (sustituto suelto U+D800)', 'Pen\uD800icilina'],
      ['relleno invisible U+3164', 'Penㅤicilina'],
      ['relleno invisible U+115F', 'Penᅟicilina'],
      ['relleno invisible U+1160', 'Penᅠicilina'],
      ['relleno invisible U+FFA0', 'Penﾠicilina'],
      ['relleno invisible U+2800 (braille en blanco)', 'Pen⠀icilina'],
      ['relleno invisible U+17B4', 'Pen឴icilina'],
      ['relleno invisible U+180B', 'Pen᠋icilina'],
      ['relleno invisible U+034F', 'Pen͏icilina'],
    ])('rechaza %s', (_name, value) => {
      const error = rejects([value]);
      expect(error.code).toBe(INVALID);
      expect(error.status).toBe(422);
      expectNoEcho(error, value);
      expectNoEcho(error, 'icilina');
    });

    it('un elemento inválido invalida TODA la lista aunque los demás sean correctos', () => {
      expect(rejects(['Polen', 'Pen‮icilina', 'Ácaros']).code).toBe(INVALID);
    });

    it('rechaza más de 3 marcas combinantes consecutivas (Zalgo) y acepta exactamente 3', () => {
      expect(normalizeCriticalAllergies(['à́̂'])).toHaveLength(1);
      expect(rejects(['à́̂̃']).code).toBe(INVALID);
    });

    it('exige al menos un carácter visible (L, N, P o S): marcas solas, o solo Zs/M, se rechazan; un signo de puntuación o un número sí cuenta', () => {
      expect(rejects(['́̂']).code).toBe(INVALID);
      expect(normalizeCriticalAllergies(['...'])).toEqual(['...']);
      expect(normalizeCriticalAllergies(['2'])).toEqual(['2']);
      expect(normalizeCriticalAllergies(['😀'])).toEqual(['😀']);
    });
  });

  it('[SC-012-045] el texto se conserva como texto plano: HTML y enlaces no se transforman ni se interpretan', () => {
    expect(normalizeCriticalAllergies(['<b>Penicilina</b>', 'http://x.example'])).toEqual(['<b>Penicilina</b>', 'http://x.example']);
  });
});

describe('T1674 sanitizePublicPetName (emisión pública con la MISMA política)', () => {
  it('[SC-012-110] devuelve el nombre en NFC y trim; sin cambios si ya es válido', () => {
    expect(sanitizePublicPetName('  Luna ')).toBe('Luna');
    expect(sanitizePublicPetName('Nĩa')).toBe('Niña');
  });

  it('[SC-012-110] elimina los caracteres rechazados (Cc, Cf, bidi) y devuelve el resto', () => {
    expect(sanitizePublicPetName('Lu‮na')).toBe('Luna');
    expect(sanitizePublicPetName('Lu​na')).toBe('Luna');
  });

  it('[SC-012-110] devuelve null (404 uniforme, falla cerrada) si queda vacío o sin ningún carácter visible', () => {
    expect(sanitizePublicPetName('')).toBeNull();
    expect(sanitizePublicPetName('‮​')).toBeNull();
    expect(sanitizePublicPetName('ㅤㅤ')).toBeNull();
    expect(sanitizePublicPetName('   ')).toBeNull();
  });
});
