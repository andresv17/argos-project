import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DomainError, validatePetProfile, validateWeightRecord } from '../../../src/generated/index.ts';
import {
  DEFAULT_MIGRATIONS_DIR,
  IN_MEMORY_DATABASE,
  openSqliteDatabase,
  runMigrations,
  type SqliteDatabase,
} from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { fixtures } from '../../fixtures/application-harness.ts';

/**
 * Migración de especies y peso de la Feature 002 (REQ-MIG-001, parte de especies; T230) sobre una base real de la 001.
 * La base de partida se construye con las migraciones 0001 y 0002 y filas con la forma de la 001 (DOG, CAT, sin campos
 * nuevos); la migración 0003 se aplica después, como lo haría el arranque.
 */
const RECORD_TABLES = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'] as const;
const RECORD_KEYS = ['weights', 'bodyMeasurements', 'vaccinations', 'dewormings', 'medicalVisits', 'customParameters'] as const;
const LEGACY_SPECIES: Record<string, string> = { DOG: 'CANINE', CAT: 'FELINE' };
const MIGRATION_0004 = readdirSync(DEFAULT_MIGRATIONS_DIR).find((name) => /^0004_[a-z0-9_]+\.sql$/.test(name)) ?? '0004_pendiente.sql';
const MIGRATION_0003 = readdirSync(DEFAULT_MIGRATIONS_DIR).find((name) => /^0003_[a-z0-9_]+\.sql$/.test(name)) ?? '0003_pendiente.sql';

const legacyPets = [...fixtures.validBackupEnvelopeV2.pets, ...fixtures.otherUserPets] as Array<{ id: string; ownerUserId: string; species: string }>;
const legacyRecords = fixtures.validBackupEnvelopeV2.records as Record<(typeof RECORD_KEYS)[number], Array<{ id: string; petId: string }>>;

const opened: SqliteDatabase[] = [];
const tempDirs: string[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.open) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'argos-species-'));
  tempDirs.push(dir);
  return dir;
};

/** Carpeta con solo las migraciones 001 + 0002 (o más, si se indican). */
function migrationsDirWith(files: Record<string, string>): string {
  const dir = join(tempDir(), 'migraciones');
  mkdirSync(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}
const sql = (name: string) => readFileSync(join(DEFAULT_MIGRATIONS_DIR, name), 'utf8');
const BEFORE_0003 = () => migrationsDirWith({ '0001_init.sql': sql('0001_init.sql'), '0002_account_identity.sql': sql('0002_account_identity.sql') });

/** Base con la forma de la 001: las filas de mascotas y registros tal como las dejó la 001. */
function legacyDatabase(path: string, withData = true): SqliteDatabase {
  const db = openSqliteDatabase(path, { migrationsDir: BEFORE_0003() });
  opened.push(db);
  if (withData) {
    const pet = db.prepare('INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, ?)');
    for (const p of legacyPets) pet.run(p.id, p.ownerUserId, JSON.stringify(p));
    for (const [i, table] of RECORD_TABLES.entries()) {
      const insert = db.prepare(`INSERT INTO ${table} (id, pet_id, data) VALUES (?, ?, ?)`);
      for (const r of legacyRecords[RECORD_KEYS[i]!]) insert.run(r.id, r.petId, JSON.stringify(r));
    }
  }
  return db;
}
const count = (db: SqliteDatabase, table: string) => db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number;
const snapshotCounts = (db: SqliteDatabase) => Object.fromEntries(['pets', ...RECORD_TABLES].map((t) => [t, count(db, t)]));
const dataOf = (db: SqliteDatabase, table: string) => db.prepare(`SELECT id, data FROM ${table} ORDER BY id`).all();
const columnsOf = (db: SqliteDatabase, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);

describe('migración de especies y peso 0003 sobre una base de la 001 (REQ-MIG-001, SC-011)', () => {
  it('[REQ-MIG-001][SC-011] la 001 tiene mascotas DOG y CAT y registros en las 6 colecciones (la prueba parte de datos reales)', () => {
    const db = legacyDatabase(join(tempDir(), 'a.sqlite'));
    const species = new Set(legacyPets.map((p) => p.species));
    expect([...species].sort()).toEqual(['CAT', 'DOG']);
    expect(Object.values(snapshotCounts(db)).every((n) => n > 0)).toBe(true);
    expect(columnsOf(db, 'pets')).not.toContain('species');
    expect(MIGRATION_0003).toMatch(/^0003_/);
  });

  it('[REQ-MIG-001][SC-011] conteos antes y después iguales, 0 filas DOG o CAT y cada especie mapeada (DOG a CANINE, CAT a FELINE)', () => {
    const db = legacyDatabase(join(tempDir(), 'b.sqlite'));
    const before = snapshotCounts(db);
    expect(runMigrations(db)).toEqual([MIGRATION_0003, MIGRATION_0004]);
    expect(snapshotCounts(db)).toEqual(before);
    const remaining = db.prepare("SELECT COUNT(*) FROM pets WHERE species IN ('DOG', 'CAT') OR json_extract(data, '$.species') IN ('DOG', 'CAT')").pluck().get();
    expect(remaining).toBe(0);
    const rows = db.prepare('SELECT id, owner_user_id, species, species_other, neutered, microchip_id, birth_date_is_estimate, data FROM pets ORDER BY id').all() as Array<
      Record<string, unknown> & { id: string; data: string }
    >;
    expect(rows.map((r) => [r['id'], r['species']])).toEqual(
      [...legacyPets].sort((a, b) => a.id.localeCompare(b.id)).map((p) => [p.id, LEGACY_SPECIES[p.species]]),
    );
    for (const row of rows) {
      expect([row['species_other'], row['neutered'], row['microchip_id'], row['birth_date_is_estimate']]).toEqual([null, null, null, 0]);
      const data = JSON.parse(row.data);
      expect(validatePetProfile(data)).toBe(true);
      expect([data.species, data.speciesOther, data.neutered, data.microchipId, data.birthDateIsEstimate]).toEqual([row['species'], null, null, null, false]);
    }
  });

  it('[REQ-MIG-001][SC-011] los datos de las mascotas no cambian salvo los campos nuevos y la especie; los 5 módulos sin cambio quedan byte a byte', () => {
    const db = legacyDatabase(join(tempDir(), 'c.sqlite'));
    const pets = dataOf(db, 'pets');
    const untouched = ['body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters', 'weights'].map((t) => [t, dataOf(db, t)]);
    runMigrations(db);
    for (const row of dataOf(db, 'pets') as Array<{ id: string; data: string }>) {
      const old = JSON.parse((pets as Array<{ id: string; data: string }>).find((p) => p.id === row.id)!.data);
      const now = JSON.parse(row.data);
      expect(now).toEqual({
        ...old,
        species: LEGACY_SPECIES[old.species],
        speciesOther: null,
        birthDateIsEstimate: false,
        neutered: null,
        microchipId: null,
      });
    }
    expect(['body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters', 'weights'].map((t) => [t, dataOf(db, t)])).toEqual(untouched);
  });

  it('[REQ-MIG-001][INV-REC2-002] cada peso conserva su valor y gana weight_grams entero igual a kg por 1000, dentro de la envolvente 1 a 150000', () => {
    const db = legacyDatabase(join(tempDir(), 'd.sqlite'));
    runMigrations(db);
    const rows = db.prepare('SELECT id, pet_id, weight_grams, data FROM weights').all() as Array<{ id: string; pet_id: string; weight_grams: number; data: string }>;
    expect(rows).toHaveLength(legacyRecords.weights.length);
    expect(columnsOf(db, 'weights')).toEqual(['id', 'pet_id', 'data', 'weight_grams']);
    for (const row of rows) {
      const record = JSON.parse(row.data);
      expect(validateWeightRecord(record)).toBe(true);
      expect(Number.isInteger(row.weight_grams)).toBe(true);
      expect(row.weight_grams).toBe(Math.round(record.weightKg * 1000));
      expect(row.weight_grams / 1000).toBe(record.weightKg);
    }
    expect(db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'weights_pet_id'").pluck().get()).toBe(1);
  });

  it('[REQ-MIG-001][SC-011] es repetible sin duplicar: una segunda apertura no aplica nada, no cambia los conteos ni los datos', () => {
    const path = join(tempDir(), 'e.sqlite');
    const first = legacyDatabase(path);
    runMigrations(first);
    const counts = snapshotCounts(first);
    const pets = dataOf(first, 'pets');
    const weights = dataOf(first, 'weights');
    first.close();
    const second = openSqliteDatabase(path);
    opened.push(second);
    expect(runMigrations(second)).toEqual([]);
    expect([snapshotCounts(second), dataOf(second, 'pets'), dataOf(second, 'weights')]).toEqual([counts, pets, weights]);
    expect(second.prepare('SELECT version FROM schema_migrations WHERE version = ?').pluck().all(MIGRATION_0003)).toEqual([MIGRATION_0003]);
    expect(second.prepare("SELECT COUNT(*) FROM pets WHERE species IN ('DOG', 'CAT')").pluck().get()).toBe(0);
  });

  it('[REQ-MIG-001][SC-011] una base de la 001 sin mascotas ni registros migra sin error y queda con las columnas nuevas', () => {
    const db = legacyDatabase(join(tempDir(), 'f.sqlite'), false);
    expect(runMigrations(db)).toEqual([MIGRATION_0003, MIGRATION_0004]);
    expect(columnsOf(db, 'pets')).toEqual(
      expect.arrayContaining(['species', 'species_other', 'neutered', 'microchip_id', 'birth_date_is_estimate']),
    );
    expect(snapshotCounts(db)).toEqual({ pets: 0, weights: 0, body_measurements: 0, vaccinations: 0, dewormings: 0, medical_visits: 0, custom_parameters: 0 });
  });

  it('[REQ-MIG-001][INV-ARCH-005][ERR-INTERNAL-UNEXPECTED] si la migración falla a mitad, todo se revierte: especies, columnas y registro de versiones siguen como en la 001', () => {
    const broken = migrationsDirWith({
      '0001_init.sql': sql('0001_init.sql'),
      '0002_account_identity.sql': sql('0002_account_identity.sql'),
      [MIGRATION_0003]: `${sql(MIGRATION_0003)}\nINSERT INTO tabla_inexistente VALUES (1);`,
    });
    const db = legacyDatabase(join(tempDir(), 'g.sqlite'));
    const before = [snapshotCounts(db), dataOf(db, 'pets'), dataOf(db, 'weights'), columnsOf(db, 'pets'), columnsOf(db, 'weights')];
    expect(() => runMigrations(db, broken)).toThrow(/tabla_inexistente/);
    expect([snapshotCounts(db), dataOf(db, 'pets'), dataOf(db, 'weights'), columnsOf(db, 'pets'), columnsOf(db, 'weights')]).toEqual(before);
    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all()).toEqual(['0001_init.sql', '0002_account_identity.sql']);
    expect(db.prepare("SELECT COUNT(*) FROM pets WHERE json_extract(data, '$.species') IN ('DOG', 'CAT')").pluck().get()).toBe(legacyPets.length);
  });

  it('[REQ-MIG-001][ERR-INTERNAL-UNEXPECTED] una especie desconocida en la base de la 001 hace fallar la migración en voz alta y no deja nada a medias', () => {
    const db = legacyDatabase(join(tempDir(), 'h.sqlite'), false);
    db.prepare('INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, ?)').run('p-raro', 'u1', JSON.stringify({ id: 'p-raro', species: 'DRAGON' }));
    expect(() => runMigrations(db)).toThrow(/CHECK constraint failed/);
    expect(columnsOf(db, 'pets')).not.toContain('species');
    expect(db.prepare('SELECT version FROM schema_migrations').pluck().all()).toEqual(['0001_init.sql', '0002_account_identity.sql']);
  });

  it('[REQ-MIG-001][ERR-INTERNAL-UNEXPECTED] abrir una base de la 001 con openSqliteDatabase aplica la 0003 y una apertura corrupta se rechaza con el error del catálogo', () => {
    const path = join(tempDir(), 'i.sqlite');
    legacyDatabase(path).close();
    const db = openSqliteDatabase(path);
    opened.push(db);
    expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all()).toContain(MIGRATION_0003);
    const bad = join(tempDir(), 'j.sqlite');
    const legacy = legacyDatabase(bad, false);
    legacy.prepare('INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, ?)').run('p-raro', 'u1', JSON.stringify({ id: 'p-raro', species: 'DRAGON' }));
    legacy.close();
    let error: unknown = null;
    try {
      openSqliteDatabase(bad);
    } catch (e) {
      error = e;
    }
    expect(error instanceof DomainError && error.code).toBe('ERR-INTERNAL-UNEXPECTED');
  });
});

describe('restricciones de la base migrada (INV-PET2-001, INV-PET-005, INV-REC2-002)', () => {
  const db = () => {
    const d = openSqliteDatabase(IN_MEMORY_DATABASE);
    opened.push(d);
    return d;
  };
  const insertPet = (d: SqliteDatabase, id: string, owner: string, extra: Record<string, unknown> = {}) => {
    const row = { species: 'CANINE', species_other: null, neutered: null, microchip_id: null, birth_date_is_estimate: 0, ...extra };
    d.prepare(
      'INSERT INTO pets (id, owner_user_id, data, species, species_other, neutered, microchip_id, birth_date_is_estimate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, owner, '{}', row.species, row.species_other, row.neutered, row.microchip_id, row.birth_date_is_estimate);
  };

  it('[INV-PET2-001] species solo admite las 8 especies y species_other es no nulo exactamente cuando species es OTHER', () => {
    const d = db();
    for (const species of ['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL']) insertPet(d, `p-${species}`, 'u1', { species });
    insertPet(d, 'p-other', 'u1', { species: 'OTHER', species_other: 'Erizo' });
    for (const species of ['DOG', 'CAT', 'dog', '']) expect(() => insertPet(d, 'x', 'u1', { species })).toThrow(/CHECK constraint failed/);
    expect(() => insertPet(d, 'x', 'u1', { species: 'OTHER', species_other: null })).toThrow(/CHECK constraint failed/);
    expect(() => insertPet(d, 'x', 'u1', { species: 'BIRD', species_other: 'Loro' })).toThrow(/CHECK constraint failed/);
    expect(count(d, 'pets')).toBe(8);
  });

  it('[REQ-PET2-001][INV-PET2-001] el microchip de 15 dígitos es único por propietario, no entre cuentas, y varios nulos conviven', () => {
    const d = db();
    insertPet(d, 'p1', 'u1', { microchip_id: '981020000000001' });
    insertPet(d, 'p2', 'u2', { microchip_id: '981020000000001' });
    insertPet(d, 'p3', 'u1', { microchip_id: null });
    insertPet(d, 'p4', 'u1', { microchip_id: null });
    insertPet(d, 'p5', 'u1', { microchip_id: '981020000000002' });
    expect(() => insertPet(d, 'p6', 'u1', { microchip_id: '981020000000001' })).toThrow(/UNIQUE constraint failed/);
    expect(() => d.prepare("UPDATE pets SET microchip_id = '981020000000001' WHERE id = 'p5'").run()).toThrow(/UNIQUE constraint failed/);
    for (const bad of ['98102000000000', '9810200000000011', '98102000000000a', '']) {
      expect(() => insertPet(d, 'x', 'u9', { microchip_id: bad })).toThrow(/CHECK constraint failed/);
    }
    expect(count(d, 'pets')).toBe(5);
  });

  it('[INV-REC2-002][ADR-002-09] weight_grams es entero obligatorio entre 1 y 150000', () => {
    const d = db();
    insertPet(d, 'p1', 'u1');
    const add = (id: string, grams: unknown) => d.prepare('INSERT INTO weights (id, pet_id, data, weight_grams) VALUES (?, ?, ?, ?)').run(id, 'p1', '{}', grams);
    add('w1', 1);
    add('w2', 150000);
    for (const bad of [0, 150001, -5, null, 12.5]) expect(() => add('x', bad)).toThrow(/CHECK constraint failed|NOT NULL constraint failed|cannot store REAL value/);
    expect(count(d, 'weights')).toBe(2);
  });

  it('[INV-PET-005] borrar la mascota sigue borrando en cascada sus pesos tras la reconstrucción de la tabla weights', () => {
    const d = db();
    insertPet(d, 'p1', 'u1');
    d.prepare('INSERT INTO weights (id, pet_id, data, weight_grams) VALUES (?, ?, ?, ?)').run('w1', 'p1', '{}', 5000);
    expect(() => d.prepare('INSERT INTO weights (id, pet_id, data, weight_grams) VALUES (?, ?, ?, ?)').run('w2', 'no-existe', '{}', 5000)).toThrow(/FOREIGN KEY/);
    d.prepare("DELETE FROM pets WHERE id = 'p1'").run();
    expect(count(d, 'weights')).toBe(0);
  });
});
