import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const steps = (name: string): string[] => (job(name).split(/^ {4}steps:\s*$/m)[1] ?? '').split(/^ {6}(?=- name:)/m).filter((x) => x.trim() !== '');
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

  it('DEUDA-INFRA-BOOTSTRAP-CHECK: validate avisa (::warning:: y GITHUB_STEP_SUMMARY) si cambia terraform/bootstrap.sh, sin secretos y con base por env', () => {
    const step = steps('validate').find((x) => x.includes('DEUDA-INFRA-BOOTSTRAP-CHECK')) ?? '';
    expect(step).not.toBe('');
    expect(step).toMatch(/BASE_SHA:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha \|\| github\.event\.before\s*\}\}/);
    expect(step).toContain('terraform/bootstrap.sh');
    expect(step).toMatch(/::warning file=terraform\/bootstrap\.sh::[^\n]*roles IAM/);
    expect(step).toContain('GITHUB_STEP_SUMMARY');
    expect(job('validate')).toMatch(/fetch-depth:\s*0/);
  });

  it('DEUDA-INFRA-BOOTSTRAP-CHECK: ejecutado el paso en un repo temporal, avisa y resume solo si bootstrap.sh cambio', () => {
    const run = /run: \|\n((?: {10,}[^\n]*\n|\n)+)/.exec(steps('validate').find((x) => x.includes('DEUDA-INFRA-BOOTSTRAP-CHECK')) ?? '')?.[1] ?? '';
    expect(run).not.toBe('');
    const dir = mkdtempSync(join(tmpdir(), 'bootstrap-check-'));
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
    const sh = (cmd: string, extra: Record<string, string> = {}) => spawnSync('bash', ['-c', cmd], { cwd: dir, encoding: 'utf8', env: { ...env, ...extra } });
    sh('git init -q && mkdir terraform && echo a > terraform/bootstrap.sh && echo a > terraform/main.tf && git add -A && git commit -q -m base');
    const base = sh('git rev-parse HEAD').stdout.trim();
    const summary = join(dir, 'summary.md');
    // 1) cambio solo de main.tf: sin aviso
    sh('echo b > terraform/main.tf && git commit -qam tf');
    const quiet = sh(run, { BASE_SHA: base, GITHUB_STEP_SUMMARY: summary });
    expect(quiet.status).toBe(0);
    expect(quiet.stdout).not.toContain('::warning');
    expect(existsSync(summary)).toBe(false);
    // 2) cambio de bootstrap.sh: aviso y resumen
    sh('echo b > terraform/bootstrap.sh && git commit -qam bs');
    const loud = sh(run, { BASE_SHA: base, GITHUB_STEP_SUMMARY: summary });
    expect(loud.status).toBe(0);
    expect(loud.stdout).toContain('::warning file=terraform/bootstrap.sh::');
    expect(readFileSync(summary, 'utf8')).toContain('Cambio en terraform/bootstrap.sh');
    expect(readFileSync(summary, 'utf8')).toContain('roles IAM');
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
    expect(body()).not.toMatch(/(?:TF_VAR_\w+|DATABASE_URL\w*)[^\n]*>>\s*"?\$GITHUB_ENV/);
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
      expect(j).toMatch(/workload_identity_provider:\s*\$\{\{\s*vars\.GCP_WIF_PROVIDER\s*\}\}/);
      expect(j).toMatch(/-backend-config="bucket=\$\{?TF_STATE_BUCKET\}?"/);
      expect(j).toMatch(/-backend-config="prefix=terraform\/argos-state"/);
      expect(j).toMatch(/TF_STATE_BUCKET:\s*\$\{\{\s*vars\.TF_STATE_BUCKET\s*\}\}/);
    }
  });

  it('la guarda de borrados invoca scripts/terraform-plan-guard.mjs con plan.json, en plan y apply, sin lógica jq duplicada (Neo Q4, REQ-IAC-007)', () => {
    for (const name of ['plan', 'apply']) {
      const j = job(name);
      expect(j).toMatch(/terraform show -json/);
      expect(j).toMatch(/node scripts\/terraform-plan-guard\.mjs "\$\{RUNNER_TEMP\}\/plan\.json"/);
      expect(j).not.toMatch(/(^|[\s|(])jq\s/m);
      expect(j).not.toContain('index("delete")');
      expect(j).not.toMatch(/ROTACION_SECRETO/);
      const guard = j.indexOf('terraform-plan-guard.mjs');
      expect(guard).toBeGreaterThan(j.indexOf('terraform show -json'));
      if (name === 'apply') expect(guard).toBeLessThan(j.indexOf('terraform apply'));
      const step = j.slice(j.lastIndexOf('- name:', guard), guard);
      expect(step).not.toMatch(/continue-on-error/);
    }
  });

  it('los secretos TF_VAR_* y DATABASE_URL_DIRECT no aparecen en el env: de nivel de trabajo (D-H1, REQ-SEC-001)', () => {
    for (const name of ['plan', 'apply']) {
      const head = job(name).split(/^ {4}steps:\s*$/m)[0] ?? '';
      expect(head).toMatch(/^ {4}env:/m);
      expect(head).not.toMatch(/TF_VAR_database_url|TF_VAR_audit_hmac_secret|DATABASE_URL_DIRECT|secrets\./);
    }
  });

  it('los secretos solo aparecen en env: de pasos de validación, plan, apply y guardia (D-H1)', () => {
    const allowed = /validate-secrets\.mjs|terraform plan|terraform apply|terraform-plan-guard\.mjs|gh pr comment/;
    for (const name of ['plan', 'apply']) {
      const sts = steps(name);
      expect(sts.length).toBeGreaterThan(5);
      const withSecret = sts.filter((st) => /secrets\.(TF_VAR_|DATABASE_URL)/.test(st));
      expect(withSecret.length).toBeGreaterThanOrEqual(3);
      for (const st of withSecret) {
        expect(st).toMatch(allowed);
        expect(st).not.toMatch(/uses:/);
      }
      for (const key of ['checkout', 'setup-node', 'setup-terraform', 'google-github-actions/auth']) {
        const st = sts.find((x) => x.includes(key)) ?? '';
        expect(st).not.toBe('');
        expect(st).not.toMatch(/secrets\./);
        expect(st).not.toMatch(/TF_VAR_database_url|TF_VAR_audit_hmac_secret|DATABASE_URL_DIRECT/);
      }
      const need = (re: RegExp): string => sts.find((x) => re.test(x)) ?? '';
      for (const st of [need(/validate-secrets\.mjs/), need(/terraform plan/), need(/terraform-plan-guard\.mjs/)]) {
        expect(st).toMatch(/TF_VAR_database_url:\s*\$\{\{\s*secrets\.TF_VAR_database_url\s*\}\}/);
        expect(st).toMatch(/TF_VAR_audit_hmac_secret:\s*\$\{\{\s*secrets\.TF_VAR_audit_hmac_secret\s*\}\}/);
      }
      expect(need(/validate-secrets\.mjs/)).toMatch(/DATABASE_URL_DIRECT:\s*\$\{\{\s*secrets\.DATABASE_URL_DIRECT\s*\}\}/);
    }
    const ap = steps('apply').find((x) => /terraform apply/.test(x)) ?? '';
    expect(ap).toMatch(/TF_VAR_database_url:\s*\$\{\{\s*secrets\.TF_VAR_database_url\s*\}\}/);
    expect(ap).toMatch(/TF_VAR_audit_hmac_secret:\s*\$\{\{\s*secrets\.TF_VAR_audit_hmac_secret\s*\}\}/);
    const cm = steps('plan').find((x) => /gh pr comment/.test(x)) ?? '';
    expect(cm).toMatch(/TF_VAR_database_url:\s*\$\{\{\s*secrets\.TF_VAR_database_url\s*\}\}/);
  });

  it('PLAN_GUARD_LABELS se valida con regex estricta antes de escribirse en GITHUB_ENV (D-H1, R-2)', () => {
    const st = steps('apply').find((x) => /PLAN_GUARD_LABELS=/.test(x)) ?? '';
    expect(st).not.toBe('');
    const check = st.search(/grep -E[q]? [^\n]*\^\[a-z0-9,\._-\]\*\$/);
    const write = st.search(/PLAN_GUARD_LABELS=[^\n]*>>\s*"\$GITHUB_ENV"/);
    expect(check).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(check);
    expect(st).toMatch(/exit 1/);
  });

  describe('fragmento de validación de PLAN_GUARD_LABELS ejecutado en bash (H-DH1-1)', () => {
    const run = (labels: string): { rc: number; env: string } => {
      const st = steps('apply').find((x) => /PLAN_GUARD_LABELS=/.test(x)) ?? '';
      const from = st.indexOf('          if ');
      const frag = st.slice(from);
      expect(from).toBeGreaterThan(-1);
      const dir = mkdtempSync(join(tmpdir(), 'pgl-'));
      const envFile = join(dir, 'github_env');
      const script = `set -euo pipefail\nLABELS="$LABELS_IN"\n${frag.replace(/^ {10}/gm, '')}`;
      const r = spawnSync('bash', ['-c', script], { env: { ...process.env, LABELS_IN: labels, GITHUB_ENV: envFile }, encoding: 'utf8' });
      return { rc: r.status ?? -1, env: existsSync(envFile) ? readFileSync(envFile, 'utf8') : '' };
    };

    it('LABELS vacío es válido: rc 0 y escribe PLAN_GUARD_LABELS= vacío', () => {
      const r = run('');
      expect(r.rc).toBe(0);
      expect(r.env).toBe('PLAN_GUARD_LABELS=\n');
    });

    it('etiquetas válidas pasan y se escriben', () => {
      const r = run('rotacion-secreto,aprobacion-manual');
      expect(r.rc).toBe(0);
      expect(r.env).toBe('PLAN_GUARD_LABELS=rotacion-secreto,aprobacion-manual\n');
    });

    it('rechaza salto de línea (a\\nB=1) sin escribir en GITHUB_ENV', () => {
      const r = run('a\nB=1');
      expect(r.rc).not.toBe(0);
      expect(r.env).toBe('');
    });

    it('rechaza espacio (A b) sin escribir en GITHUB_ENV', () => {
      const r = run('A b');
      expect(r.rc).not.toBe(0);
      expect(r.env).toBe('');
    });
  });

  it('las etiquetas llegan al guardia por PLAN_GUARD_LABELS (rotacion-secreto y aprobacion-manual), sin interpolar en run', () => {
    const p = job('plan');
    expect(p).toMatch(/PLAN_GUARD_LABELS:\s*\$\{\{\s*join\(github\.event\.pull_request\.labels\.\*\.name,\s*','\)\s*\}\}/);
    const a = job('apply');
    expect(a).toMatch(/commits\/\$\{GITHUB_SHA\}\/pulls/);
    expect(a).toMatch(/PLAN_GUARD_LABELS=[^\n]*>>\s*"\$GITHUB_ENV"/);
    expect(a.indexOf('PLAN_GUARD_LABELS=')).toBeLessThan(a.indexOf('terraform-plan-guard.mjs'));
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
