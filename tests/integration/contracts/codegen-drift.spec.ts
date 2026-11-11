import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  cpSync(join(ROOT, 'specs/001-pet-health-tracker/contracts'), dir, { recursive: true });
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

describe('deriva y determinismo del generador', () => {
  it('INV-ARCH-003: src/generated coincide con una regeneración limpia desde contracts/', { timeout: SLOW }, () => {
    // T207: src/generated se regenera desde los contratos 3.0.0 de la 002.
    const out = makeTempDir();
    runCodegen(join(ROOT, 'specs/002-plataforma-v21/contracts'), out);
    expect(readTree(GENERATED)).toEqual(readTree(out));
  });

  it('INV-ARCH-003: dos generaciones consecutivas producen salida idéntica', { timeout: SLOW }, () => {
    const first = makeTempDir();
    const second = makeTempDir();
    runCodegen(join(ROOT, 'specs/001-pet-health-tracker/contracts'), first);
    runCodegen(join(ROOT, 'specs/001-pet-health-tracker/contracts'), second);
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

    expect(() => runCodegen(contracts, makeTempDir())).toThrow(/ERR-NO-EXISTE/);
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

const CONTRACTS_002 = join(ROOT, 'specs/002-plataforma-v21/contracts');

function runCompile(args: string[], cwd = ROOT): { status: number | null; output: string } {
  const res = spawnSync('bash', [join(ROOT, 'scripts/compile-contracts.sh'), ...args], { cwd, encoding: 'utf8' });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

describe('T201: contratos multi-feature (compile-contracts.sh --feature y codegen.mjs --contracts)', () => {
  it('INV-ARCH-003: --feature 001 equivale al valor por defecto', { timeout: SLOW }, () => {
    // T207: src/generated ya es el de la 002, así que 001 se compara con el valor por defecto y no con src/generated.
    const out = makeTempDir();
    const res = runCompile(['--feature', '001', '--out', out]);
    expect(res.status).toBe(0);
    expect(res.output).toContain('specs/001-pet-health-tracker/contracts/');
    const byDefault = makeTempDir();
    expect(runCompile(['--out', byDefault]).status).toBe(0);
    expect(readTree(out)).toEqual(readTree(byDefault));
  });

  it('INV-ARCH-003: --feature 002 verifica los contratos de la 002 y genera en --out sin tocar src/generated', { timeout: SLOW }, () => {
    const before = readTree(GENERATED);
    const out = makeTempDir();
    const res = runCompile(['--feature', '002', '--out', out]);
    expect(res.status).toBe(0);
    expect(res.output).toContain('specs/002-plataforma-v21/contracts/');
    expect(res.output).toContain('13 contratos presentes');
    expect(existsSync(join(out, 'index.ts'))).toBe(true);
    expect(readTree(out)['errors/error-codes.ts']).toContain('ERR-AUTH-WEAK-PASSWORD');
    expect(readTree(out)).toEqual(readTree(GENERATED)); // T207: src/generated es la salida de la 002
    expect(readTree(GENERATED)).toEqual(before);
  });

  it('ERR-SCHEMA-VALIDATION-FAILED: --feature 002 falla con código 1 si falta un contrato de la 002', () => {
    const dir = makeTempDir();
    cpSync(CONTRACTS_002, join(dir, 'specs/002-plataforma-v21/contracts'), { recursive: true });
    rmSync(join(dir, 'specs/002-plataforma-v21/contracts/schemas/audit-entry.schema.json'));
    const res = runCompile(['--feature', '002', '--out', join(dir, 'out')], dir);
    expect(res.output).toContain('Contrato obligatorio faltante: specs/002-plataforma-v21/contracts/schemas/audit-entry.schema.json');
    expect(res.status).toBe(1);
  });

  it('INV-ARCH-003: una feature desconocida o un valor mal formado sale con código 2', () => {
    const unknown = runCompile(['--feature', '003']);
    expect(unknown.output).toContain('Feature desconocida: 003');
    expect(unknown.status).toBe(2);
    const missing = runCompile(['--feature']);
    expect(missing.output).toContain('Uso: --feature NNN');
    expect(missing.status).toBe(2);
  });

  it('INV-ARCH-003: dos generaciones desde los contratos de la 002 producen salida idéntica', { timeout: SLOW }, () => {
    const first = makeTempDir();
    const second = makeTempDir();
    runCodegen(CONTRACTS_002, first);
    runCodegen(CONTRACTS_002, second);
    expect(readTree(first)).toEqual(readTree(second));
  });

  it('ERR-SCHEMA-VALIDATION-FAILED: solo se registran x-sdd-metadata, x-sdd-status y x-sdd-error; otra palabra x-sdd-* detiene la generación', { timeout: SLOW }, () => {
    const contracts = makeTempDir();
    cpSync(CONTRACTS_002, contracts, { recursive: true });
    const schemaPath = join(contracts, 'schemas/pet.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    schema['x-sdd-extra'] = 'no registrada';
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
    expect(() => runCodegen(contracts, makeTempDir())).toThrow(/x-sdd-extra/);
  });

  it('ERR-SCHEMA-VALIDATION-FAILED: --contracts a una carpeta inexistente falla con un mensaje claro', () => {
    const res = spawnSync(process.execPath, [join(ROOT, 'scripts/codegen.mjs'), '--contracts', join(ROOT, 'specs/999-no-existe/contracts'), '--out', makeTempDir()], { cwd: ROOT, encoding: 'utf8' });
    expect(res.stderr).toContain('carpeta de contratos no existe');
    expect(res.status).toBe(1);
  });
});
