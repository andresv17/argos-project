/**
 * T1422 (pruebas rojas, Feature 010, Bloque D, [GH:#75]): declaración «Soy mayor de edad (18+)» validada en el servidor, con la MISMA batería sobre memoria, SQLite y PostgreSQL 17 real
 * (esta última se OMITE sin TEST_DATABASE_URL). D10-05 y H-03 (opción A) APPROVED por Neo, 2026-11-24. Contrato: `ERR-MEN10-ADULT-DECLARATION-REQUIRED` (422, catálogo 010).
 * Campo del cuerpo: `adultDeclaration` (booleano; solo `true` cuenta). Persistencia: `UserAccount.adultDeclaredAt` (reloj inyectado) y `UserAccount.adultNoticeVersion`
 * (columnas `adult_declared_at` y `adult_notice_version`, nulas en las cuentas anteriores). Sin fecha de nacimiento ni documento (REQ-MEN10-003).
 *
 * ROJO esperado hasta T1423 (columnas, contrato) y T1424 (validación y persistencia): hoy el registro acepta cuerpos sin declaración.
 * La carrera de dos pestañas (EDGE-010-005) y el orden Google (EDGE-010-010) usan los casos de uso reales con Google SIMULADO (sin red).
 *
 * @implements REQ-MEN10-001, REQ-MEN10-002, REQ-MEN10-003, INV-MEN10-001, EDGE-010-005, EDGE-010-010, SC-010-022, SC-010-023, SC-010-024
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { OAuthFlowStateRecord } from '../../../src/application/ports/auth-identity.port.ts';
import { LoginUseCase, RegisterUserUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import { ChooseGoogleUsernameUseCase, CompleteGoogleLoginUseCase, StartGoogleLoginUseCase } from '../../../src/application/use-cases/google-auth-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { hashOneTimeToken } from '../../../src/domain/auth/one-time-token.ts';
import { activateViaPorts, sessionOf } from '../../fixtures/active-accounts.ts';
import { ANDRES, PASSWORDS } from '../../fixtures/application-harness.ts';
import { GOOGLE_CODE, SequentialEntropy, fakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { ENGINE_NAMES, HAS_POSTGRES, openEngine, stateWith, type EngineName, type IdentityEngine } from '../../fixtures/identity-engines.ts';

const NOW = '2026-11-05T12:00:00.000Z';
const CODE_422 = 'ERR-MEN10-ADULT-DECLARATION-REQUIRED';
const PASSWORD = 'Clave2026x!';
const SEMVER = /^\d+\.\d+\.\d+$/;
const BODY = { username: 'solicitante.t1422', displayName: 'Solicitante', password: PASSWORD, confirmPassword: PASSWORD };

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});
async function open(name: EngineName): Promise<IdentityEngine> {
  const engine = await openEngine(name, stateWith([]));
  disposers.push(engine.dispose);
  return engine;
}

interface Caught {
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly field: string | null | undefined;
}
/** Resultado de una promesa: el error de dominio por forma (los códigos de 010 viven en un catálogo incremental) o `OK`. */
async function outcome(promise: Promise<unknown>): Promise<Caught | 'OK'> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    const e = error as Partial<Caught>;
    if (typeof e.code !== 'string' || typeof e.status !== 'number') throw error;
    return { code: e.code, status: e.status, message: String(e.message), field: e.field };
  }
}

interface Declared {
  readonly adultDeclaredAt?: string | null | undefined;
  readonly adultNoticeVersion?: string | null | undefined;
}
const declaredOf = async (engine: IdentityEngine, username: string): Promise<Declared | null> =>
  engine.read(async (r) => ((await r.users.findByUsername(username)) as Declared | null));
const countByUsername = async (engine: IdentityEngine, username: string): Promise<number> => {
  const found = await engine.read((r) => r.users.findByUsername(username));
  return found === null ? 0 : 1;
};
/** Valor temporal normalizado: SQLite guarda texto ISO y PostgreSQL devuelve un `Date`. */
const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString());

// ---------------------------------------------------------------- Google (casos de uso reales, Google simulado)
function google(engine: IdentityEngine) {
  const oidc = fakeGoogleOidc();
  const deps: ApplicationDeps = { ...engine.deps, google: { oidc, entropy: new SequentialEntropy() } };
  return { oidc, start: new StartGoogleLoginUseCase(deps), complete: new CompleteGoogleLoginUseCase(deps), choose: new ChooseGoogleUsernameUseCase(deps) };
}
const stateOf = (authorizationUrl: string): string => new URL(authorizationUrl).searchParams.get('state')!;
async function toUsernameStep(g: ReturnType<typeof google>): Promise<string> {
  const started = await g.start.execute();
  const done = await g.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
  if (done.kind !== 'CHOOSE_USERNAME') throw new Error(`se esperaba CHOOSE_USERNAME y llegó ${done.kind}`);
  return done.oauthToken;
}
const flowOf = (engine: IdentityEngine, token: string): Promise<OAuthFlowStateRecord | null> => engine.read((r) => r.oauthFlows.findByTokenHash(hashOneTimeToken(token)));

describe.each(ENGINE_NAMES)('T1422 declaración de mayoría de edad (%s)', (name) => {
  const skip = name === 'PostgreSQL' && !HAS_POSTGRES;
  const placeholder = name === 'PostgreSQL' ? '$1' : '?';
  // Postgres real es lento al sembrar: 120 s por prueba (las suites con TEST_DATABASE_URL se serializan en vite.config.ts).

  // ------------------------------------------------------------ registro con usuario y contraseña
  it.skipIf(skip)('[REQ-MEN10-001][SC-010-022] el registro SIN declaración (ausente, false, null, "true", 1, "") se rechaza con 422 ERR-MEN10-ADULT-DECLARATION-REQUIRED y no crea la cuenta', async () => {
    const engine = await open(name);
    const register = new RegisterUserUseCase(engine.deps);
    const variants: Array<Record<string, unknown>> = [
      { ...BODY },
      { ...BODY, adultDeclaration: false },
      { ...BODY, adultDeclaration: null },
      { ...BODY, adultDeclaration: 'true' },
      { ...BODY, adultDeclaration: 1 },
      { ...BODY, adultDeclaration: '' },
    ];
    for (const body of variants) {
      const result = await outcome(register.execute(body));
      expect(result, JSON.stringify(body)).toMatchObject({ code: CODE_422, status: 422 });
      expect(await countByUsername(engine, BODY.username)).toBe(0);
    }
  }, 120_000);

  it.skipIf(skip)('[REQ-MEN10-001][SC-010-022][REQ-MEN10-003] con adultDeclaration: true la cuenta nace PENDING y guarda adult_declared_at (reloj inyectado) y adult_notice_version; nada de fecha de nacimiento', async () => {
    const engine = await open(name);
    const created = await new RegisterUserUseCase(engine.deps).execute({ ...BODY, adultDeclaration: true });
    expect(created).toEqual({ accountStatus: 'PENDING' });
    const stored = await declaredOf(engine, BODY.username);
    expect(stored?.adultDeclaredAt).toBe(NOW);
    expect(stored?.adultNoticeVersion).toMatch(SEMVER);
    const columns = await engine.rawQuery(`SELECT adult_declared_at, adult_notice_version FROM users WHERE LOWER(username) = LOWER(${placeholder})`, [BODY.username]);
    if (columns !== null) {
      expect(columns).toHaveLength(1);
      expect(iso(columns[0]!['adult_declared_at'])).toBe(NOW);
      expect(columns[0]!['adult_notice_version']).toBe(stored?.adultNoticeVersion);
    }
    const names = engine.sqlite === null ? null : (engine.sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
    if (names !== null) expect(names.filter((n) => /birth|born|nacim|document/i.test(n))).toEqual([]);
  }, 120_000);

  it.skipIf(skip)('[INV-MEN10-001][SC-010-023] el rechazo es UNIFORME: un username ya existente y uno libre reciben el mismo código, estado, mensaje y campo (no revela existencia de usuario ni correo)', async () => {
    const engine = await open(name);
    const register = new RegisterUserUseCase(engine.deps);
    const free = await outcome(register.execute({ ...BODY, email: 'libre@example.test' }));
    const takenUsername = await outcome(register.execute({ ...BODY, username: 'andres' }));
    const takenCase = await outcome(register.execute({ ...BODY, username: 'ANDRES' }));
    const takenEmail = await outcome(register.execute({ ...BODY, email: 'andres@example.test' }));
    expect(free).toMatchObject({ code: CODE_422, status: 422 });
    expect(takenUsername).toEqual(free);
    expect(takenCase).toEqual(free);
    expect(takenEmail).toEqual(free);
    expect((free as Caught).message).not.toMatch(/andres|existe|ocupad|tomad|correo|taken|email/i);
  }, 120_000);

  it.skipIf(skip)('[INV-MEN10-001] la declaración se valida ANTES de consultar la existencia del username: con declaración y username ocupado sigue siendo ERR-AUTH-USERNAME-TAKEN; sin ella, ERR-MEN10', async () => {
    const engine = await open(name);
    const register = new RegisterUserUseCase(engine.deps);
    expect(await outcome(register.execute({ ...BODY, username: 'andres', adultDeclaration: true }))).toMatchObject({ code: 'ERR-AUTH-USERNAME-TAKEN', status: 409 });
    expect(await outcome(register.execute({ ...BODY, username: 'andres' }))).toMatchObject({ code: CODE_422, status: 422 });
  }, 120_000);

  // ------------------------------------------------------------ cuentas anteriores intactas
  it.skipIf(skip)('[REQ-MEN10-002][SC-010-024] las cuentas anteriores quedan con adult_declared_at y adult_notice_version nulos, siguen entrando sin declaración y no se les exige nada', async () => {
    const engine = await open(name);
    const rows = await engine.rawQuery(`SELECT adult_declared_at, adult_notice_version FROM users WHERE id = ${placeholder}`, [ANDRES]);
    if (rows !== null) expect(rows).toEqual([{ adult_declared_at: null, adult_notice_version: null }]);
    const before = await declaredOf(engine, 'andres');
    expect(before?.adultDeclaredAt ?? null).toBeNull();
    expect(before?.adultNoticeVersion ?? null).toBeNull();
    // Una cuenta nueva con declaración no modifica a las anteriores.
    await new RegisterUserUseCase(engine.deps).execute({ ...BODY, adultDeclaration: true });
    expect((await declaredOf(engine, 'andres'))?.adultDeclaredAt ?? null).toBeNull();
    // Y la cuenta anterior sigue iniciando sesión sin declaración.
    const session = sessionOf(await new LoginUseCase(engine.deps).execute({ username: 'andres', password: PASSWORDS['andres'] }));
    expect(session.session.user.id).toBe(ANDRES);
  }, 120_000);

  it.skipIf(skip)('[REQ-MEN10-002] activar una cuenta nueva (aprobación) no altera adult_declared_at ni adult_notice_version', async () => {
    const engine = await open(name);
    await new RegisterUserUseCase(engine.deps).execute({ ...BODY, adultDeclaration: true });
    const before = await declaredOf(engine, BODY.username);
    await activateViaPorts(engine.uow, BODY.username);
    const after = await declaredOf(engine, BODY.username);
    expect(after?.adultDeclaredAt).toBe(before?.adultDeclaredAt);
    expect(after?.adultNoticeVersion).toBe(before?.adultNoticeVersion);
    expect(after?.adultDeclaredAt).toBe(NOW);
  }, 120_000);

  // ------------------------------------------------------------ Google: validación antes de consumir el estado (H-03 opción A)
  it.skipIf(skip)('[REQ-MEN10-001][EDGE-010-010] Google sin declaración: 422 ERR-MEN10; el estado OAuth USERNAME NO se consume; no se crea cuenta ni identidad', async () => {
    const engine = await open(name);
    const g = google(engine);
    const token = await toUsernameStep(g);
    for (const body of [{ username: 'nueva.persona' }, { username: 'nueva.persona', adultDeclaration: false }, { username: 'nueva.persona', adultDeclaration: 'true' }]) {
      expect(await outcome(g.choose.execute(token, body)), JSON.stringify(body)).toMatchObject({ code: CODE_422, status: 422 });
      const flow = await flowOf(engine, token);
      expect(flow?.phase).toBe('USERNAME');
      expect(flow?.consumedAt ?? null).toBeNull();
      expect(await countByUsername(engine, 'nueva.persona')).toBe(0);
    }
  }, 120_000);

  it.skipIf(skip)('[EDGE-010-010][REQ-MEN10-001][SC-010-022] tras el 422 el MISMO estado sigue válido: el reintento con adultDeclaration: true crea la cuenta PENDING con declaración y versión, y ahora sí consume el estado', async () => {
    const engine = await open(name);
    const g = google(engine);
    const token = await toUsernameStep(g);
    expect(await outcome(g.choose.execute(token, { username: 'nueva.persona' }))).toMatchObject({ code: CODE_422 });
    expect(await g.choose.execute(token, { username: 'nueva.persona', adultDeclaration: true })).toEqual({ accountStatus: 'PENDING' });
    const stored = await declaredOf(engine, 'nueva.persona');
    expect(stored?.adultDeclaredAt).toBe(NOW);
    expect(stored?.adultNoticeVersion).toMatch(SEMVER);
    expect((await flowOf(engine, token))?.consumedAt).toBe(NOW);
  }, 120_000);

  it.skipIf(skip)('[INV-MEN10-001][SC-010-023] Google: el 422 por falta de declaración es idéntico con un username libre y con uno ocupado (no revela existencia)', async () => {
    const engine = await open(name);
    const g = google(engine);
    const token = await toUsernameStep(g);
    const free = await outcome(g.choose.execute(token, { username: 'nueva.persona' }));
    const taken = await outcome(g.choose.execute(token, { username: 'andres' }));
    expect(free).toMatchObject({ code: CODE_422, status: 422 });
    expect(taken).toEqual(free);
  }, 120_000);

  it.skipIf(skip)('[REQ-MEN10-001][EDGE-010-010] Google con declaración y username ocupado sigue siendo ERR-AUTH-USERNAME-TAKEN (la declaración no oculta otros errores)', async () => {
    const engine = await open(name);
    const g = google(engine);
    const token = await toUsernameStep(g);
    expect(await outcome(g.choose.execute(token, { username: 'andres', adultDeclaration: true }))).toMatchObject({ code: 'ERR-AUTH-USERNAME-TAKEN', status: 409 });
  }, 120_000);

  // ------------------------------------------------------------ carrera de dos pestañas (EDGE-010-005)
  it.skipIf(skip)('[EDGE-010-005][EDGE-010-010] dos pestañas con el mismo estado, una SIN casilla y otra CON: la primera recibe 422, la segunda crea UNA cuenta; el orden de llegada no cambia el resultado', async () => {
    for (const withFirst of [false, true]) {
      const engine = await open(name);
      const g = google(engine);
      const token = await toUsernameStep(g);
      const without = () => outcome(g.choose.execute(token, { username: 'pestana.uno' }));
      const withDecl = () => outcome(g.choose.execute(token, { username: 'pestana.uno', adultDeclaration: true }));
      const settled = withFirst ? await Promise.all([withDecl(), without()]) : await Promise.all([without(), withDecl()]);
      const [a, b] = withFirst ? [settled[1]!, settled[0]!] : [settled[0]!, settled[1]!];
      expect(a, 'pestaña sin casilla').toMatchObject({ code: CODE_422, status: 422 });
      expect(b, 'pestaña con casilla').toBe('OK');
      expect(await countByUsername(engine, 'pestana.uno')).toBe(1);
      expect((await declaredOf(engine, 'pestana.uno'))?.adultDeclaredAt).toBe(NOW);
    }
  }, 120_000);

  it.skipIf(skip)('[EDGE-010-005] pestaña sin casilla DESPUÉS de que la otra creó la cuenta: la declaración se exige igual (422) y no se filtra que la cuenta ya existe', async () => {
    const engine = await open(name);
    const g = google(engine);
    const token = await toUsernameStep(g);
    expect(await g.choose.execute(token, { username: 'pestana.dos', adultDeclaration: true })).toEqual({ accountStatus: 'PENDING' });
    expect(await outcome(g.choose.execute(token, { username: 'pestana.dos' }))).toMatchObject({ code: CODE_422, status: 422 });
    expect(await countByUsername(engine, 'pestana.dos')).toBe(1);
  }, 120_000);
});
