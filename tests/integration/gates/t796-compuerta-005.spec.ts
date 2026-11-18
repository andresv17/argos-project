/**
 * T796 [N2]: compuertas finales de la feature 005 ejecutadas como pruebas (NFR-005-004, SC-005-033).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const SLOW = 180_000;
const run = (script: string): { status: number | null; output: string } => {
  const res = spawnSync('bash', [join(ROOT, 'scripts', script), '--feature', '005'], { cwd: ROOT, encoding: 'utf8' });
  return { status: res.status, output: `${res.stdout}${res.stderr}` };
};

describe('T796 compuertas finales de la 005', () => {
  it('NFR-005-004: verify-traceability --feature 005 cumple con todos los IDs trazados y sin FAIL', { timeout: SLOW }, () => {
    const res = run('verify-traceability.sh');
    expect(res.status, res.output).toBe(0);
    const match = /IDs trazados: (\d+)\/(\d+)/.exec(res.output);
    expect(match?.[1], res.output).toBe(match?.[2]);
    expect(Number(match?.[1])).toBeGreaterThan(100);
    expect(res.output).not.toMatch(/\bFAIL\b/);
  });

  it('NFR-005-004: verify-oracles --feature 005 cumple', { timeout: SLOW }, () => {
    const res = run('verify-oracles.sh');
    expect(res.status, res.output).toBe(0);
  });

  it('NFR-005-004: sin dependencias nuevas, las compuertas viven como scripts de package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['verify:traceability']).toBe('bash scripts/verify-traceability.sh');
    expect(pkg.scripts['verify:oracles']).toBe('bash scripts/verify-oracles.sh');
    expect(pkg.scripts['test:gate']).toContain('tsc --noEmit');
  });
});
