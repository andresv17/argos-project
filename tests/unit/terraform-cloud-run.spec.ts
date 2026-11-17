import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T440 (REQ-CLD-002, REQ-CLD-005, REQ-IAC-010, REQ-IAC-012): cloud_run.tf. Pruebas estáticas por lectura
 * (Terraform no se ejecuta aquí).
 */
const FILE = join(process.cwd(), 'terraform', 'cloud_run.tf');
const code = (): string => readFileSync(FILE, 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
const service = (): string =>
  code().match(/resource\s+"google_cloud_run_v2_service"\s+"argos"\s*\{([^]*?)\n\}/)?.[1] ?? '';
const ignored = (): string[] => {
  const raw = service().match(/ignore_changes\s*=\s*\[([^]*?)\n\s*\]/)?.[1] ?? '';
  return raw
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    .filter((l) => l.length > 0);
};

describe('terraform/cloud_run.tf (T440)', () => {
  it('el archivo existe', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('define google_cloud_run_v2_service "argos" con name argos y location = var.region', () => {
    expect(service()).not.toBe('');
    expect(service()).toMatch(/name\s*=\s*"argos"/);
    expect(service()).toMatch(/location\s*=\s*var\.region\b/);
  });

  it('es el único recurso del archivo', () => {
    const types = [...code().matchAll(/resource\s+"([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(types).toEqual(['google_cloud_run_v2_service']);
  });

  it('declara deletion_protection = true explícito (plan.md l.80, R-1 de Oracle)', () => {
    expect(service()).toMatch(/^\s*deletion_protection\s*=\s*true\s*$/m);
  });

  it('service_account referencia google_service_account.run.email', () => {
    expect(service()).toMatch(/service_account\s*=\s*google_service_account\.run\.email/);
  });

  it('recursos de REQ-CLD-002: 1 vCPU, 512Mi, concurrencia 20, escala 0..2, timeout 60s, cpu_idle, boost', () => {
    const s = service();
    expect(s).toMatch(/min_instance_count\s*=\s*0\b/);
    expect(s).toMatch(/max_instance_count\s*=\s*2\b/);
    expect(s).toMatch(/max_instance_request_concurrency\s*=\s*20\b/);
    expect(s).toMatch(/timeout\s*=\s*"60s"/);
    expect(s).toMatch(/cpu\s*=\s*"1"/);
    expect(s).toMatch(/memory\s*=\s*"512Mi"/);
    expect(s).toMatch(/cpu_idle\s*=\s*true/);
    expect(s).toMatch(/startup_cpu_boost\s*=\s*true/);
    expect(s).toMatch(/ingress\s*=\s*"INGRESS_TRAFFIC_ALL"/);
  });

  it('la imagen es marcadora pública (no del repositorio, sin secretos)', () => {
    const img = service().match(/image\s*=\s*"([^"]+)"/)?.[1] ?? '';
    expect(img).toMatch(/^(us-docker\.pkg\.dev\/cloudrun\/container\/hello|gcr\.io\/cloudrun\/hello)(:[A-Za-z0-9._-]+)?$/);
    expect(service().match(/image\s*=/g)?.length).toBe(1);
  });

  it('sin sondas propias, sin env ni referencias a secretos (REQ-IAC-012)', () => {
    const s = service();
    expect(s).not.toMatch(/startup_probe\s*\{/);
    expect(s).not.toMatch(/liveness_probe\s*\{/);
    expect(s).not.toMatch(/\benv\s*\{/);
    expect(s).not.toMatch(/secret_key_ref|value_source|secret_manager|google_secret_manager/);
    expect(s).not.toMatch(/var\.(database_url|audit_hmac_secret)/);
  });

  it('lifecycle ignore_changes contiene exactamente los campos de REQ-IAC-010/012', () => {
    expect(ignored().sort()).toEqual(
      [
        'client',
        'client_version',
        'template[0].annotations',
        'template[0].containers[0].env',
        'template[0].containers[0].image',
        'template[0].containers[0].liveness_probe',
        'template[0].containers[0].startup_probe',
        'template[0].labels',
        'template[0].revision',
        'traffic',
      ].sort(),
    );
  });

  it('no hay literales de secretos ni de URL', () => {
    const c = code();
    expect(c).not.toMatch(/postgres(ql)?:\/\//);
    expect(c).not.toMatch(/https?:\/\/(?!\s)/);
    expect(c).not.toMatch(/private_key|password|secret_value|DATABASE_URL|HMAC/i);
  });

  it('no hay google_cloud_run_domain_mapping (T481) ni IAM público (ya está en iam.tf)', () => {
    const c = code();
    expect(c).not.toMatch(/google_cloud_run_domain_mapping/);
    expect(c).not.toMatch(/allUsers|allAuthenticatedUsers|_iam_/);
  });
});
