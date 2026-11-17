import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T452 (RI-3, RI-y; REQ-PG-016, REQ-IAC-008): endurecimiento del runbook de respaldo y de los .gitignore.
 * Pruebas estaticas por lectura de texto.
 */
const read = (...p: string[]): string => readFileSync(join(process.cwd(), ...p), 'utf8');
const lines = (s: string): string[] => s.split('\n').map((l) => l.trim());

describe('*.tfvars ignorados (RI-y)', () => {
  for (const [name, file] of [
    ['terraform/.gitignore', ['terraform', '.gitignore']],
    ['.gitignore raiz', ['.gitignore']],
  ] as const) {
    it(`${name} ignora *.tfvars y *.tfvars.json`, () => {
      const l = lines(read(...file));
      expect(l).toContain('*.tfvars');
      expect(l).toContain('*.tfvars.json');
    });
  }

  it('terraform/.gitignore no ignora el lock de proveedores', () => {
    expect(lines(read('terraform', '.gitignore'))).not.toContain('.terraform.lock.hcl');
  });
});

const docs: ReadonlyArray<readonly [string, string[]]> = [
  ['terraform/README.md', ['terraform', 'README.md']],
  ['quickstart.md (003)', ['specs', '003-cloud-gcp', 'quickstart.md']],
];

describe('pipe de pg_dump protegido (RI-3, REQ-PG-016)', () => {
  for (const [name, file] of docs) {
    describe(name, () => {
      const t = read(...file);
      it('usa set -eo pipefail', () => {
        expect(t).toMatch(/set -eo pipefail/);
      });
      it('mantiene el pipe sin archivo local', () => {
        expect(t).toMatch(/pg_dump "\$DATABASE_URL_DIRECT" \| gcloud storage cp - /);
        expect(t).not.toMatch(/pg_dump[^\n|]*>\s*\S+\.sql/);
      });
      it('verifica que el objeto no este vacio', () => {
        expect(t).toMatch(/gcloud storage objects describe[^\n]*size/);
        expect(t).toMatch(/-gt 0/);
      });
      it('comprueba el codigo de salida de pg_dump y borra el objeto parcial', () => {
        expect(t).toMatch(/if ! pg_dump/);
        expect(t).toMatch(/gcloud storage rm/);
      });
    });
  }
});

describe('H-A1/H-A3: OBJ calculado una vez y nota de shell interactiva (terraform/README.md)', () => {
  const t = read('terraform', 'README.md');
  const bloque = (): string => {
    const b = [...t.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1] as string).find((x) => x.includes('pg_dump'));
    expect(typeof b).toBe('string');
    return b as string;
  };
  it('el bloque de respaldo tiene un unico $(date y el cp usa "$OBJ"', () => {
    const b = bloque();
    expect(b.match(/\$\(date/g)?.length).toBe(1);
    expect(b).toMatch(/\| gcloud storage cp - "\$OBJ"/);
    expect(b).not.toMatch(/cp - "gs:/);
  });
  it('avisa de que set -eo pipefail cierra una shell interactiva y recomienda subshell o script', () => {
    expect(t).toMatch(/shell interactiva[^\n]*(cierra|termina)/i);
    expect(t).toMatch(/subshell/i);
  });
});
