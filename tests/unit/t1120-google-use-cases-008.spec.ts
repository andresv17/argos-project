import { beforeEach, describe, expect, it } from 'vitest';
import type { OAuthFlowStateRecord } from '../../src/application/ports/auth-identity.port.ts';
import {
  ChooseGoogleUsernameUseCase,
  CompleteGoogleLoginUseCase,
  StartGoogleLinkUseCase,
  StartGoogleLoginUseCase,
} from '../../src/application/use-cases/google-auth-use-cases.ts';
import { LoginUseCase } from '../../src/application/use-cases/auth-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { hashOneTimeToken } from '../../src/domain/auth/one-time-token.ts';
import { sessionTokenHash } from '../../src/infrastructure/persistence/sqlite/sqlite-repositories.ts';
import { NO_PASSWORD_SENTINEL } from '../../src/domain/auth/password-sentinel.ts';
import { GoogleOidcError } from '../../src/infrastructure/http/google-oidc-verify.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, GOOGLE_SUB, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from '../fixtures/google-fixtures.ts';
import { accountIdOf } from '../fixtures/active-accounts.ts';
import { ANDRES, MARIA, PASSWORDS, createHarness, type Harness } from '../fixtures/application-harness.ts';

/**
 * T1120 (pruebas rojas, Feature 008, [GH:#16]): casos de uso de Google con Google SIMULADO (puerto fake; ninguna red ni credencial).
 * REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, REQ-SSO8-005, REQ-VIN8-002, EDGE-008-001, EDGE-008-007, EDGE-008-027, EDGE-008-030; SC-008-001..006, SC-008-062.
 * El centinela ADR-008-14 (a)(b)(c) se demuestra además en t1120-password-sentinel-008.spec.ts.
 */

const NOW = '2026-11-05T12:00:00.000Z';
const SUB = GOOGLE_SUB;
const EMAIL = GOOGLE_EMAIL;
const CODE = GOOGLE_CODE;
const fakeOidc = fakeGoogleOidc;
type FakeOidc = FakeGoogleOidc;

interface World {
  readonly h: Harness;
  readonly deps: ApplicationDeps;
  readonly oidc: FakeOidc;
  readonly start: StartGoogleLoginUseCase;
  readonly complete: CompleteGoogleLoginUseCase;
  readonly choose: ChooseGoogleUsernameUseCase;
  readonly link: StartGoogleLinkUseCase;
}

function world(): World {
  const h = createHarness();
  const oidc = fakeOidc();
  const deps: ApplicationDeps = { ...h.deps, google: { oidc, entropy: new SequentialEntropy() } };
  return { h, deps, oidc, start: new StartGoogleLoginUseCase(deps), complete: new CompleteGoogleLoginUseCase(deps), choose: new ChooseGoogleUsernameUseCase(deps), link: new StartGoogleLinkUseCase(deps) };
}

const ORIGIN = 'token-sesion-origen';
const flowOf = (w: World, token: string): Promise<OAuthFlowStateRecord | null> => w.h.uow.runInTransaction((r) => r.oauthFlows.findByTokenHash(hashOneTimeToken(token)));
const stateOf = (authorizationUrl: string): string => new URL(authorizationUrl).searchParams.get('state')!;
const countUsers = async (w: World): Promise<number> => (w.h.uow as unknown as { state: { users: unknown[] } }).state.users.length;
const identitiesOf = (w: World, userId: string) => w.h.uow.runInTransaction((r) => r.authIdentities.listByUser(userId));

interface CaughtDomainError {
  readonly code: string;
  readonly status: number;
  toProblemDetails(instance: string): unknown;
}

/** Las fábricas de Google viven en el catálogo 3.1.0 (otra clase DomainError con el mismo contrato): se reconoce por forma. */
async function failure(promise: Promise<unknown>): Promise<CaughtDomainError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({ code: expect.stringMatching(/^ERR-/), status: expect.any(Number) });
    return error as CaughtDomainError;
  }
  throw new Error('se esperaba un error de dominio');
}

/** Primer acceso completo con Google: devuelve el token de la fase USERNAME. */
async function toUsernameStep(w: World): Promise<string> {
  const started = await w.start.execute();
  const done = await w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) });
  if (done.kind !== 'CHOOSE_USERNAME') throw new Error(`se esperaba CHOOSE_USERNAME y llegó ${done.kind}`);
  return done.oauthToken;
}

async function bornWithGoogle(w: World, username = 'nueva.persona'): Promise<string> {
  const token = await toUsernameStep(w);
  expect(await w.choose.execute(token, { username })).toEqual({ accountStatus: 'PENDING' }); // 009 (EDGE-009-006): la cuenta nace PENDING y no inicia sesión
  return accountIdOf(w.h.uow, username);
}

describe('T1120 iniciar el acceso con Google (REQ-SSO8-001, REQ-SSO8-004, H-A1-4)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('entrega la URL de Google con state, nonce y PKCE S256, y guarda el estado en servidor solo como hash', async () => {
    const started = await w.start.execute();
    const url = new URL(started.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(started.authorizationUrl).not.toContain('code_verifier');
    const row = await flowOf(w, started.oauthToken);
    expect(row).toMatchObject({ phase: 'AUTHORIZATION', intent: 'LOGIN', userId: null, consumedAt: null, createdAt: NOW, expiresAt: '2026-11-05T12:15:00.000Z' });
    expect(row!.state).toBe(url.searchParams.get('state'));
    expect(row!.nonce).toBe(url.searchParams.get('nonce'));
    expect(row!.tokenHash).toBe(hashOneTimeToken(started.oauthToken));
    expect(row!.tokenHash).not.toBe(started.oauthToken);
  });

  it('cada inicio emite un identificador, un state y un nonce distintos', async () => {
    const a = await w.start.execute();
    const b = await w.start.execute();
    expect(a.oauthToken).not.toBe(b.oauthToken);
    expect(stateOf(a.authorizationUrl)).not.toBe(stateOf(b.authorizationUrl));
  });

  it('purga los estados vencidos al iniciar un flujo nuevo y conserva los vigentes (H-A1-4)', async () => {
    const old = await w.start.execute();
    w.h.clock.setClock('2026-11-05', '2026-11-05T12:10:00.000Z');
    const young = await w.start.execute();
    w.h.clock.setClock('2026-11-05', '2026-11-05T12:16:00.000Z');
    const fresh = await w.start.execute();
    expect(await flowOf(w, old.oauthToken)).toBeNull();
    expect((await flowOf(w, young.oauthToken))?.tokenHash).toBe(hashOneTimeToken(young.oauthToken));
    expect((await flowOf(w, fresh.oauthToken))?.tokenHash).toBe(hashOneTimeToken(fresh.oauthToken));
  });

  it('sin configuración de Google falla cerrado: el inicio no declara 400 en el contrato (500) y el callback y la elección de usuario dan el 400 uniforme', async () => {
    expect((await failure(new StartGoogleLoginUseCase(w.h.deps).execute())).code).toBe('ERR-INTERNAL-UNEXPECTED');
    expect((await failure(new CompleteGoogleLoginUseCase(w.h.deps).execute({ oauthToken: null }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect((await failure(new ChooseGoogleUsernameUseCase(w.h.deps).execute(null, { username: 'nueva.persona' }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
  });
});

describe('T1120 completar el acceso con Google (REQ-SSO8-001, REQ-SSO8-004, REQ-SSO8-005; SC-008-001, SC-008-003..005)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('009 (EDGE-009-005, EDGE-009-006): el sub de una cuenta PENDING NO abre sesión: el retorno devuelve el estado, sin token ni fila de sesión, y consume el estado', async () => {
    await bornWithGoogle(w);
    const started = await w.start.execute();
    const done = await w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) });
    expect(done).toEqual({ kind: 'ACCOUNT_STATUS', accountStatus: 'PENDING' });
    expect(Object.keys((w.h.uow as unknown as { state: { sessions: object } }).state.sessions)).toEqual([]);
    expect((await flowOf(w, started.oauthToken))!.consumedAt).toBe(NOW);
  });

  it('SC-008-001: sub conocido (cuenta ACTIVE) abre sesión de esa cuenta, usa el verificador PKCE y el nonce del estado y consume el estado', async () => {
    const userId = await bornWithGoogle(w);
    // 009: la cuenta nacida con Google es PENDING; se activa en el estado en memoria (la decisión atómica es T1247) para probar el camino ACTIVE.
    delete (w.h.uow as unknown as { state: { users: Array<{ id: string; accountStatus?: string }> } }).state.users.find((u) => u.id === userId)!.accountStatus;
    const started = await w.start.execute();
    const done = await w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) });
    expect(done.kind).toBe('SESSION');
    if (done.kind !== 'SESSION') return;
    expect(done.session.user.id).toBe(userId);
    expect(done.sessionToken).toMatch(/^token-/);
    const stored = (await flowOf(w, started.oauthToken))!;
    expect(stored.consumedAt).toBe(NOW);
    expect(w.oidc.completions.at(-1)).toEqual({ code: CODE, codeVerifier: stored.codeVerifier, nonce: stored.nonce });
  });

  it('SC-008-002: sub desconocido NO crea cuenta; entrega un estado USERNAME nuevo con el sub y el correo pendientes', async () => {
    const before = await countUsers(w);
    const token = await toUsernameStep(w);
    expect(await countUsers(w)).toBe(before);
    expect(await flowOf(w, token)).toMatchObject({ phase: 'USERNAME', intent: 'LOGIN', pendingSubject: SUB, pendingEmail: EMAIL, expiresAt: '2026-11-05T12:15:00.000Z' });
  });

  it('SC-008-003: la cancelación en Google (error) falla con el error uniforme, sin canjear nada ni crear cuentas', async () => {
    const before = await countUsers(w);
    const started = await w.start.execute();
    const error = await failure(w.complete.execute({ oauthToken: started.oauthToken, error: 'access_denied', state: stateOf(started.authorizationUrl) }));
    expect(error.code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(w.oidc.completions).toEqual([]);
    expect(await countUsers(w)).toBe(before);
  });

  it('SC-008-004: email_verified falso, iss/aud/exp/nonce inválidos y código malo dan el MISMO error uniforme y no crean nada', async () => {
    const before = await countUsers(w);
    const problems: unknown[] = [];
    for (const reason of ['EMAIL_UNVERIFIED', 'ISSUER', 'AUDIENCE', 'EXPIRED', 'NONCE', 'SIGNATURE', 'EXCHANGE'] as const) {
      w.oidc.identity = new GoogleOidcError(reason);
      const started = await w.start.execute();
      const error = await failure(w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) }));
      problems.push(error.toProblemDetails('/api/auth/google/callback'));
    }
    expect(new Set(problems.map((p) => JSON.stringify(p))).size).toBe(1);
    expect(JSON.stringify(problems[0])).not.toMatch(/EMAIL_UNVERIFIED|NONCE|persona@|google-sub/);
    expect(await countUsers(w)).toBe(before);
  });

  it('SC-008-005: un state reutilizado (segundo retorno con la misma cookie) pierde el compare-and-set y no vuelve a llamar a Google', async () => {
    const started = await w.start.execute();
    const input = { oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) };
    await w.complete.execute(input);
    expect((await failure(w.complete.execute(input))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(w.oidc.completions).toHaveLength(1);
  });

  it('un state que no coincide, ausente o la cookie ausente o mal formada fallan uniformes y consumen el estado', async () => {
    const started = await w.start.execute();
    const good = stateOf(started.authorizationUrl);
    for (const input of [{ oauthToken: null, code: CODE, state: good }, { oauthToken: 'corto', code: CODE, state: good }, { oauthToken: started.oauthToken, code: CODE }, { oauthToken: started.oauthToken, state: good }]) {
      expect((await failure(w.complete.execute(input))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    }
    const other = await w.start.execute();
    expect((await failure(w.complete.execute({ oauthToken: other.oauthToken, code: CODE, state: 'otro-state' }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect((await flowOf(w, other.oauthToken))!.consumedAt).toBe(NOW);
    expect(w.oidc.completions).toEqual([]);
  });

  it('EDGE-008-007: un estado vencido (900 s) no se acepta', async () => {
    const started = await w.start.execute();
    w.h.clock.setClock('2026-11-05', '2026-11-05T12:15:00.000Z');
    expect((await failure(w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(w.oidc.completions).toEqual([]);
  });

  it('REQ-SSO8-005: un correo ya titular de una cuenta con correo verificado falla uniforme sin crear ni vincular nada', async () => {
    await bornWithGoogle(w);
    w.oidc.identity = { sub: 'otro-sub', email: EMAIL.toUpperCase() };
    const before = await countUsers(w);
    const started = await w.start.execute();
    expect((await failure(w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await countUsers(w)).toBe(before);
  });
});

describe('T1120 primer acceso: elegir username (REQ-SSO8-003; SC-008-002, SC-008-062; EDGE-008-027, EDGE-008-030)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('crea la cuenta PENDING con correo verificado, centinela de contraseña e identidad atómica, SIN iniciar sesión, y consume el estado', async () => {
    const token = await toUsernameStep(w);
    const created = await w.choose.execute(token, { username: 'Nueva.Persona' });
    expect(created).toEqual({ accountStatus: 'PENDING' }); // 009 (EDGE-009-006): sin sesión ni token
    const account = await w.h.uow.runInTransaction((r) => r.users.findByUsername('Nueva.Persona'));
    expect(account).toMatchObject({ username: 'Nueva.Persona', passwordHash: NO_PASSWORD_SENTINEL, email: EMAIL, emailVerifiedAt: NOW, accountStatus: 'PENDING' });
    expect(await identitiesOf(w, account!.id)).toEqual([{ provider: 'GOOGLE', providerSubject: SUB, userId: account!.id, createdAt: NOW }]);
    expect((await flowOf(w, token))!.consumedAt).toBe(NOW);
    // SC-008-062: sin contraseña no entra por contraseña, ni con el valor del centinela.
    const login = new LoginUseCase(w.deps);
    for (const password of ['Argos2026a', NO_PASSWORD_SENTINEL, 'Nueva.Persona1']) {
      expect((await failure(login.execute({ username: 'Nueva.Persona', password }))).code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    }
  });

  it('SC-008-002: el estado es de un solo uso; reintentar con el mismo identificador falla uniforme', async () => {
    const token = await toUsernameStep(w);
    await w.choose.execute(token, { username: 'nueva.persona' });
    expect((await failure(w.choose.execute(token, { username: 'otra.persona' }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
  });

  it('un username ocupado responde 409 y NO consume el estado: se puede elegir otro (REQ-LOG-002)', async () => {
    const token = await toUsernameStep(w);
    expect((await failure(w.choose.execute(token, { username: 'ANDRES' }))).code).toBe('ERR-AUTH-USERNAME-TAKEN');
    expect((await flowOf(w, token))!.consumedAt).toBeNull();
    expect(await w.choose.execute(token, { username: 'andres.google' })).toEqual({ accountStatus: 'PENDING' });
    expect((await w.h.uow.runInTransaction((r) => r.users.findByUsername('andres.google')))?.username).toBe('andres.google');
  });

  it('EDGE-008-027: el cuerpo es cerrado: rol, estado de cuenta o correo se rechazan con ERR-SCHEMA-VALIDATION-FAILED sin crear nada', async () => {
    const token = await toUsernameStep(w);
    const before = await countUsers(w);
    for (const extra of [{ role: 'PLATFORM_ADMIN' }, { accountStatus: 'ACTIVE' }, { email: 'otro@example.test' }, { password: 'Clave2026x' }]) {
      expect((await failure(w.choose.execute(token, { username: 'nueva.persona', ...extra }))).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    }
    expect(await countUsers(w)).toBe(before);
    expect((await flowOf(w, token))!.consumedAt).toBeNull();
  });

  it('sin cookie, con un estado de otra fase o ya vencido falla uniforme', async () => {
    const started = await w.start.execute();
    for (const token of [null, 'corto', started.oauthToken]) {
      expect((await failure(w.choose.execute(token, { username: 'nueva.persona' }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    }
    const usernameToken = await toUsernameStep(w);
    w.h.clock.setClock('2026-11-05', '2026-11-05T12:15:00.000Z');
    expect((await failure(w.choose.execute(usernameToken, { username: 'nueva.persona' }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
  });

  it('D8-14: libera el correo de una cuenta antigua SIN verificar, que conserva su usuario y su contraseña; la nueva conserva el correo verificado', async () => {
    await w.h.uow.runInTransaction(async (r) => {
      const maria = (await r.users.findById(MARIA))!;
      await r.users.update({ ...maria, email: EMAIL });
    });
    const token = await toUsernameStep(w);
    expect(await w.choose.execute(token, { username: 'nueva.persona' })).toEqual({ accountStatus: 'PENDING' });
    const created = await w.h.uow.runInTransaction((r) => r.users.findByUsername('nueva.persona'));
    const maria = await w.h.uow.runInTransaction((r) => r.users.findById(MARIA));
    expect(maria).toMatchObject({ id: MARIA, email: null });
    expect(maria!.passwordHash).toContain(PASSWORDS['maria.v']!);
    expect(created?.email).toBe(EMAIL);
    expect(await identitiesOf(w, MARIA)).toEqual([]);
  });

  it('EDGE-008-030: dos elecciones simultáneas con el mismo estado tienen UN ganador y la otra falla uniforme (nunca un 500)', async () => {
    const token = await toUsernameStep(w);
    const before = await countUsers(w);
    const results = await Promise.allSettled([w.choose.execute(token, { username: 'carrera.uno' }), w.choose.execute(token, { username: 'carrera.dos' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as CaughtDomainError).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await countUsers(w)).toBe(before + 1);
  });

  it('EDGE-008-030: si el sub ya tiene cuenta (otra pestaña terminó antes), insertar-o-recuperar devuelve ESA cuenta sin crear otra ni fallar', async () => {
    const tokenA = await toUsernameStep(w);
    const tokenB = await toUsernameStep(w);
    const first = await w.choose.execute(tokenA, { username: 'pestana.uno' });
    const before = await countUsers(w);
    const second = await w.choose.execute(tokenB, { username: 'pestana.dos' });
    expect([first, second]).toEqual([{ accountStatus: 'PENDING' }, { accountStatus: 'PENDING' }]); // 009: la cuenta recuperada sigue PENDING, sin sesión
    expect(await w.h.uow.runInTransaction((r) => r.users.findByUsername('pestana.dos'))).toBeNull();
    expect(await countUsers(w)).toBe(before);
  });
});

describe('T1120 vincular Google desde sesión activa (REQ-VIN8-002; ADR-008-14 (c))', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('exige la contraseña actual: con una incorrecta responde ERR-AUTH-INVALID-CREDENTIALS, cuenta el intento y no guarda estado', async () => {
    w.h.hasher.reset();
    expect((await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: 'MalaClave99' }))).code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect(w.h.hasher.calls.filter((c) => c.method === 'verify')).toHaveLength(1);
    const failures = await w.h.uow.runInTransaction((r) => r.loginAttempts.listFailures('andres'));
    expect(failures).toHaveLength(1);
  });

  it('con la contraseña correcta devuelve la URL de Google y guarda la intención LINK con el id de usuario', async () => {
    const started = await w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! });
    expect(started.authorizationUrl.startsWith('https://accounts.google.com/')).toBe(true);
    expect(await flowOf(w, started.oauthToken)).toMatchObject({ phase: 'AUTHORIZATION', intent: 'LINK', userId: ANDRES });
  });

  it('el cuerpo es cerrado y exige currentPassword', async () => {
    expect((await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']!, extra: 1 }))).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
    expect((await failure(w.link.execute(ANDRES, ORIGIN, {}))).code).toBe('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('ADR-008-14 (c): una cuenta sin contraseña (centinela) no tiene este flujo: se rechaza sin guardar estado', async () => {
    const googleUser = await bornWithGoogle(w);
    const error = await failure(w.link.execute(googleUser, ORIGIN, { currentPassword: NO_PASSWORD_SENTINEL }));
    expect(error.code).toBe('ERR-AUTH-GOOGLE-LINK-CONFLICT');
    expect(error.status).toBe(409);
    const flows = (w.h.uow as unknown as { state: { oauthFlows: OAuthFlowStateRecord[] } }).state.oauthFlows;
    expect(flows.filter((f) => f.intent === 'LINK')).toEqual([]);
  });

  it('una cuenta que ya tiene Google rechaza iniciar otra vinculación con ERR-AUTH-GOOGLE-LINK-CONFLICT', async () => {
    await w.h.uow.runInTransaction((r) => r.sessions.save(ORIGIN, { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null }));
    const started = await w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! });
    await w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) });
    expect(await identitiesOf(w, ANDRES)).toHaveLength(1);
    expect((await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! }))).code).toBe('ERR-AUTH-GOOGLE-LINK-CONFLICT');
  });

  /** Siembra una sesión de origen (la que inició la vinculación) con las marcas de tiempo dadas. */
  const seedSession = (token: string, userId: string, over: { createdAt?: string; lastActivityAt?: string; revokedAt?: string | null } = {}) =>
    w.h.uow.runInTransaction((r) => r.sessions.save(token, { userId, createdAt: NOW, lastActivityAt: NOW, revokedAt: null, ...over }));
  const sessionOf = (token: string) => w.h.uow.runInTransaction((r) => r.sessions.findByToken(token));
  const linkCallback = async (token = ORIGIN) => {
    w.oidc.identity = { sub: 'sub-de-andres', email: 'distinto@example.test' };
    const started = await w.link.execute(ANDRES, token, { currentPassword: PASSWORDS['andres']! });
    return { started, run: () => w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) }) };
  };

  it('[REQ-VIN8-004] [INV-VIN8-005] startGoogleLink guarda en el estado LINK el hash de la sesión de origen (el mismo SHA-256 de sessions.token_hash), nunca el token', async () => {
    await seedSession(ORIGIN, ANDRES);
    const started = await w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! });
    const row = await flowOf(w, started.oauthToken);
    expect(row).toMatchObject({ intent: 'LINK', userId: ANDRES, originSessionHash: sessionTokenHash(ORIGIN) });
    expect(JSON.stringify(row)).not.toContain(ORIGIN);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] callback LINK: vincula el sub a ESA cuenta, conserva la sesión de origen SIN renovarla, revoca las demás y NO entrega sesión ni token', async () => {
    await seedSession(ORIGIN, ANDRES);
    await seedSession('token-otra-sesion', ANDRES);
    await seedSession('token-de-maria', MARIA);
    const { run } = await linkCallback();
    const done = await run();
    expect(done).toEqual({ kind: 'LINKED' });
    expect(await identitiesOf(w, ANDRES)).toEqual([{ provider: 'GOOGLE', providerSubject: 'sub-de-andres', userId: ANDRES, createdAt: NOW }]);
    expect(await sessionOf(ORIGIN)).toEqual({ userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null });
    expect((await sessionOf('token-otra-sesion'))!.revokedAt).toBe(NOW);
    expect((await sessionOf('token-de-maria'))!.revokedAt).toBeNull();
    expect(await identitiesOf(w, MARIA)).toEqual([]);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] callback LINK con la sesión de origen revocada durante el flujo: 400 uniforme y no vincula', async () => {
    await seedSession(ORIGIN, ANDRES);
    const { run } = await linkCallback();
    await seedSession(ORIGIN, ANDRES, { revokedAt: NOW });
    expect((await failure(run())).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] callback LINK con la sesión de origen inexistente: 400 uniforme y no vincula', async () => {
    const { run } = await linkCallback('token-que-nunca-existio');
    expect((await failure(run())).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] callback LINK con la sesión de origen vencida por inactividad (30 min) estando el estado vigente: 400 y no vincula', async () => {
    w.h.clock.setClock('2026-11-05', '2026-11-05T11:40:00.000Z');
    await seedSession(ORIGIN, ANDRES, { createdAt: '2026-11-05T11:40:00.000Z', lastActivityAt: '2026-11-05T11:40:00.000Z' });
    w.h.clock.setClock('2026-11-05', NOW);
    const { run } = await linkCallback();
    w.h.clock.setClock('2026-11-05', '2026-11-05T12:11:00.000Z'); // estado vigente hasta 12:15; sesión vencida desde 12:10
    expect((await failure(run())).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] callback LINK con la sesión de origen vencida por el tope de 24 h estando activa: 400 y no vincula', async () => {
    await seedSession(ORIGIN, ANDRES, { createdAt: '2026-11-04T12:05:00.000Z', lastActivityAt: NOW });
    const { run } = await linkCallback();
    w.h.clock.setClock('2026-11-05', '2026-11-05T12:06:00.000Z');
    expect((await failure(run())).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
  });

  it('[REQ-VIN8-004] [INV-VIN8-005] callback LINK con la sesión de origen de OTRO usuario: 400 y no vincula', async () => {
    await seedSession(ORIGIN, MARIA);
    const { run } = await linkCallback();
    expect((await failure(run())).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
    expect(await identitiesOf(w, MARIA)).toEqual([]);
  });

  it('[INV-VIN8-005] callback LINK cuyo sub ya pertenece a otra cuenta falla uniforme y no añade identidades', async () => {
    await bornWithGoogle(w);
    await w.h.uow.runInTransaction((r) => r.sessions.save(ORIGIN, { userId: ANDRES, createdAt: NOW, lastActivityAt: NOW, revokedAt: null }));
    const started = await w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! });
    expect((await failure(w.complete.execute({ oauthToken: started.oauthToken, code: CODE, state: stateOf(started.authorizationUrl) }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
  });
});
