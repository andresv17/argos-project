import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Pruebas negativas de las compuertas (TASK-103): cada script falla ante un caso plantado.
 * Los repositorios de prueba son mínimos y se crean en node_modules/.cache (ignorado por git).
 * Los textos plantados se arman por concatenación para que las compuertas reales no los detecten en este archivo.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const TRACEABILITY = join(ROOT, 'scripts/verify-traceability.sh');
const ORACLES = join(ROOT, 'scripts/verify-oracles.sh');
const workDirs: string[] = [];

type Files = Record<string, string>;
interface GateRun {
  status: number | null;
  output: string;
}

const IMPL = '@' + 'implements';
const RETIRED = 'INV-OLD' + '-001';
// Títulos plantados: sin 'it(' ni 'describe(' literales, para no contar como títulos de este repositorio.
const IT = 'i' + 't';
const DESCRIBE = 'desc' + 'ribe';

const BASE: Files = {
  'specs/001-pet-health-tracker/spec.md': '# Spec demo\nREQ-DEMO-001 e INV-DEMO-001.\n',
  '.specify/memory/constitution.md': [
    '# Constitución demo',
    '## Core Principles',
    '### II. PUREZA',
    '1. `INV-ARCH-001`: reloj inyectado.',
    '### III. TRAZABILIDAD',
    '- **Requisitos:** `REQ-DEMO-001`..`002`.',
    `- **IDs retirados (no deben aparecer en código nuevo; solo en historial):** \`${RETIRED}\`.`,
    '### IV. UMBRALES',
    '',
  ].join('\n'),
  'specs/001-pet-health-tracker/tasks.md': [
    '# Tasks: demo',
    '- [ ] T900 Demo en `src/domain/demo.ts` (REQ-DEMO-001, ERR-DEMO-FAILED)',
    `- [ ] T901 Demo con un ID retirado (REQ-DEMO-001, ${RETIRED})`,
    '- [ ] T999 Compuerta final: todos los IDs vigentes de la constitución',
    '',
  ].join('\n'),
  'specs/001-pet-health-tracker/contracts/errors/error-catalog.json': JSON.stringify({ errors: { 'ERR-DEMO-FAILED': { status: 422 } } }),
  'src/domain/demo.ts': `/**\n * ${IMPL} REQ-DEMO-001, ERR-DEMO-FAILED\n */\nexport const demo = 1;\n`,
  'tests/unit/demo.spec.ts': `${IT}('[REQ-DEMO-001][ERR-DEMO-FAILED] demo', () => {});\n`,
};

const FULL: Files = {
  ...BASE,
  'src/domain/demo.ts': `/**\n * ${IMPL} REQ-DEMO-001, REQ-DEMO-002, INV-DEMO-001, INV-ARCH-001, ERR-DEMO-FAILED\n */\nexport const demo = 1;\n`,
  'tests/unit/demo.spec.ts': `${IT}('[REQ-DEMO-001][REQ-DEMO-002][INV-DEMO-001][INV-ARCH-001][ERR-DEMO-FAILED] demo', () => {});\n`,
};

function makeRepo(files: Files): string {
  const cache = join(ROOT, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-gates-'));
  workDirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

function run(script: string, files: Files, args: string[] = []): GateRun {
  const res = spawnSync('bash', [script, ...args], { cwd: makeRepo(files), encoding: 'utf8' });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
}

const withDomainLine = (line: string, path = 'src/domain/demo.ts'): Files => ({
  ...BASE,
  [path]: `${BASE['src/domain/demo.ts']}${line}\n`,
});

afterAll(() => {
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

describe('TASK-103: compuerta de trazabilidad (scripts/verify-traceability.sh)', () => {
  it('control positivo: la tarea cumple cuando cada ID está en @implements y en un título it', () => {
    const res = run(TRACEABILITY, BASE, ['--task', 'T900']);
    expect(res.output).toContain('IDs trazados: 2/2');
    expect(res.output).toContain('Resultado: CUMPLE');
    expect(res.status).toBe(0);
  });

  it('lista todos los archivos de src/ y tests/ que declaran el ID y lo cuenta con que aparezca en al menos uno', () => {
    const res = run(TRACEABILITY, {
      ...BASE,
      'src/application/a.ts': `/** ${IMPL} REQ-DEMO-001 */\nexport const a = 1;\n`,
      'src/domain/z.ts': `export const z = 1;\n/**\n * ${IMPL} REQ-DEMO-001\n */\nexport const z2 = 2;\n/** ${IMPL} REQ-DEMO-001 */\n`,
      'tests/unit/otro.spec.ts': `\n${IT}('[REQ-DEMO-001] otro caso', () => {});\n`,
    }, ['--task', 'T900']);
    expect(res.output).toContain('  OK    REQ-DEMO-001\n          src (3): src/application/a.ts:1, src/domain/demo.ts:2, src/domain/z.ts:3\n          tests (2): tests/unit/demo.spec.ts:1, tests/unit/otro.spec.ts:2');
    expect(res.output).toContain('  OK    ERR-DEMO-FAILED\n          src (1): src/domain/demo.ts:2\n          tests (1): tests/unit/demo.spec.ts:1');
    expect(res.output).toContain('IDs trazados: 2/2');
    expect(res.status).toBe(0);
  });

  it('falla si el ID solo aparece en un comentario suelto de src/', () => {
    const res = run(TRACEABILITY, {
      ...BASE,
      'src/domain/demo.ts': `// REQ-DEMO-001\n/**\n * ${IMPL} ERR-DEMO-FAILED\n */\nexport const demo = 1;\n`,
    }, ['--task', 'T900']);
    expect(res.output).toContain('FAIL  REQ-DEMO-001  sin @implements en src/ (solo fuera de @implements: src/domain/demo.ts:1)');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-003] falla si el @implements solo está en src/generated/', () => {
    const res = run(TRACEABILITY, {
      ...BASE,
      'src/domain/demo.ts': `/**\n * ${IMPL} ERR-DEMO-FAILED\n */\nexport const demo = 1;\n`,
      'src/generated/demo.ts': `/** ${IMPL} REQ-DEMO-001 */\nexport const generated = 1;\n`,
    }, ['--task', 'T900']);
    expect(res.output).toContain('FAIL  REQ-DEMO-001  sin @implements en src/ (solo en src/generated, excluido: src/generated/demo.ts:1)');
    expect(res.status).toBe(1);
  });

  it('falla si el ID solo está en el título de un describe', () => {
    const res = run(TRACEABILITY, {
      ...BASE,
      'tests/unit/demo.spec.ts': `${DESCRIBE}('[REQ-DEMO-001] grupo', () => {\n  ${IT}('[ERR-DEMO-FAILED] caso', () => {});\n});\n`,
    }, ['--task', 'T900']);
    expect(res.output).toContain('FAIL  REQ-DEMO-001  sin título it/test en tests/ (solo en título de describe: tests/unit/demo.spec.ts:1)');
    expect(res.status).toBe(1);
  });

  it('falla si la tarea cita un ID retirado', () => {
    const res = run(TRACEABILITY, BASE, ['--task', 'T901']);
    expect(res.output).toContain(`[TRACEABILITY FAIL] ${RETIRED}: citado en T901 pero no es un ID vigente (retirado)`);
    expect(res.status).toBe(1);
  });

  it('sale con 2 si la tarea no existe en la cola', () => {
    const res = run(TRACEABILITY, BASE, ['--task', 'T404']);
    expect(res.output).toContain('T404 no existe en specs/001-pet-health-tracker/tasks.md');
    expect(res.status).toBe(2);
  });

  it('compuerta final: exige todos los IDs vigentes (spec, rangos del principio III, principio II y catálogo) y falla si faltan', () => {
    const res = run(TRACEABILITY, BASE);
    expect(res.output).toContain('Modo: compuerta final (5 IDs vigentes; 1 retirados excluidos)');
    expect(res.output).toContain('FAIL  REQ-DEMO-002');
    expect(res.output).toContain('FAIL  INV-DEMO-001');
    expect(res.output).toContain('FAIL  INV-ARCH-001');
    expect(res.output).toContain('IDs trazados: 2/5');
    expect(res.status).toBe(1);
  });

  it('compuerta final: cumple cuando los 5 IDs vigentes están trazados', () => {
    const res = run(TRACEABILITY, FULL);
    expect(res.output).toContain('IDs trazados: 5/5');
    expect(res.status).toBe(0);
  });

  it('la tarea "todos los IDs vigentes" activa la compuerta final', () => {
    const res = run(TRACEABILITY, BASE, ['--task', 'T999']);
    expect(res.output).toContain('Modo: compuerta por tarea T999 (5 IDs)');
    expect(res.status).toBe(1);
  });

  it('un ID retirado en src/ falla la compuerta final', () => {
    const res = run(TRACEABILITY, withDomainLine(`/** ${IMPL} ${RETIRED} */`, 'src/domain/old.ts'));
    expect(res.output).toContain(`[RETIRED FAIL] src/domain/old.ts:5: ${RETIRED}`);
    expect(res.status).toBe(1);
  });

  it('un ID retirado en src/ solo avisa en la compuerta por tarea', () => {
    const res = run(TRACEABILITY, withDomainLine(`/** ${IMPL} ${RETIRED} */`, 'src/domain/old.ts'), ['--task', 'T900']);
    expect(res.output).toContain(`[RETIRED WARN] src/domain/old.ts: 1 (${RETIRED})`);
    expect(res.output).toContain('Resultado: CUMPLE');
    expect(res.status).toBe(0);
  });
});

describe('TASK-103: compuerta de pureza (scripts/verify-traceability.sh)', () => {
  it('[INV-ARCH-001] falla con Date.now() en src/domain/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const t = Date' + '.now();'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-001: Date.now() en src/domain/demo.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-001] falla con new Date() en src/application/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const d = new ' + 'Date();', 'src/application/clock.ts'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-001: new Date() en src/application/clock.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-001] falla con performance.now() en src/domain/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const p = performance' + '.now();'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-001: performance.now() en src/domain/demo.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-002] falla con Math.random() en src/domain/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const r = Math' + '.random();'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-002: Math.random() en src/domain/demo.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-002] falla con crypto.randomUUID() en src/application/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const u = crypto.random' + 'UUID();', 'src/application/id.ts'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-002: randomUUID() en src/application/id.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-002] falla con crypto.randomBytes() en src/domain/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const b = crypto.random' + 'Bytes(32);'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-002: randomBytes() en src/domain/demo.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-006] falla con process.env fuera de src/infrastructure/config/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const e = process' + '.env.X;', 'src/infrastructure/http/server.ts'), ['--task', 'T900']);
    expect(res.output).toContain('[PURITY FAIL] INV-ARCH-006: process.env fuera de src/infrastructure/config/ en src/infrastructure/http/server.ts:5');
    expect(res.status).toBe(1);
  });

  it('[INV-ARCH-006] admite process.env en src/infrastructure/config/', () => {
    const res = run(TRACEABILITY, withDomainLine('export const e = process' + '.env.X;', 'src/infrastructure/config/env.ts'), ['--task', 'T900']);
    expect(res.output).toContain('Violaciones de pureza: 0');
    expect(res.status).toBe(0);
  });

  it('[INV-ARCH-001] no cuenta como violación una línea que solo es comentario', () => {
    const res = run(TRACEABILITY, withDomainLine('// prohibido Date' + '.now() aquí'), ['--task', 'T900']);
    expect(res.output).toContain('Violaciones de pureza: 0');
    expect(res.status).toBe(0);
  });
});

describe('TASK-103: compuerta de oráculos (scripts/verify-oracles.sh)', () => {
  const planted: Array<[string, string]> = [
    ['toBeDefined() como aserción', 'expect(x).toBe' + 'Defined();'],
    ['toBeTruthy() como aserción', 'expect(x).toBe' + 'Truthy();'],
    ['toBeFalsy() como aserción', 'expect(x).toBe' + 'Falsy();'],
    ['not.toBeNull() como aserción', 'expect(x).not.toBe' + 'Null();'],
    ['toThrow() sin código ERR-* esperado', 'expect(f).to' + 'Throw();'],
    ['toThrow() sin código ERR-* esperado', 'await expect(p).rejects.to' + 'ThrowError();'],
    ['test deshabilitado o exclusivo (.skip, .todo, .only)', 'it' + ".skip('caso', () => {});"],
    ['test deshabilitado o exclusivo (.skip, .todo, .only)', 'test' + ".only('caso', () => {});"],
    ['test deshabilitado o exclusivo (.skip, .todo, .only)', 'describe' + ".todo('grupo');"],
  ];

  it('control positivo: cumple con aserciones fuertes', () => {
    const res = run(ORACLES, { 'tests/unit/ok.spec.ts': "expect(x).toBe(1);\nexpect(f).toThrow(/ERR-DEMO-FAILED/);\nexpect(y).toBeNull();\n" });
    expect(res.output).toContain('oráculos débiles: 0');
    expect(res.status).toBe(0);
  });

  for (const [label, line] of planted) {
    it(`falla con un caso plantado: ${line}`, () => {
      const res = run(ORACLES, { 'tests/unit/weak.spec.ts': `${line}\n` });
      expect(res.output).toContain(`[ORACLE FAIL] ${label}: tests/unit/weak.spec.ts:1: ${line}`);
      expect(res.status).toBe(1);
    });
  }

  it('no cuenta una línea que solo es comentario', () => {
    const res = run(ORACLES, { 'tests/unit/ok.spec.ts': '// no usar expect(x).toBe' + 'Truthy()\n' });
    expect(res.output).toContain('oráculos débiles: 0');
    expect(res.status).toBe(0);
  });

  it('sale con 2 si no existe tests/', () => {
    const res = run(ORACLES, { 'README.md': 'demo\n' });
    expect(res.output).toContain('Fuente ausente: tests/');
    expect(res.status).toBe(2);
  });
});
