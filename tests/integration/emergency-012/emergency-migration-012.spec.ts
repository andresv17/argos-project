import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { allPostgresMigrationsSql } from '../../fixtures/postgres-migrations.ts';

/**
 * T1674 (Feature 012, Bloque D, #32; verde con T1673; `/keymaker`): migraciones del Bloque D (SQLite `0041_emergency_card.sql`, PostgreSQL `0037_emergency_card.sql`): `users.phone` (sin CHECK regex: la validación E.164 es de dominio
 * e idéntica en los tres motores), `pets.critical_allergies`, `pet_emergency_phone_consents`, `pet_emergency_cards` (`status_reason` con los cuatro motivos, FK `SET NULL`), los códigos de auditoría
 * `PET_CRITICAL_ALLERGIES_UPDATED` y `EMERGENCY_*` en `audit_log.mutation_type` y los ámbitos `QR_CARD_MUTATION` y `QR_PRIVATE_WRITE` de `rate_limit_events`.
 * El MISMO escenario corre en SQLite en memoria y en PostgreSQL real (`TEST_DATABASE_URL`; se OMITE sin ella). La paridad estática de columnas vive en `schema-parity.spec.ts`.
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007
 * Cubre SC-012-127 (paridad), SC-012-041, SC-012-046, SC-012-048, SC-012-106.
 */
const NOW = '2026-11-27T10:00:00.000Z';
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U1 = ID(1);
const U2 = ID(2);
const P1 = ID(11);
const HASH = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);
const AUDIT_TYPES = ['PET_CRITICAL_ALLERGIES_UPDATED', 'EMERGENCY_CARD_ACTIVATED', 'EMERGENCY_CARD_REGENERATED', 'EMERGENCY_CARD_DEACTIVATED', 'EMERGENCY_CARD_AUTO_DEACTIVATED', 'EMERGENCY_PHONE_CONSENT_CHANGED'];

interface Db {
  exec(sql: string, params?: unknown[]): Promise<void>;
  value(sql: string, params?: unknown[]): Promise<unknown>;
  /** Mensaje del error al ejecutar `sql` (o `null` si se aceptó). */
  failure(sql: string, params?: unknown[]): Promise<string | null>;
}
const CHECK = /check constraint|CHECK constraint failed/i;
const UNIQUE = /unique|duplicate key/i;
const FOREIGN = /foreign key/i;

async function scenario(db: Db): Promise<void> {
  const ins = (sql: string, ...p: unknown[]) => db.exec(sql, p);
  const rejects = async (re: RegExp, sql: string, ...p: unknown[]) => expect(await db.failure(sql, p), `${sql} ${JSON.stringify(p)}`).toMatch(re);
  await ins("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'ana', 'x', '{}')", U1);
  await ins("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'beto', 'x', '{}')", U2);
  await ins("INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, '{}')", P1, U1);

  // users.phone: sin CHECK regex (la validación es de dominio); NULL por defecto.
  expect(await db.value('SELECT phone FROM users WHERE id = ?', [U1])).toBeNull();
  await ins('UPDATE users SET phone = ? WHERE id = ?', '+573001112233', U1);
  await ins('UPDATE users SET phone = ? WHERE id = ?', 'no-es-un-telefono', U2); // paridad: el motor NO valida el formato
  expect(await db.value('SELECT phone FROM users WHERE id = ?', [U2])).toBe('no-es-un-telefono');

  // pets.critical_allergies: JSON arreglo, defecto '[]'.
  expect(await db.value('SELECT critical_allergies FROM pets WHERE id = ?', [P1])).toBe('[]');
  await ins('UPDATE pets SET critical_allergies = ? WHERE id = ?', '["Penicilina","Polen"]', P1);
  await rejects(CHECK, 'UPDATE pets SET critical_allergies = ? WHERE id = ?', 'no es arreglo', P1);
  await rejects(/not[ -]null/i, 'UPDATE pets SET critical_allergies = NULL WHERE id = ?', P1);

  // pet_emergency_cards
  const card = 'INSERT INTO pet_emergency_cards (pet_id, status, status_reason, status_changed_at, token_hash, token_rotated_at, consent_notice_version, consented_by_user_id, activated_at, last_scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  await ins(card, P1, 'ON', null, NOW, HASH, NOW, '0.1.0', U1, NOW, null);
  expect(await db.value('SELECT version FROM pet_emergency_cards WHERE pet_id = ?', [P1])).toBe(1);
  await ins('DELETE FROM pet_emergency_cards WHERE pet_id = ?', P1);
  await rejects(CHECK, card, P1, 'MAYBE', null, NOW, null, null, null, null, null, null);
  await rejects(CHECK, card, P1, 'ON', null, NOW, 'corto', NOW, '0.1.0', U1, NOW, null); // token_hash de 64
  await rejects(CHECK, card, P1, 'ON', null, NOW, null, NOW, '0.1.0', U1, NOW, null); // ON exige token_hash
  await rejects(CHECK, card, P1, 'OFF', 'USER_DEACTIVATED', NOW, HASH, null, null, null, null, null); // OFF no guarda token
  await rejects(CHECK, card, P1, 'ON', 'USER_DEACTIVATED', NOW, HASH, NOW, '0.1.0', U1, NOW, null); // el motivo vuelve a NULL al pasar a ON
  await rejects(CHECK, card, P1, 'OFF', 'OTRO_MOTIVO', NOW, null, null, null, null, null, null);
  for (const reason of ['USER_DEACTIVATED', 'AUTO_GUARD_LOST', 'AUTO_PET_DECEASED', 'AUTO_NOTICE_CHANGED']) {
    await ins(card, P1, 'OFF', reason, NOW, null, null, null, null, null, null);
    expect(await db.value('SELECT status_reason FROM pet_emergency_cards WHERE pet_id = ?', [P1])).toBe(reason);
    await ins('DELETE FROM pet_emergency_cards WHERE pet_id = ?', P1);
  }
  await ins(card, P1, 'OFF', null, null, null, null, null, null, null, null); // fila sin historial (tras la purga de 90 días)
  await ins('DELETE FROM pet_emergency_cards WHERE pet_id = ?', P1);
  await ins(card, P1, 'ON', null, NOW, HASH, NOW, '0.1.0', U2, NOW, null);
  await rejects(UNIQUE, card, P1, 'ON', null, NOW, HASH2, NOW, '0.1.0', U2, NOW, null); // una ficha por mascota
  const P2 = ID(12);
  await ins("INSERT INTO pets (id, owner_user_id, data) VALUES (?, ?, '{}')", P2, U1);
  await rejects(UNIQUE, card, P2, 'ON', null, NOW, HASH, NOW, '0.1.0', U2, NOW, null); // token_hash UNIQUE
  await rejects(FOREIGN, card, ID(99), 'OFF', null, null, null, null, null, null, null, null);
  // consented_by_user_id: SET NULL al borrar la cuenta
  await ins('DELETE FROM users WHERE id = ?', U2);
  expect(await db.value('SELECT consented_by_user_id FROM pet_emergency_cards WHERE pet_id = ?', [P1])).toBeNull();
  expect(await db.value('SELECT status FROM pet_emergency_cards WHERE pet_id = ?', [P1])).toBe('ON');

  // pet_emergency_phone_consents
  await ins("INSERT INTO users (id, username, password_hash, data) VALUES (?, 'carla', 'x', '{}')", ID(3));
  const consent = 'INSERT INTO pet_emergency_phone_consents (pet_id, user_id, consented_at, notice_version, phone_hmac) VALUES (?, ?, ?, ?, ?)';
  await ins(consent, P1, U1, NOW, '0.1.0', HASH);
  await ins(consent, P1, ID(3), NOW, '0.1.0', HASH2);
  await rejects(UNIQUE, consent, P1, U1, NOW, '0.1.0', HASH); // PK (pet_id, user_id)
  await rejects(CHECK, consent, P2, U1, NOW, '0.1.0', 'corto'); // phone_hmac de 64
  await rejects(FOREIGN, consent, ID(98), U1, NOW, '0.1.0', HASH);
  await rejects(FOREIGN, consent, P2, ID(97), NOW, '0.1.0', HASH);
  await ins('DELETE FROM users WHERE id = ?', ID(3)); // cascada por usuario
  expect(await db.value('SELECT count(*) FROM pet_emergency_phone_consents WHERE pet_id = ?', [P1])).toBe(1);
  await ins('DELETE FROM pets WHERE id = ?', P1); // cascada por mascota (ficha y consentimientos)
  expect(await db.value('SELECT count(*) FROM pet_emergency_phone_consents', [])).toBe(0);
  expect(await db.value('SELECT count(*) FROM pet_emergency_cards WHERE pet_id = ?', [P1])).toBe(0);

  // rate_limit_events: ámbitos nuevos y los anteriores intactos
  const rate = 'INSERT INTO rate_limit_events (id, scope, subject_user_id, occurred_at) VALUES (?, ?, ?, ?)';
  let n = 100;
  for (const scope of ['QR_CARD_MUTATION', 'QR_PRIVATE_WRITE', 'EXPORT', 'INVITE', 'MICROCHIP_DUPLICATE', 'CO_OWNER_INVITE', 'OWNER_REQUEST']) await ins(rate, ID((n += 1)), scope, U1, NOW);
  await rejects(CHECK, rate, ID((n += 1)), 'QR_OTRO', U1, NOW);
  await ins('DELETE FROM users WHERE id = ?', U1);
  expect(await db.value("SELECT count(*) FROM rate_limit_events WHERE scope LIKE 'QR_%'", [])).toBe(0); // se borran con la cuenta (rama N-08)

  // audit_log: códigos nuevos
  const audit = 'INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)';
  for (const type of AUDIT_TYPES) await ins(audit, ID((n += 1)), NOW, ID(7), type, 'PET', P1);
  await rejects(CHECK, audit, ID((n += 1)), NOW, ID(7), 'EMERGENCY_CARD_VIEWED', 'PET', P1);
  await ins(audit, ID((n += 1)), NOW, ID(7), 'CO_OWNER_INVITED', 'PET', P1); // los tipos anteriores se conservan
}

describe('T1674/T1673 migración 0041 de SQLite', () => {
  it('[SC-012-127] crea tablas y columnas del Bloque D con sus CHECK, UNIQUE, FK y cascadas', async () => {
    const sqlite = openSqliteDatabase(IN_MEMORY_DATABASE);
    const run = (sql: string, params: unknown[] = []) => sqlite.prepare(sql).run(...(params as never[]));
    const db: Db = {
      exec: async (sql, params = []) => void run(sql, params),
      value: async (sql, params = []) => sqlite.prepare(sql).pluck().get(...(params as never[])),
      failure: async (sql, params = []) => {
        try {
          run(sql, params);
          return null;
        } catch (error) {
          return (error as Error).message;
        }
      },
    };
    try {
      await scenario(db);
      const applied = sqlite.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all() as string[];
      expect(applied.at(-1)).toBe('0042_share_link_pets.sql'); // BAJA-3 (oracle): la última migración vigente (0042 en SQLite; 0038 en PostgreSQL); la 0041 de la ficha QR queda aplicada antes
      expect(applied).toContain('0041_emergency_card.sql');
    } finally {
      sqlite.close();
    }
  });
});

describe.skipIf(process.env['TEST_DATABASE_URL'] === undefined)('T1674/T1673 migración 0037 de PostgreSQL real (TEST_DATABASE_URL)', { timeout: 30_000 }, () => {
  it('[SC-012-127] el MISMO escenario produce los mismos rechazos y filas que SQLite', async () => {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env['TEST_DATABASE_URL']! });
    await client.connect();
    const schema = `t1673_${randomUUID().replaceAll('-', '')}`;
    const toPg = (sql: string): string => {
      let i = 0;
      return sql.replace(/\?/g, () => `$${(i += 1)}`);
    };
    const db: Db = {
      exec: async (sql, params = []) => void (await client.query(toPg(sql), params)),
      value: async (sql, params = []) => {
        const { rows } = await client.query(toPg(sql), params);
        const v = rows[0] === undefined ? undefined : Object.values(rows[0] as Record<string, unknown>)[0];
        return typeof v === 'string' && /^\d+$/.test(v) && /count\(/i.test(sql) ? Number(v) : v;
      },
      failure: async (sql, params = []) => {
        await client.query('SAVEPOINT s');
        try {
          await client.query(toPg(sql), params);
          await client.query('RELEASE SAVEPOINT s');
          return null;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT s');
          return (error as Error).message;
        }
      },
    };
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}`);
      await client.query(allPostgresMigrationsSql());
      await client.query('BEGIN');
      await scenario(db);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    }
  });
});
