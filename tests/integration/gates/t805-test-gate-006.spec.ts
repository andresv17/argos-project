/**
 * T805 [N2]: test:gate (package.json, solo el script) y test-gate.yml incorporan la feature 006 y la suite de T801.
 * REQ-ESC6-031; NFR-ESC6-003; SC-ESC6-050. Sin dependencias npm nuevas.
 * La base de comparación es el commit dda060b (cabeza de main al abrir la 006), no la memoria.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const BASE = 'dda060b';
const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const hasBase = ((): boolean => {
  try {
    execFileSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
interface Pkg {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}
const pkg = (): Pkg => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Pkg;
const workflow = (): string => readFileSync(join(ROOT, '.github/workflows/test-gate.yml'), 'utf8');
const noComments = (s: string): string => s.replace(/^\s*#.*$/gm, '');
const gate = (): string => pkg().scripts['test:gate'] ?? '';

describe('T805 package.json test:gate incorpora la 006', () => {
  it('REQ-ESC6-031: compila los contratos 006 y verifica su trazabilidad dentro de test:gate', () => {
    expect(gate()).toMatch(/compile-contracts\.sh --feature 006/);
    expect(gate()).toMatch(/verify-traceability\.sh --feature 006/);
  });

  it('SC-ESC6-050: compila la 006 antes de verificar su trazabilidad y todo antes de tsc y vitest', () => {
    const g = gate();
    expect(g.indexOf('compile-contracts.sh --feature 006')).toBeLessThan(g.indexOf('verify-traceability.sh --feature 006'));
    expect(g.indexOf('verify-traceability.sh --feature 006')).toBeLessThan(g.indexOf('tsc --noEmit'));
    expect(g.indexOf('tsc --noEmit')).toBeLessThan(g.indexOf('vitest run --coverage'));
  });

  it('REQ-ESC6-031: conserva las compuertas de 002 y 003, oráculos, tsc y la suite completa (incluye la suite T801)', () => {
    const g = gate();
    for (const part of [
      'compile-contracts.sh --feature 002',
      'compile-contracts.sh --feature 003',
      'verify-traceability.sh --feature 002',
      'verify-traceability.sh --feature 003',
      'verify-oracles.sh',
      'tsc --noEmit',
      'vitest run --coverage',
    ]) {
      expect(g, part).toContain(part);
    }
    expect(existsSync(join(ROOT, 'tests/integration/gates/t801-compuerta-006.spec.ts'))).toBe(true);
  });

  it('NFR-ESC6-003: test:gate sigue sin playwright ni Chromium (el gate rápido no abre navegadores)', () => {
    expect(gate()).not.toMatch(/playwright|test:e2e|chromium/i);
  });

  it.skipIf(!hasBase)('SC-ESC6-050: sin dependencias nuevas, package.json cambia solo en el script test:gate y el lock queda intacto', () => {
    const before = JSON.parse(git('show', `${BASE}:package.json`)) as Pkg;
    expect(pkg().dependencies).toEqual(before.dependencies);
    expect(pkg().devDependencies).toEqual(before.devDependencies);
    const { 'test:gate': nowGate, ...restNow } = pkg().scripts;
    const { 'test:gate': beforeGate, ...restBefore } = before.scripts;
    expect(restNow).toEqual(restBefore);
    expect(nowGate).not.toBe(beforeGate);
    expect(git('diff', BASE, '--', 'package-lock.json')).toBe('');
  });
});

describe('T805 .github/workflows/test-gate.yml incorpora la 006', () => {
  it('REQ-ESC6-031: un paso compila los contratos 006 y falla ante deriva de src/generated', () => {
    const y = noComments(workflow());
    expect(y).toMatch(/- name: [^\n]*006[^\n]*\n\s+run: \|[^\n]*\n(?:\s+[^\n]*\n)*?\s+bash scripts\/compile-contracts\.sh --feature 006/);
    const step = y.slice(y.indexOf('compile-contracts.sh --feature 006'));
    expect(step.split('\n').slice(0, 3).join('\n')).toContain('git diff --exit-code src/generated/');
  });

  it('SC-ESC6-050: el paso de la 006 va antes de la compuerta final completa y después de instalar dependencias', () => {
    const y = workflow();
    expect(y.indexOf('npm ci')).toBeLessThan(y.indexOf('compile-contracts.sh --feature 006'));
    expect(y.indexOf('compile-contracts.sh --feature 006')).toBeLessThan(y.indexOf('run: npm run test:gate'));
  });

  it('NFR-ESC6-003: el workflow no añade secretos, credenciales de GCP ni Playwright', () => {
    const y = noComments(workflow());
    expect(y).not.toMatch(/secrets\.|id-token|google-github-actions|playwright/i);
  });

  it('SC-ESC6-050: la entrada manual feature documenta la 006', () => {
    expect(workflow()).toMatch(/description: 'Feature a verificar \([^)]*006[^)]*\)/);
  });
});
