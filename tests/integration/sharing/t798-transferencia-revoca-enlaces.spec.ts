/**
 * T798 [US4] la transferencia de propiedad revoca los enlaces PET ACTIVOS de la mascota en la MISMA transacción (B-1, EDGE-005-20-bis, SC-005-052),
 * sobre memoria, SQLite y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { resolveShare } from '../../../src/application/use-cases/shared-view-use-cases.ts';
import { TransferPetOwnershipUseCase } from '../../../src/application/use-cases/ownership-use-cases.ts';
import type { ApplicationDeps } from '../../../src/application/use-cases/use-case-support.ts';
import { computeExpiresAt, type ShareLinkRecord } from '../../../src/domain/sharing/share-link.ts';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import { DeterministicIdAdapter } from '../../../src/infrastructure/adapters/deterministic-id.adapter.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { createDeps, canonicalState } from '../../fixtures/application-harness.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { ANDRES, ARGOS, HOUSEHOLD_ID, KEY, MARIA, createShareEngines, type ShareAuditRow } from '../../fixtures/share-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';

interface Ctx {
  readonly name: string;
  readonly deps: ApplicationDeps;
  run<T>(work: (r: RepositorySet) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const PG_SHARE_SQL = ['0007_platform_parameters.sql', '0008_share_links.sql', '0011_share_link_deceased_at.sql'].map((m) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${m}`, import.meta.url), 'utf8')).join('\n');

async function localContexts(): Promise<Ctx[]> {
  const engines = await createShareEngines('ADMIN');
  return engines.map((e) => ({ name: e.name, deps: e.deps, run: e.run, close: async () => e.close() }));
}

async function postgresContext(): Promise<Ctx> {
  const schema = `argos_s_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
  await pool.query(`${POSTGRES_SCHEMA_SQL}\n${PG_SHARE_SQL}`);
  const { createPostgresRepositories } = (await import('../../../src/infrastructure/persistence/postgres/postgres-repositories.ts')) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  const uow = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uow, canonicalState());
  const ids = (prefix: string) => Array.from({ length: 300 }, (_, i) => `${prefix}-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const deps: ApplicationDeps = { ...createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher()), ids: new DeterministicIdAdapter(ids('aaaaaaa1')), auditIds: new DeterministicIdAdapter(ids('aaaaaaa2')) };
  return {
    name: 'PostgreSQL',
    deps,
    run: (work) => uow.runInTransaction(work),
    async close() {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
}

const token = (n: number): string => `t798-token-${n}`.padEnd(43, 'x');
const LINK_ID = (n: number): string => `7a7a7a7a-0000-4000-8000-${String(n).padStart(12, '0')}`;

function link(ctx: Ctx, n: number, over: Partial<ShareLinkRecord>): ShareLinkRecord {
  const now = ctx.deps.clock.nowIsoTimestamp();
  return {
    id: LINK_ID(n),
    tokenHash: hashToken(token(n)),
    scope: 'PET',
    petId: ARGOS.id,
    householdId: null,
    createdByUserId: ANDRES,
    createdAt: now,
    expiresInDays: 7,
    expiresAt: computeExpiresAt(now, 7),
    revokedAt: null,
    includeMicrochip: false,
    includeClinicalFiles: false,
    includeDeceasedAt: false,
    idempotencyKey: KEY(n),
    petOwnerUserIdAtCreation: ANDRES,
    ...over,
  };
}

const NOW_AUDIT = async (ctx: Ctx): Promise<ShareAuditRow[]> => (await ctx.run((r) => r.shareAudit.listAll())) as unknown as ShareAuditRow[];
const transfer = (ctx: Ctx, actor: string, target: string, deps: ApplicationDeps = ctx.deps) => new TransferPetOwnershipUseCase(deps).execute(actor, ARGOS.id, { targetUserId: target });
const byId = async (ctx: Ctx, id: string): Promise<ShareLinkRecord> => (await ctx.run((r) => r.shareLinks.findById(id)))!;

/** Dos enlaces PET ACTIVOS (1, 2), uno vencido (3), uno revocado (4) y uno HOUSEHOLD activo (5), todos de ANDRES. */
async function seedLinks(ctx: Ctx): Promise<{ readonly revokedAt: string }> {
  const now = ctx.deps.clock.nowIsoTimestamp();
  const past = '2026-10-01T12:00:00.000Z';
  const revokedAt = '2026-11-04T12:00:00.000Z';
  await ctx.run(async (r) => {
    await r.shareLinks.insert(link(ctx, 1, {}));
    await r.shareLinks.insert(link(ctx, 2, { expiresInDays: 30, expiresAt: computeExpiresAt(now, 30) }));
    await r.shareLinks.insert(link(ctx, 3, { createdAt: past, expiresInDays: 7, expiresAt: computeExpiresAt(past, 7) }));
    await r.shareLinks.insert(link(ctx, 4, { revokedAt }));
    await r.shareLinks.insert(link(ctx, 5, { scope: 'HOUSEHOLD', petId: null, householdId: HOUSEHOLD_ID, petOwnerUserIdAtCreation: null }));
  });
  return { revokedAt };
}

function define(label: string, build: () => Promise<Ctx[]>): void {
  describe(`T798 transferencia de propiedad y enlaces PET (${label})`, { timeout: 60_000 }, () => {
    let ctxs: Ctx[] = [];
    afterEach(async () => {
      for (const c of ctxs) await c.close();
      ctxs = [];
    });
    const each = async (test: (c: Ctx) => Promise<void>): Promise<void> => {
      ctxs = await build();
      for (const c of ctxs) await test(c);
    };

    it('SC-005-052 [EDGE-005-20-bis][REQ-VET-011] al transferir, los enlaces PET ACTIVOS quedan revocados con una auditoría REVOKED cada uno (actor = quien transfiere); vencido, revocado y HOUSEHOLD no cambian', async () => {
      await each(async (c) => {
        const { revokedAt } = await seedLinks(c);
        const now = c.deps.clock.nowIsoTimestamp();
        const expiredBefore = await byId(c, LINK_ID(3));
        const auditBefore = (await NOW_AUDIT(c)).length;
        await transfer(c, ANDRES, MARIA);
        expect([(await byId(c, LINK_ID(1))).revokedAt, (await byId(c, LINK_ID(2))).revokedAt], c.name).toEqual([now, now]);
        expect(await byId(c, LINK_ID(3))).toEqual(expiredBefore);
        expect((await byId(c, LINK_ID(4))).revokedAt).toBe(revokedAt);
        expect((await byId(c, LINK_ID(5))).revokedAt).toBeNull();
        const audit = (await NOW_AUDIT(c)).slice(auditBefore).filter((a) => a.eventType === 'REVOKED');
        expect(audit.map((a) => a.shareLinkId).sort()).toEqual([LINK_ID(1), LINK_ID(2)]);
        for (const a of audit) expect(a).toMatchObject({ actorUserId: ANDRES, occurredAt: now, ipHmac: null, failCount: 1 });
        expect((await NOW_AUDIT(c)).slice(auditBefore)).toHaveLength(2);
        const active = await c.run((r) => r.shareLinks.countActive('PET', ARGOS.id, now));
        expect(active, 'el nuevo propietario no hereda enlaces ACTIVOS').toBe(0);
      });
    });

    it('SC-005-052 [EDGE-005-20-bis] A crea un enlace PET, transfiere a B y B devuelve a A: el enlace de A sigue REVOKED y no resuelve (404); uno nuevo de A sí', async () => {
      await each(async (c) => {
        await seedLinks(c);
        const now = c.deps.clock.nowIsoTimestamp();
        await transfer(c, ANDRES, MARIA);
        await transfer(c, MARIA, ANDRES);
        expect((await c.run((r) => r.pets.findById(ARGOS.id)))!.ownerUserId).toBe(ANDRES);
        expect((await byId(c, LINK_ID(1))).revokedAt).toBe(now);
        expect(await c.run((r) => resolveShare(r, token(1), now)), c.name).toBeNull();
        expect(await c.run((r) => resolveShare(r, token(2), now))).toBeNull();
        await c.run((r) => r.shareLinks.insert(link(c, 6, {})));
        expect((await c.run((r) => resolveShare(r, token(6), now)))?.link.id).toBe(LINK_ID(6));
      });
    });

    it('SC-005-052 [EDGE-005-20-bis] si la transferencia falla y hace ROLLBACK, ningún enlace queda revocado ni auditado', async () => {
      await each(async (c) => {
        await seedLinks(c);
        const auditBefore = (await NOW_AUDIT(c)).length;
        let calls = 0;
        const failing: ApplicationDeps = { ...c.deps, auditIds: { nextId: () => { calls += 1; if (calls === 3) throw new Error('fallo simulado'); return c.deps.auditIds.nextId(); } } };
        await expect(transfer(c, ANDRES, MARIA, failing)).rejects.toThrow('fallo simulado');
        expect(calls, 'se llegó a la auditoría de la transferencia tras revocar los dos enlaces').toBe(3);
        for (const n of [1, 2]) expect((await byId(c, LINK_ID(n))).revokedAt).toBeNull();
        expect((await c.run((r) => r.pets.findById(ARGOS.id)))!.ownerUserId).toBe(ANDRES);
        expect(await NOW_AUDIT(c)).toHaveLength(auditBefore);
      });
    });
  });
}

define('memoria y SQLite', localContexts);
describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', () => {
  define('PostgreSQL 17', async () => [await postgresContext()]);
});
