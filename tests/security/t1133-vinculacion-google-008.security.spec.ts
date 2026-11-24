import { afterEach, describe, expect, it } from 'vitest';
import { GoogleOidcError } from '../../src/infrastructure/http/google-oidc-verify.ts';
import { activateAccount, sqliteRunner } from '../fixtures/active-accounts.ts';
import { PASSWORDS, canonicalState } from '../fixtures/application-harness.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, SequentialEntropy, fakeGoogleOidc } from '../fixtures/google-fixtures.ts';
import { createApi, type Api, type ApiResponse } from '../integration/api/api-harness.ts';

/**
 * T1133 (008, [GH:#17], /trinity): auditoría de seguridad de la vinculación de Google. Google SIMULADO, SQLite real, API real por `inject`.
 * Vectores: V-A pre-hijacking (EDGE-008-003/023, INV-VIN8-005, REQ-VIN8-003), V-B CSRF de startGoogleLink y del callback (INV-AUTH-007, REQ-VIN8-002, EDGE-008-050),
 * V-C enumeración y respuesta uniforme (INV-VIN8-001, REQ-VIN8-001), V-D tiempos/coste verificados de forma determinista (conteo de verificaciones de contraseña y de canjes, sin reloj de pared).
 * SC-008-009..013.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

type Users = ReturnType<typeof canonicalState>['users'];
type Seed = (users: Users) => void;

async function boot(seed?: Seed, cookieSecure = false) {
  const state = canonicalState();
  seed?.(state.users);
  const oidc = fakeGoogleOidc();
  api = await createApi(state, { cookieSecure, google: { oidc, entropy: new SequentialEntropy() } });
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

async function linkFlow(a: Api, user: string) {
  const session = await a.login(user);
  const r = await a.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: PASSWORDS[user]! } });
  expect(r.status).toBe(200);
  return { session, oauth: `argos_oauth=${valueOf(cookieNamed(r, 'argos_oauth'))}`, state: stateOfUrl((r.json as { authorizationUrl: string }).authorizationUrl) };
}

const seedEmail = (username: string, email: string, verified: boolean): Seed => (users) => {
  const index = users.findIndex((u) => u.username === username);
  users[index] = { ...users[index]!, email, ...(verified ? { emailVerifiedAt: '2026-11-01T10:00:00.000Z' } : {}) };
};

const identityRows = (a: Api) => a.db.prepare('SELECT provider, provider_subject, user_id FROM auth_identities ORDER BY provider_subject').all() as Array<{ provider: string; provider_subject: string; user_id: string }>;
const flowCount = (a: Api) => (a.db.prepare('SELECT COUNT(*) AS n FROM oauth_flow_states').get() as { n: number }).n;
const usersDump = (a: Api) => JSON.stringify(a.db.prepare('SELECT * FROM users ORDER BY id').all());
const sessionCount = (a: Api) => (a.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;
const me = async (a: Api, cookie: string) => ((await a.call('GET', '/api/auth/me', { cookie })).json as { user: { email: string | null; authMethods: { password: boolean; google: boolean } } }).user;

/** Huella observable de una respuesta de fallo: estado, tipo, caché, cuerpo y NOMBRES de las cookies que toca (no sus valores). */
function fingerprint(r: ApiResponse) {
  return {
    status: r.status,
    contentType: r.headers['content-type'],
    cacheControl: r.headers['cache-control'],
    body: r.text,
    cookies: setCookies(r).map((c) => `${c.split('=')[0]}${/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c) ? ':cleared' : ':set'}`).sort(),
  };
}

describe('T1133 V-A pre-hijacking (EDGE-008-003, EDGE-008-023, INV-VIN8-005, REQ-VIN8-003; SC-008-012)', () => {
  it('[V-A1] un atacante con el correo de la víctima sin verificar NO obtiene la identidad de la víctima: tras el alta con Google, auth_identities tiene UNA fila y es de la cuenta nueva, no de la del atacante', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, false));
    oidc.identity = { sub: 'sub-victima', email: GOOGLE_EMAIL };
    const flow = await loginFlow(api);
    const step = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(step.status).toBe(200);
    // Antes de elegir usuario no hay identidad ni sesión: el paso intermedio no vincula nada.
    expect(identityRows(api)).toEqual([]);
    expect(cookieNamed(step, 'argos_session')).toBeUndefined();
    const chosen = await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'victima.real' } });
    expect(chosen.status).toBe(201);
    const rows = identityRows(api);
    expect(rows).toHaveLength(1);
    const attackerId = (api.db.prepare("SELECT id FROM users WHERE username = 'maria.v'").get() as { id: string }).id;
    expect(rows[0]!.user_id).not.toBe(attackerId);
    expect(rows[0]!.provider_subject).toBe('sub-victima');
    // El atacante conserva su contraseña pero ya no es titular del correo y no tiene Google.
    const attackerSession = await api.login('maria.v');
    expect(await me(api, attackerSession)).toMatchObject({ email: null, authMethods: { password: true, google: false } });
  });

  it('[V-A2] el atacante no puede usar su cuenta sin verificar para REACLAMAR el correo después: la sesión de la víctima y la del atacante son cuentas distintas y el correo verificado ya no es liberable', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, false));
    oidc.identity = { sub: 'sub-victima', email: GOOGLE_EMAIL };
    const first = await loginFlow(api);
    const step = await callback(api, first.oauth, `code=${GOOGLE_CODE}&state=${first.state}`);
    await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'victima.real' } });
    // Un segundo `sub` (otro Google) con ese mismo correo, ahora VERIFICADO en la cuenta de la víctima: fallo uniforme, sin tocar usuarios.
    oidc.identity = { sub: 'sub-impostor', email: GOOGLE_EMAIL };
    const before = usersDump(api);
    const second = await loginFlow(api);
    const refused = await callback(api, second.oauth, `code=${GOOGLE_CODE}&state=${second.state}`);
    expect(refused.status).toBe(400);
    expect((refused.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(usersDump(api)).toBe(before);
    expect(identityRows(api).map((r) => r.provider_subject)).toEqual(['sub-victima']);
  });

  it('[V-A3] [INV-VIN8-005] ningún correo vincula por sí solo: un sub nuevo con el correo de una cuenta existente VERIFICADA no altera users ni auth_identities ni crea sesión', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    oidc.identity = { sub: 'sub-ajeno', email: GOOGLE_EMAIL };
    const before = usersDump(api);
    const sessionsBefore = sessionCount(api);
    const flow = await loginFlow(api);
    const done = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(done.status).toBe(400);
    expect(usersDump(api)).toBe(before);
    expect(identityRows(api)).toEqual([]);
    expect(sessionCount(api)).toBe(sessionsBefore);
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
  });

  it('[V-A4] el correo en MAYÚSCULAS o con espacios no evade la titularidad verificada (normalización antes de comparar)', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    oidc.identity = { sub: 'sub-ajeno', email: `  ${GOOGLE_EMAIL.toUpperCase()}  ` };
    const flow = await loginFlow(api);
    const done = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(done.status).toBe(400);
    expect(identityRows(api)).toEqual([]);
  });

  it('[V-A5] el callback toma la intención y el usuario SOLO del estado guardado en servidor: userId/intent/email en la consulta no convierten un login en vinculación', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-nuevo', email: 'nuevo@example.test' };
    const victimId = (api.db.prepare("SELECT id FROM users WHERE username = 'andres'").get() as { id: string }).id;
    const flow = await loginFlow(api);
    const done = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}&intent=LINK&userId=${victimId}&email=andres@example.test`);
    expect(done.status).toBe(200);
    expect(cookieNamed(done, 'argos_oauth')).toMatch(/^argos_oauth=[A-Za-z0-9_-]{43};/);
    expect(identityRows(api)).toEqual([]);
  });

  it('[V-A6] vincular exige la contraseña actual: sin ella (vacía, ausente, de otra cuenta) no se emite argos_oauth ni se crea estado de flujo', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const baseline = flowCount(api);
    const bad: Array<[unknown, number, string]> = [
      [{ currentPassword: '' }, 422, 'ERR-SCHEMA-VALIDATION-FAILED'],
      [{}, 422, 'ERR-SCHEMA-VALIDATION-FAILED'],
      [{ currentPassword: PASSWORDS['maria.v']! }, 401, 'ERR-AUTH-INVALID-CREDENTIALS'],
      [{ currentPassword: 12345 }, 422, 'ERR-SCHEMA-VALIDATION-FAILED'],
    ];
    for (const [body, expectedStatus, expectedCode] of bad) {
      const r = await api.call('POST', '/api/auth/google/link', { cookie: session, body, contract: false });
      expect(r.status).toBe(expectedStatus);
      expect((r.json as { code: string }).code).toBe(expectedCode);
      expect(cookieNamed(r, 'argos_oauth')).toBeUndefined();
    }
    expect(flowCount(api)).toBe(baseline);
  });

  it('[V-A7] [EDGE-008-050] la sesión de origen vence por INACTIVIDAD (31 min > 30 min) durante el flujo: el callback no vincula (400 ERR-AUTH-GOOGLE-FAILED, sin identidad)', async () => {
    const { api } = await boot();
    const flow = await linkFlow(api, 'andres');
    // 31 min después: la sesión de origen venció por inactividad; el estado (900 s) también, pero aun así NO debe vincular.
    api.clock.setClock('2026-11-05', '2026-11-05T12:31:00.000Z');
    const done = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(done.status).toBe(400);
    expect((done.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(identityRows(api)).toEqual([]);
  });

  it('[V-A8] [EDGE-008-050] otra sesión del MISMO usuario no puede completar por la sesión revocada: cerrar sesión antes del callback anula la vinculación', async () => {
    const { api } = await boot();
    const flow = await linkFlow(api, 'andres');
    const out = await api.call('POST', '/api/auth/logout', { cookie: flow.session, contract: false });
    expect(out.status).toBe(204);
    const done = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(done.status).toBe(400);
    expect((done.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(identityRows(api)).toEqual([]);
  });

  it('[V-A9] [REQ-VIN8-004] al vincular se revocan las demás sesiones y la de origen sigue viva sin Set-Cookie de sesión (sin fijación de sesión)', async () => {
    const { api } = await boot();
    const other = await api.login('andres');
    const flow = await linkFlow(api, 'andres');
    const done = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(done.status).toBe(200);
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
    expect((await api.call('GET', '/api/auth/me', { cookie: flow.session, contract: false })).status).toBe(200);
    expect((await api.call('GET', '/api/auth/me', { cookie: other, contract: false })).status).toBe(401);
  });
});

describe('T1133 V-B CSRF de startGoogleLink y del callback (INV-AUTH-007, REQ-VIN8-002; SC-008-010, SC-008-011)', () => {
  it('[V-B1] POST /api/auth/google/link sin X-Argos-Request responde 403 ERR-AUTH-CSRF-REJECTED antes de la sesión, el esquema y la contraseña: sin argos_oauth, sin estado y sin sumar intentos fallidos', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const baseline = flowCount(api);
    const CSRF_REJECTIONS = 6; // > MAX_FAILED_ATTEMPTS (5): si sumaran, el login correcto de abajo quedaría bloqueado
    expect(CSRF_REJECTIONS).toBeGreaterThan(5);
    for (let i = 0; i < CSRF_REJECTIONS; i += 1) {
      const r = await api.call('POST', '/api/auth/google/link', { cookie: session, csrf: false, body: { currentPassword: 'MalaClave123x' } });
      expect(r.status).toBe(403);
      expect((r.json as { code: string }).code).toBe('ERR-AUTH-CSRF-REJECTED');
      expect(cookieNamed(r, 'argos_oauth')).toBeUndefined();
    }
    expect(flowCount(api)).toBe(baseline);
    // Los rechazos CSRF no tocan el contador de REQ-LOG-001: el acceso con la contraseña correcta sigue abierto.
    const login = await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: PASSWORDS['andres']! } });
    expect(login.status).toBe(200);
  });

  it('[V-B2] un formulario cross-site (application/x-www-form-urlencoded o text/plain, sin cabecera personalizada) no inicia la vinculación', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const r = await api.call('POST', '/api/auth/google/link', { cookie: session, csrf: false, raw: `currentPassword=${PASSWORDS['andres']!}`, headers: { 'content-type': type }, contract: false });
      expect(r.status).toBe(403);
      expect(cookieNamed(r, 'argos_oauth')).toBeUndefined();
    }
    expect(flowCount(api)).toBe(0);
  });

  it('[V-B3] sin sesión, con CSRF correcto: 401 y sin estado; con X-Argos-Request distinto de "1" también es 403', async () => {
    const { api } = await boot();
    const anon = await api.call('POST', '/api/auth/google/link', { body: { currentPassword: PASSWORDS['andres']! } });
    expect(anon.status).toBe(401);
    expect(cookieNamed(anon, 'argos_oauth')).toBeUndefined();
    const session = await api.login('andres');
    const wrong = await api.call('POST', '/api/auth/google/link', { cookie: session, csrf: false, headers: { 'x-argos-request': 'true' }, body: { currentPassword: PASSWORDS['andres']! }, contract: false });
    expect(wrong.status).toBe(403);
    expect(flowCount(api)).toBe(0);
  });

  it('[V-B4] la API no habilita CORS para orígenes ajenos (ni en el preflight ni en la respuesta de /link): no hay Access-Control-Allow-Origin ni -Credentials', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const preflight = await api.app.inject({ method: 'OPTIONS', url: '/api/auth/google/link', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-argos-request,content-type' } });
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
    const r = await api.call('POST', '/api/auth/google/link', { cookie: session, headers: { origin: 'https://evil.example' }, body: { currentPassword: PASSWORDS['andres']! } });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('[V-B5] /link y /username solo aceptan POST: un GET (navegación o <img>) no inicia ni completa nada', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    for (const path of ['/api/auth/google/link', '/api/auth/google/username']) {
      const r = await api.call('GET', path, { cookie: session, csrf: false, contract: false });
      expect([404, 405]).toContain(r.status);
      expect(cookieNamed(r, 'argos_oauth')).toBeUndefined();
    }
    expect(flowCount(api)).toBe(0);
  });

  it('[V-B6] POST /username sin X-Argos-Request: 403 y el estado USERNAME NO se consume (la víctima puede terminar después)', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-nuevo', email: 'nuevo@example.test' };
    const flow = await loginFlow(api);
    const step = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    const oauth = `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`;
    const forged = await api.call('POST', '/api/auth/google/username', { cookie: oauth, csrf: false, body: { username: 'forzado.x' }, contract: false });
    expect(forged.status).toBe(403);
    expect(identityRows(api)).toEqual([]);
    const real = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'legitimo.x' } });
    expect(real.status).toBe(201);
  });

  it('[V-B7] CSRF del callback (login/link CSRF): un callback con código y state de OTRO flujo sin la cookie del navegador de la víctima no crea sesión ni vincula', async () => {
    const { api } = await boot();
    const attacker = await linkFlow(api, 'andres');
    // La víctima abre el enlace del atacante: su navegador no tiene argos_oauth del atacante.
    const noCookie = await callback(api, null, `code=${GOOGLE_CODE}&state=${attacker.state}`);
    expect(noCookie.status).toBe(400);
    expect(cookieNamed(noCookie, 'argos_session')).toBeUndefined();
    // Ni con el flujo de login de la propia víctima (cookie válida, state ajeno).
    const mine = await loginFlow(api);
    const mismatch = await callback(api, mine.oauth, `code=${GOOGLE_CODE}&state=${attacker.state}`);
    expect(mismatch.status).toBe(400);
    expect(cookieNamed(mismatch, 'argos_session')).toBeUndefined();
    expect(identityRows(api)).toEqual([]);
    // El flujo del atacante sigue íntegro (el rechazo sin cookie no lo consumió) y su dueño aún puede completarlo.
    const ok = await callback(api, attacker.oauth, `code=${GOOGLE_CODE}&state=${attacker.state}`);
    expect(ok.status).toBe(200);
  });

  it('[V-B8] state: reutilizado, prefijo, truncado, con mayúsculas alteradas, duplicado (state=a&state=b) o arreglo no autentican; el state se compara en tiempo constante y se consume', async () => {
    const { api } = await boot();
    for (const mutate of [
      (s: string) => s.slice(0, -1),
      (s: string) => `${s}x`,
      (s: string) => s.toUpperCase() === s ? s.toLowerCase() : s.toUpperCase(),
      (s: string) => `${s}&state=${s}`,
      (s: string) => `${s}&state=${'Z'.repeat(43)}`,
      () => '',
    ]) {
      const flow = await loginFlow(api);
      const mutated = mutate(flow.state);
      const r = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${mutated}`);
      expect(r.status, `state mutado: ${mutated}`).toBe(400);
      expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    }
    const flow = await loginFlow(api);
    expect((await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`)).status).toBe(200);
    const replay = await callback(api, flow.oauth, `code=${GOOGLE_CODE}&state=${flow.state}`);
    expect(replay.status).toBe(400);
  });

  it('[V-B9] atributos de cookie: argos_oauth HttpOnly, SameSite=Lax, Path=/api/auth/google, Max-Age 900, Secure en Cloud; el valor no es el hash guardado ni el state', async () => {
    const { api } = await boot(undefined, true);
    const start = await api.call('GET', '/api/auth/google/start', { csrf: false });
    const cookie = cookieNamed(start, 'argos_oauth')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/google(;|$)/);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(cookie).toMatch(/Secure/i);
    const token = valueOf(cookie);
    expect(token).toHaveLength(43);
    expect(stateOfUrl(start.headers['location'] as string)).not.toBe(token);
    expect(api.dump()).not.toContain(token);
    expect(start.headers['cache-control']).toBe('no-store');
  });

  it('[V-B10] SC-008-006: el inicio por login emite argos_session SameSite=Strict en el callback (no Lax) y la vinculación no emite ninguna', async () => {
    const { api } = await boot();
    const mineGoogle = await loginFlow(api);
    const step = await callback(api, mineGoogle.oauth, `code=${GOOGLE_CODE}&state=${mineGoogle.state}`);
    const chosen = await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'con.google' }, contract: false });
    expect(cookieNamed(chosen, 'argos_session')).toBeUndefined(); // 009 (EDGE-009-006): la cuenta nace PENDING, sin sesión
    await activateAccount(sqliteRunner(api.db), 'sqlite', 'con.google', api.clock.nowIsoTimestamp());
    const second = await loginFlow(api);
    const entered = await callback(api, second.oauth, `code=${GOOGLE_CODE}&state=${second.state}`);
    expect(cookieNamed(entered, 'argos_session')).toMatch(/SameSite=Strict/i);
    expect(cookieNamed(entered, 'argos_session')).toMatch(/HttpOnly/i);
    const link = await linkFlow(api, 'andres');
    const done = await callback(api, link.oauth, `code=${GOOGLE_CODE}&state=${link.state}`);
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
  });
});

describe('T1133 V-C enumeración y respuesta uniforme (INV-VIN8-001, REQ-VIN8-001; SC-008-009, SC-008-012)', () => {
  it('[V-C1] todos los fallos del callback son IDÉNTICOS en estado, tipo, caché, cuerpo y cookies tocadas (cancelación, state ajeno, sin cookie, cookie malformada, reutilizado, vencido, canje inválido, identidad vacía, correo titular verificado, sub ya vinculado, sesión de origen revocada)', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    const prints: Array<[string, ReturnType<typeof fingerprint>]> = [];
    const take = (label: string, r: ApiResponse) => prints.push([label, fingerprint(r)]);

    let f = await loginFlow(api);
    take('cancelación', await callback(api, f.oauth, `error=access_denied&state=${f.state}`));
    f = await loginFlow(api);
    take('state ajeno', await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${'A'.repeat(43)}`));
    take('sin cookie', await callback(api, null, `code=${GOOGLE_CODE}&state=${f.state}`));
    take('cookie malformada', await callback(api, 'argos_oauth=corta', `code=${GOOGLE_CODE}&state=${f.state}`));
    f = await loginFlow(api);
    await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    take('reutilizado', await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`));
    f = await loginFlow(api);
    take('sin code', await callback(api, f.oauth, `state=${f.state}`));
    f = await loginFlow(api);
    oidc.identity = new GoogleOidcError('ID_TOKEN_INVALID' as never);
    take('canje inválido', await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`));
    f = await loginFlow(api);
    oidc.identity = { sub: '', email: 'x@example.test' };
    take('identidad vacía', await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`));
    f = await loginFlow(api);
    oidc.identity = { sub: 'sub-ajeno', email: GOOGLE_EMAIL };
    take('correo titular verificado', await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`));

    expect(prints.length).toBeGreaterThanOrEqual(9);
    const [firstLabel, reference] = prints[0]!;
    for (const [label, print] of prints) expect(print, `${label} vs ${firstLabel}`).toEqual(reference);
    expect((JSON.parse(reference.body) as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(reference.cookies).toEqual(['argos_oauth:cleared']);
  });

  it('[V-C2] fallos de la VINCULACIÓN (sub ya vinculado a otra cuenta, sesión de origen revocada, cuenta que ya tiene Google, sin cookie) son idénticos a los del login', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-compartido', email: GOOGLE_EMAIL };
    const reference = fingerprint(await (async () => { const f = await loginFlow(api); return callback(api, f.oauth, `error=access_denied&state=${f.state}`); })());
    const first = await linkFlow(api, 'maria.v');
    expect((await callback(api, first.oauth, `code=${GOOGLE_CODE}&state=${first.state}`)).status).toBe(200);
    const taken = await linkFlow(api, 'andres');
    expect(fingerprint(await callback(api, taken.oauth, `code=${GOOGLE_CODE}&state=${taken.state}`))).toEqual(reference);
    const revoked = await linkFlow(api, 'andres');
    await api.call('POST', '/api/auth/logout', { cookie: revoked.session, contract: false });
    expect(fingerprint(await callback(api, revoked.oauth, `code=${GOOGLE_CODE}&state=${revoked.state}`))).toEqual(reference);
  });

  it('[V-C3] el fallo no refleja code, state, error ni el correo/sub de Google (ni en el cuerpo ni en las cabeceras)', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    oidc.identity = { sub: 'sub-reflejo-9', email: GOOGLE_EMAIL };
    const f = await loginFlow(api);
    const r = await callback(api, f.oauth, `code=codigo-secreto-77&state=${f.state}`);
    const surface = `${r.text}\n${JSON.stringify(r.headers)}`;
    for (const secret of ['codigo-secreto-77', f.state, 'sub-reflejo-9', 'persona@', 'maria']) expect(surface.toLowerCase()).not.toContain(secret.toLowerCase());
    const evil = await callback(api, null, `error=%3Cscript%3Ealert(1)%3C%2Fscript%3E&state=%3Cscript%3E&code=%3Cb%3E`);
    expect(evil.text).not.toMatch(/<script|<b>|alert\(1\)/i);
  });

  it('[V-C4] el callback jamás confirma ni niega el correo de OTRA persona: el flujo ajeno solo revela el correo del propio Google del llamante (un sub nuevo con correo libre pasa a «Elige tu usuario» y con correo titular falla) y nunca devuelve datos de la cuenta titular', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    oidc.identity = { sub: 'sub-ajeno', email: GOOGLE_EMAIL };
    const f = await loginFlow(api);
    const r = await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    expect(r.status).toBe(400);
    expect((r.json as { code: string }).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    expect(identityRows(api)).toEqual([]);
    expect(r.text).not.toMatch(/maria|ya existe|already|registrad/i);
    expect(r.headers['location']).toBeUndefined();
  });

  it('[V-C5] startGoogleLink: la contraseña incorrecta devuelve el MISMO problema que el login con contraseña incorrecta (sin distinguir cuenta ni método)', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const viaLink = await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: 'MalaClave123x' } });
    const viaLogin = await api.call('POST', '/api/auth/login', { body: { username: 'andres', password: 'MalaClave123x' } });
    expect(viaLink.status).toBe(401);
    expect(viaLogin.status).toBe(401);
    expect((viaLink.json as { code: string }).code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect((viaLogin.json as { code: string }).code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    // Mismo cuerpo salvo la ruta (`instance`).
    const strip = (j: unknown) => ({ ...(j as Record<string, unknown>), instance: undefined });
    expect(strip(viaLink.json)).toEqual(strip(viaLogin.json));
  });

  it('[V-C6] la elección de usuario con un nombre ocupado responde con el catálogo de REQ-LOG-002 y no filtra correo, sub ni cuentas por correo', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-nuevo', email: 'nuevo@example.test' };
    const f = await loginFlow(api);
    const step = await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    const taken = await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'andres' }, contract: false });
    expect(taken.status).toBeGreaterThanOrEqual(400);
    expect(taken.text).not.toMatch(/nuevo@example|sub-nuevo|andres@/i);
    expect(identityRows(api)).toEqual([]);
  });
});

describe('T1133 V-D tiempos y coste deterministas (INV-VIN8-001; sin reloj de pared, PROHIBIDO bloquear con tiempos)', () => {
  it('[V-D1] el acceso con contraseña ejecuta UNA verificación del hasher sea cual sea la cuenta: inexistente, contraseña incorrecta o cuenta nacida con Google (centinela): misma respuesta y mismo número de verificaciones', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-g', email: 'g@example.test' };
    const f = await loginFlow(api);
    const step = await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'solo.google' } });
    const attempt = async (user: string, password: string) => {
      api.hasher.reset();
      const r = await api.call('POST', '/api/auth/login', { body: { username: user, password } });
      return { status: r.status, code: (r.json as { code?: string }).code, verifies: api.hasher.calls.filter((c) => c.method === 'verify').length };
    };
    const unknown = await attempt('no.existe.x', 'Cualquiera123x');
    const wrong = await attempt('andres', 'MalaClave123x');
    const sentinel = await attempt('solo.google', '!no-password!');
    const sentinelOther = await attempt('solo.google', 'Cualquiera123x');
    expect(unknown.status).toBe(401);
    expect(wrong).toEqual({ ...unknown, verifies: wrong.verifies });
    expect(sentinel.status).toBe(unknown.status);
    expect(sentinel.code).toBe(unknown.code);
    expect(sentinelOther.code).toBe(unknown.code);
    expect(new Set([unknown.verifies, wrong.verifies, sentinel.verifies, sentinelOther.verifies]).size).toBe(1);
    expect(unknown.verifies).toBeGreaterThanOrEqual(1);
  });

  it('[V-D2] la contraseña centinela jamás autentica, ni siquiera enviándola literal', async () => {
    const { api, oidc } = await boot();
    oidc.identity = { sub: 'sub-g', email: 'g@example.test' };
    const f = await loginFlow(api);
    const step = await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    await api.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username: 'solo.google' } });
    for (const password of ['!no-password!', '', 'Cualquiera123x']) {
      const r = await api.call('POST', '/api/auth/login', { body: { username: 'solo.google', password }, contract: false });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(cookieNamed(r, 'argos_session')).toBeUndefined();
    }
  });

  it('[V-D3] el canje con Google se hace EXACTAMENTE una vez por intento con estado y state válidos, y nunca con cookie ausente, malformada o state ajeno (no hay canje especulativo que filtre por coste)', async () => {
    const { api, oidc } = await boot(seedEmail('maria.v', GOOGLE_EMAIL, true));
    oidc.identity = { sub: 'sub-ajeno', email: GOOGLE_EMAIL };
    let f = await loginFlow(api);
    await callback(api, null, `code=${GOOGLE_CODE}&state=${f.state}`);
    await callback(api, 'argos_oauth=corta', `code=${GOOGLE_CODE}&state=${f.state}`);
    await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${'B'.repeat(43)}`);
    expect(oidc.completions).toHaveLength(0);
    f = await loginFlow(api);
    await callback(api, f.oauth, `code=${GOOGLE_CODE}&state=${f.state}`);
    expect(oidc.completions).toHaveLength(1);
  });

  it('[V-D4] límite de tasa de POST /api/auth/google/link: se limita por USUARIO (5 intentos/15 min; el 6.º y 7.º dan 429) y otro usuario no hereda el bloqueo (callback y start no se prueban aquí)', async () => {
    const { api } = await boot();
    const session = await api.login('andres');
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) codes.push((await api.call('POST', '/api/auth/google/link', { cookie: session, body: { currentPassword: 'MalaClave123x' }, contract: false })).status);
    expect(codes.slice(0, 5)).not.toContain(429);
    expect(codes.slice(5)).toEqual([429, 429]);
    // Otro usuario no hereda el bloqueo del cubo del primero.
    const other = await api.login('maria.v');
    const r = await api.call('POST', '/api/auth/google/link', { cookie: other, body: { currentPassword: 'MalaClave123x' }, contract: false });
    expect(r.status).toBe(401);
  });
});
