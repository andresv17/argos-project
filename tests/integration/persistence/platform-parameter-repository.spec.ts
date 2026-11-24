/**
 * T712 [REQ-PRM-001][REQ-PRM-003][SC-005-004] SqlPlatformParameterRepository en SQLite (migración 0011) y en Postgres real (0007; se OMITE sin TEST_DATABASE_URL).
 *  - la siembra deja album.max_photos_per_pet = '10' con descripción y updated_by_user_id nulo;
 *  - clave ausente => null; valor editado por SQL => se lee tal cual (el dominio lo interpreta);
 *  - `updated_by_user_id` acepta un usuario inexistente (sin FK, REQ-PRM-003) y la clave es única;
 *  - de extremo a extremo con el puerto en caché: 12 se acepta, 'abc' cae al defecto 10 con aviso.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqlPlatformParameterRepository } from '../../../src/infrastructure/persistence/platform-parameter-repository.ts';
import { createCachedPlatformParameterPort } from '../../../src/application/platform-parameters/cached-platform-parameter.ts';
import { ALBUM_MAX_PHOTOS_PER_PET_KEY } from '../../../src/domain/platform/platform-parameters.ts';
import type { ParameterWarning } from '../../../src/application/ports/platform-parameter.port.ts';

const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const clock = { timeZone: 'America/Bogota', todayIsoDate: () => '2026-11-18', nowIsoTimestamp: () => '2026-11-18T10:00:00.000Z' };

describe('T712 SqlPlatformParameterRepository sobre SQLite (0011_platform_parameters.sql)', () => {
  it('[REQ-PRM-001] la siembra deja album.max_photos_per_pet = 10 con descripción y sin autor', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const row = db.prepare("SELECT key, value, description, updated_at, updated_by_user_id FROM platform_parameters WHERE key = 'album.max_photos_per_pet'").all() as Array<Record<string, unknown>>;
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ key: 'album.max_photos_per_pet', value: '10', description: 'Máximo de fotos de álbum por mascota', updated_by_user_id: null });
    expect(String(row[0]!['updated_at'])).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(await SqlPlatformParameterRepository.forSqlite(db).findValue('album.max_photos_per_pet')).toBe('10');
    db.close();
  });

  it('[REQ-PRM-002] clave ausente => null; un valor editado se lee tal cual, sin interpretarlo', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const repository = SqlPlatformParameterRepository.forSqlite(db);
    expect(await repository.findValue('album.otra_clave')).toBeNull();
    db.prepare("UPDATE platform_parameters SET value = 'abc' WHERE key = 'album.max_photos_per_pet'").run();
    expect(await repository.findValue('album.max_photos_per_pet')).toBe('abc');
    db.close();
  });

  it('[REQ-PRM-003] updated_by_user_id acepta un usuario inexistente (sin FK) y la clave es única', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare("UPDATE platform_parameters SET updated_by_user_id = 'no-existe' WHERE key = 'album.max_photos_per_pet'").run().changes).toBe(1);
    expect(() => db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('album.max_photos_per_pet', '5', 'x', '2026-11-18T10:00:00.000Z')").run()).toThrow(/UNIQUE|PRIMARY/i);
    db.close();
  });

  it('[SC-005-004] extremo a extremo con el puerto: 12 se acepta; abc cae a 10 con un aviso', async () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    const warnings: ParameterWarning[] = [];
    db.prepare("UPDATE platform_parameters SET value = '12' WHERE key = 'album.max_photos_per_pet'").run();
    const port = createCachedPlatformParameterPort({ repository: SqlPlatformParameterRepository.forSqlite(db), clock, warn: (w) => warnings.push(w) });
    expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(12);
    db.prepare("UPDATE platform_parameters SET value = 'abc'").run();
    const fresh = createCachedPlatformParameterPort({ repository: SqlPlatformParameterRepository.forSqlite(db), clock, warn: (w) => warnings.push(w) });
    expect(await fresh.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(10);
    expect(warnings).toEqual([{ key: 'album.max_photos_per_pet', reason: 'UNREADABLE' }]);
    db.close();
  });
});

describe.skipIf(!TEST_DATABASE_URL)('T712 SqlPlatformParameterRepository sobre Postgres real (0007_platform_parameters.sql; requiere TEST_DATABASE_URL; esquema desechable)', { timeout: 60_000 }, () => {
  async function withSchema(work: (client: import('pg').Client) => Promise<void>): Promise<void> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const schema = `argos_t712_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      for (const file of readdirSync(PG_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) await client.query(readFileSync(new URL(file, PG_DIR), 'utf8'));
      await work(client);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  }

  it('[REQ-PRM-001] la siembra deja album.max_photos_per_pet = 10 con descripción y sin autor', async () => {
    await withSchema(async (client) => {
      const { rows } = await client.query("SELECT key, value, description, updated_at, updated_by_user_id FROM platform_parameters WHERE key = 'album.max_photos_per_pet'");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key: 'album.max_photos_per_pet', value: '10', description: 'Máximo de fotos de álbum por mascota', updated_by_user_id: null });
      expect(String(rows[0].updated_at)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(await SqlPlatformParameterRepository.forPostgres(client).findValue('album.max_photos_per_pet')).toBe('10');
    });
  });

  it('[REQ-PRM-002] clave ausente => null; un valor editado se lee tal cual', async () => {
    await withSchema(async (client) => {
      const repository = SqlPlatformParameterRepository.forPostgres(client);
      expect(await repository.findValue('album.otra_clave')).toBeNull();
      await client.query("UPDATE platform_parameters SET value = 'abc' WHERE key = 'album.max_photos_per_pet'");
      expect(await repository.findValue('album.max_photos_per_pet')).toBe('abc');
    });
  });

  it('[REQ-PRM-003] updated_by_user_id acepta un usuario inexistente (sin FK) y la clave es única', async () => {
    await withSchema(async (client) => {
      const fks = await client.query("SELECT 1 FROM information_schema.table_constraints WHERE table_schema = current_schema() AND table_name = 'platform_parameters' AND constraint_type = 'FOREIGN KEY'");
      expect(fks.rowCount).toBe(0);
      const upd = await client.query("UPDATE platform_parameters SET updated_by_user_id = 'no-existe' WHERE key = 'album.max_photos_per_pet'");
      expect(upd.rowCount).toBe(1);
      await expect(client.query("INSERT INTO platform_parameters (key, value, description, updated_at) VALUES ('album.max_photos_per_pet', '5', 'x', '2026-11-18T10:00:00.000Z')")).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('[SC-005-004] extremo a extremo con el puerto: 12 se acepta; abc cae a 10 con un aviso', async () => {
    await withSchema(async (client) => {
      const warnings: ParameterWarning[] = [];
      await client.query("UPDATE platform_parameters SET value = '12'");
      const port = createCachedPlatformParameterPort({ repository: SqlPlatformParameterRepository.forPostgres(client), clock, warn: (w) => warnings.push(w) });
      expect(await port.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(12);
      await client.query("UPDATE platform_parameters SET value = 'abc'");
      const fresh = createCachedPlatformParameterPort({ repository: SqlPlatformParameterRepository.forPostgres(client), clock, warn: (w) => warnings.push(w) });
      expect(await fresh.getInt(ALBUM_MAX_PHOTOS_PER_PET_KEY)).toBe(10);
      expect(warnings).toEqual([{ key: 'album.max_photos_per_pet', reason: 'UNREADABLE' }]);
    });
  });
});
