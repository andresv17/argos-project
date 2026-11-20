/**
 * DEUDA-CI-VERIFY-PREPUSH: scripts/verify-ci-ready.sh sobre repositorios git desechables. Cubre (i) SAST (comprobacion estatica equivalente,
 * forzada para no depender de semgrep), (ii) lecturas de claude/ o de archivos sin seguimiento desde tests/ y (iii) archivos rastreados
 * modificados fuera de commit en .env.example, src/, tests/, terraform/ y .github/.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts', 'verify-ci-ready.sh');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
/** Repo limpio y commiteado con los archivos dados. */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-ready-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}
const run = (dir: string) => {
  const r = spawnSync('bash', [SCRIPT, '--root', dir], { encoding: 'utf8', env: { ...process.env, ARGOS_CI_READY_FORCE_STATIC: '1' } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
/** Los literales de rutas de los repos desechables se arman por partes: el comprobador (ii) no debe ver esta prueba como lectora de claude/. */
const CL = ['claude'].join('');
const CLEAN = { 'src/domain/a.ts': 'export const a = 1;\n', 'tests/a.spec.ts': "export const t = 1;\n", '.env.example': 'X=1\n' };

describe('verify-ci-ready.sh (DEUDA-CI-VERIFY-PREPUSH)', () => {
  it('el script existe, es ejecutable y usa set -euo pipefail', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    expect(statSync(SCRIPT).mode & 0o111).not.toBe(0);
    expect(readFileSync(SCRIPT, 'utf8')).toContain('set -euo pipefail');
  });

  it('un repo limpio sale 0 con las tres comprobaciones en PASA', () => {
    const r = run(repo(CLEAN));
    expect(r.code).toBe(0);
    expect(r.out.match(/^PASA /gm)).toHaveLength(3);
    expect(r.out).toContain('LISTO PARA CI');
  });

  it('(i) eval, innerHTML, process.env y entropia directa en src/ fallan con archivo:linea y regla; los adaptadores y config quedan exentos', () => {
    const bad = repo({
      ...CLEAN,
      'src/domain/bad.ts': 'export const f = (s: string) => eval(s);\nexport const t = () => Date.now();\n',
      'src/presentation/h.ts': 'export const h = (n: HTMLElement, v: string) => { n.innerHTML = v; };\n',
      'src/application/e.ts': 'export const e = () => process.env;\n',
    });
    const r = run(bad);
    expect(r.code).toBe(1);
    for (const hit of ['src/domain/bad.ts:1 argos-no-dynamic-code', 'src/domain/bad.ts:2 argos-no-entropy-outside-adapters', 'src/presentation/h.ts:1 argos-no-raw-html-sink', 'src/application/e.ts:1 argos-no-process-env-outside-config']) expect(r.out).toContain(hit);
    const ok = repo({
      ...CLEAN,
      'src/infrastructure/adapters/clock.ts': 'export const now = () => Date.now();\n',
      'src/infrastructure/config/env.ts': 'export const env = () => process.env;\n',
      'src/generated/x.ts': 'export const g = () => eval("1");\n',
    });
    expect(run(ok).code).toBe(0);
  });

  it('(i) // nosemgrep en la linea o en la anterior suprime el hallazgo, y new Date(x) con argumento no cuenta', () => {
    const r = run(repo({ ...CLEAN, 'src/domain/ok.ts': '// nosemgrep: argos-no-entropy-outside-adapters\nexport const t = () => Date.now();\nexport const d = (x: string) => new Date(x);\nexport const u = () => Math.random(); // nosemgrep: x\n' }));
    expect(r.code).toBe(0);
  });

  it('(ii) un test que lee claude/ sin seguimiento falla; si el archivo esta rastreado pasa; un archivo existente sin seguimiento tambien falla', () => {
    const leaky = repo({ ...CLEAN, 'tests/leer.spec.ts': `import { readFileSync } from 'node:fs';\nexport const x = readFileSync('${CL}/log-keymaker.md', 'utf8');\n` });
    const r = run(leaky);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`tests/leer.spec.ts:2 ${CL}/log-keymaker.md`);
    const tracked = repo({ ...CLEAN, [`${CL}/entorno.md`]: 'x\n', 'tests/leer.spec.ts': `export const x = '${CL}/entorno.md';\n` });
    expect(run(tracked).code).toBe(0);
    const untracked = repo({ ...CLEAN, 'tests/leer.spec.ts': "export const x = 'specs/001/spec.md';\n" });
    mkdirSync(join(untracked, 'specs', '001'), { recursive: true });
    writeFileSync(join(untracked, 'specs', '001', 'spec.md'), 'sin seguimiento\n');
    const u = run(untracked);
    expect(u.code).toBe(1);
    expect(u.out).toContain('specs/001/spec.md (archivo sin seguimiento de git)');
  });

  it('(ii) solo se analizan tests rastreados: un test sin seguimiento que lee un archivo sin seguimiento no dispara falso positivo; el rastreado si falla', () => {
    const dir = repo(CLEAN);
    mkdirSync(join(dir, 'specs', '001'), { recursive: true });
    writeFileSync(join(dir, 'specs', '001', 'spec.md'), 'sin seguimiento\n');
    writeFileSync(join(dir, 'tests', 'ajeno.spec.ts'), `export const x = '${CL}/log-ajeno.md';\nexport const y = 'specs/001/spec.md';\n`);
    const limpio = run(dir);
    expect(limpio.code).toBe(0);
    expect(limpio.out).not.toContain('ajeno.spec.ts');
    git(dir, 'add', 'tests/ajeno.spec.ts');
    git(dir, 'commit', '-q', '-m', 'rastrea el test');
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`tests/ajeno.spec.ts:1 ${CL}/log-ajeno.md`);
    expect(r.out).toContain('tests/ajeno.spec.ts:2 specs/001/spec.md (archivo sin seguimiento de git)');
  });

  it('(iii) un archivo rastreado modificado sin commit en .env.example, src/, tests/, terraform/ o .github/ falla; fuera de esas rutas no; un archivo nuevo sin seguimiento tampoco cuenta', () => {
    for (const path of ['.env.example', 'src/domain/a.ts', 'tests/a.spec.ts', 'terraform/main.tf', '.github/workflows/x.yml']) {
      const dir = repo({ ...CLEAN, 'terraform/main.tf': '# t\n', '.github/workflows/x.yml': 'name: x\n', 'docs/n.md': 'n\n' });
      writeFileSync(join(dir, path), `${readFileSync(join(dir, path), 'utf8')}// cambio\n`);
      const r = run(dir);
      expect(r.code, path).toBe(1);
      expect(r.out, path).toContain(path);
    }
    const dir = repo({ ...CLEAN, 'docs/n.md': 'n\n' });
    writeFileSync(join(dir, 'docs', 'n.md'), 'cambiado\n');
    writeFileSync(join(dir, 'src', 'nuevo.ts'), 'export const n = 1;\n');
    expect(run(dir).code).toBe(0);
  });

  it('el repo real: la comprobacion (ii) no encuentra lecturas de claude/ sin seguimiento ni archivos sin seguimiento', () => {
    const r = spawnSync('node', [join(process.cwd(), 'scripts', 'lib', 'ci-ready-test-reads.mjs')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });
});
