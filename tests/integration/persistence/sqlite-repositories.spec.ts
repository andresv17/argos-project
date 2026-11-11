import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  IN_MEMORY_DATABASE,
  openSqliteDatabase,
  runMigrations,
  type SqliteDatabase,
} from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { sessionTokenHash } from '../../../src/infrastructure/persistence/sqlite/sqlite-repositories.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ARGOS as ARGOS_001, HOUSEHOLD, MEMBERSHIPS, envelope as envelope001, fixtures } from '../../fixtures/application-harness.ts';
import { upgradeEnvelope, upgradePet } from '../../fixtures/storage-upgrade.ts';
import { defineRepositoryContractSuite } from '../../fixtures/repository-contract-suite.ts';
import { dumpSqlite, seedSqlite } from '../../fixtures/sqlite-harness.ts';

// Datos de la 001 elevados al esquema 3.0.0 para SQLite, que valida al escribir (T214; T226 y T255 los sustituyen).
const ARGOS = upgradePet(ARGOS_001);
const envelope = upgradeEnvelope(envelope001);
const opened: SqliteDatabase[] = [];
const tempDirs: string[] = [];
function memoryDb(): SqliteDatabase {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  opened.push(db);
  return db;
}
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'argos-sqlite-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('se esperaba un rechazo');
}
const domainFields = (error: unknown) =>
  error instanceof DomainError ? { code: error.code, status: error.status, finalState: error.finalState } : { notDomainError: String(error) };

defineRepositoryContractSuite('SQLite', () => new SqliteUnitOfWork(memoryDb()));

describe('migraciones y apertura de SQLite (src/infrastructure/persistence/sqlite/sqlite-database.ts)', () => {
  it('[INV-PET-005][INV-AUTH-003] las migraciones 0001 y 0002 crean las 16 tablas, activan foreign_keys y quedan registradas una sola vez', () => {
    const dir = tempDir();
    const path = join(dir, 'datos', 'argos.sqlite');
    const db = openSqliteDatabase(path);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();
    const state = [tables, db.pragma('foreign_keys', { simple: true }), db.pragma('journal_mode', { simple: true }), runMigrations(db)];
    db.close();
    const reopened = openSqliteDatabase(path);
    const versions = reopened.prepare('SELECT version FROM schema_migrations').pluck().all();
    reopened.close();
    expect([...state, versions]).toEqual([
      [
        'backup_confirmation_tokens',
        'body_measurements',
        'custom_parameters',
        'dewormings',
        'household_invitations',
        'household_members',
        'households',
        'login_attempts',
        'medical_visits',
        'pets',
        'rate_limit_events',
        'schema_migrations',
        'sessions',
        'users',
        'vaccinations',
        'weights',
      ],
      1,
      'wal',
      [],
      ['0001_init.sql', '0002_account_identity.sql'],
    ]);
  });

  it('[REQ-ACC-001][INV-AUTH2-002][SC-010] la migración 0002 sobre una base de la 001 conserva cuentas y hashes, completa perfil y sesiones y es repetible', () => {
    const dir = tempDir();
    const only0001 = join(dir, 'solo-0001');
    mkdirSync(only0001);
    writeFileSync(join(only0001, '0001_init.sql'), readFileSync(join(DEFAULT_MIGRATIONS_DIR, '0001_init.sql'), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: only0001 });
    const profile = JSON.stringify({ id: 'a0000000-0000-4000-8000-000000000001', username: 'cuenta.vieja', displayName: 'Vieja', createdAt: '2025-01-01T00:00:00.000Z' });
    legacy.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)').run('a0000000-0000-4000-8000-000000000001', 'cuenta.vieja', 'scrypt$ocho-caracteres', profile);
    const oldSession = JSON.stringify({ userId: 'a0000000-0000-4000-8000-000000000001', createdAt: '2026-11-05T12:00:00.000Z', expiresAt: '2026-11-12T12:00:00.000Z', revokedAt: '2026-11-05T13:00:00.000Z' });
    legacy.prepare('INSERT INTO sessions (token_hash, user_id, data) VALUES (?, ?, ?)').run('hash-1', 'a0000000-0000-4000-8000-000000000001', oldSession);
    legacy.close();
    const migrated = openSqliteDatabase(path);
    const user = migrated.prepare('SELECT username, password_hash, email, preferred_language, timezone FROM users').get();
    const session = migrated.prepare('SELECT created_at, last_activity_at, revoked_at, data FROM sessions').get() as { data: string };
    const repeated = runMigrations(migrated);
    const versions = migrated.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all();
    migrated.close();
    expect(user).toEqual({ username: 'cuenta.vieja', password_hash: 'scrypt$ocho-caracteres', email: null, preferred_language: 'es', timezone: 'America/Bogota' });
    expect({ ...session, data: JSON.parse(session.data) }).toEqual({
      created_at: '2026-11-05T12:00:00.000Z',
      last_activity_at: '2026-11-05T12:00:00.000Z',
      revoked_at: '2026-11-05T13:00:00.000Z',
      data: { userId: 'a0000000-0000-4000-8000-000000000001', createdAt: '2026-11-05T12:00:00.000Z', lastActivityAt: '2026-11-05T12:00:00.000Z', revokedAt: '2026-11-05T13:00:00.000Z' },
    });
    expect([repeated, versions]).toEqual([[], ['0001_init.sql', '0002_account_identity.sql']]);
  });

  it('[REQ-ACC-001][ERR-INTERNAL-UNEXPECTED] la base rechaza un idioma fuera de es/en/pt, un ámbito de frecuencia desconocido y un rol o estado de invitación inválido', () => {
    const db = memoryDb();
    const user = (extra: string) => db.exec(`INSERT INTO users (id, username, password_hash, data, preferred_language) VALUES ('u1', 'x', 'h', '{}', '${extra}')`);
    expect(() => user('fr')).toThrow(/CHECK constraint failed/);
    expect(() => db.exec("INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES ('1', 'OTRO', 'nadie', 'ahora')")).toThrow(/CHECK constraint failed/);
    db.exec("INSERT INTO users (id, username, password_hash, data) VALUES ('u2', 'y', 'h', '{}')");
    db.exec("INSERT INTO households (id, owner_user_id, data) VALUES ('h1', 'u2', '{}')");
    expect(() => db.exec("INSERT INTO household_invitations (id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at) VALUES ('i1', 'h1', 'z', NULL, 'u2', 'OWNER', 'INVITED', 'ahora')")).toThrow(/CHECK constraint failed/);
    expect(() => db.exec("INSERT INTO household_invitations (id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join, status, created_at) VALUES ('i1', 'h1', 'z', NULL, 'u2', 'READER', 'LEFT', 'ahora')")).toThrow(/CHECK constraint failed/);
  });

  it('[ERR-INTERNAL-UNEXPECTED] una migración que falla no deja nada a medias y la apertura se rechaza con ERR-INTERNAL-UNEXPECTED', () => {
    const dir = tempDir();
    const migrations = join(dir, 'migrations');
    mkdirSync(migrations);
    writeFileSync(join(migrations, '0001_ok.sql'), 'CREATE TABLE a (x TEXT) STRICT;');
    writeFileSync(join(migrations, '0002_rota.sql'), 'CREATE TABLE b (x TEXT) STRICT; INSERT INTO tabla_inexistente VALUES (1);');
    const path = join(dir, 'argos.sqlite');
    let error: unknown = null;
    try {
      openSqliteDatabase(path, { migrationsDir: migrations });
    } catch (e) {
      error = e;
    }
    mkdirSync(join(dir, 'vacia'));
    const db = openSqliteDatabase(path, { migrationsDir: join(dir, 'vacia') });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all();
    const versions = db.prepare('SELECT version FROM schema_migrations').pluck().all();
    db.close();
    expect([domainFields(error), tables, versions]).toEqual([{ code: 'ERR-INTERNAL-UNEXPECTED', status: 500, finalState: null }, ['a', 'schema_migrations'], ['0001_ok.sql']]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] F4: un archivo que no es una base SQLite produce ERR-INTERNAL-UNEXPECTED controlado, sin caída', () => {
    const path = join(tempDir(), 'corrupta.sqlite');
    writeFileSync(path, 'esto no es una base de datos SQLite, solo texto suficientemente largo para la cabecera'.repeat(20));
    let error: unknown = null;
    try {
      openSqliteDatabase(path);
    } catch (e) {
      error = e;
    }
    expect(domainFields(error)).toEqual({ code: 'ERR-INTERNAL-UNEXPECTED', status: 500, finalState: null });
  });
});

describe('particularidades de SqliteUnitOfWork y los repositorios SQLite', () => {
  it('[INV-PET-005] borrar la mascota borra en cascada, en la misma sentencia, sus registros de los 6 módulos y nada más', async () => {
    const db = memoryDb();
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow);
    const otherPet = envelope.records.dewormings[0]!.petId;
    const before = await uow.runInTransaction(async (r) => Object.values(await r.records.listForPet(otherPet)).flat().length);
    await uow.runInTransaction((r) => r.pets.delete(ARGOS.id));
    const leftovers = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'].map(
      (table) => db.prepare(`SELECT COUNT(*) FROM ${table} WHERE pet_id = ?`).pluck().get(ARGOS.id),
    );
    const after = await uow.runInTransaction(async (r) => Object.values(await r.records.listForPet(otherPet)).flat().length);
    expect([leftovers, after === before, after > 0]).toEqual([[0, 0, 0, 0, 0, 0], true, true]);
  });

  it('[INV-PET-005] reemplazar una mascota con save no borra sus registros (UPSERT, no INSERT OR REPLACE)', async () => {
    const uow = new SqliteUnitOfWork(memoryDb());
    await seedSqlite(uow);
    const before = await uow.runInTransaction((r) => r.records.listForPet(ARGOS.id));
    await uow.runInTransaction((r) => r.pets.save({ ...ARGOS, name: 'Argos II' }));
    const after = await uow.runInTransaction(async (r) => [(await r.pets.findById(ARGOS.id))!.name, await r.records.listForPet(ARGOS.id)]);
    expect(after).toEqual(['Argos II', before]);
  });

  it('[INV-PET-005] si la transacción falla después de borrar la mascota, la mascota y sus registros siguen intactos', async () => {
    const db = memoryDb();
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow);
    const before = dumpSqlite(db);
    const error = await rejectionOf(
      uow.runInTransaction(async (r) => {
        await r.pets.delete(ARGOS.id);
        throw new Error('fallo después del borrado');
      }),
    );
    expect([(error as Error).message, dumpSqlite(db)]).toEqual(['fallo después del borrado', before]);
  });

  it('[REQ-HOUSE-004] C5: borrar el hogar borra en cascada sus membresías; las mascotas y otros hogares no se tocan', async () => {
    const db = memoryDb();
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow);
    const petsBefore = db.prepare('SELECT COUNT(*) FROM pets').pluck().get();
    await uow.runInTransaction((r) => r.households.deleteWithMemberships(HOUSEHOLD.id));
    const counts = ['households', 'household_members', 'pets'].map((t) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get());
    expect(counts).toEqual([0, 0, petsBefore]);
  });

  it('[INV-HOUSE-003] el índice único rechaza una segunda membresía INVITED o ACTIVE del mismo par y admite otra si la anterior está cerrada', async () => {
    const uow = new SqliteUnitOfWork(memoryDb());
    await seedSqlite(uow);
    const active = MEMBERSHIPS.find((m) => m.status === 'ACTIVE' && m.role === 'MEMBER') ?? MEMBERSHIPS[1]!;
    const duplicate = { ...active, membershipId: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01', status: 'INVITED' as const, joinedAt: null, firstJoinedAt: null };
    const rejected = await rejectionOf(uow.runInTransaction((r) => r.households.saveMembership(duplicate)));
    await uow.runInTransaction(async (r) => {
      await r.households.saveMembership({ ...active, status: 'LEFT' });
      await r.households.saveMembership(duplicate);
    });
    const statuses = await uow.runInTransaction(async (r) =>
      (await r.households.listMembershipsOfUsers([active.userId])).filter((m) => m.householdId === active.householdId).map((m) => `${m.membershipId}:${m.status}`).sort(),
    );
    expect([(rejected as { code?: string }).code, statuses]).toEqual(['SQLITE_CONSTRAINT_UNIQUE', [`${active.membershipId}:LEFT`, `${duplicate.membershipId}:INVITED`].sort()]);
  });

  it('[INV-AUTH-003] el token de sesión se guarda como SHA-256 y el hash de la contraseña fuera de data; ninguno aparece en claro en la base', async () => {
    const dir = tempDir();
    const path = join(dir, 'argos.sqlite');
    const db = openSqliteDatabase(path);
    const uow = new SqliteUnitOfWork(db);
    const token = 'token-secreto-de-prueba-0001';
    const user = { ...fixtures.users[0], email: null, preferredLanguage: 'es' as const, timezone: 'America/Bogota', passwordHash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==' };
    await uow.runInTransaction(async (r) => {
      await r.users.insert(user);
      await r.sessions.save(token, { userId: user.id, createdAt: '2026-11-05T12:00:00.000Z', lastActivityAt: '2026-11-05T12:00:00.000Z', revokedAt: null });
    });
    const rows = [db.prepare('SELECT token_hash FROM sessions').pluck().get(), (db.prepare('SELECT data FROM users').pluck().get() as string).includes('scrypt$')];
    const found = await uow.runInTransaction((r) => r.sessions.findByToken(token));
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    const file = readFileSync(path).toString('latin1');
    expect([rows, found?.userId, file.includes(token), file.includes(sessionTokenHash(token))]).toEqual([
      [sessionTokenHash(token), false],
      user.id,
      false,
      true,
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] F4: un dato corrupto (JSON roto, contrato incumplido o columnas incoherentes) produce ERR-INTERNAL-UNEXPECTED, descarta la transacción y la siguiente funciona', async () => {
    const db = memoryDb();
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow);
    const read = (work: (r: RepositorySet) => Promise<unknown>) => rejectionOf(uow.runInTransaction(work)).then(domainFields);
    db.prepare('UPDATE pets SET data = ? WHERE id = ?').run('{"id": ', ARGOS.id);
    const brokenJson = await read((r) => r.pets.findById(ARGOS.id));
    db.prepare('UPDATE pets SET data = ? WHERE id = ?').run(JSON.stringify({ ...ARGOS, species: 'DRAGON' }), ARGOS.id);
    const brokenContract = await read((r) => r.pets.listByOwners([ARGOS.ownerUserId]));
    db.prepare('UPDATE pets SET data = ?, owner_user_id = ? WHERE id = ?').run(JSON.stringify(ARGOS), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99', ARGOS.id);
    const incoherent = await read((r) => r.pets.findById(ARGOS.id));
    db.prepare('UPDATE weights SET data = ? WHERE id = ?').run('[]', envelope.records.weights[0]!.id);
    const brokenRecord = await read((r) => r.records.listForPet(envelope.records.weights[0]!.petId));
    db.prepare('UPDATE household_members SET status = ? WHERE membership_id = ?').run('LEFT', MEMBERSHIPS[0]!.membershipId);
    const brokenMembership = await read((r) => r.households.listMemberships(HOUSEHOLD.id));
    db.prepare("INSERT INTO login_attempts (username, failures) VALUES ('roto', '{\"a\":1}')").run();
    const brokenFailures = await read((r) => r.loginAttempts.listFailures('roto'));
    const stillWorks = await uow.runInTransaction(async (r) => (await r.households.findById(HOUSEHOLD.id))!.name);
    const expected = { code: 'ERR-INTERNAL-UNEXPECTED', status: 500, finalState: null };
    expect([brokenJson, brokenContract, incoherent, brokenRecord, brokenMembership, brokenFailures, stillWorks]).toEqual([
      expected,
      expected,
      expected,
      expected,
      expected,
      expected,
      HOUSEHOLD.name,
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] un objeto que incumple el contrato no se escribe: ERR-INTERNAL-UNEXPECTED y nada cambia', async () => {
    const uow = new SqliteUnitOfWork(memoryDb());
    const error = await rejectionOf(uow.runInTransaction((r) => r.pets.save({ ...ARGOS, birthDate: '2026-02-30' })));
    expect([domainFields(error), await uow.runInTransaction((r) => r.pets.findById(ARGOS.id))]).toEqual([
      { code: 'ERR-INTERNAL-UNEXPECTED', status: 500, finalState: null },
      null,
    ]);
  });

  it('[INV-ARCH-005] si el COMMIT falla (clave foránea diferida), se hace ROLLBACK y se propaga el error original del almacenamiento', async () => {
    const db = memoryDb();
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow);
    const before = dumpSqlite(db);
    const error = await rejectionOf(
      uow.runInTransaction(async (r) => {
        db.pragma('defer_foreign_keys = ON');
        await r.pets.save({ ...ARGOS, name: 'No debe quedar' });
        await r.records.add('weights', { ...envelope.records.weights[0]!, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', petId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee99' });
      }),
    );
    expect([(error as { code?: string }).code, error instanceof DomainError, db.inTransaction, dumpSqlite(db)]).toEqual([
      'SQLITE_CONSTRAINT_FOREIGNKEY',
      false,
      false,
      before,
    ]);
  });

  it('[ERR-INTERNAL-UNEXPECTED] C-6: si el ROLLBACK falla, la transacción se rechaza con ERR-INTERNAL-UNEXPECTED y finalState UNKNOWN', async () => {
    const db = memoryDb();
    const uow = new SqliteUnitOfWork(db);
    const error = await rejectionOf(
      uow.runInTransaction(async (r) => {
        await r.pets.save(ARGOS);
        db.exec('COMMIT');
        throw new Error('fallo tras una confirmación ajena');
      }),
    );
    const next = await uow.runInTransaction((r) => r.pets.findById(ARGOS.id));
    expect([domainFields(error), next]).toEqual([{ code: 'ERR-INTERNAL-UNEXPECTED', status: 500, finalState: 'UNKNOWN' }, ARGOS]);
  });
});
