import { afterEach, describe, expect, it } from 'vitest';
import { GOOGLE_AUTH_LIMITS } from '../../../src/infrastructure/config/google-auth-config.ts';
import { PASSWORDS, canonicalState } from '../../fixtures/application-harness.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, GOOGLE_SUB, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { NEW_PET } from './api-fixtures.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1218 y T1284 (pruebas rojas, Feature 009, Fase 2, deuda #17 / `DEUDA-008-GOOGLE-ACCOUNT-DELETE`): eliminación de una cuenta nacida con Google con reautenticación reciente
 * (Google SIMULADO, SQLite real, migración 0018 incluida). REQ-DEL9-001, INV-DEL9-001, REQ-ACC-002, EDGE-009-031, EDGE-009-032, EDGE-009-049; SC-009-044, SC-009-045.
 * Las dos rutas nuevas (`POST /api/account/deletion/reauth` y `POST /api/account/deletion/google`) viven en `admin.openapi.yaml` de la 009, no en el OpenAPI 3.4.0 que valida
 * el arnés por defecto: sus llamadas usan `contract: false` y el esquema de la respuesta se afirma a mano.
 */

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const PHRASE = 'ELIMINAR MI CUENTA';
const REAUTH_REQUIRED = { status: 403, code: 'ERR-ACCOUNT-DELETE-REAUTH-REQUIRED' };

async function boot(): Promise<{ a: Api; oidc: FakeGoogleOidc }> {
  const oidc = fakeGoogleOidc();
  const a = await createApi(canonicalState(), { google: { oidc, entropy: new SequentialEntropy() } });
  api = a;
  return { a, oidc };
}

const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
const stateOfUrl = (url: string): string => new URL(url).searchParams.get('state')!;
const callback = (a: Api, oauth: string | null, query: string) => a.call('GET', `/api/auth/google/callback?${query}`, { csrf: false, cookie: oauth });
const problem = (r: ApiResponse): { status: number; code: string } => ({ status: r.status, code: (r.json as { code: string }).code });
const nowSeconds = (a: Api): number => Date.parse(a.clock.nowIsoTimestamp()) / 1000;
const advance = (a: Api, seconds: number): void => {
  const next = new Date(Date.parse(a.clock.nowIsoTimestamp()) + seconds * 1000).toISOString();
  a.clock.setClock(next.slice(0, 10), next);
};

/** Inicio de sesión con Google de un `sub` ya registrado: devuelve la cookie `argos_session` nueva. */
async function googleLogin(a: Api): Promise<string> {
  const start = await a.call('GET', '/api/auth/google/start', { csrf: false });
  const done = await callback(a, `argos_oauth=${valueOf(cookieNamed(start, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl(start.headers['location'] as string)}`);
  return `argos_session=${valueOf(cookieNamed(done, 'argos_session'))}`;
}

/** Cuenta nacida con Google (sin contraseña): primer acceso + elección de usuario. Devuelve la cookie de sesión y el id. */
async function bornWithGoogle(a: Api, username = 'gina.google'): Promise<{ session: string; userId: string }> {
  const start = await a.call('GET', '/api/auth/google/start', { csrf: false });
  const step = await callback(a, `argos_oauth=${valueOf(cookieNamed(start, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl(start.headers['location'] as string)}`);
  const chosen = await a.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username } });
  expect(chosen.status).toBe(201);
  return { session: `argos_session=${valueOf(cookieNamed(chosen, 'argos_session'))}`, userId: (chosen.json as { user: { id: string } }).user.id };
}

const startReauth = (a: Api, session: string | null) => a.call('POST', '/api/account/deletion/reauth', { ...(session === null ? {} : { cookie: session }), contract: false });
const deleteWithGoogle = (a: Api, session: string | null, body: unknown = { confirmationPhrase: PHRASE }) =>
  a.call('POST', '/api/account/deletion/google', { ...(session === null ? {} : { cookie: session }), body, contract: false });

/** Reautenticación completa: inicio, autenticación reciente simulada y retorno por el callback de 008. Devuelve la respuesta del callback. */
async function reauthenticate(a: Api, oidc: FakeGoogleOidc, session: string, ageSeconds = 3): Promise<{ started: ApiResponse; done: ApiResponse }> {
  const started = await startReauth(a, session);
  expect(started.status).toBe(200);
  oidc.authTimeSeconds = nowSeconds(a) - ageSeconds;
  const done = await callback(a, `argos_oauth=${valueOf(cookieNamed(started, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl((started.json as { authorizationUrl: string }).authorizationUrl)}`);
  return { started, done };
}

const count = (a: Api, sql: string, ...params: string[]): number => (a.db.prepare(sql).get(...params) as { n: number }).n;
const userRows = (a: Api, userId: string): number =>
  count(a, 'SELECT (SELECT COUNT(*) FROM users WHERE id = ?) + (SELECT COUNT(*) FROM auth_identities WHERE user_id = ?) + (SELECT COUNT(*) FROM oauth_flow_states WHERE user_id = ?) + (SELECT COUNT(*) FROM sessions WHERE user_id = ?) AS n', userId, userId, userId, userId);

describe('T1218 inicio de la reautenticación (REQ-DEL9-001, INV-DEL9-001; SC-009-044)', () => {
  it('[REQ-DEL9-001] la cuenta sin contraseña recibe la URL de Google con max_age y prompt=login, state, nonce y PKCE S256, y la cookie argos_oauth (Lax, Path=/api/auth/google, 900 s) con solo un identificador opaco', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    const started = await startReauth(a, session);
    expect(started.status).toBe(200);
    const url = new URL((started.json as { authorizationUrl: string }).authorizationUrl);
    expect(Object.keys(started.json as object)).toEqual(['authorizationUrl']);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('max_age')).toMatch(/^\d+$/);
    expect(url.searchParams.get('prompt')).toBe('login');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oidc.authorizations.at(-1)?.maxAgeSeconds).toBe(Number(url.searchParams.get('max_age')));
    const cookie = cookieNamed(started, 'argos_oauth')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/google/);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(started.headers['cache-control']).toBe('no-store');
    expect(cookieNamed(started, 'argos_session')).toBeUndefined();
  });

  it('[REQ-DEL9-001] sin cabecera CSRF responde 403 ERR-AUTH-CSRF-REJECTED y sin sesión 401 ERR-AUTH-UNAUTHENTICATED', async () => {
    const { a } = await boot();
    const { session } = await bornWithGoogle(a);
    const noCsrf = await a.call('POST', '/api/account/deletion/reauth', { cookie: session, csrf: false, contract: false });
    const noSession = await startReauth(a, null);
    expect([problem(noCsrf), problem(noSession)]).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });

  it('[REQ-DEL9-001] [EDGE-009-032] una cuenta CON contraseña recibe el mismo 403 uniforme y no se emite argos_oauth', async () => {
    const { a } = await boot();
    const session = await a.login('andres');
    const started = await startReauth(a, session);
    expect(problem(started)).toEqual(REAUTH_REQUIRED);
    expect(cookieNamed(started, 'argos_oauth')).toBeUndefined();
  });

  it('[REQ-DEL9-001] un cuerpo no vacío se rechaza con 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    const { a } = await boot();
    const { session } = await bornWithGoogle(a);
    const r = await a.call('POST', '/api/account/deletion/reauth', { cookie: session, body: { password: 'x' }, contract: false });
    expect(problem(r)).toEqual({ status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' });
  });
});

describe('T1218 retorno de Google de la reautenticación (INV-DEL9-001, EDGE-009-031; SC-009-045)', () => {
  it('[REQ-DEL9-001] el retorno válido responde 200 sin emitir argos_session ni borrar nada (solo deja la prueba)', async () => {
    const { a, oidc } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    const { done } = await reauthenticate(a, oidc, session);
    expect(done.status).toBe(200);
    expect(cookieNamed(done, 'argos_session')).toBeUndefined();
    expect(count(a, 'SELECT COUNT(*) AS n FROM users WHERE id = ?', userId)).toBe(1);
  });

  it('[INV-DEL9-001] autenticación NO reciente (auth_time anterior a max_age) o sin auth_time: el retorno falla con el 400 uniforme y la eliminación sigue rechazada', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    const stale = await reauthenticate(a, oidc, session, 24 * 3600);
    expect([stale.done.status, (stale.done.json as { code: string }).code]).toEqual([400, 'ERR-AUTH-GOOGLE-FAILED']);
    const started = await startReauth(a, session);
    oidc.authTimeSeconds = undefined;
    const missing = await callback(a, `argos_oauth=${valueOf(cookieNamed(started, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl((started.json as { authorizationUrl: string }).authorizationUrl)}`);
    expect([missing.status, (missing.json as { code: string }).code]).toEqual([400, 'ERR-AUTH-GOOGLE-FAILED']);
    expect(problem(await deleteWithGoogle(a, session))).toEqual(REAUTH_REQUIRED);
  });

  it('[INV-DEL9-001] otro sub de Google (no el vinculado a la cuenta) no acredita la titularidad: 400 uniforme y la eliminación sigue rechazada', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    oidc.identity = { sub: 'sub-de-otra-persona', email: 'otra@example.test' };
    const { done } = await reauthenticate(a, oidc, session);
    expect([done.status, (done.json as { code: string }).code]).toEqual([400, 'ERR-AUTH-GOOGLE-FAILED']);
    expect(problem(await deleteWithGoogle(a, session))).toEqual(REAUTH_REQUIRED);
  });

  it('[INV-DEL9-001] el retorno ya usado (mismo state y cookie) falla con el 400 uniforme', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    const { started } = await reauthenticate(a, oidc, session);
    const replay = await callback(a, `argos_oauth=${valueOf(cookieNamed(started, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl((started.json as { authorizationUrl: string }).authorizationUrl)}`);
    expect([replay.status, (replay.json as { code: string }).code]).toEqual([400, 'ERR-AUTH-GOOGLE-FAILED']);
  });

  it('[INV-DEL9-001] si la sesión que inició la reautenticación ya no existe al volver, el retorno falla con el 400 uniforme', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    const started = await startReauth(a, session);
    await a.call('POST', '/api/auth/logout', { cookie: session });
    oidc.authTimeSeconds = nowSeconds(a) - 2;
    const done = await callback(a, `argos_oauth=${valueOf(cookieNamed(started, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl((started.json as { authorizationUrl: string }).authorizationUrl)}`);
    expect([done.status, (done.json as { code: string }).code]).toEqual([400, 'ERR-AUTH-GOOGLE-FAILED']);
  });
});

describe('T1218 eliminación con la prueba de titularidad (REQ-DEL9-001, INV-DEL9-001, REQ-ACC-002; SC-009-044, SC-009-045)', () => {
  it('[REQ-DEL9-001] SC-009-044: con la prueba y la frase literal responde 204, expira argos_session y no queda ninguna fila de la cuenta (datos, auth_identities, estados de flujo y sesiones); la auditoría guarda solo el seudónimo', async () => {
    const { a, oidc } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    expect((await a.call('POST', '/api/pets', { cookie: session, body: NEW_PET })).status).toBe(201);
    expect(userRows(a, userId)).toBeGreaterThan(1);
    await reauthenticate(a, oidc, session);
    const deleted = await deleteWithGoogle(a, session);
    expect(deleted.status).toBe(204);
    expect(cookieNamed(deleted, 'argos_session')).toMatch(/argos_session=;/);
    expect(cookieNamed(deleted, 'argos_session')).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(userRows(a, userId)).toBe(0);
    expect(count(a, 'SELECT COUNT(*) AS n FROM pets WHERE owner_user_id = ?', userId)).toBe(0);
    expect(count(a, "SELECT COUNT(*) AS n FROM audit_log WHERE mutation_type = 'ACCOUNT_DELETE'")).toBe(1);
    const dump = a.dump();
    expect(dump).not.toContain(userId);
    expect(dump).not.toContain(GOOGLE_SUB);
    expect(dump).not.toContain(GOOGLE_EMAIL);
    expect((await a.call('GET', '/api/auth/me', { cookie: session })).status).toBe(401);
  });

  it('[INV-DEL9-001] [EDGE-009-031] SC-009-045: la sesión por sí sola NO elimina: 403 ERR-ACCOUNT-DELETE-REAUTH-REQUIRED y la base queda idéntica', async () => {
    const { a } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    const before = a.dump();
    const r = await deleteWithGoogle(a, session);
    expect(problem(r)).toEqual(REAUTH_REQUIRED);
    expect(a.dump()).toBe(before);
    expect(userRows(a, userId)).toBeGreaterThan(0);
  });

  it('[INV-DEL9-001] SC-009-045: la prueba vence a los 900 s: pasado ese plazo (con la sesión aún vigente) la eliminación responde el mismo 403 y nada se borra', async () => {
    const { a, oidc } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    await reauthenticate(a, oidc, session);
    advance(a, 901);
    const r = await deleteWithGoogle(a, session);
    expect(problem(r)).toEqual(REAUTH_REQUIRED);
    expect(userRows(a, userId)).toBeGreaterThan(0);
  });

  it('[INV-DEL9-001] la prueba está ligada a la sesión que la pidió: otra sesión de la misma cuenta no puede usarla (403 uniforme) y la sesión original sí', async () => {
    const { a, oidc } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    await reauthenticate(a, oidc, session);
    const other = await googleLogin(a);
    expect(other).not.toBe(session);
    expect(problem(await deleteWithGoogle(a, other))).toEqual(REAUTH_REQUIRED);
    expect(userRows(a, userId)).toBeGreaterThan(0);
    expect((await deleteWithGoogle(a, session)).status).toBe(204);
  });

  it('[INV-DEL9-001] la prueba es de UN SOLO USO: tras consumirse en el borrado la cuenta ya no existe y repetir el intento responde 401, nunca otra eliminación', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    await reauthenticate(a, oidc, session);
    expect((await deleteWithGoogle(a, session)).status).toBe(204);
    expect(problem(await deleteWithGoogle(a, session))).toEqual({ status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' });
  });

  it('[INV-DEL9-001] [EDGE-009-031] la prueba de OTRA cuenta no sirve: la de Gina no elimina a Hugo (403 uniforme) y la de Hugo sigue ligada a su propia sesión', async () => {
    const { a, oidc } = await boot();
    const gina = await bornWithGoogle(a, 'gina.google');
    oidc.identity = { sub: 'sub-hugo', email: 'hugo@example.test' };
    const hugo = await bornWithGoogle(a, 'hugo.google');
    oidc.identity = { sub: GOOGLE_SUB, email: GOOGLE_EMAIL };
    await reauthenticate(a, oidc, gina.session);
    expect(problem(await deleteWithGoogle(a, hugo.session))).toEqual(REAUTH_REQUIRED);
    expect(userRows(a, hugo.userId)).toBeGreaterThan(0);
  });

  it('[REQ-DEL9-001] uniformidad: ausente, vencida, de otra sesión y cuenta con contraseña producen el MISMO estado, código, título y detalle, sin sub ni correo', async () => {
    const { a, oidc } = await boot();
    const { session } = await bornWithGoogle(a);
    const absent = await deleteWithGoogle(a, session);
    await reauthenticate(a, oidc, session);
    advance(a, 901);
    const expired = await deleteWithGoogle(a, session);
    const password = await deleteWithGoogle(a, await a.login('andres'));
    const shape = (r: ApiResponse) => ({ status: r.status, type: (r.json as { type: string }).type, title: (r.json as { title: string }).title, detail: (r.json as { detail: string }).detail, ct: r.headers['content-type'] });
    expect(shape(expired)).toEqual(shape(absent));
    expect(shape(password)).toEqual(shape(absent));
    for (const r of [absent, expired, password]) expect(r.text).not.toMatch(new RegExp(`${GOOGLE_SUB}|${GOOGLE_EMAIL}|persona@`));
  });

  it('[REQ-DEL9-001] [REQ-ACC-002] cuerpo cerrado: frase distinta, campos ajenos (contraseña, sub, correo, prueba) o token con mala forma se rechazan sin borrar nada', async () => {
    const { a, oidc } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    await reauthenticate(a, oidc, session);
    const schemaFailure = { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' };
    const bad = [{ confirmationPhrase: 'eliminar mi cuenta' }, {}, { confirmationPhrase: PHRASE, password: 'x' }, { confirmationPhrase: PHRASE, sub: GOOGLE_SUB }];
    const results = [];
    for (const body of bad) results.push(problem(await deleteWithGoogle(a, session, body)));
    expect(results).toEqual(Array(bad.length).fill(schemaFailure));
    expect(problem(await deleteWithGoogle(a, session, { confirmationPhrase: PHRASE, backupConfirmationToken: 'corto' }))).toEqual({ status: 409, code: 'ERR-ACCOUNT-CONFIRMATION-MISMATCH' });
    expect(userRows(a, userId)).toBeGreaterThan(0);
    // TRI-02: son 5 intentos (el tope por 15 min); pasada la ventana se pide otra prueba y se sigue sin tocar el límite.
    advance(a, 15 * 60 + 1);
    await reauthenticate(a, oidc, session);
    expect(problem(await deleteWithGoogle(a, session, { confirmationPhrase: PHRASE, email: GOOGLE_EMAIL }))).toEqual(schemaFailure);
    // La prueba sobrevivió a todos los rechazos (un fallo revierte el consumo): ahora sí elimina.
    expect((await deleteWithGoogle(a, session)).status).toBe(204);
  });

  it('[REQ-DEL9-001] sin cabecera CSRF responde 403 ERR-AUTH-CSRF-REJECTED y sin sesión 401, antes de leer el cuerpo', async () => {
    const { a } = await boot();
    const { session } = await bornWithGoogle(a);
    const noCsrf = await a.call('POST', '/api/account/deletion/google', { cookie: session, body: { confirmationPhrase: PHRASE }, csrf: false, contract: false });
    expect([problem(noCsrf), problem(await deleteWithGoogle(a, null))]).toEqual([
      { status: 403, code: 'ERR-AUTH-CSRF-REJECTED' },
      { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' },
    ]);
  });

  it('[EDGE-009-032] [REQ-ACC-002] la cuenta con contraseña conserva el borrado por contraseña (POST /api/account/deletion, 204) y la vía de Google le responde el 403 uniforme', async () => {
    const { a } = await boot();
    const session = await a.login('lucia.r');
    expect(problem(await deleteWithGoogle(a, session))).toEqual(REAUTH_REQUIRED);
    const userId = (await a.call('GET', '/api/auth/me', { cookie: session })).json as { user: { id: string } };
    const token = await a.issueConfirmationToken(userId.user.id);
    const deleted = await a.call('POST', '/api/account/deletion', { cookie: session, body: { confirmationPhrase: PHRASE, password: PASSWORDS['lucia.r'], backupConfirmationToken: token } });
    expect(deleted.status).toBe(204);
  });
});

describe('TRI-02 límite propio del borrado con Google (ERR-RATE-LIMITED)', () => {
  it('[TRI-02] el cubo deleteAccount es de 5 intentos por 15 min por usuario: el 6.º responde 429 ERR-RATE-LIMITED antes de leer el cuerpo y la cuenta no se toca', async () => {
    expect(GOOGLE_AUTH_LIMITS.deleteAccount).toEqual({ maxPerWindow: 5, windowMinutes: 15 });
    const { a } = await boot();
    const { session, userId } = await bornWithGoogle(a);
    for (let i = 0; i < GOOGLE_AUTH_LIMITS.deleteAccount.maxPerWindow; i += 1) expect(problem(await deleteWithGoogle(a, session))).toEqual(REAUTH_REQUIRED);
    // Cuerpo inválido: si el límite no corre antes de leerlo, saldría 422 y no 429.
    expect(problem(await deleteWithGoogle(a, session, { basura: true }))).toEqual({ status: 429, code: 'ERR-RATE-LIMITED' });
    expect(userRows(a, userId)).toBeGreaterThan(0);
    // La ventana es de 15 min: pasada, el usuario vuelve a poder intentar.
    advance(a, 15 * 60 + 1);
    expect(problem(await deleteWithGoogle(a, session)).status).toBe(403);
  });
});

describe('T1284 propietaria de hogares con miembros ACTIVE (EDGE-009-049, D9-24 = A; SC-009-044, SC-009-045)', () => {
  async function ownerOfSharedHousehold(a: Api, oidc: FakeGoogleOidc) {
    const gina = await bornWithGoogle(a);
    const created = await a.call('POST', '/api/households', { cookie: gina.session, body: { name: 'Casa Gina' }, contract: false });
    const householdId = (created.json as { household: { id: string } }).household.id;
    await a.call('POST', `/api/households/${householdId}/invitations`, { cookie: gina.session, body: { username: 'maria.v', roleOnJoin: 'CAREGIVER' }, contract: false });
    const accepted = await a.call('POST', `/api/invitations/${householdId}/accept`, { cookie: await a.login('maria.v'), contract: false });
    expect(accepted.status).toBe(200);
    await reauthenticate(a, oidc, gina.session);
    return { ...gina, householdId };
  }

  it('[EDGE-009-049] se rechaza con 409 ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE y la lista estructurada de hogares afectados (id, nombre, miembros activos, mascotas compartidas); nada se pierde', async () => {
    const { a, oidc } = await boot();
    const gina = await ownerOfSharedHousehold(a, oidc);
    const before = a.dump();
    const r = await deleteWithGoogle(a, gina.session);
    expect(problem(r)).toEqual({ status: 409, code: 'ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE' });
    const body = r.json as { type: string; title: string; detail: string; invariantRef: string; households: Array<{ householdId: string; name: string; activeMembers: number; sharedPets: number }> };
    expect(body.type).toBe('urn:argos:error:ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE');
    expect(body.invariantRef).toBe('INV-HOUSE2-001');
    expect(body.households).toEqual([{ householdId: gina.householdId, name: 'Casa Gina', activeMembers: 1, sharedPets: 0 }]);
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
    // «No se pierde ningún dato»: la base queda idéntica, incluida la prueba de titularidad (el consumo se revirtió).
    expect(a.dump()).toBe(before);
    expect(userRows(a, gina.userId)).toBeGreaterThan(0);
  });

  it('[EDGE-009-049] el mensaje no transfiere propiedad: tras el rechazo la propietaria sigue siéndolo y la prueba sigue vigente (un segundo intento da el mismo 409, no el 403)', async () => {
    const { a, oidc } = await boot();
    const gina = await ownerOfSharedHousehold(a, oidc);
    expect((await deleteWithGoogle(a, gina.session)).status).toBe(409);
    expect(problem(await deleteWithGoogle(a, gina.session))).toEqual({ status: 409, code: 'ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE' });
    const household = await a.call('GET', `/api/households/${gina.householdId}`, { cookie: gina.session, contract: false });
    expect((household.json as { household: { ownerUserId: string } }).household.ownerUserId).toBe(gina.userId);
  });

  it('[EDGE-009-049] resuelto el hogar (la otra persona sale), la misma prueba permite eliminar con la cascada de REQ-ACC-002: el hogar y la mascota desaparecen', async () => {
    const { a, oidc } = await boot();
    const gina = await ownerOfSharedHousehold(a, oidc);
    const pet = (await a.call('POST', '/api/pets', { cookie: gina.session, body: NEW_PET })).json as { id: string };
    expect(problem(await deleteWithGoogle(a, gina.session)).code).toBe('ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE');
    const maria = (await a.call('GET', '/api/auth/me', { cookie: await a.login('maria.v') })).json as { user: { id: string } };
    expect((await a.call('DELETE', `/api/households/${gina.householdId}/members/${maria.user.id}`, { cookie: gina.session, contract: false })).status).toBe(204);
    expect((await deleteWithGoogle(a, gina.session)).status).toBe(204);
    expect(count(a, 'SELECT COUNT(*) AS n FROM households WHERE id = ?', gina.householdId)).toBe(0);
    expect(count(a, 'SELECT COUNT(*) AS n FROM pets WHERE id = ?', pet.id)).toBe(0);
    expect(userRows(a, gina.userId)).toBe(0);
  });

  it('[EDGE-009-049] una cuenta sin hogares compartidos se elimina sin rechazo (la regla no duplica ni reemplaza la cascada)', async () => {
    const { a, oidc } = await boot();
    const gina = await bornWithGoogle(a);
    await a.call('POST', '/api/households', { cookie: gina.session, body: { name: 'Casa sola' }, contract: false });
    await reauthenticate(a, oidc, gina.session);
    expect((await deleteWithGoogle(a, gina.session)).status).toBe(204);
    expect(userRows(a, gina.userId)).toBe(0);
  });
});
