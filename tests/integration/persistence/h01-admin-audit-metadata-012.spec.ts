/**
 * H-01 opcion (a) (Feature 012, Bloque B, #23; NFR-012-006 N-E): migracion aditiva `admin_audit_entries.metadata` (SQLite 0038 = PostgreSQL 0034) y repositorios con paridad.
 *  - la columna existe en SQLite (migraciones aplicadas) y en el SQL de PostgreSQL; la migracion es un ADD COLUMN simple, sin reconstruir la tabla;
 *  - un registro previo (sin metadata) se sigue leyendo con `metadata: null`; con metadata se guarda y se lee intacta;
 *  - memoria, SQLite y un cliente PostgreSQL doble comparten contrato; PostgreSQL real solo con TEST_DATABASE_URL.
 * @implements REQ-CHP12-004, NFR-012-006
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { adminAuditRepository as sqliteAudit } from '../../../src/infrastructure/persistence/sqlite/sqlite-admin-repositories.ts';
import { adminAuditRepository as pgAudit } from '../../../src/infrastructure/persistence/postgres/postgres-admin-repositories.ts';

const ADMIN = 'a0000000-0000-4000-8000-000000000001';
const row = (n: number, metadata?: string | null) => ({ id: `b0000000-0000-4000-8000-00000000000${n}`, adminId: ADMIN, action: 'DISPUTE_DECISION_RECORDED', objectRef: 'dispute:x', occurredAt: `2026-11-27T10:00:0${n}.000Z`, ...(metadata === undefined ? {} : { metadata }) });
const PG_SQL = readFileSync(new URL('../../../src/infrastructure/persistence/postgres/migrations/0034_admin_audit_metadata.sql', import.meta.url), 'utf8');
const SQLITE_SQL = readFileSync(new URL('../../../src/infrastructure/persistence/sqlite/migrations/0038_admin_audit_metadata.sql', import.meta.url), 'utf8');

describe('H-01 admin_audit_entries.metadata', () => {
  it('ambas migraciones son un ADD COLUMN aditivo y simple (sin reconstruir la tabla)', () => {
    for (const sql of [SQLITE_SQL, PG_SQL]) {
      const code = sql.split('\n').filter((l) => !l.startsWith('--')).join('\n');
      expect(code.match(/ALTER TABLE admin_audit_entries ADD COLUMN metadata TEXT/g)).toHaveLength(1);
      expect(code).not.toMatch(/DROP|CREATE TABLE|RENAME/i);
    }
  });

  it('SQLite: la columna existe tras migrar, sin clave en filas previas (NULL) y se lee/guarda el JSON', async () => {
    const db = openSqliteDatabase(':memory:');
    const columns = db.prepare("SELECT name, [notnull] AS nn FROM pragma_table_info('admin_audit_entries')").all() as Array<{ name: string; nn: number }>;
    expect(columns.find((c) => c.name === 'metadata')).toEqual({ name: 'metadata', nn: 0 });
    // Fila "previa": INSERT con las 5 columnas originales (como antes de la 0038).
    db.prepare('INSERT INTO admin_audit_entries (id, admin_id, action, object_ref, occurred_at) VALUES (?, ?, ?, ?, ?)').run(row(1).id, ADMIN, 'ADMIN_SESSION_START', null, row(1).occurredAt);
    const repo = sqliteAudit(db);
    const json = JSON.stringify({ reason: 'Motivo ñ "citado"' });
    await repo.insert(row(2, json));
    await repo.insert(row(3));
    const list = await repo.listByAdmin(ADMIN);
    expect(list.map((r) => r.metadata)).toEqual([undefined, json, undefined])
    expect(Object.keys(list[0]!)).not.toContain('metadata');
    expect(JSON.parse(list[1]!.metadata!)).toEqual({ reason: 'Motivo ñ "citado"' });
    expect(() => db.prepare("UPDATE admin_audit_entries SET metadata = 'x' WHERE id = ?").run(row(1).id)).toThrow(/CHECK constraint failed/);
  });

  it('PostgreSQL (cliente doble): inserta metadata como $6 y la lee; sin clave en filas previas', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      release: () => undefined,
      async query(sql: string, values: unknown[] = []) {
        calls.push({ sql, values });
        if (sql.startsWith('SELECT')) return { rows: [{ id: row(1).id, admin_id: ADMIN, action: 'A', object_ref: null, occurred_at: row(1).occurredAt, metadata: null }, { id: row(2).id, admin_id: ADMIN, action: 'A', object_ref: null, occurred_at: row(2).occurredAt, metadata: '{"reason":"r"}' }], rowCount: 2 };
        return { rows: [], rowCount: 1 };
      },
    };
    const repo = pgAudit(client as never);
    await repo.insert(row(2, '{"reason":"r"}'));
    await repo.insert(row(3));
    expect(calls[0]!.sql).toContain('metadata) VALUES ($1, $2, $3, $4, $5, $6)');
    expect(calls[0]!.values[5]).toBe('{"reason":"r"}');
    expect(calls[1]!.values[5]).toBeNull();
    expect((await repo.listByAdmin(ADMIN)).map((r) => r.metadata)).toEqual([undefined, '{"reason":"r"}']);
  });
});

describe.skipIf(process.env['TEST_DATABASE_URL'] === undefined)('H-01 PostgreSQL real (TEST_DATABASE_URL): columna metadata de admin_audit_entries', () => {
  it('tras migrar existe como TEXT NULLable', async () => {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env['TEST_DATABASE_URL']! });
    await client.connect();
    try {
      const schema = `h01_${Date.now()}`;
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query('CREATE TABLE admin_audit_entries (id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, object_ref TEXT, occurred_at TEXT NOT NULL)');
      await client.query("INSERT INTO admin_audit_entries VALUES ('1', 'a', 'X', NULL, 't')");
      await client.query(PG_SQL);
      const { rows } = await client.query('SELECT metadata FROM admin_audit_entries');
      expect(rows).toEqual([{ metadata: null }]);
      await client.query('INSERT INTO admin_audit_entries (id, admin_id, action, occurred_at, metadata) VALUES ($1, $2, $3, $4, $5)', ['2', 'a', 'X', 't', '{"reason":"r"}']);
      await expect(client.query("UPDATE admin_audit_entries SET metadata = 'x'")).rejects.toThrow(/admin_audit_entries_metadata_check|check constraint/i);
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await client.end();
    }
  });
});
