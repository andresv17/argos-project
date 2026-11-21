import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T806 [N2] (INV-ESC6-013; REQ-ESC6-031; SC-ESC6-034, SC-ESC6-092; R-LINK-006-3; N2-08):
 * deploy-argos.yml lleva las variables ARGOS_SCENE_* no secretas en --set-env-vars (que reemplaza todo el entorno),
 * nunca ARGOS_SCENE_DRIVER=real y ningún secreto nuevo. Pruebas estáticas por lectura del texto.
 */
const text = readFileSync(join(process.cwd(), '.github', 'workflows', 'deploy-argos.yml'), 'utf8');
const body = text.replace(/^\s*#.*$/gm, '');
const deployCmd = body.slice(body.indexOf('gcloud run deploy argos'));
const envFlag = (/--set-env-vars\s+"([^"]*)"/.exec(deployCmd)?.[1] ?? '');
const pairs = envFlag.split(',').map((x) => x.trim()).filter((x) => x !== '');
const keys = pairs.map((x) => x.split('=')[0] ?? '');
const val = (k: string): string => {
  const p = pairs.find((x) => x.startsWith(`${k}=`));
  return p === undefined ? '' : p.slice(k.length + 1);
};

describe('deploy-argos.yml con la 006 (T806)', () => {
  it('declara las variables ARGOS_SCENE_* no secretas de plan.md 1.3 en --set-env-vars', () => {
    for (const k of ['ARGOS_SCENE_DRIVER', 'ARGOS_SCENE_MAX_PETS', 'ARGOS_SCENE_QUOTA_MAX', 'ARGOS_SCENE_GEN_TIMEOUT_SECONDS', 'ARGOS_SCENE_QUEUE', 'ARGOS_SCENE_TASKS_SA_EMAIL', 'ARGOS_SCENE_WORKER_URL', 'ARGOS_SCENE_PROJECT_ID']) {
      expect(keys).toContain(k);
    }
  });

  it('fija el driver en real con modelo y región, sin clave de API (T952, D6-22; sustituye a «fake y nunca real» de R-LINK-006-3)', () => {
    expect(val('ARGOS_SCENE_DRIVER')).toBe('real');
    expect(val('ARGOS_SCENE_MODEL')).toBe('gemini-2.5-flash-image');
    expect(val('ARGOS_SCENE_LOCATION')).toBe('us-central1');
    expect(body).not.toMatch(/GEMINI_API_KEY|x-goog-api-key/);
  });

  it('usa valores dentro de rango y de forma segura para la URL del worker', () => {
    expect(val('ARGOS_SCENE_MAX_PETS')).toBe('8');
    expect(val('ARGOS_SCENE_QUOTA_MAX')).toBe('10');
    expect(val('ARGOS_SCENE_GEN_TIMEOUT_SECONDS')).toBe('90');
    expect(val('ARGOS_SCENE_QUEUE')).toBe('argos-scene');
    expect(val('ARGOS_SCENE_WORKER_URL')).toMatch(/^\$\{?PUBLIC_BASE_URL\}?\/internal\/scene-worker$/);
    expect(val('ARGOS_SCENE_TASKS_SA_EMAIL')).toMatch(/^\$\{?ARGOS_SCENE_TASKS_SA_EMAIL\}?$/);
    expect(body).toMatch(/ARGOS_SCENE_TASKS_SA_EMAIL:\s*argos-scene-tasks@\$\{\{\s*vars\.TF_VAR_project_id\s*\}\}\.iam\.gserviceaccount\.com/);
  });

  it('conserva las variables previas (el flag reemplaza todo el entorno) y las ARGOS_SHARE_* intactas', () => {
    for (const k of ['COOKIE_SECURE', 'ARGOS_SCHEDULER_EMAIL', 'ARGOS_OIDC_AUDIENCE', 'ARGOS_PUBLIC_BASE_URL', 'ARGOS_MEDIA_DRIVER', 'ARGOS_MEDIA_BUCKET']) {
      expect(keys).toContain(k);
    }
    const secrets = /--set-secrets\s+"([^"]*)"/.exec(deployCmd)?.[1] ?? '';
    expect(secrets).toContain('ARGOS_SHARE_IP_HMAC_SECRET=argos-share-ip-hmac-secret:${SHARE_HMAC_VERSION}');
    expect(keys.filter((k) => k.startsWith('ARGOS_SHARE_'))).toEqual([]);
  });

  it('no añade secretos de la escena: --set-secrets conserva los 3 existentes más GOOGLE_OAUTH_CLIENT_SECRET (008, GH:#16)', () => {
    const secrets = /--set-secrets\s+"([^"]*)"/.exec(deployCmd)?.[1] ?? '';
    expect(secrets.split(',').map((x) => x.split('=')[0]).sort()).toEqual(['ARGOS_AUDIT_HMAC_SECRET', 'ARGOS_SHARE_IP_HMAC_SECRET', 'DATABASE_URL', 'GOOGLE_OAUTH_CLIENT_SECRET']);
    expect(envFlag).not.toMatch(/SECRET|TOKEN|PASSWORD|KEY/i);
  });
});
