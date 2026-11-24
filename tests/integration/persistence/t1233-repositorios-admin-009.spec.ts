import { afterEach, describe, expect, it } from 'vitest';
import type { AdminIdentityRecord, AdminSessionRecord } from '../../../src/application/ports/admin.port.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { InMemoryUnitOfWork, emptyMemoryState } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { expectParametrized, fakeClient } from '../../fixtures/pg-fake-client.ts';

/**
 * T1233 (pruebas rojas, Feature 009, Fase 3, #19): repositorios de administración (`adminIdentities`, `adminSessions`, `adminFlows`, `adminAudit`) con el mismo contrato en SQLite y
 * memoria, y SQL parametrizado con paridad en Postgres (doble del cliente). REQ-ADM9-003, REQ-ADM9-004, REQ-ADM9-006, INV-ADM9-001; SC-009-048.
 */
const opened: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
});

const NOW = '2026-11-23T10:00:00.000Z';
const T10 = '2026-11-23T10:10:00.000Z';
const T15 = '2026-11-23T10:15:00.000Z';
const T30 = '2026-11-23T10:30:00.000Z';
const ID_A = '00000000-0000-4000-8000-000000000001';
const ID_B = '00000000-0000-4000-8000-000000000002';
const h = (c: string) => c.repeat(64);
const identity = (over: Partial<AdminIdentityRecord> = {}): AdminIdentityRecord => ({ adminId: ID_A, provider: 'GOOGLE', providerSubject: 'sub-1', email: 'admin@example.test', createdAt: NOW, ...over });
const session = (over: Partial<AdminSessionRecord> = {}): AdminSessionRecord => ({ tokenHash: h('a'), adminId: ID_A, createdAt: NOW, lastActivityAt: NOW, revokedAt: null, ...over });

function define(name: string, factory: () => UnitOfWorkPort): void {
  const run = <T>(work: (r: RepositorySet) => Promise<T>): Promise<T> => factory().runInTransaction(work);
  // Cada prueba usa su propia base: el factory devuelve una unidad de trabajo nueva, así que el trabajo de cada caso ocurre dentro de UNA transacción.
  describe(`${name}: repositorio de identidades de administración [REQ-ADM9-003]`, () => {
    it('insertIfAbsent inserta una vez y devuelve false si el (provider, sub) o el correo ya existen; la existente no cambia', async () => {
      await run(async (r) => {
        expect(await r.adminIdentities.insertIfAbsent(identity())).toBe(true);
        expect(await r.adminIdentities.insertIfAbsent(identity({ adminId: ID_B }))).toBe(false);
        expect(await r.adminIdentities.insertIfAbsent(identity({ adminId: ID_B, providerSubject: 'sub-2' }))).toBe(false);
        expect(await r.adminIdentities.findById(ID_A)).toEqual(identity());
        expect(await r.adminIdentities.findById(ID_B)).toBeNull();
      });
    });

    it('busca por sub, por correo y por id; null si no hay', async () => {
      await run(async (r) => {
        await r.adminIdentities.insertIfAbsent(identity());
        await r.adminIdentities.insertIfAbsent(identity({ adminId: ID_B, providerSubject: 'sub-2', email: 'dos@example.test' }));
        expect(await r.adminIdentities.findBySubject('GOOGLE', 'sub-2')).toEqual(identity({ adminId: ID_B, providerSubject: 'sub-2', email: 'dos@example.test' }));
        expect(await r.adminIdentities.findByEmail('admin@example.test')).toEqual(identity());
        expect(await r.adminIdentities.findBySubject('GOOGLE', 'nada')).toBeNull();
        expect(await r.adminIdentities.findByEmail('nadie@example.test')).toBeNull();
      });
    });
  });

  describe(`${name}: repositorio de sesiones de administración [REQ-ADM9-002]`, () => {
    it('inserta, lee por hash, renueva la actividad y revoca una sola vez (compare-and-set)', async () => {
      await run(async (r) => {
        await r.adminIdentities.insertIfAbsent(identity());
        await r.adminSessions.insert(session());
        expect(await r.adminSessions.findByTokenHash(h('a'))).toEqual(session());
        expect(await r.adminSessions.findByTokenHash(h('z'))).toBeNull();
        await r.adminSessions.touch(h('a'), T10);
        expect((await r.adminSessions.findByTokenHash(h('a')))?.lastActivityAt).toBe(T10);
        expect(await r.adminSessions.revoke(h('a'), T15)).toBe(true);
        expect(await r.adminSessions.revoke(h('a'), T30)).toBe(false);
        expect((await r.adminSessions.findByTokenHash(h('a')))?.revokedAt).toBe(T15);
      });
    });

    it('touch no revive ni modifica una sesión revocada', async () => {
      await run(async (r) => {
        await r.adminIdentities.insertIfAbsent(identity());
        await r.adminSessions.insert(session());
        await r.adminSessions.revoke(h('a'), T10);
        await r.adminSessions.touch(h('a'), T30);
        expect((await r.adminSessions.findByTokenHash(h('a')))?.lastActivityAt).toBe(NOW);
      });
    });

    it('un hash duplicado se rechaza y purgeCreatedBefore borra las sesiones creadas hasta el corte y devuelve cuántas', async () => {
      await run(async (r) => {
        await r.adminIdentities.insertIfAbsent(identity());
        await r.adminSessions.insert(session());
        await expect(r.adminSessions.insert(session())).rejects.toThrow(/constraint failed|duplicado/);
      });
      await run(async (r) => {
        await r.adminIdentities.insertIfAbsent(identity());
        await r.adminSessions.insert(session({ tokenHash: h('a'), createdAt: NOW, lastActivityAt: NOW }));
        await r.adminSessions.insert(session({ tokenHash: h('b'), createdAt: T30, lastActivityAt: T30 }));
        expect(await r.adminSessions.purgeCreatedBefore(T10)).toBe(1);
        expect(await r.adminSessions.findByTokenHash(h('a'))).toBeNull();
        expect((await r.adminSessions.findByTokenHash(h('b')))?.tokenHash).toBe(h('b'));
      });
    });
  });

  describe(`${name}: repositorio del estado del flujo de administración [REQ-ADM9-006]`, () => {
    const flow = { tokenHash: h('f'), state: 's'.repeat(43), nonce: 'n'.repeat(43), codeVerifier: 'v'.repeat(43), createdAt: NOW, expiresAt: T15, consumedAt: null };

    it('consume es de UN solo uso: devuelve la fila marcada la primera vez y null después; null si venció o no existe', async () => {
      await run(async (r) => {
        await r.adminFlows.insert(flow);
        expect(await r.adminFlows.consume(h('f'), T10)).toEqual({ ...flow, consumedAt: T10 });
        expect(await r.adminFlows.consume(h('f'), T10)).toBeNull();
        expect(await r.adminFlows.consume(h('0'), T10)).toBeNull();
      });
      await run(async (r) => {
        await r.adminFlows.insert(flow);
        expect(await r.adminFlows.consume(h('f'), T15)).toBeNull();
      });
    });

    it('purgeExpired borra las filas vencidas (expiresAt <= ahora) y devuelve cuántas', async () => {
      await run(async (r) => {
        await r.adminFlows.insert(flow);
        await r.adminFlows.insert({ ...flow, tokenHash: h('g'), expiresAt: T30 });
        expect(await r.adminFlows.purgeExpired(T15)).toBe(1);
        expect(await r.adminFlows.consume(h('f'), NOW)).toBeNull();
        expect((await r.adminFlows.consume(h('g'), NOW))?.tokenHash).toBe(h('g'));
      });
    });

    it('un identificador repetido se rechaza', async () => {
      await run(async (r) => {
        await r.adminFlows.insert(flow);
        await expect(r.adminFlows.insert(flow)).rejects.toThrow(/constraint failed|duplicado/);
      });
    });
  });

  describe(`${name}: repositorio de auditoría de administración [REQ-ADM9-004]`, () => {
    it('inserta y lista por administrador en orden de marca de tiempo, solo con id, acción, objeto y marca', async () => {
      await run(async (r) => {
        await r.adminAudit.insert({ id: ID_A, adminId: ID_B, action: 'ADMIN_SESSION_END', objectRef: null, occurredAt: T10 });
        await r.adminAudit.insert({ id: ID_B, adminId: ID_B, action: 'ADMIN_SESSION_START', objectRef: null, occurredAt: NOW });
        await r.adminAudit.insert({ id: '00000000-0000-4000-8000-000000000003', adminId: ID_A, action: 'ADMIN_SESSION_START', objectRef: 'obj', occurredAt: NOW });
        const rows = await r.adminAudit.listByAdmin(ID_B);
        expect(rows.map((x) => [x.action, x.occurredAt, x.objectRef])).toEqual([['ADMIN_SESSION_START', NOW, null], ['ADMIN_SESSION_END', T10, null]]);
        expect(Object.keys(rows[0]!).sort()).toEqual(['action', 'adminId', 'id', 'objectRef', 'occurredAt']);
      });
    });
  });
}

define('SQLite', () => {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  return new SqliteUnitOfWork(db);
});
define('Memoria', () => new InMemoryUnitOfWork(emptyMemoryState()));

describe('T1233 [REQ-ADM9-006] Postgres: SQL parametrizado con el mismo contrato', () => {
  const COLS_IDENTITY = 'admin_id, provider, provider_subject, email, created_at';

  it('adminIdentities: INSERT ... ON CONFLICT DO NOTHING parametrizado; true con una fila, false con ninguna; findByEmail y findBySubject mapean la fila', async () => {
    const row = { admin_id: ID_A, provider: 'GOOGLE', provider_subject: 'sub-1', email: 'admin@example.test', created_at: NOW };
    const client = fakeClient({ rowCount: 1 }, { rowCount: 0 }, { rows: [row] }, { rows: [row] }, { rows: [row] }, { rows: [] });
    const r = createPostgresRepositories(client);
    expect(await r.adminIdentities.insertIfAbsent(identity())).toBe(true);
    expect(await r.adminIdentities.insertIfAbsent(identity())).toBe(false);
    expect(await r.adminIdentities.findBySubject('GOOGLE', 'sub-1')).toEqual(identity());
    expect(await r.adminIdentities.findByEmail('admin@example.test')).toEqual(identity());
    expect(await r.adminIdentities.findById(ID_A)).toEqual(identity());
    expect(await r.adminIdentities.findById(ID_B)).toBeNull();
    expect(client.calls[0]!.sql).toBe(`INSERT INTO admin_identities (${COLS_IDENTITY}) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`);
    expectParametrized(client.calls);
  });

  it('adminSessions: inserta, lee, renueva solo si no está revocada, revoca con compare-and-set y purga por fecha de creación', async () => {
    const row = { token_hash: h('a'), admin_id: ID_A, created_at: NOW, last_activity_at: NOW, revoked_at: null };
    const client = fakeClient({}, { rows: [row] }, {}, { rowCount: 1 }, { rowCount: 0 }, { rowCount: 3 });
    const r = createPostgresRepositories(client);
    await r.adminSessions.insert(session());
    expect(await r.adminSessions.findByTokenHash(h('a'))).toEqual(session());
    await r.adminSessions.touch(h('a'), T10);
    expect(await r.adminSessions.revoke(h('a'), T15)).toBe(true);
    expect(await r.adminSessions.revoke(h('a'), T15)).toBe(false);
    expect(await r.adminSessions.purgeCreatedBefore(T10)).toBe(3);
    expect(client.calls[2]!.sql).toContain('revoked_at IS NULL');
    expect(client.calls[3]!.sql).toContain('revoked_at IS NULL');
    expectParametrized(client.calls);
  });

  it('adminFlows: consume es UPDATE ... RETURNING con consumed_at IS NULL y expires_at > ahora; purga con DELETE', async () => {
    const row = { token_hash: h('f'), state: 's', nonce: 'n', code_verifier: 'v', created_at: NOW, expires_at: T15, consumed_at: T10 };
    const client = fakeClient({}, { rows: [row] }, { rows: [] }, { rowCount: 2 });
    const r = createPostgresRepositories(client);
    await r.adminFlows.insert({ tokenHash: h('f'), state: 's', nonce: 'n', codeVerifier: 'v', createdAt: NOW, expiresAt: T15, consumedAt: null });
    expect(await r.adminFlows.consume(h('f'), T10)).toEqual({ tokenHash: h('f'), state: 's', nonce: 'n', codeVerifier: 'v', createdAt: NOW, expiresAt: T15, consumedAt: T10 });
    expect(await r.adminFlows.consume(h('f'), T10)).toBeNull();
    expect(await r.adminFlows.purgeExpired(T15)).toBe(2);
    expect(client.calls[1]!.sql).toMatch(/UPDATE admin_oauth_flow_states SET consumed_at = \$1 WHERE token_hash = \$2 AND consumed_at IS NULL AND expires_at > \$1 RETURNING/);
    expectParametrized(client.calls);
  });

  it('adminAudit: INSERT parametrizado y lectura por administrador ordenada; el valor hostil viaja como parámetro', async () => {
    const hostile = "x'; DROP TABLE admin_audit_entries; --";
    const client = fakeClient({}, { rows: [{ id: ID_A, admin_id: ID_B, action: 'ADMIN_SESSION_START', object_ref: null, occurred_at: NOW }] });
    const r = createPostgresRepositories(client);
    await r.adminAudit.insert({ id: ID_A, adminId: ID_B, action: 'ADMIN_SESSION_START', objectRef: hostile, occurredAt: NOW });
    expect(await r.adminAudit.listByAdmin(ID_B)).toEqual([{ id: ID_A, adminId: ID_B, action: 'ADMIN_SESSION_START', objectRef: null, occurredAt: NOW }]);
    expect(client.calls[0]!.values).toContain(hostile);
    expect(client.calls[1]!.sql).toContain('ORDER BY occurred_at, id');
    expectParametrized(client.calls);
  });
});
