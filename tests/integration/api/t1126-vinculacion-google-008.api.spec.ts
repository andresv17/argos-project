import { afterEach, describe, expect, it } from 'vitest';
import { PASSWORDS, canonicalState } from '../../fixtures/application-harness.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, SequentialEntropy, fakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1125/T1126 (pruebas rojas, Feature 008, Bloque B, [GH:#17]): rutas HTTP de la vinculación segura de Google y del fallo uniforme (Google SIMULADO, SQLite real).
 * REQ-VIN8-001..004, INV-VIN8-001, INV-VIN8-002, INV-VIN8-005, EDGE-008-003, EDGE-008-004, EDGE-008-023, EDGE-008-050; SC-008-009..012, SC-008-014, SC-008-063.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

type Seed = (users: ReturnType<typeof canonicalState>['users']) => void;

async function boot(seed?: Seed) {
  const state = canonicalState();
  seed?.(state.users);
  const oidc = fakeGoogleOidc();
  api = await createApi(state, { google: { oidc, entropy: new SequentialEntropy() } });
  return { api, oidc };
}

const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
const stateOfUrl = (url: string): string => new URL(url).searchParams.get('state')!;
const callback = (a: Api, oauth: string | null, query: string) => a.call('GET', `/api/auth/google/callback?${query}`, { csrf: false, cookie: oauth });

async function loginFlow(a: Api) {
  const r = await a.call('GET', '/api/auth/google/start', { csrf: false });
  return { oauth: `argos_oauth=${valueOf(cookieNamed(r, 'argos_oauth'))}`, state: stateOfUrl(r.headers['location'] as string) };
}

const seedEmail = (username: string, email: string, verified: boolean): Seed => (users) => {
  const index = users.findIndex((u) => u.username === username);
  users[index] = { ...users[index]!, email, ...(verified ? { emailVerifiedAt: '2026-11-01T10:00:00.000Z' } : {}) };
};

describe('T1125 fallo uniforme por HTTP (INV-VIN8-001, REQ-VIN8-001; SC-008-009, SC-008-012)', () => {
  it('[INV-VIN8-001] correo titular verificado de otra cuenta: el callback responde el MISMO 400 (estado, cabeceras y cuerpo) que una cancelación, sin cookie de sesión y sin reflejar el correo', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    oidc.identity = { sub: 'sub-ajeno', email: GOOGLE_EMAIL };
    const holder = await loginFlow(api);
    const byEmail = await callback(api, holder.oauth, `code=${GOOGLE_CODE}&state=${holder.state}`);
    const cancelled = await loginFlow(api);
    const byCancel = await callback(api, cancelled.oauth, `error=access_denied&state=${cancelled.state}`);
    expect(byEmail.status).toBe(400);
    expect((byEmail.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(byEmail.status).toBe(byCancel.status);
    expect(byEmail.text).toBe(byCancel.text);
    expect(byEmail.headers['content-type']).toBe(byCancel.headers['content-type']);
    expect(byEmail.headers['cache-control']).toBe(byCancel.headers['cache-control']);
    expect(cookieNamed(byEmail, 'argos_session')).toBeUndefined();
    expect(byEmail.text).not.toMatch(/persona@|sub-ajeno|maria/i);
  });

  it('[EDGE-008-003] [EDGE-008-023] SC-008-012: con el correo de la víctima en una cuenta SIN verificar (pre-hijacking) la víctima crea su cuenta con Google; la cuenta del atacante conserva usuario y contraseña, pierde el correo y NO queda vinculada', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, false));
    oidc.identity = { sub: 'sub-victima', email: GOOGLE_EMAIL };
    const flow = await loginFlow(api);
    const step = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(step.status).toBe(200);
    const chosen = await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'victima.real', adultDeclaration: true }, contract: false });
    expect(chosen.status).toBe(201);
    expect(chosen.json).toEqual({ accountStatus: 'PENDING' }); // 009 (EDGE-009-006): sin sesión; el correo verificado se lee de la fila
    expect(api.db.prepare("SELECT email FROM users WHERE username = 'victima.real'").pluck().get()).toBe(GOOGLE_EMAIL);
    const attacker = await api.call('POST', '/api/auth/login', { body: { username: 'maria.v', password: PASSWORDS['maria.v']! } });
    expect(attacker.status).toBe(200);
    const me = await api.call('GET', '/api/auth/me', { cookie: attacker.cookie });
    expect((me.json as { user: { email: string | null; authMethods: unknown } }).user.email).toBeNull();
    expect((me.json as { user: { authMethods: unknown } }).user.authMethods).toEqual({ password: true, google: false });
  });
});

describe('T1126 vinculación por HTTP (REQ-VIN8-002, REQ-VIN8-004, INV-VIN8-002, INV-VIN8-005; SC-008-010..012, SC-008-014)', () => {
  it('[REQ-VIN8-002] SC-008-011: cinco contraseñas incorrectas en la vinculación usan el MISMO contador del acceso (REQ-LOG-001): el inicio de sesión con la contraseña correcta queda bloqueado y la vinculación siguiente no emite argos_oauth', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    for (let i = 0; i < 5; i += 1) expect((await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: `MalaClave${i}x` } })).status).toBe(401);
    const login = await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: PASSWORDS['andres']! } });
    expect((login.json as { code: string }).code).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS');
    const blocked = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    expect(blocked.status).toBe(429);
    // Por HTTP el límite de tasa de la ruta (5/15 min) precede al bloqueo por intentos: 429 ERR-RATE-LIMITED. ERR-AUTH-TOO-MANY-ATTEMPTS lo fijan el login de arriba y el unit de t1126.
    expect((blocked.json as { code: string }).code).toBe('ERR-RATE-LIMITED');
    expect(cookieNamed(blocked, 'argos_oauth')).toBeUndefined();
  });

  it('[INV-VIN8-002] [INV-VIN8-005] SC-008-014: un sub ya vinculado a otra cuenta no se vincula a una segunda: el callback falla uniforme y la segunda cuenta sigue sin Google', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-compartido', email: GOOGLE_EMAIL };
    const link = async (user: string) => {
      const session = await api.login(user);
      const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS[user]! } });
      const oauth = `argos_oauth=${valueOf(cookieNamed(ok, 'argos_oauth'))}`;
      return { session, done: await callback(api, oauth, `code=${GOOGLE_CODE}&state=${stateOfUrl((ok.json as { authorizationUrl: string }).authorizationUrl)}`) };
    };
    expect((await link('maria.v')).done.status).toBe(200);
    const second = await link('andres');
    expect(second.done.status).toBe(400);
    expect((second.done.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(cookieNamed(second.done, 'argos_session')).toBeUndefined();
    const me = await api.call('GET', '/api/auth/me', { cookie: second.session });
    expect((me.json as { user: { authMethods: unknown } }).user.authMethods).toEqual({ password: true, google: false });
  });

  it('[REQ-VIN8-004] [EDGE-008-050] SC-008-063: el callback LINK usado sin la cookie argos_oauth (otro navegador) responde el 400 uniforme y no vincula', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    const done = await callback(api, null, `code=${GOOGLE_CODE}&state=${stateOfUrl((ok.json as { authorizationUrl: string }).authorizationUrl)}`);
    expect(done.status).toBe(400);
    expect((done.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    const me = await api.call('GET', '/api/auth/me', { cookie: session });
    expect((me.json as { user: { authMethods: unknown } }).user.authMethods).toEqual({ password: true, google: false });
  });

  it('[REQ-VIN8-004] SC-008-063: la vinculación queda auditada como USER/UPDATE sin el correo ni el sub de Google', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-secreto-77', email: 'secreto@example.test' };
    const session = await api.login('andres');
    const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    const oauth = `argos_oauth=${valueOf(cookieNamed(ok, 'argos_oauth'))}`;
    const done = await callback(api, oauth, `code=${GOOGLE_CODE}&state=${stateOfUrl((ok.json as { authorizationUrl: string }).authorizationUrl)}`);
    expect(done.status).toBe(200);
    const dump = api.dump();
    // OBS-4: además de la prueba negativa, la fila de auditoría existe y es USER/UPDATE sobre la cuenta vinculada.
    const rows = api.db.prepare("SELECT mutation_type, entity_type, entity_id, executor_user_id FROM audit_log WHERE mutation_type = 'UPDATE' AND entity_type = 'USER'").all() as Array<{ entity_id: string; executor_user_id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entity_id).toBe(rows[0]!.executor_user_id);
    expect(dump).not.toContain('sub-secreto-77');
    expect(dump).not.toContain('secreto@example.test');
  });

  it('[INV-VIN8-002] SC-008-014 (decisión A): iniciar la vinculación con una cuenta que YA tiene Google responde 409 ERR-AUTH-GOOGLE-LINK-CONFLICT, sin cookie argos_oauth', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-andres', email: GOOGLE_EMAIL };
    const session = await api.login('andres');
    const ok = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    const oauth = `argos_oauth=${valueOf(cookieNamed(ok, 'argos_oauth'))}`;
    expect((await callback(api, oauth, `code=${GOOGLE_CODE}&state=${stateOfUrl((ok.json as { authorizationUrl: string }).authorizationUrl)}`)).status).toBe(200);
    const again = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS['andres']! } });
    expect(again.status).toBe(409);
    expect((again.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-LINK-CONFLICT');
    expect(cookieNamed(again, 'argos_oauth')).toBeUndefined();
  });
});
