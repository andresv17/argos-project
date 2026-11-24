import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PENDING_WARNING_THRESHOLD } from '../../../src/infrastructure/config/app-config.ts';
import { NO_PASSWORD_SENTINEL } from '../../../src/domain/auth/password-sentinel.ts';
import { ADMIN_EMAIL, ADMIN_EMAIL_2, ADMIN_SUB_2, UUID_V4, adminKit, adminLogin, observable, type AdminKit } from '../../fixtures/admin-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1247 (Feature 009, Fase 4, #18): decisión atómica `PENDING -> ACTIVE | REJECTED` con compare-and-set, rutas de `/api/admin/registrations` (lista paginada, aprobar, rechazar), contador
 * `/api/admin/pending-count` con aviso de umbral, revocación de sesiones al rechazar y auditoría de administración (solo acción e id de administrador). Prueba de DOS administradores a la vez:
 * exactamente uno gana y el otro recibe `ERR-ADMIN-REGISTRATION-NOT-FOUND`. Contrato `admin.openapi.yaml` 1.3.0.
 * @implements REQ-APR9-003, REQ-APR9-005, EDGE-009-002, EDGE-009-003, EDGE-009-039, EDGE-009-040, SC-009-003, SC-009-004, SC-009-006
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const NOW = '2026-11-23T12:00:00.000Z';
const DAY = 86_400_000;
const ago = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString();
const NOT_FOUND = 'ERR-ADMIN-REGISTRATION-NOT-FOUND';
/** El 404 uniforme es el de una ruta inexistente de `/api/`: mismo estado, cuerpo y cabeceras salvo la propia ruta nombrada en el mensaje, sin código `ERR-*`. */
const shapeOf = (r: ApiResponse) => {
  const { headers, text, status } = observable(r);
  const { 'content-length': _length, ...rest } = headers;
  return { status, text: text.replace(/Route \w+:\S+ not found/, 'Route not found'), headers: rest };
};
const expectUniform = async (a: Api, r: ApiResponse): Promise<void> => {
  expect(shapeOf(r)).toEqual(shapeOf(await a.call('GET', '/api/no-existe-nunca', { contract: false })));
  expect(problemCode(r)).toBeUndefined();
};

interface Boot {
  readonly a: Api;
  readonly kit: AdminKit;
  readonly cookie: string;
  readonly logs: string[];
}
async function boot(): Promise<Boot> {
  const kit = adminKit([ADMIN_EMAIL, ADMIN_EMAIL_2]);
  const logs: string[] = [];
  const a = await createApi(undefined, { admin: kit.admin, logger: { level: 'warn', stream: { write: (line: string) => void logs.push(line) } } });
  api = a;
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  return { a, kit, cookie: cookie!, logs };
}

/** Segundo administrador con identidad y sesión propias. */
async function secondAdmin(b: Boot): Promise<string> {
  b.kit.oidc.identity = { sub: ADMIN_SUB_2, email: ADMIN_EMAIL_2 };
  const { cookie } = await adminLogin(b.a);
  return cookie!;
}

async function seedPending(a: Api, name: string, createdAt: string = NOW, method: 'PASSWORD' | 'GOOGLE' = 'PASSWORD'): Promise<string> {
  const id = randomUUID();
  await a.deps.uow.runInTransaction((r) =>
    r.users.insert({
      id,
      username: name,
      displayName: name,
      createdAt,
      email: `${name}@example.test`,
      preferredLanguage: 'es',
      timezone: 'America/Bogota',
      passwordHash: method === 'GOOGLE' ? NO_PASSWORD_SENTINEL : 'argon2$fixture',
      accountStatus: 'PENDING',
    }),
  );
  return id;
}

const listPending = (a: Api, cookie: string | null, query = ''): Promise<ApiResponse> => a.call('GET', `/api/admin/registrations${query}`, { cookie, contract: false });
const approve = (a: Api, cookie: string | null, id: string, csrf = true): Promise<ApiResponse> => a.call('POST', `/api/admin/registrations/${id}/approve`, { cookie, csrf, contract: false });
const reject = (a: Api, cookie: string | null, id: string, csrf = true): Promise<ApiResponse> => a.call('POST', `/api/admin/registrations/${id}/reject`, { cookie, csrf, contract: false });
const statusOf = (a: Api, id: string) => a.db.prepare('SELECT account_status AS s, decided_at AS at, decided_by AS by FROM users WHERE id = ?').get(id) as { s: string; at: string | null; by: string | null };
const problemCode = (r: ApiResponse): string | undefined => (r.json as { code?: string } | undefined)?.code;

describe('T1247 [REQ-APR9-005] [EDGE-009-039] GET /api/admin/registrations: lista paginada de PENDING con menos de 30 días', () => {
  it('lista solo PENDING recientes, por fecha ascendente, con la vista cerrada {registrationId, username, requestedAt, method} y sin correo ni sub', async () => {
    const b = await boot();
    const first = await seedPending(b.a, 'primera', ago(3 * DAY));
    const second = await seedPending(b.a, 'segunda', ago(1 * DAY), 'GOOGLE');
    await seedPending(b.a, 'vieja.sin.purgar', ago(31 * DAY));
    const decided = await seedPending(b.a, 'ya.decidida', ago(2 * DAY));
    expect((await approve(b.a, b.cookie, decided)).status).toBe(200);
    const r = await listPending(b.a, b.cookie);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const page = r.json as { items: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(page.items.map((i) => i['username'])).toEqual(['primera', 'segunda']);
    expect(page.items.map((i) => i['registrationId'])).toEqual([first, second]);
    expect(page.items.map((i) => i['method'])).toEqual(['PASSWORD', 'GOOGLE']);
    for (const item of page.items) expect(Object.keys(item).sort()).toEqual(['method', 'registrationId', 'requestedAt', 'username']);
    expect(page.nextCursor).toBeNull();
    expect(r.text).not.toContain('example.test');
    expect(r.text).not.toMatch(/passwordHash|password_hash|argon2/i);
  });

  it('pagina por cursor opaco (limit 1..50): recorre todas las solicitudes sin repetir ni saltar y la última página trae nextCursor null', async () => {
    const b = await boot();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await seedPending(b.a, `cola${i}`, ago((10 - i) * 60_000)));
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: ApiResponse = await listPending(b.a, b.cookie, `?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`);
      expect(r.status).toBe(200);
      const page = r.json as { items: Array<{ registrationId: string }>; nextCursor: string | null };
      expect(page.items.length).toBeLessThanOrEqual(2);
      if (page.nextCursor !== null) expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
      seen.push(...page.items.map((i) => i.registrationId));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(seen).toEqual(ids);
    expect(pages).toBe(3);
  });

  it('desempata por registrationId cuando dos solicitudes comparten fecha, sin perder ninguna entre páginas', async () => {
    const b = await boot();
    const same = ago(DAY);
    const ids = [await seedPending(b.a, 'gemela1', same), await seedPending(b.a, 'gemela2', same), await seedPending(b.a, 'gemela3', same)];
    const first = (await listPending(b.a, b.cookie, '?limit=1')).json as { items: Array<{ registrationId: string }>; nextCursor: string };
    const second = (await listPending(b.a, b.cookie, `?limit=2&cursor=${first.nextCursor}`)).json as { items: Array<{ registrationId: string }>; nextCursor: string | null };
    const all = [...first.items, ...second.items].map((i) => i.registrationId);
    expect(new Set(all).size).toBe(3);
    expect([...all].sort()).toEqual([...ids].sort());
    expect(all).toEqual([...ids].sort());
  });

  it('limit fuera de 1..50 o no entero, y un cursor inválido, responden 422 ERR-SCHEMA-VALIDATION-FAILED (solo con sesión)', async () => {
    const b = await boot();
    for (const query of ['?limit=0', '?limit=51', '?limit=abc', '?limit=1.5', '?cursor=!!!', '?cursor=bm9wZQ']) {
      const r = await listPending(b.a, b.cookie, query);
      expect(r.status, query).toBe(422);
      expect(problemCode(r), query).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
    expect((await listPending(b.a, b.cookie, '?limit=50')).status).toBe(200);
  });

  it('sin sesión de administración (o con la de un usuario) responde el 404 uniforme, también con parámetros inválidos', async () => {
    const b = await boot();
    const user = await b.a.login('andres');
    for (const cookie of [null, user]) {
      for (const query of ['', '?limit=0']) {
        const r = await listPending(b.a, cookie, query);
        expect(r.status).toBe(404);
        await expectUniform(b.a, r);
        expect(problemCode(r)).toBeUndefined();
      }
    }
  });

  it('la lectura no renueva la inactividad ni deja auditoría', async () => {
    const b = await boot();
    const row = (): unknown => b.a.db.prepare('SELECT last_activity_at FROM admin_sessions').get();
    const before = row();
    b.a.clock.setClock(NOW.slice(0, 10), new Date(Date.parse(NOW) + 60_000).toISOString());
    await listPending(b.a, b.cookie);
    expect(row()).toEqual(before);
    expect(b.a.db.prepare("SELECT COUNT(*) FROM admin_audit_entries WHERE action LIKE 'ADMIN_REGISTRATION%'").pluck().get()).toBe(0);
  });
});

describe('T1247 [REQ-APR9-005] [EDGE-009-040] GET /api/admin/pending-count: contador y aviso de umbral', () => {
  it('devuelve {pending, warning:false} sin exponer el umbral y no escribe aviso con 50 o menos', async () => {
    const b = await boot();
    await seedPending(b.a, 'uno');
    await seedPending(b.a, 'dos');
    await seedPending(b.a, 'vieja', ago(40 * DAY));
    const r = await b.a.call('GET', '/api/admin/pending-count', { cookie: b.cookie, contract: false });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json).toEqual({ pending: 2, warning: false });
    expect(r.text).not.toContain(String(PENDING_WARNING_THRESHOLD));
    expect(b.logs.filter((l) => l.includes('PENDING'))).toEqual([]);
  });

  it('con MÁS de 50 PENDING responde warning:true y escribe UNA advertencia solo con conteos (sin username ni correo); con exactamente 50 no', async () => {
    const b = await boot();
    const logs = b.logs;
    for (let i = 0; i < PENDING_WARNING_THRESHOLD; i += 1) await seedPending(b.a, `cola.${i}`);
    const at50 = await b.a.call('GET', '/api/admin/pending-count', { cookie: b.cookie, contract: false });
    expect(at50.json).toEqual({ pending: PENDING_WARNING_THRESHOLD, warning: false });
    expect(logs.filter((l) => l.includes('umbral'))).toEqual([]);
    await seedPending(b.a, 'cola.excedente');
    const over = await b.a.call('GET', '/api/admin/pending-count', { cookie: b.cookie, contract: false });
    expect(over.json).toEqual({ pending: PENDING_WARNING_THRESHOLD + 1, warning: true });
    const warned = logs.filter((l) => l.includes('umbral'));
    expect(warned).toHaveLength(1);
    const entry = JSON.parse(warned[0]!) as Record<string, unknown>;
    expect(entry['pendingCount']).toBe(PENDING_WARNING_THRESHOLD + 1);
    expect(entry['threshold']).toBe(PENDING_WARNING_THRESHOLD);
    expect(warned[0]).not.toMatch(/cola\.|example\.test/);
  });

  it('sin sesión de administración es el 404 uniforme', async () => {
    const b = await boot();
    const r = await b.a.call('GET', '/api/admin/pending-count', { cookie: null, contract: false });
    expect(r.status).toBe(404);
    await expectUniform(b.a, r);
  });
});

describe('T1247 [REQ-APR9-003] [SC-009-003] POST approve: PENDING -> ACTIVE atómico', () => {
  it('[REQ-APR9-003] 200 {registrationId, accountStatus:ACTIVE, decidedAt}; guarda decided_at y decided_by (admin id); la persona puede entrar después y no se creó sesión', async () => {
    const b = await boot();
    const a = b.a;
    const reg = await a.call('POST', '/api/auth/register', { body: { username: 'ana.nueva', displayName: 'Ana', password: 'Clave2026x!', confirmPassword: 'Clave2026x!', email: 'ana.nueva@example.test' }, ip: '203.0.113.50', contract: false });
    expect(reg.status).toBe(201);
    const id = a.db.prepare("SELECT id FROM users WHERE username = 'ana.nueva'").pluck().get() as string;
    expect(statusOf(a, id).s).toBe('PENDING');
    const before = await a.call('POST', '/api/auth/login', { body: { username: 'ana.nueva', password: 'Clave2026x!' }, contract: false });
    expect(before.json).toEqual({ accountStatus: 'PENDING' });
    const sessionsBefore = a.db.prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?').pluck().get(id);

    const r = await approve(a, b.cookie, id);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json).toEqual({ registrationId: id, accountStatus: 'ACTIVE', decidedAt: NOW });
    const adminId = a.db.prepare('SELECT admin_id FROM admin_identities').pluck().get() as string;
    expect(statusOf(a, id)).toEqual({ s: 'ACTIVE', at: NOW, by: adminId });
    expect(a.db.prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?').pluck().get(id)).toBe(sessionsBefore);

    const after = await a.call('POST', '/api/auth/login', { body: { username: 'ana.nueva', password: 'Clave2026x!' }, contract: false });
    expect(after.status).toBe(200);
    expect(after.cookie).toMatch(/^argos_session=[A-Za-z0-9_-]+$/);
  });

  it('una solicitud ya decidida, inexistente o de más de 30 días responde el MISMO 404 ERR-ADMIN-REGISTRATION-NOT-FOUND (problem+json) y no cambia nada', async () => {
    const b = await boot();
    const decided = await seedPending(b.a, 'decidida');
    const old = await seedPending(b.a, 'caducada', ago(31 * DAY));
    expect((await approve(b.a, b.cookie, decided)).status).toBe(200);
    const bodies: unknown[] = [];
    for (const id of [decided, old, randomUUID()]) {
      const r = await approve(b.a, b.cookie, id);
      expect(r.status).toBe(404);
      expect(String(r.headers['content-type'])).toMatch(/^application\/problem\+json/);
      expect(problemCode(r)).toBe(NOT_FOUND);
      bodies.push({ ...(r.json as object), instance: undefined });
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(statusOf(b.a, old).s).toBe('PENDING');
    expect(statusOf(b.a, old).at).toBeNull();
  });

  it('una REJECTED no se puede aprobar (la máquina no admite REJECTED -> ACTIVE): 404 ERR-ADMIN-REGISTRATION-NOT-FOUND', async () => {
    const b = await boot();
    const id = await seedPending(b.a, 'rechazada');
    expect((await reject(b.a, b.cookie, id)).status).toBe(200);
    const r = await approve(b.a, b.cookie, id);
    expect(r.status).toBe(404);
    expect(problemCode(r)).toBe(NOT_FOUND);
    expect(statusOf(b.a, id).s).toBe('REJECTED');
  });

  it('un identificador mal formado es 422 ERR-SCHEMA-VALIDATION-FAILED, solo con sesión', async () => {
    const b = await boot();
    const bad = await approve(b.a, b.cookie, 'no-es-uuid');
    expect(bad.status).toBe(422);
    expect(problemCode(bad)).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    const anon = await approve(b.a, null, 'no-es-uuid');
    expect(anon.status).toBe(404);
    await expectUniform(b.a, anon);
  });

  it('sin X-Argos-Request: 403 ERR-AUTH-CSRF-REJECTED ANTES de la sesión (con o sin ella) y sin decidir; con la cabecera y sin sesión, el 404 uniforme', async () => {
    const b = await boot();
    const id = await seedPending(b.a, 'csrf');
    for (const cookie of [b.cookie, null]) {
      for (const op of [approve, reject]) {
        const r = await op(b.a, cookie, id, false);
        expect(r.status).toBe(403);
        expect(problemCode(r)).toBe('ERR-AUTH-CSRF-REJECTED');
      }
    }
    expect(statusOf(b.a, id).s).toBe('PENDING');
    for (const op of [approve, reject]) {
      const anon = await op(b.a, null, id);
      expect(anon.status).toBe(404);
      await expectUniform(b.a, anon);
    }
    expect(statusOf(b.a, id).s).toBe('PENDING');
  });

  it('una decisión (mutación) renueva la inactividad de la sesión de administración', async () => {
    const b = await boot();
    const id = await seedPending(b.a, 'renueva');
    const later = new Date(Date.parse(NOW) + 5 * 60_000).toISOString();
    b.a.clock.setClock(later.slice(0, 10), later);
    expect((await approve(b.a, b.cookie, id)).status).toBe(200);
    expect(b.a.db.prepare('SELECT last_activity_at FROM admin_sessions').pluck().get()).toBe(later);
  });
});

describe('T1247 [REQ-APR9-003] [REQ-APR9-005] POST reject: PENDING -> REJECTED, revocación de sesiones y bloqueo hasta la purga', () => {
  it('200 {accountStatus:REJECTED}; guarda decided_at y decided_by; el login con credenciales válidas devuelve {accountStatus:REJECTED} sin cookie', async () => {
    const b = await boot();
    const a = b.a;
    await a.call('POST', '/api/auth/register', { body: { username: 'rechazada.uno', displayName: 'R', password: 'Clave2026x!', confirmPassword: 'Clave2026x!', email: 'rechazada.uno@example.test' }, ip: '203.0.113.51', contract: false });
    const id = a.db.prepare("SELECT id FROM users WHERE username = 'rechazada.uno'").pluck().get() as string;
    const r = await reject(a, b.cookie, id);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ registrationId: id, accountStatus: 'REJECTED', decidedAt: NOW });
    const adminId = a.db.prepare('SELECT admin_id FROM admin_identities').pluck().get() as string;
    expect(statusOf(a, id)).toEqual({ s: 'REJECTED', at: NOW, by: adminId });
    const login = await a.call('POST', '/api/auth/login', { body: { username: 'rechazada.uno', password: 'Clave2026x!' }, contract: false });
    expect(login.status).toBe(200);
    expect(login.json).toEqual({ accountStatus: 'REJECTED' });
    expect(login.cookie).toBeNull();
  });

  it('[REQ-APR9-005] revoca toda sesión vigente de la cuenta (defensa en profundidad) y no toca las de otras cuentas', async () => {
    const b = await boot();
    const target = await seedPending(b.a, 'con.sesion');
    const other = await seedPending(b.a, 'otra.cuenta');
    await b.a.deps.uow.runInTransaction(async (r) => {
      await r.sessions.save('tok-target-1', { userId: target, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
      await r.sessions.save('tok-target-2', { userId: target, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
      await r.sessions.save('tok-other', { userId: other, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
    });
    expect((await reject(b.a, b.cookie, target)).status).toBe(200);
    const read = (token: string) => b.a.deps.uow.runInTransaction((r) => r.sessions.findByToken(token));
    expect((await read('tok-target-1'))!.revokedAt).toBe(NOW);
    expect((await read('tok-target-2'))!.revokedAt).toBe(NOW);
    expect((await read('tok-other'))!.revokedAt).toBeNull();
  });

  it('un rechazo perdido (ya decidida) responde 404 ERR-ADMIN-REGISTRATION-NOT-FOUND y NO revoca las sesiones de una cuenta ya activa', async () => {
    const b = await boot();
    const id = await seedPending(b.a, 'activa.luego');
    expect((await approve(b.a, b.cookie, id)).status).toBe(200);
    await b.a.deps.uow.runInTransaction((r) => r.sessions.save('tok-activa', { userId: id, createdAt: NOW, lastActivityAt: NOW, revokedAt: null }));
    const lost = await reject(b.a, b.cookie, id);
    expect(lost.status).toBe(404);
    expect(problemCode(lost)).toBe(NOT_FOUND);
    expect((await b.a.deps.uow.runInTransaction((r) => r.sessions.findByToken('tok-activa')))!.revokedAt).toBeNull();
    expect(statusOf(b.a, id).s).toBe('ACTIVE');
  });
});

describe('T1247 [REQ-ADM9-004] auditoría de administración de la decisión', () => {
  it('cada decisión deja una entrada con id de administrador, acción y marca de tiempo; sin correo, sub ni datos de la cuenta; las perdidas no auditan', async () => {
    const b = await boot();
    const ok = await seedPending(b.a, 'auditada.ok');
    const no = await seedPending(b.a, 'auditada.no');
    expect((await approve(b.a, b.cookie, ok)).status).toBe(200);
    expect((await reject(b.a, b.cookie, no)).status).toBe(200);
    expect((await approve(b.a, b.cookie, ok)).status).toBe(404);
    expect((await reject(b.a, b.cookie, randomUUID())).status).toBe(404);
    const adminId = b.a.db.prepare('SELECT admin_id FROM admin_identities').pluck().get() as string;
    const rows = await b.a.deps.uow.runInTransaction((r) => r.adminAudit.listByAdmin(adminId));
    const decisions = rows.filter((r) => r.action.startsWith('ADMIN_REGISTRATION'));
    expect(decisions.map((r) => r.action)).toEqual(['ADMIN_REGISTRATION_APPROVE', 'ADMIN_REGISTRATION_REJECT']);
    for (const row of decisions) {
      expect(row.adminId).toBe(adminId);
      expect(row.occurredAt).toBe(NOW);
      expect(row.id).toMatch(UUID_V4);
      expect(row.objectRef).toBeNull();
    }
    const dump = JSON.stringify(b.a.db.prepare('SELECT * FROM admin_audit_entries').all());
    expect(dump).not.toMatch(/example\.test|google-sub|auditada/);
  });
});

describe('T1247 [EDGE-009-002] [EDGE-009-003] [SC-009-004] dos administradores deciden a la vez: exactamente uno gana', () => {
  it('[REQ-APR9-003] aprobar y rechazar la MISMA solicitud en paralelo: un 200 y un 404 ERR-ADMIN-REGISTRATION-NOT-FOUND; el estado final es el del ganador y una sola entrada de auditoría', async () => {
    const b = await boot();
    const second = await secondAdmin(b);
    expect(second).not.toBe(b.cookie);
    for (let round = 0; round < 5; round += 1) {
      const id = await seedPending(b.a, `carrera${round}`);
      const results = await Promise.all([approve(b.a, b.cookie, id), reject(b.a, second, id)]);
      const winners = results.filter((r) => r.status === 200);
      const losers = results.filter((r) => r.status === 404);
      expect(winners, `ronda ${round}`).toHaveLength(1);
      expect(losers, `ronda ${round}`).toHaveLength(1);
      expect(problemCode(losers[0]!)).toBe(NOT_FOUND);
      const won = (winners[0]!.json as { accountStatus: string }).accountStatus;
      expect(statusOf(b.a, id).s).toBe(won);
      expect(b.a.db.prepare("SELECT COUNT(*) FROM admin_audit_entries WHERE action LIKE 'ADMIN_REGISTRATION%'").pluck().get()).toBe(round + 1);
    }
  });

  it('dos aprobaciones simultáneas de la misma solicitud: un 200 y un 404', async () => {
    const b = await boot();
    const second = await secondAdmin(b);
    const id = await seedPending(b.a, 'doble.aprobacion');
    const results = await Promise.all([approve(b.a, b.cookie, id), approve(b.a, second, id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(statusOf(b.a, id).s).toBe('ACTIVE');
  });

  it('el compare-and-set es del repositorio: la segunda decisión sobre la misma fila no afecta ninguna fila, aunque el llamador crea que sigue PENDING', async () => {
    const b = await boot();
    const id = await seedPending(b.a, 'cas.directo');
    const adminId = randomUUID();
    const cutoff = ago(30 * DAY);
    const [one, two] = await b.a.deps.uow.runInTransaction(async (r) => [
      await r.registrations.decide(id, 'ACTIVE', adminId, NOW, cutoff),
      await r.registrations.decide(id, 'REJECTED', adminId, NOW, cutoff),
    ]);
    expect([one, two]).toEqual([true, false]);
    expect(statusOf(b.a, id).s).toBe('ACTIVE');
  });
});
