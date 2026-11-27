import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { bootEnv, changeRole, delegateOf, disable, loginRoot, observable, onboard, problemCode, type Backend, type Env, type Onboarded } from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): H-7 y `REQ-ADM11-003/004`: el rol efectivo se resuelve en el servidor desde la BD en CADA petición (nunca desde la sesión), un rol
 * desconocido deja sin acceso (falla cerrada), el servidor rechaza con 403 `ERR-ADM11-ROLE-NOT-AUTHORIZED` antes de leer el cuerpo y sin efectos, y la matriz operación -> roles del contrato
 * (`x-sdd-role-matrix`) se cumple para cada operación vigente de `/api/admin/*` y cada rol. El rol de la RAÍZ sale de `ARGOS_ADMIN_EMAILS`.
 *
 * @implements REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-002, INV-ADM11-001, INV-ADM9-002, EDGE-011-003, EDGE-011-015
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

interface MatrixOp {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly roles: readonly string[];
}
const OPENAPI = parse(readFileSync('specs/011-pulido-portal-hogares-admin/contracts/openapi/admin.openapi.yaml', 'utf8'));
function parse(text: string): { info: { 'x-sdd-role-matrix': { operations: MatrixOp[] } } } {
  return parseYaml(text) as { info: { 'x-sdd-role-matrix': { operations: MatrixOp[] } } };
}
const OPERATIONS = OPENAPI.info['x-sdd-role-matrix'].operations;
const FAKE_ID = '40000000-0000-4000-8000-000000000001';
const concrete = (path: string): string => path.replace(/\{[A-Za-z]+\}/g, FAKE_ID);

const EMAILS = { sa: 'super@example.test', op: 'operador@example.test', sup: 'soporte@example.test' };
interface Staff {
  readonly root: string;
  readonly sa: Onboarded;
  readonly op: Onboarded;
  readonly sup: Onboarded;
}
async function staff(e: Env): Promise<Staff> {
  const root = await loginRoot(e);
  const sa = await onboard(e, root, EMAILS.sa, 'SUPER_ADMIN');
  const op = await onboard(e, root, EMAILS.op, 'OPERATOR');
  const sup = await onboard(e, root, EMAILS.sup, 'SUPPORT');
  for (const member of [sa, op, sup]) expect([member.email, member.cookie !== null]).toEqual([member.email, true]);
  return { root, sa, op, sup };
}

describe('T1525 la matriz operación -> roles del contrato se cumple en el servidor (H-7, SC-011-021)', { timeout: 120_000 }, () => {
  it('[REQ-ADM11-003][SC-011-021] cada operación de la matriz x-sdd-role-matrix responde 403 ERR-ADM11-ROLE-NOT-AUTHORIZED a los roles que no la autorizan y NO a los que sí (nunca el 404 uniforme de «no montada»)', async () => {
    env = await bootEnv('sqlite');
    const s = await staff(env);
    const sessions: Array<[string, string | null]> = [['SUPER_ADMIN', s.sa.cookie], ['OPERATOR', s.op.cookie], ['SUPPORT', s.sup.cookie]];
    const operations = OPERATIONS.filter((o) => !o.roles.includes('PUBLIC_PRE_SESSION') && !(o.method === 'DELETE' && o.path === '/api/admin/session'));
    expect(operations.length).toBe(18);
    const failures: string[] = [];
    for (const op of operations) {
      for (const [role, cookie] of sessions) {
        const r = await env.call(op.method, concrete(op.path), { cookie, body: op.method === 'GET' ? undefined : {}, headers: { 'if-match': '"abcdefgh12"' } });
        const refused = r.status === 403 && problemCode(r) === 'ERR-ADM11-ROLE-NOT-AUTHORIZED';
        const unmounted = r.status === 404 && r.text === 'Not Found';
        const expected = op.roles.includes(role) ? !refused && !unmounted : refused;
        if (!expected) failures.push(`${role} ${op.method} ${op.path} -> ${r.status} ${problemCode(r) ?? r.text.slice(0, 20)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('[REQ-ADM11-003][SC-011-021] SUPPORT que llama a parámetros o al reinicio de cuota recibe el rechazo del servidor y NO hay efecto (la auditoría de administración no crece)', async () => {
    env = await bootEnv('sqlite');
    const s = await staff(env);
    const audit = () => (env!.db!.prepare('SELECT COUNT(*) AS n FROM admin_audit_entries').get() as { n: number }).n;
    const before = audit();
    const reset = await env.call('POST', '/api/admin/parameters/scene-quota/reset', { cookie: s.sup.cookie, body: {} });
    const list = await env.call('GET', '/api/admin/parameters', { cookie: s.sup.cookie });
    const put = await env.call('PUT', '/api/admin/parameters/scene.global_quota_max', { cookie: s.sup.cookie, body: { value: 1 }, headers: { 'if-match': '"abcdefgh12"' } });
    expect([reset, list, put].map((r) => `${r.status}:${problemCode(r)}`)).toEqual(Array(3).fill('403:ERR-ADM11-ROLE-NOT-AUTHORIZED'));
    expect(audit()).toBe(before);
  });

  it('[REQ-ADM11-003][INV-ADM11-001] la autorización de rol precede a la lectura del cuerpo: un cuerpo ilegible a una ruta no autorizada sigue siendo 403 (no 422 ni 400)', async () => {
    env = await bootEnv('memory');
    const s = await staff(env);
    const r = await env.call('POST', '/api/admin/administrators', { cookie: s.op.cookie, raw: '{no es json' });
    expect([r.status, problemCode(r)]).toEqual([403, 'ERR-ADM11-ROLE-NOT-AUTHORIZED']);
  });

  it('[REQ-ADM11-003][INV-ADM9-002] sin X-Argos-Request la escritura es 403 ERR-AUTH-CSRF-REJECTED ANTES de la sesión; con la cabecera y sin sesión, el 404 uniforme', async () => {
    env = await bootEnv('memory');
    const noCsrf = await env.call('POST', '/api/admin/administrators', { csrf: false, body: { email: 'a@example.test', emailConfirmation: 'a@example.test', role: 'SUPPORT' } });
    expect([noCsrf.status, problemCode(noCsrf)]).toEqual([403, 'ERR-AUTH-CSRF-REJECTED']);
    const noSession = await env.call('POST', '/api/admin/administrators', { body: { email: 'a@example.test', emailConfirmation: 'a@example.test', role: 'SUPPORT' } });
    const nonexistent = await env.call('POST', '/api/admin/ruta-que-no-existe', { body: {} });
    expect([noSession.status, noSession.text]).toEqual([404, 'Not Found']);
    expect(observable(noSession)).toEqual(observable(nonexistent));
  });
});

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 el rol se lee en cada petición desde la base (${backend})`, { timeout: 60_000 }, () => {
    it('[REQ-ADM11-004][SC-011-024] rebajar OPERATOR -> SUPPORT rige en la SIGUIENTE petición con la misma cookie; ascender SUPPORT -> OPERATOR también', async () => {
      env = await bootEnv(backend);
      const s = await staff(env);
      expect((await env.call('GET', '/api/admin/parameters', { cookie: s.op.cookie })).status).toBe(200);
      expect((await env.call('GET', '/api/admin/parameters', { cookie: s.sup.cookie })).status).toBe(403);
      const down = await changeRole(env, s.root, s.op.adminId!, (await delegateOf(env, s.root, EMAILS.op))!.etag, 'SUPPORT');
      const up = await changeRole(env, s.root, s.sup.adminId!, (await delegateOf(env, s.root, EMAILS.sup))!.etag, 'OPERATOR');
      expect([down.status, up.status]).toEqual([200, 200]);
      const demoted = await env.call('GET', '/api/admin/parameters', { cookie: s.op.cookie });
      expect([demoted.status, problemCode(demoted)]).toEqual([403, 'ERR-ADM11-ROLE-NOT-AUTHORIZED']);
      expect((await env.call('GET', '/api/admin/pending-count', { cookie: s.op.cookie })).status).toBe(200);
      expect((await env.call('GET', '/api/admin/parameters', { cookie: s.sup.cookie })).status).toBe(200);
    });

    it('[REQ-ADM11-004][SC-011-024] el rol efectivo (GET /api/admin/me) cambia con la tabla sin renovar la sesión y la vista de sesión no lleva rol', async () => {
      env = await bootEnv(backend);
      const s = await staff(env);
      const before = await env.call('GET', '/api/admin/session', { cookie: s.op.cookie });
      expect(Object.keys(before.json as object).sort()).toEqual(['adminId', 'authenticated', 'expiresAt', 'idleExpiresAt']);
      await changeRole(env, s.root, s.op.adminId!, (await delegateOf(env, s.root, EMAILS.op))!.etag, 'SUPPORT');
      expect((await env.call('GET', '/api/admin/me', { cookie: s.op.cookie })).json).toEqual({ adminId: s.op.adminId, role: 'SUPPORT', isRoot: false });
    });

    it('[REQ-ADM11-003][EDGE-011-003] el rol de la raíz sale de ARGOS_ADMIN_EMAILS: GET /api/admin/me da SUPER_ADMIN con isRoot = true y, retirado el correo de la lista, 404 uniforme en la petición siguiente', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const me = await env.call('GET', '/api/admin/me', { cookie: root });
      expect([me.status, (me.json as { role: string; isRoot: boolean }).role, (me.json as { isRoot: boolean }).isRoot]).toEqual([200, 'SUPER_ADMIN', true]);
      env.kit.emails.length = 0;
      expect((await env.call('GET', '/api/admin/me', { cookie: root })).status).toBe(404);
    });

    it('[IDOR][REQ-ADM11-003] un rol sin permiso no puede sondear identificadores: sobre un adminId inexistente OPERATOR recibe 403 (no 404) y SUPER_ADMIN recibe 404 ERR-ADM11-DELEGATE-NOT-FOUND; un id mal formado, 422', async () => {
      env = await bootEnv(backend);
      const s = await staff(env);
      const op = await changeRole(env, s.op.cookie, FAKE_ID, '"abcdefgh12"', 'SUPPORT');
      const sa = await changeRole(env, s.sa.cookie, FAKE_ID, '"abcdefgh12"', 'SUPPORT');
      const bad = await changeRole(env, s.sa.cookie, 'no-es-uuid', '"abcdefgh12"', 'SUPPORT');
      expect([op.status, problemCode(op)]).toEqual([403, 'ERR-ADM11-ROLE-NOT-AUTHORIZED']);
      expect([sa.status, problemCode(sa)]).toEqual([404, 'ERR-ADM11-DELEGATE-NOT-FOUND']);
      expect([bad.status, problemCode(bad)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    });
  });
}

describe('T1525 revocación inmediata y rol desconocido sobre SQLite', { timeout: 60_000 }, () => {
  it('[REQ-ADM11-004][SC-011-024] desactivar borra en la misma transacción todas las sesiones del delegado (admin_sessions) y su cookie queda sin acceso', async () => {
    env = await bootEnv('sqlite');
    const s = await staff(env);
    const sessionsOf = (id: string) => (env!.db!.prepare('SELECT COUNT(*) AS n FROM admin_sessions WHERE admin_id = ?').get(id) as { n: number }).n;
    expect(sessionsOf(s.op.adminId!)).toBe(1);
    const off = await disable(env, s.root, s.op.adminId!, (await delegateOf(env, s.root, EMAILS.op))!.etag);
    expect(off.status).toBe(200);
    expect(sessionsOf(s.op.adminId!)).toBe(0);
    expect((await env.call('GET', '/api/admin/pending-count', { cookie: s.op.cookie })).status).toBe(404);
  });

  it('[REQ-ADM11-003][H-7] un rol desconocido en la base deja SIN acceso (404 uniforme en cualquier ruta, también las de SUPPORT) y no se compara por subcadena', async () => {
    env = await bootEnv('sqlite');
    const s = await staff(env);
    env.db!.exec('PRAGMA ignore_check_constraints = ON');
    env.db!.prepare("UPDATE admin_delegates SET role = 'SUPPORT_PLUS' WHERE admin_id = ?").run(s.sup.adminId);
    env.db!.prepare("UPDATE admin_delegates SET role = 'xSUPER_ADMINx' WHERE admin_id = ?").run(s.op.adminId);
    env.db!.exec('PRAGMA ignore_check_constraints = OFF');
    for (const member of [s.sup, s.op]) {
      for (const url of ['/api/admin/pending-count', '/api/admin/registrations', '/api/admin/me', '/api/admin/parameters']) {
        const r = await env.call('GET', url, { cookie: member.cookie });
        expect([member.email, url, r.status, r.text]).toEqual([member.email, url, 404, 'Not Found']);
      }
    }
  });

  it('[REQ-ADM11-003][H-7] un estado desconocido en la base (ni INVITED ni ACTIVE ni DISABLED) deja sin acceso: falla cerrada', async () => {
    env = await bootEnv('sqlite');
    const s = await staff(env);
    env.db!.exec('PRAGMA ignore_check_constraints = ON');
    env.db!.prepare("UPDATE admin_delegates SET status = 'ZOMBIE' WHERE admin_id = ?").run(s.sup.adminId);
    env.db!.exec('PRAGMA ignore_check_constraints = OFF');
    expect((await env.call('GET', '/api/admin/pending-count', { cookie: s.sup.cookie })).status).toBe(404);
  });
});
