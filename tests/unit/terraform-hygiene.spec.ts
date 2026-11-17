import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T444 (REQ-IAC-003, REQ-IAC-008, REQ-SEC-001, SC-CLD-005, SC-CLD-008): higiene transversal de terraform/.
 * Pruebas estáticas por lectura; fmt y validate corren como compuertas aparte.
 */
const dir = join(process.cwd(), 'terraform');
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    if (f === '.terraform') return [];
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const read = (f: string): string => readFileSync(join(dir, f), 'utf8');
const noComments = (s: string): string => s.replace(/^\s*(#|\/\/).*$/gm, '');

describe('terraform/ higiene (T444)', () => {
  it('grep -ri mirror terraform/ = 0 (SC-CLD-005)', () => {
    const hits = files(dir).filter((f) => /mirror/i.test(readFileSync(f, 'utf8')) || /mirror/i.test(f));
    expect(hits).toEqual([]);
  });

  it('.terraform.lock.hcl versionado: google 7.46.2 con hashes de al menos dos plataformas', () => {
    const lock = read('.terraform.lock.hcl');
    expect(lock).toContain('provider "registry.terraform.io/hashicorp/google"');
    expect(lock).toMatch(/version\s*=\s*"7\.46\.2"/);
    expect([...lock.matchAll(/"h1:/g)].length).toBeGreaterThanOrEqual(2);
  });

  it('el directorio .terraform y los estados están ignorados por Git', () => {
    const ig = noComments(read('.gitignore'));
    expect(ig).toMatch(/^\.terraform\/$/m);
    expect(ig).toMatch(/^\*\.tfstate/m);
    expect(ig).toMatch(/^\*\.tfplan$|^tfplan$/m);
    expect(ig).not.toMatch(/terraform\.lock/);
  });

  it('las variables de secreto llevan sensitive = true y ninguna otra variable de secreto queda sin ella', () => {
    const v = noComments(read('variables.tf'));
    const blocks = [...v.matchAll(/variable\s+"([a-z0-9_]+)"\s*\{([^]*?)\n\}/g)];
    const secretNames = ['database_url', 'audit_hmac_secret'];
    for (const n of secretNames) {
      const b = blocks.find((m) => m[1] === n);
      expect(b?.[2]).toMatch(/sensitive\s*=\s*true/);
    }
    for (const b of blocks) {
      if (/(secret|password|token|key|url)/i.test(b[1] ?? '') && b[1] !== 'billing_account') {
        expect(b[2]).toMatch(/sensitive\s*=\s*true/);
      }
    }
  });

  it('toda salida que referencie una variable o recurso de secreto lleva sensitive = true', () => {
    const o = noComments(read('outputs.tf'));
    for (const m of o.matchAll(/output\s+"([a-z0-9_]+)"\s*\{([^]*?)\n\}/g)) {
      if (/var\.(database_url|audit_hmac_secret)|secret_data|secret_manager_secret_version/.test(m[2] ?? '')) {
        expect(m[2]).toMatch(/sensitive\s*=\s*true/);
      }
    }
  });

  it('el bucket de estado de bootstrap.sh crea con soft delete 0 s', () => {
    const b = read('bootstrap.sh');
    const create = b.match(/buckets create "gs:\/\/\$\{STATE_BUCKET\}"[^]*?\n(?=run |#|[A-Z]+=)/)?.[0] ?? '';
    expect(create).toMatch(/--soft-delete-duration=0\b/);
  });

  it('el bucket de dumps lleva soft_delete_policy en 0 s', () => {
    const b = noComments(read('buckets.tf'));
    expect(b).toMatch(/soft_delete_policy\s*\{\s*retention_duration_seconds\s*=\s*0\s*\}/);
  });

  it('README.md de Terraform documenta soft delete 0 s en estado y dumps, sensitive, lock y compuertas', () => {
    const r = read('README.md');
    expect(r).toMatch(/soft[ _]delete/i);
    expect(r).toMatch(/retentionDurationSeconds|soft-delete-duration=0|soft_delete_policy/);
    expect(r).toMatch(/sensitive/);
    expect(r).toContain('.terraform.lock.hcl');
    expect(r).toContain('terraform fmt -check');
    expect(r).toContain('terraform validate');
    expect(r).toContain('bootstrap.sh');
    expect(r).toContain('TF_VAR_billing_account');
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
  });
});
