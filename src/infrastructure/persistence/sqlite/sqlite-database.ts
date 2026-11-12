/**
 * Apertura de la base SQLite y migraciones al arranque.
 * - `openSqliteDatabase(path)` crea la carpeta si falta, abre la base con `foreign_keys` activo (necesario para los
 *   `ON DELETE CASCADE` de INV-PET-005 y C5) y aplica las migraciones pendientes.
 * - Cada migración (`migrations/NNNN_nombre.sql`) se aplica en su propia transacción y queda anotada en
 *   `schema_migrations`; si falla, no queda nada a medias y la apertura se rechaza.
 * - Un archivo que no es una base SQLite o una migración fallida producen ERR-INTERNAL-UNEXPECTED (F4), sin trazas.
 *
 * - REQ-MIG-001 (T230): `0003_pets_species_and_weight_grams.sql` migra la base de la 001 sin pérdida (DOG a CANINE, CAT a FELINE,
 *   pesos a gramos enteros) en una transacción y es repetible: `schema_migrations` impide aplicarla dos veces.
 *
 * - REQ-MIG-001, INV-HOUSE2-001, REQ-HOUSE2-003 (T243): `0004_roles_and_pet_assignments.sql` aplica los roles de la
 *   membresía, el propietario del hogar y las asignaciones mascota-hogar en la misma transacción.
 *
 * - REQ-AUD-001, REQ-MIG-001 (T258): `0005_audit_log_and_clinical_columns.sql` crea `audit_log` (sin claves foráneas) con la fila MIGRATION única;
 *   `openSqliteDatabase` activa `PRAGMA secure_delete = ON` en cada conexión (R4).
 *
 * @implements REQ-AUD-001, REQ-MIG-001, INV-ARCH-004, INV-PET-005, ERR-INTERNAL-UNEXPECTED, INV-HOUSE2-001, REQ-HOUSE2-003
 */

import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DomainError } from '../../../generated/index.ts';

export type SqliteDatabase = Database.Database;

export const IN_MEMORY_DATABASE = ':memory:';
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

export interface OpenSqliteOptions {
  /** Carpeta de migraciones; por defecto `migrations/` junto a este archivo. */
  readonly migrationsDir?: string;
}

/**
 * Aplica, en orden, las migraciones de `migrationsDir` que no estén en `schema_migrations`. Devuelve las aplicadas.
 * @implements INV-ARCH-004
 */
export function runMigrations(db: SqliteDatabase, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) STRICT",
  );
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all() as string[]);
  const pending = readdirSync(migrationsDir)
    .filter((name) => MIGRATION_FILE.test(name) && !applied.has(name))
    .sort();
  const record = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(name);
    })();
  }
  return pending;
}

/**
 * Abre (o crea) la base, activa claves foráneas y aplica las migraciones pendientes.
 * @implements INV-PET-005, ERR-INTERNAL-UNEXPECTED
 */
export function openSqliteDatabase(path: string, options: OpenSqliteOptions = {}): SqliteDatabase {
  if (path !== IN_MEMORY_DATABASE) mkdirSync(dirname(path), { recursive: true });
  let db: SqliteDatabase | null = null;
  try {
    db = new Database(path);
    if (path !== IN_MEMORY_DATABASE) db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    db.pragma('secure_delete = ON');
    runMigrations(db, options.migrationsDir);
    return db;
  } catch (error) {
    db?.close();
    const reason = error instanceof Error ? error.message : String(error);
    throw new DomainError('ERR-INTERNAL-UNEXPECTED', `No se pudo abrir o migrar la base SQLite: ${reason}`);
  }
}
