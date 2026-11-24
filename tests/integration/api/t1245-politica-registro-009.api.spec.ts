import { afterEach, describe, expect, it } from 'vitest';
import { markPending, sqliteRunner } from '../../fixtures/active-accounts.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, SequentialEntropy, fakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { IDENTITY_PASSWORDS } from '../../fixtures/identity-fixtures.ts';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { createApi, createIdentityApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1245 (pruebas rojas, Feature 009, Fase 4, #18; ADR-009-08, ADR-009-16): política de registro con aprobación del administrador. REQ-APR9-001, REQ-APR9-002, REQ-APR9-007,
 * EDGE-009-004, EDGE-009-005, EDGE-009-006, EDGE-009-038; SC-009-001, SC-009-002, SC-009-007, SC-009-049. Contratos: 002 3.4.0 (DRAFT, AccountStatusView) y 004 3.5.0.
 * Las respuestas se comprueban con `contract: false`: el OpenAPI compilado de 002/004 aún es el vigente (recompila T1246); el cuerpo se afirma aquí literalmente.
 * La purga a 30 días está en `tests/integration/persistence/t1245-purga-cuentas-009.spec.ts`.
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const BODY = { username: 'solicitante.t1245', displayName: 'Solicitante', password: 'Clave2026x!', confirmPassword: 'Clave2026x!', email: 'solicitante@example.test' };
const REJECTED_AT = '2026-11-01T10:00:00.000Z';
const sessionRows = (a: Api): number => a.db.prepare('SELECT COUNT(*) FROM sessions').pluck().get() as number;
const row = (a: Api, name: string) => a.db.prepare('SELECT account_status, decided_at, decided_by FROM users WHERE lower(username) = lower(?)').get(name);
const reject = (a: Api, name: string) => a.db.prepare("UPDATE users SET account_status = 'REJECTED', decided_at = ?, decided_by = ? WHERE lower(username) = lower(?)").run(REJECTED_AT, '00000000-0000-4000-8000-0000000000aa', name);
const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
/** Deja una cuenta con contraseña en el estado dado SIN depender de la política de alta: registra, borra las sesiones que el alta pudiera haber creado y fija el estado por SQL. */
async function seedAccount(a: Api, status: 'PENDING' | 'REJECTED'): Promise<void> {
  await a.call('POST', '/api/auth/register', { body: BODY, contract: false });
  a.db.prepare('DELETE FROM sessions').run();
  if (status === 'PENDING') await markPending(sqliteRunner(a.db), 'sqlite', BODY.username);
  else reject(a, BODY.username);
}
const register = (a: Api, body: Record<string, unknown> = BODY) => a.call('POST', '/api/auth/register', { body, contract: false });
const login = (a: Api, username: string, password: string) => a.call('POST', '/api/auth/login', { body: { username, password }, contract: false });

describe('T1245 [REQ-APR9-001] [REQ-APR9-002] [SC-009-001] [SC-009-002] registro con contraseña: PENDING, sin sesión ni cookie', () => {
  it('responde 201 con solo { accountStatus: "PENDING" }, sin Set-Cookie ni fila de sesión, y la fila nace PENDING sin decisión', async () => {
    api = await createIdentityApi();
    const r = await register(api);
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ accountStatus: 'PENDING' });
    expect(r.cookie).toBeNull();
    expect(setCookies(r)).toEqual([]);
    expect(sessionRows(api)).toBe(0);
    expect(row(api, BODY.username)).toEqual({ account_status: 'PENDING', decided_at: null, decided_by: null });
  });

  it('la cuenta PENDING no obtiene sesión útil: las rutas de mascotas y hogares la tratan como anónima (401 ERR-AUTH-UNAUTHENTICATED) [SC-009-001]', async () => {
    api = await createIdentityApi();
    await seedAccount(api, 'PENDING');
    const noCookie = await api.call('GET', '/api/pets', { contract: false });
    expect([noCookie.status, (noCookie.json as { code: string }).code]).toEqual([401, 'ERR-AUTH-UNAUTHENTICATED']);
    const attempt = await login(api, BODY.username, BODY.password);
    expect(attempt.cookie).toBeNull();
    expect(sessionRows(api)).toBe(0);
  });

  it('la respuesta del alta no incluye el correo ni el perfil, y no se envía correo al solicitante (no hay puerto de correo en la API) [REQ-APR9-002]', async () => {
    api = await createIdentityApi();
    const r = await register(api);
    expect(r.text).not.toContain('solicitante@example.test');
    expect(r.text).not.toContain(BODY.username);
    expect(Object.keys(r.json as object)).toEqual(['accountStatus']);
  });
});

describe('T1245 [EDGE-009-005] [SC-009-007] inicio de sesión de cuentas PENDING y REJECTED', () => {
  it.each(['PENDING', 'REJECTED'] as const)('con credenciales válidas de una cuenta %s responde 200 con { accountStatus } y NO crea cookie ni fila de sesión', async (status) => {
    api = await createIdentityApi();
    await seedAccount(api, status);
    const r = await login(api, BODY.username, BODY.password);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ accountStatus: status });
    expect(r.cookie).toBeNull();
    expect(setCookies(r)).toEqual([]);
    expect(sessionRows(api)).toBe(0);
  });

  it.each(['PENDING', 'REJECTED'] as const)('con credenciales INVÁLIDAS de una cuenta %s el fallo es el 401 uniforme de hoy, idéntico al de un usuario inexistente (sin enumeración)', async (status) => {
    api = await createIdentityApi();
    await seedAccount(api, status);
    const wrong = await login(api, BODY.username, 'ClaveIncorrecta9!');
    const ghost = await login(api, 'nadie.existe', 'ClaveIncorrecta9!');
    expect([wrong.status, (wrong.json as { code: string }).code]).toEqual([401, 'ERR-AUTH-INVALID-CREDENTIALS']);
    expect(wrong.json).toEqual(ghost.json);
    expect(wrong.text).not.toMatch(/PENDING|REJECTED|accountStatus/);
    expect(wrong.cookie).toBeNull();
    expect(sessionRows(api)).toBe(0);
  });

  it('una cuenta ACTIVE sigue entrando con SessionView y cookie (la política solo cambia PENDING y REJECTED)', async () => {
    api = await createIdentityApi();
    const r = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: IDENTITY_PASSWORDS['ana.duena'] } });
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(/^argos_session=/);
  });
});

describe('T1245 [REQ-APR9-001] [EDGE-009-038] la guarda de sesión exige ACTIVE (defensa en profundidad)', () => {
  it.each([
    ['PENDING', 'ERR-ACCOUNT-PENDING'],
    ['REJECTED', 'ERR-ACCOUNT-REJECTED'],
  ] as const)('una sesión viva cuya cuenta pasa a %s deja de servir datos: 403 %s en /api/auth/me y en /api/pets', async (status, code) => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    expect((await api.call('GET', '/api/auth/me', { cookie })).status).toBe(200);
    if (status === 'PENDING') await markPending(sqliteRunner(api.db), 'sqlite', 'ana.duena');
    else reject(api, 'ana.duena');
    for (const url of ['/api/auth/me', '/api/pets']) {
      const r = await api.call('GET', url, { cookie, contract: false });
      expect([r.status, (r.json as { code: string }).code]).toEqual([403, code]);
    }
  });
});

describe('T1245 [EDGE-009-004] [REQ-APR9-007] [SC-009-049] un rechazo bloquea el mismo username 30 días sin revelar REJECTED en el registro', () => {
  it('el reintento con el mismo username (incluso con otra capitalización) recibe el mismo 409 ERR-AUTH-USERNAME-TAKEN que un username ocupado por una cuenta ACTIVE, sin cookie ni fila nueva', async () => {
    api = await createIdentityApi();
    await seedAccount(api, 'REJECTED');
    const retry = await register(api, { ...BODY, username: 'SOLICITANTE.t1245' });
    const taken = await register(api, { ...BODY, username: 'ana.duena' });
    expect([retry.status, (retry.json as { code: string }).code]).toEqual([409, 'ERR-AUTH-USERNAME-TAKEN']);
    expect(retry.json).toEqual(taken.json);
    expect(retry.text).not.toMatch(/REJECTED|accountStatus/);
    expect(retry.cookie).toBeNull();
    expect(api.db.prepare('SELECT COUNT(*) FROM users WHERE lower(username) = lower(?)').pluck().get(BODY.username)).toBe(1);
  });

  it('antes de 30 días el mantenimiento conserva la fila REJECTED y el username sigue ocupado; a los 30 días de la DECISIÓN (no de la creación) se purga y el username queda libre para un alta nueva PENDING', async () => {
    api = await createIdentityApi();
    await seedAccount(api, 'REJECTED'); // decisión 2026-11-01; el reloj de la API es 2026-11-11
    const { runMaintenance } = await import('../../../src/application/use-cases/maintenance-use-cases.ts');
    await runMaintenance(api.deps);
    expect(row(api, BODY.username)).toMatchObject({ account_status: 'REJECTED' });
    expect((await register(api)).status).toBe(409);
    api.clock.setClock('2026-12-02', '2026-12-02T10:00:00.000Z'); // 31 días después de la decisión
    await runMaintenance(api.deps);
    expect(row(api, BODY.username)).toBeUndefined();
    const again = await register(api);
    expect([again.status, again.json]).toEqual([201, { accountStatus: 'PENDING' }]);
  });
});

describe('T1245 [REQ-APR9-002] [EDGE-009-006] [EDGE-009-005] [EDGE-009-004] acceso con Google (Google simulado)', () => {
  async function boot() {
    const oidc = fakeGoogleOidc();
    api = await createApi(canonicalState(), { google: { oidc, entropy: new SequentialEntropy() } });
    return { a: api, oidc };
  }
  async function startFlow(a: Api) {
    const r = await a.call('GET', '/api/auth/google/start', { csrf: false });
    return { oauth: `argos_oauth=${valueOf(cookieNamed(r, 'argos_oauth'))}`, state: new URL(r.headers['location'] as string).searchParams.get('state')! };
  }
  const callback = (a: Api, flow: { oauth: string; state: string }) => a.call('GET', `/api/auth/google/callback?code=${GOOGLE_CODE}&state=${flow.state}`, { csrf: false, cookie: flow.oauth, contract: false });
  async function chooseUsername(a: Api, username = 'persona.google') {
    const first = await callback(a, await startFlow(a));
    return a.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(first, 'argos_oauth'))}`, body: { username }, contract: false });
  }

  it('el primer acceso con Google (elegir username) crea la cuenta PENDING: 201 con solo { accountStatus: "PENDING" }, sin argos_session ni fila de sesión [EDGE-009-006]', async () => {
    const { a } = await boot();
    const r = await chooseUsername(a);
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ accountStatus: 'PENDING' });
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    expect(sessionRows(a)).toBe(0);
    expect(row(a, 'persona.google')).toEqual({ account_status: 'PENDING', decided_at: null, decided_by: null });
    expect(r.text).not.toContain(GOOGLE_EMAIL);
  });

  it.each(['PENDING', 'REJECTED'] as const)('el callback con el sub de una cuenta %s NO emite argos_session ni crea fila de sesión y no navega a / [EDGE-009-005] [SC-009-007]', async (status) => {
    const { a } = await boot();
    // Se parte de una cuenta ACTIVE ya nacida con Google (hoy el alta devuelve sesión; T1246 la deja PENDING y el arnés la activa) y se baja al estado bajo prueba.
    await chooseUsername(a);
    if (status === 'PENDING') await markPending(sqliteRunner(a.db), 'sqlite', 'persona.google');
    else reject(a, 'persona.google');
    a.db.prepare('DELETE FROM sessions').run();
    const r = await callback(a, await startFlow(a));
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    expect(sessionRows(a)).toBe(0);
    expect(r.text).not.toMatch(/url=\/["\s]/);
    expect(r.text).not.toMatch(/<script/i);
  });

  it('un sub de una cuenta REJECTED sigue ocupado: un segundo primer acceso con el mismo sub no crea cuenta nueva ni sesión [EDGE-009-004]', async () => {
    const { a } = await boot();
    await chooseUsername(a);
    reject(a, 'persona.google');
    a.db.prepare('DELETE FROM sessions').run();
    const r = await callback(a, await startFlow(a));
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    expect(sessionRows(a)).toBe(0);
    expect(a.db.prepare("SELECT COUNT(*) FROM auth_identities WHERE provider = 'GOOGLE'").pluck().get()).toBe(1);
    expect(a.db.prepare('SELECT COUNT(*) FROM users').pluck().get()).toBe(canonicalState().users.length + 1);
  });
});
