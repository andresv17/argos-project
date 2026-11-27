/**
 * Migrador acotado de PostgreSQL (T429; REQ-PG-006, REQ-PG-010, REQ-PG-014, REQ-CICD-005, SC-CLD-007, SC-CLD-020).
 * Uso: `tsx scripts/migrate-postgres.ts` con `DATABASE_URL_DIRECT` (URL directa, no pooler) en el entorno.
 * - Una sola conexión directa (`application_name='argos-migrator'`, `statement_timeout`); `SET lock_timeout = '5s'`.
 * - Candado de SESIÓN con `pg_try_advisory_lock` en bucle acotado a 60 s (nunca el bloqueante); se libera con
 *   `pg_advisory_unlock` y se cierra la conexión en `finally`. Un candado ajeno falla con `MigrationLockTimeoutError`.
 * - Una transacción por migración; una migración bloqueada (55P03) se reintenta hasta 3 veces con espera creciente.
 * - Regla baseline: `0001_baseline.sql` crea `schema_migrations` e inserta su propia fila; el migrador no crea la tabla, la detecta
 *   con `to_regclass` y registra cada versión (nombre sin `.sql`) con `ON CONFLICT DO NOTHING` dentro de la transacción.
 * - Idempotente: solo aplica las versiones ausentes de `schema_migrations`, en orden.
 * - Salida sin secretos: solo versiones, conteos y códigos de error; nunca la URL, el usuario, la contraseña ni el mensaje del driver.
 * `DATABASE_URL_DIRECT` se lee en `src/infrastructure/config/migrator-config.ts` (INV-ARCH-006); este archivo no toca el entorno.
 *
 * @implements REQ-PG-006, REQ-PG-010, REQ-PG-014, REQ-CICD-005
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { sanitizeStoredSnapshot } from '../src/domain/scene/inputs-snapshot.ts';
import { loadMigratorConfig } from '../src/infrastructure/config/migrator-config.ts';

/** Clave del candado de migración (distinta de la de transacciones de la aplicación, 0x4152474f53). */
export const MIGRATION_LOCK_KEY = 0x41524d4947;
export const LOCK_ACQUIRE_BUDGET_MS = 60_000;
export const LOCK_POLL_INTERVAL_MS = 1_000;
export const MAX_LOCK_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;
export const LOCK_TIMEOUT = '5s';
export const STATEMENT_TIMEOUT_MS = 30_000;
export const CONNECTION_TIMEOUT_MS = 10_000;
export const APPLICATION_NAME = 'argos-migrator';
const LOCK_NOT_AVAILABLE = '55P03';
const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;
export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../src/infrastructure/persistence/postgres/migrations/', import.meta.url));

export interface MigratorSettings {
  readonly connectionString: string;
  readonly application_name: string;
  readonly statement_timeout: number;
  readonly connectionTimeoutMillis: number;
}

export interface MigratorClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  end(): Promise<void>;
}

export interface Migration {
  readonly version: string;
  readonly sql: string;
}

export interface MigratorOptions {
  readonly databaseUrl: string;
  readonly migrations: readonly Migration[];
  readonly connect: (settings: MigratorSettings) => Promise<MigratorClient>;
  readonly log: (line: string) => void;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

/** No se obtuvo el candado de migración dentro de 60 s (otro migrador activo o colgado). Sin datos del entorno. */
export class MigrationLockTimeoutError extends Error {
  constructor() {
    super(`No se obtuvo el candado de migración en ${LOCK_ACQUIRE_BUDGET_MS / 1000} s`);
    this.name = 'MigrationLockTimeoutError';
  }
}

/** Falla de una migración: solo la versión y el código SQLSTATE; nunca el mensaje del driver (puede incluir la URL). */
export class MigrationFailedError extends Error {
  constructor(
    public readonly version: string,
    public readonly code: string,
  ) {
    super(`Migración ${version} fallida (código ${code})`);
    this.name = 'MigrationFailedError';
  }
}

function safeCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(code)) return code;
  }
  return 'UNKNOWN';
}

async function acquireLock(client: MigratorClient, options: MigratorOptions): Promise<void> {
  const deadline = options.now() + LOCK_ACQUIRE_BUDGET_MS;
  for (;;) {
    const result = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_KEY]);
    if (result.rows[0]?.['locked'] === true) return;
    if (options.now() + LOCK_POLL_INTERVAL_MS > deadline) throw new MigrationLockTimeoutError();
    await options.sleep(LOCK_POLL_INTERVAL_MS);
  }
}

async function appliedVersions(client: MigratorClient): Promise<Set<string>> {
  const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
  if (exists.rows[0]?.['t'] === null || exists.rows[0]?.['t'] === undefined) return new Set();
  const rows = await client.query('SELECT version FROM schema_migrations');
  return new Set(rows.rows.map((row) => String(row['version'])));
}

/**
 * Pasos de datos de migraciones que no se pueden expresar en SQL (corren en la MISMA transaccion, tras el SQL). 0026 (011, T1519, REQ-IA11-004): reescribe cada snapshot de escena a v2 sin
 * texto libre y recalcula la huella con el codigo de la aplicacion. Idempotente; una fila ilegible no se toca. Sin salida de datos.
 */
export const MIGRATION_STEPS: Readonly<Record<string, (client: MigratorClient) => Promise<void>>> = {
  '0026_scene_snapshot_v2': async (client) => {
    const scenes = await client.query('SELECT id, image_inputs_snapshot AS snapshot FROM home_scenes WHERE image_inputs_snapshot IS NOT NULL');
    for (const row of scenes.rows) {
      const clean = sanitizeStoredSnapshot(String(row['snapshot']));
      if (clean !== null) await client.query('UPDATE home_scenes SET image_inputs_snapshot = $1, image_fingerprint = $2 WHERE id = $3', [clean.text, clean.fingerprint, row['id']]);
    }
    const attempts = await client.query('SELECT id, inputs_snapshot AS snapshot FROM scene_attempts');
    for (const row of attempts.rows) {
      const clean = sanitizeStoredSnapshot(String(row['snapshot']));
      if (clean !== null) await client.query('UPDATE scene_attempts SET inputs_snapshot = $1, fingerprint = $2 WHERE id = $3', [clean.text, clean.fingerprint, row['id']]);
    }
  },
};

async function applyOne(client: MigratorClient, migration: Migration, options: MigratorOptions): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await MIGRATION_STEPS[migration.version]?.(client);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [migration.version]);
      await client.query('COMMIT');
      return;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = safeCode(error);
      if (code !== LOCK_NOT_AVAILABLE || attempt >= MAX_LOCK_RETRIES) throw new MigrationFailedError(migration.version, code);
      options.log(`migrate: ${migration.version} bloqueada (${code}), reintento ${attempt + 1}/${MAX_LOCK_RETRIES}`);
      await options.sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }
}

/** Aplica las migraciones pendientes y devuelve las versiones aplicadas. @implements REQ-PG-006, REQ-PG-014 */
export async function runPostgresMigrations(options: MigratorOptions): Promise<string[]> {
  const client = await options.connect({
    connectionString: options.databaseUrl,
    application_name: APPLICATION_NAME,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  let locked = false;
  try {
    await client.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await acquireLock(client, options);
    locked = true;
    const applied = await appliedVersions(client);
    const pending = [...options.migrations].filter((m) => !applied.has(m.version)).sort((a, b) => (a.version < b.version ? -1 : 1));
    for (const migration of pending) {
      await applyOne(client, migration, options);
      options.log(`migrate: aplicada ${migration.version}`);
    }
    options.log(pending.length === 0 ? 'migrate: sin migraciones pendientes' : `migrate: ${pending.length} migración(es) aplicada(s)`);
    return pending.map((m) => m.version);
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1) AS unlocked', [MIGRATION_LOCK_KEY]);
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

/** Lee las migraciones `NNNN_nombre.sql` de la carpeta; la versión es el nombre sin `.sql` (como en 0001_baseline). */
export function readMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .map((file) => ({ file, match: MIGRATION_FILE.exec(file) }))
    .filter((entry): entry is { file: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ file, match }) => ({ version: match[1]!, sql: readFileSync(join(dir, file), 'utf8') }))
    .sort((a, b) => (a.version < b.version ? -1 : 1));
}

async function main(): Promise<void> {
  const log = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  try {
    const { databaseUrlDirect } = loadMigratorConfig();
    await runPostgresMigrations({
      databaseUrl: databaseUrlDirect,
      migrations: readMigrations(),
      connect: async (settings) => {
        const client = new pg.Client({ ...settings });
        await client.connect();
        return client as unknown as MigratorClient;
      },
      log,
      now: () => Date.now(),
      sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const detail = error instanceof MigrationLockTimeoutError || error instanceof MigrationFailedError || name === 'AppConfigError' ? ` ${(error as Error).message}` : ` código ${safeCode(error)}`;
    process.stderr.write(`migrate: error ${name}${detail}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
