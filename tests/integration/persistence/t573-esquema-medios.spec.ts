/**
 * T573 [US4] esquema de medios (REQ-GCS-005, REQ-GCS-004, REQ-AVA-001, SC-ALM-023):
 *  - `pet_media` solo con metadatos (sin `sha256`, `object_key`, autoría ni binarios) y `ON DELETE CASCADE` desde `pets`;
 *  - `media_deletion_queue` con `reason` (INTENT | DELETE), `attempts >= 0` sin tope y SIN clave foránea (sobrevive a la mascota);
 *  - `pets.avatar_version INTEGER NOT NULL DEFAULT 0` y `pets.avatar_object_id TEXT` nulo, sin tocar las mascotas ya existentes;
 *  - mismas columnas, nulabilidad, valores por defecto e índice en SQLite (0009) y Postgres (0005).
 * Las pruebas de Postgres se OMITEN sin TEST_DATABASE_URL y usan un esquema desechable.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const USER = 'f0000000-0000-4000-8000-0000000000b1';
const PET = 'f0000000-0000-4000-8000-0000000000b2';
const MEDIA = (n: number) => `f0000000-0000-4000-8000-00000000030${n}`;
const KEY = (n: number) => `pets/${PET}/files/${MEDIA(n)}`;

const MEDIA_COLUMNS = ['created_at', 'id', 'kind', 'mime', 'original_name', 'pet_id', 'size_bytes'];
const QUEUE_COLUMNS = ['attempts', 'enqueued_at', 'object_key', 'reason'];
const FORBIDDEN = /sha256|object_key|uploaded_by|author|owner|user_id|bytes$|blob|data|content/i;

interface SqliteColumn { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }

describe('T573 esquema de medios en SQLite (migración 0009)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  const insertPet = (db: ReturnType<typeof openSqliteDatabase>) => {
    db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'duenio', 'h', '{}')").run(USER);
    db.prepare("INSERT INTO pets (id, owner_user_id, data, species, neutered, birth_date_is_estimate) VALUES (?, ?, '{}', 'CANINE', 0, 0)").run(PET, USER);
  };
  const insertMedia = (db: ReturnType<typeof openSqliteDatabase>, n: number, kind = 'FILE') =>
    db.prepare("INSERT INTO pet_media (id, pet_id, kind, mime, size_bytes, original_name, created_at) VALUES (?, ?, ?, 'application/pdf', 10, 'a.pdf', '2026-11-17T10:00:00.000Z')").run(MEDIA(n), PET, kind);

  it('[REQ-GCS-005][SC-ALM-023] pet_media solo tiene metadatos: sin sha256, object_key, autoría ni columnas binarias', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const columns = db.prepare('PRAGMA table_info(pet_media)').all() as SqliteColumn[];
    expect(columns.map((c) => c.name).sort()).toEqual(MEDIA_COLUMNS);
    expect(columns.filter((c) => FORBIDDEN.test(c.name) && c.name !== 'pet_id' && c.name !== 'size_bytes')).toEqual([]);
    expect(columns.every((c) => c.notnull === 1 || c.pk === 1)).toBe(true);
    expect(columns.map((c) => c.type)).not.toContain('BLOB');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pet_media' AND name NOT LIKE 'sqlite_%'").pluck().all()).toEqual(['pet_media_pet_created']);
    db.close();
  });

  it('[REQ-GCS-004] media_deletion_queue guarda solo la clave, la razón, el instante y los intentos', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const columns = db.prepare('PRAGMA table_info(media_deletion_queue)').all() as SqliteColumn[];
    expect(columns.map((c) => c.name).sort()).toEqual(QUEUE_COLUMNS);
    expect(columns.find((c) => c.name === 'object_key')).toMatchObject({ pk: 1 });
    expect(columns.find((c) => c.name === 'attempts')).toMatchObject({ notnull: 1, dflt_value: '0' });
    expect(db.prepare('PRAGMA foreign_key_list(media_deletion_queue)').all()).toEqual([]);
    const insert = db.prepare("INSERT INTO media_deletion_queue (object_key, reason, enqueued_at) VALUES (?, ?, '2026-11-17T10:00:00.000Z')");
    insert.run(KEY(1), 'INTENT');
    insert.run(KEY(2), 'DELETE');
    expect(() => insert.run(KEY(3), 'OTRA')).toThrow(/CHECK constraint failed/);
    expect(() => insert.run(KEY(1), 'DELETE')).toThrow(/UNIQUE constraint failed/);
    expect(() => db.prepare('UPDATE media_deletion_queue SET attempts = -1').run()).toThrow(/CHECK constraint failed/);
    db.prepare('UPDATE media_deletion_queue SET attempts = 100000').run();
    expect(db.prepare('SELECT attempts FROM media_deletion_queue WHERE object_key = ?').pluck().get(KEY(1))).toBe(100000);
    db.close();
  });

  it('[REQ-GCS-005] kind solo admite FILE o PHOTO, borrar la mascota borra en cascada sus medios y la cola sobrevive', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    insertPet(db);
    insertMedia(db, 1);
    insertMedia(db, 2, 'PHOTO');
    expect(() => insertMedia(db, 3, 'AUDIO')).toThrow(/CHECK constraint failed/);
    expect(() => db.prepare("INSERT INTO pet_media (id, pet_id, kind, mime, size_bytes, original_name, created_at) VALUES (?, ?, 'FILE', 'application/pdf', 1, 'a', 'x')").run(MEDIA(4), 'f0000000-0000-4000-8000-0000000000ff')).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare("INSERT INTO media_deletion_queue (object_key, reason, enqueued_at) VALUES (?, 'DELETE', '2026-11-17T10:00:00.000Z')").run(KEY(1));
    db.prepare('DELETE FROM pets WHERE id = ?').run(PET);
    expect(db.prepare('SELECT count(*) FROM pet_media').pluck().get()).toBe(0);
    expect(db.prepare('SELECT count(*) FROM media_deletion_queue').pluck().get()).toBe(1);
    db.close();
  });

  it('[REQ-AVA-001] pets.avatar_version es INTEGER NOT NULL DEFAULT 0 y avatar_object_id es TEXT nulo', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const columns = db.prepare('PRAGMA table_info(pets)').all() as SqliteColumn[];
    expect(columns.find((c) => c.name === 'avatar_version')).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '0' });
    expect(columns.find((c) => c.name === 'avatar_object_id')).toMatchObject({ type: 'TEXT', notnull: 0, dflt_value: null });
    insertPet(db);
    expect(db.prepare('SELECT avatar_version, avatar_object_id FROM pets WHERE id = ?').get(PET)).toEqual({ avatar_version: 0, avatar_object_id: null });
    db.close();
  });

  it('[REQ-AVA-001] migrar una base con mascotas las deja con avatar_version = 0 y sin avatar, sin tocar el resto', () => {
    const cache = join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, 'argos-t573-'));
    dirs.push(dir);
    const previous = join(dir, 'previas');
    mkdirSync(previous);
    for (const file of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < '0009')) writeFileSync(join(previous, file), readFileSync(join(DEFAULT_MIGRATIONS_DIR, file), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: previous });
    insertPet(legacy);
    legacy.close();
    const db = openSqliteDatabase(path);
    expect(db.prepare('SELECT id, owner_user_id, species, avatar_version, avatar_object_id FROM pets').all()).toEqual([
      { id: PET, owner_user_id: USER, species: 'CANINE', avatar_version: 0, avatar_object_id: null },
    ]);
    expect(db.prepare("SELECT count(*) FROM schema_migrations WHERE version = '0009_pet_media.sql'").pluck().get()).toBe(1);
    expect(db.prepare('SELECT count(*) FROM pet_media').pluck().get()).toBe(0);
    db.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T573 esquema de medios en Postgres real (migración 0005; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const { randomUUID } = await import('node:crypto');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t573_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of ['0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql', '0004_pets_microchip_global.sql']) await client.query(readFileSync(new URL(file, PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }
  const migrate = (client: import('pg').Client) => client.query(readFileSync(new URL('0005_pet_media.sql', PG_DIR), 'utf8'));
  const columnsOf = async (client: import('pg').Client, table: string) =>
    (await client.query('SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name', [table])).rows as Array<{
      column_name: string; data_type: string; is_nullable: string; column_default: string | null;
    }>;
  const failure = (work: Promise<unknown>) => work.then(() => null, (e: unknown) => e as { code?: string; constraint?: string });

  it('[REQ-GCS-005][SC-ALM-023] pet_media y media_deletion_queue tienen exactamente las columnas del modelo, sin binarios ni autoría', async () => {
    await withSchema(async (client) => {
      await migrate(client);
      const media = await columnsOf(client, 'pet_media');
      expect(media.map((c) => c.column_name)).toEqual(MEDIA_COLUMNS);
      expect(media.every((c) => c.is_nullable === 'NO')).toBe(true);
      expect(media.map((c) => c.data_type)).not.toContain('bytea');
      const queue = await columnsOf(client, 'media_deletion_queue');
      expect(queue.map((c) => c.column_name)).toEqual(QUEUE_COLUMNS);
      expect(queue.find((c) => c.column_name === 'attempts')).toMatchObject({ is_nullable: 'NO', column_default: '0' });
      const foreignKeys = (await client.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'media_deletion_queue'::regclass AND contype = 'f'")).rows[0];
      expect(foreignKeys).toEqual({ n: 0 });
      const index = (await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'pet_media' AND indexname = 'pet_media_pet_created'")).rows;
      expect(index).toHaveLength(1);
    });
  });

  it('[REQ-GCS-005][REQ-GCS-004] CHECK de kind y reason (23514), cascada desde pets y la cola sobrevive a la mascota', async () => {
    await withSchema(async (client) => {
      await migrate(client);
      await client.query("INSERT INTO users (id, username, password_hash, data) VALUES ($1, 'duenio', 'h', '{}'::jsonb)", [USER]);
      await client.query("INSERT INTO pets (id, owner_user_id, data, species, neutered, birth_date_is_estimate) VALUES ($1, $2, '{}'::jsonb, 'CANINE', 0, 0)", [PET, USER]);
      const media = (n: number, kind: string) =>
        client.query("INSERT INTO pet_media (id, pet_id, kind, mime, size_bytes, original_name, created_at) VALUES ($1, $2, $3, 'application/pdf', 10, 'a.pdf', '2026-11-17T10:00:00.000Z')", [MEDIA(n), PET, kind]);
      await media(1, 'FILE');
      await media(2, 'PHOTO');
      expect((await failure(media(3, 'AUDIO')))?.code).toBe('23514');
      const queue = (key: string, reason: string) => client.query("INSERT INTO media_deletion_queue (object_key, reason, enqueued_at) VALUES ($1, $2, '2026-11-17T10:00:00.000Z')", [key, reason]);
      await queue(KEY(1), 'INTENT');
      await queue(KEY(2), 'DELETE');
      expect((await failure(queue(KEY(3), 'OTRA')))?.code).toBe('23514');
      expect((await failure(queue(KEY(1), 'DELETE')))?.code).toBe('23505');
      expect((await failure(client.query('UPDATE media_deletion_queue SET attempts = -1')))?.code).toBe('23514');
      await client.query('DELETE FROM pets WHERE id = $1', [PET]);
      expect((await client.query('SELECT count(*)::int AS n FROM pet_media')).rows[0]).toEqual({ n: 0 });
      expect((await client.query('SELECT count(*)::int AS n FROM media_deletion_queue')).rows[0]).toEqual({ n: 2 });
    });
  });

  it('[REQ-AVA-001] las mascotas existentes quedan con avatar_version = 0 y avatar_object_id nulo', async () => {
    await withSchema(async (client) => {
      await client.query("INSERT INTO users (id, username, password_hash, data) VALUES ($1, 'duenio', 'h', '{}'::jsonb)", [USER]);
      await client.query("INSERT INTO pets (id, owner_user_id, data, species, neutered, birth_date_is_estimate) VALUES ($1, $2, '{}'::jsonb, 'CANINE', 0, 0)", [PET, USER]);
      await migrate(client);
      expect((await client.query('SELECT avatar_version, avatar_object_id FROM pets WHERE id = $1', [PET])).rows).toEqual([{ avatar_version: 0, avatar_object_id: null }]);
      const columns = await columnsOf(client, 'pets');
      expect(columns.find((c) => c.column_name === 'avatar_version')).toMatchObject({ data_type: 'integer', is_nullable: 'NO', column_default: '0' });
      expect(columns.find((c) => c.column_name === 'avatar_object_id')).toMatchObject({ data_type: 'text', is_nullable: 'YES', column_default: null });
    });
  });
});
