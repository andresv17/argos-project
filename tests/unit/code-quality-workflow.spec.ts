import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T449 (REQ-CICD-007, REQ-CICD-011, SC-CLD-023): code-quality.yml.
 * Pruebas estáticas por lectura del texto del flujo.
 */
const path = join(process.cwd(), '.github', 'workflows', 'code-quality.yml');
const load = (): string => readFileSync(path, 'utf8');
const noComments = (s: string): string => s.replace(/^\s*#.*$/gm, '');
const body = (): string => noComments(load());

/** Texto de todos los bloques `run:` (línea o bloque literal). */
const runBlocks = (): string => {
  const lines = body().split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const indent = (m[1] ?? '').length;
    out.push(m[2] ?? '');
    if (/^[|>][-+]?$/.test((m[2] ?? '').trim())) {
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j] ?? '';
        if (l.trim() !== '' && l.search(/\S/) <= indent) break;
        out.push(l);
      }
    }
  }
  return out.join('\n');
};

describe('.github/workflows/code-quality.yml (T449)', () => {
  it('el archivo existe', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('se dispara en pull_request a main y push a develop', () => {
    const y = body();
    expect(y).toMatch(/^ {2}pull_request:\s*\n\s+branches:\s*\[\s*main\s*\]/m);
    expect(y).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[\s*develop\s*\]/m);
  });

  it('no usa hadolint-action, rhysd/actionlint ni gitleaks-action como acción', () => {
    const y = body();
    expect(y).not.toMatch(/hadolint\/hadolint-action/);
    expect(y).not.toMatch(/uses:\s*rhysd\//);
    expect(y).not.toMatch(/rhysd\/actionlint@/);
    expect(y).not.toMatch(/gitleaks\/gitleaks-action/);
    expect(y).not.toMatch(/uses:\s*(?!actions\/)\S+/);
  });

  it('cada binario (hadolint, actionlint) tiene versión y sha256 de 64 caracteres', () => {
    const y = body();
    expect(y).toMatch(/HADOLINT_VERSION:\s*v\d+\.\d+\.\d+/);
    expect(y).toMatch(/ACTIONLINT_VERSION:\s*\d+\.\d+\.\d+/);
    expect(y).toMatch(/HADOLINT_SHA256:\s*[0-9a-f]{64}\s*$/m);
    expect(y).toMatch(/ACTIONLINT_SHA256:\s*[0-9a-f]{64}\s*$/m);
    const r = runBlocks();
    expect(r).toMatch(/sha256sum\s+(-c|--check)/);
    expect(r.match(/sha256sum\s+(-c|--check)/g)?.length).toBe(2);
    expect(r).toMatch(/hadolint\s+Dockerfile/);
    expect(r).toMatch(/actionlint\b/);
  });

  it('descarga los binarios de los releases oficiales por versión fija', () => {
    const y = body();
    expect(y).toMatch(/https:\/\/github\.com\/hadolint\/hadolint\/releases\/download\/\$\{HADOLINT_VERSION\}\/hadolint-linux-x86_64/);
    expect(y).toMatch(/https:\/\/github\.com\/rhysd\/actionlint\/releases\/download\/v\$\{ACTIONLINT_VERSION\}\/actionlint_\$\{ACTIONLINT_VERSION\}_linux_amd64\.tar\.gz/);
    expect(y).not.toMatch(/releases\/latest/);
  });

  it('ejecuta npm audit --omit=dev --audit-level=high como compuerta', () => {
    expect(runBlocks()).toMatch(/npm audit --omit=dev --audit-level=high/);
  });

  it('no incluye terraform fmt/validate ni trivy', () => {
    const y = body();
    expect(y).not.toMatch(/terraform\s+(fmt|validate)/);
    expect(y).not.toMatch(/trivy/i);
  });

  it('permissions mínimos: contents: read, sin id-token ni write-all', () => {
    const y = body();
    expect(y).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
    expect(y).not.toMatch(/id-token/);
    expect(y).not.toMatch(/write-all/);
    expect(y).not.toMatch(/:\s*write\b/);
    expect(y).not.toMatch(/secrets\./);
  });

  it('no interpola ${{ }} dentro de run:', () => {
    expect(runBlocks()).not.toMatch(/\$\{\{/);
  });

  it('lista cada acción de la 003 con versión y SHA, y justifica lo que no aplica', () => {
    const c = load();
    for (const a of ['actions/checkout', 'actions/setup-node', 'actions/setup-python', 'google-github-actions/auth', 'docker/login-action']) {
      expect(c).toContain(a);
    }
    expect(c).toMatch(/7c6bc770dae815cd3e89ee6cdf493a5fab2cc093/);
    expect(c).toMatch(/8aa5831fb8d48d8f76594c7ddde61ae58019f550/);
    expect(c).toMatch(/deploy-functions\.yml[^\n]*no aplica/i);
    expect(c).toMatch(/Mirror[^\n]*no aplica/i);
  });
});
