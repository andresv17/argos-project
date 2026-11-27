import { afterEach, describe, expect, it } from 'vitest';
import {
  BASE_MS,
  TTL_72H_MS,
  bootEnv,
  delegateOf,
  disable,
  invite,
  listDelegates,
  loginAs,
  loginRoot,
  observable,
  onboard,
  problemCode,
  reactivate,
  reinvite,
  subOf,
  type Backend,
  type Env,
} from '../fixtures/admin-delegates-011.ts';

/**
 * T1525 (011, Bloque D, #63; PRUEBAS ROJAS hasta T1527; `/keymaker`): ciclo de vida del delegado (`STATE-ADM11-001`): alta `INVITED` con caducidad de 72 h, anclaje del `sub` con el correo exacto,
 * `DENIED` uniforme tras caducar o desactivar, confirmación explícita del correo (H-1), cancelación `INVITED` → `DISABLED`, `REINVITE`, reactivación que conserva `admin_id` y `sub` (D11-04 = A),
 * tabla vacía y acceso raíz (INV-ADM11-002), correo de Google distinto o `sub` distinto (H-3, EDGE-011-019), auditoría del alta y del primer anclaje (REQ-ADM11-007) y `CHECK` de rol (H-8).
 *
 * @implements REQ-ADM11-001, REQ-ADM11-004, REQ-ADM11-006, REQ-ADM11-007, INV-ADM11-001, INV-ADM11-002, STATE-ADM11-001, EDGE-011-001, EDGE-011-019
 */
let env: Env | null = null;
afterEach(async () => {
  await env?.close();
  env = null;
});

const DELEGATE = 'delegada.soporte@example.test';
const OTHER = 'otra.persona@example.test';
const H72_EXPIRES = '2026-11-08T12:00:00.000Z';

interface AuditRow {
  admin_id: string;
  action: string;
  object_ref: string | null;
}
const delegateAudit = (e: Env): AuditRow[] =>
  e.db!.prepare("SELECT admin_id, action, object_ref FROM admin_audit_entries WHERE action LIKE 'ADMIN_DELEGATE_%' ORDER BY rowid").all() as AuditRow[];

for (const backend of ['memory', 'sqlite'] as Backend[]) {
  describe(`T1525 ciclo de vida del delegado (${backend})`, { timeout: 60_000 }, () => {
    it('[INV-ADM11-002][REQ-ADM11-001] con la tabla de delegados vacía el administrador raíz entra y ve una lista vacía con el tope informado', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const page = await env.call('GET', '/api/admin/administrators', { cookie: root });
      expect([page.status, page.json]).toEqual([200, { items: [], activeCount: 0, activeLimit: 20 }]);
    });

    it('[H-1][REQ-ADM11-001][STATE-ADM11-001] el alta crea INVITED sin anclar con caducidad exacta a las 72 h y el rol pedido; responde 202 uniforme sin adminId', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const r = await invite(env, root, DELEGATE, 'SUPPORT');
      expect([r.status, r.json]).toEqual([202, { accepted: true }]);
      const view = await delegateOf(env, root, DELEGATE);
      expect(view).toMatchObject({ email: DELEGATE, role: 'SUPPORT', status: 'INVITED', isAnchored: false, invitedAt: '2026-11-05T12:00:00.000Z', invitedExpiresAt: H72_EXPIRES, anchoredAt: null, disabledAt: null });
    });

    it('[H-1][REQ-ADM11-006] el primer acceso con el correo exacto dentro de 72 h ancla el sub, pasa a ACTIVE y conserva el admin_id (el mismo de la sesión)', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, DELEGATE, 'SUPPORT');
      expect(d.cookie).toMatch(/^argos_admin_session=/);
      const view = (await delegateOf(env, root, DELEGATE))!;
      expect(view).toMatchObject({ status: 'ACTIVE', isAnchored: true, invitedExpiresAt: null, anchoredAt: '2026-11-05T12:00:00.000Z' });
      expect(view.adminId).toBe(d.adminId);
      const me = await env.call('GET', '/api/admin/me', { cookie: d.cookie });
      expect([me.status, me.json]).toEqual([200, { adminId: d.adminId, role: 'SUPPORT', isRoot: false }]);
    });

    it('[H-1][SC-011-024] el límite de las 72 h es inclusivo: con now = invitedExpiresAt el delegado ancla; un segundo después, DENIED', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      await invite(env, root, DELEGATE, 'OPERATOR');
      await invite(env, root, OTHER, 'OPERATOR');
      env.at(TTL_72H_MS);
      expect((await loginAs(env, { email: DELEGATE, sub: subOf(DELEGATE) })).cookie).toMatch(/^argos_admin_session=/);
      env.at(TTL_72H_MS + 1000);
      expect((await loginAs(env, { email: OTHER, sub: subOf(OTHER) })).cookie).toBeNull();
    });

    it('[H-1][H-4] tras caducar, el acceso es el 404 uniforme: idéntico al de un correo que nunca se invitó, sin cookie ni pista de la causa', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      await invite(env, root, DELEGATE, 'OPERATOR');
      await invite(env, root, OTHER, 'OPERATOR');
      // control positivo: una invitación vigente sí ancla (si no, «todo denegado» sería un falso verde)
      expect((await loginAs(env, { email: OTHER, sub: subOf(OTHER) })).cookie).toMatch(/^argos_admin_session=/);
      env.at(TTL_72H_MS + 1000);
      const expired = await loginAs(env, { email: DELEGATE, sub: subOf(DELEGATE) });
      const unknown = await loginAs(env, { email: 'nunca.invitado@example.test', sub: 'google-sub-nadie' });
      expect(expired.done.status).toBe(404);
      expect(expired.cookie).toBeNull();
      expect(observable(expired.done)).toEqual(observable(unknown.done));
    });

    it('[H-1][STATE-ADM11-001] el alta duplicada de una invitación caducada responde 202 pero NO la renueva: sigue caducada y el acceso sigue denegado', async () => {
      env = await bootEnv(backend);
      const rootOld = await loginRoot(env);
      await invite(env, rootOld, DELEGATE, 'OPERATOR');
      env.at(TTL_72H_MS + 1000);
      const root = await loginRoot(env);
      const again = await invite(env, root, DELEGATE, 'OPERATOR');
      expect(again.status).toBe(202);
      expect((await delegateOf(env, root, DELEGATE))!.invitedExpiresAt).toBe(H72_EXPIRES);
      expect((await loginAs(env, { email: DELEGATE, sub: subOf(DELEGATE) })).cookie).toBeNull();
    });

    it('[H-1][STATE-ADM11-001] la re-invitación explícita renueva la caducidad a ahora + 72 h con el mismo admin_id y rol; luego el delegado ancla', async () => {
      env = await bootEnv(backend);
      const rootOld = await loginRoot(env);
      await invite(env, rootOld, DELEGATE, 'OPERATOR');
      const before = (await delegateOf(env, rootOld, DELEGATE))!;
      env.at(TTL_72H_MS + 1000);
      const root = await loginRoot(env);
      const r = await reinvite(env, root, before.adminId, before.etag);
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({ adminId: before.adminId, role: 'OPERATOR', status: 'INVITED', invitedExpiresAt: new Date(BASE_MS + TTL_72H_MS + 1000 + TTL_72H_MS).toISOString() });
      const anchored = await loginAs(env, { email: DELEGATE, sub: subOf(DELEGATE) });
      expect(anchored.cookie).toMatch(/^argos_admin_session=/);
    });

    it('[STATE-ADM11-001][REQ-ADM11-001] cancelar una invitación pendiente la pasa a DISABLED (INVITED -> DISABLED), el acceso queda denegado y la fila se conserva', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      await invite(env, root, DELEGATE, 'SUPPORT');
      const v = (await delegateOf(env, root, DELEGATE))!;
      const r = await disable(env, root, v.adminId, v.etag);
      expect([r.status, (r.json as { status: string }).status]).toEqual([200, 'DISABLED']);
      expect((await loginAs(env, { email: DELEGATE, sub: subOf(DELEGATE) })).cookie).toBeNull();
      expect(await delegateOf(env, root, DELEGATE)).toMatchObject({ adminId: v.adminId, status: 'DISABLED', isAnchored: false });
    });

    it('[STATE-ADM11-001][H-1] un DISABLED sin sub (invitación cancelada) vuelve a INVITED solo con REINVITE; reactivar sin sub es una transición inválida', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      await invite(env, root, DELEGATE, 'SUPPORT');
      const v = (await delegateOf(env, root, DELEGATE))!;
      const off = await disable(env, root, v.adminId, v.etag);
      const etag = (off.json as { etag: string }).etag;
      const bad = await reactivate(env, root, v.adminId, etag, 'SUPPORT');
      expect([bad.status, problemCode(bad)]).toEqual([409, 'ERR-ADM11-INVALID-TRANSITION']);
      const ok = await reinvite(env, root, v.adminId, etag);
      expect([ok.status, (ok.json as { status: string }).status]).toEqual([200, 'INVITED']);
    });

    it('[H-1][REQ-ADM11-001] el alta con confirmación de correo distinta se rechaza con 422 ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH, sin fila y sin repetir los correos en la respuesta', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const r = await invite(env, root, DELEGATE, 'SUPPORT', 'otro.correo@example.test');
      expect([r.status, problemCode(r)]).toEqual([422, 'ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH']);
      expect(r.text).not.toContain(DELEGATE);
      expect(r.text).not.toContain('otro.correo');
      expect((await listDelegates(env, root)).items).toEqual([]);
    });

    it('[H-1] la confirmación se compara tras normalizar: mayúsculas y espacios no la hacen fallar y el correo se guarda en minúsculas', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const r = await env.call('POST', '/api/admin/administrators', { cookie: root, body: { email: '  Delegada.Soporte@Example.Test ', emailConfirmation: 'delegada.soporte@example.test', role: 'SUPPORT' } });
      expect(r.status).toBe(202);
      expect(await delegateOf(env, root, DELEGATE)).toMatchObject({ email: DELEGATE });
    });

    it('[EDGE-011-001][H-4] dar de alta al correo del administrador raíz se ignora: 202 uniforme y no se crea fila (la lista de configuración manda)', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const r = await invite(env, root, 'admin.uno@example.test', 'SUPPORT');
      expect([r.status, r.json]).toEqual([202, { accepted: true }]);
      expect((await listDelegates(env, root)).items).toEqual([]);
    });

    it('[REQ-ADM11-004][SC-011-024] desactivar corta al delegado en su SIGUIENTE petición y cierra su sesión: su cookie ya no abre ninguna ruta', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, DELEGATE, 'OPERATOR');
      expect((await env.call('GET', '/api/admin/parameters', { cookie: d.cookie })).status).toBe(200);
      const v = (await delegateOf(env, root, DELEGATE))!;
      expect((await disable(env, root, v.adminId, v.etag)).status).toBe(200);
      for (const url of ['/api/admin/session', '/api/admin/parameters', '/api/admin/me']) {
        const r = await env.call('GET', url, { cookie: d.cookie });
        expect([url, r.status, r.text]).toEqual([url, 404, 'Not Found']);
      }
    });

    it('[D11-04][REQ-ADM11-001] la reactivación DISABLED -> ACTIVE exige rol explícito, conserva admin_id y sub, y el delegado entra de nuevo solo con el mismo correo y el mismo sub', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, DELEGATE, 'OPERATOR');
      const before = (await delegateOf(env, root, DELEGATE))!;
      const off = await disable(env, root, before.adminId, before.etag);
      const etag = (off.json as { etag: string }).etag;
      const noRole = await env.call('POST', `/api/admin/administrators/${before.adminId}/reactivate`, { cookie: root, body: {}, headers: { 'if-match': etag } });
      expect([noRole.status, problemCode(noRole)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
      const on = await reactivate(env, root, before.adminId, etag, 'SUPPORT');
      expect([on.status, (on.json as { adminId: string; role: string; status: string }).adminId, (on.json as { role: string }).role, (on.json as { status: string }).status]).toEqual([200, d.adminId, 'SUPPORT', 'ACTIVE']);
      const same = await loginAs(env, { email: DELEGATE, sub: d.sub });
      expect(same.cookie).toMatch(/^argos_admin_session=/);
      const otherSub = await loginAs(env, { email: DELEGATE, sub: 'google-sub-reciclado' });
      expect(otherSub.cookie).toBeNull();
    });

    it('[EDGE-011-019][REQ-ADM11-006] un segundo sub para el mismo correo se rechaza tras anclar (correo reciclado) y el titular original sigue entrando', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, DELEGATE, 'SUPPORT');
      expect((await loginAs(env, { email: DELEGATE, sub: 'google-sub-otra-persona' })).cookie).toBeNull();
      expect((await loginAs(env, { email: DELEGATE, sub: d.sub })).cookie).toMatch(/^argos_admin_session=/);
    });

    it('[H-3][REQ-ADM11-006] si el correo de la cuenta de Google cambia (mismo sub), el acceso se deniega: el correo exacto es parte del anclaje', async () => {
      env = await bootEnv(backend);
      const root = await loginRoot(env);
      const d = await onboard(env, root, DELEGATE, 'SUPPORT');
      expect(d.cookie).toMatch(/^argos_admin_session=/);
      expect((await loginAs(env, { email: 'delegada.nueva@example.test', sub: d.sub })).cookie).toBeNull();
    });

    it('[REQ-ADM11-001][INV-ADM11-001] un DISABLED, un correo no invitado y una INVITED caducada reciben el MISMO 404 uniforme (DENIED), con cuerpo y cabeceras idénticos', async () => {
      env = await bootEnv(backend);
      const rootOld = await loginRoot(env);
      await invite(env, rootOld, OTHER, 'SUPPORT');
      env.at(TTL_72H_MS + 1000);
      const root = await loginRoot(env);
      const d = await onboard(env, root, DELEGATE, 'OPERATOR');
      const v = (await delegateOf(env, root, DELEGATE))!;
      await disable(env, root, v.adminId, v.etag);
      const disabled = await loginAs(env, { email: DELEGATE, sub: d.sub });
      const expired = await loginAs(env, { email: OTHER, sub: subOf(OTHER) });
      const unknown = await loginAs(env, { email: 'desconocido@example.test', sub: 'google-sub-desconocido' });
      expect([disabled.cookie, expired.cookie, unknown.cookie]).toEqual([null, null, null]);
      expect(observable(disabled.done)).toEqual(observable(unknown.done));
      expect(observable(expired.done)).toEqual(observable(unknown.done));
      expect(unknown.done.status).toBe(404);
    });
  });
}

describe('T1525 auditoría y CHECK de rol del delegado (SQLite)', { timeout: 60_000 }, () => {
  it('[REQ-ADM11-007] el alta y el primer anclaje se auditan con autor y objetivo por admin_id y sin el correo ni el sub en la tabla de auditoría', async () => {
    env = await bootEnv('sqlite');
    const root = await loginRoot(env);
    const rootId = ((await env.call('GET', '/api/admin/session', { cookie: root })).json as { adminId: string }).adminId;
    const d = await onboard(env, root, DELEGATE, 'SUPPORT');
    expect(delegateAudit(env)).toEqual([
      { admin_id: rootId, action: 'ADMIN_DELEGATE_INVITED', object_ref: d.adminId },
      { admin_id: d.adminId, action: 'ADMIN_DELEGATE_ANCHORED', object_ref: d.adminId },
    ]);
    const dump = JSON.stringify(env.db!.prepare('SELECT * FROM admin_audit_entries').all());
    expect(dump).not.toContain(DELEGATE);
    expect(dump).not.toContain(d.sub);
  });

  it('[REQ-ADM11-007][STATE-ADM11-001] cancelar una invitación audita ADMIN_DELEGATE_INVITATION_CANCELLED; desactivar un ACTIVE, ADMIN_DELEGATE_DISABLED; reactivar, ADMIN_DELEGATE_REACTIVATED; re-invitar, ADMIN_DELEGATE_REINVITED; cambiar rol, ADMIN_DELEGATE_ROLE_CHANGED', async () => {
    env = await bootEnv('sqlite');
    const root = await loginRoot(env);
    await invite(env, root, OTHER, 'SUPPORT');
    const o = (await delegateOf(env, root, OTHER))!;
    const cancelled = await disable(env, root, o.adminId, o.etag);
    await reinvite(env, root, o.adminId, (cancelled.json as { etag: string }).etag);
    const d = await onboard(env, root, DELEGATE, 'SUPPORT');
    const v = (await delegateOf(env, root, DELEGATE))!;
    const changed = await env.call('PUT', `/api/admin/administrators/${v.adminId}/role`, { cookie: root, body: { role: 'OPERATOR' }, headers: { 'if-match': v.etag } });
    const off = await disable(env, root, v.adminId, (changed.json as { etag: string }).etag);
    await reactivate(env, root, v.adminId, (off.json as { etag: string }).etag, 'SUPPORT');
    expect(d.adminId).toBe(v.adminId);
    const actions = delegateAudit(env).map((row) => row.action);
    expect(actions).toEqual([
      'ADMIN_DELEGATE_INVITED',
      'ADMIN_DELEGATE_INVITATION_CANCELLED',
      'ADMIN_DELEGATE_REINVITED',
      'ADMIN_DELEGATE_INVITED',
      'ADMIN_DELEGATE_ANCHORED',
      'ADMIN_DELEGATE_ROLE_CHANGED',
      'ADMIN_DELEGATE_DISABLED',
      'ADMIN_DELEGATE_REACTIVATED',
    ]);
    expect(JSON.stringify(env.db!.prepare('SELECT * FROM admin_audit_entries').all())).not.toContain('@example.test');
  });

  it('[H-8][REQ-ADM11-002] el CHECK de la tabla de delegados rechaza roles fuera del conjunto cerrado (incluidos los de hogar y ROOT) y estados desconocidos', async () => {
    env = await bootEnv('sqlite');
    const insert = (role: string, status: string, id: string) =>
      env!.db!
        .prepare("INSERT INTO admin_delegates (admin_id, email, role, status, invited_at, invited_expires_at, created_by_admin_id, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-11-05T12:00:00.000Z', '2026-11-08T12:00:00.000Z', ?, '2026-11-05T12:00:00.000Z', '2026-11-05T12:00:00.000Z')")
        .run(id, `${id.slice(0, 8)}@example.test`, role, status, '00000000-0000-4000-8000-0000000000aa');
    // Solo una violación de CHECK cuenta como rechazo (una tabla inexistente no es evidencia).
    const outcomeOf = (role: string, status: string, id: string): string => {
      try {
        insert(role, status, id);
        return 'ACEPTADA';
      } catch (error) {
        return /CHECK constraint failed/i.test(String(error)) ? 'CHECK' : `OTRO: ${String(error)}`;
      }
    };
    expect(outcomeOf('SUPPORT', 'INVITED', '10000000-0000-4000-8000-000000000001')).toBe('ACEPTADA');
    for (const [n, role] of ['ROOT', 'OWNER', 'ADMIN', 'CAREGIVER', 'READER', 'super_admin', 'SUPPORT '].entries()) {
      expect([role, outcomeOf(role, 'INVITED', `20000000-0000-4000-8000-00000000000${n}`)]).toEqual([role, 'CHECK']);
    }
    expect(outcomeOf('SUPPORT', 'DELETED', '30000000-0000-4000-8000-000000000001')).toBe('CHECK');
  });
});
