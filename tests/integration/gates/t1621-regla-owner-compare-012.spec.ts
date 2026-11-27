/**
 * T1621 (Feature 012, Bloque A, #22): regla SAST `argos-no-owner-compare-outside-can-act-on-pet` (REQ-OWN12-010, INV-ACC2-002; SC-012-012, SC-012-069). Cubre (a) la regla Semgrep del proyecto (existe, su
 * alcance es src/domain/ y src/application/ y exime solo a `can-act-on-pet.ts` y `pet-ownership.ts`), (b) la comprobación estática equivalente que usa `verify-ci-ready.sh` (hallazgo con archivo:línea, exenciones,
 * `nosemgrep`), (c) con `semgrep` instalado, `semgrep --test` y un escaneo real de `src/` sin hallazgos, y (d) que ninguna decisión de acceso de `src/` compara `ownerUserId` fuera de la función única.
 *
 * @implements REQ-OWN12-010, INV-ACC2-002
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const RULE = join(ROOT, 'tests', 'security', 'sast-rules', 'argos-no-owner-compare-outside-can-act-on-pet.yml');
const STATIC = join(ROOT, 'scripts', 'lib', 'ci-ready-sast-static.mjs');
const RULE_ID = 'argos-no-owner-compare-outside-can-act-on-pet';
let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** Árbol desechable con los archivos dados; ejecuta la comprobación estática con ese `cwd` y devuelve sus líneas `archivo:línea regla`. */
function scan(files: Record<string, string>): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'owner-compare-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const out = execFileSync('node', [STATIC], { cwd: dir, encoding: 'utf8' });
  return out.split('\n').filter((line) => line.includes(RULE_ID));
}

const COMPARE = 'export const mayEdit = (pet: { ownerUserId: string }, userId: string): boolean => pet.ownerUserId === userId;\n';

describe('T1621 regla Semgrep del proyecto contra la comparación de ownerUserId', () => {
  it('(a) la regla existe, limita su alcance a dominio y aplicación y exime solo a canActOnPet y su primitiva', () => {
    const text = readFileSync(RULE, 'utf8');
    expect(text).toContain(`id: ${RULE_ID}`);
    expect(text).toContain('severity: ERROR');
    expect(text).toContain('- /src/domain/\n        - /src/application/');
    const excluded = text.slice(text.indexOf('exclude:'), text.indexOf('pattern-either:'));
    expect(excluded).toContain('/src/domain/access/can-act-on-pet.ts');
    expect(excluded).toContain('/src/domain/access/pet-ownership.ts');
    expect(excluded.match(/- \//g)).toHaveLength(3); // y la carpeta generada: ninguna otra exención
    for (const operator of ['===', '!==', '==', '!=']) expect(text).toContain(`$X.ownerUserId ${operator} $Y`);
  });

  it('(b) la comprobación estática señala archivo:línea en dominio y aplicación, también con el operando invertido', () => {
    expect(scan({ 'src/application/use-cases/a.ts': COMPARE })).toEqual([`src/application/use-cases/a.ts:1 ${RULE_ID}`]);
    expect(scan({ 'src/domain/pet/b.ts': 'export const f = (p: { ownerUserId: string }, u: string) => u !== p.ownerUserId;\n' })).toEqual([`src/domain/pet/b.ts:1 ${RULE_ID}`]);
  });

  it('(b) quedan exentos can-act-on-pet.ts, pet-ownership.ts, los adaptadores de persistencia y la SPA; nosemgrep en la línea o la anterior suprime el hallazgo', () => {
    expect(scan({ 'src/domain/access/can-act-on-pet.ts': COMPARE })).toEqual([]);
    expect(scan({ 'src/domain/access/pet-ownership.ts': COMPARE })).toEqual([]);
    expect(scan({ 'src/infrastructure/persistence/sqlite/x.ts': COMPARE, 'src/presentation/web/y.ts': COMPARE })).toEqual([]);
    expect(scan({ 'src/application/c.ts': `// nosemgrep: ${RULE_ID} — consistencia entre dos filas, no autoridad\n${COMPARE}` })).toEqual([]);
  });

  it('(d) ninguna decisión de acceso de src/ compara ownerUserId fuera de la función única (migración por bloque de T1621)', () => {
    const out = execFileSync('node', [STATIC], { cwd: ROOT, encoding: 'utf8' });
    expect(out.split('\n').filter((line) => line.includes(RULE_ID))).toEqual([]);
  });

  it.skipIf(spawnSync('semgrep', ['--version']).status !== 0)('(c) semgrep --test pasa los casos de la regla y el escaneo real de src/ no tiene hallazgos', () => {
    expect(existsSync(RULE)).toBe(true);
    const test = spawnSync('semgrep', ['--test', '--config', RULE, join(ROOT, 'tests', 'security', 'sast-rules', `${RULE_ID}.ts`), '--metrics=off'], { encoding: 'utf8' });
    expect(`${test.stdout}${test.stderr}`).toContain('All tests passed');
    const scanned = spawnSync('semgrep', ['scan', '--config', join(ROOT, 'tests', 'security', 'sast-rules'), '--error', '--metrics=off', 'src/'], { cwd: ROOT, encoding: 'utf8' });
    expect(scanned.status).toBe(0);
  });
});
