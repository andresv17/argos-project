import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * T435 (REQ-IAC-002, REQ-SEC-006, REQ-CICD-006, REQ-CICD-012, D-12): terraform/bootstrap.sh es un script
 * documentado y revisable que ejecuta Neo; por defecto solo IMPRIME los comandos (dry-run) y nunca contiene secretos.
 */
const SCRIPT = join(process.cwd(), 'terraform', 'bootstrap.sh');
let sandbox: string;
let binDir: string;
let callLog: string;

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH: `${binDir}:/usr/bin:/bin`, HOME: sandbox, ARGOS_PROJECT_ID: 'argos-prueba-123', ARGOS_GITHUB_REPO: 'dueno/argos', ARGOS_BILLING_ACCOUNT: 'AAAAAA-BBBBBB-CCCCCC' },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'argos-bootstrap-'));
  binDir = join(sandbox, 'bin');
  callLog = join(sandbox, 'calls.log');
  spawnSync('mkdir', ['-p', binDir]);
  for (const tool of ['gcloud', 'gsutil', 'gh', 'terraform', 'curl']) {
    const p = join(binDir, tool);
    writeFileSync(p, `#!/bin/bash\necho "${tool} $*" >> "${callLog}"\n`);
    chmodSync(p, 0o755);
  }
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe('terraform/bootstrap.sh (T435)', () => {
  it('existe y declara set -euo pipefail', () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const text = readFileSync(SCRIPT, 'utf8');
    expect(text.startsWith('#!')).toBe(true);
    expect(text).toMatch(/^set -euo pipefail$/m);
  });

  it('no contiene valores de secretos (llaves, URLs con credenciales, tokens ni hex largo)', () => {
    const text = readFileSync(SCRIPT, 'utf8');
    expect(text).not.toMatch(/postgres(ql)?:\/\/[^\s$"']*:[^\s$"']+@/i);
    expect(text).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(text).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}/);
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(text).not.toMatch(/\b[0-9a-f]{32,}\b/i);
    expect(text).not.toMatch(/GCP_SA_KEY/);
    expect(text).not.toMatch(/mirror/i);
  });

  it('sin --execute solo imprime los comandos y no invoca ninguna herramienta', () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/DRY-RUN/);
    expect(r.stdout).toMatch(/gcloud /);
    expect(r.stdout).toMatch(/argos-terraform-plan@/);
    expect(r.stdout).toMatch(/argos-terraform@/);
    expect(r.stdout).toMatch(/argos-prueba-123-tfstate/);
    expect(r.stdout).toMatch(/produccion/);
    expect(existsSync(callLog)).toBe(false);
  });

  it('--dry-run explícito se comporta igual y --execute es el único modo que invoca herramientas', () => {
    const dry = run(['--dry-run']);
    expect(dry.status).toBe(0);
    expect(existsSync(callLog)).toBe(false);
    const text = readFileSync(SCRIPT, 'utf8');
    expect(text).toMatch(/--execute/);
    expect(text).toMatch(/EXECUTE=0/);
  });

  it('cubre bucket versionado de estado, WIF, cuentas separadas, Environment y variables de GitHub', () => {
    const out = run([]).stdout;
    expect(out).toMatch(/versioning/i);
    expect(out).toMatch(/public-access-prevention|public_access_prevention/);
    expect(out).toMatch(/soft-delete-duration=0|soft_delete/);
    expect(out).toMatch(/workload-identity-pools/);
    expect(out).toMatch(/repository_id/);
    expect(out).toMatch(/GCP_TERRAFORM_PLAN_SA/);
    expect(out).toMatch(/GCP_TERRAFORM_SA/);
    expect(out).toMatch(/GCP_WIF_PROVIDER/);
    expect(out).toMatch(/TF_STATE_BUCKET/);
    expect(out).toMatch(/environments\/produccion/);
    expect(out).not.toMatch(/gh secret set [^\n]*--body/);
  });

  it('concede costsManager a argos-terraform@ y solo billing.viewer (lectura) a argos-terraform-plan@ sobre la cuenta de facturación (REQ-IAC-009, D-31)', () => {
    const out = run([]).stdout;
    const lines = out.split('\n').filter((l) => l.includes('billing accounts add-iam-policy-binding'));
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).toContain('AAAAAA-BBBBBB-CCCCCC');
    const apply = lines.filter((l) => l.includes('argos-terraform@argos-prueba-123.iam.gserviceaccount.com'));
    const plan = lines.filter((l) => l.includes('argos-terraform-plan@argos-prueba-123.iam.gserviceaccount.com'));
    expect(apply).toHaveLength(1);
    expect(apply[0]).toContain('roles/billing.costsManager');
    expect(apply[0]).not.toContain('terraform-plan');
    expect(plan).toHaveLength(1);
    expect(plan[0]).toContain('roles/billing.viewer');
    expect(plan[0]).not.toContain('costsManager');
    expect(out).not.toMatch(/roles\/billing\.admin|roles\/owner|roles\/editor/);
  });

  describe('paso 5c: binding WIF de argos-deployer@ pasa a ser declarativo (T489, D-30; sustituye a T485)', () => {
    const DEPLOYER = 'argos-deployer@argos-prueba-123.iam.gserviceaccount.com';
    const IAM = join(process.cwd(), 'terraform', 'iam.tf');
    const iamCode = (): string => readFileSync(IAM, 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
    const wifBlock = (): string =>
      iamCode().match(/resource\s+"google_service_account_iam_member"\s+"[a-z0-9_]+"\s*\{[^]*?workloadIdentityUser[^]*?\n\}/)?.[0] ?? '';

    it('bootstrap.sh ya no imprime ni ejecuta ningun binding manual de argos-deployer@', () => {
      const out = run([]).stdout;
      expect(out.split('\n').filter((l) => l.includes('add-iam-policy-binding') && l.includes(DEPLOYER))).toHaveLength(0);
      expect(out).not.toContain('deploy-argos.yml');
      expect(out).not.toMatch(/workloadIdentityUser[^\n]*deployer|deployer[^\n]*workloadIdentityUser/);
    });

    it('en modo --execute con la cuenta inexistente tampoco emite el aviso de comando manual posterior', () => {
      const text = readFileSync(SCRIPT, 'utf8');
      expect(text).not.toMatch(/DEPLOY_WORKFLOW_REF/);
      expect(text).not.toMatch(/AVISO: \$\{DEPLOY_SA\}/);
      expect(text).not.toMatch(/add-iam-policy-binding "\$DEPLOY_SA"/);
    });

    it('el paso 5c queda como nota que remite a T489 y el comentario de T439/T450 sigue ausente', () => {
      const text = readFileSync(SCRIPT, 'utf8');
      expect(text).not.toMatch(/se añade en T439\/T450/);
      expect(text).toMatch(/5c[^\n]*T489|T489[^\n]*5c/);
    });

    it('el paso 5a/5b siguen presentes (plan y apply no cambian)', () => {
      const out = run([]).stdout;
      expect(out).toContain('5a.');
      expect(out).toContain('5b.');
      expect(out.split('\n').filter((l) => l.includes('infraestructura.yml') && l.includes('attribute.job_workflow_ref'))).toHaveLength(1);
    });

    it('el paso 6 fija TF_VAR_github_repository con el repositorio dueno/argos', () => {
      const out = run([]).stdout;
      const lines = out.split('\n').filter((l) => l.includes('TF_VAR_github_repository'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('gh variable set');
      expect(lines[0]).toContain('dueno/argos');
    });

    it('iam.tf declara el google_service_account_iam_member de workloadIdentityUser sobre deployer, acotado al flujo y a main', () => {
      const b = wifBlock();
      expect(b).not.toBe('');
      expect(b).toMatch(/service_account_id\s*=\s*google_service_account\.deployer\.name/);
      expect(b).toMatch(/role\s*=\s*"roles\/iam\.workloadIdentityUser"/);
      expect(b).toContain('principalSet://iam.googleapis.com/projects/');
      expect(b).toContain('/locations/global/workloadIdentityPools/');
      expect(b).toContain('attribute.job_workflow_ref/${var.github_repository}/.github/workflows/deploy-argos.yml@refs/heads/main');
      expect(b).not.toContain('attribute.repository');
      expect(b).not.toContain('infraestructura.yml');
    });
  });

  it('rechaza argumentos desconocidos y falta de ARGOS_PROJECT_ID', () => {
    expect(run(['--bogus']).status).not.toBe(0);
  });
});
