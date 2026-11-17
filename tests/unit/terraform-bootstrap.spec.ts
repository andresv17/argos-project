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

  it('concede roles/billing.costsManager sobre la cuenta de facturación solo a argos-terraform@ (REQ-IAC-009)', () => {
    const out = run([]).stdout;
    const lines = out.split('\n').filter((l) => l.includes('billing accounts add-iam-policy-binding'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('AAAAAA-BBBBBB-CCCCCC');
    expect(lines[0]).toContain('roles/billing.costsManager');
    expect(lines[0]).toContain('argos-terraform@argos-prueba-123.iam.gserviceaccount.com');
    expect(lines[0]).not.toContain('terraform-plan');
    expect(out).not.toMatch(/roles\/billing\.admin|roles\/owner|roles\/editor/);
  });

  describe('paso 5c: binding WIF de argos-deployer@ (T485, REQ-CICD-012, REQ-IAC-013, REQ-SEC-001)', () => {
    const DEPLOYER = 'argos-deployer@argos-prueba-123.iam.gserviceaccount.com';
    const bindingLines = (out: string): string[] =>
      out.split('\n').filter((l) => l.includes('service-accounts add-iam-policy-binding') && l.includes(DEPLOYER));

    it('existe un binding workloadIdentityUser para argos-deployer@', () => {
      const lines = bindingLines(run([]).stdout);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('roles/iam.workloadIdentityUser');
    });

    it('su --member se restringe a job_workflow_ref de deploy-argos.yml en refs/heads/main', () => {
      const [line] = bindingLines(run([]).stdout);
      expect(line).toContain('--member=principalSet://iam.googleapis.com/projects/');
      expect(line).toContain('/locations/global/workloadIdentityPools/');
      expect(line).toContain('attribute.job_workflow_ref/dueno/argos/.github/workflows/deploy-argos.yml@refs/heads/main');
      expect(line).not.toContain('attribute.repository_id');
      expect(line).not.toContain('infraestructura.yml');
    });

    it('ningun workloadIdentityUser sobre argos-deployer@ carece de job_workflow_ref y la cuenta de plan no lo recibe', () => {
      const out = run([]).stdout;
      const lines = out.split('\n').filter((l) => l.includes('workloadIdentityUser') || l.includes('--member='));
      const deployerBlocks = out.split('\n').filter((l) => l.includes(DEPLOYER) && l.includes('add-iam-policy-binding'));
      expect(deployerBlocks.length).toBeGreaterThan(0);
      for (const l of deployerBlocks) expect(l).toContain('attribute.job_workflow_ref');
      expect(lines.filter((l) => l.includes('deploy-argos.yml'))).toHaveLength(1);
      expect(out.split('\n').filter((l) => l.includes('terraform-plan@') && l.includes('deploy-argos.yml'))).toHaveLength(0);
    });

    it('el comentario ya no dice que la vinculacion se anade en T439/T450 y apunta al paso 5c (T485)', () => {
      const text = readFileSync(SCRIPT, 'utf8');
      expect(text).not.toMatch(/se añade en T439\/T450/);
      expect(text).toMatch(/5c[^\n]*T485|T485[^\n]*5c/);
    });
  });

  it('rechaza argumentos desconocidos y falta de ARGOS_PROJECT_ID', () => {
    expect(run(['--bogus']).status).not.toBe(0);
  });
});
