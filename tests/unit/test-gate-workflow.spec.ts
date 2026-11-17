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

  it('conserva los disparadores push, pull_request y workflow_dispatch con main y develop (D-09)', () => {
    const y = noComments(load());
    expect(y).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[\s*main,\s*develop\s*\]/m);
    expect(y).toMatch(/^ {2}pull_request:\s*\n\s+branches:\s*\[\s*main,\s*develop\s*\]/m);
    expect(y).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it.skipIf(!hasBase)('los pasos existentes no cambiaron respecto de b6cacc5', () => {
    const before = steps(git('show', `${BASE}:.github/workflows/test-gate.yml`));
    expect(steps(load())).toBe(before);
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
});
