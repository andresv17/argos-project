/**
 * T516 [N2] [GOV]: compile-contracts.sh rechaza catálogos de razas inválidos (SC-CAT-032) y compila el vigente de 68 entradas.
 * Fixtures negativos: copia temporal de contracts/ de la 004 con el catálogo mutado; --contracts apunta a la copia.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const CONTRACTS_004 = join(ROOT, 'specs/004-catalogos-registros-archivos/contracts');
const SLOW = 180_000;
const work: string[] = [];

interface Entry { code: string; species: string; label: string; order: number; deprecated: boolean }
interface Doc { entries: Entry[] }

const temp = (): string => {
  const cache = join(ROOT, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-cat016-'));
  work.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

function compileWith(mutate: ((doc: Doc) => void) | null): { status: number | null; output: string; out: string } {
  const contracts = temp();
  cpSync(CONTRACTS_004, contracts, { recursive: true });
  const file = join(contracts, 'catalogs/breeds.catalog.json');
  const doc = JSON.parse(readFileSync(file, 'utf8')) as Doc;
  if (mutate) {
    mutate(doc);
    writeFileSync(file, JSON.stringify(doc), 'utf8');
  }
  const out = temp();
  const res = spawnSync('bash', [join(ROOT, 'scripts/compile-contracts.sh'), '--feature', '004', '--contracts', contracts, '--out', out], { cwd: ROOT, encoding: 'utf8' });
  return { status: res.status, output: `${res.stdout}${res.stderr}`, out };
}
const entry = (doc: Doc, code: string): Entry => {
  const found = doc.entries.find((e) => e.code === code);
  if (!found) throw new Error(`${code} ausente del catálogo`);
  return found;
};

describe('T516 SC-CAT-032: validación del catálogo de razas en compile-contracts.sh', () => {
  const negatives: [string, (doc: Doc) => void, string][] = [
    ['code sin prefijo', (doc) => { entry(doc, 'DOG_AKITA').code = 'AKITA'; }, 'code fuera del patrón'],
    ['prefijo distinto de la especie', (doc) => { entry(doc, 'DOG_AKITA').species = 'FELINE'; }, 'prefijo del code distinto de la especie en DOG_AKITA'],
    ['code duplicado', (doc) => { doc.entries.push({ ...entry(doc, 'DOG_AKITA'), label: 'Akita bis' }); }, 'code duplicado: DOG_AKITA'],
    ['rótulo duplicado por especie', (doc) => { entry(doc, 'DOG_BOXER').label = 'Akita'; }, 'rótulo duplicado en CANINE: Akita'],
  ];
  for (const [name, mutate, message] of negatives) {
    it(`rechaza ${name}: falla y no genera src/generated/catalogs/`, { timeout: SLOW }, () => {
      const res = compileWith(mutate);
      expect(res.status, res.output).toBe(1);
      expect(res.output).toContain(message);
      expect(existsSync(join(res.out, 'catalogs'))).toBe(false);
      expect(existsSync(join(res.out, 'v31'))).toBe(false);
    });
  }

  it('el mismo rótulo en especies distintas es válido (la unicidad es por especie)', { timeout: SLOW }, () => {
    const res = compileWith((doc) => { entry(doc, 'CAT_SIAMES').label = 'Akita'; });
    expect(res.status, res.output).toBe(0);
  });

  it('el catálogo vigente de 68 entradas compila', { timeout: SLOW }, () => {
    const res = compileWith(null);
    expect(res.status, res.output).toBe(0);
    expect(res.output).toContain('68 razas');
    expect(existsSync(join(res.out, 'catalogs/breeds.catalog.ts'))).toBe(true);
  });
});
