import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T489 / D-30 (REQ-IAC-006, REQ-CICD-009, REQ-CICD-012): argos-deployer@ lee solo metadatos de sus 2 secretos
 * (secretmanager.viewer a nivel de secreto, sin versions.access) y el binding WIF no usa comodines.
 * Pruebas estaticas por lectura (Terraform no se ejecuta aqui).
 */
const read = (f: string): string => readFileSync(join(process.cwd(), 'terraform', f), 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
const iam = (): string => read('iam.tf');
const blocks = (): Array<{ type: string; name: string; body: string }> =>
  [...iam().matchAll(/resource\s+"([a-z0-9_]+)"\s+"([a-z0-9_]+)"\s*\{([^]*?)\n\}/g)].map((m) => ({
    type: m[1] ?? '',
    name: m[2] ?? '',
    body: m[3] ?? '',
  }));
const viewer = () =>
  blocks().filter((b) => b.type === 'google_secret_manager_secret_iam_member' && /roles\/secretmanager\.viewer/.test(b.body));

describe('terraform/iam.tf: permisos de secretos del deployer y binding WIF (T489, D-30)', () => {
  it('exactamente 3 recursos secretmanager.viewer, del deployer, sobre database_url, audit_hmac_secret y share_ip_hmac_secret', () => {
    const v = viewer();
    expect(v.map((b) => b.name).sort()).toEqual(['deployer_secret_viewer_audit_hmac', 'deployer_secret_viewer_database_url', 'deployer_secret_viewer_share_ip_hmac']);
    for (const b of v) {
      expect(b.body).toMatch(/member\s*=\s*"serviceAccount:\$\{google_service_account\.deployer\.email\}"/);
    }
    expect(v.map((b) => b.body.match(/secret_id\s*=\s*([^\n]+)/)?.[1]?.trim()).sort()).toEqual([
      'google_secret_manager_secret.audit_hmac_secret.secret_id',
      'google_secret_manager_secret.database_url.secret_id',
      'google_secret_manager_secret.share_ip_hmac_secret.secret_id',
    ]);
  });

  it('ningun secretAccessor para el deployer (solo argos-run lo tiene)', () => {
    for (const b of blocks()) {
      if (/secretAccessor/.test(b.body)) expect(b.body).not.toContain('google_service_account.deployer');
    }
    expect(blocks().filter((b) => /secretAccessor/.test(b.body))).toHaveLength(3);
  });

  it('ningun roles/secretmanager.* a nivel de proyecto', () => {
    const c = iam();
    expect(c).not.toMatch(/google_project_iam/);
    for (const b of blocks().filter((x) => /roles\/secretmanager\./.test(x.body))) {
      expect(b.type).toBe('google_secret_manager_secret_iam_member');
    }
  });

  it('github_repository esta validada owner/name y no tiene default', () => {
    const v = read('variables.tf').match(/variable\s+"github_repository"\s*\{[^]*?\n\}/)?.[0] ?? '';
    expect(v).not.toBe('');
    expect(v).not.toMatch(/\bdefault\s*=/);
    expect(v).toMatch(/type\s*=\s*string/);
    expect(v).toContain('validation');
    expect(v).toContain('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
  });

  it('el principalSet del binding WIF no tiene comodines y es un unico member de workloadIdentityUser', () => {
    const wif = blocks().filter((b) => /roles\/iam\.workloadIdentityUser/.test(b.body));
    expect(wif).toHaveLength(1);
    const body = wif[0]?.body ?? '';
    const member = body.match(/member\s*=\s*"([^"]+)"/)?.[1] ?? '';
    expect(member).toMatch(
      /^principalSet:\/\/iam\.googleapis\.com\/projects\/\$\{[^}]+\}\/locations\/global\/workloadIdentityPools\/\$\{var\.project_prefix\}-github\/attribute\.job_workflow_ref\/\$\{var\.github_repository\}\/\.github\/workflows\/deploy-argos\.yml@refs\/heads\/main$/,
    );
    expect(member).not.toContain('*');
    expect(member).not.toMatch(/attribute\.repository|infraestructura\.yml/);
  });

  it('infraestructura.yml inyecta TF_VAR_github_repository exactamente una vez en cada job plan y apply', () => {
    const wf = readFileSync(join(process.cwd(), '.github', 'workflows', 'infraestructura.yml'), 'utf8');
    const jobsText = wf.slice(wf.search(/^jobs:\s*$/m));
    const parts = jobsText.split(/^ {2}([A-Za-z0-9_-]+):\s*$/m);
    const jobs = new Map<string, string>();
    for (let i = 1; i < parts.length; i += 2) jobs.set(parts[i] ?? '', parts[i + 1] ?? '');
    const line = 'TF_VAR_github_repository: ${{ github.repository }}';
    for (const name of ['plan', 'apply']) {
      const body = jobs.get(name) ?? '';
      expect(body.split(line).length - 1, `job ${name}`).toBe(1);
    }
    expect(wf.split(line).length - 1).toBe(2);
  });
});
