/**
 * T514 [N2]: compuertas y compilador de contratos reconocen la feature 004 (catálogos, prefijos SC/NFR, rangos de IDs).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const SLOW = 180_000;
const CONTRACTS_004 = join(ROOT, 'specs/004-catalogos-registros-archivos/contracts');
const work: string[] = [];
const temp = (): string => {
  const cache = join(ROOT, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-gates004-'));
  work.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});
const run = (script: string, args: string[]): { status: number | null; output: string } => {
  const res = spawnSync('bash', [join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
};

describe('T514 compile-contracts.sh --feature 004', () => {
  it('REQ-RAZ-001: compila catálogos y contratos 3.1.0 bajo --out sin tocar las salidas de la 002', { timeout: SLOW }, () => {
    const out = temp();
    const res = run('compile-contracts.sh', ['--feature', '004', '--out', out]);
    expect(res.status, res.output).toBe(0);
    const catalog = readFileSync(join(out, 'catalogs/breeds.catalog.ts'), 'utf8');
    expect(catalog).toContain('"code": "DOG_AKITA"');
    expect(catalog).toContain('export const BREEDS_CATALOG_VERSION = "0.1.0"');
    expect(existsSync(join(out, 'v31/schemas/validators.cjs'))).toBe(true);
    expect(existsSync(join(out, 'v31/errors/error-codes.ts'))).toBe(true);
    expect(readFileSync(join(out, 'v31/errors/error-codes.ts'), 'utf8')).toContain('ERR-REC-CONFLICT');
    expect(existsSync(join(out, 'api'))).toBe(false);
    expect(existsSync(join(out, 'schemas'))).toBe(false);
  });

  it('INV-ARCH-003: la 004 no puede escribir sobre artefactos de la 002 ni de la 003', () => {
    for (const target of ['src/generated/api', 'src/generated/schemas', 'src/generated/ops']) {
      const res = run('compile-contracts.sh', ['--feature', '004', '--out', target]);
      expect(res.status, target).toBe(2);
      expect(res.output).toContain('no puede escribir');
    }
  });

  it('INV-ARCH-003: compilar la 002 con --out conserva los directorios ajenos ops, catalogs y v31', { timeout: SLOW }, () => {
    const out = temp();
    for (const dir of ['ops', 'catalogs', 'v31']) {
      mkdirSync(join(out, dir), { recursive: true });
      writeFileSync(join(out, dir, 'marca.txt'), dir, 'utf8');
    }
    const res = run('compile-contracts.sh', ['--feature', '002', '--out', out]);
    expect(res.status, res.output).toBe(0);
    for (const dir of ['ops', 'catalogs', 'v31']) expect(readFileSync(join(out, dir, 'marca.txt'), 'utf8')).toBe(dir);
    expect(existsSync(join(out, 'api/client.ts'))).toBe(true);
  });

  it('REQ-RAZ-001: el catálogo con prefijo distinto de la especie detiene la compilación (SC-CAT-032)', () => {
    const contracts = temp();
    cpSync(join(CONTRACTS_004, 'catalogs'), join(contracts, 'catalogs'), { recursive: true });
    const file = join(contracts, 'catalogs/breeds.catalog.json');
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { entries: { code: string; species: string }[] };
    const akita = doc.entries.find((e) => e.code === 'DOG_AKITA');
    if (!akita) throw new Error('DOG_AKITA ausente');
    akita.species = 'FELINE';
    writeFileSync(file, JSON.stringify(doc), 'utf8');
    const res = spawnSync(process.execPath, [join(ROOT, 'scripts/codegen-catalogs.mjs'), '--contracts', contracts, '--out', temp()], { cwd: ROOT, encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('prefijo del code distinto de la especie en DOG_AKITA');
  });

  it('INV-RAZ-001: un code duplicado o fuera del patrón detiene la compilación', () => {
    const cases: [string, (doc: { entries: { code: string }[] }) => void, string][] = [
      ['duplicado', (doc) => { doc.entries.push({ ...doc.entries[2]! }); }, 'code duplicado'],
      ['patrón', (doc) => { doc.entries[2]!.code = 'dog_akita'; }, 'code fuera del patrón'],
    ];
    for (const [label, mutate, message] of cases) {
      const contracts = temp();
      cpSync(join(CONTRACTS_004, 'catalogs'), join(contracts, 'catalogs'), { recursive: true });
      const file = join(contracts, 'catalogs/breeds.catalog.json');
      const doc = JSON.parse(readFileSync(file, 'utf8')) as { entries: { code: string }[] };
      mutate(doc);
      writeFileSync(file, JSON.stringify(doc), 'utf8');
      const res = spawnSync(process.execPath, [join(ROOT, 'scripts/codegen-catalogs.mjs'), '--contracts', contracts, '--out', temp()], { cwd: ROOT, encoding: 'utf8' });
      expect(res.status, label).toBe(1);
      expect(res.stderr, label).toContain(message);
    }
  });

  it('REQ-RAZ-001: el order recalculado coincide con el del archivo (Criolla 1, alfabético sin tildes, Otra 9999)', () => {
    const out = temp();
    const res = spawnSync(process.execPath, [join(ROOT, 'scripts/codegen-catalogs.mjs'), '--contracts', CONTRACTS_004, '--out', out], { cwd: ROOT, encoding: 'utf8' });
    expect(res.status, res.stderr).toBe(0);
    const source = JSON.parse(readFileSync(join(CONTRACTS_004, 'catalogs/breeds.catalog.json'), 'utf8')) as { entries: { code: string; order: number }[] };
    const generated = readFileSync(join(out, 'breeds.catalog.ts'), 'utf8');
    for (const entry of source.entries) {
      expect(generated, entry.code).toContain(`"code": "${entry.code}",`);
      expect(generated, entry.code).toMatch(new RegExp(`"code": "${entry.code}",[^}]*"order": ${entry.order},`));
    }
  });
});

describe('T514 verify-traceability.sh --feature 004', () => {
  it('REQ-ESP-001: con error-catalog.json la compuerta final cumple y exige spec→tasks 1:1 de los IDs propios', { timeout: SLOW }, () => {
    const res = run('verify-traceability.sh', ['--feature', '004']);
    expect(res.status, res.output).toBe(0);
    expect(res.output).toMatch(/Spec→tasks 1:1: (\d+)\/\1 IDs propios de la 004/);
    expect(res.output).toContain('Resultado: CUMPLE');
  });

  it('NFR-ALM-004: reconoce los prefijos NFR y SC de la 004 en la compuerta por tarea', () => {
    const res = run('verify-traceability.sh', ['--feature', '004', '--task', 'T514']);
    expect(res.status, res.output).toBe(0);
    expect(res.output).toContain('NFR-ALM-004');
    expect(res.output).toContain('REQ-ESP-001');
  });

  it('SC-CAT-016: expande los rangos SC-CAT-016..021 de la fila de la tarea', () => {
    const tasks = readFileSync(join(ROOT, 'specs/004-catalogos-registros-archivos/tasks.md'), 'utf8');
    const row = tasks.split('\n').find((l) => /^- \[[ xX]\] T\d{3} /.test(l) && l.includes('SC-CAT-016..021'));
    const id = row?.match(/^- \[[ xX]\] (T\d{3}) /)?.[1];
    expect(id).toMatch(/^T\d{3}$/);
    const res = run('verify-traceability.sh', ['--feature', '004', '--task', id as string]);
    expect(res.status, res.output).toBe(0);
    for (const inner of ['SC-CAT-016', 'SC-CAT-017', 'SC-CAT-018', 'SC-CAT-019', 'SC-CAT-020', 'SC-CAT-021']) {
      expect(res.output, inner).toContain(inner);
    }
  });

  it('REQ-ESP-001: la 001, 002 y 003 conservan su conducta (no exigen la expansión de rangos de la 004)', { timeout: SLOW }, () => {
    for (const feature of ['002', '003']) {
      const res = run('verify-traceability.sh', ['--feature', feature]);
      expect(res.status, `${feature}\n${res.output}`).toBe(0);
    }
  });
});

describe('T514 verify-oracles.sh --feature 004', () => {
  it('NFR-ALM-004: acepta --feature 004 y rechaza una feature desconocida', () => {
    const ok = run('verify-oracles.sh', ['--feature', '004']);
    expect(ok.status, ok.output).toBe(0);
    expect(ok.output).toContain('feature 004');
    const unknown = run('verify-oracles.sh', ['--feature', '009']);
    expect(unknown.status).toBe(2);
  });

  it('NFR-ALM-004: con --feature 004 también detecta los oráculos débiles de las pruebas de contrato 004', () => {
    const ok = run('verify-oracles.sh', ['--feature', '004']);
    expect(ok.output).toMatch(/contratos 004: \d+ archivos/);
  });
});
