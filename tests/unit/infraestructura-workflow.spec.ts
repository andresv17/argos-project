import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T446 (REQ-CICD-002, 006, 008, 011, 012, REQ-IAC-007, 013, REQ-SEC-001, SC-CLD-004, 025, D-18): infraestructura.yml.
 * Pruebas estáticas por lectura del texto del flujo.
 */
const path = join(process.cwd(), '.github', 'workflows', 'infraestructura.yml');
const load = (): string => readFileSync(path, 'utf8');
const noComments = (s: string): string => s.replace(/^\s*#.*$/gm, '');
const body = (): string => noComments(load());

const job = (name: string): string => {
  const jobs = body().split(/^jobs:\s*$/m)[1] ?? '';
  const parts = jobs.split(/^ {2}(?=[\w-]+:\s*$)/m);
  return parts.find((p) => p.startsWith(`${name}:`)) ?? '';
};
const jobNames = (): string[] => [...(body().split(/^jobs:\s*$/m)[1] ?? '').matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1] ?? '');
const needsOf = (name: string): string[] => {
  const m = /^ {4}needs:\s*(?:\[([^\]]*)\]|(\S+))\s*$/m.exec(job(name));
  return (m?.[1] ?? m?.[2] ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '');
};

describe('.github/workflows/infraestructura.yml (T446)', () => {
  it('el archivo existe y declara los trabajos validate, plan y apply', () => {
    expect(existsSync(path)).toBe(true);
    expect(jobNames()).toEqual(['validate', 'plan', 'apply']);
  });

  it('se dispara con pull_request y push a main acotados a terraform/** y al propio flujo, sin workflow_dispatch', () => {
    const y = body();
    expect(y).toMatch(/^ {2}pull_request:\s*\n\s+paths:/m);
    expect(y).toMatch(/^ {2}push:\s*\n\s+branches:\s*\[\s*main\s*\]\s*\n\s+paths:/m);
    expect(y).toContain("'terraform/**'");
    expect(y).toContain("'.github/workflows/infraestructura.yml'");
    expect(y).not.toMatch(/workflow_dispatch|workflow_run|pull_request_target/);
  });

  it('validate corre fmt -check y validate sin credenciales, sin id-token, sin environment ni secretos', () => {
    const v = job('validate');
    expect(v).toMatch(/terraform fmt -check -recursive/);
    expect(v).toMatch(/terraform init -backend=false/);
    expect(v).toMatch(/terraform validate/);
    expect(v).not.toMatch(/google-github-actions\/auth/);
    expect(v).not.toMatch(/id-token/);
    expect(v).not.toMatch(/environment:/);
    expect(v).not.toMatch(/secrets\./);
    expect(v).toMatch(/^ {4}permissions:\s*\n\s+contents:\s*read\s*$/m);
  });

  it('plan y apply esperan a validate', () => {
    expect(needsOf('plan')).toEqual(['validate']);
    expect(needsOf('apply')).toEqual(['validate']);
  });

  it('el paso de validate-secrets.mjs va antes de la autenticación, del plan y del apply (REQ-CICD-009, T472)', () => {
    for (const name of ['plan', 'apply']) {
      const j = job(name);
      const v = j.indexOf('node scripts/validate-secrets.mjs');
      expect(v).toBeGreaterThan(-1);
      expect(v).toBeLessThan(j.indexOf('google-github-actions/auth'));
      expect(v).toBeLessThan(j.indexOf('terraform plan'));
      if (name === 'apply') expect(v).toBeLessThan(j.indexOf('terraform apply'));
      const step = j.slice(j.lastIndexOf('- name:', v));
      expect(step).toMatch(/TF_VAR_database_url:\s*\$\{\{\s*secrets\.TF_VAR_database_url\s*\}\}/);
      expect(step).toMatch(/TF_VAR_audit_hmac_secret:\s*\$\{\{\s*secrets\.TF_VAR_audit_hmac_secret\s*\}\}/);
      expect(step).toMatch(/DATABASE_URL_DIRECT:\s*\$\{\{\s*secrets\.DATABASE_URL_DIRECT\s*\}\}/);
      expect(step).toMatch(/unset DATABASE_URL_DIRECT/);
      expect(step).not.toMatch(/continue-on-error/);
    }
    expect(body()).not.toMatch(/GITHUB_ENV/);
  });

  it('plan solo corre en pull_request del mismo repositorio, con cuenta de plan, -lock=false, sin environment ni tfplan como artefacto', () => {
    const p = job('plan');
    expect(p).toMatch(/^ {4}if:.*github\.event_name == 'pull_request'/m);
    expect(p).toMatch(/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
    expect(p).toMatch(/service_account:\s*\$\{\{\s*vars\.GCP_TERRAFORM_PLAN_SA\s*\}\}/);
    expect(p).not.toMatch(/GCP_TERRAFORM_SA\b/);
    expect(p).toMatch(/terraform plan[^\n]*-lock=false/);
    expect(p).not.toMatch(/environment:/);
    expect(p).not.toMatch(/upload-artifact/);
    expect(p).not.toMatch(/terraform apply/);
  });

  it('plan publica comentario en el PR sin valores sensibles y falla si el secreto aparece en el texto', () => {
    const p = job('plan');
    expect(p).toMatch(/terraform show -no-color/);
    expect(p).toMatch(/gh pr comment/);
    expect(p).toMatch(/grep -F -q/);
    expect(p).toMatch(/pull-requests:\s*write/);
  });

  it('apply solo corre en push a main, con environment produccion, cuenta de escritura, concurrency y -lock-timeout', () => {
    const a = job('apply');
    expect(a).toMatch(/^ {4}if:.*github\.event_name == 'push'/m);
    expect(a).toMatch(/github\.ref == 'refs\/heads\/main'/);
    expect(a).toMatch(/^ {4}environment:\s*produccion\s*$/m);
    expect(a).toMatch(/service_account:\s*\$\{\{\s*vars\.GCP_TERRAFORM_SA\s*\}\}/);
    expect(a).not.toMatch(/GCP_TERRAFORM_PLAN_SA/);
    expect(a).toMatch(/terraform plan[^\n]*-lock-timeout=5m/);
    expect(a).toMatch(/terraform apply[^\n]*-lock-timeout=5m/);
    expect(body()).toMatch(/^concurrency:\s*\n\s+group:\s*infraestructura-\$\{\{\s*github\.ref\s*\}\}\s*\n\s+cancel-in-progress:\s*false/m);
    expect(body().match(/^\s+environment:/gm)?.length).toBe(1);
  });

  it('plan y apply del main ocurren en el mismo trabajo y tfplan nunca se sube (REQ-CICD-002, H-RAMA-006)', () => {
    const a = job('apply');
    expect(a.indexOf('terraform plan')).toBeGreaterThan(-1);
    expect(a.indexOf('terraform apply')).toBeGreaterThan(a.indexOf('terraform plan'));
    expect(a).toMatch(/terraform apply[^\n]*\/tfplan/);
    expect(body()).not.toMatch(/upload-artifact|download-artifact|actions\/cache/);
  });

  it('TF_VAR_billing_account se pasa en plan y apply (D3 de T443)', () => {
    for (const name of ['plan', 'apply']) {
      expect(job(name)).toMatch(/TF_VAR_billing_account:\s*\$\{\{\s*vars\.TF_VAR_billing_account\s*\}\}/);
    }
  });

  it('variables y secretos del mapa del plan 6.3 se pasan a plan y apply', () => {
    for (const name of ['plan', 'apply']) {
      const j = job(name);
      for (const v of ['TF_VAR_project_id', 'TF_VAR_region', 'TF_VAR_custom_domain']) {
        expect(j).toMatch(new RegExp(`${v}:\\s*\\$\\{\\{\\s*vars\\.${v}\\s*\\}\\}`));
      }
      expect(j).toMatch(/TF_VAR_database_url:\s*\$\{\{\s*secrets\.TF_VAR_database_url\s*\}\}/);
      expect(j).toMatch(/TF_VAR_audit_hmac_secret:\s*\$\{\{\s*secrets\.TF_VAR_audit_hmac_secret\s*\}\}/);
      expect(j).toMatch(/workload_identity_provider:\s*\$\{\{\s*vars\.GCP_WIF_PROVIDER\s*\}\}/);
      expect(j).toMatch(/-backend-config="bucket=\$\{?TF_STATE_BUCKET\}?"/);
      expect(j).toMatch(/-backend-config="prefix=terraform\/argos-state"/);
      expect(j).toMatch(/TF_STATE_BUCKET:\s*\$\{\{\s*vars\.TF_STATE_BUCKET\s*\}\}/);
    }
  });

  it('la guarda de borrados cubre los recursos críticos, incluido google_secret_manager_secret_version, en plan y apply (REQ-IAC-007)', () => {
    for (const name of ['plan', 'apply']) {
      const j = job(name);
      for (const t of ['google_cloud_run_v2_service', 'google_secret_manager_secret', 'google_secret_manager_secret_version', 'google_storage_bucket']) {
        expect(j).toContain(t);
      }
      expect(j).toMatch(/terraform show -json/);
      expect(j).toMatch(/index\("delete"\)/);
      expect(j).toContain('rotacion-secreto');
      expect(j.indexOf('index("delete")')).toBeLessThan(name === 'apply' ? j.indexOf('terraform apply') : j.length);
    }
  });

  it('hashicorp/setup-terraform y google-github-actions/auth van por SHA de 40; actions/* por etiqueta mayor', () => {
    const uses = [...body().matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      if (u.startsWith('actions/')) expect(u).toMatch(/^actions\/[\w.-]+@(v\d+|[0-9a-f]{40})$/);
      else expect(u).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
    }
    expect(uses.some((u) => /^hashicorp\/setup-terraform@[0-9a-f]{40}$/.test(u))).toBe(true);
    expect(uses).toContain('google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093');
    expect(body()).toMatch(/terraform_version:\s*'?1\.17\.2'?/);
  });

  it('permissions mínimos por trabajo: id-token solo en plan y apply, nunca en validate; sin write-all', () => {
    const y = body();
    expect(y).not.toMatch(/write-all|read-all/);
    expect(y).not.toMatch(/^permissions:/m);
    for (const name of jobNames()) {
      const j = job(name);
      expect(j).toMatch(/^ {4}permissions:/m);
      expect(j).toMatch(/contents:\s*read/);
      expect(j).not.toMatch(/contents:\s*write/);
      if (name === 'validate') expect(j).not.toMatch(/id-token/);
      else expect(j).toMatch(/id-token:\s*write/);
    }
    expect(y.match(/id-token:\s*write/g)?.length).toBe(2);
  });

  it('sin interpolación ${{ }} dentro de run:, sin llaves JSON, git push, candados ni emojis', () => {
    const y = body();
    const runs = [...y.matchAll(/^\s*run:\s*(\|[^\n]*\n(?:(?: {8,}[^\n]*)?\n)*|[^\n]*)/gm)].map((m) => m[1] ?? '');
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).not.toMatch(/\$\{\{/);
    expect(y).not.toMatch(/credentials_json|GCP_SA_KEY/);
    expect(y).not.toMatch(/git push|index\.lock/);
    expect(y).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(y).toMatch(/::add-mask::|validate-secrets\.mjs/);
  });
});
