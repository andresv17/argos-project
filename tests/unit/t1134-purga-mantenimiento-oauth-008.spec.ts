import { describe, expect, it } from 'vitest';
import { maintenanceCutoffs } from '../../src/application/use-cases/maintenance-use-cases.ts';
import { hashOneTimeToken } from '../../src/domain/auth/one-time-token.ts';
import { purgeExpiredInBatches } from '../../src/infrastructure/persistence/postgres/postgres-maintenance.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';

/** H-RAMA-008-T1134-01 (NFR-008-004): la purga de mantenimiento incluye oauth_flow_states vencidos (SQLite y PostgreSQL). */
const NOW = '2026-11-21T10:00:00.000Z';
const LATER = '2026-11-21T10:30:00.000Z';

describe('[NFR-008-004] mantenimiento purga oauth_flow_states vencidos', () => {
  it('SQLite: purgeExpired borra la fila USERNAME vencida (consumida o no) y conserva la vigente', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const uow = new SqliteUnitOfWork(db);
    const row = (seed: string, expiresAt: string, consumedAt: string | null) => ({
      tokenHash: hashOneTimeToken(seed), phase: 'USERNAME' as const, intent: 'LOGIN' as const, state: null, nonce: null, codeVerifier: null, userId: null,
      originSessionHash: null, pendingSubject: `sub-${seed}`, pendingEmail: `${seed}@example.test`, createdAt: NOW, expiresAt, consumedAt,
    });
    await uow.runInTransaction(async (r) => {
      await r.oauthFlows.insert(row('consumido', '2026-11-21T10:15:00.000Z', NOW));
      await r.oauthFlows.insert(row('sin-consumir', '2026-11-21T10:15:00.000Z', null));
      await r.oauthFlows.insert(row('vigente', '2026-11-21T11:00:00.000Z', null));
    });
    await uow.purgeExpired!(maintenanceCutoffs(LATER));
    const left = db.prepare('SELECT pending_subject FROM oauth_flow_states').all() as Array<{ pending_subject: string }>;
    expect(left).toEqual([{ pending_subject: 'sub-vigente' }]);
    db.close();
  });

  it('RAMA-03: la purga aplica 900 s de gracia desde la expiración en SQLite (no 24 h): a 899 s se conserva, a 900 s se borra', async () => {
    const mk = async (nowIso: string) => {
      const db = openSqliteDatabase(IN_MEMORY_DATABASE);
      const uow = new SqliteUnitOfWork(db);
      await uow.runInTransaction(async (r) => {
        await r.oauthFlows.insert({ tokenHash: hashOneTimeToken('x'), phase: 'USERNAME', intent: 'LOGIN', state: null, nonce: null, codeVerifier: null, userId: null, originSessionHash: null, pendingSubject: 's', pendingEmail: 'e@example.test', createdAt: NOW, expiresAt: '2026-11-21T10:15:00.000Z', consumedAt: null });
      });
      await uow.purgeExpired!(maintenanceCutoffs(nowIso));
      const n = (db.prepare('SELECT COUNT(*) AS n FROM oauth_flow_states').get() as { n: number }).n;
      db.close();
      return n;
    };
    expect(await mk('2026-11-21T10:29:59.000Z')).toBe(1);
    expect(await mk('2026-11-21T10:30:00.000Z')).toBe(0);
  });

  it('PostgreSQL: el mantenimiento ejecuta un DELETE por lotes sobre oauth_flow_states con el reloj como umbral', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = { query: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
    await purgeExpiredInBatches(client as never, maintenanceCutoffs(LATER));
    const flow = calls.find((c) => c.sql.includes('oauth_flow_states'))!;
    expect(flow.sql).toMatch(/^DELETE FROM oauth_flow_states WHERE ctid IN/);
    expect(flow.sql).toContain("expires_at::timestamptz <= $1::timestamptz - interval '900 seconds'");
    expect(flow.params[0]).toBe(LATER);
  });
});
