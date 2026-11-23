import { afterEach, describe, expect, it } from 'vitest';
import { GoogleOidcError } from '../../../src/infrastructure/http/google-oidc-verify.ts';
import {
  ADMIN_EMAIL,
  ADMIN_EMAIL_2,
  ADMIN_OAUTH_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SUB,
  ADMIN_SUB_2,
  UUID_V4,
  adminCallback,
  adminKit,
  adminLogin,
  adminStart,
  cookieNamed,
  observable,
  setCookies,
  staticRootWithIndex,
  stateOfUrl,
  valueOf,
  ADMIN_COOKIE_PATTERN,
} from '../../fixtures/admin-fixtures.ts';
import { GOOGLE_ADMIN_REDIRECT, GOOGLE_CODE, GOOGLE_SUB, SequentialEntropy, fakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1230 (pruebas rojas, Feature 009, Fase 3, #19): identidad y flujo OIDC de administración con Google SIMULADO. Correo en la lista y verificado entra; fuera de la lista, no verificado
 * o `state` reutilizado = fallo uniforme (el 404 de una ruta inexistente) sin revelar la lista; no crea ni modifica cuentas de usuario; ninguna ruta de usuario concede el rol.
 * REQ-ADM9-003, REQ-ADM9-006, INV-ADM9-001, EDGE-009-009, EDGE-009-013, EDGE-009-034, EDGE-009-047; SC-009-012, SC-009-048.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot(emails?: readonly string[]) {
  const kit = adminKit(emails);
  const a = await createApi(undefined, { admin: kit.admin, staticRoot: staticRootWithIndex() });
  api = a;
  return { a, kit };
}

const count = (a: Api, table: string): number => (a.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const REFERENCE = '/api/ruta-inexistente-zz';
const reference = async (a: Api): Promise<ReturnType<typeof observable>> => observable(await a.call('GET', REFERENCE, { contract: false }));

/** Inicio + retorno de Google con el `state` del flujo (o el que se indique). */
async function flow(a: Api, options: { state?: string; query?: string } = {}): Promise<{ started: ApiResponse; done: ApiResponse; oauth: string; state: string }> {
  const started = await adminStart(a);
  const oauth = valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE));
  const state = stateOfUrl(started.headers['location'] as string);
  const done = await adminCallback(a, oauth, options.query ?? `code=${GOOGLE_CODE}&state=${options.state ?? state}`);
  return { started, done, oauth, state };
}

describe('T1230 [REQ-ADM9-006] inicio del flujo OIDC de administración', () => {
  it('[REQ-ADM9-006] 302 a Google con state, nonce y PKCE S256, la URI de redirección de administración y SIN max_age; la cookie argos_admin_oauth lleva un id opaco', async () => {
    const { a } = await boot();
    const started = await adminStart(a);
    expect(started.status).toBe(302);
    expect(started.headers['cache-control']).toBe('no-store');
    const url = new URL(started.headers['location'] as string);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(GOOGLE_ADMIN_REDIRECT);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has('max_age')).toBe(false);
    expect(valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE))).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('el estado vive en un almacén PROPIO (admin_oauth_flow_states, solo el hash del id) y no toca oauth_flow_states de usuarios ni argos_session/argos_oauth', async () => {
    const { a } = await boot();
    const before = count(a, 'oauth_flow_states');
    const started = await adminStart(a);
    expect(count(a, 'admin_oauth_flow_states')).toBe(1);
    expect(count(a, 'oauth_flow_states')).toBe(before);
    const row = a.db.prepare('SELECT token_hash FROM admin_oauth_flow_states').get() as { token_hash: string };
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toContain(valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE)));
    expect(cookieNamed(started, 'argos_session')).toBeUndefined();
    expect(cookieNamed(started, 'argos_oauth')).toBeUndefined();
  });

  it('el inicio no consulta la lista de administradores: con la lista vacía responde igual (no revela nada)', async () => {
    const { a } = await boot([]);
    const started = await adminStart(a);
    expect(started.status).toBe(302);
  });
});

describe('T1230 [REQ-ADM9-003] [SC-009-048] correo en la lista y verificado = sesión de administración', () => {
  it('[REQ-ADM9-003] [SC-009-048] entra, emite argos_admin_session con adminId UUID v4 de IdGeneratorPort (sin PII) y ancla la identidad al sub', async () => {
    const { a } = await boot();
    const { done } = await flow(a);
    expect(done.status).toBe(200);
    expect(cookieNamed(done, ADMIN_SESSION_COOKIE)).toMatch(/^argos_admin_session=[A-Za-z0-9_-]{43};/);
    const rows = a.db.prepare('SELECT * FROM admin_identities').all() as Array<Record<string, string>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!['admin_id']).toMatch(UUID_V4);
    expect(rows[0]!['provider']).toBe('GOOGLE');
    expect(rows[0]!['provider_subject']).toBe(ADMIN_SUB);
    expect(rows[0]!['admin_id']).not.toContain(ADMIN_SUB);
    expect(rows[0]!['admin_id']).not.toContain('admin.uno');
  });

  it('el canje en Google usa el verificador PKCE y el nonce del estado del flujo y el estado queda consumido', async () => {
    const { a, kit } = await boot();
    const { started } = await flow(a);
    expect(kit.oidc.completions).toHaveLength(1);
    expect(kit.oidc.completions[0]!.code).toBe(GOOGLE_CODE);
    expect(kit.oidc.completions[0]!.nonce).toBe(new URL(started.headers['location'] as string).searchParams.get('nonce'));
    const row = a.db.prepare('SELECT consumed_at FROM admin_oauth_flow_states').get() as { consumed_at: string | null };
    expect(row.consumed_at).toBe(a.clock.nowIsoTimestamp());
  });

  it('el correo se compara sin distinguir mayúsculas ni espacios (la lista está normalizada en minúsculas)', async () => {
    const { a, kit } = await boot();
    kit.oidc.identity = { sub: ADMIN_SUB, email: ` ${ADMIN_EMAIL.toUpperCase()} ` };
    expect((await flow(a)).done.status).toBe(200);
  });

  it('el segundo acceso del mismo sub reutiliza el mismo adminId (no crea otra identidad)', async () => {
    const { a } = await boot();
    const first = (await adminLogin(a)).cookie;
    const second = (await adminLogin(a)).cookie;
    expect(first).toMatch(ADMIN_COOKIE_PATTERN);
    expect(second).toMatch(ADMIN_COOKIE_PATTERN);
    const view = async (cookie: string | null) => ((await a.call('GET', '/api/admin/session', { cookie, contract: false })).json as { adminId: string }).adminId;
    expect(await view(first)).toBe(await view(second));
    expect(count(a, 'admin_identities')).toBe(1);
  });

  it('dos administradores de la lista tienen identidades distintas', async () => {
    const { a, kit } = await boot([ADMIN_EMAIL, ADMIN_EMAIL_2]);
    await adminLogin(a);
    kit.oidc.identity = { sub: ADMIN_SUB_2, email: ADMIN_EMAIL_2 };
    await adminLogin(a);
    const ids = (a.db.prepare('SELECT admin_id FROM admin_identities').all() as Array<{ admin_id: string }>).map((r) => r.admin_id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('T1230 [REQ-ADM9-006] [EDGE-009-008] [EDGE-009-034] todo fallo del callback es el 404 uniforme, sin Set-Cookie y sin revelar la lista', () => {
  it('correo fuera de la lista, correo no verificado y state reutilizado producen EXACTAMENTE la misma respuesta que una ruta inexistente', async () => {
    const { a, kit } = await boot();
    const expected = await reference(a);

    kit.oidc.identity = { sub: ADMIN_SUB, email: 'otra.persona@example.test' };
    const outside = (await flow(a)).done;

    kit.oidc.identity = new GoogleOidcError('EMAIL_UNVERIFIED');
    const unverified = (await flow(a)).done;

    kit.oidc.identity = { sub: ADMIN_SUB, email: ADMIN_EMAIL };
    const ok = await flow(a);
    expect(ok.done.status).toBe(200);
    const replay = await adminCallback(a, ok.oauth, `code=${GOOGLE_CODE}&state=${ok.state}`);

    for (const failure of [outside, unverified, replay]) {
      expect(observable(failure)).toEqual(expected);
      expect(setCookies(failure)).toEqual([]);
    }
    expect(count(a, 'admin_sessions')).toBe(1);
  });

  it('state ajeno, cookie ausente, cookie mal formada, código ausente, error de Google y canje fallido: el mismo 404', async () => {
    const { a, kit } = await boot();
    const expected = await reference(a);
    const started = await adminStart(a);
    const oauth = valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE));
    const wrongState = await adminCallback(a, oauth, `code=${GOOGLE_CODE}&state=${'z'.repeat(43)}`);

    const second = await adminStart(a);
    const oauth2 = valueOf(cookieNamed(second, ADMIN_OAUTH_COOKIE));
    const state2 = stateOfUrl(second.headers['location'] as string);
    const noCookie = await adminCallback(a, null, `code=${GOOGLE_CODE}&state=${state2}`);
    const malformed = await adminCallback(a, 'corta', `code=${GOOGLE_CODE}&state=${state2}`);
    const noCode = await adminCallback(a, oauth2, `state=${state2}`);

    const third = await adminStart(a);
    const denied = await adminCallback(a, valueOf(cookieNamed(third, ADMIN_OAUTH_COOKIE)), `error=access_denied&state=${stateOfUrl(third.headers['location'] as string)}`);

    kit.oidc.identity = new GoogleOidcError('EXCHANGE');
    const exchange = (await flow(a)).done;

    for (const failure of [wrongState, noCookie, malformed, noCode, denied, exchange]) {
      expect(observable(failure)).toEqual(expected);
      expect(setCookies(failure)).toEqual([]);
    }
    expect(count(a, 'admin_sessions')).toBe(0);
    expect(count(a, 'admin_identities')).toBe(0);
  });

  it('un estado vencido (más de 900 s) falla con el mismo 404', async () => {
    const { a } = await boot();
    const expected = await reference(a);
    const started = await adminStart(a);
    const oauth = valueOf(cookieNamed(started, ADMIN_OAUTH_COOKIE));
    const state = stateOfUrl(started.headers['location'] as string);
    const later = new Date(Date.parse(a.clock.nowIsoTimestamp()) + 901_000).toISOString();
    a.clock.setClock(later.slice(0, 10), later);
    expect(observable(await adminCallback(a, oauth, `code=${GOOGLE_CODE}&state=${state}`))).toEqual(expected);
  });

  it('un estado del flujo de USUARIOS (cookie argos_oauth) no sirve en el callback de administración', async () => {
    const { a } = await boot();
    const expected = await reference(a);
    const userOidc = fakeGoogleOidc();
    const userApi = await createApi(undefined, { admin: adminKit().admin, google: { oidc: userOidc, entropy: new SequentialEntropy() }, staticRoot: staticRootWithIndex() });
    try {
      const start = await userApi.call('GET', '/api/auth/google/start', { csrf: false, contract: false });
      const userOauth = valueOf(cookieNamed(start, 'argos_oauth'));
      const state = stateOfUrl(start.headers['location'] as string);
      const done = await userApi.call('GET', `/api/admin/auth/google/callback?code=${GOOGLE_CODE}&state=${state}`, { csrf: false, contract: false, cookie: `${ADMIN_OAUTH_COOKIE}=${userOauth}` });
      expect(observable(done)).toEqual(expected);
    } finally {
      await userApi.close();
    }
  });
});

describe('T1230 [EDGE-009-047] el sub anclado y la lista vigente mandan', () => {
  it('con el sub anclado, el mismo correo desde OTRO sub no entra (404 uniforme) y no crea identidad', async () => {
    const { a, kit } = await boot();
    const expected = await reference(a);
    expect((await adminLogin(a)).cookie).toMatch(ADMIN_COOKIE_PATTERN);
    kit.oidc.identity = { sub: ADMIN_SUB_2, email: ADMIN_EMAIL };
    const intruder = await flow(a);
    expect(observable(intruder.done)).toEqual(expected);
    expect(count(a, 'admin_identities')).toBe(1);
    expect(count(a, 'admin_sessions')).toBe(1);
  });

  it('un sub anclado cuyo correo ya no está en la lista no entra', async () => {
    const { a, kit } = await boot();
    const expected = await reference(a);
    expect((await adminLogin(a)).cookie).toMatch(ADMIN_COOKIE_PATTERN);
    kit.emails.length = 0;
    expect(observable((await flow(a)).done)).toEqual(expected);
  });

  it('quitar el correo de la lista revoca la sesión vigente en la PETICIÓN SIGUIENTE (404 uniforme) y la fila queda revocada', async () => {
    const { a, kit } = await boot();
    const { cookie } = await adminLogin(a);
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(200);
    kit.emails.length = 0;
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(404);
    const row = a.db.prepare('SELECT revoked_at FROM admin_sessions').get() as { revoked_at: string | null };
    expect(row.revoked_at).toBe(a.clock.nowIsoTimestamp());
    kit.emails.push(ADMIN_EMAIL);
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(404);
  });
});

describe('T1230 [REQ-ADM9-003] [INV-ADM9-001] [EDGE-009-013] [SC-009-012] el acceso a /admin no toca las cuentas de usuario y ninguna ruta de usuario concede el rol', () => {
  it('[INV-ADM9-001] [EDGE-009-013] entrar a /admin no crea ni modifica filas de users, auth_identities, sessions ni oauth_flow_states, aunque exista una cuenta con el mismo correo', async () => {
    const { a } = await boot();
    a.db.prepare('UPDATE users SET email = ? WHERE username = ?').run(ADMIN_EMAIL, 'andres');
    const snapshot = () => JSON.stringify([a.db.prepare('SELECT * FROM users ORDER BY id').all(), a.db.prepare('SELECT * FROM sessions').all(), a.db.prepare('SELECT * FROM auth_identities').all(), a.db.prepare('SELECT * FROM oauth_flow_states').all()]);
    const before = snapshot();
    expect((await adminLogin(a)).cookie).toMatch(ADMIN_COOKIE_PATTERN);
    expect(snapshot()).toBe(before);
  });

  it('el inicio de sesión de USUARIO con Google y el correo de un administrador abre argos_session pero NO una sesión de administración', async () => {
    const userOidc = fakeGoogleOidc();
    userOidc.identity = { sub: GOOGLE_SUB, email: ADMIN_EMAIL };
    const kit = adminKit();
    const a = await createApi(undefined, { admin: kit.admin, google: { oidc: userOidc, entropy: new SequentialEntropy() }, staticRoot: staticRootWithIndex() });
    api = a;
    const start = await a.call('GET', '/api/auth/google/start', { csrf: false, contract: false });
    const step = await a.call('GET', `/api/auth/google/callback?code=${GOOGLE_CODE}&state=${stateOfUrl(start.headers['location'] as string)}`, { csrf: false, contract: false, cookie: `argos_oauth=${valueOf(cookieNamed(start, 'argos_oauth'))}` });
    const chosen = await a.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'persona.google' }, contract: false });
    expect(chosen.status).toBe(201);
    const user = `argos_session=${valueOf(cookieNamed(chosen, 'argos_session'))}`;
    expect((await a.call('GET', '/api/admin/session', { cookie: user, contract: false })).status).toBe(404);
    expect(count(a, 'admin_identities')).toBe(0);
    expect(count(a, 'admin_sessions')).toBe(0);
  });

  it('el cuerpo de registro con campos de rol o isAdmin no crea administrador (el rol no existe en el modelo de usuarios)', async () => {
    const { a } = await boot();
    const r = await a.call('POST', '/api/auth/register', { body: { username: 'intruso', password: 'Contrasena-Segura-123', role: 'PLATFORM_ADMIN', isAdmin: true }, contract: false });
    expect([201, 422]).toContain(r.status);
    expect(count(a, 'admin_identities')).toBe(0);
    const cookie = r.cookie;
    expect((await a.call('GET', '/api/admin/session', { cookie, contract: false })).status).toBe(404);
  });
});
