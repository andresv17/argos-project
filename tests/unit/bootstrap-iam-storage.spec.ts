import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T441a (REQ-IAC-008, REQ-CICD-012, SC-CLD-008; decisión de Neo 2026-11-16, opción i; H-ORA-T452-2, RI-2 de /rama):
 * los permisos de storage de las cuentas de Terraform apply y plan se acotan por bucket y dumps/ no es legible por
 * ninguna cuenta de servicio de CI. Prueba ESTÁTICA sobre terraform/bootstrap.sh; la verificación real es el ensayo T469.
 */
const text = readFileSync(join(process.cwd(), 'terraform', 'bootstrap.sh'), 'utf8');
const lines = text.split('\n');
// Une las continuaciones con "\" para analizar cada comando como una sola línea lógica.
const commands = text.replace(/\\\n\s*/g, ' ').split('\n').filter((l) => !l.trim().startsWith('#'));

const READ_OBJECT_ROLES = [
  'roles/viewer', 'roles/editor', 'roles/owner', 'roles/storage.admin', 'roles/storage.objectViewer',
  'roles/storage.objectAdmin', 'roles/storage.objectUser', 'roles/storage.legacyObjectReader',
  'roles/storage.legacyBucketReader', 'roles/storage.legacyBucketOwner', 'roles/storage.legacyObjectOwner',
];

/** Roles asignados dentro de bucles `for role in ...; do` a nivel de proyecto. */
function projectLevelRoles(): string[] {
  const joined = commands.join('\n');
  const roles: string[] = [];
  for (const m of joined.matchAll(/for role in([\s\S]*?);\s*do/g)) roles.push(...(m[1] ?? '').match(/roles\/[\w.]+/g) ?? []);
  for (const l of commands) if (/projects add-iam-policy-binding/.test(l)) roles.push(...(l.match(/--role=(\S+)/g) ?? []).map((r) => r.slice(7)));
  return roles;
}

describe('bootstrap.sh: IAM de storage acotado por bucket (T441a)', () => {
  it('(a) no concede roles/storage.admin a nivel de proyecto', () => {
    expect(projectLevelRoles().filter((r) => r === 'roles/storage.admin')).toEqual([]);
    expect(commands.filter((l) => l.includes('roles/storage.admin'))).toEqual([]);
  });

  it('(b) los bindings de roles predefinidos de storage son por bucket (buckets add-iam-policy-binding)', () => {
    const storageBindings = commands.filter((l) => /--role=roles\/storage\./.test(l));
    expect(storageBindings.length).toBeGreaterThan(0);
    for (const l of storageBindings) {
      expect(l).toContain('storage buckets add-iam-policy-binding');
      expect(l).not.toContain('projects add-iam-policy-binding');
    }
    expect(projectLevelRoles().filter((r) => r.startsWith('roles/storage.'))).toEqual([]);
  });

  it('(c) ningún binding da lectura de objetos del bucket de dumps a cuentas de CI', () => {
    // A nivel de proyecto no puede haber ningún rol que herede lectura de objetos de todos los buckets.
    expect(projectLevelRoles().filter((r) => READ_OBJECT_ROLES.includes(r))).toEqual([]);
    // Los roles de objetos solo pueden recaer sobre el bucket de estado, nunca sobre el de exports.
    const objectBindings = commands.filter((l) => /--role=roles\/storage\./.test(l));
    for (const l of objectBindings) {
      expect(l).toContain('gs://${STATE_BUCKET}');
      expect(l).not.toMatch(/exports/);
    }
    // El rol personalizado de proyecto solo puede llevar permisos de metadatos de buckets, nunca storage.objects.*.
    const perms = commands.filter((l) => /iam roles (create|update)/.test(l)).join(' ');
    expect(perms).toContain('storage.buckets.create');
    expect(perms).not.toMatch(/storage\.objects\./);
    expect(perms).not.toMatch(/storage\.buckets\.(setIamPolicy|getIamPolicy)/);
  });

  it('(c2) apply conserva storage.buckets.create y plan solo lee metadatos de buckets', () => {
    const roleCmds = commands.filter((l) => /iam roles (create|update)/.test(l));
    expect(roleCmds.length).toBe(2);
    const bindings = commands.filter((l) => /projects add-iam-policy-binding/.test(l) && /projects\/\$\{?PROJECT\}?\/roles\//.test(l));
    expect(bindings.length).toBe(2);
  });

  it('(d) el texto sobre dumps no contradice la decisión (solo Neo lee; sin storage.admin de proyecto)', () => {
    const dumpsLines = lines.filter((l) => l.trim().startsWith('#') && /dumps/.test(l));
    expect(dumpsLines.length).toBeGreaterThan(0);
    for (const l of dumpsLines) {
      expect(l).not.toMatch(/storage\.admin/);
      expect(l).not.toMatch(/legible por (apply|plan|las cuentas de CI)/i);
    }
    expect(dumpsLines.join(' ')).toMatch(/solo Neo/i);
  });
});
