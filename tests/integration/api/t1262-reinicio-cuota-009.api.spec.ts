import { afterEach, describe, expect, it } from 'vitest';
import { RunSceneGenerationUseCase } from '../../../src/application/use-cases/scene-run-use-case.ts';
import { ADMIN_EMAIL, ADMIN_EMAIL_2, ADMIN_SUB, adminKit, adminLogin, observable, type AdminKit } from '../../fixtures/admin-fixtures.ts';
import { ANDRES, CARLOS, HOUSEHOLD, LUCIA, MARIA, canonicalState } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { sceneFixture, type SceneFixture } from '../../fixtures/scene-services-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1262 (Feature 009, Fase 5a, #20; PRUEBAS ROJAS hasta T1268): `POST /api/admin/parameters/scene-quota/reset` (contrato `admin.openapi.yaml` 1.4.0). Pone a cero
 * `consumed_generations` (escenas) y `scene_quota_carry` SOLO de las cuentas de usuario del administrador (por `sub` de Google vinculado en `auth_identities` o por correo VERIFICADO
 * igual a uno de la lista cerrada), sin tocar `scene.global_quota_used.YYYY-MM` ni cuentas ajenas; no falla sin escena u hogar (EDGE-009-022); es coherente con una generacion en
 * curso (compare-and-set, EDGE-009-023); auditado sin ids de cuenta ni contadores. La edicion de `scene.global_quota_max` es de 5b (P5-06 = B).
 * @implements REQ-CFG9-006, REQ-CFG9-001, REQ-ADM9-004, INV-CFG9-003, EDGE-009-022, EDGE-009-023, SC-009-026
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const NOW = '2026-11-23T12:00:00.000Z';
const WINDOW = '2026-11';
const H1 = HOUSEHOLD.id;
const RESET = '/api/admin/parameters/scene-quota/reset';
const GLOBAL_KEY = `scene.global_quota_used.${WINDOW}`;
const KEY = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Boot {
  readonly a: Api;
  readonly kit: AdminKit;
  readonly fixture: SceneFixture;
  readonly cookie: string;
  readonly adminId: string;
  runLastJob(): Promise<string>;
}

async function boot(): Promise<Boot> {
  const kit = adminKit([ADMIN_EMAIL, ADMIN_EMAIL_2]);
  const fixture = sceneFixture();
  const a = await createApi(canonicalState(), { admin: kit.admin, scene: fixture.services, media: { storage: new ControlledStorage(() => new Date(NOW)), limits: DEFAULT_LIMITS } });
  api = a;
  a.clock.setClock(NOW.slice(0, 10), NOW);
  const { cookie } = await adminLogin(a);
  const adminId = (a.db.prepare('SELECT admin_id AS id FROM admin_identities').get() as { id: string }).id;
  return {
    a,
    kit,
    fixture,
    cookie: cookie!,
    adminId,
    async runLastJob() {
      const job = fixture.dispatcher.jobs[fixture.dispatcher.jobs.length - 1]!;
      return new RunSceneGenerationUseCase(a.deps).execute(job, new AbortController().signal);
    },
  };
}

const reset = (b: Boot, options: { cookie?: string | null; csrf?: boolean; body?: unknown } = {}): Promise<ApiResponse> =>
  b.a.call('POST', RESET, { cookie: options.cookie === undefined ? b.cookie : options.cookie, csrf: options.csrf ?? true, contract: false, ...(options.body === undefined ? {} : { body: options.body }) });
const codeOf = (r: ApiResponse): string | undefined => (r.json as { code?: string } | undefined)?.code;
const shapeOf = (r: ApiResponse) => {
  const { headers, text, status } = observable(r);
  const { 'content-length': _length, ...rest } = headers;
  return { status, text: text.replace(/Route \w+:\S+ not found/, 'Route not found'), headers: rest };
};

let sceneSeq = 0;
function insertScene(a: Api, owner: { household?: string; user?: string }, consumed: number, window = WINDOW): string {
  sceneSeq += 1;
  const id = `c2000000-0000-4000-8000-${String(sceneSeq).padStart(12, '0')}`;
  a.db
    .prepare('INSERT INTO home_scenes (id, household_id, owner_user_id, consumed_generations, quota_window, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, owner.household ?? null, owner.user ?? null, consumed, window, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
  return id;
}
const insertCarry = (a: Api, userId: string, consumed: number): void => {
  a.db.prepare('INSERT INTO scene_quota_carry (owner_user_id, quota_window, consumed_generations) VALUES (?, ?, ?)').run(userId, WINDOW, consumed);
};
const consumedOf = (a: Api, where: string, id: string): number => (a.db.prepare(`SELECT COALESCE(SUM(consumed_generations), 0) AS n FROM home_scenes WHERE ${where} = ?`).get(id) as { n: number }).n;
const carryOf = (a: Api, userId: string): number => (a.db.prepare('SELECT COALESCE(SUM(consumed_generations), 0) AS n FROM scene_quota_carry WHERE owner_user_id = ?').get(userId) as { n: number }).n;
const globalRow = (a: Api) => a.db.prepare('SELECT value, updated_at AS updatedAt FROM platform_parameters WHERE key = ?').get(GLOBAL_KEY);
const auditRows = (a: Api) => a.db.prepare("SELECT admin_id AS adminId, action, object_ref AS objectRef, occurred_at AS occurredAt FROM admin_audit_entries WHERE action NOT LIKE 'ADMIN_SESSION%' ORDER BY occurred_at, id").all() as Array<{ adminId: string; action: string; objectRef: string | null; occurredAt: string }>;

/**
 * Cuentas del administrador: ANDRES (correo VERIFICADO de la lista, con otra capitalizacion), LUCIA (sub de Google vinculado igual al del administrador).
 * Ajenas: MARIA (correo de la lista SIN verificar) y CARLOS (sin vinculo).
 */
function seedAccounts(a: Api): void {
  a.db.prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run('Admin.Uno@Example.test', '2026-11-02T00:00:00.000Z', ANDRES);
  a.db.prepare('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?').run(ADMIN_EMAIL_2, MARIA);
  a.db.prepare('INSERT INTO auth_identities (provider, provider_subject, user_id, created_at) VALUES (?, ?, ?, ?)').run('GOOGLE', ADMIN_SUB, LUCIA, '2026-11-02T00:00:00.000Z');
  a.db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES (?, '37', 'contador', '2026-11-10T00:00:00.000Z', NULL) ON CONFLICT (key) DO UPDATE SET value = '37'").run(GLOBAL_KEY);
}
function seedScenes(a: Api) {
  return {
    household: insertScene(a, { household: H1 }, 3),
    lucia: insertScene(a, { user: LUCIA }, 2),
    maria: insertScene(a, { user: MARIA }, 7),
    carlos: insertScene(a, { user: CARLOS }, 5),
  };
}

describe('T1262 [REQ-CFG9-006] [SC-009-026] el reinicio alcanza SOLO las cuentas del administrador', () => {
  it('pone a cero el consumo de las escenas y el arrastre de las cuentas vinculadas por sub o por correo verificado, y devuelve {accountsReset, resetAt}', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    for (const [user, n] of [[ANDRES, 4], [LUCIA, 1], [MARIA, 6], [CARLOS, 8]] as const) insertCarry(b.a, user, n);
    const r = await reset(b);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.json).toEqual({ accountsReset: 2, resetAt: NOW });
    // Opcion A (Neo): el hogar compartido H1 (owner_user_id NULL) NO se toca.
    expect(consumedOf(b.a, 'household_id', H1)).toBe(3);
    expect(consumedOf(b.a, 'owner_user_id', LUCIA)).toBe(0);
    expect([carryOf(b.a, ANDRES), carryOf(b.a, LUCIA)]).toEqual([0, 0]);
  });

  it('opcion A: una escena de hogar compartido queda intacta tras el reinicio, aunque un miembro sea cuenta del administrador', async () => {
    const b = await boot();
    seedAccounts(b.a);
    const shared = insertScene(b.a, { household: H1 }, 4);
    const own = insertScene(b.a, { user: ANDRES }, 6);
    expect((await reset(b)).status).toBe(200);
    expect((b.a.db.prepare('SELECT consumed_generations AS n FROM home_scenes WHERE id = ?').get(shared) as { n: number }).n).toBe(4);
    expect((b.a.db.prepare('SELECT consumed_generations AS n FROM home_scenes WHERE id = ?').get(own) as { n: number }).n).toBe(0);
  });

  it('NO toca cuentas ajenas: correo de la lista sin verificar (MARIA) ni cuentas sin vinculo (CARLOS), ni su escena ni su arrastre', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    for (const [user, n] of [[MARIA, 6], [CARLOS, 8]] as const) insertCarry(b.a, user, n);
    expect((await reset(b)).status).toBe(200);
    expect([consumedOf(b.a, 'owner_user_id', MARIA), consumedOf(b.a, 'owner_user_id', CARLOS)]).toEqual([7, 5]);
    expect([carryOf(b.a, MARIA), carryOf(b.a, CARLOS)]).toEqual([6, 8]);
  });

  it('NO toca el contador global scene.global_quota_used.YYYY-MM (ni su valor ni su fecha)', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    const before = globalRow(b.a);
    expect(before).toEqual({ value: '37', updatedAt: '2026-11-10T00:00:00.000Z' });
    expect((await reset(b)).status).toBe(200);
    expect(globalRow(b.a)).toEqual(before);
  });

  it('no borra el historial de intentos ni las imagenes y deja intacto el consumo del hogar compartido (opcion A): solo cambian los contadores de las cuentas del administrador', async () => {
    const b = await boot();
    const cookie = await b.a.login('andres');
    b.a.db.prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run(ADMIN_EMAIL, '2026-11-02T00:00:00.000Z', ANDRES);
    expect((await b.a.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(1) }, contract: false })).status).toBe(202);
    expect(await b.runLastJob()).toBe('PUBLISHED');
    expect(consumedOf(b.a, 'household_id', H1)).toBe(1);
    const attempts = (b.a.db.prepare('SELECT COUNT(*) AS n FROM scene_attempts').get() as { n: number }).n;
    expect((await reset(b)).status).toBe(200);
    expect(consumedOf(b.a, 'household_id', H1)).toBe(1);
    expect((b.a.db.prepare('SELECT COUNT(*) AS n FROM scene_attempts').get() as { n: number }).n).toBe(attempts);
    const view = (await b.a.call('GET', `/api/households/${H1}/scene`, { cookie, contract: false })).json as { imageTag: string | null; quota: { max: number; remaining: number } };
    expect(typeof view.imageTag).toBe('string');
    expect(view.quota.remaining).toBe(view.quota.max - 1);
  });

  it('un correo de la lista solo cuenta si esta VERIFICADO: sin verificar no hay reinicio (accountsReset = 0 y la escena conserva su consumo)', async () => {
    const b = await boot();
    b.a.db.prepare('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?').run(ADMIN_EMAIL, ANDRES);
    insertScene(b.a, { household: H1 }, 3);
    const r = await reset(b);
    expect(r.json).toEqual({ accountsReset: 0, resetAt: NOW });
    expect(consumedOf(b.a, 'household_id', H1)).toBe(3);
  });

  it('el cuerpo de la respuesta no identifica cuentas: ni ids, ni correos, ni sub, ni contadores', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    const r = await reset(b);
    expect(Object.keys(r.json as object).sort()).toEqual(['accountsReset', 'resetAt']);
    for (const secret of [ANDRES, LUCIA, MARIA, CARLOS, ADMIN_EMAIL, ADMIN_EMAIL_2, ADMIN_SUB, H1]) expect(r.text).not.toContain(secret);
  });
});

describe('T1262 [EDGE-009-022] no falla sin escena ni hogar', () => {
  it('ninguna cuenta coincide: 200 con accountsReset = 0', async () => {
    const b = await boot();
    const r = await reset(b);
    expect([r.status, r.json]).toEqual([200, { accountsReset: 0, resetAt: NOW }]);
  });

  it('cuenta del administrador sin escena ni hogar (LUCIA vinculada, sin filas): 200 sin error y SIN crear escenas por el camino', async () => {
    const b = await boot();
    b.a.db.prepare('INSERT INTO auth_identities (provider, provider_subject, user_id, created_at) VALUES (?, ?, ?, ?)').run('GOOGLE', ADMIN_SUB, LUCIA, '2026-11-02T00:00:00.000Z');
    const scenesBefore = (b.a.db.prepare('SELECT COUNT(*) AS n FROM home_scenes').get() as { n: number }).n;
    const r = await reset(b);
    expect(r.status).toBe(200);
    const body = r.json as { accountsReset: number; resetAt: string };
    expect(Number.isInteger(body.accountsReset) && body.accountsReset >= 0 && body.accountsReset <= 1).toBe(true);
    expect(body.resetAt).toBe(NOW);
    expect((b.a.db.prepare('SELECT COUNT(*) AS n FROM home_scenes').get() as { n: number }).n).toBe(scenesBefore);
  });

  it('es idempotente: un segundo reinicio seguido tambien responde 200 y deja todo en cero', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    expect((await reset(b)).status).toBe(200);
    const second = await reset(b);
    expect(second.status).toBe(200);
    expect([consumedOf(b.a, 'household_id', H1), consumedOf(b.a, 'owner_user_id', LUCIA)]).toEqual([3, 0]);
  });
});

describe('T1262 [EDGE-009-023] coherencia con una generacion en curso (compare-and-set)', () => {
  it('con una generacion aceptada y sin publicar, el reinicio no la rompe: al publicar el consumo es exactamente 1 (ni 2 ni negativo)', async () => {
    const b = await boot();
    const cookie = await b.a.login('andres');
    b.a.db.prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run(ADMIN_EMAIL, '2026-11-02T00:00:00.000Z', ANDRES);
    expect((await b.a.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(1) }, contract: false })).status).toBe(202);
    const r = await reset(b);
    expect(r.status).toBe(200);
    expect(await b.runLastJob()).toBe('PUBLISHED');
    expect(consumedOf(b.a, 'household_id', H1)).toBe(1);
  });

  it('reinicio concurrente con la publicacion: 200 (consumo final 0 o 1) o 409 ERR-ADMIN-QUOTA-RESET-CONFLICT SIN cambios parciales; nunca un consumo incoherente', async () => {
    const b = await boot();
    seedAccounts(b.a);
    const cookie = await b.a.login('andres');
    insertScene(b.a, { user: LUCIA }, 2);
    expect((await b.a.call('POST', `/api/households/${H1}/scene/generate`, { cookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(1) }, contract: false })).status).toBe(202);
    const luciaBefore = consumedOf(b.a, 'owner_user_id', LUCIA);
    const [published, r] = await Promise.all([b.runLastJob(), reset(b)]);
    expect(published).toBe('PUBLISHED');
    expect([200, 409]).toContain(r.status);
    const final = consumedOf(b.a, 'household_id', H1);
    if (r.status === 200) {
      expect([0, 1]).toContain(final);
      expect(consumedOf(b.a, 'owner_user_id', LUCIA)).toBe(0);
    } else {
      expect(codeOf(r)).toBe('ERR-ADMIN-QUOTA-RESET-CONFLICT');
      // Sin cambios parciales: la cuenta que no estaba en disputa conserva su consumo y el de la escena en vuelo es el de la publicacion.
      expect(final).toBe(1);
      expect(consumedOf(b.a, 'owner_user_id', LUCIA)).toBe(luciaBefore);
    }
    expect(auditRows(b.a).length).toBe(r.status === 200 ? 1 : 0);
  });

  it('despues del reinicio la cuota de la cuenta del administrador vuelve a estar completa y se puede volver a generar (escena propia)', async () => {
    const b = await boot();
    seedAccounts(b.a);
    const cookie = await b.a.login('lucia.r');
    insertScene(b.a, { user: LUCIA }, 10);
    const generate = (n: number): Promise<ApiResponse> => b.a.call('POST', '/api/me/scene/generate', { cookie, body: { action: 'REGENERATE' }, headers: { 'idempotency-key': KEY(n) }, contract: false });
    expect(codeOf(await generate(1))).toBe('ERR-SCENE-QUOTA-EXCEEDED');
    expect((await reset(b)).status).toBe(200);
    expect((await generate(2)).status).toBe(202);
  });
});

describe('T1262 [REQ-ADM9-004] sesion, CSRF, cuerpo y auditoria', () => {
  it('CSRF antes de la sesion: sin X-Argos-Request es 403 ERR-AUTH-CSRF-REJECTED con o sin sesion, y no reinicia nada', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    const withSession = await reset(b, { csrf: false });
    const without = await reset(b, { csrf: false, cookie: null });
    expect([withSession.status, codeOf(withSession), without.status, codeOf(without)]).toEqual([403, 'ERR-AUTH-CSRF-REJECTED', 403, 'ERR-AUTH-CSRF-REJECTED']);
    expect(consumedOf(b.a, 'household_id', H1)).toBe(3);
  });

  it('sin sesion de administracion, o con la cookie de usuario, es el 404 uniforme de /api/ (sin codigo ERR-*) y no reinicia nada', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    const unknown = shapeOf(await b.a.call('GET', '/api/no-existe-nunca', { contract: false }));
    const anon = await reset(b, { cookie: null });
    const user = await reset(b, { cookie: await b.a.login('andres') });
    expect(shapeOf(anon)).toEqual(unknown);
    expect(shapeOf(user)).toEqual(unknown);
    expect(codeOf(anon)).toBeUndefined();
    expect(consumedOf(b.a, 'household_id', H1)).toBe(3);
  });

  it('cualquier cuerpo no vacio se rechaza con 422 ERR-SCHEMA-VALIDATION-FAILED sin reiniciar', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    for (const body of [{ accountsReset: 0 }, { userId: LUCIA }, { all: true }, [1]]) {
      const r = await reset(b, { body });
      expect([r.status, codeOf(r)], JSON.stringify(body)).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    }
    expect(consumedOf(b.a, 'household_id', H1)).toBe(3);
    expect(auditRows(b.a)).toEqual([]);
  });

  it('un reinicio exitoso deja UNA entrada en admin_audit_entries con el id del administrador y la marca de tiempo, SIN ids de cuenta ni contadores', async () => {
    const b = await boot();
    seedAccounts(b.a);
    seedScenes(b.a);
    expect((await reset(b)).status).toBe(200);
    const entries = auditRows(b.a);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ adminId: b.adminId, occurredAt: NOW });
    expect(entries[0]!.action).toBe('ADMIN_SCENE_QUOTA_RESET');
    const dumped = JSON.stringify(entries[0]);
    for (const secret of [ANDRES, LUCIA, MARIA, CARLOS, ADMIN_EMAIL, ADMIN_SUB, H1]) expect(dumped).not.toContain(secret);
    expect(dumped).not.toMatch(/consumed|\b37\b/);
  });

  it('la operacion no es un parametro: no hay clave ni etag, y GET /api/admin/parameters no la lista', async () => {
    const b = await boot();
    const list = await b.a.call('GET', '/api/admin/parameters', { cookie: b.cookie, contract: false });
    expect(list.status).toBe(200);
    const keys = (list.json as { items: Array<{ key: string }> }).items.map((i) => i.key);
    expect(keys.some((k) => k.includes('quota') && k !== 'scene.global_quota_max')).toBe(false);
    const asKey = await b.a.call('PUT', '/api/admin/parameters/scene-quota', { cookie: b.cookie, body: { value: '1' }, headers: { 'if-match': '"abcdefgh"' }, contract: false });
    expect(asKey.status).toBe(422);
  });
});
