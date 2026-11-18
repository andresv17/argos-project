/**
 * T515: src/generated/{v31,catalogs} publicados por compile-contracts.sh --feature 004 (nunca a mano) y pruebas de contrato.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BREEDS, BREEDS_CATALOG_VERSION, BREED_CODE_PATTERN, breedsFor, findBreed } from '../../../src/generated/catalogs/index.ts';
import { ERROR_CATALOG } from '../../../src/generated/v31/errors/error-codes.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const GENERATED = join(ROOT, 'src/generated');
const require = createRequire(import.meta.url);
const work: string[] = [];
afterAll(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

const readTree = (dir: string): Record<string, string> => {
  const tree: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry !== '.gitkeep') tree[relative(dir, full)] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return tree;
};

type Validator = ((data: unknown) => boolean) & { errors?: { instancePath: string; keyword: string }[] | null };
const v31 = require(join(GENERATED, 'v31/schemas/validators.cjs')) as Record<string, Validator>;
const validator = (name: string): Validator => {
  const fn = v31[name];
  if (!fn) throw new Error(`validador ausente ${name}`);
  return fn;
};

describe('T515 catálogo de razas publicado', () => {
  it('REQ-RAZ-001: el catálogo generado tiene 68 razas con código único del patrón y prefijo igual a la especie', () => {
    expect(BREEDS).toHaveLength(68);
    const pattern = new RegExp(BREED_CODE_PATTERN);
    expect(new Set(BREEDS.map((b) => b.code)).size).toBe(68);
    for (const breed of BREEDS) {
      expect(breed.code, breed.code).toMatch(pattern);
      expect(breed.code.startsWith(breed.species === 'CANINE' ? 'DOG_' : 'CAT_'), breed.code).toBe(true);
    }
    expect(BREEDS_CATALOG_VERSION).toBe('0.1.0');
  });

  it('INV-RAZ-001: Criolla va primero y Otra al final por especie; breedsFor omite las deprecadas', () => {
    for (const [species, prefix] of [['CANINE', 'DOG_'], ['FELINE', 'CAT_']] as const) {
      const own = breedsFor(species);
      expect(own[0]?.code).toBe(`${prefix}CRIOLLA`);
      expect(own[own.length - 1]?.code).toBe(`${prefix}OTHER`);
      expect(own.map((b) => b.order)).toEqual([...own.map((b) => b.order)].sort((a, b) => a - b));
    }
    expect(findBreed('DOG_AKITA')?.label).toBe('Akita');
    expect(findBreed('DOG_INEXISTENTE')).toEqual(undefined);
  });

  it('REQ-RAZ-001: los códigos del catálogo son los que acepta el validador de CreatePetInput con su especie', () => {
    const create = validator('validateCreatePetInput');
    const base = { name: 'Luna', sex: 'FEMALE', birthDate: '2020-01-01' };
    for (const breed of BREEDS) {
      expect(create({ ...base, species: breed.species, breedCode: breed.code }), breed.code).toBe(true);
    }
  });
});

describe('T515 validadores 3.1.0 generados', () => {
  it('REQ-MDC-001: la medida corporal decimal se rechaza y la entera se acepta', () => {
    const create = validator('validateCreateBodyMeasurementInput');
    const body = { recordedAt: '2026-11-01', neckCm: 35, chestCm: 60, backLengthCm: 45, waistCm: 50 };
    expect(create(body)).toBe(true);
    expect(create({ ...body, neckCm: 35.5 })).toBe(false);
  });

  it('REQ-SIN-001: SYMPTOM exige tipo y severidad en el validador generado', () => {
    const create = validator('validateCreateCustomParameterInput');
    const base = { recordedAt: '2026-11-01', title: 'Vómito', description: 'Tras comer', category: 'SYMPTOM' };
    expect(create({ ...base, symptomType: 'VOMIT', severity: 'MILD' })).toBe(true);
    expect(create(base)).toBe(false);
  });

  it('REQ-ARC-003: MediaAccess generado no admite disposition', () => {
    const access = validator('validateMediaAccess');
    const body = { url: 'https://bucket.storage.googleapis.com/o?sig=1', expiresAt: '2026-11-17T10:00:00.000Z', mime: 'application/pdf' };
    expect(access(body)).toBe(true);
    expect(access({ ...body, disposition: 'ATTACHMENT' })).toBe(false);
  });

  it('REQ-ARC-001: el catálogo de errores generado incluye los 6 errores nuevos', () => {
    for (const code of ['ERR-MEDIA-TOO-LARGE', 'ERR-MEDIA-TYPE-NOT-ALLOWED', 'ERR-MEDIA-QUOTA-EXCEEDED', 'ERR-MEDIA-NOT-FOUND', 'ERR-MEDIA-STORAGE-UNAVAILABLE', 'ERR-REC-CONFLICT']) {
      expect(ERROR_CATALOG[code as keyof typeof ERROR_CATALOG].type, code).toBe(`urn:argos:error:${code}`);
    }
  });
});

describe('T515 deriva de los artefactos generados', () => {
  it('INV-ARCH-003: src/generated/{v31,catalogs} coincide con una regeneración limpia desde los contratos 004', { timeout: 180_000 }, () => {
    const cache = join(ROOT, 'node_modules/.cache');
    mkdirSync(cache, { recursive: true });
    const out = mkdtempSync(join(cache, 'argos-gen004-'));
    work.push(out);
    const res = spawnSync('bash', [join(ROOT, 'scripts/compile-contracts.sh'), '--feature', '004', '--out', out], { cwd: ROOT, encoding: 'utf8' });
    expect(res.status, `${res.stdout}${res.stderr}`).toBe(0);
    for (const dir of ['v31', 'catalogs']) {
      expect(existsSync(join(GENERATED, dir)), dir).toBe(true);
      expect(readTree(join(GENERATED, dir)), dir).toEqual(readTree(join(out, dir)));
    }
  });

  it('INV-ARCH-003: los artefactos 004 no contienen IDs retirados ni la marca de edición manual ausente', () => {
    for (const [file, content] of Object.entries(readTree(join(GENERATED, 'v31')))) {
      expect(content.includes('ERR-PET-QUOTA-EXCEEDED'), file).toBe(false);
    }
    expect(readFileSync(join(GENERATED, 'catalogs/breeds.catalog.ts'), 'utf8')).toContain('DO NOT EDIT MANUALLY');
  });
});
