import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { bootEnv, changeRole, delegateOf, disable, fillSlots, invite, listDelegates, loginRoot, onboard, type Backend, type Env, type Resp } from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): H-9 y `REQ-ADM11-007`: el correo del delegado no aparece en errores, en registros de aplicación ni en la auditoría (que referencia `admin_id`);
 * la baja de un delegado es SOLO `DISABLED`: no existe operación, ruta, método ni SQL de «eliminar».
 *
 * @implements REQ-ADM11-001, REQ-ADM11-007, INV-ADM11-001
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const CANARY = 'canario.7731.privado@example.test';
const CANARY_B = 'canario.8842.otro@example.test';
const CANARY_BAD = 'canario.9953@@mal-formado';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === 'generated' ? [] : sourceFiles(path)) : path.endsWith('.ts') || path.endsWith('.sql') ? [path] : [];
  });
}
const noCanary = (text: string): boolean => !/canario\.\d{4}/i.test(text);

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 el correo del delegado no sale en errores ni en registros (${backend})`, { timeout: 60_000 }, () => {
    it('[REQ-ADM11-007][INV-ADM11-001] las respuestas de error del alta (confirmación distinta, formato inválido, tope, rol no autorizado, concesión) no repiten el correo, y los registros de aplicación tampoco', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const op = await onboard(env, root, 'operador@example.test', 'OPERATOR');
      const sa = await onboard(env, root, 'super@example.test', 'SUPER_ADMIN');
      expect([op.cookie !== null, sa.cookie !== null]).toEqual([true, true]);
      const responses: Resp[] = [];
      responses.push(await invite(env, root, CANARY, 'SUPPORT', CANARY_B));
      responses.push(await env.call('POST', '/api/admin/administrators', { cookie: root, body: { email: CANARY_BAD, emailConfirmation: CANARY_BAD, role: 'SUPPORT' } }));
      responses.push(await env.call('POST', '/api/admin/administrators', { cookie: root, body: { email: CANARY, emailConfirmation: CANARY, role: 'GOD' } }));
      responses.push(await invite(env, op.cookie, CANARY, 'SUPPORT'));
      responses.push(await invite(env, sa.cookie, CANARY, 'SUPER_ADMIN'));
      await fillSlots(env, root, 18); // operador + super ya ocupan 2 de las 20 plazas
      responses.push(await invite(env, root, CANARY, 'SUPPORT'));
      expect(responses.map((r) => r.status)).toEqual([422, 422, 422, 403, 403, 409]);
      for (const r of responses) expect([r.status, noCanary(r.text)]).toEqual([r.status, true]);
      expect(noCanary(env.logs.join('\n'))).toBe(true);
      expect(env.logs.length).toBeGreaterThan(0);
    });

    it('[REQ-ADM11-007] el alta correcta y las escrituras de rol y baja no escriben el correo en los registros de aplicación ni en la respuesta del alta', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const accepted = await invite(env, root, CANARY, 'SUPPORT');
      expect(accepted.status).toBe(202);
      const view = (await delegateOf(env, root, CANARY))!;
      const changed = await changeRole(env, root, view.adminId, view.etag, 'OPERATOR');
      const off = await disable(env, root, view.adminId, (changed.json as { etag: string }).etag);
      expect([changed.status, off.status]).toEqual([200, 200]);
      expect(noCanary(accepted.text)).toBe(true);
      expect(noCanary(env.logs.join('\n'))).toBe(true);
      expect(env.logs.length).toBeGreaterThan(0);
    });
  });
}

describe('T1525 el correo no entra en la auditoría de administración (SQLite)', () => {
  it('[REQ-ADM11-007] tras alta, anclaje, cambio de rol y baja, admin_audit_entries no contiene ningún correo ni sub (solo admin_id)', async () => {
    env = await bootEnv('sqlite');
    const root = await loginRoot(env);
    const d = await onboard(env, root, CANARY, 'SUPPORT');
    const view = (await delegateOf(env, root, CANARY))!;
    const changed = await changeRole(env, root, view.adminId, view.etag, 'OPERATOR');
    await disable(env, root, view.adminId, (changed.json as { etag: string }).etag);
    const dump = JSON.stringify(env.db!.prepare('SELECT * FROM admin_audit_entries').all());
    expect(noCanary(dump)).toBe(true);
    expect(dump).not.toContain(d.sub);
    expect((env.db!.prepare("SELECT COUNT(*) AS n FROM admin_audit_entries WHERE action LIKE 'ADMIN_DELEGATE_%'").get() as { n: number }).n).toBe(4);
  });
});

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 la baja es solo DISABLED: no existe «eliminar» (${backend})`, { timeout: 60_000 }, () => {
    it('[REQ-ADM11-001][INV-ADM11-001] DELETE y cualquier verbo de borrado sobre /api/admin/administrators* es el 404 uniforme y la fila del delegado se conserva', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, 'delegada@example.test', 'SUPPORT');
      const id = d.adminId!;
      const attempts: Array<[string, string]> = [['DELETE', `/api/admin/administrators/${id}`], ['DELETE', '/api/admin/administrators'], ['DELETE', `/api/admin/administrators/${id}/role`], ['POST', `/api/admin/administrators/${id}/delete`], ['POST', `/api/admin/administrators/${id}/remove`], ['POST', `/api/admin/administrators/${id}/eliminar`], ['PATCH', `/api/admin/administrators/${id}`]];
      for (const [method, url] of attempts) {
        const r = await env.call(method, url, { cookie: root, body: method === 'DELETE' ? undefined : {} });
        expect([method, url, r.status, r.text]).toEqual([method, url, 404, 'Not Found']);
      }
      expect(await delegateOf(env, root, 'delegada@example.test')).toMatchObject({ adminId: id, status: 'ACTIVE' });
    });

    it('[REQ-ADM11-001][STATE-ADM11-001] desactivar conserva la fila (admin_id, correo, rol) en estado DISABLED y la lista la sigue mostrando', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, 'delegada@example.test', 'OPERATOR');
      const v = (await delegateOf(env, root, 'delegada@example.test'))!;
      expect((await disable(env, root, v.adminId, v.etag)).status).toBe(200);
      const page = await listDelegates(env, root);
      expect(page.items.map((x) => [x.adminId, x.email, x.role, x.status])).toEqual([[d.adminId, 'delegada@example.test', 'OPERATOR', 'DISABLED']]);
    });
  });
}

describe('T1525 ni el contrato ni el código ofrecen «eliminar» un delegado (H-9)', () => {
  it('[REQ-ADM11-001][INV-ADM11-001] el OpenAPI 011 no declara DELETE ni operaciones de borrado sobre /admin/administrators*', () => {
    const doc = parseYaml(readFileSync('specs/011-pulido-portal-hogares-admin/contracts/openapi/admin.openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, { operationId?: string }>> };
    const delegatePaths = Object.entries(doc.paths).filter(([path]) => path.startsWith('/admin/administrators'));
    expect(delegatePaths.length).toBeGreaterThan(0);
    for (const [path, ops] of delegatePaths) {
      expect([path, Object.keys(ops).includes('delete')]).toEqual([path, false]);
      for (const op of Object.values(ops)) expect(op.operationId ?? '').not.toMatch(/delete(?!d)|remove|erase|eliminar|purge/i);
    }
  });

  it('[REQ-ADM11-001][INV-ADM11-001] el código no registra rutas DELETE de administradores ni emite DELETE FROM admin_delegates, y existe el código que implementa la tabla de delegados', () => {
    const all = sourceFiles('src');
    const text = (file: string) => readFileSync(file, 'utf8');
    expect(all.filter((file) => /app\.delete(?:<[^>]*>)?\(\s*[`'"]\/api\/admin\/administrators/.test(text(file)))).toEqual([]);
    // Única excepción autorizada por Neo (DEUDA-011-PURGA-DELEGADOS, D-2): la purga de retención de invitaciones `INVITED` caducadas (nunca ACTIVE ni DISABLED); cualquier otro borrado sigue prohibido.
    expect(all.filter((file) => /DELETE\s+FROM\s+admin_delegates(?!\s+WHERE\s+status\s*=\s*'INVITED'\s+AND\s+invited_at\s+IS\s+NOT\s+NULL\s+AND\s+invited_at\s*<)/i.test(text(file)))).toEqual([]);
    expect(all.filter((file) => /admin_delegates/.test(text(file))).length).toBeGreaterThan(0);
  });

  it('[INV-ADM11-001] la excepcion de purga es estricta: el patron rechaza DELETE sin WHERE, sobre otros estados, concatenado o sin la cota de invited_at', () => {
    const bad = (sql: string) => /DELETE\s+FROM\s+admin_delegates(?!\s+WHERE\s+status\s*=\s*'INVITED'\s+AND\s+invited_at\s+IS\s+NOT\s+NULL\s+AND\s+invited_at\s*<)/i.test(sql);
    expect(bad('DELETE FROM admin_delegates')).toBe(true);
    expect(bad("DELETE FROM admin_delegates WHERE status = 'DISABLED' AND invited_at IS NOT NULL AND invited_at < $1")).toBe(true);
    expect(bad("DELETE FROM admin_delegates WHERE status = 'INVITED'")).toBe(true);
    expect(bad("DELETE FROM admin_delegates WHERE status = 'INVITED' OR 1=1")).toBe(true);
    expect(bad('DELETE FROM admin_delegates WHERE status = ' + 'x')).toBe(true);
    expect(bad("DELETE FROM admin_delegates WHERE status = 'INVITED' AND invited_at IS NOT NULL AND invited_at < $1")).toBe(false);
  });
});
