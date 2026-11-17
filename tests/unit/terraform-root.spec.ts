import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T436 (REQ-IAC-001, REQ-IAC-002, REQ-IAC-003, REQ-IAC-009, REQ-SEC-001; H-MIF-004; D-25): raíz plana de Terraform.
 * Pruebas estáticas por lectura (Terraform no se ejecuta aquí).
 */
const DIR = join(process.cwd(), 'terraform');
const read = (f: string): string => readFileSync(join(DIR, f), 'utf8');
const tfFiles = (): string[] => readdirSync(DIR).filter((f) => f.endsWith('.tf'));
/** Quita comentarios de línea para no confundir texto explicativo con código. */
const code = (f: string): string => read(f).replace(/^\s*(#|\/\/).*$/gm, '');
const allCode = (): string => tfFiles().map(code).join('\n');

describe('terraform/ raíz plana (T436)', () => {
  it('existen los cinco archivos raíz', () => {
    for (const f of ['provider.tf', 'backend.tf', 'variables.tf', 'outputs.tf', 'services.tf']) {
      expect(existsSync(join(DIR, f)), f).toBe(true);
    }
  });

  it('es plana: sin module, sin modules/ y sin locals.tf ni bloques locals', () => {
    expect(existsSync(join(DIR, 'modules'))).toBe(false);
    expect(existsSync(join(DIR, 'locals.tf'))).toBe(false);
    expect(allCode()).not.toMatch(/^\s*module\s+"/m);
    expect(allCode()).not.toMatch(/^\s*locals\s*\{/m);
    for (const e of readdirSync(DIR)) {
      if (statSync(join(DIR, e)).isDirectory()) expect(e.startsWith('.terraform')).toBe(true);
    }
  });

  it('backend "gcs" vacío (sin valores; CI inyecta -backend-config)', () => {
    expect(code('backend.tf')).toMatch(/backend\s+"gcs"\s*\{\s*\}/);
  });

  it('proveedor google exacto 7.46.2 y required_version exacto 1.17.2', () => {
    const p = code('provider.tf');
    expect(p).toMatch(/required_version\s*=\s*"1\.17\.2"/);
    expect(p).toMatch(/source\s*=\s*"hashicorp\/google"/);
    expect(p).toMatch(/version\s*=\s*"7\.46\.2"/);
    expect(p).not.toMatch(/[~>=<]\s*7\./);
  });

  it('variables: project_id, region us-central1, project_prefix argos y custom_domain con default "" y validation', () => {
    const v = code('variables.tf');
    expect(v).toMatch(/variable\s+"project_id"/);
    expect(v).toMatch(/variable\s+"region"[^]*?default\s*=\s*"us-central1"/);
    expect(v).toMatch(/variable\s+"project_prefix"[^]*?default\s*=\s*"argos"/);
    const cd = v.match(/variable\s+"custom_domain"\s*\{[^]*?\n\}/);
    expect(cd?.[0] ?? '').toMatch(/default\s*=\s*""/);
    expect(cd?.[0]).toMatch(/validation\s*\{/);
    expect(cd?.[0]).toMatch(/var\.custom_domain\s*==\s*""/);
  });

  it('audit_hmac_secret y database_url son sensitive = true y sin default', () => {
    const v = code('variables.tf');
    for (const name of ['audit_hmac_secret', 'database_url']) {
      const b = v.match(new RegExp(`variable\\s+"${name}"\\s*\\{[^]*?\\n\\}`));
      expect(b?.[0] ?? '', name).toMatch(/sensitive\s*=\s*true/);
      expect(b?.[0], name).not.toMatch(/default\s*=/);
    }
  });

  it('outputs que derivan de secretos son sensitive = true y no hay salidas con valores de variables secretas sin marcar', () => {
    const o = code('outputs.tf');
    const blocks = o.match(/output\s+"[^"]+"\s*\{[^]*?\n\}/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      if (/var\.(database_url|audit_hmac_secret)|secret_data/.test(b)) expect(b).toMatch(/sensitive\s*=\s*true/);
    }
  });

  it('services.tf habilita solo las 12 APIs mínimas con disable_on_destroy = false', () => {
    const s = code('services.tf');
    for (const api of ['run', 'artifactregistry', 'secretmanager', 'iam', 'iamcredentials', 'cloudscheduler', 'storage', 'logging', 'monitoring', 'cloudresourcemanager', 'serviceusage', 'billingbudgets']) {
      expect(s, api).toContain(`"${api}.googleapis.com"`);
    }
    expect((s.match(/\.googleapis\.com"/g) ?? []).length).toBe(12);
    expect(s).toMatch(/disable_on_destroy\s*=\s*false/);
    expect(s).toMatch(/resource\s+"google_project_service"/);
  });

  it('sin google_cloud_run_domain_mapping en la raíz (T481) y sin referencias a Mirror', () => {
    expect(allCode()).not.toMatch(/google_cloud_run_domain_mapping/);
    for (const f of tfFiles()) expect(read(f), f).not.toMatch(/mirror/i);
  });
});
