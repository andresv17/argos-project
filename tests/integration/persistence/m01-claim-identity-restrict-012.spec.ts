/**
 * M-01 de rama (Feature 012, D8): `claimIdentity` envuelve el borrado de identidades obsoletas en try. Una identidad con expedientes (`owner_requests.resolved_by_admin_id`, FK RESTRICT hacia
 * `admin_identities`) no se puede retirar: el acceso del delegado queda DENIED (`ok: false` uniforme) sin error 500 y sin anclar.
 * Memoria: su `deleteById` NO aplica RESTRICT, asi que el fallo se SIMULA lanzando desde `deleteById` (limitacion documentada; el RESTRICT real lo prueban SQLite y PostgreSQL).
 * PostgreSQL real solo con TEST_DATABASE_URL; sin ella esa parte se omite y NO se da por verificada.
 * @implements REQ-ADM11-006, REQ-CHP12-004
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AdminDelegateRecord } from '../../../src/application/ports/admin.port.ts';
import type { OwnerRequestRecord } from '../../../src/application/ports/co-ownership.port.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { CompleteAdminGoogleLoginUseCase, StartAdminGoogleLoginUseCase } from '../../../src/application/use-cases/admin-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { ADMIN_EMAIL, adminKit, stateOfUrl } from '../../fixtures/admin-fixtures.ts';
import { ANDRES, ARGOS, canonicalState, createDeps } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { GOOGLE_CODE } from '../../fixtures/google-fixtures.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const NOW = '2026-11-27T12:00:00.000Z';
const HOUR = 3_600_000;
const id = (n: number): string => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OLD_OPERATOR = id(1); // operador dado de baja con expediente: su identidad no es borrable
const DELEGATE_ID = id(2);
const CREATOR = id(999);
const EMAIL = 'delegada.reciclada@example.test';
const SUB_NEW = 'google-sub-delegada-nueva';
const SUB_OLD = 'google-sub-operador-viejo';

const dispute: OwnerRequestRecord = {
  id: id(501), action: 'CHIP_DISPUTE', petId: ARGOS.id, petVersion: 1, requesterUserId: ANDRES, requesterPseudonym: null, targetUserId: null, targetUsernameSealed: null, targetResponse: null,
  triggerRequestIds: null, status: 'RESOLVED', approverSet: [], approvals: [], rejectedBy: null, rejectedByPseudonym: null, message: null, createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z',
  decidedAt: '2026-01-10T00:00:00.000Z', staleReason: null, disputeReason: 'CHIP_APPROPRIATION', chipLast4: '1234', chipHmac: 'h'.repeat(64), frozenUntil: null, freezeExtendedAt: null, slaDueAt: null, escalatedAt: null,
  resolvedAt: '2026-01-10T00:00:00.000Z', resolution: 'REJECT', mootReason: null, resolvedByUserId: null, secondApproverUserId: null, executesAfter: null, resolvedByAdminId: OLD_OPERATOR, secondApproverAdminId: null, version: 1,
};

const delegateRow = (status: 'INVITED' | 'ACTIVE'): AdminDelegateRecord => ({
  adminId: DELEGATE_ID, email: EMAIL, role: 'SUPPORT', status,
  provider: status === 'ACTIVE' ? 'GOOGLE' : null, providerSubject: status === 'ACTIVE' ? SUB_NEW : null,
  invitedAt: NOW, invitedExpiresAt: status === 'INVITED' ? new Date(Date.parse(NOW) + 72 * HOUR).toISOString() : null,
  anchoredAt: status === 'ACTIVE' ? NOW : null, disabledAt: null, createdByAdminId: CREATOR, createdAt: NOW, updatedAt: NOW,
});

interface Engine {
  readonly uow: UnitOfWorkPort;
  readonly deps: ApplicationDeps;
  dispose(): Promise<void>;
}
const engines: Engine[] = [];
afterEach(async () => {
  for (const e of engines.splice(0)) await e.dispose();
});

const FACTORIES: ReadonlyArray<{ name: string; enabled: boolean; restrict: boolean; make: () => Promise<Engine> }> = [
  {
    name: 'memoria (borrado simulado)', enabled: true, restrict: false,
    make: async () => {
      const real = new InMemoryUnitOfWork(canonicalState());
      const failing: UnitOfWorkPort = {
        runInTransaction: (work) =>
          real.runInTransaction((r) => work(new Proxy(r, { get: (t, p, rc) => (p === 'adminIdentities' ? { ...t.adminIdentities, deleteById: async () => { throw new Error('FK RESTRICT simulada'); } } : Reflect.get(t, p, rc)) }) as RepositorySet)),
      } as UnitOfWorkPort;
      return { uow: real, deps: createDeps(failing, new FixedClockAdapter(), new SpyPasswordHasher()), dispose: async () => {} };
    },
  },
  { name: 'SQLite', enabled: true, restrict: true, make: async () => ((e) => ({ uow: e.uowA, deps: e.depsA(), dispose: () => e.dispose() }))(await createSqliteConcurrentEngine()) },
  {
    name: 'PostgreSQL real', enabled: TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '', restrict: true,
    make: async () => ((e) => ({ uow: e.uowA, deps: e.depsA(), dispose: () => e.dispose() }))(await createPostgresConcurrentEngine()),
  },
];

for (const factory of FACTORIES) {
  describe.skipIf(!factory.enabled)(`M-01 claimIdentity con identidad con expedientes (${factory.name})`, { timeout: 60_000 }, () => {
    for (const status of ['INVITED', 'ACTIVE'] as const) {
      it(`delegado ${status}: el borrado de la identidad con expediente RESOLVED falla -> DENIED uniforme, sin 500, sin ancla ni sesion, identidad y expediente intactos`, async () => {
        const e = await factory.make();
        engines.push(e);
        const clock = e.deps.clock as FixedClockAdapter;
        clock.setClock(NOW.slice(0, 10), NOW);
        await e.uow.runInTransaction(async (r) => {
          // Identidad obsoleta (otro `sub`, mismo correo) con expediente: candidata a reciclarse pero con FK RESTRICT.
          expect(await r.adminIdentities.insertIfAbsent({ adminId: OLD_OPERATOR, provider: 'GOOGLE', providerSubject: SUB_OLD, email: EMAIL, createdAt: NOW })).toBe(true);
          await r.ownerRequests.insert(dispute);
          expect(await r.adminDelegates.insert(delegateRow(status)), 'siembra').toBe(true);
        });
        const kit = adminKit([ADMIN_EMAIL]);
        kit.oidc.identity = { sub: SUB_NEW, email: EMAIL };
        const deps: ApplicationDeps = { ...e.deps, admin: kit.admin };
        const started = await new StartAdminGoogleLoginUseCase(deps).execute();
        const result = await new CompleteAdminGoogleLoginUseCase(deps).execute({ oauthToken: started.oauthToken, code: GOOGLE_CODE, state: stateOfUrl(started.authorizationUrl) });
        expect(result).toEqual({ ok: false });

        const after = await e.uow.runInTransaction(async (r) => ({
          old: await r.adminIdentities.findById(OLD_OPERATOR),
          mine: await r.adminIdentities.findById(DELEGATE_ID),
          delegate: await r.adminDelegates.findById(DELEGATE_ID),
          request: await r.ownerRequests.findById(id(501)),
        }));
        expect(after.old).toMatchObject({ adminId: OLD_OPERATOR, email: EMAIL, providerSubject: SUB_OLD }); // no se retiro
        expect(after.mine).toBeNull(); // no se creo la del delegado
        expect(after.delegate).toMatchObject({ status, providerSubject: status === 'ACTIVE' ? SUB_NEW : null }); // sin anclar (INVITED sigue sin sub)
        expect(after.request).toMatchObject({ resolvedByAdminId: OLD_OPERATOR });
        if (!factory.restrict) return; // memoria: el borrado fallido es simulado, no hay RESTRICT real que comprobar.
        await expect(e.uow.runInTransaction((r) => r.adminIdentities.deleteById(OLD_OPERATOR))).rejects.toThrow(/FOREIGN KEY|foreign key|violates|resolved_by_admin_id/i); // la FK real existe: el borrado directo falla
      });
    }
  });
}
