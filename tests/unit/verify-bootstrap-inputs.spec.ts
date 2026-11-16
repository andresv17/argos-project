import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Decisión de Neo (Level 2, 2026-11-16): scripts/verify-bootstrap-inputs.sh valida herramientas y variables NO secretas
 * antes de terraform/bootstrap.sh. Sin red: gh, gcloud y terraform son stubs en un PATH temporal. Salida: 0 pasa,
 * 1 falla alguna comprobación, 2 faltan variables obligatorias. Nunca imprime valores de secretos ni de cuentas.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'verify-bootstrap-inputs.sh');
const roots: string[] = [];

const STUBS: Record<string, string> = {
  gh: '#!/bin/sh\nexit 0\n',
  gcloud: '#!/bin/sh\necho "cuenta-secreta@example.com"\nexit 0\n',
  terraform: '#!/bin/sh\nexit 0\n',
};

function makeBin(omit: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'argos-vbi-'));
  roots.push(dir);
  for (const [name, body] of Object.entries(STUBS)) {
    if (omit.includes(name)) continue;
    const p = join(dir, name);
    writeFileSync(p, body);
    chmodSync(p, 0o755);
  }
  return dir;
}

const VALID: Record<string, string> = {
  ARGOS_PROJECT_ID: 'argos-prod-123',
  ARGOS_GITHUB_REPO: 'neo/proyecto-argos',
  ARGOS_BILLING_ACCOUNT: 'ABCDEF-123456-0A1B2C',
};

function run(env: Record<string, string | undefined>, omit: string[] = []) {
  const bin = makeBin(omit);
  const r = spawnSync('bash', [SCRIPT], {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: bin, ...env } as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

afterAll(() => { for (const d of roots) rmSync(d, { recursive: true, force: true }); });

describe('verify-bootstrap-inputs.sh', () => {
  it('todo válido: sale 0 y reporta PASA', () => {
    const r = run(VALID);
    expect(r.code).toBe(0);
    expect(r.out).toContain('PASA');
    expect(r.out).not.toContain('FALLA');
  });

  it('todo válido con región y revisor opcionales: sale 0', () => {
    const r = run({ ...VALID, ARGOS_REGION: 'southamerica-east1', ARGOS_GITHUB_REVIEWER: 'Neo-the-One' });
    expect(r.code).toBe(0);
  });

  it('falta ARGOS_PROJECT_ID: sale 2', () => {
    const r = run({ ARGOS_GITHUB_REPO: VALID.ARGOS_GITHUB_REPO, ARGOS_BILLING_ACCOUNT: VALID.ARGOS_BILLING_ACCOUNT });
    expect(r.code).toBe(2);
    expect(r.out).toContain('ARGOS_PROJECT_ID');
  });

  it('falta ARGOS_GITHUB_REPO o ARGOS_BILLING_ACCOUNT: sale 2', () => {
    expect(run({ ARGOS_PROJECT_ID: VALID.ARGOS_PROJECT_ID, ARGOS_BILLING_ACCOUNT: VALID.ARGOS_BILLING_ACCOUNT }).code).toBe(2);
    expect(run({ ARGOS_PROJECT_ID: VALID.ARGOS_PROJECT_ID, ARGOS_GITHUB_REPO: VALID.ARGOS_GITHUB_REPO }).code).toBe(2);
  });

  it.each(['Argos-Prod-123', 'argos-prod-', '1argos-prod', 'abc', 'a'.repeat(31), 'argos_prod'])(
    'ID de proyecto inválido %s: sale 1',
    (id) => {
      const r = run({ ...VALID, ARGOS_PROJECT_ID: id });
      expect(r.code).toBe(1);
      expect(r.out).toContain('FALLA');
    },
  );

  it.each(['neo-proyecto', 'neo/', '/repo', 'a/b/c', 'neo/pro yecto'])('repo inválido %s: sale 1', (repo) => {
    expect(run({ ...VALID, ARGOS_GITHUB_REPO: repo }).code).toBe(1);
  });

  it.each(['ABCDEF-123456', 'abcdef-123456-0a1b2c', 'ABCDEF-123456-0A1B2', 'ABCDEF_123456_0A1B2C'])(
    'billing inválido %s: sale 1',
    (b) => {
      expect(run({ ...VALID, ARGOS_BILLING_ACCOUNT: b }).code).toBe(1);
    },
  );

  it.each(['US-CENTRAL1', 'uscentral1', 'us-central', 'us_central1', 'us-central1-a'])('región inválida %s: sale 1', (reg) => {
    expect(run({ ...VALID, ARGOS_REGION: reg }).code).toBe(1);
  });

  it.each(['-neo', 'neo-', 'ne--o', 'ne o', 'a'.repeat(40)])('revisor inválido %s: sale 1', (rev) => {
    expect(run({ ...VALID, ARGOS_GITHUB_REVIEWER: rev }).code).toBe(1);
  });

  it.each(['gh', 'gcloud', 'terraform'])('herramienta ausente %s: sale 1', (tool) => {
    const r = run(VALID, [tool]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(tool);
    expect(r.out).toContain('FALLA');
  });

  it('gh sin autenticar: sale 1', () => {
    const bin = makeBin();
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 1\n');
    const r = spawnSync('bash', [SCRIPT], { env: { PATH: `${bin}:/usr/bin:/bin`, ...VALID } as NodeJS.ProcessEnv, encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('gcloud sin cuenta activa: sale 1', () => {
    const bin = makeBin();
    writeFileSync(join(bin, 'gcloud'), '#!/bin/sh\nexit 0\n');
    const r = spawnSync('bash', [SCRIPT], { env: { PATH: `${bin}:/usr/bin:/bin`, ...VALID } as NodeJS.ProcessEnv, encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('no imprime secretos ni la cuenta de gcloud, pero recuerda GitHub Secrets', () => {
    const secrets = {
      DATABASE_URL: 'valor-prueba-CLAVE-DE-PRUEBA-123',
      TF_VAR_database_url: 'valor-prueba-OTRA-CLAVE-456',
      TF_VAR_audit_hmac_secret: 'deadbeef'.repeat(8),
    };
    const r = run({ ...VALID, ...secrets });
    expect(r.code).toBe(0);
    expect(r.out).toContain('GitHub Secrets');
    for (const v of Object.values(secrets)) expect(r.out).not.toContain(v);
    expect(r.out).not.toContain('CLAVE-DE-PRUEBA');
    expect(r.out).not.toContain('OTRA-CLAVE');
    expect(r.out).not.toContain('cuenta-secreta@example.com');
  });

  it('no imprime los valores de las variables validadas', () => {
    const r = run({ ...VALID, ARGOS_PROJECT_ID: 'Valor-Con-Mayusculas' });
    expect(r.out).not.toContain('Valor-Con-Mayusculas');
  });
});
