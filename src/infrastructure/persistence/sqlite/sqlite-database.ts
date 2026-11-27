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
import { sanitizeStoredSnapshot } from '../../../domain/scene/inputs-snapshot.ts';

export type SqliteDatabase = Database.Database;

export const IN_MEMORY_DATABASE = ':memory:';
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;

export interface OpenSqliteOptions {
  /** Carpeta de migraciones; por defecto `migrations/` junto a este archivo. */
  readonly migrationsDir?: string;
}

/**
 * Comprobaciones previas de migraciones que cambian restricciones (Feature 004, T547 y T553): corren dentro de la transacción de la
 * migración y, si encuentran datos que la nueva restricción rechazaría, la ABORTAN con un mensaje que solo trae conteos (nunca un
 * username, un microchip ni un identificador). Así la base queda intacta y `schema_migrations` no anota la versión.
 * @implements REQ-LOG-002, INV-LOG-001, REQ-PET4-001, INV-PET4-001, EDGE-008
 */
export const MIGRATION_PRECHECKS: Readonly<Record<string, (db: SqliteDatabase) => void>> = {
  '0007_username_case_insensitive.sql': (db) => {
    const clashes = db.prepare('SELECT count(*) FROM (SELECT lower(username) FROM users GROUP BY 1 HAVING count(*) > 1)').pluck().get() as number;
    if (clashes > 0) throw new Error(`Migración 0007 abortada: ${clashes} grupo(s) de usuarios con el mismo lower(username); Neo debe resolverlos antes de migrar`);
  },
  '0008_pets_microchip_global.sql': (db) => {
    const clashes = db.prepare('SELECT count(*) FROM (SELECT microchip_id FROM pets WHERE microchip_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1)').pluck().get() as number;
    if (clashes > 0) throw new Error(`Migración 0008 abortada: ${clashes} grupo(s) de mascotas con el mismo microchip entre propietarios; Neo debe resolverlos antes de migrar`);
  },
  '0010_rate_limit_microchip_scope.sql': (db) => {
    const orphans = db.prepare('SELECT count(*) FROM rate_limit_events WHERE subject_user_id NOT IN (SELECT id FROM users)').pluck().get() as number;
    if (orphans > 0) throw new Error(`Migración 0010 abortada: ${orphans} evento(s) de límite de frecuencia sin usuario en rate_limit_events; Neo debe resolverlos antes de migrar`);
  },
  '0035_co_ownership_rate_limit_scopes.sql': (db) => {
    const orphans = db.prepare('SELECT count(*) FROM rate_limit_events WHERE subject_user_id NOT IN (SELECT id FROM users)').pluck().get() as number;
    if (orphans > 0) throw new Error(`Migración 0035 abortada: ${orphans} evento(s) de límite de frecuencia sin usuario en rate_limit_events; Neo debe resolverlos antes de migrar`);
  },
};

/**
 * Pasos de datos de migraciones que no se pueden expresar en SQL (corren en la MISMA transaccion, tras el SQL). 0030 (011, T1519, REQ-IA11-004): reescribe cada snapshot de escena a v2 sin
 * texto libre y recalcula la huella con el codigo de la aplicacion (SQLite no calcula SHA-256). Idempotente; una fila ilegible no se toca; no escribe nada fuera de esas columnas.
 */
export const MIGRATION_STEPS: Readonly<Record<string, (db: SqliteDatabase) => void>> = {
  '0030_scene_snapshot_v2.sql': (db) => {
    const scenes = db.prepare('SELECT id, image_inputs_snapshot AS snapshot FROM home_scenes WHERE image_inputs_snapshot IS NOT NULL').all() as Array<{ id: string; snapshot: string }>;
    const updateScene = db.prepare('UPDATE home_scenes SET image_inputs_snapshot = ?, image_fingerprint = ? WHERE id = ?');
    for (const row of scenes) {
      const clean = sanitizeStoredSnapshot(row.snapshot);
      if (clean !== null) updateScene.run(clean.text, clean.fingerprint, row.id);
    }
    const attempts = db.prepare('SELECT id, inputs_snapshot AS snapshot FROM scene_attempts').all() as Array<{ id: string; snapshot: string }>;
    const updateAttempt = db.prepare('UPDATE scene_attempts SET inputs_snapshot = ?, fingerprint = ? WHERE id = ?');
    for (const row of attempts) {
      const clean = sanitizeStoredSnapshot(row.snapshot);
      if (clean !== null) updateAttempt.run(clean.text, clean.fingerprint, row.id);
    }
  },
};

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
      MIGRATION_PRECHECKS[name]?.(db);
      db.exec(sql);
      MIGRATION_STEPS[name]?.(db);
      record.run(name);
    })();
  }
  return pending;
}

/**
 * Sonda de /readyz (REQ-CLD-004): la base responde (`SELECT 1`) y las migraciones esperadas están todas aplicadas
 * (esperadas ⊆ aplicadas, criterio de subconjunto, nunca igualdad). Rechaza sin datos; no hace timeout ni caché propios.
 * @implements REQ-CLD-004, REQ-PG-013
 */
export function assertSchemaReady(db: SqliteDatabase, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): void {
  db.prepare('SELECT 1').pluck().get();
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all() as string[]);
  const missing = readdirSync(migrationsDir).filter((name) => MIGRATION_FILE.test(name) && !applied.has(name));
  if (missing.length > 0) throw new Error('migraciones pendientes');
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
