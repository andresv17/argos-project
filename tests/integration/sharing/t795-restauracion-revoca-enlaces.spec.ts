/**
 * T795 [US4] compuerta técnica de restauración (PN-09, EDGE-005-32, REQ-VET-013, SC-005-042): el script de restauración revoca TODO enlace
 * no revocado antes de reabrir el tráfico; el runbook lo exige; sobre SQLite y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { COUNT_ACTIVE_SHARE_LINKS_SQL, REVOKE_ALL_SHARE_LINKS_SQL, revokeAllShareLinks, type RestoreQueryable } from '../../../scripts/restore-share-links.ts';
import { closePool, createPostgresPool } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';

const NOW = '2026-11-18T12:00:00.000Z';
const ROOT = new URL('../../../', import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, ROOT), 'utf8');

describe('T795 EDGE-005-32 PN-09: el paso de restauración existe y es obligatorio', () => {
  it('el script contiene el UPDATE exacto sin condición adicional y lo ejecuta (compuerta falla si el paso falta)', () => {
    expect(REVOKE_ALL_SHARE_LINKS_SQL).toBe('UPDATE share_links SET revoked_at = $1 WHERE revoked_at IS NULL');
    const script = read('scripts/restore-share-links.ts');
    expect(script).toContain('client.query(REVOKE_ALL_SHARE_LINKS_SQL');
  });

  it('el runbook de terraform/README.md exige el paso antes de reabrir el servicio', () => {
    const readme = read('terraform/README.md');
    expect(readme).toContain('UPDATE share_links SET revoked_at');
    expect(readme).toContain('scripts/restore-share-links.ts');
    expect(readme).toMatch(/EDGE-005-32/);
  });
});

function sqliteQueryable(db: Database.Database): RestoreQueryable {
  return {
    query: (text, values = []) => {
      const sql = text.replace(/\$1/g, '?').replace('::int', '');
      const stmt = db.prepare(sql);
      if (stmt.reader) return Promise.resolve({ rowCount: null, rows: stmt.all(...values) as Array<Record<string, unknown>> });
      return Promise.resolve({ rowCount: stmt.run(...values).changes, rows: [] });
    },
  };
}

describe('T795 SQLite: tras restaurar, ningún enlace queda activo', () => {
  it('revoca los activos, conserva el revoked_at previo de los ya revocados y deja cero activos', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE share_links (id TEXT PRIMARY KEY, revoked_at TEXT)');
    db.prepare('INSERT INTO share_links VALUES (?, ?)').run('a', null);
    db.prepare('INSERT INTO share_links VALUES (?, ?)').run('b', null);
    db.prepare('INSERT INTO share_links VALUES (?, ?)').run('c', '2026-11-01T00:00:00.000Z');
    const result = await revokeAllShareLinks(sqliteQueryable(db), NOW);
    expect(result).toEqual({ revoked: 2, activeAfter: 0 });
    expect(db.prepare('SELECT revoked_at FROM share_links WHERE id = ?').get('c')).toEqual({ revoked_at: '2026-11-01T00:00:00.000Z' });
    expect(db.prepare('SELECT revoked_at FROM share_links WHERE id = ?').get('a')).toEqual({ revoked_at: NOW });
    expect(db.prepare(COUNT_ACTIVE_SHARE_LINKS_SQL.replace('::int', '')).get()).toEqual({ activos: 0 });
  });

  it('lanza si el UPDATE no puede ejecutarse (tabla ausente): no hay reapertura silenciosa', async () => {
    const db = new Database(':memory:');
    await expect(revokeAllShareLinks(sqliteQueryable(db), NOW)).rejects.toThrow(/share_links/);
  });

  it('lanza si queda algún enlace activo tras el UPDATE (poscondición)', async () => {
    const fake: RestoreQueryable = {
      query: (text) => Promise.resolve(text.startsWith('UPDATE') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ activos: 3 }] }),
    };
    await expect(revokeAllShareLinks(fake, NOW)).rejects.toThrow(/quedan 3/);
  });
});

describe.skipIf(TEST_DATABASE_URL === undefined)('T795 PostgreSQL 17: tras restaurar, ningún enlace queda activo', () => {
  it('revoca los activos y deja cero activos (esquema aislado)', async () => {
    const schema = `argos_r_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(TEST_DATABASE_URL ?? '');
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 1 });
    try {
      await pool.query(`${POSTGRES_SCHEMA_SQL}\n${read('src/infrastructure/persistence/postgres/migrations/0007_platform_parameters.sql')}\n${read('src/infrastructure/persistence/postgres/migrations/0008_share_links.sql')}\n${read('src/infrastructure/persistence/postgres/migrations/0011_share_link_deceased_at.sql')}`);
      // Sin fixtures de dominio completas: se desactivan las claves foráneas para sembrar solo la tabla bajo prueba.
      await pool.query('ALTER TABLE share_links DISABLE TRIGGER ALL');
      const ins = (id: string, revoked: string | null): Promise<unknown> =>
        pool.query(
          `INSERT INTO share_links (id, token_hash, scope, household_id, created_by_user_id, created_at, expires_in_days, expires_at, revoked_at, idempotency_key)
           VALUES ($1, $2, 'HOUSEHOLD', 'h1', 'u1', '2026-11-10T00:00:00.000Z', 30, '2026-12-10T00:00:00.000Z', $3, $1)`,
          [id, id.padEnd(64, '0'), revoked],
        );
      await ins('a', null);
      await ins('b', null);
      await ins('c', '2026-11-01T00:00:00.000Z');
      const result = await revokeAllShareLinks(pool as unknown as RestoreQueryable, NOW);
      expect(result).toEqual({ revoked: 2, activeAfter: 0 });
      const rows = await pool.query("SELECT id, revoked_at FROM share_links ORDER BY id");
      expect(rows.rows).toEqual([{ id: 'a', revoked_at: NOW }, { id: 'b', revoked_at: NOW }, { id: 'c', revoked_at: '2026-11-01T00:00:00.000Z' }]);
    } finally {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    }
  });
});
