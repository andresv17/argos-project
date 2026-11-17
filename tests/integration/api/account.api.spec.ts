import { afterEach, describe, expect, it } from 'vitest';
import { ANA, ANA_PETS, BRUNO, HOUSEHOLD_ANA, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY } from '../../fixtures/identity-fixtures.ts';
import { createIdentityApi, problemOf, type Api } from './api-harness.ts';

/** T210: perfil y cambio de contraseña (REQ-AUTH2-003, REQ-ACC-001, REQ-TIME-001) sobre la API real y SQLite. */
let api: Api;
afterEach(async () => api.close());

const UNAUTHENTICATED = { status: 401, code: 'ERR-AUTH-UNAUTHENTICATED' };
const OLD_PASSWORD = IDENTITY_PASSWORDS['ana.duena']!;
const NEW_PASSWORD = 'Nueva2026#Ana';
const loginAs = (username: string, password: string) => api.call('POST', '/api/auth/login', { body: { username, password } });

describe('cambio de contraseña por HTTP (POST /api/account/password)', () => {
  it('[REQ-AUTH2-003][INV-AUTH-005] cambia la contraseña (204), revoca las demás sesiones de la persona y conserva la actual', async () => {
    api = await createIdentityApi();
    const current = await api.login('ana.duena');
    const other = await api.login('ana.duena');
    const bystander = await api.login('bruno.admin');
    const changed = await api.call('POST', '/api/account/password', { cookie: current, body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD } });
    const kept = await api.call('GET', '/api/auth/me', { cookie: current });
    const revoked = await api.call('GET', '/api/auth/me', { cookie: other });
    const untouched = await api.call('GET', '/api/auth/me', { cookie: bystander });
    expect([changed.status, changed.text, kept.status, problemOf(revoked), untouched.status]).toEqual([204, '', 200, UNAUTHENTICATED, 200]);
  });

  it('[REQ-AUTH2-003] después del cambio entra la contraseña nueva y la anterior da 401 genérico', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    await api.call('POST', '/api/account/password', { cookie, body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD } });
    const withNew = await loginAs('ana.duena', NEW_PASSWORD);
    const withOld = await loginAs('ana.duena', OLD_PASSWORD);
    expect([withNew.status, problemOf(withOld)]).toEqual([200, { status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' }]);
  });

  it('[REQ-AUTH2-003][ERR-AUTH-INVALID-CREDENTIALS] con la contraseña actual incorrecta responde 401, no cambia nada y las otras sesiones siguen vigentes', async () => {
    api = await createIdentityApi();
    const current = await api.login('ana.duena');
    const other = await api.login('ana.duena');
    const before = api.dump();
    const wrong = await api.call('POST', '/api/account/password', { cookie: current, body: { currentPassword: 'incorrecta', newPassword: NEW_PASSWORD } });
    const otherMe = await api.call('GET', '/api/auth/me', { cookie: other });
    const withOld = await loginAs('ana.duena', OLD_PASSWORD);
    const strip = (dump: string) => JSON.parse(dump).filter(([table]: [string]) => table === 'users');
    expect([problemOf(wrong), otherMe.status, withOld.status, strip(api.dump())]).toEqual([{ status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' }, 200, 200, strip(before)]);
  });

  it('[REQ-AUTH2-003][INV-AUTH-005][ERR-AUTH-TOO-MANY-ATTEMPTS] los fallos de la contraseña actual cuentan para el mismo límite que el login: el 6.º intento es 429 aunque sea correcto', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    for (let i = 0; i < 5; i += 1) {
      const wrong = await api.call('POST', '/api/account/password', { cookie, body: { currentPassword: `incorrecta-${i}`, newPassword: NEW_PASSWORD } });
      expect(problemOf(wrong)).toEqual({ status: 401, code: 'ERR-AUTH-INVALID-CREDENTIALS' });
    }
    const blocked = await api.call('POST', '/api/account/password', { cookie, body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD } });
    const loginBlocked = await loginAs('ana.duena', OLD_PASSWORD);
    expect([problemOf(blocked), problemOf(loginBlocked)]).toEqual([
      { status: 429, code: 'ERR-AUTH-TOO-MANY-ATTEMPTS' },
      { status: 429, code: 'ERR-AUTH-TOO-MANY-ATTEMPTS' },
    ]);
  });

  it('[REQ-AUTH2-003][ERR-AUTH-WEAK-PASSWORD] una contraseña nueva débil da 422 en newPassword, antes de verificar la actual y sin cambios', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    api.hasher.reset();
    const weak = await api.call('POST', '/api/account/password', { cookie, body: { currentPassword: 'cualquiera', newPassword: 'corta1!' } });
    expect([problemOf(weak), (weak.json as { field: string }).field, api.hasher.calls.length]).toEqual([{ status: 422, code: 'ERR-AUTH-WEAK-PASSWORD' }, 'newPassword', 0]);
    expect((await loginAs('ana.duena', OLD_PASSWORD)).status).toBe(200);
  });

  it('[REQ-AUTH2-003][INV-AUTH2-001] la contraseña nueva respeta la política completa: 10 a 128, mayúscula, número y símbolo', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const attempt = async (newPassword: unknown) => problemOf(await api.call('POST', '/api/account/password', { cookie, body: { currentPassword: OLD_PASSWORD, newPassword } }));
    expect([
      await attempt('sinmayuscula1!'),
      await attempt('SinNumeroAqui!'),
      await attempt('SinSimbolo2026'),
      await attempt('Corta1!a'),
      await attempt(`A1!${'x'.repeat(126)}`),
    ]).toEqual(Array(5).fill({ status: 422, code: 'ERR-AUTH-WEAK-PASSWORD' }));
    const longest = await api.call('POST', '/api/account/password', { cookie, body: { currentPassword: OLD_PASSWORD, newPassword: `A1!${'x'.repeat(125)}` } });
    expect(longest.status).toBe(204);
  });

  it('[REQ-AUTH2-003][INV-AUTH-007][ERR-AUTH-UNAUTHENTICATED] exige CSRF, sesión vigente y el cuerpo completo', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const body = { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD };
    const noCsrf = await api.call('POST', '/api/account/password', { cookie, body, csrf: false, contract: false });
    const noSession = await api.call('POST', '/api/account/password', { body });
    const missing = await api.call('POST', '/api/account/password', { cookie, body: { newPassword: NEW_PASSWORD } });
    const extra = await api.call('POST', '/api/account/password', { cookie, body: { ...body, username: 'otra' } });
    expect([noCsrf.status, problemOf(noSession), problemOf(missing), problemOf(extra)]).toEqual([
      403,
      UNAUTHENTICATED,
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
      { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' },
    ]);
  });
});

describe('perfil por HTTP (PATCH /api/account/profile)', () => {
  it('[REQ-ACC-001] edita nombre, correo, idioma y zona horaria; /auth/me lo refleja y el username no cambia', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const patch = await api.call('PATCH', '/api/account/profile', {
      cookie,
      body: { displayName: 'Ana D.', email: 'ana@example.com', preferredLanguage: 'pt', timezone: 'Europe/Madrid' },
    });
    const me = await api.call('GET', '/api/auth/me', { cookie });
    const expected = { id: ANA, username: 'ana.duena', displayName: 'Ana D.', createdAt: '2026-01-05T10:00:00.000Z', email: 'ana@example.com', preferredLanguage: 'pt', timezone: 'Europe/Madrid' };
    expect([patch.status, patch.json, (me.json as { user: unknown }).user]).toEqual([200, expected, expected]);
  });

  it('[REQ-ACC-001] una edición parcial no toca los demás campos y email null borra el correo', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    await api.call('PATCH', '/api/account/profile', { cookie, body: { email: 'ana@example.com', timezone: 'Asia/Tokyo' } });
    const onlyName = await api.call('PATCH', '/api/account/profile', { cookie, body: { displayName: 'Solo Nombre' } });
    const cleared = await api.call('PATCH', '/api/account/profile', { cookie, body: { email: null } });
    const profile = (r: typeof onlyName) => r.json as { displayName: string; email: string | null; timezone: string; preferredLanguage: string };
    expect([profile(onlyName).email, profile(onlyName).timezone, profile(onlyName).displayName]).toEqual(['ana@example.com', 'Asia/Tokyo', 'Solo Nombre']);
    expect([profile(cleared).email, profile(cleared).displayName, profile(cleared).preferredLanguage]).toEqual([null, 'Solo Nombre', 'es']);
  });

  it('[REQ-ACC-001][ERR-SCHEMA-VALIDATION-FAILED] rechaza idioma fuera de es/en/pt, zona que no es IANA, nombre con espacios extremos, cuerpo vacío y campos no editables', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const attempt = async (body: unknown) => {
      const r = await api.call('PATCH', '/api/account/profile', { cookie, body });
      return [problemOf(r), (r.json as { field?: string }).field ?? null] as const;
    };
    const schemaError = { status: 422, code: 'ERR-SCHEMA-VALIDATION-FAILED' };
    expect([
      await attempt({ preferredLanguage: 'fr' }),
      await attempt({ timezone: 'Marte/Olympus' }),
      await attempt({ timezone: '../etc/passwd' }),
      await attempt({ displayName: ' Ana ' }),
      await attempt({ email: 'sin-arroba' }),
      await attempt({}),
      await attempt({ username: 'otra.ana' }),
      await attempt({ password: 'Otra2026x!' }),
    ]).toEqual([
      [schemaError, 'preferredLanguage'],
      [schemaError, 'timezone'],
      [schemaError, 'timezone'],
      [schemaError, 'displayName'],
      [schemaError, 'email'],
      [schemaError, null],
      [schemaError, 'username'],
      [schemaError, 'password'],
    ]);
    expect(((await api.call('GET', '/api/auth/me', { cookie })).json as { user: { username: string } }).user.username).toBe('ana.duena');
  });

  it('[REQ-ACC-001][INV-AUTH-007][ERR-AUTH-UNAUTHENTICATED] exige CSRF y sesión vigente', async () => {
    api = await createIdentityApi();
    const cookie = await api.login('ana.duena');
    const noCsrf = await api.call('PATCH', '/api/account/profile', { cookie, body: { displayName: 'X' }, csrf: false, contract: false });
    const noSession = await api.call('PATCH', '/api/account/profile', { body: { displayName: 'X' } });
    expect([noCsrf.status, problemOf(noSession)]).toEqual([403, UNAUTHENTICATED]);
  });

  it('[REQ-ACC-001][INV-AUTH-006] el correo de una persona no aparece en lo que ve otra (miembro del mismo hogar)', async () => {
    api = await createIdentityApi();
    const ana = await api.login('ana.duena');
    const bruno = await api.login('bruno.admin');
    await api.call('PATCH', '/api/account/profile', { cookie: ana, body: { email: 'privado.ana@example.com' } });
    // contract:false — la forma de la vista del hogar es del modelo heredado hasta la rebanada 3 (T237/T243); aquí solo se busca el correo.
    const household = await api.call('GET', `/api/households/${HOUSEHOLD_ANA.id}`, { cookie: bruno, contract: false });
    const list = await api.call('GET', '/api/households', { cookie: bruno, contract: false });
    expect([household.status, household.text.includes('privado.ana'), list.text.includes('privado.ana'), household.text.includes(BRUNO)]).toEqual([200, false, false, true]);
  });
});

describe('zona horaria del perfil y día civil (REQ-TIME-001, SC-006)', () => {
  const bodies = async (cookie: string) => {
    const list = await api.call('GET', '/api/pets', { cookie, contract: false });
    const dashboard = await api.call('GET', `/api/pets/${ANA_PETS[0]!.id}/dashboard`, { cookie, contract: false });
    return { list: list.text, dashboard: dashboard.text, statuses: [list.status, dashboard.status] };
  };

  it('[REQ-TIME-001][SC-006] el timezone del perfil no altera edades, orden ni alertas aunque en esa zona ya sea otro día', async () => {
    api = await createIdentityApi();
    // 23:30 UTC: en Pacific/Kiritimati (UTC+14) ya es el día siguiente y en Pacific/Pago_Pago (UTC-11) todavía es el mismo día.
    api.clock.setClock(REFERENCE_TODAY, '2026-11-11T23:30:00.000Z');
    const cookie = await api.login('ana.duena');
    const baseline = await bodies(cookie);
    const results = [baseline];
    for (const timezone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC']) {
      const patch = await api.call('PATCH', '/api/account/profile', { cookie, body: { timezone } });
      expect(patch.status).toBe(200);
      results.push(await bodies(cookie));
    }
    expect(baseline.statuses).toEqual([200, 200]);
    for (const result of results) expect(result).toEqual(baseline);
    expect(REFERENCE_NOW).toBe('2026-11-11T12:00:00.000Z');
  });
});
