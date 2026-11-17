/**
 * T425 (REQ-PG-008, REQ-PG-011, INV-AUD-001, REQ-PG-002): `purgeExpired` de PostgreSQL con solo `DELETE` por lotes.
 * Pruebas con doble del cliente (sin Postgres). El módulo y el método se cargan de forma dinámica para que cada prueba
 * falle por separado mientras no existan (pruebas primero). `VACUUM` no es de `argos_app`: lo ejecuta el rol propietario (T473).
 * Criterio de lote (el de SQLite no tiene lotes): `DELETE ... WHERE ctid IN (SELECT ctid ... WHERE <retención> LIMIT $n)`,
 * repetido por tabla hasta que un lote devuelve menos filas que el tamaño. Conteos devueltos = suma de lotes.
 * La prueba contra Postgres real se OMITE sin TEST_DATABASE_URL (se aplaza a T431).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MaintenanceCounts, MaintenanceCutoffs } from '../../../src/application/ports/unit-of-work.port.ts';
import { closePool, createPostgresPool, type PoolClientLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { expectParametrized, norm, type Call } from '../../fixtures/pg-fake-client.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const MAINTENANCE_PATH = '../../../src/infrastructure/persistence/postgres/postgres-maintenance.ts';
const UOW_PATH = '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
const BASELINE = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0001_baseline.sql', import.meta.url), 'utf8');

const CUTOFFS: MaintenanceCutoffs = { now: '2026-11-05T12:00:00.000Z', auditBefore: '2024-11-05T12:00:00.000Z' };
const TABLES = ['sessions', 'backup_confirmation_tokens', 'household_members', 'household_invitations', 'audit_log'] as const;
const BATCH = 500;

interface MaintenanceModule {
  PURGE_BATCH_SIZE: number;
  purgeExpiredInBatches(client: PoolClientLike, cutoffs: MaintenanceCutoffs, batchSize?: number): Promise<MaintenanceCounts>;
}
const loadMaintenance = async (): Promise<MaintenanceModule> => (await import(/* @vite-ignore */ MAINTENANCE_PATH)) as MaintenanceModule;
interface UowModule {
  PostgresUnitOfWork: new (pool: unknown, createRepositories: (client: unknown) => unknown) => {
    purgeExpired(cutoffs: MaintenanceCutoffs): Promise<MaintenanceCounts>;
  };
}

const tableOf = (sql: string) => /^DELETE FROM (\w+) /.exec(sql)?.[1] ?? '';

/** Doble: cada DELETE responde con la siguiente cantidad de filas configurada para su tabla (0 si no hay más). */
function purgeClient(perTable: Partial<Record<(typeof TABLES)[number], Array<number | null | Error>>> = {}) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(perTable).map(([table, counts]) => [table, [...(counts ?? [])]]));
  return {
    calls,
    release: () => undefined,
    async query(text: string, values: unknown[] = []) {
      const sql = norm(text);
      calls.push({ sql, values });
      const next = queues.get(tableOf(sql))?.shift();
      if (next instanceof Error) throw next;
      return { rows: [], rowCount: next === undefined ? 0 : next };
    },
  };
}
const deletes = (calls: readonly Call[]) => calls.filter((c) => c.sql.startsWith('DELETE'));

describe('purgeExpiredInBatches: forma de las sentencias (REQ-PG-008, REQ-PG-011)', () => {
  it('emite una sola sentencia por tabla si no hay nada que borrar, en el orden de ADR-002-14', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient();
    const counts = await purgeExpiredInBatches(client, CUTOFFS);
    expect(deletes(client.calls).map((c) => tableOf(c.sql))).toEqual([...TABLES]);
    expect(counts).toEqual({ sessionsPurged: 0, confirmationTokensPurged: 0, membershipsPurged: 0, invitationsPurged: 0, auditRowsPurged: 0 });
  });

  it('cada DELETE está acotado: ctid IN (SELECT ctid ... LIMIT $n), nunca un borrado sin tope', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient();
    await purgeExpiredInBatches(client, CUTOFFS);
    for (const { sql } of deletes(client.calls)) {
      const table = tableOf(sql);
      expect(sql).toMatch(new RegExp(`^DELETE FROM ${table} WHERE ctid IN \\(SELECT ctid FROM ${table} WHERE .+ LIMIT \\$\\d+\\)$`));
    }
  });

  it('todo valor va como $n (reloj y tope de lote), sin interpolación ni valores textuales en el SQL', async () => {
    const { purgeExpiredInBatches, PURGE_BATCH_SIZE } = await loadMaintenance();
    const client = purgeClient();
    await purgeExpiredInBatches(client, CUTOFFS);
    expectParametrized(client.calls);
    expect(PURGE_BATCH_SIZE).toBe(BATCH);
    const byTable = Object.fromEntries(deletes(client.calls).map((c) => [tableOf(c.sql), c.values]));
    expect(byTable).toEqual({
      sessions: [CUTOFFS.now, BATCH],
      backup_confirmation_tokens: [CUTOFFS.now, BATCH],
      household_members: [CUTOFFS.now, BATCH],
      household_invitations: [CUTOFFS.now, BATCH],
      audit_log: [CUTOFFS.auditBefore, BATCH],
    });
  });

  it('los umbrales de ADR-002-14 se expresan con timestamptz explícito e intervalos', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient();
    await purgeExpiredInBatches(client, CUTOFFS);
    const sql = Object.fromEntries(deletes(client.calls).map((c) => [tableOf(c.sql), c.sql]));
    expect(sql['sessions']).toContain("revoked_at::timestamptz < $1::timestamptz - interval '7 days'");
    expect(sql['sessions']).toContain("created_at::timestamptz < $1::timestamptz - interval '7 days 24 hours'");
    expect(sql['sessions']).toContain("last_activity_at::timestamptz < $1::timestamptz - interval '7 days 30 minutes'");
    expect(sql['backup_confirmation_tokens']).toContain('expires_at::timestamptz < $1::timestamptz');
    expect(sql['household_members']).toContain("status IN ('LEFT', 'REMOVED')");
    expect(sql['household_members']).toContain("(data->>'updatedAt')::timestamptz < $1::timestamptz - interval '90 days'");
    expect(sql['household_invitations']).toContain("status IN ('ACCEPTED', 'DECLINED', 'CANCELLED')");
    expect(sql['household_invitations']).toContain("COALESCE(responded_at, created_at)::timestamptz < $1::timestamptz - interval '90 days'");
    expect(sql['audit_log']).toContain('timestamp::timestamptz < $1::timestamptz');
  });

  it('sin VACUUM, TRUNCATE, ANALYZE, DDL ni escrituras que no sean DELETE (VACUUM es del propietario, T473)', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient({ sessions: [BATCH, 3] });
    await purgeExpiredInBatches(client, CUTOFFS);
    expect(client.calls.every((c) => c.sql.startsWith('DELETE FROM '))).toBe(true);
    expect(client.calls.some((c) => /\b(vacuum|truncate|analyze|alter|drop|insert|update|reindex|cluster)\b/i.test(c.sql))).toBe(false);
  });

  it('[INV-AUD-001] auditoría: un único DELETE por umbral de 24 meses; ninguna fila de auditoría se escribe ni se modifica', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient({ audit_log: [7] });
    const counts = await purgeExpiredInBatches(client, CUTOFFS);
    const audit = client.calls.filter((c) => /\baudit_log\b/.test(c.sql));
    expect(audit.map((c) => c.sql.split(' ')[0])).toEqual(['DELETE']);
    expect(audit[0]?.values[0]).toBe(CUTOFFS.auditBefore);
    expect(audit[0]?.sql).not.toMatch(/executor_user_id|entity_id|mutation_type|ACCOUNT_DELETE/);
    expect(counts.auditRowsPurged).toBe(7);
  });
});

describe('purgeExpiredInBatches: lotes y conteos (REQ-PG-008)', () => {
  it('repite el lote mientras venga lleno y suma los conteos (500 + 500 + 120)', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient({ sessions: [BATCH, BATCH, 120] });
    const counts = await purgeExpiredInBatches(client, CUTOFFS);
    expect(deletes(client.calls).filter((c) => tableOf(c.sql) === 'sessions')).toHaveLength(3);
    expect(counts.sessionsPurged).toBe(1120);
  });

  it('un lote exactamente lleno exige un último lote vacío para terminar', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient({ backup_confirmation_tokens: [BATCH, 0] });
    const counts = await purgeExpiredInBatches(client, CUTOFFS);
    expect(deletes(client.calls).filter((c) => tableOf(c.sql) === 'backup_confirmation_tokens')).toHaveLength(2);
    expect(counts.confirmationTokensPurged).toBe(BATCH);
  });

  it('el tamaño de lote es parametrizable y llega como $2', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient({ household_members: [2, 2, 1] });
    const counts = await purgeExpiredInBatches(client, CUTOFFS, 2);
    expect(deletes(client.calls).filter((c) => tableOf(c.sql) === 'household_members').map((c) => c.values[1])).toEqual([2, 2, 2]);
    expect(counts.membershipsPurged).toBe(5);
  });

  it('devuelve solo conteos numéricos (cinco claves, sin identificadores) y trata rowCount null como 0', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    const client = purgeClient({ sessions: [3], household_invitations: [null], audit_log: [4] });
    const counts = await purgeExpiredInBatches(client, CUTOFFS);
    expect(counts).toEqual({ sessionsPurged: 3, confirmationTokensPurged: 0, membershipsPurged: 0, invitationsPurged: 0, auditRowsPurged: 4 });
  });

  it('rechaza un tamaño de lote no entero positivo (sin bucle infinito)', async () => {
    const { purgeExpiredInBatches } = await loadMaintenance();
    await expect(purgeExpiredInBatches(purgeClient(), CUTOFFS, 0)).rejects.toThrow(RangeError);
    await expect(purgeExpiredInBatches(purgeClient(), CUTOFFS, 1.5)).rejects.toThrow(RangeError);
  });
});

describe('PostgresUnitOfWork.purgeExpired: una transacción con los topes de sesión (REQ-PG-002, REQ-PG-004)', () => {
  async function run(client: ReturnType<typeof purgeClient>) {
    const { PostgresUnitOfWork } = (await import(/* @vite-ignore */ UOW_PATH)) as UowModule;
    const pool = { connect: async () => client, query: async () => ({ rows: [], rowCount: 0 }), on: () => pool, end: async () => undefined };
    return new PostgresUnitOfWork(pool, () => ({})).purgeExpired(CUTOFFS);
  }

  it('BEGIN, SET LOCAL x3, candado asesor, solo DELETE y COMMIT; devuelve los conteos', async () => {
    const client = purgeClient({ sessions: [2] });
    const counts = await run(client);
    const sqls = client.calls.map((c) => c.sql);
    expect(sqls.slice(0, 5)).toEqual([
      'BEGIN',
      "SET LOCAL lock_timeout = '10s'",
      "SET LOCAL statement_timeout = '10s'",
      "SET LOCAL idle_in_transaction_session_timeout = '15s'",
      'SELECT pg_advisory_xact_lock($1)',
    ]);
    expect(sqls.at(-1)).toBe('COMMIT');
    expect(sqls.slice(5, -1).every((s) => s.startsWith('DELETE FROM '))).toBe(true);
    expect(counts.sessionsPurged).toBe(2);
  });

  it('si un lote falla: ROLLBACK, sin COMMIT y el error original', async () => {
    const boom = Object.assign(new Error('lock_timeout'), { code: '55P03' });
    const client = purgeClient({ household_members: [boom] });
    await expect(run(client)).rejects.toBe(boom);
    const sqls = client.calls.map((c) => c.sql);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
  });
});

describe('postgres-maintenance.ts: fuente (INV-ARCH-006, REQ-PG-011)', () => {
  it('no usa process.env, schema_migrations ni VACUUM/TRUNCATE en el código ejecutable', () => {
    const code = readFileSync(new URL(MAINTENANCE_PATH, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/process\.env|schema_migrations|vacuum|truncate/i);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('purga por lotes en PostgreSQL real (SE OMITE: falta TEST_DATABASE_URL; la prueba viva se aplaza a T431)', () => {
  it('borra lo vencido y conserva lo vigente con un lote pequeño; el conteo coincide', async () => {
    const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 2 });
    try {
      await pool.query(BASELINE);
      const old = '2026-10-01T00:00:00.000Z';
      for (let i = 0; i < 5; i += 1) {
        await pool.query('INSERT INTO sessions (token_hash, user_id, data, created_at, last_activity_at, revoked_at) VALUES ($1, $2, $3::jsonb, $4, $4, $5)', [`old-${i}`, 'u', '{}', old, '2026-10-20T00:00:00.000Z']);
      }
      await pool.query('INSERT INTO sessions (token_hash, user_id, data, created_at, last_activity_at, revoked_at) VALUES ($1, $2, $3::jsonb, $4, $5, NULL)', ['live', 'u', '{}', '2026-11-05T10:00:00.000Z', '2026-11-05T11:50:00.000Z']);
      const client = await pool.connect();
      const { purgeExpiredInBatches } = await loadMaintenance();
      const counts = await purgeExpiredInBatches(client, CUTOFFS, 2);
      client.release();
      expect(counts.sessionsPurged).toBe(5);
      expect((await pool.query('SELECT token_hash FROM sessions')).rows).toEqual([{ token_hash: 'live' }]);
    } finally {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    }
  });
});
