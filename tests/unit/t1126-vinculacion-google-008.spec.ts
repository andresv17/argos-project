import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChooseGoogleUsernameUseCase,
  CompleteGoogleLoginUseCase,
  StartGoogleLinkUseCase,
  StartGoogleLoginUseCase,
} from '../../src/application/use-cases/google-auth-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from '../fixtures/google-fixtures.ts';
import { ANDRES, MARIA, PASSWORDS, createHarness, type Harness } from '../fixtures/application-harness.ts';

/**
 * T1126 (pruebas rojas, Feature 008, Bloque B, [GH:#17]): vinculación segura de Google desde la sesión activa (Google SIMULADO).
 * REQ-VIN8-002, REQ-VIN8-003, REQ-VIN8-004, INV-VIN8-001, INV-VIN8-002, INV-VIN8-003, INV-VIN8-005, EDGE-008-003, EDGE-008-004, EDGE-008-023, EDGE-008-050, ADR-008-02;
 * SC-008-010..012, SC-008-014, SC-008-063. Complementa t1120-google-use-cases-008 (que cubre la rama LINK básica) con contador de intentos, estados huérfanos, carreras y pruebas negativas.
 */

const NOW = '2026-11-05T12:00:00.000Z';
const ORIGIN = 'token-sesion-origen';
const SUB_ANDRES = 'google-sub-de-andres';

interface World {
  readonly h: Harness;
  readonly oidc: FakeGoogleOidc;
  readonly start: StartGoogleLoginUseCase;
  readonly complete: CompleteGoogleLoginUseCase;
  readonly choose: ChooseGoogleUsernameUseCase;
  readonly link: StartGoogleLinkUseCase;
}

function world(): World {
  const h = createHarness();
  const oidc = fakeGoogleOidc();
  const deps: ApplicationDeps = { ...h.deps, google: { oidc, entropy: new SequentialEntropy() } };
  return { h, oidc, start: new StartGoogleLoginUseCase(deps), complete: new CompleteGoogleLoginUseCase(deps), choose: new ChooseGoogleUsernameUseCase(deps), link: new StartGoogleLinkUseCase(deps) };
}

const stateOf = (authorizationUrl: string): string => new URL(authorizationUrl).searchParams.get('state')!;
const identitiesOf = (w: World, userId: string) => w.h.uow.runInTransaction((r) => r.authIdentities.listByUser(userId));
const memory = (w: World) => (w.h.uow as unknown as { state: { oauthFlows: Array<{ intent: string }>; users: Array<{ id: string; username: string; email: string | null; emailVerifiedAt?: string }>; auditLog: unknown[] } }).state;
const seedSession = (w: World, token: string, userId: string, revokedAt: string | null = null) =>
  w.h.uow.runInTransaction((r) => r.sessions.save(token, { userId, createdAt: NOW, lastActivityAt: NOW, revokedAt }));
const sessionOf = (w: World, token: string) => w.h.uow.runInTransaction((r) => r.sessions.findByToken(token));

async function failure(promise: Promise<unknown>): Promise<{ code: string; status: number; toProblemDetails(instance: string): unknown }> {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({ code: expect.stringMatching(/^ERR-/), status: expect.any(Number) });
    return error as { code: string; status: number; toProblemDetails(instance: string): unknown };
  }
  throw new Error('se esperaba un error de dominio');
}

/** Inicia la vinculación de `userId` con la contraseña actual correcta y devuelve el cierre del retorno de Google. */
async function startLink(w: World, userId: string, username: string, sub: string, email = GOOGLE_EMAIL, token = ORIGIN) {
  await seedSession(w, token, userId);
  w.oidc.identity = { sub, email };
  const started = await w.link.execute(userId, token, { currentPassword: PASSWORDS[username]! });
  return () => w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
}

describe('T1126 startGoogleLink: contraseña actual y contador de intentos (REQ-VIN8-002; SC-008-010, SC-008-011)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('[REQ-VIN8-002] SC-008-011: una contraseña incorrecta no guarda estado LINK, no vincula y no revoca sesiones', async () => {
    await seedSession(w, ORIGIN, ANDRES);
    await seedSession(w, 'otra-sesion', ANDRES);
    expect((await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: 'MalaClave99' }))).code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect(memory(w).oauthFlows).toEqual([]);
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
    expect((await sessionOf(w, 'otra-sesion'))!.revokedAt).toBeNull();
  });

  it('[REQ-VIN8-002] el contador de intentos es el de REQ-LOG-001: tras MAX_FAILED_ATTEMPTS fallos hasta la contraseña correcta se rechaza con ERR-AUTH-TOO-MANY-ATTEMPTS y no se guarda estado', async () => {
    await seedSession(w, ORIGIN, ANDRES);
    for (let i = 0; i < 5; i += 1) expect((await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: `MalaClave${i}x` }))).code).toBe('ERR-AUTH-INVALID-CREDENTIALS');
    expect(await w.h.uow.runInTransaction((r) => r.loginAttempts.listFailures('andres'))).toHaveLength(5);
    expect((await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! }))).code).toBe('ERR-AUTH-TOO-MANY-ATTEMPTS');
    expect(memory(w).oauthFlows).toEqual([]);
  });

  it('[REQ-VIN8-002] sin sesión (usuario inexistente o sin cuenta) responde ERR-AUTH-UNAUTHENTICATED sin tocar el verificador de contraseñas ni guardar estado', async () => {
    w.h.hasher.reset();
    expect((await failure(w.link.execute('00000000-0000-4000-8000-0000000000ff', ORIGIN, { currentPassword: PASSWORDS['andres']! }))).code).toBe('ERR-AUTH-UNAUTHENTICATED');
    expect(w.h.hasher.calls).toEqual([]);
    expect(memory(w).oauthFlows).toEqual([]);
  });

  it('[INV-VIN8-001] el cuerpo del 401 por contraseña incorrecta es el mismo para cualquier usuario y no revela si la cuenta tiene Google ya vinculado', async () => {
    await seedSession(w, ORIGIN, ANDRES);
    await seedSession(w, 'sesion-maria', MARIA);
    const done = await startLink(w, MARIA, 'maria.v', SUB_ANDRES, GOOGLE_EMAIL, 'sesion-maria');
    await done();
    const withGoogle = await failure(w.link.execute(MARIA, 'sesion-maria', { currentPassword: 'MalaClave99' }));
    const without = await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: 'MalaClave99' }));
    expect(withGoogle).toMatchObject({ code: 'ERR-AUTH-INVALID-CREDENTIALS', status: 401 });
    expect(without).toMatchObject({ code: 'ERR-AUTH-INVALID-CREDENTIALS', status: 401 });
    // OBS-1: el cuerpo completo (type, title, detail, instance, code) es idéntico, no solo code y status.
    expect(JSON.stringify(withGoogle.toProblemDetails('/api/auth/google/link'))).toBe(JSON.stringify(without.toProblemDetails('/api/auth/google/link')));
  });
});

describe('T1126 startGoogleLink: 409 ERR-AUTH-GOOGLE-LINK-CONFLICT solo aquí (decisión A de Neo; REQ-VIN8-002, ADR-008-02; SC-008-014)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('[INV-VIN8-002] una cuenta que YA tiene Google rechaza iniciar otra vinculación con 409 ERR-AUTH-GOOGLE-LINK-CONFLICT, sin guardar un segundo estado LINK ni tocar la identidad', async () => {
    await (await startLink(w, ANDRES, 'andres', SUB_ANDRES))();
    const antes = await identitiesOf(w, ANDRES);
    const flows = memory(w).oauthFlows.length;
    const error = await failure(w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! }));
    expect(error).toMatchObject({ code: 'ERR-AUTH-GOOGLE-LINK-CONFLICT', status: 409 });
    expect(memory(w).oauthFlows).toHaveLength(flows);
    expect(await identitiesOf(w, ANDRES)).toEqual(antes);
  });

  it('[INV-VIN8-002] OBS-5: una cuenta nacida con Google (sin contraseña) tampoco inicia vinculación: 409 ERR-AUTH-GOOGLE-LINK-CONFLICT sin estado LINK (ver también t1120 L333 y L342)', async () => {
    w.oidc.identity = { sub: SUB_ANDRES, email: GOOGLE_EMAIL };
    const started = await w.start.execute();
    const step = await w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
    if (step.kind !== 'CHOOSE_USERNAME') throw new Error('se esperaba CHOOSE_USERNAME');
    expect(await w.choose.execute(step.oauthToken, { username: 'nacida.google' })).toEqual({ accountStatus: 'PENDING' }); // 009: nace PENDING y sin sesión
    const bornId = memory(w).users.find((u) => u.username === 'nacida.google')!.id;
    await seedSession(w, 'sesion-google', bornId);
    const error = await failure(w.link.execute(bornId, 'sesion-google', { currentPassword: 'CualquierClave99' }));
    expect(error).toMatchObject({ code: 'ERR-AUTH-GOOGLE-LINK-CONFLICT', status: 409 });
    expect(memory(w).oauthFlows.filter((f) => f.intent === 'LINK')).toEqual([]);
  });
});

describe('T1126 callback LINK: un sub, una cuenta; al menos un método (INV-VIN8-002, INV-VIN8-003, ADR-008-02; SC-008-014)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('[INV-VIN8-002] un sub ya vinculado a OTRA cuenta con contraseña no se vincula a una segunda: falla uniforme y la identidad original queda intacta', async () => {
    await (await startLink(w, MARIA, 'maria.v', SUB_ANDRES, GOOGLE_EMAIL, 'sesion-maria'))();
    const maria = await identitiesOf(w, MARIA);
    expect(maria).toEqual([{ provider: 'GOOGLE', providerSubject: SUB_ANDRES, userId: MARIA, createdAt: NOW }]);
    const retry = await startLink(w, ANDRES, 'andres', SUB_ANDRES);
    expect((await failure(retry())).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toEqual([]);
    expect(await identitiesOf(w, MARIA)).toEqual(maria);
  });

  it('[INV-VIN8-002] dos vinculaciones iniciadas antes de completar ninguna: gana UNA y la otra falla uniforme sin segunda fila', async () => {
    await seedSession(w, ORIGIN, ANDRES);
    w.oidc.identity = { sub: SUB_ANDRES, email: GOOGLE_EMAIL };
    const a = await w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! });
    const b = await w.link.execute(ANDRES, ORIGIN, { currentPassword: PASSWORDS['andres']! });
    const run = (s: { oauthToken: string; authorizationUrl: string }) => w.complete.execute({ oauthToken: s.oauthToken, code: GOOGLE_CODE, state: stateOf(s.authorizationUrl) });
    expect(await run(a)).toEqual({ kind: 'LINKED' });
    expect((await failure(run(b))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(await identitiesOf(w, ANDRES)).toHaveLength(1);
  });

  it('[INV-VIN8-003] vincular conserva la contraseña: la cuenta termina con contraseña E identidad (no se sustituye ningún método)', async () => {
    await (await startLink(w, ANDRES, 'andres', SUB_ANDRES))();
    const account = await w.h.uow.runInTransaction((r) => r.users.findById(ANDRES));
    expect(account!.passwordHash).toContain(PASSWORDS['andres']!);
    expect(await identitiesOf(w, ANDRES)).toHaveLength(1);
  });
});

describe('T1126 pre-hijacking y correo (REQ-VIN8-001, REQ-VIN8-003, INV-VIN8-005, EDGE-008-003, EDGE-008-004, EDGE-008-023; SC-008-012)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('[INV-VIN8-005] vincular desde la sesión NO depende del correo: con el correo de Google igual al de un titular verificado de otra cuenta se vincula a la cuenta de la sesión y no se toca la otra', async () => {
    const holder = memory(w).users.find((u) => u.id === MARIA)!;
    holder.email = GOOGLE_EMAIL;
    holder.emailVerifiedAt = NOW;
    const before = JSON.stringify(holder);
    expect(await (await startLink(w, ANDRES, 'andres', SUB_ANDRES, GOOGLE_EMAIL))()).toEqual({ kind: 'LINKED' });
    expect(await identitiesOf(w, ANDRES)).toHaveLength(1);
    expect(await identitiesOf(w, MARIA)).toEqual([]);
    expect(JSON.stringify(memory(w).users.find((u) => u.id === MARIA))).toBe(before);
  });

  it('[INV-VIN8-005] [EDGE-008-003] el flujo de ALTA (LOGIN) con el correo de una cuenta sin verificar nunca añade una identidad a ESA cuenta, aunque exista una sesión suya vigente', async () => {
    const attacker = memory(w).users.find((u) => u.id === MARIA)!;
    attacker.email = GOOGLE_EMAIL;
    delete attacker.emailVerifiedAt;
    await seedSession(w, 'sesion-atacante', MARIA);
    w.oidc.identity = { sub: 'sub-victima', email: GOOGLE_EMAIL };
    const started = await w.start.execute();
    const step = await w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
    expect(step.kind).toBe('CHOOSE_USERNAME');
    expect(await identitiesOf(w, MARIA)).toEqual([]);
    if (step.kind !== 'CHOOSE_USERNAME') throw new Error('inalcanzable');
    expect(await w.choose.execute(step.oauthToken, { username: 'victima.real' })).toEqual({ accountStatus: 'PENDING' });
    const createdId = memory(w).users.find((u) => u.username === 'victima.real')!.id;
    expect(createdId).not.toBe(MARIA);
    expect(await identitiesOf(w, MARIA)).toEqual([]);
    expect(await identitiesOf(w, createdId)).toHaveLength(1);
    expect((await sessionOf(w, 'sesion-atacante'))!.revokedAt).toBeNull();
  });

  it('[REQ-VIN8-004] [SC-008-063] la auditoría de la vinculación es USER/UPDATE y no contiene el sub ni el correo de Google', async () => {
    await (await startLink(w, ANDRES, 'andres', SUB_ANDRES, 'secreto@example.test'))();
    const audit = JSON.stringify(memory(w).auditLog);
    expect(audit).toContain('"UPDATE"');
    expect(audit).toContain('"USER"');
    expect(audit).not.toContain(SUB_ANDRES);
    expect(audit).not.toContain('secreto@example.test');
  });
});
