import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T441 (REQ-IAC-008, REQ-PG-016, SC-CLD-008, H-MIF-010, T484): buckets.tf. Pruebas estáticas por lectura
 * (Terraform no se ejecuta aquí). Sin permisos para argos-run: eso no va aquí (iam.tf).
 */
const FILE = join(process.cwd(), 'terraform', 'buckets.tf');
const code = (): string => readFileSync(FILE, 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
const buckets = (): string[] =>
  [...code().matchAll(/resource\s+"google_storage_bucket"\s+"[a-z0-9_]+"\s*\{([^]*?)\n\}/g)].map((m) => m[1] ?? '');
const bucket = (): string => buckets()[0] ?? '';

describe('terraform/buckets.tf (T441)', () => {
  it('el archivo existe y define exactamente un google_storage_bucket', () => {
    expect(existsSync(FILE)).toBe(true);
    expect(buckets().length).toBe(1);
    const types = [...code().matchAll(/resource\s+"([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(types).toEqual(['google_storage_bucket']);
  });

  it('STANDARD en us-central1, con proyecto de variable', () => {
    expect(bucket()).toMatch(/location\s*=\s*"us-central1"/i);
    expect(bucket()).toMatch(/storage_class\s*=\s*"STANDARD"/);
    expect(bucket()).toMatch(/project\s*=\s*var\.project_id\b/);
  });

  it('acceso uniforme y sin acceso público', () => {
    expect(bucket()).toMatch(/uniform_bucket_level_access\s*=\s*true/);
    expect(bucket()).toMatch(/public_access_prevention\s*=\s*"enforced"/);
  });

  it('soft_delete_policy con retention_duration_seconds = 0 (H-MIF-010)', () => {
    expect(bucket()).toMatch(/soft_delete_policy\s*\{[^}]*retention_duration_seconds\s*=\s*0\b[^}]*\}/);
  });

  it('una sola lifecycle_rule: Delete a los 14 días con prefijo dumps/ (REQ-PG-016, D-R-14)', () => {
    expect((bucket().match(/lifecycle_rule\s*\{/g) ?? []).length).toBe(1);
    const rule = bucket().match(/lifecycle_rule\s*\{([^]*?)\n  \}/)?.[1] ?? '';
    expect(rule).toMatch(/action\s*\{[^}]*type\s*=\s*"Delete"[^}]*\}/);
    expect(rule).toMatch(/condition\s*\{[^}]*age\s*=\s*14\b[^}]*\}/);
    expect(rule).toMatch(/matches_prefix\s*=\s*\["dumps\/"\]/);
  });

  it('labels exactos app=argos y managed-by=terraform (T484)', () => {
    const raw = bucket().match(/^ {2}labels\s*=\s*\{([^]*?)\n {2}\}/m)?.[1] ?? '';
    const map = Object.fromEntries([...raw.matchAll(/^\s*([a-z-]+)\s*=\s*"([^"]*)"\s*$/gm)].map((m) => [m[1], m[2]]));
    expect(map).toEqual({ app: 'argos', 'managed-by': 'terraform' });
  });

  it('el nombre sale de variables, sin literal ni datos sensibles', () => {
    const name = bucket().match(/^ {2}name\s*=\s*(.+)$/m)?.[1] ?? '';
    expect(name).toMatch(/var\.project_prefix/);
    expect(name).toMatch(/var\.project_id/);
    expect(name).not.toMatch(/email|user|usuario|pet|mascota|password|secret|token|@/i);
  });

  it('sin permisos: ningún google_storage_bucket_iam_* ni referencia a argos-run', () => {
    expect(code()).not.toMatch(/_iam_|argos-run|google_service_account|allUsers|allAuthenticatedUsers/);
  });

  it('prevent_destroy = true y sin force_destroy (plan.md l.80)', () => {
    expect(bucket()).toMatch(/prevent_destroy\s*=\s*true/);
    expect(bucket()).not.toMatch(/force_destroy\s*=\s*true/);
  });
});
