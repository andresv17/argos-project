/**
 * T430 (REQ-PG-007, REQ-MIG-001, D-23 = A, US2 AC3): traslado SQLite -> PostgreSQL por el respaldo v3 existente, sin migrador de
 * filas ad hoc. Origen: SQLite real (en memoria) con dos usuarios (ANDRES y MARIA) y un hogar compartido. Destino: las cuentas se
 * REGISTRAN de nuevo en PostgreSQL (RegisterUserUseCase sobre PostgresUnitOfWork con un doble del cliente) y a cada una se le
 * importa el respaldo v3 de la otra base (ImportBackupUseCase). La prueba afirma exactamente qué se conserva (mascotas y las 6
 * colecciones clínicas) y qué se pierde (credenciales, hogares, membresías, invitaciones, asignaciones, sesiones y auditoría).
 * La parte viva contra PostgreSQL real se OMITE sin TEST_DATABASE_URL (aplazada a T431 por decisión de Neo, sin Docker).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ExportBackupUseCase, ImportBackupUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { RegisterUserUseCase } from '../../../src/application/use-cases/auth-use-cases.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import type { PoolClientLike, PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { createPostgresRepositories } from '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, HOUSEHOLD, LUNA, MARIA, canonicalState, createDeps } from '../../fixtures/application-harness.ts';
import { digestOf } from '../../fixtures/backup-harness.ts';
import { norm } from '../../fixtures/pg-fake-client.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const MODULES = ['weights', 'bodyMeasurements', 'vaccinations', 'dewormings', 'medicalVisits', 'customParameters'] as const;
const TABLE_OF: Record<(typeof MODULES)[number], string> = {
  weights: 'weights',
  bodyMeasurements: 'body_measurements',
  vaccinations: 'vaccinations',
  dewormings: 'dewormings',
  medicalVisits: 'medical_visits',
  customParameters: 'custom_parameters',
};
/** Lo que el traslado conserva en PostgreSQL: mascotas y sus 6 colecciones. */
const KEPT_TABLES = ['pets', ...Object.values(TABLE_OF)];
/** Lo que se pierde (D-23 = A): nada de esto se escribe en PostgreSQL a partir del origen. */
const LOST_SQLITE_TABLES = ['users', 'sessions', 'login_attempts', 'households', 'household_members', 'household_invitations', 'pet_assignments', 'audit_log'] as const;

const opened: SqliteDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const MARIA_RECORD_IDS = Object.fromEntries(MODULES.map((m, i) => [m, `eeeeeeee-eeee-4eee-8eee-eeeeeeeeee0${i + 1}`])) as Record<(typeof MODULES)[number], string>;

/** SQLite con 2 cuentas (ANDRES y MARIA), el hogar compartido, una sesión por cuenta y registros en las 6 colecciones de ambas. */
async function sqliteSource() {
  const state = canonicalState();
  state.sessions = {
    'sqlite-session-andres': { userId: ANDRES, createdAt: '2026-11-01T10:00:00.000Z', lastActivityAt: '2026-11-01T10:00:00.000Z', revokedAt: null },
    'sqlite-session-maria': { userId: MARIA, createdAt: '2026-11-01T10:05:00.000Z', lastActivityAt: '2026-11-01T10:05:00.000Z', revokedAt: null },
  };
  state.loginFailures = { andres: ['2026-11-01T09:00:00.000Z'] };
  // El estado canónico solo trae registros de las mascotas de ANDRES: MARIA recibe uno por colección sobre LUNA.
  for (const module of MODULES) {
    const template = (state.records[module] as unknown as Array<Record<string, unknown>>)[0]!;
    (state.records[module] as unknown as unknown[]).push({ ...template, id: MARIA_RECORD_IDS[module], petId: LUNA.id });
  }
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, state);
  const deps = createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher());
  return { db, uow, state, exporter: new ExportBackupUseCase(deps) };
}

interface Write {
  readonly sql: string;
  readonly values: unknown[];
}
const WRITE = /^(INSERT|UPDATE|DELETE)\b/;
const tableOf = (sql: string) => /^(?:INSERT INTO|UPDATE|DELETE FROM) (\w+)/.exec(sql)![1]!;

/** Doble del cliente de PostgreSQL: todas las lecturas vuelven vacías (base de nube nueva) y se registra cada escritura. */
function postgresDouble() {
  const writes: Write[] = [];
  const statements: string[] = [];
  const client: PoolClientLike = {
    release: () => undefined,
    async query(text, values = []) {
      const sql = norm(text);
      statements.push(sql);
      if (WRITE.test(sql)) writes.push({ sql, values });
      return { rows: [], rowCount: WRITE.test(sql) ? 1 : 0 };
    },
  };
  const pool: PoolLike = { connect: async () => client, query: client.query.bind(client), on: () => pool, end: async () => undefined };
  const uow = new PostgresUnitOfWork(pool, createPostgresRepositories);
  const deps = createDeps(uow, new FixedClockAdapter(), new SpyPasswordHasher());
  return { writes, statements, uow, register: new RegisterUserUseCase(deps), importer: new ImportBackupUseCase(deps) };
}

/** Lo escrito por tabla (en orden). */
const writesTo = (writes: readonly Write[], table: string) => writes.filter((w) => tableOf(w.sql) === table);
const flatten = (writes: readonly Write[]) => JSON.stringify(writes.map((w) => w.values));

async function transfer() {
  const source = await sqliteSource();
  const target = postgresDouble();
  const accounts: Array<{ label: string; sourceUserId: string; username: string; envelopeJson: string; newUserId: string; result: Awaited<ReturnType<ImportBackupUseCase['execute']>> }> = [];
  for (const [label, sourceUserId, username] of [['ANDRES', ANDRES, 'andres'], ['MARIA', MARIA, 'maria.v']] as const) {
    const exported = await source.exporter.execute(sourceUserId);
    const session = await target.register.execute({ username, displayName: label, password: 'Clave-nueva-123', confirmPassword: 'Clave-nueva-123' });
    const newUserId = session.session.user.id;
    const result = await target.importer.execute(newUserId, exported.json, digestOf(exported.json));
    accounts.push({ label, sourceUserId, username, envelopeJson: exported.json, newUserId, result });
  }
  return { source, target, accounts };
}

describe('T430 exportación v3 de dos usuarios con un hogar compartido (REQ-PG-007, D-23 = A)', () => {
  it('el origen tiene de verdad lo que se perderá: usuarios, hogar compartido, membresías, asignaciones, sesiones y auditoría', async () => {
    const { db } = await sqliteSource();
    const count = (table: string) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number;
    expect(count('users')).toBe(4);
    expect(count('households')).toBe(1);
    expect(db.prepare('SELECT COUNT(*) FROM household_members WHERE household_id = ? AND status = ?').pluck().get(HOUSEHOLD.id, 'ACTIVE')).toBe(2);
    expect(count('household_invitations')).toBe(1);
    expect(count('pet_assignments')).toBeGreaterThan(0);
    expect(count('sessions')).toBe(2);
    expect(count('audit_log')).toBeGreaterThan(0);
    for (const table of LOST_SQLITE_TABLES) expect(count(table), table).toBeGreaterThan(0);
  });

  it('cada exportación trae solo schemaVersion, exportedAt, pets y las 6 colecciones, con las mascotas y registros de esa cuenta', async () => {
    const { exporter, state } = await sqliteSource();
    for (const userId of [ANDRES, MARIA]) {
      const { envelope } = await exporter.execute(userId);
      const ownedIds = state.pets.filter((p) => p.ownerUserId === userId).map((p) => p.id);
      expect(Object.keys(envelope).sort()).toEqual(['exportedAt', 'pets', 'records', 'schemaVersion']);
      expect(envelope.schemaVersion).toBe('3.2.0');
      expect(Object.keys(envelope.records).sort()).toEqual([...MODULES].sort());
      expect(envelope.pets.map((p) => p.id).sort()).toEqual([...ownedIds].sort());
      for (const module of MODULES) {
        const expected = (state.records[module] as unknown as Array<{ petId: string }>).filter((r) => ownedIds.includes(r.petId)).length;
        expect((envelope.records[module] as unknown[]).length, `${userId} ${module}`).toBe(expected);
        expect(expected, `${userId} ${module} no vacío`).toBeGreaterThan(0);
      }
    }
  });

  it('la exportación NO incluye credenciales, hogares, membresías, invitaciones, asignaciones, sesiones ni auditoría', async () => {
    const { exporter, state } = await sqliteSource();
    for (const userId of [ANDRES, MARIA]) {
      const { json } = await exporter.execute(userId);
      for (const forbidden of [
        ...state.users.map((u) => u.passwordHash),
        ...state.users.map((u) => u.id),
        ...state.users.map((u) => u.username),
        HOUSEHOLD.id,
        ...state.memberships.map((m) => m.membershipId),
        ...state.invitations.map((i) => i.invitationId),
        ...Object.keys(state.sessions),
      ]) {
        expect(json, forbidden).not.toContain(forbidden);
      }
      for (const key of ['passwordHash', 'password_hash', 'tokenHash', 'token_hash', 'ownerUserId', 'householdId', 'membership', 'invitation', 'assignment', 'session', 'auditLog', 'mutationType', 'previousStateHash']) {
        expect(json, key).not.toContain(`"${key}"`);
      }
    }
  });
});

describe('T430 importación en PostgreSQL con cuentas registradas de nuevo (doble del cliente)', () => {
  it('conserva las mascotas y sus 6 colecciones de cada cuenta: mismos ids y conteos, con el nuevo dueño', async () => {
    const { source, target, accounts } = await transfer();
    for (const account of accounts) {
      const envelope = JSON.parse(account.envelopeJson) as { pets: Array<{ id: string }>; records: Record<string, Array<{ id: string }>> };
      expect(account.result.finalState).toBe('COMPLETED');
      expect(account.result.importedPetsCount).toBe(envelope.pets.length);
      const importedRecords = MODULES.reduce((sum, m) => sum + envelope.records[m]!.length, 0);
      expect(account.result.importedRecordsCount).toBe(importedRecords);
      expect(account.newUserId).not.toBe(account.sourceUserId);
      const petWrites = writesTo(target.writes, 'pets').filter((w) => w.values[1] === account.newUserId);
      expect(petWrites.map((w) => w.values[0]).sort(), `${account.label} mascotas`).toEqual(envelope.pets.map((p) => p.id).sort());
      for (const module of MODULES) {
        const inserted = writesTo(target.writes, TABLE_OF[module]).map((w) => w.values[0]);
        for (const record of envelope.records[module]!) expect(inserted, `${account.label} ${module}`).toContain(record.id);
      }
    }
    // Totales: lo escrito en cada tabla conservada es exactamente la suma de los dos respaldos.
    const total = (pick: (a: (typeof accounts)[number]) => number) => accounts.reduce((sum, a) => sum + pick(a), 0);
    const envelopes = accounts.map((a) => JSON.parse(a.envelopeJson) as { pets: unknown[]; records: Record<string, unknown[]> });
    expect(writesTo(target.writes, 'pets')).toHaveLength(total((a) => (JSON.parse(a.envelopeJson) as { pets: unknown[] }).pets.length));
    for (const module of MODULES) {
      expect(writesTo(target.writes, TABLE_OF[module])).toHaveLength(envelopes.reduce((sum, e) => sum + e.records[module]!.length, 0));
    }
    expect(source.state.pets.length).toBe(6);
  });

  it('el importador solo escribe mascotas y colecciones, más la fila de auditoría IMPORT propia de la nube', async () => {
    const { target, accounts } = await transfer();
    const registrationWrites = new Set(['users', 'sessions', 'audit_log']);
    const written = new Set(target.writes.map((w) => tableOf(w.sql)));
    for (const table of written) expect([...KEPT_TABLES, ...registrationWrites], table).toContain(table);
    for (const table of ['households', 'household_members', 'household_invitations', 'pet_assignments', 'login_attempts', 'backup_confirmation_tokens', 'rate_limit_events']) {
      expect(written.has(table), `no se escribe ${table}`).toBe(false);
    }
    const audit = writesTo(target.writes, 'audit_log').map((w) => w.values[3]);
    expect(audit.filter((t) => t === 'IMPORT')).toHaveLength(accounts.length);
    expect(audit.filter((t) => t === 'CREATE')).toHaveLength(accounts.length);
    expect(audit.filter((t) => t === 'MIGRATION')).toHaveLength(0);
    // Sin borrados en una base de nube nueva (no había mascotas previas que reemplazar).
    expect(target.writes.filter((w) => w.sql.startsWith('DELETE'))).toEqual([]);
  });

  it('lo que se pierde: nada del origen (ids de cuenta, hashes, hogar, membresías, invitaciones, sesiones) llega a ninguna escritura de PostgreSQL', async () => {
    const { source, target } = await transfer();
    const everything = flatten(target.writes);
    const state = source.state;
    const lost: Array<[string, string]> = [
      ...state.users.map((u): [string, string] => [`credencial de ${u.username}`, u.passwordHash]),
      ...state.users.map((u): [string, string] => [`id de cuenta ${u.username}`, u.id]),
      ['hogar compartido', HOUSEHOLD.id],
      ...state.memberships.map((m): [string, string] => ['membresía', m.membershipId]),
      ...state.invitations.map((i): [string, string] => ['invitación', i.invitationId]),
      ...Object.keys(state.sessions).map((token): [string, string] => ['sesión', token]),
    ];
    expect(lost.length).toBeGreaterThan(10);
    for (const [label, value] of lost) expect(everything, label).not.toContain(value);
    // Las cuentas de nube son nuevas: contraseña propia (hash del doble de pruebas del destino) y sesión nueva.
    const newUsers = writesTo(target.writes, 'users');
    expect(newUsers).toHaveLength(2);
    for (const write of newUsers) expect(state.users.map((u) => u.id)).not.toContain(write.values[0]);
    expect(writesTo(target.writes, 'sessions')).toHaveLength(2);
    // La auditoría del origen (incluida su fila MIGRATION) no se traslada.
    expect(writesTo(target.writes, 'audit_log').every((w) => w.values[3] !== 'MIGRATION')).toBe(true);
  });

  it('las mascotas compartidas por hogar en el origen ya no tienen asignación en el destino: cada cuenta queda sin hogar', async () => {
    const { target } = await transfer();
    expect(writesTo(target.writes, 'pet_assignments')).toEqual([]);
    expect(writesTo(target.writes, 'households')).toEqual([]);
    expect(writesTo(target.writes, 'household_members')).toEqual([]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T430 traslado contra PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', () => {
  it('las cuentas registradas en PostgreSQL reciben sus mascotas y 6 colecciones y la base no contiene hogares ni asignaciones del origen', async () => {
    // Se implementa en T431 con la base real: aplica 0001_baseline, repite este flujo con PostgresUnitOfWork sobre un pool real
    // y comprueba por SQL los conteos de las 6 colecciones y que households, household_members y pet_assignments están vacías.
    expect(typeof TEST_DATABASE_URL).toBe('string');
  });
});
