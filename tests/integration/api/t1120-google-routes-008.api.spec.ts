import { afterEach, describe, expect, it } from 'vitest';
import { GOOGLE_AUTH_LIMITS } from '../../../src/infrastructure/config/google-auth-config.ts';
import { GoogleOidcError } from '../../../src/infrastructure/http/google-oidc-verify.ts';
import { activateAccount, sqliteRunner } from '../../fixtures/active-accounts.ts';
import { PASSWORDS, canonicalState } from '../../fixtures/application-harness.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, SequentialEntropy, fakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1120 (pruebas rojas, Feature 008, [GH:#16]): rutas HTTP del acceso con Google con Google SIMULADO. REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005,
 * EDGE-008-006, ADR-008-03; SC-008-001..006 (SC-008-006: cookie `Strict` en el callback), SC-008-061 (límite de tasa uniforme), SC-008-062.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

async function boot(options: { cookieSecure?: boolean } = {}) {
  const oidc = fakeGoogleOidc();
  api = await createApi(canonicalState(), { ...options, google: { oidc, entropy: new SequentialEntropy() } });
  return { api, oidc };
}

const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
const state = (r: ApiResponse) => new URL(r.headers['location'] as string).searchParams.get('state')!;

async function startFlow(a: Api) {
  const r = await a.call('GET', '/api/auth/google/start', { csrf: false });
  return { r, oauth: `argos_oauth=${valueOf(cookieNamed(r, 'argos_oauth'))}`, state: state(r) };
}
const callback = (a: Api, oauth: string | null, query: string) => a.call('GET', `/api/auth/google/callback?${query}`, { csrf: false, cookie: oauth });

describe('T1120 GET /api/auth/google/start (SC-008-001, REQ-SSO8-004)', () => {
  it('responde 302 a Google sin cuerpo, no-store y entrega la cookie argos_oauth: HttpOnly, SameSite=Lax, Path=/api/auth/google, Max-Age=900', async () => {
    const { api } = await boot();
    const r = await api.call('GET', '/api/auth/google/start', { csrf: false });
    expect(r.status).toBe(302);
    expect(r.headers['location']).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.text).toBe('');
    const cookie = cookieNamed(r, 'argos_oauth')!;
    expect(cookie).toMatch(/^argos_oauth=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/google');
    expect(cookie).toContain('Max-Age=900');
    expect(cookie).not.toContain('Secure');
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
  });

  it('en Cloud (cookieSecure) la cookie lleva Secure', async () => {
    const { api } = await boot({ cookieSecure: true });
    const r = await api.call('GET', '/api/auth/google/start', { csrf: false });
    expect(cookieNamed(r, 'argos_oauth')).toContain('Secure');
  });

  it('SC-008-061: el límite de tasa por IP responde ERR-RATE-LIMITED (429) uniforme tras agotar el cupo', async () => {
    const { api } = await boot();
    for (let i = 0; i < GOOGLE_AUTH_LIMITS.start.maxPerWindow; i += 1) expect((await api.call('GET', '/api/auth/google/start', { csrf: false })).status).toBe(302);
    const limited = await api.call('GET', '/api/auth/google/start', { csrf: false });
    expect(limited.status).toBe(429);
    expect((limited.json as { code: string }).code).toBe('ERR-RATE-LIMITED');
    expect(cookieNamed(limited, 'argos_oauth')).toBeUndefined();
  });
});

describe('T1120 GET /api/auth/google/callback (SC-008-001..006, EDGE-008-006, ADR-008-03)', () => {
  it('SC-008-001/006: sub conocido responde 200 con página mínima que navega a /, establece argos_session Strict SIN sesión previa y retira argos_oauth', async () => {
    const { api } = await boot();
    // Cuenta ya nacida con Google (primer acceso completo).
    const first = await startFlow(api);
    const pending = await callback(api, first.oauth, `code=${GOOGLE_CODE}&state=${first.state}`);
    const chosen = await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(pending, 'argos_oauth'))}`, body: { username: 'nueva.persona', adultDeclaration: true }, contract: false });
    expect(chosen.status).toBe(201);
    // 009 (T1246, EDGE-009-006): la cuenta nace PENDING sin sesión; el arnés (T1244) la activa para que el segundo acceso abra sesión.
    await activateAccount(sqliteRunner(api.db), 'sqlite', 'nueva.persona', api.clock.nowIsoTimestamp());
    // Segundo acceso: la petición del callback NO trae argos_session (Strict no viaja desde Google; EDGE-008-006).
    const second = await startFlow(api);
    const r = await callback(api, second.oauth, `code=${GOOGLE_CODE}&state=${second.state}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/html/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.text).toContain('http-equiv="refresh"');
    expect(r.text).toMatch(/content="0;\s*url=\/"/);
    expect(r.text).not.toMatch(/<script/i);
    expect(String(r.headers['content-security-policy'])).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'self'");
    const session = cookieNamed(r, 'argos_session')!;
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Strict');
    expect(session).toContain('Path=/');
    const retired = cookieNamed(r, 'argos_oauth')!;
    expect(retired).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    // La sesión nueva funciona.
    const me = await api.call('GET', '/api/auth/me', { cookie: `argos_session=${valueOf(session)}` });
    expect(me.status).toBe(200);
    expect((me.json as { user: { username: string } }).user.username).toBe('nueva.persona');
  });

  it('SC-008-002: sub desconocido responde 200 que lleva a «Elige tu usuario», renueva argos_oauth (estado USERNAME) y NO establece sesión ni crea cuenta', async () => {
    const { api } = await boot();
    const first = await startFlow(api);
    const r = await callback(api, first.oauth, `code=${GOOGLE_CODE}&state=${first.state}`);
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/<script/i);
    expect(r.text).toMatch(/url=\/elige-usuario/);
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    const renewed = cookieNamed(r, 'argos_oauth')!;
    expect(renewed).toContain('SameSite=Lax');
    expect(renewed).toContain('Path=/api/auth/google');
    expect(renewed).toContain('Max-Age=900');
    expect(valueOf(renewed)).not.toBe(valueOf(first.oauth.replace('argos_oauth=', 'argos_oauth=')));
    expect(api.dump()).not.toContain(GOOGLE_EMAIL);
  });

  it('SC-008-003/004/005: cancelación, id_token inválido, state reutilizado o ausente y cookie ausente dan el MISMO 400 uniforme y retiran argos_oauth', async () => {
    const { api, oidc } = await boot();
    const bodies: string[] = [];
    const attempts: Array<() => Promise<ApiResponse>> = [
      async () => {
        const f = await startFlow(api);
        return callback(api, f.oauth, `error=access_denied&state=${f.state}`);
      },
      async () => {
        oidc.identity = new GoogleOidcError('EMAIL_UNVERIFIED');
        const f = await startFlow(api);
        const r = await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
        oidc.identity = { sub: 'google-sub-0001', email: GOOGLE_EMAIL };
        return r;
      },
      async () => {
        const f = await startFlow(api);
        await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
        return callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
      },
      async () => callback(api, null, `code=${GOOGLE_CODE}&state=algo`),
      async () => {
        const f = await startFlow(api);
        return callback(api, f.oauth, `code=${GOOGLE_CODE}&state=otro`);
      },
    ];
    for (const attempt of attempts) {
      const r = await attempt();
      expect(r.status).toBe(400);
      expect(r.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect((r.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
      expect(cookieNamed(r, 'argos_session')).toBeUndefined();
      bodies.push(r.text);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toMatch(/EMAIL_UNVERIFIED|persona@|google-sub|access_denied/);
  });

  it('SC-008-061: el límite de tasa del callback responde 429 uniforme', async () => {
    const { api } = await boot();
    for (let i = 0; i < GOOGLE_AUTH_LIMITS.callback.maxPerWindow; i += 1) expect((await callback(api, null, 'error=access_denied')).status).toBe(400);
    const limited = await callback(api, null, 'error=access_denied');
    expect(limited.status).toBe(429);
    expect((limited.json as { code: string }).code).toBe('ERR-RATE-LIMITED');
  });

  it('un parámetro `code` o `state` demasiado largo se rechaza con el mismo 400 uniforme (sin reflejar nada)', async () => {
    const { api } = await boot();
    const r = await callback(api, null, `code=${'a'.repeat(3000)}&state=${'b'.repeat(300)}`);
    expect(r.status).toBe(400);
    expect((r.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
  });
});

describe('T1120 POST /api/auth/google/username (SC-008-002, SC-008-062, EDGE-008-027)', () => {
  async function toUsername(a: Api) {
    const f = await startFlow(a);
    const r = await callback(a, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    return `argos_oauth=${valueOf(cookieNamed(r, 'argos_oauth'))}`;
  }

  it('201 con AccountStatusView PENDING (009, EDGE-009-006: sin argos_session), argos_oauth retirada y la cuenta sin contraseña (authMethods) una vez ACTIVE', async () => {
    const { api } = await boot();
    const oauth = await toUsername(api);
    const r = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'Nueva.Persona', adultDeclaration: true }, contract: false });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ accountStatus: 'PENDING' });
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    expect(cookieNamed(r, 'argos_oauth')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    await activateAccount(sqliteRunner(api.db), 'sqlite', 'Nueva.Persona', api.clock.nowIsoTimestamp());
    const again = await startFlow(api);
    const entered = await callback(api, again.oauth, `code=${GOOGLE_CODE}&state=${again.state}`);
    expect(cookieNamed(entered, 'argos_session')).toContain('SameSite=Strict');
    const me = await api.call('GET', '/api/auth/me', { cookie: `argos_session=${valueOf(cookieNamed(entered, 'argos_session'))}` });
    expect((me.json as { user: { authMethods: unknown; email: string } }).user).toMatchObject({ email: GOOGLE_EMAIL, authMethods: { password: false, google: true } });
    // SC-008-062: no entra por contraseña.
    const login = await api.call('POST', '/api/auth/login', { body: { username: 'Nueva.Persona', password: '!no-password!' }, contract: false });
    expect(login.status).toBe(401);
  });

  it('exige el encabezado CSRF (403) y un cuerpo cerrado (422 de esquema), sin crear nada', async () => {
    const { api } = await boot();
    const oauth = await toUsername(api);
    expect((await api.call('POST', '/api/auth/google/username', { cookie: oauth, csrf: false, body: { username: 'nueva.persona', adultDeclaration: true } })).status).toBe(403);
    const closed = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'nueva.persona', adultDeclaration: true, role: 'PLATFORM_ADMIN' } });
    expect([closed.status, (closed.json as { code: string }).code]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  });

  it('un username ocupado responde 409 y conserva el estado para reintentar', async () => {
    const { api } = await boot();
    const oauth = await toUsername(api);
    expect((await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'andres', adultDeclaration: true } })).status).toBe(409);
    expect((await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'andres.google', adultDeclaration: true }, contract: false })).status).toBe(201);
  });

  it('sin cookie argos_oauth responde el 400 uniforme', async () => {
    const { api } = await boot();
    const r = await api.call('POST', '/api/auth/google/username', { body: { username: 'nueva.persona', adultDeclaration: true } });
    expect([r.status, (r.json as { code: string }).code]).toEqual([400, 'ERR-AUTH-GOOGLE-FAILED']);
  });

  it('SC-008-061: el límite de tasa de /username responde 429', async () => {
    const { api } = await boot();
    for (let i = 0; i < GOOGLE_AUTH_LIMITS.username.maxPerWindow; i += 1) expect((await api.call('POST', '/api/auth/google/username', { body: { username: 'nueva.persona', adultDeclaration: true } })).status).toBe(400);
    expect((await api.call('POST', '/api/auth/google/username', { body: { username: 'nueva.persona', adultDeclaration: true } })).status).toBe(429);
  });
});

describe('T1120 POST /api/auth/google/link (REQ-VIN8-002)', () => {
  it('[REQ-VIN8-002] exige sesión (401) y CSRF (403)', async () => {
    const { api } = await boot();
    expect((await api.call('POST', '/api/auth/google/link', { body: { currentPassword: PASSWORDS['andres']! } })).status).toBe(401);
    const session = await api.login('andres');
    expect((await api.call('POST', '/api/auth/google/link', { cookie: session, csrf: false, body: { currentPassword: PASSWORDS['andres']! } })).status).toBe(403);
  });

  it('con la contraseña actual devuelve la URL de Google en el cuerpo y la cookie argos_oauth Lax; con una incorrecta, 401', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const bad = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: 'MalaClave99' } });
    expect(bad.status).toBe(401);
    const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    expect(ok.status).toBe(200);
    expect((ok.json as { authorizationUrl: string }).authorizationUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(cookieNamed(ok, 'argos_oauth')).toContain('SameSite=Lax');
  });

  it('SC-008-061: el límite de tasa de link (por usuario) responde ERR-RATE-LIMITED (429) en la vinculación siguiente al cupo', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const link = () => api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    for (let i = 0; i < GOOGLE_AUTH_LIMITS.link.maxPerWindow; i += 1) expect((await link()).status).toBe(200);
    const limited = await link();
    expect(limited.status).toBe(429);
    expect((limited.json as { code: string }).code).toBe('ERR-RATE-LIMITED');
    expect(cookieNamed(limited, 'argos_oauth')).toBeUndefined();
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] flujo completo de vinculación: el callback vincula, conserva la sesión de origen, revoca las demás, NO emite Set-Cookie argos_session y /me muestra authMethods {password, google}', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const other = await api.login('andres');
    const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    const oauth = `argos_oauth=${valueOf(cookieNamed(ok, 'argos_oauth'))}`;
    const st = new URL((ok.json as { authorizationUrl: string }).authorizationUrl).searchParams.get('state')!;
    expect(cookieNamed(ok, 'argos_session')).toBeUndefined();
    const done = await callback(api, oauth, `code=${GOOGLE_CODE}&state=${st}`);
    expect(done.status).toBe(200);
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
    expect(cookieNamed(done, 'argos_oauth')).toContain('argos_oauth=;');
    expect((await api.call('GET', '/api/auth/me', { cookie: other })).status).toBe(401);
    const me = await api.call('GET', '/api/auth/me', { cookie: session });
    expect(me.status).toBe(200);
    expect((me.json as { user: { authMethods: unknown } }).user.authMethods).toEqual({ password: true, google: true });
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] si la sesión de origen se cerró durante el flujo, el callback LINK responde el 400 uniforme, sin vincular ni emitir cookie de sesión', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    const oauth = `argos_oauth=${valueOf(cookieNamed(ok, 'argos_oauth'))}`;
    const st = new URL((ok.json as { authorizationUrl: string }).authorizationUrl).searchParams.get('state')!;
    expect((await api.call('POST', '/api/auth/logout', { cookie: session })).status).toBe(204);
    const done = await callback(api, oauth, `code=${GOOGLE_CODE}&state=${st}`);
    expect(done.status).toBe(400);
    expect((done.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
    const again = await api.login('andres');
    const me = await api.call('GET', '/api/auth/me', { cookie: again });
    expect((me.json as { user: { authMethods: unknown } }).user.authMethods).toEqual({ password: true, google: false });
  });
});
