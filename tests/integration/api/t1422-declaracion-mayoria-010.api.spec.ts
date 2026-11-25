import { afterEach, describe, expect, it } from 'vitest';
import { IDENTITY_PASSWORDS } from '../../fixtures/identity-fixtures.ts';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { GOOGLE_CODE, SequentialEntropy, fakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { createApi, createIdentityApi, type Api, type ApiResponse } from './api-harness.ts';

/**
 * T1422 (pruebas rojas, Feature 010, Bloque D, [GH:#75]): capa HTTP de la declaración de mayoría de edad (SQLite en memoria; la batería de memoria/SQLite/PostgreSQL de los casos
 * de uso vive en `tests/integration/persistence/t1422-declaracion-mayoria-010.spec.ts`). Las respuestas se comprueban con `contract: false`: el OpenAPI compilado vigente aún no
 * lleva `adultDeclaration` (T1423 lo compila; T1424 lo implementa). ROJO esperado hasta T1424.
 *
 * @implements REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003, INV-MEN10-001, EDGE-010-005, EDGE-010-010, SC-010-022, SC-010-023, SC-010-024
 */
let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const CODE_422 = 'ERR-MEN10-ADULT-DECLARATION-REQUIRED';
const BODY = { username: 'solicitante.t1422', displayName: 'Solicitante', password: 'Clave2026x!', confirmPassword: 'Clave2026x!', email: 'solicitante@example.test' };
const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
const register = (a: Api, body: Record<string, unknown>) => a.call('POST', '/api/auth/register', { body, contract: false });
const userRow = (a: Api, name: string) => a.db.prepare('SELECT adult_declared_at, adult_notice_version FROM users WHERE lower(username) = lower(?)').get(name);
const userCount = (a: Api): number => a.db.prepare('SELECT COUNT(*) FROM users').pluck().get() as number;

describe('T1422 POST /api/auth/register [REQ-MEN10-001] [SC-010-022] [INV-MEN10-001] [SC-010-023]', () => {
  it('sin adultDeclaration responde 422 application/problem+json con ERR-MEN10-ADULT-DECLARATION-REQUIRED, sin Set-Cookie y sin crear la cuenta', async () => {
    api = await createIdentityApi();
    const before = userCount(api);
    for (const body of [BODY, { ...BODY, adultDeclaration: false }, { ...BODY, adultDeclaration: 'true' }]) {
      const r = await register(api, body);
      expect([r.status, (r.json as { code: string }).code]).toEqual([422, CODE_422]);
      expect(String(r.headers['content-type'])).toMatch(/^application\/problem\+json/);
      expect(setCookies(r)).toEqual([]);
    }
    expect(userCount(api)).toBe(before);
  });

  it('INV-MEN10-001: usuario ocupado, correo ocupado y todo libre dan el MISMO cuerpo 422 (sin enumeración)', async () => {
    api = await createIdentityApi();
    const free = await register(api, BODY);
    const takenUser = await register(api, { ...BODY, username: 'ana.duena' });
    const takenUserCase = await register(api, { ...BODY, username: 'ANA.DUENA' });
    expect(free.status).toBe(422);
    expect(takenUser.status).toBe(422);
    expect(takenUser.json).toEqual(free.json);
    expect(takenUserCase.json).toEqual(free.json);
    expect(free.text).not.toMatch(/ana\.duena|ocupad|existe|taken/i);
  });

  it('con adultDeclaration: true responde 201 { accountStatus: PENDING } y guarda la fecha (reloj fijo) y la versión del texto; sin fecha de nacimiento', async () => {
    api = await createIdentityApi();
    const r = await register(api, { ...BODY, adultDeclaration: true });
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ accountStatus: 'PENDING' });
    expect(userRow(api, BODY.username)).toEqual({ adult_declared_at: api.clock.nowIsoTimestamp(), adult_notice_version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
    expect(r.text).not.toMatch(/adult|nacimiento|birth/i);
  });

  it('[REQ-MEN10-002][SC-010-024] las cuentas anteriores conservan las columnas nulas y siguen entrando sin declaración', async () => {
    api = await createIdentityApi();
    expect(userRow(api, 'ana.duena')).toEqual({ adult_declared_at: null, adult_notice_version: null });
    const login = await api.call('POST', '/api/auth/login', { body: { username: 'ana.duena', password: IDENTITY_PASSWORDS['ana.duena'] } });
    expect(login.status).toBe(200);
    expect(login.cookie).toMatch(/^argos_session=/);
  });
});

describe('T1422 POST /api/auth/google/username [REQ-MEN10-001] [EDGE-010-010] [EDGE-010-005] [SC-010-022]', () => {
  async function toUsernameStep() {
    const oidc = fakeGoogleOidc();
    api = await createApi(canonicalState(), { google: { oidc, entropy: new SequentialEntropy() } });
    const start = await api.call('GET', '/api/auth/google/start', { csrf: false });
    const state = new URL(start.headers['location'] as string).searchParams.get('state')!;
    const pending = await api.call('GET', `/api/auth/google/callback?code=${GOOGLE_CODE}&state=${state}`, { csrf: false, cookie: `argos_oauth=${valueOf(cookieNamed(start, 'argos_oauth'))}` });
    return { api, oauth: `argos_oauth=${valueOf(cookieNamed(pending, 'argos_oauth'))}` };
  }

  it('H-03 opción A: sin declaración responde 422 ERR-MEN10, NO retira la cookie argos_oauth y el reintento con declaración (misma cookie) responde 201 y crea la cuenta', async () => {
    const { api, oauth } = await toUsernameStep();
    const rejected = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'nueva.persona' }, contract: false });
    expect([rejected.status, (rejected.json as { code: string }).code]).toEqual([422, CODE_422]);
    expect(cookieNamed(rejected, 'argos_oauth')).toBeUndefined();
    expect(userRow(api, 'nueva.persona')).toBeUndefined();
    const retry = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'nueva.persona', adultDeclaration: true }, contract: false });
    expect(retry.status).toBe(201);
    expect(retry.json).toEqual({ accountStatus: 'PENDING' });
    expect(userRow(api, 'nueva.persona')).toEqual({ adult_declared_at: api.clock.nowIsoTimestamp(), adult_notice_version: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
  });

  it('INV-MEN10-001: el 422 es idéntico con un username libre y con uno ocupado', async () => {
    const { api, oauth } = await toUsernameStep();
    const free = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'nueva.persona' }, contract: false });
    const taken = await api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'andres' }, contract: false });
    expect(free.status).toBe(422);
    expect(taken.json).toEqual(free.json);
  });

  it('EDGE-010-005: carrera de dos pestañas con la misma cookie (una sin casilla, otra con ella): una 422 y una 201, una sola cuenta', async () => {
    const { api, oauth } = await toUsernameStep();
    const [without, withDecl] = await Promise.all([
      api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'pestana.uno' }, contract: false }),
      api.call('POST', '/api/auth/google/username', { cookie: oauth, body: { username: 'pestana.uno', adultDeclaration: true }, contract: false }),
    ]);
    expect([without.status, (without.json as { code: string }).code]).toEqual([422, CODE_422]);
    expect([withDecl.status, withDecl.json]).toEqual([201, { accountStatus: 'PENDING' }]);
    expect(api.db.prepare("SELECT COUNT(*) FROM users WHERE lower(username) = 'pestana.uno'").pluck().get()).toBe(1);
  });
});
