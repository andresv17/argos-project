import { describe, expect, it } from 'vitest';
import type { AdminDelegateRecord, AdminIdentityRecord } from '../../src/application/ports/admin.port.ts';
import type { RepositorySet } from '../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../src/application/ports/unit-of-work.port.ts';
import { AuthenticateAdminUseCase, CompleteAdminGoogleLoginUseCase, EndAdminSessionUseCase, StartAdminGoogleLoginUseCase } from '../../src/application/use-cases/admin-use-cases.ts';
import type { ApplicationDeps } from '../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { ADMIN_EMAIL, ADMIN_SUB, adminKit, stateOfUrl } from '../fixtures/admin-fixtures.ts';
import { canonicalState, createDeps } from '../fixtures/application-harness.ts';
import { GOOGLE_CODE } from '../fixtures/google-fixtures.ts';
import { SpyPasswordHasher } from '../fixtures/test-doubles.ts';

/**
 * H-011-3 (cobertura de ramas, 011 Bloque D, REQ-ADM11-004, REQ-ADM11-006, EDGE-009-047, EDGE-011-019): comportamiento del acceso de administración en `admin-use-cases.ts`
 * sin HTTP: anclaje de identidades raíz y de delegados (`ACTIVE`, `INVITED`, caducada, sin `sub`), reciclaje de identidades retiradas, carreras de anclaje, fallo cerrado sin
 * configuración y cierre de sesión. Todo fallo de acceso es el MISMO `{ ok: false }` uniforme. Memoria, sin red.
 */
const T0 = '2026-11-05T12:00:00.000Z';
const HOUR = 3600 * 1000;
const DELEGATE_EMAIL = 'delegada.soporte@example.test';
const DELEGATE_SUB = 'google-sub-delegada-0001';
const DELEGATE_ID = '70000000-0000-4000-8000-000000000001';
const OTHER_ID = '70000000-0000-4000-8000-000000000002';

function patch<T extends object>(target: T, overrides: Partial<Record<keyof T, unknown>>): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in overrides) return (overrides as Record<PropertyKey, unknown>)[prop];
      const value = Reflect.get(t, prop, receiver) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(t) : value;
    },
  });
}

const patchedUow = (uow: UnitOfWorkPort, over: (r: RepositorySet) => Partial<Record<keyof RepositorySet, unknown>>): UnitOfWorkPort => ({
  runInTransaction: (work) => uow.runInTransaction((r) => work(patch(r, over(r)))),
});

function setup(emails: readonly string[] = [ADMIN_EMAIL]) {
  const kit = adminKit(emails);
  const clock = new FixedClockAdapter();
  clock.setClock(T0.slice(0, 10), T0);
  const uow = new InMemoryUnitOfWork(canonicalState());
  const base = createDeps(uow, clock, new SpyPasswordHasher());
  const deps: ApplicationDeps = { ...base, admin: kit.admin };
  const seed = <T>(work: (r: RepositorySet) => Promise<T>): Promise<T> => uow.runInTransaction(work);
  const at = (offsetMs: number): void => {
    const iso = new Date(Date.parse(T0) + offsetMs).toISOString();
    clock.setClock(iso.slice(0, 10), iso);
  };
  /** Flujo completo de Google simulado con la identidad dada. */
  async function login(identity: { sub: string; email: string }, useDeps: ApplicationDeps = deps) {
    kit.oidc.identity = identity;
    const started = await new StartAdminGoogleLoginUseCase(useDeps).execute();
    return new CompleteAdminGoogleLoginUseCase(useDeps).execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOfUrl(started.authorizationUrl) });
  }
  return { kit, clock, uow, deps, seed, at, login };
}

const identity = (adminId: string, email: string, sub: string): AdminIdentityRecord => ({ adminId, provider: 'GOOGLE', providerSubject: sub, email, createdAt: T0 });
const delegate = (over: Partial<AdminDelegateRecord> = {}): AdminDelegateRecord => ({
  adminId: DELEGATE_ID,
  email: DELEGATE_EMAIL,
  role: 'SUPPORT',
  status: 'ACTIVE',
  provider: 'GOOGLE',
  providerSubject: DELEGATE_SUB,
  invitedAt: T0,
  invitedExpiresAt: null,
  anchoredAt: T0,
  disabledAt: null,
  createdByAdminId: OTHER_ID,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});
const invited = (over: Partial<AdminDelegateRecord> = {}): AdminDelegateRecord =>
  delegate({ status: 'INVITED', provider: null, providerSubject: null, anchoredAt: null, invitedExpiresAt: new Date(Date.parse(T0) + 72 * HOUR).toISOString(), ...over });
const DELEGATE = { sub: DELEGATE_SUB, email: DELEGATE_EMAIL };
const DENIED = { ok: false };

describe('administración sin configuración: falla cerrada (EDGE-009-008)', () => {
  it('iniciar o completar el flujo sin `deps.admin` lanza ERR-INTERNAL-UNEXPECTED, nunca un resultado distinguible', async () => {
    const { deps } = setup();
    const bare: ApplicationDeps = { ...deps };
    delete (bare as { admin?: unknown }).admin;
    await expect(new StartAdminGoogleLoginUseCase(bare).execute()).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    await expect(new CompleteAdminGoogleLoginUseCase(bare).execute({ oauthToken: null })).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
  });

  it('una sesión viva sin configuración de administración se revoca y no autentica', async () => {
    const { deps, login } = setup();
    const done = await login({ sub: ADMIN_SUB, email: ADMIN_EMAIL });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(await new AuthenticateAdminUseCase(deps).execute(done.sessionToken)).toMatchObject({ role: 'SUPER_ADMIN', isRoot: true });
    const bare: ApplicationDeps = { ...deps };
    delete (bare as { admin?: unknown }).admin;
    expect(await new AuthenticateAdminUseCase(bare).execute(done.sessionToken)).toBeNull();
    expect(await new AuthenticateAdminUseCase(deps).execute(done.sessionToken)).toBeNull();
  });
});

describe('identidad raíz: anclaje y colisiones (EDGE-009-047)', () => {
  it('el primer acceso ancla la identidad y el segundo reutiliza el mismo adminId', async () => {
    const { deps, login } = setup();
    const first = await login({ sub: ADMIN_SUB, email: ADMIN_EMAIL });
    const second = await login({ sub: ADMIN_SUB, email: ADMIN_EMAIL });
    expect([first.ok, second.ok]).toEqual([true, true]);
    if (!first.ok || !second.ok) return;
    const a = await new AuthenticateAdminUseCase(deps).execute(first.sessionToken);
    const b = await new AuthenticateAdminUseCase(deps).execute(second.sessionToken);
    expect(a?.adminId).toBe(b?.adminId);
    expect(a).toMatchObject({ role: 'SUPER_ADMIN', isRoot: true });
  });

  it('un `sub` ya anclado a OTRO correo y un correo ya anclado a OTRO `sub` son el mismo DENIED', async () => {
    const { seed, login } = setup();
    await seed((r) => r.adminIdentities.insertIfAbsent(identity(OTHER_ID, 'otro.correo@example.test', ADMIN_SUB)));
    expect(await login({ sub: ADMIN_SUB, email: ADMIN_EMAIL })).toEqual(DENIED);
    const s2 = setup();
    await s2.seed((r) => r.adminIdentities.insertIfAbsent(identity(OTHER_ID, ADMIN_EMAIL, 'sub-distinto')));
    expect(await s2.login({ sub: ADMIN_SUB, email: ADMIN_EMAIL })).toEqual(DENIED);
  });

  it('carrera de anclaje: si otro acceso anclaba la misma identidad, se recupera la ganadora solo si es coherente', async () => {
    const win = setup();
    const winnerRow = identity(OTHER_ID, ADMIN_EMAIL, ADMIN_SUB);
    const winning = patchedUow(win.uow, (r) => ({
      adminIdentities: patch(r.adminIdentities, {
        insertIfAbsent: async () => {
          await r.adminIdentities.insertIfAbsent(winnerRow);
          return false;
        },
      }),
    }));
    expect((await win.login({ sub: ADMIN_SUB, email: ADMIN_EMAIL }, { ...win.deps, uow: winning })).ok).toBe(true);
    const lose = setup();
    const incoherent = identity(OTHER_ID, 'ganadora.otra@example.test', ADMIN_SUB);
    let inserted = false;
    const uow = patchedUow(lose.uow, (r) => ({
      adminIdentities: patch(r.adminIdentities, {
        findBySubject: async () => (inserted ? incoherent : null),
        findByEmail: async () => null,
        insertIfAbsent: async () => {
          inserted = true;
          return false;
        },
      }),
    }));
    expect(await lose.login({ sub: ADMIN_SUB, email: ADMIN_EMAIL }, { ...lose.deps, uow })).toEqual(DENIED);
  });

  it('un error inesperado al escribir la sesión NO se disfraza de DENIED: se propaga', async () => {
    const { uow, deps, login } = setup();
    const broken = patchedUow(uow, (r) => ({ adminSessions: patch(r.adminSessions, { insert: async () => Promise.reject(new Error('disco lleno')) }) }));
    await expect(login({ sub: ADMIN_SUB, email: ADMIN_EMAIL }, { ...deps, uow: broken })).rejects.toThrow('disco lleno');
  });
});

describe('delegado ACTIVE (REQ-ADM11-004)', () => {
  it('entra con el `sub` anclado y la identidad coherente; con otro `sub` o una identidad ajena es DENIED', async () => {
    const { seed, login } = setup();
    await seed(async (r) => {
      await r.adminDelegates.insert(delegate());
      await r.adminIdentities.insertIfAbsent(identity(DELEGATE_ID, DELEGATE_EMAIL, DELEGATE_SUB));
    });
    expect((await login(DELEGATE)).ok).toBe(true);
    expect(await login({ sub: 'google-sub-impostor', email: DELEGATE_EMAIL })).toEqual(DENIED);

    const foreign = setup();
    await foreign.seed(async (r) => {
      await r.adminDelegates.insert(delegate());
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, DELEGATE_EMAIL, DELEGATE_SUB));
    });
    expect(await foreign.login(DELEGATE)).toEqual(DENIED);
  });

  it('sin identidad (retirada al reciclar el correo) se vuelve a crear con el MISMO admin_id; si el `sub` es de otro correo, DENIED', async () => {
    const { seed, login, deps } = setup();
    await seed((r) => r.adminDelegates.insert(delegate()));
    const done = await login(DELEGATE);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect((await new AuthenticateAdminUseCase(deps).execute(done.sessionToken))?.adminId).toBe(DELEGATE_ID);

    const taken = setup();
    await taken.seed(async (r) => {
      await r.adminDelegates.insert(delegate());
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, 'otro@example.test', DELEGATE_SUB));
    });
    expect(await taken.login(DELEGATE)).toEqual(DENIED);
  });

  it('sin identidad por `sub` pero con el correo en la identidad de OTRO delegado vivo, no se recicla ni se entra: DENIED', async () => {
    const { seed, login } = setup();
    await seed(async (r) => {
      await r.adminDelegates.insert(delegate());
      await r.adminDelegates.insert(delegate({ adminId: OTHER_ID, email: 'otra.viva@example.test', providerSubject: 'sub-otra-viva' }));
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, DELEGATE_EMAIL, 'sub-otro'));
    });
    expect(await login(DELEGATE)).toEqual(DENIED);
  });

  it('una fila con rol o estado desconocido, DISABLED o inexistente es DENIED uniforme', async () => {
    const { seed, login } = setup();
    expect(await login(DELEGATE)).toEqual(DENIED);
    await seed((r) => r.adminDelegates.insert(delegate({ role: 'ROL_INVENTADO' })));
    expect(await login(DELEGATE)).toEqual(DENIED);
    const disabled = setup();
    await disabled.seed((r) => r.adminDelegates.insert(delegate({ status: 'DISABLED', disabledAt: T0 })));
    expect(await disabled.login(DELEGATE)).toEqual(DENIED);
  });
});

describe('delegado INVITED: primer acceso y anclaje (REQ-ADM11-006, EDGE-011-019)', () => {
  it('ancla el `sub`, crea la identidad con el mismo admin_id, audita ADMIN_DELEGATE_ANCHORED con autor = el delegado y un segundo acceso entra como ACTIVE', async () => {
    const { seed, login, uow } = setup();
    await seed((r) => r.adminDelegates.insert(invited()));
    const done = await login(DELEGATE);
    expect(done.ok).toBe(true);
    const audit = await uow.runInTransaction((r) => r.adminAudit.listByAdmin(DELEGATE_ID));
    expect(audit.map((a) => a.action)).toContain('ADMIN_DELEGATE_ANCHORED');
    expect(audit.find((a) => a.action === 'ADMIN_DELEGATE_ANCHORED')?.objectRef).toBe(DELEGATE_ID);
    const row = await uow.runInTransaction((r) => r.adminDelegates.findById(DELEGATE_ID));
    expect(row).toMatchObject({ status: 'ACTIVE', providerSubject: DELEGATE_SUB });
    expect((await login(DELEGATE)).ok).toBe(true);
  });

  it('la invitación vence a las 72 h: el límite es inclusivo y un instante después es DENIED', async () => {
    const edge = setup();
    await edge.seed((r) => r.adminDelegates.insert(invited()));
    edge.at(72 * HOUR);
    expect((await edge.login(DELEGATE)).ok).toBe(true);
    const late = setup();
    await late.seed((r) => r.adminDelegates.insert(invited()));
    late.at(72 * HOUR + 1000);
    expect(await late.login(DELEGATE)).toEqual(DENIED);
  });

  it('una INVITED ya con `sub` o sin fecha de vencimiento es DENIED', async () => {
    const withSub = setup();
    await withSub.seed((r) => r.adminDelegates.insert(invited({ providerSubject: 'ya-anclado', provider: 'GOOGLE' })));
    expect(await withSub.login(DELEGATE)).toEqual(DENIED);
    const noExpiry = setup();
    await noExpiry.seed((r) => r.adminDelegates.insert(invited({ invitedExpiresAt: null })));
    expect(await noExpiry.login(DELEGATE)).toEqual(DENIED);
  });

  it('recicla identidades RETIRABLES (sin delegado vivo ni raíz) y las reemplaza por la del delegado', async () => {
    const { seed, login, uow } = setup();
    await seed(async (r) => {
      await r.adminDelegates.insert(invited());
      await r.adminDelegates.insert(delegate({ adminId: OTHER_ID, email: 'antigua.persona@example.test', status: 'DISABLED', disabledAt: T0, providerSubject: DELEGATE_SUB }));
      // El `sub` pertenece a la identidad de una delegada DESACTIVADA con el mismo correo reciclado.
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, DELEGATE_EMAIL, DELEGATE_SUB));
    });
    expect((await login(DELEGATE)).ok).toBe(true);
    const gone = await uow.runInTransaction((r) => r.adminIdentities.findById(OTHER_ID));
    const mine = await uow.runInTransaction((r) => r.adminIdentities.findById(DELEGATE_ID));
    expect([gone, mine?.providerSubject]).toEqual([null, DELEGATE_SUB]);
  });

  it('NO recicla identidades con un delegado vivo, con la misma persona o de la lista raíz: DENIED y sin anclar', async () => {
    const liveHolder = setup();
    await liveHolder.seed(async (r) => {
      await r.adminDelegates.insert(invited());
      await r.adminDelegates.insert(delegate({ adminId: OTHER_ID, email: 'viva@example.test', providerSubject: 'sub-viva' }));
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, DELEGATE_EMAIL, DELEGATE_SUB));
    });
    expect(await liveHolder.login(DELEGATE)).toEqual(DENIED);
    expect(await liveHolder.uow.runInTransaction((r) => r.adminDelegates.findById(DELEGATE_ID))).toMatchObject({ status: 'INVITED', providerSubject: null });

    const sameId = setup();
    await sameId.seed(async (r) => {
      await r.adminDelegates.insert(invited());
      await r.adminIdentities.insertIfAbsent(identity(DELEGATE_ID, DELEGATE_EMAIL, 'sub-previo'));
    });
    expect(await sameId.login(DELEGATE)).toEqual(DENIED);

    const rootHolder = setup([ADMIN_EMAIL, DELEGATE_EMAIL]);
    await rootHolder.seed((r) => r.adminDelegates.insert(invited()));
    // Con el correo también en la lista raíz el acceso es el de la raíz, no el del delegado (isRoot): se comprueba que NO ancla la fila.
    const asRoot = await rootHolder.login(DELEGATE);
    expect(asRoot.ok).toBe(true);
    expect(await rootHolder.uow.runInTransaction((r) => r.adminDelegates.findById(DELEGATE_ID))).toMatchObject({ status: 'INVITED' });

    const staleRoot = setup();
    await staleRoot.seed(async (r) => {
      await r.adminDelegates.insert(invited());
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, ADMIN_EMAIL, DELEGATE_SUB));
    });
    expect(await staleRoot.login({ sub: DELEGATE_SUB, email: DELEGATE_EMAIL })).toEqual(DENIED);
  });

  it('el `sub` anclado a OTRO correo no se recicla: DENIED', async () => {
    const { seed, login } = setup();
    await seed(async (r) => {
      await r.adminDelegates.insert(invited());
      await r.adminIdentities.insertIfAbsent(identity(OTHER_ID, 'otra.persona@example.test', DELEGATE_SUB));
    });
    expect(await login(DELEGATE)).toEqual(DENIED);
  });

  it('un anclaje que pierde el compare-and-set revierte la transacción entera: sin identidad huérfana ni sesión', async () => {
    const { seed, uow, deps, login } = setup();
    await seed((r) => r.adminDelegates.insert(invited()));
    const losing = patchedUow(uow, (r) => ({ adminDelegates: patch(r.adminDelegates, { anchor: async () => false }) }));
    expect(await login(DELEGATE, { ...deps, uow: losing })).toEqual(DENIED);
    expect(await uow.runInTransaction((r) => r.adminIdentities.findById(DELEGATE_ID))).toBeNull();
    expect(await uow.runInTransaction((r) => r.adminDelegates.findById(DELEGATE_ID))).toMatchObject({ status: 'INVITED' });
  });

  it('un anclaje cuya identidad no se puede crear (inserción rechazada) revierte y es DENIED', async () => {
    const { seed, uow, deps, login } = setup();
    await seed((r) => r.adminDelegates.insert(invited()));
    const refusing = patchedUow(uow, (r) => ({ adminIdentities: patch(r.adminIdentities, { insertIfAbsent: async () => false }) }));
    expect(await login(DELEGATE, { ...deps, uow: refusing })).toEqual(DENIED);
    expect(await uow.runInTransaction((r) => r.adminDelegates.findById(DELEGATE_ID))).toMatchObject({ status: 'INVITED', providerSubject: null });
  });
});

describe('cierre de sesión de administración (REQ-ADM9-004)', () => {
  it('revoca y audita ADMIN_SESSION_END; la segunda llamada, sin cookie o con una ajena es false', async () => {
    const { login, deps, uow } = setup();
    const done = await login({ sub: ADMIN_SUB, email: ADMIN_EMAIL });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const end = new EndAdminSessionUseCase(deps);
    expect(await end.execute(null)).toBe(false);
    expect(await end.execute('x'.repeat(43))).toBe(false);
    expect(await end.execute(done.sessionToken)).toBe(true);
    expect(await end.execute(done.sessionToken)).toBe(false);
    const session = await new AuthenticateAdminUseCase(deps).execute(done.sessionToken);
    expect(session).toBeNull();
    const ids = await uow.runInTransaction(async (r) => (await r.adminIdentities.findByEmail(ADMIN_EMAIL))!.adminId);
    const audit = await uow.runInTransaction((r) => r.adminAudit.listByAdmin(ids));
    expect(audit.map((a) => a.action)).toEqual(['ADMIN_SESSION_START', 'ADMIN_SESSION_END']);
  });

  it('si otra petición ganó la revocación a mitad de camino, devuelve false y no audita el cierre', async () => {
    const { login, deps, uow } = setup();
    const done = await login({ sub: ADMIN_SUB, email: ADMIN_EMAIL });
    if (!done.ok) throw new Error('acceso raíz esperado');
    const lost = patchedUow(uow, (r) => ({ adminSessions: patch(r.adminSessions, { revoke: async () => false }) }));
    expect(await new EndAdminSessionUseCase({ ...deps, uow: lost }).execute(done.sessionToken)).toBe(false);
    const adminId = (await uow.runInTransaction((r) => r.adminIdentities.findByEmail(ADMIN_EMAIL)))!.adminId;
    expect((await uow.runInTransaction((r) => r.adminAudit.listByAdmin(adminId))).map((a) => a.action)).toEqual(['ADMIN_SESSION_START']);
  });
});
