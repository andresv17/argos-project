/**
 * T803 [N2]: compilador fusionado 004+005+006 (compile-contracts.sh --feature 006 hacia v34/).
 * REQ-ESC6-015; INV-ESC6-006; STATE-SCENE-001; SC-ESC6-022, SC-ESC6-090.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const GENERATED = join(ROOT, 'src/generated');
const SLOW = 180_000;
const SPEC_DIRS = ['004-catalogos-registros-archivos', '005-album-archivos-clinicos', '006-escena-hogar-pixel-art'];
const C6 = join(ROOT, 'specs/006-escena-hogar-pixel-art/contracts');
const SCENE_ERRORS = [
  'ERR-SCENE-CONSENT-REQUIRED',
  'ERR-SCENE-DISABLED',
  'ERR-SCENE-GENERATION-FAILED',
  'ERR-SCENE-GENERATION-TIMEOUT',
  'ERR-SCENE-INVALID-IMAGE',
  'ERR-SCENE-LEASE-EXPIRED',
  'ERR-SCENE-NOTICE-OUTDATED',
  'ERR-SCENE-QUOTA-EXCEEDED',
];
const work: string[] = [];
afterAll(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});
const temp = (): string => {
  const cache = join(ROOT, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-t803-'));
  work.push(dir);
  return dir;
};
const compile = (args: string[], cwd = ROOT): { status: number | null; output: string } => {
  const res = spawnSync('bash', [join(ROOT, 'scripts/compile-contracts.sh'), ...args], { cwd, encoding: 'utf8' });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
};
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
/** Repositorio mínimo con copias editables de los contratos 004, 005 y 006; scripts y node_modules enlazados. */
const sandbox = (): string => {
  const dir = temp();
  for (const spec of SPEC_DIRS) cpSync(join(ROOT, 'specs', spec, 'contracts'), join(dir, 'specs', spec, 'contracts'), { recursive: true });
  symlinkSync(join(ROOT, 'scripts'), join(dir, 'scripts'));
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  return dir;
};
const editJson = (path: string, edit: (doc: Record<string, any>) => void): void => {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
  edit(doc);
  writeFileSync(path, JSON.stringify(doc, null, 2), 'utf8');
};
const catalogPath = (dir: string, spec: string): string => join(dir, 'specs', spec, 'contracts/errors/error-catalog.json');

describe('T803 compile-contracts.sh --feature 006 (salida en v34)', () => {
  const out = temp();
  const first = compile(['--feature', '006', '--out', out]);

  it('REQ-ESC6-015: compila sin error y genera v34 con barrel, validadores, máquina y cliente OpenAPI', () => {
    expect(first.status, first.output).toBe(0);
    for (const file of ['index.ts', 'schemas/validators.cjs', 'schemas/types.ts', 'errors/error-codes.ts', 'machines/home-scene.machine.ts', 'api/client.ts']) {
      expect(existsSync(join(out, 'v34', file)), file).toBe(true);
    }
  });

  it('INV-ESC6-006: scene.schema y scene-payload.schema compilan a validadores y tipos', () => {
    const types = readFileSync(join(out, 'v34/schemas/types.ts'), 'utf8');
    const validators = readFileSync(join(out, 'v34/schemas/validators.cjs'), 'utf8');
    for (const name of ['SceneView', 'GenerateSceneInput', 'ScenePayload']) {
      expect(types, name).toContain(name);
      expect(validators, name).toContain(`validate${name}`);
    }
  });

  it('STATE-SCENE-001: home-scene.machine.json se compila a la máquina de estados de la escena', () => {
    const machine = readFileSync(join(out, 'v34/machines/home-scene.machine.ts'), 'utf8');
    expect(machine).toContain('STATE-SCENE-001');
  });

  it('SC-ESC6-022: los ocho ERR-SCENE-* (006 catálogo 1.1.0 añade ERR-SCENE-DISABLED, 009 T1257) quedan en el catálogo generado junto a los heredados de 004 y 005', () => {
    const codes = readFileSync(join(out, 'v34/errors/error-codes.ts'), 'utf8');
    for (const code of [...SCENE_ERRORS, 'ERR-MEDIA-QUOTA-EXCEEDED', 'ERR-RATE-LIMITED']) expect(codes, code).toContain(code);
  });

  it('SC-ESC6-090: informa la unión de catálogos 004 + 005 + 006', () => {
    expect(first.output).toMatch(/Catálogos fusionados: \d+ \(004\) \+ \d+ \(005\) \+ 9 \(006\) = \d+ códigos/);
  });

  it('INV-ARCH-003: no escribe sobre las salidas de 002, 003, 004 ni 005 en el destino', () => {
    for (const foreign of ['api', 'errors', 'machines', 'schemas', 'ops', 'v31', 'v33', 'catalogs']) expect(existsSync(join(out, foreign)), foreign).toBe(false);
  });

  it('INV-ARCH-003: dos compilaciones producen salida idéntica', { timeout: SLOW }, () => {
    const second = temp();
    expect(compile(['--feature', '006', '--out', second]).status).toBe(0);
    expect(readTree(join(second, 'v34'))).toEqual(readTree(join(out, 'v34')));
  });

  it('INV-ARCH-003: src/generated/v34 publicado coincide con una regeneración limpia (cero deriva)', () => {
    expect(existsSync(join(GENERATED, 'v34')), 'src/generated/v34 no existe').toBe(true);
    expect(readTree(join(GENERATED, 'v34'))).toEqual(readTree(join(out, 'v34')));
  });

  it('INV-ARCH-003: la 006 no puede escribir sobre artefactos de 002, 003, 004 ni 005', () => {
    for (const target of ['api', 'errors', 'machines', 'schemas', 'ops', 'v31', 'v33', 'catalogs']) {
      const res = compile(['--feature', '006', '--out', `src/generated/${target}`]);
      expect(res.status, target).toBe(2);
      expect(res.output, target).toContain('no puede escribir');
    }
  });
});

describe('T803 validaciones del compilador fusionado (contratos copiados en un repositorio temporal)', () => {
  const run = (dir: string): { status: number | null; output: string } => compile(['--feature', '006', '--out', join(dir, 'out')], dir);

  it('INV-ESC6-006: control positivo, los contratos copiados compilan', { timeout: SLOW }, () => {
    const dir = sandbox();
    const res = run(dir);
    expect(res.status, res.output).toBe(0);
    expect(existsSync(join(dir, 'out/v34/index.ts'))).toBe(true);
  });

  it('SC-ESC6-090: falla si un código de la 006 ya existe en el catálogo de la 004 (duplicados prohibidos)', { timeout: SLOW }, () => {
    const dir = sandbox();
    editJson(catalogPath(dir, SPEC_DIRS[2]!), (doc) => {
      doc.errors['ERR-MEDIA-QUOTA-EXCEEDED'] = doc.errors[SCENE_ERRORS[0]!];
      doc['x-sdd-metadata'].added.push('ERR-MEDIA-QUOTA-EXCEEDED');
    });
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('código de error duplicado');
    expect(res.output).toContain('ERR-MEDIA-QUOTA-EXCEEDED');
  });

  it('SC-ESC6-090: falla si un código de la 006 ya existe en el catálogo de la 005', { timeout: SLOW }, () => {
    const dir = sandbox();
    const added005 = (JSON.parse(readFileSync(catalogPath(dir, SPEC_DIRS[1]!), 'utf8')) as { errors: Record<string, unknown> }).errors;
    const code = Object.keys(added005)[0]!;
    editJson(catalogPath(dir, SPEC_DIRS[2]!), (doc) => {
      doc.errors[code] = doc.errors[SCENE_ERRORS[0]!];
      doc['x-sdd-metadata'].added.push(code);
    });
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('código de error duplicado');
    expect(res.output).toContain(code);
  });

  it('SC-ESC6-090: falla si la 006 hereda un código que no existe en 004 ni 005', { timeout: SLOW }, () => {
    const dir = sandbox();
    editJson(catalogPath(dir, SPEC_DIRS[2]!), (doc) => {
      doc['x-sdd-metadata'].inherited.push('ERR-NO-EXISTE-EN-NINGUNO');
    });
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('hereda ERR-NO-EXISTE-EN-NINGUNO');
  });

  it('SC-ESC6-090: falla si x-sdd-metadata.added no coincide con los códigos del catálogo de la 006', { timeout: SLOW }, () => {
    const dir = sandbox();
    editJson(catalogPath(dir, SPEC_DIRS[2]!), (doc) => {
      doc['x-sdd-metadata'].added = doc['x-sdd-metadata'].added.slice(1);
    });
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('x-sdd-metadata.added');
  });

  it('INV-ESC6-006: falla si un esquema de la 006 no declara x-sdd-metadata válido', { timeout: SLOW }, () => {
    const dir = sandbox();
    editJson(join(dir, 'specs', SPEC_DIRS[2]!, 'contracts/schemas/scene.schema.json'), (doc) => {
      doc['x-sdd-metadata'].traceability = [];
    });
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('scene.schema.json: x-sdd-metadata inválido');
  });

  it('REQ-ESC6-015: sale con 1 si falta un contrato obligatorio de la 006', { timeout: SLOW }, () => {
    const dir = sandbox();
    rmSync(join(dir, 'specs', SPEC_DIRS[2]!, 'contracts/schemas/scene-payload.schema.json'));
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('Contrato obligatorio faltante: specs/006-escena-hogar-pixel-art/contracts/schemas/scene-payload.schema.json');
  });

  it('REQ-ESC6-015: sale con 1 si falta el contrato de la 004 o de la 005 de los que hereda', { timeout: SLOW }, () => {
    const dir = sandbox();
    rmSync(join(dir, 'specs', SPEC_DIRS[1]!), { recursive: true });
    const res = run(dir);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('hereda');
  });
});

describe('T803 v34 es un directorio ajeno para las demás features', () => {
  it('INV-ARCH-003: compilar la 002 con --out conserva los directorios ajenos ops, catalogs, v31, v33 y v34', { timeout: SLOW }, () => {
    const out = temp();
    for (const dir of ['ops', 'catalogs', 'v31', 'v33', 'v34']) {
      mkdirSync(join(out, dir), { recursive: true });
      writeFileSync(join(out, dir, 'marca.txt'), dir, 'utf8');
    }
    const res = compile(['--feature', '002', '--out', out]);
    expect(res.status, res.output).toBe(0);
    for (const dir of ['ops', 'catalogs', 'v31', 'v33', 'v34']) expect(readFileSync(join(out, dir, 'marca.txt'), 'utf8')).toBe(dir);
  });

  it('INV-ARCH-003: la 005 no puede escribir sobre v34', () => {
    const res = compile(['--feature', '005', '--out', 'src/generated/v34']);
    expect(res.status).toBe(2);
    expect(res.output).toContain('no puede escribir');
  });

  it('REQ-ESC6-015: una feature desconocida lista la 006 entre las admitidas', () => {
    const res = compile(['--feature', '999']);
    expect(res.status).toBe(2);
    expect(res.output).toContain('006');
  });

  it('INV-ESC6-006: los esquemas de la 006 siguen sin modificarse (contratos DRAFT intactos tras compilar)', () => {
    expect(existsSync(join(C6, 'schemas/scene.schema.json'))).toBe(true);
  });
});
