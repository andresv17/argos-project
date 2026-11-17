import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T445 (REQ-CICD-001, REQ-CICD-008, REQ-CICD-011, D-09, D-21): auto-pr.yml.
 * Pruebas estáticas por lectura del texto del flujo.
 */
const path = join(process.cwd(), '.github', 'workflows', 'auto-pr.yml');
const load = (): string => readFileSync(path, 'utf8');
const noComments = (s: string): string => s.replace(/^\s*#.*$/gm, '');

describe('.github/workflows/auto-pr.yml (T445)', () => {
  it('el archivo existe', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('se dispara solo con push a develop (D-09) y no con pull_request ni pull_request_target', () => {
    const y = noComments(load());
    expect(y).toMatch(/^on:\s*\n\s+push:\s*\n\s+branches:\s*\[\s*develop\s*\]/m);
    expect(y).not.toMatch(/pull_request/);
    expect(y).not.toMatch(/workflow_run/);
  });

  it('el PR apunta a main desde develop', () => {
    const y = noComments(load());
    expect(y).toMatch(/--base main/);
    expect(y).toMatch(/--head develop/);
  });

  it('cada uses: de terceros está fijado a SHA de 40 caracteres; actions/* admite etiqueta mayor', () => {
    const uses = [...noComments(load()).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      if (u.startsWith('actions/')) expect(u).toMatch(/^actions\/[\w.-]+@(v\d+|[0-9a-f]{40})$/);
      else expect(u).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
    }
  });

  it('permissions mínimos: sin write-all, sin id-token y con permissions por trabajo', () => {
    const y = noComments(load());
    expect(y).not.toMatch(/write-all/);
    expect(y).not.toMatch(/read-all/);
    expect(y).not.toMatch(/id-token/);
    expect(y).not.toMatch(/^permissions:/m);
    const job = y.split(/^jobs:/m)[1] ?? '';
    expect(job).toMatch(/^ {4}permissions:\s*\n\s+contents:\s*read\s*\n\s+pull-requests:\s*write\s*$/m);
    expect(job).not.toMatch(/contents:\s*write/);
  });

  it('concurrency evita ejecuciones simultáneas sobre la rama', () => {
    expect(noComments(load())).toMatch(/^concurrency:\s*\n\s+group:/m);
  });

  it('no interpola contexto no confiable en run: (commit y título van por env)', () => {
    const y = noComments(load());
    expect(y).not.toMatch(/\$\{\{\s*github\.event\.head_commit/);
    expect(y).not.toMatch(/run:[^\n]*\$\{\{\s*github\.(head_ref|event)/);
    expect(y).toMatch(/GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
  });

  it('REQ-CICD-008: sin git push, sin eliminar candados, sin emojis, sin subir artefactos', () => {
    const y = noComments(load());
    expect(y).not.toMatch(/git push/);
    expect(y).not.toMatch(/index\.lock/);
    expect(y).not.toMatch(/upload-artifact/);
    expect(y).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
