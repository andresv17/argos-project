import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T442 (REQ-CLD-007, REQ-SEC-007, NFR-CLD-001): scheduler.tf. Pruebas estáticas por lectura
 * (Terraform no se ejecuta aquí). Horario `0 6 * * *` America/Bogota: plan.md §2.2.
 */
const FILE = join(process.cwd(), 'terraform', 'scheduler.tf');
const code = (): string => readFileSync(FILE, 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
const jobs = (): string[] =>
  [...code().matchAll(/resource\s+"google_cloud_scheduler_job"\s+"[a-z0-9_]+"\s*\{([^]*?)\n\}/g)].map((m) => m[1] ?? '');
const job = (): string => jobs()[0] ?? '';
const target = (): string => job().match(/http_target\s*\{([^]*?)\n  \}/)?.[1] ?? '';

describe('terraform/scheduler.tf (T442)', () => {
  it('el archivo existe', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('define exactamente UN google_cloud_scheduler_job y es el único recurso', () => {
    expect(jobs().length).toBe(1);
    const types = [...code().matchAll(/resource\s+"([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(types).toEqual(['google_cloud_scheduler_job']);
  });

  it('name = argos-maintenance, region = var.region y project = var.project_id', () => {
    expect(job()).toMatch(/name\s*=\s*"argos-maintenance"/);
    expect(job()).toMatch(/region\s*=\s*var\.region\b/);
    expect(job()).toMatch(/project\s*=\s*var\.project_id\b/);
  });

  it('schedule diario "0 6 * * *" en America/Bogota (plan.md §2.2)', () => {
    expect(job()).toMatch(/schedule\s*=\s*"0 6 \* \* \*"/);
    expect(job()).toMatch(/time_zone\s*=\s*"America\/Bogota"/);
  });

  it('http_target: POST hacia una uri que termina en /internal/maintenance', () => {
    expect(target()).toMatch(/http_method\s*=\s*"POST"/);
    expect(target()).toMatch(/uri\s*=\s*"\$\{google_cloud_run_v2_service\.argos\.uri\}\/internal\/maintenance"/);
  });

  it('oidc_token: cuenta argos-scheduler y audience = URL del servicio (sin ruta)', () => {
    const oidc = target().match(/oidc_token\s*\{([^]*?)\}/)?.[1] ?? '';
    expect(oidc).toMatch(/service_account_email\s*=\s*google_service_account\.scheduler\.email\b/);
    expect(oidc).toMatch(/audience\s*=\s*google_cloud_run_v2_service\.argos\.uri\s*$/m);
  });

  it('sin literales de URL, credenciales ni cuerpo ni cabeceras de autorización', () => {
    expect(code()).not.toMatch(/https?:\/\//);
    expect(code()).not.toMatch(/@[^"\s]*\.iam\.gserviceaccount\.com/);
    expect(target()).not.toMatch(/\bbody\b|\bheaders\b|oauth_token|Authorization|password|secret/i);
  });

  it('depende del servicio y de las APIs habilitadas (cloudscheduler) y del invoker', () => {
    expect(job()).toMatch(/depends_on\s*=\s*\[[^\]]*google_project_service\.apis[^\]]*\]/);
    expect(job()).toMatch(
      /depends_on\s*=\s*\[[^\]]*google_cloud_run_v2_service_iam_member\.scheduler_invoker[^\]]*\]/,
    );
  });
});
