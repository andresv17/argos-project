/**
 * T766 / T764 / T764a [US4] repositorios `share_links` y `share_link_audit` (REQ-VET-003..005, REQ-VET-010, REQ-VET-012, REQ-VET-013, REQ-CLD-007):
 * contrato único para memoria, SQLite y PostgreSQL real (se OMITE sin TEST_DATABASE_URL): solo `token_hash`, `CHECK` de alcance, unicidad de
 * `(created_by_user_id, idempotency_key)`, cascada por mascota, hogar y cuenta, conteo de activos, revocación condicional, purga a 30 y 90 días,
 * fallos agregados por `(ip_hmac, ventana)`, `share_links` fuera de la exportación/importación y sin `ip_key_version` (PN-06).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet, UserAccount } from '../../../src/application/ports/repositories.port.ts';
import type { ShareAuditRecord } from '../../../src/application/ports/share-link.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { runMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import { computeExpiresAt, type ShareLinkRecord } from '../../../src/domain/sharing/share-link.ts';
import { ANDRES_PETS, fixtures, HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import { allPostgresMigrationsSql } from '../../fixtures/postgres-migrations.ts';

const account = (user: object, passwordHash: string): UserAccount => ({ ...user, email: null, preferredLanguage: 'es', timezone: 'America/Bogota', passwordHash }) as UserAccount;
const ANDRES = account(fixtures.users[0], 'h-andres');
const MARIA = account(fixtures.users[1], 'h-maria');
const ARGOS = upgradePet(ANDRES_PETS[0]!);
const OTRA = { ...upgradePet(ANDRES_PETS[1]!), microchipId: null };
const AJENA = { ...ARGOS, id: 'f0000000-0000-4000-8000-0000000000d9', ownerUserId: MARIA.id, microchipId: null, name: 'Ajena' };
const NOW = '2026-11-18T12:00:00.000Z';
const day = (offset: number) => new Date(Date.parse(NOW) + offset * 86_400_000).toISOString();
const linkId = (n: number) => `f1000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;
const KEY = (n: number) => `5a5a5a5a-0000-4000-8000-${String(n).padStart(12, '0')}`;

const link = (n: number, over: Partial<ShareLinkRecord> = {}): ShareLinkRecord => ({
  id: linkId(n),
  tokenHash: hashToken(`token-${n}`),
  scope: 'PET',
  petId: ARGOS.id,
  householdId: null,
  createdByUserId: ANDRES.id,
  createdAt: NOW,
  expiresInDays: 7,
  expiresAt: computeExpiresAt(NOW, 7),
  revokedAt: null,
  includeMicrochip: false,
  includeClinicalFiles: false,
  includeDeceasedAt: false,
  idempotencyKey: KEY(n),
  petOwnerUserIdAtCreation: ANDRES.id,
  ...over,
});
const audit = (n: number, over: Partial<ShareAuditRecord> = {}): ShareAuditRecord => ({
  id: `f2000000-0000-4000-8000-0000000006${String(n).padStart(2, '0')}`,
  shareLinkId: linkId(1),
  eventType: 'CREATED',
  occurredAt: NOW,
  actorUserId: ANDRES.id,
  ipHmac: null,
  failCount: 1,
  ...over,
});

type Factory = () => Promise<UnitOfWorkPort>;

function defineShareContract(name: string, create: Factory, dispose: () => Promise<void> | void = () => undefined): void {
  describe(`suite de contratos de enlaces veterinarios (${name})`, () => {
    afterEach(async () => dispose());
    const prepare = async () => {
      const uow = await create();
      await uow.runInTransaction(async (r) => {
        await r.users.insert(ANDRES);
        await r.users.insert(MARIA);
        await r.pets.save(ARGOS);
        await r.pets.save(OTRA);
        await r.pets.save(AJENA);
        await r.households.insert(HOUSEHOLD);
      });
      return uow;
    };
    const household = (n: number, over: Partial<ShareLinkRecord> = {}) => link(n, { scope: 'HOUSEHOLD', petId: null, householdId: HOUSEHOLD.id, petOwnerUserIdAtCreation: null, ...over });

    it('[REQ-VET-003][INV-005-005] insert y findByTokenHash/findById/findByIdempotencyKey devuelven la fila; la columna de token no existe (solo token_hash)', async () => {
      const uow = await prepare();
      const found = await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1, { includeMicrochip: true, includeClinicalFiles: true, expiresInDays: 30, expiresAt: computeExpiresAt(NOW, 30) }));
        return [await r.shareLinks.findByTokenHash(hashToken('token-1')), await r.shareLinks.findById(linkId(1)), await r.shareLinks.findByIdempotencyKey(ANDRES.id, KEY(1)), await r.shareLinks.findByTokenHash(hashToken('otro')), await r.shareLinks.findByIdempotencyKey(MARIA.id, KEY(1))] as const;
      });
      const expected = link(1, { includeMicrochip: true, includeClinicalFiles: true, expiresInDays: 30, expiresAt: computeExpiresAt(NOW, 30) });
      expect(found).toEqual([expected, expected, expected, null, null]);
      expect(Object.keys(found[0]!).sort()).toEqual(['createdAt', 'createdByUserId', 'expiresAt', 'expiresInDays', 'householdId', 'id', 'idempotencyKey', 'includeClinicalFiles', 'includeDeceasedAt', 'includeMicrochip', 'petId', 'petOwnerUserIdAtCreation', 'revokedAt', 'scope', 'tokenHash']);
    });

    it('[REQ-VET-003] token_hash es único y (created_by_user_id, idempotency_key) es único; la misma clave de otro creador sí se admite', async () => {
      const uow = await prepare();
      await uow.runInTransaction((r) => r.shareLinks.insert(link(1)));
      await expect(uow.runInTransaction((r) => r.shareLinks.insert(link(2, { tokenHash: hashToken('token-1') })))).rejects.toThrow(/unique|duplicate/i);
      await expect(uow.runInTransaction((r) => r.shareLinks.insert(link(3, { idempotencyKey: KEY(1) })))).rejects.toThrow(/unique|duplicate/i);
      await expect(uow.runInTransaction((r) => r.shareLinks.insert(link(4, { idempotencyKey: KEY(1), createdByUserId: MARIA.id, petId: AJENA.id, petOwnerUserIdAtCreation: MARIA.id })))).resolves.toBeUndefined();
    });

    it('[REQ-VET-004] el CHECK de alcance y de caducidad rechaza filas incoherentes (PET sin pet_id, HOUSEHOLD con pet_id, ambos nulos, expires_in_days fuera de {1,7,30}, expires_at <= created_at)', async () => {
      const uow = await prepare();
      const bad: ShareLinkRecord[] = [
        link(1, { petId: null }),
        link(2, { householdId: HOUSEHOLD.id }),
        household(3, { petId: ARGOS.id }),
        household(4, { householdId: null }),
        link(5, { expiresInDays: 2 }),
        link(6, { expiresAt: NOW }),
        link(7, { expiresAt: day(-1) }),
        link(8, { scope: 'GLOBAL' as never }),
      ];
      for (const row of bad) await expect(uow.runInTransaction((r) => r.shareLinks.insert(row)), `fila ${row.id}`).rejects.toThrow(/check constraint/i);
      expect(await uow.runInTransaction((r) => r.shareLinks.listAll())).toEqual([]);
    });

    it('[REQ-VET-010][SC-005-024] ON DELETE CASCADE: eliminar la mascota, el hogar o la cuenta del creador borra sus enlaces en la misma transacción', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1));
        await r.shareLinks.insert(link(2, { petId: OTRA.id }));
        await r.shareLinks.insert(household(3));
        await r.shareLinks.insert(link(4, { createdByUserId: MARIA.id }));
      });
      await uow.runInTransaction((r) => r.pets.delete(OTRA.id));
      expect((await uow.runInTransaction((r) => r.shareLinks.listAll())).map((l) => l.id).sort()).toEqual([linkId(1), linkId(3), linkId(4)]);
      await uow.runInTransaction((r) => r.households.deleteWithMemberships(HOUSEHOLD.id));
      expect((await uow.runInTransaction((r) => r.shareLinks.listAll())).map((l) => l.id).sort()).toEqual([linkId(1), linkId(4)]);
      await uow.runInTransaction(async (r) => {
        await r.pets.delete(AJENA.id);
        await r.users.delete(MARIA.id);
      });
      expect((await uow.runInTransaction((r) => r.shareLinks.listAll())).map((l) => l.id)).toEqual([linkId(1)]);
    });

    it('[REQ-VET-012][SC-005-038] countActive cuenta solo no revocados y no vencidos del alcance (por mascota u hogar, de cualquier creador)', async () => {
      const uow = await prepare();
      const counts = await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1));
        await r.shareLinks.insert(link(2, { createdByUserId: MARIA.id, idempotencyKey: KEY(2) }));
        await r.shareLinks.insert(link(3, { revokedAt: NOW }));
        await r.shareLinks.insert(link(4, { expiresInDays: 1, expiresAt: computeExpiresAt(NOW, 1) }));
        await r.shareLinks.insert(link(5, { petId: OTRA.id }));
        await r.shareLinks.insert(household(6));
        return {
          pet: await r.shareLinks.countActive('PET', ARGOS.id, NOW),
          petAtExpiry: await r.shareLinks.countActive('PET', ARGOS.id, computeExpiresAt(NOW, 1)),
          other: await r.shareLinks.countActive('PET', OTRA.id, NOW),
          house: await r.shareLinks.countActive('HOUSEHOLD', HOUSEHOLD.id, NOW),
          none: await r.shareLinks.countActive('PET', AJENA.id, NOW),
        };
      });
      expect(counts).toEqual({ pet: 3, petAtExpiry: 2, other: 1, house: 1, none: 0 });
    });

    it('[REQ-VET-005][STATE-SHARE-001] revoke marca revoked_at una sola vez: true la primera, false si ya está revocado, vencido o no existe', async () => {
      const uow = await prepare();
      const results = await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1));
        await r.shareLinks.insert(link(2, { expiresInDays: 1, expiresAt: computeExpiresAt(NOW, 1) }));
        const later = computeExpiresAt(NOW, 1);
        return [await r.shareLinks.revoke(linkId(1), NOW), await r.shareLinks.revoke(linkId(1), NOW), await r.shareLinks.revoke(linkId(2), later), await r.shareLinks.revoke('f1000000-0000-4000-8000-000000000999', NOW)];
      });
      expect(results).toEqual([true, false, false, false]);
      const rows = await uow.runInTransaction((r) => r.shareLinks.listAll());
      expect(rows.map((l) => l.revokedAt)).toEqual([NOW, null]);
    });

    it('[REQ-VET-013] listByScope devuelve los activos y los vencidos o revocados dentro de la retención, ordenados (createdAt DESC, id DESC)', async () => {
      const uow = await prepare();
      const ids = await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1, { createdAt: day(-40), expiresAt: day(-33), expiresInDays: 7 }));
        await r.shareLinks.insert(link(2, { createdAt: day(-20), expiresAt: day(-13), expiresInDays: 7 }));
        await r.shareLinks.insert(link(3, { createdAt: day(-10), expiresAt: day(-3), expiresInDays: 7, revokedAt: day(-35) }));
        await r.shareLinks.insert(link(4, { createdAt: day(-1), expiresAt: day(6), expiresInDays: 7 }));
        await r.shareLinks.insert(link(5, { createdAt: day(-1), expiresAt: day(6), expiresInDays: 7 }));
        await r.shareLinks.insert(link(6, { petId: OTRA.id }));
        return (await r.shareLinks.listByScope('PET', ARGOS.id, day(-30))).map((l) => l.id);
      });
      expect(ids).toEqual([linkId(5), linkId(4), linkId(2)]);
    });

    it('[REQ-VET-013][SC-005-042] purge borra los vencidos o revocados anteriores al corte y conserva los activos y los recientes; devuelve el conteo', async () => {
      const uow = await prepare();
      const purged = await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1, { createdAt: day(-40), expiresAt: day(-33) }));
        await r.shareLinks.insert(link(2, { createdAt: day(-20), expiresAt: day(-13) }));
        await r.shareLinks.insert(link(3, { revokedAt: day(-31) }));
        await r.shareLinks.insert(link(4, { revokedAt: day(-29) }));
        await r.shareLinks.insert(link(5));
        return r.shareLinks.purge(day(-30));
      });
      expect(purged).toBe(2);
      expect((await uow.runInTransaction((r) => r.shareLinks.listAll())).map((l) => l.id).sort()).toEqual([linkId(2), linkId(4), linkId(5)]);
    });

    it('[REQ-VET-012] lockScope no falla sobre una mascota, un hogar o un id inexistente (el candado se toma si existe)', async () => {
      const uow = await prepare();
      await expect(uow.runInTransaction(async (r) => {
        await r.shareLinks.lockScope('PET', ARGOS.id);
        await r.shareLinks.lockScope('HOUSEHOLD', HOUSEHOLD.id);
        await r.shareLinks.lockScope('PET', 'f0000000-0000-4000-8000-0000000000ee');
        await r.shareLinks.lockScope('HOUSEHOLD', 'f0000000-0000-4000-8000-0000000000ef');
      })).resolves.toBeUndefined();
    });

    it('[REQ-VET-008][SC-005-022] la auditoría guarda eventos sin FK al enlace (sobrevive a la purga de la fila) y rechaza tipos fuera de la enumeración', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        await r.shareAudit.insert(audit(1, { shareLinkId: null, eventType: 'ACCESS_OK', actorUserId: null, ipHmac: 'a'.repeat(64) }));
        await r.shareAudit.insert(audit(2, { shareLinkId: linkId(77) }));
      });
      expect((await uow.runInTransaction((r) => r.shareAudit.listAll())).map((a) => a.eventType)).toEqual(['ACCESS_OK', 'CREATED']);
      await expect(uow.runInTransaction((r) => r.shareAudit.insert(audit(3, { eventType: 'HACKED' as never })))).rejects.toThrow(/check constraint/i);
    });

    it('[SC-005-022] recordFailure agrega por (ip_hmac, ventana): el mismo par suma, otra IP u otra ventana crean fila nueva', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        const ip = 'b'.repeat(64);
        await r.shareAudit.recordFailure('f2000000-0000-4000-8000-000000000611', ip, '2026-11-18T12:00:00.000Z');
        await r.shareAudit.recordFailure('f2000000-0000-4000-8000-000000000612', ip, '2026-11-18T12:00:00.000Z');
        await r.shareAudit.recordFailure('f2000000-0000-4000-8000-000000000613', ip, '2026-11-18T12:00:00.000Z');
        await r.shareAudit.recordFailure('f2000000-0000-4000-8000-000000000614', ip, '2026-11-18T12:10:00.000Z');
        await r.shareAudit.recordFailure('f2000000-0000-4000-8000-000000000615', 'c'.repeat(64), '2026-11-18T12:00:00.000Z');
      });
      const rows = await uow.runInTransaction((r) => r.shareAudit.listAll());
      expect(rows.map((a) => [a.ipHmac![0], a.occurredAt, a.failCount, a.eventType, a.shareLinkId])).toEqual([
        ['b', '2026-11-18T12:00:00.000Z', 3, 'ACCESS_FAILED', null],
        ['b', '2026-11-18T12:10:00.000Z', 1, 'ACCESS_FAILED', null],
        ['c', '2026-11-18T12:00:00.000Z', 1, 'ACCESS_FAILED', null],
      ]);
    });

    it('[REQ-VET-013][PN-06][SC-005-042] la auditoría sin IP se purga a los 90 días y toda fila con ip_hmac a los 30', async () => {
      const uow = await prepare();
      const purged = await uow.runInTransaction(async (r) => {
        await r.shareAudit.insert(audit(1, { occurredAt: day(-91) }));
        await r.shareAudit.insert(audit(2, { occurredAt: day(-89) }));
        await r.shareAudit.insert(audit(3, { occurredAt: day(-31), eventType: 'ACCESS_OK', actorUserId: null, ipHmac: 'd'.repeat(64) }));
        await r.shareAudit.insert(audit(4, { occurredAt: day(-29), eventType: 'ACCESS_OK', actorUserId: null, ipHmac: 'd'.repeat(64) }));
        await r.shareAudit.insert(audit(5, { occurredAt: day(-60), eventType: 'REVOKED' }));
        return r.shareAudit.purge({ withoutIpBefore: day(-90), withIpBefore: day(-30) });
      });
      expect(purged).toBe(2);
      expect((await uow.runInTransaction((r) => r.shareAudit.listAll())).map((a) => a.id.slice(-2)).sort()).toEqual(['02', '04', '05']);
    });

    it('[REQ-VET-008] clearActor pone a NULL el actor de las filas del usuario al eliminar su cuenta (sin FK)', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        await r.shareAudit.insert(audit(1));
        await r.shareAudit.insert(audit(2, { actorUserId: MARIA.id }));
        await r.shareAudit.clearActor(ANDRES.id);
      });
      expect((await uow.runInTransaction((r) => r.shareAudit.listAll())).map((a) => a.actorUserId)).toEqual([null, MARIA.id]);
    });

    it('[REQ-CLD-007][REQ-VET-013] el mantenimiento diario purga enlaces vencidos o revocados a 30 días y la auditoría a 90 días (30 días con ip_hmac)', async () => {
      const uow = await prepare();
      await uow.runInTransaction(async (r) => {
        await r.shareLinks.insert(link(1, { createdAt: day(-40), expiresAt: day(-33) }));
        await r.shareLinks.insert(link(2, { revokedAt: day(-31) }));
        await r.shareLinks.insert(link(3, { revokedAt: day(-5) }));
        await r.shareLinks.insert(link(4));
        await r.shareAudit.insert(audit(1, { occurredAt: day(-95) }));
        await r.shareAudit.insert(audit(2, { occurredAt: day(-40), eventType: 'ACCESS_OK', actorUserId: null, ipHmac: 'e'.repeat(64) }));
        await r.shareAudit.insert(audit(3, { occurredAt: day(-10), eventType: 'ACCESS_OK', actorUserId: null, ipHmac: 'e'.repeat(64) }));
      });
      await runMaintenance({ uow, clock: new FixedClockAdapter(NOW.slice(0, 10), NOW) });
      expect((await uow.runInTransaction((r) => r.shareLinks.listAll())).map((l) => l.id).sort()).toEqual([linkId(3), linkId(4)]);
      expect((await uow.runInTransaction((r) => r.shareAudit.listAll())).map((a) => a.id.slice(-2))).toEqual(['03']);
    });
  });
}

defineShareContract('memoria', async () => new InMemoryUnitOfWork());

let sqliteDb: SqliteDatabase | undefined;
defineShareContract(
  'SQLite',
  async () => {
    sqliteDb = openSqliteDatabase(IN_MEMORY_DATABASE);
    return new SqliteUnitOfWork(sqliteDb);
  },
  () => {
    sqliteDb?.close();
    sqliteDb = undefined;
  },
);

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const PG_SCHEMA = allPostgresMigrationsSql(); // incluye 0009/0010/0011: INSERT de mascotas escribe life_status/deceased_at/version

describe.skipIf(!TEST_DATABASE_URL)('enlaces veterinarios contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', { timeout: 60_000 }, () => {
  let pool: PoolLike | undefined;
  let admin: PoolLike | undefined;
  let schema = '';
  defineShareContract(
    'PostgreSQL',
    async () => {
      schema = `argos_s_${randomUUID().replaceAll('-', '')}`;
      admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
      await admin.query(`CREATE SCHEMA ${schema}`);
      const url = new URL(TEST_DATABASE_URL ?? '');
      url.searchParams.set('options', `-c search_path=${schema}`);
      pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
      await pool.query(PG_SCHEMA);
      const { createPostgresRepositories } = (await import('../../../src/infrastructure/persistence/postgres/postgres-repositories.ts')) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
      return new PostgresUnitOfWork(pool, createPostgresRepositories);
    },
    async () => {
      if (pool) await closePool(pool);
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await closePool(admin);
      }
      pool = undefined;
      admin = undefined;
    },
  );
});

describe('T766 migración share_links y paridad entre motores (REQ-VET-003, REQ-VET-004, REQ-VET-005, REQ-VET-010; SC-005-015, SC-005-018, SC-005-019, SC-005-024)', () => {
  const SQLITE_SQL = readFileSync(new URL('../../../src/infrastructure/persistence/sqlite/migrations/0012_share_links.sql', import.meta.url), 'utf8');
  const PG_SQL = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0008_share_links.sql', import.meta.url), 'utf8');
  const columnsOf = (sql: string, table: string): string[] => {
    const body = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\)`).exec(sql)![1]!;
    return body.split('\n').map((l) => /^\s{2}([a-z_]+)\s/.exec(l)?.[1]).filter((c): c is string => c !== undefined && !['CHECK', 'UNIQUE', 'PRIMARY'].includes(c.toUpperCase())).sort();
  };

  it('[REQ-VET-003] ambos motores crean las mismas columnas de share_links y share_link_audit; sin columna de token, de estado, de IP en claro ni ip_key_version (PN-06)', () => {
    for (const table of ['share_links', 'share_link_audit']) expect(columnsOf(PG_SQL, table)).toEqual(columnsOf(SQLITE_SQL, table));
    expect(columnsOf(SQLITE_SQL, 'share_links')).toEqual(['created_at', 'created_by_user_id', 'expires_at', 'expires_in_days', 'household_id', 'id', 'idempotency_key', 'include_clinical_files', 'include_microchip', 'pet_id', 'pet_owner_user_id_at_creation', 'revoked_at', 'scope', 'token_hash']);
    expect(columnsOf(SQLITE_SQL, 'share_link_audit')).toEqual(['actor_user_id', 'event_type', 'fail_count', 'id', 'ip_hmac', 'occurred_at', 'share_link_id']);
    for (const sql of [SQLITE_SQL, PG_SQL]) expect(sql).not.toMatch(/ip_key_version|\btoken\s+TEXT|\bstatus\b|\bip\s+TEXT/i);
  });

  it('[REQ-VET-010] las claves foráneas de share_links son ON DELETE CASCADE (mascota, hogar, creador); share_link_audit no tiene claves foráneas', () => {
    for (const sql of [SQLITE_SQL, PG_SQL]) {
      const links = /CREATE TABLE share_links \(([\s\S]*?)\n\)/.exec(sql)![1]!;
      expect((links.match(/REFERENCES \w+ \(id\) ON DELETE CASCADE/g) ?? []).length).toBe(3);
      expect(/CREATE TABLE share_link_audit \(([\s\S]*?)\n\)/.exec(sql)![1]!).not.toMatch(/REFERENCES/);
      expect(links).toMatch(/expires_in_days IN \(1, ?7, ?30\)/);
      expect(links).toMatch(/UNIQUE \(created_by_user_id, idempotency_key\)/);
    }
  });

  it('[REQ-VET-013][PN-06] share_links, share_link_audit y platform_parameters quedan fuera de la exportación e importación de respaldo (RAMA-005-008)', () => {
    const backup = readFileSync(new URL('../../../src/application/use-cases/backup-use-cases.ts', import.meta.url), 'utf8');
    expect(backup).not.toMatch(/share_link|shareLinks|shareAudit/);
    const envelope = readFileSync(new URL('../../../specs/004-catalogos-registros-archivos/contracts/schemas/backup-envelope.schema.json', import.meta.url), 'utf8');
    expect(envelope).not.toMatch(/share_link|shareLink|token_hash|platform_parameter/);
  });
});
