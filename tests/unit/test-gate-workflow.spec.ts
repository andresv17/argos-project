import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T447 (REQ-CICD-004, REQ-CICD-011, D-09, H-MERO-009): test-gate.yml reutilizable.
 * Pruebas estáticas; la base de comparación es el commit b6cacc5, no la memoria.
 */
const BASE = 'b6cacc5';
const path = join(process.cwd(), '.github', 'workflows', 'test-gate.yml');
const load = (): string => readFileSync(path, 'utf8');
const noComments = (s: string): string => s.replace(/^\s*#.*$/gm, '');
const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });
const hasBase = ((): boolean => {
  try {
    execFileSync('git', ['cat-file', '-e', `${BASE}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const steps = (s: string): string => s.slice(s.indexOf('    steps:'));

describe('.github/workflows/test-gate.yml (T447)', () => {
  it('declara workflow_call como disparador', () => {
    expect(noComments(load())).toMatch(/^ {2}workflow_call:/m);
  });

  it('T487: no dispara con push a main; push solo a develop', () => {
    const on = noComments(load()).split(/^jobs:/m)[0] ?? '';
    const push = on.match(/^ {2}push:\s*\n((?: {4}.*\n|\s*\n)+)/m)?.[1] ?? '';
    expect(push).toMatch(/branches:\s*\[\s*develop\s*\]/);
    expect(push).not.toMatch(/main/);
  });

  it('T487: conserva pull_request a main y develop, workflow_call y workflow_dispatch', () => {
    const y = noComments(load());
    expect(y).toMatch(/^ {2}pull_request:\s*\n\s+branches:\s*\[\s*main,\s*develop\s*\]/m);
    expect(y).toMatch(/^ {2}workflow_call:/m);
    expect(y).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it.each(['push', 'pull_request'])('T487: %s ignora terraform, specs, docs y claude', (ev) => {
    const on = noComments(load()).split(/^jobs:/m)[0] ?? '';
    const block = on.match(new RegExp(`^ {2}${ev}:\\s*\\n((?: {4}.*\\n|\\s*\\n)+)`, 'm'))?.[1] ?? '';
    expect(block).toMatch(/paths-ignore:/);
    for (const g of ['terraform/**', 'specs/**', 'docs/**', 'claude/**']) {
      expect(block).toContain(g);
    }
  });

  it.skipIf(!hasBase)('los pasos existentes no cambiaron respecto de b6cacc5', () => {
    // D-29 punto 6 (Neo): el paso Install Playwright Chromium sale del gate rápido; los demás no cambian.
    const before = steps(git('show', `${BASE}:.github/workflows/test-gate.yml`)).replace(
      / {6}- name: Install Playwright[^\n]*\n {8}run: npx playwright install --with-deps chromium\n\n/,
      '',
    );
    // T805 (N2-08): único paso añadido, de forma aditiva; el resto de los pasos debe seguir idéntico a la base.
    const current = steps(load()).replace(
      / {6}- name: Compilar contratos 006[^\n]*\n {8}run: \|\n {10}bash scripts\/compile-contracts\.sh --feature 006\n {10}git diff --exit-code src\/generated\/\n\n/,
      '',
    );
    expect(current).toBe(before);
  });

  it('D-29: test-gate.yml sin Install Playwright ni playwright install', () => {
    const y = load();
    expect(y).not.toMatch(/Install Playwright/);
    expect(y).not.toMatch(/playwright install/);
  });

  it('el trabajo reutilizable tiene permissions contents: read por trabajo', () => {
    const job = noComments(load()).split(/^jobs:/m)[1] ?? '';
    expect(job).toMatch(/^ {4}permissions:\s*\n\s+contents:\s*read\s*$/m);
  });

  it('sin id-token, sin write-all, sin secrets. ni credenciales de GCP (H-MERO-009)', () => {
    const y = noComments(load());
    expect(y).not.toMatch(/id-token/);
    expect(y).not.toMatch(/write-all/);
    expect(y).not.toMatch(/secrets\./);
    expect(y).not.toMatch(/google-github-actions/);
    expect(y).not.toMatch(/GCP|GOOGLE_|workload_identity/i);
  });

  it.skipIf(!hasBase)('drift-detection.yml no cambió respecto de b6cacc5 (REQ-CICD-004)', () => {
    expect(git('diff', BASE, '--', '.github/workflows/drift-detection.yml')).toBe('');
  });

  it('T487: package.json test:gate sin playwright ni Chromium, con trazabilidad 003', () => {
    const scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts as Record<string, string>;
    const gate = scripts['test:gate'] ?? '';
    expect(gate).toMatch(/verify-traceability\.sh --feature 003/);
    expect(gate).not.toMatch(/playwright|test:e2e|chromium/i);
    expect(gate).toMatch(/compile-contracts\.sh/);
    expect(gate).toMatch(/verify-oracles\.sh/);
    expect(gate).toMatch(/tsc --noEmit/);
    expect(gate).toMatch(/vitest run/);
  });

  it('T487: test:gate:full existe y contiene playwright o mutación', () => {
    const scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts as Record<string, string>;
    expect(scripts['test:gate:full'] ?? '').toMatch(/playwright|test:e2e|test:mutation/);
  });
});
