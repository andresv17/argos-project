import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const GENERATED = join(ROOT, 'src/generated');
const require = createRequire(import.meta.url);
const workDirs: string[] = [];
const SLOW = 120_000;

/** Dentro de node_modules/.cache (ignorado por git) para que validators.cjs resuelva ajv-formats. */
function makeTempDir(): string {
  const cache = join(ROOT, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-codegen-'));
  workDirs.push(dir);
  return dir;
}

function runCodegen(contractsDir: string, outDir: string): void {
  execFileSync(process.execPath, [join(ROOT, 'scripts/codegen.mjs'), '--contracts', contractsDir, '--out', outDir], {
    cwd: ROOT,
    stdio: 'pipe',
  });
}

function readTree(dir: string): Record<string, string> {
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
}

function copyContracts(): string {
  const dir = makeTempDir();
  cpSync(join(ROOT, 'contracts'), dir, { recursive: true });
  return dir;
}

type WeightValidator = (data: unknown) => boolean;

function loadWeightValidator(outDir: string): WeightValidator {
  const module = require(join(outDir, 'schemas/validators.cjs')) as { validateCreateWeightInput: WeightValidator };
  return module.validateCreateWeightInput;
}

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

describe('TASK-102: deriva y determinismo del generador', () => {
  it('INV-ARCH-003: src/generated coincide con una regeneración limpia desde contracts/', { timeout: SLOW }, () => {
    const out = makeTempDir();
    runCodegen(join(ROOT, 'contracts'), out);
    expect(readTree(GENERATED)).toEqual(readTree(out));
  });

  it('INV-ARCH-003: dos generaciones consecutivas producen salida idéntica', { timeout: SLOW }, () => {
    const first = makeTempDir();
    const second = makeTempDir();
    runCodegen(join(ROOT, 'contracts'), first);
    runCodegen(join(ROOT, 'contracts'), second);
    expect(readTree(first)).toEqual(readTree(second));
  });

  it('INV-ARCH-003: cambiar el maximum de weightKg en una copia temporal altera el validador generado', { timeout: SLOW }, () => {
    const original = loadWeightValidator(GENERATED);
    const contracts = copyContracts();
    const schemaPath = join(contracts, 'schemas/medical-records.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    schema.$defs.CreateWeightInput.properties.weightKg.maximum = 100;
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');

    const out = makeTempDir();
    runCodegen(contracts, out);
    const mutated = loadWeightValidator(out);

    const sample = { recordedAt: '2026-11-01', weightKg: 120 };
    expect(original(sample)).toBe(true);
    expect(mutated(sample)).toBe(false);
    expect(mutated({ recordedAt: '2026-11-01', weightKg: 100 })).toBe(true);
  });

  it('INV-ARCH-003: un x-sdd-error que no existe en el catálogo detiene la generación', { timeout: SLOW }, () => {
    const contracts = copyContracts();
    const schemaPath = join(contracts, 'schemas/medical-records.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    schema.$defs.CreateWeightInput.properties.weightKg['x-sdd-error'] = 'ERR-NO-EXISTE';
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');

    expect(() => runCodegen(contracts, makeTempDir())).toThrow();
  });

  it('INV-ARCH-003: la salida generada no contiene IDs retirados', () => {
    const tree = readTree(GENERATED);
    for (const [file, content] of Object.entries(tree)) {
      for (const retired of ['STATE-PET-QUOTA-001', 'ERR-PET-QUOTA-EXCEEDED']) {
        expect(content.includes(retired), `${file} contiene ${retired}`).toBe(false);
      }
    }
  });
});
