import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChooseGoogleUsernameUseCase,
  CompleteGoogleLoginUseCase,
  StartGoogleLoginUseCase,
} from '../../src/application/use-cases/google-auth-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { GOOGLE_CODE, GOOGLE_EMAIL, GOOGLE_SUB, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from '../fixtures/google-fixtures.ts';
import { CARLOS, MARIA, PASSWORDS, createHarness, type Harness } from '../fixtures/application-harness.ts';

/**
 * T1125 (pruebas rojas, Feature 008, Bloque B, [GH:#17]): fallo uniforme del acceso con Google cuando el correo coincide con el de cuentas existentes (Google SIMULADO).
 * REQ-VIN8-001, REQ-VIN8-003, INV-VIN8-001, INV-VIN8-005; EDGE-008-003, EDGE-008-004, EDGE-008-023; SC-008-009, SC-008-012.
 * Familias: correo ya titular VERIFICADO de otra cuenta => `ERR-AUTH-GOOGLE-FAILED` (mismo estado, cuerpo y coste); correo SIN verificar (una o varias cuentas) => regla de D8-14.
 */

const NOW = '2026-11-05T12:00:00.000Z';
const EMAIL = GOOGLE_EMAIL;

interface World {
  readonly h: Harness;
  readonly oidc: FakeGoogleOidc;
  readonly start: StartGoogleLoginUseCase;
  readonly complete: CompleteGoogleLoginUseCase;
  readonly choose: ChooseGoogleUsernameUseCase;
}

function world(): World {
  const h = createHarness();
  const oidc = fakeGoogleOidc();
  const deps: ApplicationDeps = { ...h.deps, google: { oidc, entropy: new SequentialEntropy() } };
  return { h, oidc, start: new StartGoogleLoginUseCase(deps), complete: new CompleteGoogleLoginUseCase(deps), choose: new ChooseGoogleUsernameUseCase(deps) };
}

const stateOf = (authorizationUrl: string): string => new URL(authorizationUrl).searchParams.get('state')!;
const usersOf = (w: World) => (w.h.uow as unknown as { state: { users: Array<{ id: string; username: string; email: string | null; emailVerifiedAt?: string; passwordHash: string }> } }).state.users;
const identitiesOf = (w: World, userId: string) => w.h.uow.runInTransaction((r) => r.authIdentities.listByUser(userId));
const allIdentityCount = async (w: World): Promise<number> => {
  let total = 0;
  for (const u of usersOf(w)) total += (await identitiesOf(w, u.id)).length;
  return total;
};

/** Da a una cuenta del arnés el correo (verificado o no). `users.update` nunca toca `email_verified_at` (EDGE-008-036): la marca se siembra directo en el estado. */
async function giveEmail(w: World, userId: string, email: string, verified: boolean): Promise<void> {
  const account = usersOf(w).find((u) => u.id === userId)!;
  account.email = email;
  if (verified) account.emailVerifiedAt = NOW;
  else delete account.emailVerifiedAt;
}

interface Observed {
  readonly code: string;
  readonly status: number;
  readonly body: string;
  readonly hasherCalls: number;
  readonly googleCompletions: number;
}

async function observe(w: World, run: () => Promise<unknown>): Promise<Observed> {
  w.h.hasher.reset();
  const before = w.oidc.completions.length;
  try {
    await run();
  } catch (error) {
    const e = error as { code: string; status: number; toProblemDetails(instance: string): unknown };
    expect(e).toMatchObject({ code: expect.stringMatching(/^ERR-/), status: expect.any(Number) });
    return { code: e.code, status: e.status, body: JSON.stringify(e.toProblemDetails('/api/auth/google/callback')), hasherCalls: w.h.hasher.calls.length, googleCompletions: w.oidc.completions.length - before };
  }
  throw new Error('se esperaba un error de dominio');
}

const callbackOf = async (w: World): Promise<() => Promise<unknown>> => {
  const started = await w.start.execute();
  return () => w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
};

describe('T1125 correo titular verificado de otra cuenta: fallo uniforme (REQ-VIN8-001, INV-VIN8-001; SC-008-009, SC-008-012)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('[REQ-VIN8-001] [INV-VIN8-001] un titular verificado con el correo en otra capitalización o con espacios en el de Google produce el mismo fallo, sin crear ni vincular nada', async () => {
    await giveEmail(w, MARIA, 'Persona@Example.TEST', true);
    w.oidc.identity = { sub: 'otro-sub', email: `  ${EMAIL.toUpperCase()} ` };
    const users = usersOf(w).length;
    const run = await callbackOf(w);
    expect(await observe(w, run)).toMatchObject({ code: 'ERR-AUTH-GOOGLE-FAILED', status: 400 });
    expect(usersOf(w)).toHaveLength(users);
    expect(await allIdentityCount(w)).toBe(0);
  });

  it('[INV-VIN8-001] SC-008-012: el titular verificado de contraseña, el titular nacido con Google y el que aparece entre el retorno y la elección de usuario dan el MISMO estado, cuerpo y coste', async () => {
    const seen: Observed[] = [];

    // (a) titular verificado con contraseña (cuenta heredada cuyo correo ya consta verificado).
    await giveEmail(w, MARIA, EMAIL, true);
    w.oidc.identity = { sub: 'sub-a', email: EMAIL };
    seen.push(await observe(w, await callbackOf(w)));

    // (b) titular nacido con Google (otro sub).
    const w2 = world();
    w2.oidc.identity = { sub: GOOGLE_SUB, email: EMAIL };
    const first = await w2.start.execute();
    const pending = await w2.complete.execute({ oauthToken: first.oauthToken, code: GOOGLE_CODE, state: stateOf(first.authorizationUrl) });
    if (pending.kind !== 'CHOOSE_USERNAME') throw new Error('se esperaba CHOOSE_USERNAME');
    await w2.choose.execute(pending.oauthToken, { username: 'titular.google', adultDeclaration: true });
    w2.oidc.identity = { sub: 'sub-b', email: EMAIL };
    seen.push(await observe(w2, await callbackOf(w2)));

    // (c) el titular verificado aparece DESPUÉS del callback y ANTES de elegir usuario.
    const w3 = world();
    w3.oidc.identity = { sub: 'sub-c', email: EMAIL };
    const started = await w3.start.execute();
    const step = await w3.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
    if (step.kind !== 'CHOOSE_USERNAME') throw new Error('se esperaba CHOOSE_USERNAME');
    await giveEmail(w3, CARLOS, EMAIL, true);
    seen.push(await observe(w3, () => w3.choose.execute(step.oauthToken, { username: 'nueva.persona', adultDeclaration: true })));

    for (const o of seen) expect(o).toMatchObject({ code: 'ERR-AUTH-GOOGLE-FAILED', status: 400 });
    expect(new Set(seen.map((o) => o.body)).size).toBe(1);
    // Coste: el verificador de contraseñas no interviene en ninguno y el flujo cuesta lo mismo (un solo canje en Google en el retorno; ninguno al elegir usuario).
    expect(seen.map((o) => o.hasherCalls)).toEqual([0, 0, 0]);
    // (a) y (b) canjean una vez en Google en el retorno; (c) es la elección de usuario y no vuelve a llamar a Google (OBS-2).
    expect(seen.map((o) => o.googleCompletions)).toEqual([1, 1, 0]);
  });

  it('[INV-VIN8-001] el cuerpo del fallo por titular verificado es idéntico al de cualquier otro fallo del callback y no revela la causa (ni correo ni sub)', async () => {
    await giveEmail(w, MARIA, EMAIL, true);
    w.oidc.identity = { sub: 'sub-secreto-9', email: EMAIL };
    const byEmail = await observe(w, await callbackOf(w));
    const started = await w.start.execute();
    const byCancel = await observe(w, () => w.complete.execute({ oauthToken: started.oauthToken, error: 'access_denied', state: stateOf(started.authorizationUrl) }));
    expect(byEmail.body).toBe(byCancel.body);
    expect(byEmail.body).not.toMatch(/persona@|sub-secreto|verificad|existe|already|exist/i);
  });

  it('[INV-VIN8-005] EDGE-008-004: si al elegir usuario aparece un titular VERIFICADO además de uno sin verificar, el fallo uniforme revierte todo: la cuenta sin verificar conserva su correo y no hay cuenta ni identidad nuevas', async () => {
    await giveEmail(w, MARIA, EMAIL, false);
    w.oidc.identity = { sub: 'sub-d', email: EMAIL };
    const started = await w.start.execute();
    const step = await w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
    if (step.kind !== 'CHOOSE_USERNAME') throw new Error('se esperaba CHOOSE_USERNAME');
    await giveEmail(w, CARLOS, EMAIL, true);
    const users = usersOf(w).length;
    expect((await observe(w, () => w.choose.execute(step.oauthToken, { username: 'nueva.persona', adultDeclaration: true }))).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(usersOf(w).find((u) => u.id === MARIA)!.email).toBe(EMAIL);
    expect(usersOf(w).find((u) => u.id === CARLOS)!.email).toBe(EMAIL);
    expect(usersOf(w)).toHaveLength(users);
    expect(await allIdentityCount(w)).toBe(0);
  });
});

describe('T1125 correo sin verificar: regla de D8-14, nunca autovinculación (REQ-VIN8-003, INV-VIN8-005; EDGE-008-003, EDGE-008-004, EDGE-008-023; SC-008-012)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  async function googleSignUp(username: string) {
    const started = await w.start.execute();
    const step = await w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) });
    if (step.kind !== 'CHOOSE_USERNAME') throw new Error(`se esperaba CHOOSE_USERNAME y llegó ${step.kind}`);
    const session = await w.choose.execute(step.oauthToken, { username, adultDeclaration: true });
    expect(session).toEqual({ accountStatus: 'PENDING' }); // 009 (EDGE-009-006): la cuenta nace PENDING y no inicia sesión
    return { step, session, account: usersOf(w).find((u) => u.username === username)! };
  }

  it('[EDGE-008-003] [EDGE-008-023] cuenta sin verificar con el correo de la víctima (pre-hijacking): la víctima entra con Google, NO queda vinculada a la cuenta del atacante y recibe su cuenta propia con correo verificado', async () => {
    await giveEmail(w, MARIA, EMAIL, false);
    const { step, account } = await googleSignUp('victima.real');
    expect(step.kind).toBe('CHOOSE_USERNAME');
    expect(account.id).not.toBe(MARIA);
    expect(account.email).toBe(EMAIL);
    expect(await identitiesOf(w, MARIA)).toEqual([]);
    const maria = usersOf(w).find((u) => u.id === MARIA)!;
    expect(maria.email).toBeNull();
    expect(maria.emailVerifiedAt).toBeUndefined();
    expect(maria.passwordHash).toContain(PASSWORDS['maria.v']!);
    expect(usersOf(w).filter((u) => u.email !== null && u.email.toLowerCase() === EMAIL && u.emailVerifiedAt !== undefined)).toHaveLength(1);
  });

  it('[EDGE-008-004] dos o más cuentas sin verificar con el mismo correo (distinta capitalización): todas dejan de ser titulares y se crea UNA cuenta nueva con el sub', async () => {
    await giveEmail(w, MARIA, EMAIL, false);
    await giveEmail(w, CARLOS, EMAIL.toUpperCase(), false);
    const { account } = await googleSignUp('titular.nuevo');
    expect(usersOf(w).find((u) => u.id === MARIA)!.email).toBeNull();
    expect(usersOf(w).find((u) => u.id === CARLOS)!.email).toBeNull();
    expect(await identitiesOf(w, MARIA)).toEqual([]);
    expect(await identitiesOf(w, CARLOS)).toEqual([]);
    expect(await identitiesOf(w, account.id)).toHaveLength(1);
    expect(await allIdentityCount(w)).toBe(1);
  });

  it('[INV-VIN8-005] prueba negativa: un sub nuevo con el correo de una cuenta existente (verificada o no) no crea filas de auth_identities en ella; solo se libera el correo de la no verificada', async () => {
    await giveEmail(w, MARIA, EMAIL, false);
    await giveEmail(w, CARLOS, 'otro@example.test', true);
    const antes = JSON.stringify(usersOf(w).find((u) => u.id === CARLOS));
    await googleSignUp('titular.nuevo');
    expect(await identitiesOf(w, MARIA)).toEqual([]);
    expect(await identitiesOf(w, CARLOS)).toEqual([]);
    expect(JSON.stringify(usersOf(w).find((u) => u.id === CARLOS))).toBe(antes);
  });

  it('[INV-VIN8-005] un titular verificado con ese correo y un sub nuevo: tras el fallo uniforme no hay ninguna fila nueva en auth_identities de ninguna cuenta', async () => {
    await giveEmail(w, MARIA, EMAIL, true);
    w.oidc.identity = { sub: 'sub-nuevo', email: EMAIL };
    const started = await w.start.execute();
    await expect(w.complete.execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOf(started.authorizationUrl) })).rejects.toMatchObject({ code: 'ERR-AUTH-GOOGLE-FAILED' });
    expect(await allIdentityCount(w)).toBe(0);
  });
});
