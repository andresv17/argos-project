/**
 * DEUDA-011-PURGA-DELEGADOS (011, D-1 y D-2): el mantenimiento diario purga las invitaciones `INVITED` con más de 30 días tras su caducidad de 72 h y anonimiza correo y `sub` de los
 * delegados `DISABLED` con más de 365 días, conservando el `admin_id` opaco. Memoria, SQLite y PostgreSQL 17 real (solo con `TEST_DATABASE_URL`; sin ella la parte de PostgreSQL se omite
 * y NO se da por verificada).
 * @implements REQ-ADM11-001, INV-ARCH-006
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AdminDelegateRecord } from '../../../src/application/ports/admin.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { purgeDelegateData, runMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { ADMIN_DELEGATE_DISABLED_RETENTION_DAYS, ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS, ADMIN_DELEGATE_INVITATION_TTL_HOURS } from '../../../src/infrastructure/config/app-config.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { createPostgresConcurrentEngine, createSqliteConcurrentEngine, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';

const NOW = '2026-11-26T12:00:00.000Z';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();
const id = (n: number): string => `b1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CREATOR = id(999);
const RETENTION = {
  invitationTtlHours: ADMIN_DELEGATE_INVITATION_TTL_HOURS,
  expiredInvitationRetentionDays: ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS,
  disabledRetentionDays: ADMIN_DELEGATE_DISABLED_RETENTION_DAYS,
};
/** `invited_at` justo en el límite: caducó a las 72 h y de eso hace `days` días. */
const invitedAtExpiredDaysAgo = (days: number, extraMs = 0): string => at(-(ADMIN_DELEGATE_INVITATION_TTL_HOURS * HOUR + days * DAY) + extraMs);

const invited = (n: number, invitedAt: string): AdminDelegateRecord => ({
  adminId: id(n),
  email: `invitado.${n}@example.test`,
  role: 'SUPPORT',
  status: 'INVITED',
  provider: null,
  providerSubject: null,
  invitedAt,
  invitedExpiresAt: new Date(Date.parse(invitedAt) + ADMIN_DELEGATE_INVITATION_TTL_HOURS * HOUR).toISOString(),
  anchoredAt: null,
  disabledAt: null,
  createdByAdminId: CREATOR,
  createdAt: invitedAt,
  updatedAt: invitedAt,
});
const disabled = (n: number, disabledAt: string): AdminDelegateRecord => ({
  adminId: id(n),
  email: `baja.${n}@example.test`,
  role: 'OPERATOR',
  status: 'DISABLED',
  provider: 'GOOGLE',
  providerSubject: `sub-baja-${n}`,
  invitedAt: at(-500 * DAY),
  invitedExpiresAt: null,
  anchoredAt: at(-499 * DAY),
  disabledAt,
  createdByAdminId: CREATOR,
  createdAt: at(-500 * DAY),
  updatedAt: disabledAt,
});
const active = (n: number): AdminDelegateRecord => ({
  ...disabled(n, at(-1000 * DAY)),
  email: `activo.${n}@example.test`,
  providerSubject: `sub-activo-${n}`,
  status: 'ACTIVE',
  disabledAt: null,
  updatedAt: at(-1000 * DAY),
});

interface Engine {
  readonly name: string;
  readonly uow: UnitOfWorkPort;
  dispose(): Promise<void>;
}
const engines: Engine[] = [];
afterEach(async () => {
  for (const e of engines.splice(0)) await e.dispose();
});

const FACTORIES: ReadonlyArray<{ name: string; enabled: boolean; make: () => Promise<Engine> }> = [
  { name: 'memoria', enabled: true, make: async () => ({ name: 'memoria', uow: new InMemoryUnitOfWork(canonicalState()), dispose: async () => {} }) },
  { name: 'SQLite', enabled: true, make: async () => ((e) => ({ name: 'SQLite', uow: e.uowA, dispose: () => e.dispose() }))(await createSqliteConcurrentEngine()) },
  {
    name: 'PostgreSQL real',
    enabled: TEST_DATABASE_URL !== undefined && TEST_DATABASE_URL !== '',
    make: async () => ((e) => ({ name: 'PostgreSQL', uow: e.uowA, dispose: () => e.dispose() }))(await createPostgresConcurrentEngine()),
  },
];

const clock = (): FixedClockAdapter => {
  const c = new FixedClockAdapter();
  c.setClock(NOW.slice(0, 10), NOW);
  return c;
};

for (const factory of FACTORIES) {
  describe.skipIf(!factory.enabled)(`purga de delegados (${factory.name})`, { timeout: 60_000 }, () => {
    const boot = async (rows: readonly AdminDelegateRecord[]): Promise<Engine> => {
      const engine = await factory.make();
      engines.push(engine);
      await engine.uow.runInTransaction(async (r) => {
        for (const row of rows) {
          if (row.providerSubject !== null && row.provider !== null) {
            await r.adminIdentities.insertIfAbsent({ adminId: row.adminId, provider: row.provider, providerSubject: row.providerSubject, email: row.email, createdAt: row.createdAt });
          }
          expect(await r.adminDelegates.insert(row), 'siembra').toBe(true);
        }
      });
      return engine;
    };
    const get = (e: Engine, n: number) => e.uow.runInTransaction((r) => r.adminDelegates.findById(id(n)));
    const identity = (e: Engine, n: number) => e.uow.runInTransaction((r) => r.adminIdentities.findById(id(n)));

    it('[D-2] purga la invitación con más de 30 días tras caducar; conserva la que está en la ventana (límite exacto incluido) y las ACTIVE', async () => {
      const e = await boot([
        invited(1, invitedAtExpiredDaysAgo(31)), // 31 d tras caducar: se purga
        invited(2, invitedAtExpiredDaysAgo(30)), // justo 30 d: aún no (límite estricto)
        invited(3, invitedAtExpiredDaysAgo(29)), // dentro de la ventana
        invited(4, at(-HOUR)), // vigente, aún no caducó
        invited(5, invitedAtExpiredDaysAgo(30, -1)), // 1 ms más viejo que el límite: se purga
        active(6),
      ]);
      const result = await purgeDelegateData({ uow: e.uow, clock: clock(), adminDelegateRetention: RETENTION });
      expect(result).toEqual({ invitationsPurged: 2, disabledAnonymized: 0 });
      const present = await Promise.all([1, 2, 3, 4, 5, 6].map(async (n) => (await get(e, n)) !== null));
      expect(present).toEqual([false, true, true, true, false, true]);
    });

    it('[D-1] anonimiza correo y sub de la baja con más de 365 días, conserva admin_id y retira su identidad; no toca bajas recientes ni ACTIVE', async () => {
      const e = await boot([disabled(1, at(-366 * DAY)), disabled(2, at(-365 * DAY)), disabled(3, at(-364 * DAY)), active(4)]);
      const result = await purgeDelegateData({ uow: e.uow, clock: clock(), adminDelegateRetention: RETENTION });
      expect(result).toEqual({ invitationsPurged: 0, disabledAnonymized: 1 });
      const old = (await get(e, 1))!;
      expect(old.adminId).toBe(id(1));
      expect(old.status).toBe('DISABLED');
      expect(old.role).toBe('OPERATOR');
      expect(old.disabledAt).toBe(at(-366 * DAY));
      expect(old.createdByAdminId).toBe(CREATOR);
      expect(old.providerSubject).toBeNull();
      expect(old.provider).toBeNull();
      expect(old.email).not.toContain('baja.1');
      expect(old.email).toBe(`anon-${id(1)}@anonimizado.invalid`);
      expect(await identity(e, 1)).toBeNull();
      // límite exacto (365 d), reciente y ACTIVE: intactos, con su identidad.
      expect((await get(e, 2))!.email).toBe('baja.2@example.test');
      expect((await get(e, 2))!.providerSubject).toBe('sub-baja-2');
      expect((await get(e, 3))!.email).toBe('baja.3@example.test');
      expect((await get(e, 4))!.email).toBe('activo.4@example.test');
      expect((await get(e, 4))!.providerSubject).toBe('sub-activo-4');
      expect((await identity(e, 4))?.providerSubject).toBe("sub-activo-4");
      expect((await identity(e, 2))?.providerSubject).toBe("sub-baja-2");
    });

    it('es idempotente y no impide invitar de nuevo el mismo correo', async () => {
      const e = await boot([disabled(1, at(-400 * DAY))]);
      const deps = { uow: e.uow, clock: clock(), adminDelegateRetention: RETENTION };
      expect((await purgeDelegateData(deps)).disabledAnonymized).toBe(1);
      expect((await purgeDelegateData(deps)).disabledAnonymized).toBe(0);
      const reinvited = invited(7, at(-HOUR));
      expect(await e.uow.runInTransaction((r) => r.adminDelegates.insert({ ...reinvited, email: 'baja.1@example.test' }))).toBe(true);
    });

    it('runMaintenance integra la purga sin cambiar la forma de MaintenanceResult', async () => {
      const e = await boot([invited(1, invitedAtExpiredDaysAgo(40)), disabled(2, at(-400 * DAY))]);
      const result = await runMaintenance({ uow: e.uow, clock: clock(), adminDelegateRetention: RETENTION });
      expect(Object.keys(result).sort()).toEqual(['auditRowsPurged', 'confirmationTokensPurged', 'invitationsPurged', 'membershipsPurged', 'sessionsPurged']);
      expect(await get(e, 1)).toBeNull();
      expect((await get(e, 2))!.providerSubject).toBeNull();
    });

    it('sin retencion inyectada aplica los defectos (72 h, 30 d, 365 d): purga y anonimiza igual que con RETENTION; la inyectada gana', async () => {
      const rows = (): AdminDelegateRecord[] => [invited(1, invitedAtExpiredDaysAgo(31)), invited(2, invitedAtExpiredDaysAgo(29)), disabled(3, at(-366 * DAY)), disabled(4, at(-364 * DAY)), active(5)];
      const e = await boot(rows());
      expect(await purgeDelegateData({ uow: e.uow, clock: clock() })).toEqual({ invitationsPurged: 1, disabledAnonymized: 1 });
      expect(await get(e, 1)).toBeNull();
      expect((await get(e, 2))?.adminId).toBe(id(2));
      expect((await get(e, 3))!.providerSubject).toBeNull();
      expect((await get(e, 4))!.providerSubject).toBe('sub-baja-4');
      expect((await get(e, 5))!.providerSubject).toBe('sub-activo-5');
      const e2 = await boot(rows());
      const strict = { invitationTtlHours: 72, expiredInvitationRetentionDays: 1000, disabledRetentionDays: 1000 };
      expect(await purgeDelegateData({ uow: e2.uow, clock: clock(), adminDelegateRetention: strict })).toEqual({ invitationsPurged: 0, disabledAnonymized: 0 });
    });

    it('fail-safe: si el almacenamiento falla no lanza ni filtra correos', async () => {
      const failing: UnitOfWorkPort = {
        ...(await (async () => (await boot([])).uow)()),
        runInTransaction: async () => {
          throw new Error('baja.1@example.test');
        },
      } as UnitOfWorkPort;
      await expect(purgeDelegateData({ uow: failing, clock: clock(), adminDelegateRetention: RETENTION })).resolves.toEqual({ invitationsPurged: 0, disabledAnonymized: 0 });
    });
  });
}
