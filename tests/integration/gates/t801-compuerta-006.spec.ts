/**
 * T801 [N2]: pruebas de la compuerta de trazabilidad de la feature 006 (REQ-ESC6-031, INV-ESC6-002, SC-ESC6-050, SC-ESC6-091).
 * Patrón T796 (compuerta real sobre el repositorio) más repositorios mínimos en node_modules/.cache para los casos negativos.
 * Los IDs plantados se arman por concatenación para que las compuertas reales no los lean en este archivo.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const TRACEABILITY = join(ROOT, 'scripts/verify-traceability.sh');
const SLOW = 180_000;
const work: string[] = [];
afterAll(() => {
  for (const dir of work) rmSync(dir, { recursive: true, force: true });
});

const P = 'ESC' + '6';
const id = (kind: string, n: string): string => `${kind}-${P}-${n}`;
const REQ1 = id('REQ', '001');
const INV1 = id('INV', '001');
const NFR1 = id('NFR', '001');
const EDGE1 = id('EDGE', '001');
const SC = ['001', '002', '003'].map((n) => id('SC', n));
const STATE = 'STATE-' + 'SCENE-001';
const ERRS = 'ERR-' + 'SCENE-GENERATION-FAILED';
const ORPHAN = id('REQ', '099');

type Files = Record<string, string>;
const BASE: Files = {
  '.specify/memory/constitution.md': [
    '# Constitución demo',
    '### II. PUREZA',
    '1. `INV-ARCH-001`: reloj inyectado.',
    '### III. TRAZABILIDAD',
    '- **IDs retirados (no deben aparecer en código nuevo; solo en historial):** `INV-OLD-001`.',
    '### IV. UMBRALES',
    '',
  ].join('\n'),
  'specs/006-demo-escena/spec.md': `# Spec demo\n${[REQ1, INV1, NFR1, EDGE1, ...SC, STATE].join(' ')}\n`,
  'specs/006-demo-escena/contracts/errors/error-catalog.json': JSON.stringify({ errors: { [ERRS]: { status: 200 } } }),
  'specs/006-demo-escena/tasks.md': [
    '# Tasks: demo 006',
    `- [ ] T801 Todo en una línea (${REQ1}, ${INV1}, ${NFR1}, ${EDGE1}, ${id('SC', '001')}..003, ${STATE}, ${ERRS}, INV-ARCH-001)`,
    `- [ ] T802 Solo dos (${REQ1}, ${INV1})`,
    '',
  ].join('\n'),
};

const run = (files: Files, args: string[], env: Record<string, string> = {}): { status: number | null; output: string } => {
  const cache = join(ROOT, 'node_modules/.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'argos-gates006-'));
  work.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const res = spawnSync('bash', [TRACEABILITY, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
};

describe('T801 compuerta de trazabilidad --feature 006 (fixtures)', () => {
  it('REQ-ESC6-031: reconoce REQ, INV, NFR, SC y EDGE ESC6, STATE-SCENE-001 y ERR-SCENE-* en la compuerta final', { timeout: SLOW }, () => {
    const res = run(BASE, ['--feature', '006']);
    expect(res.status, res.output).toBe(0);
    // 8 propios de la spec (REQ, INV, NFR, EDGE, 3 SC, STATE) + ERR-SCENE + INV-ARCH-001 de la constitución.
    expect(res.output).toContain('feature 006 (10 IDs vigentes');
  });

  it('SC-ESC6-050: admite el rango SC-ESC6-001..003 y lo expande en la compuerta por tarea', { timeout: SLOW }, () => {
    const res = run(BASE, ['--feature', '006', '--task', 'T801']);
    expect(res.status, res.output).toBe(0);
    expect(res.output).toContain('compuerta por tarea T801 (10 IDs)');
  });

  it('SC-ESC6-091: --task T802 solo exige los IDs de su línea', { timeout: SLOW }, () => {
    const res = run(BASE, ['--feature', '006', '--task', 'T802']);
    expect(res.status, res.output).toBe(0);
    expect(res.output).toContain('compuerta por tarea T802 (2 IDs)');
  });

  it('SC-ESC6-091: --task de una tarea inexistente sale con código 2', { timeout: SLOW }, () => {
    const res = run(BASE, ['--feature', '006', '--task', 'T899']);
    expect(res.status, res.output).toBe(2);
    expect(res.output).toContain('T899 no existe');
  });

  it('REQ-ESC6-031: falla con una tarea sin ningún ID citado', { timeout: SLOW }, () => {
    const files = { ...BASE, 'specs/006-demo-escena/tasks.md': `${BASE['specs/006-demo-escena/tasks.md']}- [ ] T803 Tarea sin trazabilidad alguna\n` };
    const res = run(files, ['--feature', '006', '--task', 'T803']);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('sin ningún ID');
  });

  it('INV-ESC6-002: falla con un ID propio de la spec huérfano en tasks.md (spec a tasks 1:1)', { timeout: SLOW }, () => {
    const files = { ...BASE, 'specs/006-demo-escena/spec.md': `${BASE['specs/006-demo-escena/spec.md']}${ORPHAN}\n` };
    const res = run(files, ['--feature', '006']);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain(`FAIL  ${ORPHAN}  huérfano`);
  });

  it('INV-ESC6-002: falla si una tarea cita un ID de la 006 que no existe en la spec ni en los contratos', { timeout: SLOW }, () => {
    const files = { ...BASE, 'specs/006-demo-escena/tasks.md': `${BASE['specs/006-demo-escena/tasks.md']}- [ ] T804 Cita un ID inventado (${id('REQ', '777')})\n` };
    const res = run(files, ['--feature', '006', '--task', 'T804']);
    expect(res.status, res.output).toBe(1);
    expect(res.output).toContain('no es un ID vigente');
  });

  it('SC-ESC6-050: la evidencia de código es informativa, y bloqueante con SDD_STRICT_EVIDENCE=1', { timeout: SLOW }, () => {
    const strict = run(BASE, ['--feature', '006'], { SDD_STRICT_EVIDENCE: '1' });
    expect(strict.status, strict.output).toBe(1);
    expect(strict.output).toContain('FAIL');
  });
});

describe('T801 compuertas reales sobre el repositorio (--feature 006)', () => {
  it('SC-ESC6-091: verify-traceability --feature 006 cumple sin FAIL y con spec a tasks 1:1', { timeout: SLOW }, () => {
    const res = spawnSync('bash', [TRACEABILITY, '--feature', '006'], { cwd: ROOT, encoding: 'utf8' });
    const output = `${res.stdout}${res.stderr}`;
    expect(res.status, output).toBe(0);
    const match = /Spec→tasks 1:1: (\d+)\/(\d+) IDs propios de la 006/.exec(output);
    expect(match?.[1], output).toBe(match?.[2]);
    expect(Number(match?.[2])).toBeGreaterThan(150);
    expect(output).not.toMatch(/\bFAIL\b/);
  });

  it('REQ-ESC6-031: --feature 006 --task T801 lee la línea de T801 de la 006', { timeout: SLOW }, () => {
    const res = spawnSync('bash', [TRACEABILITY, '--feature', '006', '--task', 'T801'], { cwd: ROOT, encoding: 'utf8' });
    const output = `${res.stdout}${res.stderr}`;
    expect(res.status, output).toBe(0);
    expect(output).toContain('compuerta por tarea T801');
    expect(output).not.toMatch(/no es un ID vigente/);
  });
});
