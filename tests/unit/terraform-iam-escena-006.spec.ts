import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * T818 (N2-05, 006): enmienda de REQ-IAC-006 de 003 y cola de la escena: `roles/aiplatform.user` de PROYECTO en `argos-run` como EXCEPCIÓN DOCUMENTADA (Vertex no
 * admite un rol por recurso para `predict`), cuenta `argos-scene-tasks` solo con `roles/run.invoker` sobre el servicio, `roles/cloudtasks.enqueuer` de `argos-run`
 * acotado a la cola, `roles/iam.serviceAccountUser` de `argos-run` solo sobre `argos-scene-tasks` y ninguna llave de cuenta de servicio (REQ-ESC6-033;
 * INV-ESC6-018; REQ-ESC6-031; NFR-ESC6-002). Pruebas estáticas por lectura (Terraform no se ejecuta aquí; `apply` lo ejecuta Neo).
 */
const DIR = join(process.cwd(), 'terraform');
const strip = (s: string): string => s.replace(/^\s*(#|\/\/).*$/gm, '');
const raw = (f: string): string => readFileSync(join(DIR, f), 'utf8');
const code = (f: string): string => strip(raw(f));
const blocksOf = (f: string): Array<{ type: string; name: string; body: string }> =>
  [...code(f).matchAll(/resource\s+"([a-z0-9_]+)"\s+"([a-z0-9_]+)"\s*\{([^]*?)\n\}/g)].map((m) => ({ type: m[1] ?? '', name: m[2] ?? '', body: m[3] ?? '' }));
const iam = () => blocksOf('iam.tf');
const roleOf = (b: { body: string }): string => b.body.match(/role\s*=\s*"([^"]+)"/)?.[1] ?? '';
const memberOf = (b: { body: string }): string => b.body.match(/member\s*=\s*([^\n]+)/)?.[1]?.trim() ?? '';
const SPEC_003 = readFileSync(join(process.cwd(), 'specs/003-cloud-gcp/spec.md'), 'utf8');

describe('terraform/iam.tf: cuentas y excepción documentada de la 006 (T818, REQ-IAC-006 enmendado)', () => {
  it('REQ-ESC6-033: existe la cuenta argos-scene-tasks (argos-run, argos-deployer y argos-scheduler no cambian) y depende de las APIs', () => {
    const sas = iam().filter((b) => b.type === 'google_service_account');
    expect(sas.map((b) => b.name).sort()).toEqual(['deployer', 'run', 'scene_tasks', 'scheduler']);
    const ids = sas.map((b) => b.body.match(/account_id\s*=\s*"([^"]+)"/)?.[1]).sort();
    expect(ids).toEqual(['argos-deployer', 'argos-run', 'argos-scene-tasks', 'argos-scheduler']);
    expect(sas.find((b) => b.name === 'scene_tasks')?.body).toMatch(/depends_on\s*=\s*\[google_project_service\.apis\]/);
  });

  it('REQ-IAC-006: el único rol de proyecto es roles/aiplatform.user para argos-run y su comentario declara la EXCEPCIÓN DOCUMENTADA con REQ-IAC-006 y N2-05', () => {
    const project = iam().filter((b) => /^google_project_iam_/.test(b.type));
    expect(project.map((b) => b.type)).toEqual(['google_project_iam_member']);
    expect(roleOf(project[0]!)).toBe('roles/aiplatform.user');
    expect(memberOf(project[0]!)).toBe('"serviceAccount:${google_service_account.run.email}"');
    expect(project[0]!.body).toMatch(/project\s*=\s*var\.project_id/);
    const comment = raw('iam.tf').split('\n').filter((l) => /^\s*#/.test(l)).join('\n');
    expect(comment).toMatch(/EXCEPCIÓN DOCUMENTADA/);
    expect(comment).toMatch(/REQ-IAC-006/);
    expect(comment).toMatch(/N2-05/);
  });

  it('REQ-IAC-006: no hay bindings ni políticas de proyecto (solo *_iam_member) ni roles amplios', () => {
    const c = code('iam.tf');
    expect(c).not.toMatch(/google_project_iam_(binding|policy|audit_config)/);
    expect(c).not.toMatch(/_iam_(binding|policy)"/);
    expect(c).not.toMatch(/roles\/(owner|editor)/);
    expect(c).not.toMatch(/roles\/aiplatform\.(admin|serviceAgent)|roles\/cloudtasks\.(admin|queueAdmin|viewer)/);
    expect(iam().filter((b) => roleOf(b) === 'roles/iam.serviceAccountTokenCreator' && b.body.includes('scene_tasks'))).toEqual([]);
  });

  it('INV-ESC6-018: argos-scene-tasks solo tiene roles/run.invoker, sobre el servicio argos y nada de proyecto', () => {
    const own = iam().filter((b) => memberOf(b).includes('google_service_account.scene_tasks.'));
    expect(own).toHaveLength(1);
    expect(own[0]!.type).toBe('google_cloud_run_v2_service_iam_member');
    expect(roleOf(own[0]!)).toBe('roles/run.invoker');
    expect(own[0]!.body).toMatch(/name\s*=\s*google_cloud_run_v2_service\.argos\.name/);
    expect(own[0]!.body).toMatch(/location\s*=\s*var\.region/);
  });

  it('INV-ESC6-018: argos-run encola solo en la cola (roles/cloudtasks.enqueuer sobre google_cloud_tasks_queue.scene), nunca a nivel de proyecto', () => {
    const enq = iam().filter((b) => roleOf(b) === 'roles/cloudtasks.enqueuer');
    expect(enq).toHaveLength(1);
    expect(enq[0]!.type).toBe('google_cloud_tasks_queue_iam_member');
    expect(enq[0]!.body).toMatch(/name\s*=\s*google_cloud_tasks_queue\.scene\.name/);
    expect(enq[0]!.body).toMatch(/location\s*=\s*google_cloud_tasks_queue\.scene\.location/);
    expect(memberOf(enq[0]!)).toBe('"serviceAccount:${google_service_account.run.email}"');
  });

  it('INV-ESC6-018: argos-run solo actúa como argos-scene-tasks (roles/iam.serviceAccountUser sobre esa cuenta) y el deployer no gana esa cuenta', () => {
    const users = iam().filter((b) => roleOf(b) === 'roles/iam.serviceAccountUser');
    const onSceneTasks = users.filter((b) => /service_account_id\s*=\s*google_service_account\.scene_tasks\.name/.test(b.body));
    expect(onSceneTasks).toHaveLength(1);
    expect(onSceneTasks[0]!.type).toBe('google_service_account_iam_member');
    expect(memberOf(onSceneTasks[0]!)).toBe('"serviceAccount:${google_service_account.run.email}"');
    const forDeployer = users.filter((b) => memberOf(b).includes('google_service_account.deployer.'));
    expect(forDeployer).toHaveLength(1);
    expect(forDeployer[0]!.body).toMatch(/service_account_id\s*=\s*google_service_account\.run\.name/);
  });

  it('REQ-ESC6-033: allUsers sigue solo en roles/run.invoker del servicio y no hay llaves de cuenta de servicio ni credenciales en el texto', () => {
    const pub = iam().filter((b) => memberOf(b).includes('allUsers'));
    expect(pub).toHaveLength(1);
    expect(roleOf(pub[0]!)).toBe('roles/run.invoker');
    const c = code('iam.tf');
    expect(c).not.toMatch(/google_service_account_key/);
    expect(c).not.toMatch(/private_key|BEGIN [A-Z ]*PRIVATE KEY|"type"\s*:\s*"service_account"/);
  });

  it('REQ-IAC-006: la spec de 003 documenta la excepción (aiplatform.user de proyecto), argos-scene-tasks y cloudtasks.enqueuer con la «Enmienda 006» y N2-05', () => {
    const req = SPEC_003.split('\n').find((l) => l.startsWith('- **REQ-IAC-006**')) ?? '';
    expect(req).toMatch(/Enmienda 006[^.]*N2-05/);
    expect(req).toContain('roles/aiplatform.user');
    expect(req).toMatch(/excepci[oó]n/i);
    expect(req).toContain('argos-scene-tasks');
    expect(req).toContain('roles/cloudtasks.enqueuer');
    expect(req).toContain('roles/run.invoker');
  });
});

describe('terraform/cloud_tasks.tf: cola argos-scene (T818, D6-15, NFR-ESC6-002)', () => {
  it('existe y define un único google_cloud_tasks_queue "scene" llamado argos-scene en la región', () => {
    expect(existsSync(join(DIR, 'cloud_tasks.tf'))).toBe(true);
    const blocks = blocksOf('cloud_tasks.tf');
    expect(blocks.map((b) => `${b.type}.${b.name}`)).toEqual(['google_cloud_tasks_queue.scene']);
    const q = blocks[0]!.body;
    expect(q).toMatch(/name\s*=\s*"argos-scene"/);
    expect(q).toMatch(/location\s*=\s*var\.region/);
    expect(q).toMatch(/project\s*=\s*var\.project_id/);
  });

  it('REQ-ESC6-012: max_attempts = 1 (sin reintentos automáticos), 2 despachos concurrentes y 1 por segundo', () => {
    const q = blocksOf('cloud_tasks.tf')[0]?.body ?? '';
    expect(q).toMatch(/retry_config\s*\{[^}]*max_attempts\s*=\s*1\b[^}]*\}/);
    expect(q).toMatch(/rate_limits\s*\{[^}]*max_concurrent_dispatches\s*=\s*2\b[^}]*\}/);
    expect(q).toMatch(/rate_limits\s*\{[^}]*max_dispatches_per_second\s*=\s*1\b[^}]*\}/);
  });

  it('INV-ESC6-018: depende de la API cloudtasks, sin http_target ni destino fijo en Terraform (la URL y la audiencia salen solo de ARGOS_SCENE_WORKER_URL)', () => {
    const q = blocksOf('cloud_tasks.tf')[0]?.body ?? '';
    expect(q).toMatch(/depends_on\s*=\s*\[google_project_service\.apis\["cloudtasks\.googleapis\.com"\]\]/);
    expect(q).not.toMatch(/http_target|app_engine_routing_override|uri_override|oidc_token/);
    expect(code('cloud_tasks.tf')).not.toMatch(/https?:\/\//);
  });

  it('REQ-IAC-003: sin referencias a Mirror y sin secretos en el archivo', () => {
    const text = raw('cloud_tasks.tf').toLowerCase();
    expect(text).not.toContain('mirror');
    expect(text).not.toMatch(/secret|password|private_key/);
  });
});
