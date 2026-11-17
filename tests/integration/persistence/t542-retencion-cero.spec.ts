/**
 * T542 [US2] retención cero (SC-CAT-015; REQ-BOR-004, D-11 A): ninguna tabla de SQLite ni de Postgres tiene `deleted_at` ni `deleted_by_user_id`
 * (ni los SQL fuente de las migraciones), la configuración no define `ARGOS_SOFT_DELETE_RETENTION_DAYS`, el mantenimiento no purga registros
 * clínicos aunque pase mucho tiempo, y la cascada de mascota y de cuenta elimina todas las filas de los 6 módulos.
 * Fuera de alcance de esta rebanada (no existen aún las tablas de medios, rebanada C): el encolado de medios en la cascada.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DeleteAccountUseCase } from '../../../src/application/use-cases/account-use-cases.ts';
import { DeletePetUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { runMaintenance } from '../../../src/application/use-cases/maintenance-use-cases.ts';
import { CONFIRMATION_PHRASE } from '../../../src/domain/account/account-deletion-guards.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { DEFAULT_MIGRATIONS_DIR, IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, createDeps, envelope } from '../../fixtures/application-harness.ts';
import { ELENA, ELENA_PET, IDENTITY_PASSWORDS, REFERENCE_NOW, REFERENCE_TODAY, identityState } from '../../fixtures/identity-fixtures.ts';
import { createEngines, type Engine } from '../../fixtures/record-engines.ts';
import { dumpSqlite, seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const TABLES = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'] as const;
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const open: Array<Engine | SqliteDatabase> = [];
afterEach(() => open.splice(0).forEach((e) => ('close' in e ? e.close() : undefined)));
const rowsOf = (db: SqliteDatabase, petId: string) => TABLES.map((t) => db.prepare(`SELECT COUNT(*) FROM ${t} WHERE pet_id = ?`).pluck().get(petId) as number);

describe('T542 retención cero (SC-CAT-015, REQ-BOR-004)', () => {
  it('[REQ-BOR-004] ninguna tabla de SQLite tiene columnas ni índices con «deleted» y ningún SQL de migración (SQLite o Postgres) los crea', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    open.push(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
    const columns = tables.flatMap((t) => (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => `${t}.${c.name}`));
    expect(columns.filter((c) => /deleted/i.test(c))).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND (name LIKE '%deleted%' OR sql LIKE '%deleted%')").all()).toEqual([]);
    const sources = [
      ...readdirSync(DEFAULT_MIGRATIONS_DIR).map((n) => withoutComments(readFileSync(join(DEFAULT_MIGRATIONS_DIR, n), 'utf8'))),
      ...readdirSync(PG_DIR).map((n) => withoutComments(readFileSync(new URL(n, PG_DIR), 'utf8'))),
    ];
    expect(sources.filter((sql) => /deleted_at|deleted_by_user_id|soft_delete/i.test(sql))).toEqual([]);
  });

  it('[REQ-BOR-004] la configuración de la aplicación no define ARGOS_SOFT_DELETE_RETENTION_DAYS (ni el código ni los scripts lo leen)', () => {
    const configDir = join(process.cwd(), 'src', 'infrastructure', 'config');
    const text = readdirSync(configDir).map((n) => readFileSync(join(configDir, n), 'utf8')).join('\n');
    expect(text).not.toMatch(/ARGOS_SOFT_DELETE_RETENTION_DAYS|SOFT_DELETE/);
    expect(readFileSync(join(process.cwd(), 'src', 'infrastructure', 'http', 'server.ts'), 'utf8')).not.toMatch(/SOFT_DELETE/);
  });

  it('[REQ-BOR-004] el mantenimiento diez años después no purga ni un solo registro clínico: las 6 tablas quedan idénticas', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    open.push(db);
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow);
    const clinical = () => JSON.stringify(TABLES.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()));
    const before = clinical();
    expect(before).not.toBe(JSON.stringify(TABLES.map(() => [])));
    const counts = await runMaintenance({ uow, clock: new FixedClockAdapter('2036-11-05', '2036-11-05T12:00:00.000Z') });
    expect(Object.keys(counts).sort()).toEqual(['auditRowsPurged', 'confirmationTokensPurged', 'invitationsPurged', 'membershipsPurged', 'sessionsPurged']);
    expect(clinical()).toBe(before);
    expect(dumpSqlite(db)).toContain(ARGOS.id);
  });

  describe.each(['memoria', 'SQLite'] as const)('cascadas (%s)', (name) => {
    it('[SC-CAT-015] eliminar la mascota deja 0 filas en los 6 módulos para ella y no toca las de otra mascota', async () => {
      const engines = await createEngines();
      open.push(...engines);
      const engine = engines.find((e) => e.name === name)!;
      const all = Object.values(envelope.records).flat() as Array<{ id: string; petId: string }>;
      const mine = all.filter((r) => r.petId === ARGOS.id).map((r) => r.id);
      const others = all.filter((r) => r.petId !== ARGOS.id).map((r) => r.id);
      const present = () => new Set(TABLES.flatMap((t) => engine.recordIds(t)));
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((id) => present().has(id))).toBe(true);
      await new DeletePetUseCase(engine.deps).execute(ANDRES, ARGOS.id);
      expect(mine.filter((id) => present().has(id))).toEqual([]);
      expect(others.every((id) => present().has(id))).toBe(true);
    });
  });

  it('[SC-CAT-015][REQ-BOR-004] eliminar la cuenta (SQLite) deja 0 filas de la mascota en los 6 módulos y sigue habiendo filas de otras mascotas', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    open.push(db);
    const uow = new SqliteUnitOfWork(db);
    await seedSqlite(uow, identityState());
    const clock = new FixedClockAdapter(REFERENCE_TODAY, REFERENCE_NOW);
    const deps = createDeps(uow, clock, new SpyPasswordHasher());
    await uow.runInTransaction((r) => r.sessions.save('ses-elena', { userId: ELENA, createdAt: REFERENCE_NOW, lastActivityAt: REFERENCE_NOW, revokedAt: null }));
    const token = (await uow.runInTransaction((r) => deps.backupTokens.issue(r, ELENA, REFERENCE_NOW))).token;
    const before = rowsOf(db, ELENA_PET.id);
    const totalBefore = TABLES.map((t) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get() as number);
    expect(before.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    await new DeleteAccountUseCase(deps).execute(ELENA, 'ses-elena', { confirmationPhrase: CONFIRMATION_PHRASE, password: IDENTITY_PASSWORDS['elena.solo']!, backupConfirmationToken: token });
    expect(rowsOf(db, ELENA_PET.id)).toEqual([0, 0, 0, 0, 0, 0]);
    const totalAfter = TABLES.map((t) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get() as number);
    expect(totalAfter.reduce((a, b) => a + b, 0)).toBe(totalBefore.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0));
  });
});
