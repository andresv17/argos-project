import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T439 (REQ-IAC-006, REQ-IAC-008, REQ-CLD-007, H-MIF-010): iam.tf. Pruebas estáticas por lectura
 * (Terraform no se ejecuta aquí).
 */
const FILE = join(process.cwd(), 'terraform', 'iam.tf');
const code = (): string => readFileSync(FILE, 'utf8').replace(/^\s*(#|\/\/).*$/gm, '');
const blocks = (): Array<{ type: string; name: string; body: string }> =>
  [...code().matchAll(/resource\s+"([a-z0-9_]+)"\s+"([a-z0-9_]+)"\s*\{([^]*?)\n\}/g)].map((m) => ({
    type: m[1] ?? '',
    name: m[2] ?? '',
    body: m[3] ?? '',
  }));
const roles = (b: { body: string }): string[] => [...b.body.matchAll(/role\s*=\s*"([^"]+)"/g)].map((m) => m[1] ?? '');
const member = (b: { body: string }): string => b.body.match(/member\s*=\s*([^\n]+)/)?.[1]?.trim() ?? '';
const iamBlocks = () => blocks().filter((b) => /_iam_(member|binding)$/.test(b.type));
const forSa = (sa: string) => iamBlocks().filter((b) => member(b).includes(`google_service_account.${sa}.`));

describe('terraform/iam.tf (T439)', () => {
  it('el archivo existe', () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it('define las cuatro cuentas con account_id argos-run, argos-deployer, argos-scheduler y argos-scene-tasks (esta última, enmienda 006 N2-05)', () => {
    const sas = blocks().filter((b) => b.type === 'google_service_account');
    expect(sas.map((b) => b.name).sort()).toEqual(['deployer', 'run', 'scene_tasks', 'scheduler']);
    const ids = sas.map((b) => b.body.match(/account_id\s*=\s*"([^"]+)"/)?.[1]).sort();
    expect(ids).toEqual(['argos-deployer', 'argos-run', 'argos-scene-tasks', 'argos-scheduler']);
  });

  it('argos-run solo tiene secretmanager.secretAccessor, sobre los 7 secretos (D9-30 (8) / T1316; Feature 012 Bloque D añade phone_hmac_key; no a nivel de proyecto); los permisos de medios (T562) los cubre terraform-media.spec.ts', () => {
    const run = forSa('run').filter((b) => b.type === 'google_secret_manager_secret_iam_member');
    expect(run.length).toBe(7);
    for (const b of run) {
      expect(b.type).toBe('google_secret_manager_secret_iam_member');
      expect(roles(b)).toEqual(['roles/secretmanager.secretAccessor']);
    }
    const targets = run.map((b) => b.body.match(/secret_id\s*=\s*([^\n]+)/)?.[1]?.trim()).sort();
    expect(targets).toEqual([
      'google_secret_manager_secret.admin_emails.secret_id',
      'google_secret_manager_secret.audit_hmac_secret.secret_id',
      'google_secret_manager_secret.database_url.secret_id',
      'google_secret_manager_secret.gemini_api_key.secret_id',
      'google_secret_manager_secret.google_oauth_client_secret.secret_id',
      'google_secret_manager_secret.phone_hmac_key.secret_id',
      'google_secret_manager_secret.share_ip_hmac_secret.secret_id',
    ]);
  });

  it('argos-deployer: run.developer, artifactregistry.writer, serviceAccountUser solo sobre argos-run y secretmanager.viewer sobre 7 secretos (D-30; D9-30 (8) / T1316 añade el de Gemini; Feature 012 Bloque D añade el de la ficha QR)', () => {
    const dep = forSa('deployer');
    expect(dep.flatMap(roles).sort()).toEqual([
      'roles/artifactregistry.writer',
      'roles/iam.serviceAccountUser',
      'roles/run.developer',
      'roles/secretmanager.viewer',
      'roles/secretmanager.viewer',
      'roles/secretmanager.viewer',
      'roles/secretmanager.viewer',
      'roles/secretmanager.viewer',
      'roles/secretmanager.viewer',
      'roles/secretmanager.viewer',
    ]);
    const user = dep.find((b) => roles(b)[0] === 'roles/iam.serviceAccountUser');
    expect(user?.type).toBe('google_service_account_iam_member');
    expect(user?.body).toMatch(/service_account_id\s*=\s*google_service_account\.run\.name/);
    expect(dep.find((b) => roles(b)[0] === 'roles/run.developer')?.type).toBe('google_cloud_run_v2_service_iam_member');
    const ar = dep.find((b) => roles(b)[0] === 'roles/artifactregistry.writer');
    expect(ar?.type).toBe('google_artifact_registry_repository_iam_member');
    expect(ar?.body).toMatch(/repository\s*=\s*google_artifact_registry_repository\.argos\.name/);
  });

  it('argos-scheduler solo tiene run.invoker sobre el servicio de Cloud Run', () => {
    const sch = forSa('scheduler');
    expect(sch.length).toBe(1);
    expect(sch[0]?.type).toBe('google_cloud_run_v2_service_iam_member');
    expect(roles(sch[0]!)).toEqual(['roles/run.invoker']);
  });

  it('allUsers solo con roles/run.invoker sobre el servicio de Cloud Run', () => {
    const pub = iamBlocks().filter((b) => member(b).includes('allUsers'));
    expect(pub.length).toBe(1);
    expect(pub[0]?.type).toBe('google_cloud_run_v2_service_iam_member');
    expect(roles(pub[0]!)).toEqual(['roles/run.invoker']);
    expect(code()).not.toContain('allAuthenticatedUsers');
  });

  it('no hay roles de propietario, editor ni administración amplia', () => {
    const all = iamBlocks().flatMap(roles);
    expect(all.length).toBeGreaterThan(0);
    // T560/T562 (REQ-GCS-002): storage.objectUser solo sobre el bucket de medios; lo cubre terraform-media.spec.ts.
    for (const r of all) expect(r).not.toMatch(/owner|editor|\.admin$|roles\/storage\.(?!objectUser$)/);
    expect(code()).not.toMatch(/roles\/(owner|editor)/);
  });

  it('ningún permiso toca el bucket de estado ni de dumps (REQ-IAC-008, H-MIF-010)', () => {
    const c = code();
    // T560/T562: el único recurso de bucket permitido en iam.tf es el binding sobre el bucket de medios (REQ-GCS-002).
    expect(c.replace(/google_storage_bucket_iam_member"\s+"[a-z0-9_]+"\s*\{[^]*?\n\}/g, '')).not.toMatch(/google_storage_bucket/);
    expect(c).not.toMatch(/storage\.(objectAdmin|objectViewer|objectCreator|admin)/);
    expect(c).not.toMatch(/tfstate|exports|dumps/);
  });

  it('no usa bindings autoritativos ni roles de proyecto salvo la excepción documentada de la 006 (solo *_iam_member por recurso; único rol de proyecto: aiplatform.user de argos-run, enmienda N2-05)', () => {
    const c = code();
    expect(c.replace(/resource\s+"google_project_iam_member"\s+"run_aiplatform_user"\s*\{[^]*?\n\}/, '')).not.toMatch(/google_project_iam/);
    expect([...c.matchAll(/google_project_iam_member"\s+"[a-z_]+"/g)]).toHaveLength(1);
    expect(c).not.toMatch(/_iam_(binding|policy)"/);
  });

  it('no hay claves de cuentas de servicio ni credenciales en el texto', () => {
    const c = code();
    expect(c).not.toMatch(/google_service_account_key/);
    expect(c).not.toMatch(/private_key|BEGIN [A-Z ]*PRIVATE KEY|"type"\s*:\s*"service_account"/);
  });
});
