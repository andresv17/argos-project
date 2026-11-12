import { mkdirSync, mkdtempSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MIGRATIONS_DIR,
  openSqliteDatabase,
  runMigrations,
  type SqliteDatabase,
} from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * Migración de roles y asignaciones de la Feature 002 (REQ-MIG-001, SC-011, INV-HOUSE2-001; T241).
 * Base de partida con la forma de la 001: hogares con OWNER/MEMBER, mascotas de dos dueños, sesiones activas.
 * La migración de roles (0004) se aplica con runMigrations, como en el arranque. Aún no existe: la prueba falla por eso.
 * Supuestos de columnas (T243): household_members.role, pet_assignments(pet_id, household_id, assigned_by_user_id, assigned_at)
 * y la revocación de sesiones en el JSON de data (revokedAt).
 */
const MIGRATION_0004 = readdirSync(DEFAULT_MIGRATIONS_DIR).find((name) => /^0004_[a-z0-9_]+\.sql$/.test(name)) ?? '0004_pendiente.sql';

const ANA = 'a0000000-0000-4000-8000-000000000001';
const BRUNO = 'a0000000-0000-4000-8000-000000000002';
const CARLA = 'a0000000-0000-4000-8000-000000000003';
const ELENA = 'a0000000-0000-4000-8000-000000000005';
const HA = 'c0000000-0000-4000-8000-00000000000a';
const HB = 'c0000000-0000-4000-8000-00000000000b';
const HE = 'c0000000-0000-4000-8000-00000000000e';
const TOBY = 'b0000000-0000-4000-8000-000000000001';
const MISU = 'b0000000-0000-4000-8000-000000000002';
const PLUTO = 'b0000000-0000-4000-8000-000000000009';

const opened: SqliteDatabase[] = [];
const tempDirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Base con solo las migraciones 0001 y 0002: la forma de la 001 con datos de dos dueños. */
function legacyDatabase(): SqliteDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'argos-roles-'));
  tempDirs.push(dir);
  const migrations = join(dir, 'migraciones');
  mkdirSync(migrations);
  for (const name of ['0001_init.sql', '0002_account_identity.sql']) copyFileSync(join(DEFAULT_MIGRATIONS_DIR, name), join(migrations, name));
  const db = openSqliteDatabase(join(dir, 'base.sqlite'), { migrationsDir: migrations });
  opened.push(db);
  const member = (membershipId: string, householdId: string, userId: string, role: string, status: string) =>
    db
      .prepare('INSERT INTO household_members (membership_id, household_id, user_id, status, first_joined_at, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(membershipId, householdId, userId, status, status === 'ACTIVE' ? '2026-03-01T11:00:00.000Z' : null, JSON.stringify({ membershipId, householdId, userId, role, status, ...(status === 'INVITED' ? { invitedByUserId: ANA, invitedAt: '2026-03-02T09:00:00.000Z', updatedAt: '2026-03-02T09:00:00.000Z' } : {}) }));
  const house = (id: string, ownerUserId: string) => db.prepare('INSERT INTO households (id, owner_user_id, data) VALUES (?, ?, ?)').run(id, ownerUserId, JSON.stringify({ id, ownerUserId }));
  const user = db.prepare('INSERT INTO users (id, username, password_hash, data) VALUES (?, ?, ?, ?)');
  for (const [id, username] of [[ANA, 'ana'], [BRUNO, 'bruno'], [CARLA, 'carla'], [ELENA, 'elena']]) user.run(id, username, 'hash', JSON.stringify({ id, username }));
  house(HA, ANA);
  house(HB, ANA);
  house(HE, ELENA);
  member('d0000000-0000-4000-8000-0000000000a1', HA, ANA, 'OWNER', 'ACTIVE');
  member('d0000000-0000-4000-8000-0000000000a2', HA, BRUNO, 'MEMBER', 'ACTIVE');
  member('d0000000-0000-4000-8000-0000000000a3', HA, CARLA, 'MEMBER', 'INVITED');
  member('d0000000-0000-4000-8000-0000000000b1', HB, ANA, 'OWNER', 'ACTIVE');
  member('d0000000-0000-4000-8000-0000000000b2', HB, BRUNO, 'MEMBER', 'ACTIVE');
  member('d0000000-0000-4000-8000-0000000000e1', HE, ELENA, 'OWNER', 'ACTIVE');
  const pet = db.prepare('INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, ?)');
  pet.run(TOBY, ANA, JSON.stringify({ id: TOBY, ownerUserId: ANA, name: 'Toby', species: 'DOG' }));
  pet.run(MISU, ANA, JSON.stringify({ id: MISU, ownerUserId: ANA, name: 'Misu', species: 'CAT' }));
  pet.run(PLUTO, ELENA, JSON.stringify({ id: PLUTO, ownerUserId: ELENA, name: 'Pluto', species: 'DOG' }));
  const session = db.prepare('INSERT INTO sessions (token_hash, user_id, data) VALUES (?, ?, ?)');
  session.run('hash-ana', ANA, JSON.stringify({ userId: ANA, revokedAt: null }));
  session.run('hash-bruno', BRUNO, JSON.stringify({ userId: BRUNO, revokedAt: null }));
  return db;
}

/** Pares (miembro, mascota) visibles según la 001: miembro ACTIVE de un hogar donde el dueño ACTIVE tiene la mascota. */
const VISIBLE_IN_001 = `SELECT DISTINCT m.user_id, p.id AS pet_id FROM pets p
  JOIN household_members o ON o.user_id = p.owner_user_id AND o.status = 'ACTIVE'
  JOIN household_members m ON m.household_id = o.household_id AND m.status = 'ACTIVE' AND m.user_id <> p.owner_user_id
  ORDER BY 1, 2`;
const VISIBLE_IN_002 = `SELECT DISTINCT m.user_id, pa.pet_id FROM pet_assignments pa
  JOIN pets p ON p.id = pa.pet_id
  JOIN household_members m ON m.household_id = pa.household_id AND m.status = 'ACTIVE' AND m.user_id <> p.owner_user_id
  ORDER BY 1, 2`;

describe('migración de roles y asignaciones 0004 sobre una base de la 001 (REQ-MIG-001, SC-011, INV-HOUSE2-001) · T241', () => {
  it('[REQ-MIG-001] el propietario del hogar (OWNER) pasa a ADMIN y el miembro (MEMBER) a READER; la invitación pendiente de la 001 se convierte en household_invitations con rol READER', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const roles = db.prepare('SELECT membership_id, role FROM household_members ORDER BY membership_id').all();
    expect(roles).toEqual([
      { membership_id: 'd0000000-0000-4000-8000-0000000000a1', role: 'ADMIN' },
      { membership_id: 'd0000000-0000-4000-8000-0000000000a2', role: 'READER' },
      { membership_id: 'd0000000-0000-4000-8000-0000000000b1', role: 'ADMIN' },
      { membership_id: 'd0000000-0000-4000-8000-0000000000b2', role: 'READER' },
      { membership_id: 'd0000000-0000-4000-8000-0000000000e1', role: 'ADMIN' },
    ]);
    expect(db.prepare('SELECT * FROM household_invitations').all()).toEqual([
      {
        id: 'd0000000-0000-4000-8000-0000000000a3',
        household_id: HA,
        invitee_username: 'carla',
        invitee_user_id: CARLA,
        invited_by_user_id: ANA,
        role_on_join: 'READER',
        status: 'INVITED',
        created_at: '2026-03-02T09:00:00.000Z',
        responded_at: null,
      },
    ]);
  });

  it('[REQ-MIG-001][INV-HOUSE2-001] una invitación de la 001 sin invitedByUserId se convierte en household_invitations con invited_by_user_id NULO, sin abortar la migración (data-model §2.10)', () => {
    const db = legacyDatabase();
    // La invitación de Carla (INVITED) pierde el campo invitedByUserId del JSON de data, como una fila antigua sin ese dato.
    const update = db
      .prepare("UPDATE household_members SET data = json_remove(data, '$.invitedByUserId') WHERE membership_id = ?")
      .run('d0000000-0000-4000-8000-0000000000a3');
    expect(update.changes).toBe(1);
    expect(db.prepare("SELECT json_extract(data, '$.invitedByUserId') FROM household_members WHERE membership_id = ?").pluck().get('d0000000-0000-4000-8000-0000000000a3')).toBeNull();

    const applied = runMigrations(db);
    expect(applied).toContain(MIGRATION_0004);

    expect(db.prepare('SELECT * FROM household_invitations').all()).toEqual([
      {
        id: 'd0000000-0000-4000-8000-0000000000a3',
        household_id: HA,
        invitee_username: 'carla',
        invitee_user_id: CARLA,
        invited_by_user_id: null,
        role_on_join: 'READER',
        status: 'INVITED',
        created_at: '2026-03-02T09:00:00.000Z',
        responded_at: null,
      },
    ]);
    expect(db.prepare('SELECT COUNT(*) FROM household_invitations WHERE invited_by_user_id IS NULL').pluck().get()).toBe(1);
    expect(db.prepare("SELECT COUNT(*) FROM household_members WHERE status = 'INVITED'").pluck().get()).toBe(0);
  });

  it('[REQ-MIG-001][INV-HOUSE2-001] cada hogar conserva exactamente un propietario ADMIN, el que figura en households.owner_user_id', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const owners = db
      .prepare(
        "SELECT h.id, COUNT(*) FROM households h JOIN household_members m ON m.household_id = h.id AND m.user_id = h.owner_user_id AND m.role = 'ADMIN' AND m.status = 'ACTIVE' GROUP BY h.id ORDER BY h.id",
      )
      .all() as Array<Record<string, unknown>>;
    expect(owners.map((row) => Object.values(row))).toEqual([
      [HA, 1],
      [HB, 1],
      [HE, 1],
    ]);
  });

  it('[REQ-MIG-001] una asignación por cada hogar común de cada dueño: Toby y Misu quedan en HA y HB; Pluto, sin hogar común, no tiene asignaciones', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const rows = db.prepare('SELECT pet_id, household_id FROM pet_assignments ORDER BY pet_id, household_id').all();
    expect(rows).toEqual([
      { pet_id: TOBY, household_id: HA },
      { pet_id: TOBY, household_id: HB },
      { pet_id: MISU, household_id: HA },
      { pet_id: MISU, household_id: HB },
    ]);
  });

  it('[SC-011][REQ-MIG-001] cada miembro ve exactamente las mismas mascotas que veía con la 001 (visibilidad idéntica antes y después)', () => {
    const db = legacyDatabase();
    const before = db.prepare(VISIBLE_IN_001).all();
    runMigrations(db);
    const after = db.prepare(VISIBLE_IN_002).all();
    expect(after).toEqual(before);
    expect(after).toEqual([
      { user_id: BRUNO, pet_id: TOBY },
      { user_id: BRUNO, pet_id: MISU },
    ]);
  });

  it('[REQ-MIG-001] todas las sesiones existentes quedan revocadas tras la migración: ninguna sesión sigue sin revokedAt', () => {
    const db = legacyDatabase();
    expect(db.prepare("SELECT COUNT(*) FROM sessions WHERE json_extract(data, '$.revokedAt') IS NULL").pluck().get()).toBe(2);
    runMigrations(db);
    expect(db.prepare("SELECT COUNT(*) FROM sessions WHERE json_extract(data, '$.revokedAt') IS NULL").pluck().get()).toBe(0);
  });

  it('[REQ-MIG-001] la migración es repetible sin duplicar: una segunda ejecución no añade asignaciones ni cambia los roles', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const snapshot = [db.prepare('SELECT COUNT(*) FROM pet_assignments').pluck().get(), db.prepare('SELECT role FROM household_members ORDER BY membership_id').all()];
    expect(runMigrations(db)).toEqual([]);
    expect([db.prepare('SELECT COUNT(*) FROM pet_assignments').pluck().get(), db.prepare('SELECT role FROM household_members ORDER BY membership_id').all()]).toEqual(snapshot);
  });

  it(`[REQ-MIG-001] la migración de roles está en ${MIGRATION_0004} (0004_*.sql) y se aplica en el arranque`, () => {
    const db = legacyDatabase();
    expect(runMigrations(db)).toContain(MIGRATION_0004);
  });
});

/**
 * T257 (fase ROJA): migración completa de la Feature 002 (REQ-MIG-001, REQ-AUD-001, SC-011).
 * Causa roja esperada: la tabla audit_log aún no existe y ninguna migración inserta la fila MIGRATION ("no such table: audit_log").
 * Contrato (data-model §2.12): 1 fila MIGRATION por ejecución de la migración, entity_type SYSTEM, executor_user_id SYSTEM,
 * entity_id MIG-<versión> (patrón MIG-[A-Za-z0-9._-]{1,64}) y hashes nulos; sin filas por entidad convertida.
 */
const migrationRows = (db: SqliteDatabase) => db.prepare("SELECT * FROM audit_log WHERE mutation_type = 'MIGRATION'").all() as Array<Record<string, unknown>>;

describe('migración completa: fila de auditoría MIGRATION y repetibilidad (REQ-MIG-001, REQ-AUD-001, SC-011) · T257', () => {
  it('[REQ-MIG-001][REQ-AUD-001] migrar una base de la 001 deja exactamente 1 fila MIGRATION con executor SYSTEM, entidad SYSTEM, entityId MIG-<versión> y hashes nulos', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const rows = migrationRows(db);
    expect(rows).toHaveLength(1);
    expect({ ...rows[0]!, id: 'ID', timestamp: 'TS', entity_id: String(rows[0]!['entity_id']).replace(/^MIG-[A-Za-z0-9._-]{1,64}$/, 'MIG-OK') }).toEqual({
      id: 'ID',
      timestamp: 'TS',
      executor_user_id: 'SYSTEM',
      mutation_type: 'MIGRATION',
      entity_type: 'SYSTEM',
      entity_id: 'MIG-OK',
      previous_state_hash: null,
      new_state_hash: null,
    });
    expect(String(rows[0]!['timestamp'])).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
  });

  it('[REQ-MIG-001][REQ-AUD-001] es repetible sin duplicar: una segunda y una tercera ejecución no aplican nada y siguen siendo exactamente 1 fila MIGRATION', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const first = migrationRows(db);
    expect([runMigrations(db), runMigrations(db)]).toEqual([[], []]);
    expect(migrationRows(db)).toEqual(first);
    expect(db.prepare('SELECT COUNT(*) FROM audit_log').pluck().get()).toBe(1);
  });

  it('[REQ-AUD-001][REQ-MIG-001] la conversión de roles, invitaciones y asignaciones no genera filas por entidad: audit_log contiene solo la fila MIGRATION', () => {
    const db = legacyDatabase();
    runMigrations(db);
    expect(db.prepare('SELECT mutation_type, entity_type FROM audit_log').all()).toEqual([{ mutation_type: 'MIGRATION', entity_type: 'SYSTEM' }]);
    expect(db.prepare('SELECT COUNT(*) FROM pet_assignments').pluck().get()).toBe(4);
  });

  it('[REQ-MIG-001][INV-AUD-001] la fila MIGRATION no contiene identificadores de usuario ni de mascota de la base migrada', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const text = JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
    expect([ANA, BRUNO, CARLA, ELENA, TOBY, MISU, PLUTO, 'hash-ana'].map((v) => text.includes(v))).toEqual([false, false, false, false, false, false, false, false]);
  });

  it('[REQ-AUD-001] audit_log nace sin claves foráneas, con las 8 columnas del data-model y restricciones CHECK de mutation_type y entity_type', () => {
    const db = legacyDatabase();
    runMigrations(db);
    const columns = (db.prepare('PRAGMA table_info(audit_log)').all() as Array<{ name: string }>).map((c) => c.name);
    expect([columns, db.prepare('PRAGMA foreign_key_list(audit_log)').all()]).toEqual([
      ['id', 'timestamp', 'executor_user_id', 'mutation_type', 'entity_type', 'entity_id', 'previous_state_hash', 'new_state_hash'],
      [],
    ]);
    const insert = (mutation: string, entity: string) =>
      db.prepare("INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id) VALUES ('x-' || ?, '2026-11-11T12:00:00.000Z', 'SYSTEM', ?, ?, 'MIG-x')").run(mutation + entity, mutation, entity);
    expect(() => insert('RENAME', 'SYSTEM')).toThrow(/CHECK/);
    expect(() => insert('UPDATE', 'GALAXY')).toThrow(/CHECK/);
  });
});
