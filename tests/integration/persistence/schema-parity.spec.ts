import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * Paridad del esquema final de PostgreSQL (0001_baseline.sql más 0002_record_revision.sql, D-20) con el de SQLite tras sus 8 migraciones
 * (REQ-PG-003, REQ-MIG-001, INV-PET2-001, REQ-HOUSE2-003; T419; data-model.md §2 de la 003).
 * Parte estática: compara tablas, columnas, tipos mapeados, nulabilidad, valores por defecto, claves, cascadas,
 * CHECK, UNIQUE e índices (incluidos los parciales) leyendo solo el texto del SQL; no levanta PostgreSQL.
 * Parte viva: con TEST_DATABASE_URL aplica el baseline en un esquema desechable y compara con information_schema.
 */
const BASELINE_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0001_baseline.sql', import.meta.url);
/** T547: la 0003 de Postgres equivale a la 0007 de SQLite (índice único LOWER(username), invitaciones por LOWER(invitee_username), normalización de intentos). */
const USERNAME_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0003_username_case_insensitive.sql', import.meta.url);
/** T553: la 0004 de Postgres equivale a la 0008 de SQLite (`pets_owner_microchip` pasa a `pets_microchip_global`, único parcial global). */
const MICROCHIP_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0004_pets_microchip_global.sql', import.meta.url);
/** T556: la 0006 de Postgres equivale a la 0010 de SQLite (el CHECK de `rate_limit_events.scope` admite MICROCHIP_DUPLICATE). */
const RATE_SCOPE_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0006_rate_limit_microchip_scope.sql', import.meta.url);
/** T574: la 0005 de Postgres equivale a la 0009 de SQLite (`pet_media`, `media_deletion_queue` y las columnas de avatar de `pets`). */
const MEDIA_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0005_pet_media.sql', import.meta.url);
/** T540: la migración 0002 de Postgres equivale a la 0006 de SQLite (`revision` en las 6 tablas de registros, D-16 A). */
const REVISION_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0002_record_revision.sql', import.meta.url);

/** Lista canónica independiente de ambos esquemas (data-model.md §2). */
const CANONICAL_TABLES = [
  'audit_log', 'backup_confirmation_tokens', 'body_measurements', 'custom_parameters', 'dewormings', 'household_invitations',
  'household_members', 'households', 'login_attempts', 'media_deletion_queue', 'medical_visits', 'pet_assignments', 'pet_media', 'pets', 'rate_limit_events',
  'schema_migrations', 'sessions', 'users', 'vaccinations', 'weights',
];

/** Lista canónica de índices del esquema final (T555, 004): los que añaden las migraciones 0007/0008 (SQLite) y 0003/0004 (Postgres) y los de la 002. */
const CANONICAL_INDEXES = [
  'audit_log_entity_id', 'audit_log_executor_user_id', 'audit_log_timestamp', 'body_measurements_pet_id', 'custom_parameters_pet_id', 'dewormings_pet_id',
  'household_invitations_household_id', 'household_invitations_invitee_user_id', 'household_invitations_one_open', 'household_members_household_id',
  'household_members_one_open_per_user', 'household_members_one_owner', 'household_members_user_id', 'medical_visits_pet_id', 'pet_assignments_household_id',
  'pet_media_pet_created', 'pets_microchip_global', 'pets_owner_user_id', 'rate_limit_events_subject', 'sessions_user_id', 'users_username_lower', 'vaccinations_pet_id', 'weights_pet_id',
];

/** Diferencias de tipo justificadas en data-model.md §1: data JSON -> JSONB; indicadores 0/1 -> SMALLINT. */
const SMALLINT_FLAGS = new Set(['neutered', 'birth_date_is_estimate', 'is_household_owner']);

interface Column { type: string; notNull: boolean; default: string | null; unique: boolean; references: string | null; generated: boolean }
interface Table { columns: Map<string, Column>; primaryKey: string[]; checks: string[] }
interface Index { table: string; unique: boolean; columns: string; where: string | null }
interface Schema { tables: Map<string, Table>; indexes: Map<string, Index> }

const squash = (s: string): string => s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,\s*/g, ',').trim();
const stripSql = (sql: string): string => sql.replace(/--[^\n]*/g, '').replace(/"/g, '');

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (const ch of text) {
    if (ch === "'") inString = !inString;
    if (!inString) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Extrae cada CHECK (...) con paréntesis balanceados y devuelve el resto del texto sin ellos. */
function extractChecks(item: string): { rest: string; checks: string[] } {
  const checks: string[] = [];
  let rest = '';
  let i = 0;
  while (i < item.length) {
    const m = /^CHECK\s*\(/i.exec(item.slice(i));
    if (!m) {
      rest += item[i];
      i++;
      continue;
    }
    let depth = 1;
    let j = i + m[0].length;
    const start = j;
    while (j < item.length && depth > 0) {
      if (item[j] === '(') depth++;
      if (item[j] === ')') depth--;
      j++;
    }
    checks.push(canonicalCheck(item.slice(start, j - 1)));
    i = j;
  }
  return { rest, checks };
}

/** Equivalencias de data-model.md §1 (GLOB -> regex) y normalización de espacios. */
function canonicalCheck(expr: string): string {
  const e = squash(expr).replace(/\((length\((\w+)\) = 15 AND \2 NOT GLOB '\*\[\^0-9\]\*')\)/, (_m, _g, col: string) => `${col} ~ '^[0-9]{15}$'`);
  return e;
}

function parseCreateTable(name: string, body: string): Table {
  const table: Table = { columns: new Map(), primaryKey: [], checks: [] };
  for (const raw of splitTopLevel(body)) {
    const { rest, checks } = extractChecks(raw);
    table.checks.push(...checks);
    const item = squash(rest);
    const pk = /^PRIMARY KEY \(([^)]*)\)$/i.exec(item);
    if (pk) {
      table.primaryKey = pk[1]!.split(',').map((c) => c.trim());
      continue;
    }
    if (item === '') continue;
    const m = /^(\w+) (\w+)(.*)$/.exec(item);
    if (!m) throw new Error(`Definición no reconocida en ${name}: ${item}`);
    const tail = m[3]!;
    const references = /REFERENCES (\w+) ?\((\w+)\)( ON DELETE (CASCADE))?/i.exec(tail);
    const dflt = /DEFAULT (\(?'[^']*'\)?|\(?\w+\)?|\(.*?\)\)?)(?= NOT NULL| UNIQUE| REFERENCES| GENERATED|$)/i.exec(tail);
    const isPk = /PRIMARY KEY/i.test(tail);
    if (isPk) table.primaryKey = [m[1]!];
    table.columns.set(m[1]!, {
      type: m[2]!.toUpperCase(),
      notNull: /NOT NULL/i.test(tail) || isPk,
      default: dflt ? dflt[1]!.replace(/^\((.*)\)$/, '$1') : null,
      unique: /\bUNIQUE\b/i.test(tail),
      references: references ? `${references[1]}(${references[2]}) ON DELETE ${references[4] ?? 'NO ACTION'}` : null,
      generated: /GENERATED ALWAYS AS/i.test(tail),
    });
  }
  table.checks.sort();
  return table;
}

function parseSchema(statements: string[]): Schema {
  const schema: Schema = { tables: new Map(), indexes: new Map() };
  for (const stmt of statements) {
    const t = /^CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(([\s\S]*)\)\s*(?:STRICT)?$/i.exec(stmt.trim());
    if (t) {
      schema.tables.set(t[1]!, parseCreateTable(t[1]!, t[2]!));
      continue;
    }
    const alter = /^ALTER TABLE (\w+) ADD COLUMN ([\s\S]+)$/i.exec(stmt.trim());
    if (alter) {
      const added = parseCreateTable(alter[1]!, alter[2]!);
      for (const [name, column] of added.columns) schema.tables.get(alter[1]!)!.columns.set(name, column);
      continue;
    }
    // Postgres nombra el CHECK de columna `<tabla>_<columna>_check`: DROP lo retira y ADD CONSTRAINT … CHECK pone el nuevo (0006).
    const dropCheck = /^ALTER TABLE (\w+) DROP CONSTRAINT (\w+)_(\w+)_check$/i.exec(stmt.trim());
    if (dropCheck) {
      const table = schema.tables.get(dropCheck[1]!)!;
      table.checks = table.checks.filter((c) => !c.startsWith(`${dropCheck[3]} IN `));
      continue;
    }
    const addCheck = /^ALTER TABLE (\w+) ADD CONSTRAINT \w+ (CHECK[\s\S]+)$/i.exec(stmt.trim());
    if (addCheck) {
      const table = schema.tables.get(addCheck[1]!)!;
      table.checks.push(...extractChecks(addCheck[2]!).checks);
      table.checks.sort();
      continue;
    }
    const drop = /^DROP INDEX (?:IF EXISTS )?(\w+)$/i.exec(stmt.trim());
    if (drop) {
      schema.indexes.delete(drop[1]!);
      continue;
    }
    // Admite un nivel de paréntesis anidado en las columnas (índices de expresión: lower(username)); SQLite y Postgres difieren solo en mayúsculas.
    const ix = /^CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+) ON (\w+) ?\(((?:[^()]|\([^()]*\))*)\)(?: WHERE ([\s\S]+))?$/i.exec(squash(stmt));
    if (ix) schema.indexes.set(ix[2]!, { table: ix[3]!, unique: Boolean(ix[1]), columns: squash(ix[4]!).toLowerCase(), where: ix[5] ? squash(ix[5]) : null });
  }
  return schema;
}

function sqliteSchema(): Schema {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  try {
    const rows = db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as Array<{ sql: string }>;
    return parseSchema(rows.map((r) => stripSql(r.sql)));
  } finally {
    db.close();
  }
}

function postgresStatements(path: URL = BASELINE_PATH): string[] {
  // Los bloques DO $$ … $$ (comprobaciones previas con RAISE) no son DDL del esquema: se quitan antes de partir por `;`.
  return stripSql(readFileSync(path, 'utf8'))
    .replace(/DO\s+\$\$[\s\S]*?\$\$\s*;?/gi, '')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
const postgresSchema = (): Schema => parseSchema([...postgresStatements(), ...postgresStatements(REVISION_PATH), ...postgresStatements(USERNAME_PATH), ...postgresStatements(MICROCHIP_PATH), ...postgresStatements(RATE_SCOPE_PATH), ...postgresStatements(MEDIA_PATH)]);

const expectedPgType = (column: string, sqliteType: string): string =>
  column === 'data' ? 'JSONB' : SMALLINT_FLAGS.has(column) ? 'SMALLINT' : sqliteType;

describe('paridad estática 0001_baseline.sql + 0002 vs SQLite final (REQ-PG-003, REQ-MIG-001)', () => {
  const sqlite = sqliteSchema();

  it('la lista canónica de tablas coincide en ambos esquemas', () => {
    expect([...sqlite.tables.keys()].sort()).toEqual(CANONICAL_TABLES);
    expect([...postgresSchema().tables.keys()].sort()).toEqual(CANONICAL_TABLES);
  });

  it('cada tabla tiene las mismas columnas, tipos mapeados, nulabilidad, defectos, UNIQUE, cascadas y clave primaria', () => {
    const pg = postgresSchema();
    for (const [name, lite] of sqlite.tables) {
      const target = pg.tables.get(name);
      expect(pg.tables.has(name), `tabla ${name} ausente en 0001`).toBe(true);
      expect([...target!.columns.keys()].sort(), `columnas de ${name}`).toEqual([...lite.columns.keys()].sort());
      expect([...target!.primaryKey].sort(), `clave primaria de ${name}`).toEqual([...lite.primaryKey].sort());
      for (const [col, def] of lite.columns) {
        const got = target!.columns.get(col)!;
        const where = `${name}.${col}`;
        expect(got.type, `tipo de ${where}`).toBe(expectedPgType(col, def.type));
        expect(got.notNull, `NOT NULL de ${where}`).toBe(def.notNull);
        expect(got.unique, `UNIQUE de ${where}`).toBe(def.unique);
        expect(got.references, `REFERENCES de ${where}`).toBe(def.references);
        expect(got.generated, `columna generada ${where}`).toBe(def.generated);
        if (name !== 'schema_migrations') expect(got.default, `DEFAULT de ${where}`).toBe(def.default);
      }
    }
  });

  it('los CHECK de cada tabla son los mismos (especies, microchip, flags, roles, estados, hashes, MIGRATION)', () => {
    const pg = postgresSchema();
    for (const [name, lite] of sqlite.tables) expect(pg.tables.get(name)!.checks, `CHECK de ${name}`).toEqual(lite.checks);
    expect(sqlite.tables.get('pets')!.checks.some((c) => c.includes("microchip_id ~ '^[0-9]{15}$'"))).toBe(true);
    expect(sqlite.tables.get('weights')!.checks).toContain('weight_grams BETWEEN 1 AND 150000');
  });

  it('[T555] la lista canónica de índices coincide con la de ambos esquemas (sin pets_owner_microchip; con users_username_lower y pets_microchip_global)', () => {
    expect([...sqlite.indexes.keys()].sort()).toEqual(CANONICAL_INDEXES);
    expect([...postgresSchema().indexes.keys()].sort()).toEqual(CANONICAL_INDEXES);
    expect(sqlite.indexes.get('users_username_lower')).toMatchObject({ table: 'users', unique: true, columns: 'lower(username)', where: null });
    expect(sqlite.indexes.get('household_invitations_one_open')).toMatchObject({ unique: true, columns: 'household_id,lower(invitee_username)', where: "status = 'INVITED'" });
  });

  it('los índices, únicos y parciales incluidos, son los mismos', () => {
    const pg = postgresSchema();
    expect([...pg.indexes.keys()].sort()).toEqual([...sqlite.indexes.keys()].sort());
    for (const [name, ix] of sqlite.indexes) expect(pg.indexes.get(name), `índice ${name}`).toEqual(ix);
    expect(pg.indexes.get('pets_microchip_global')).toMatchObject({ unique: true, columns: 'microchip_id', where: 'microchip_id IS NOT NULL' });
    expect(pg.indexes.has('pets_owner_microchip')).toBe(false);
    expect(sqlite.indexes.has('pets_owner_microchip')).toBe(false);
    expect(pg.indexes.get('household_members_one_owner')).toMatchObject({ unique: true });
  });

  it('[T540][REQ-BOR-005][INV-REG-003] las 6 tablas de registros tienen revision INTEGER NOT NULL DEFAULT 0 en ambos motores y ninguna tiene columnas ni índices de borrado lógico (D-11 A)', () => {
    const six = ['weights', 'body_measurements', 'vaccinations', 'dewormings', 'medical_visits', 'custom_parameters'];
    const pg = postgresSchema();
    for (const schema of [sqlite, pg]) {
      for (const table of six) {
        expect(schema.tables.get(table)!.columns.get('revision'), `revision de ${table}`).toMatchObject({ type: 'INTEGER', notNull: true, default: '0', generated: false });
        const names = [...schema.tables.get(table)!.columns.keys()];
        expect(names.filter((n) => /deleted/i.test(n)), `borrado lógico en ${table}`).toEqual([]);
      }
      expect([...schema.indexes.entries()].filter(([name, ix]) => /deleted/i.test(name + ix.columns + (ix.where ?? ''))).map(([name]) => name)).toEqual([]);
      for (const [name, table] of schema.tables) if (!six.includes(name)) expect(table.columns.has('revision'), `revision en ${name}`).toBe(false);
    }
  });

  it('el SQL es PostgreSQL puro: sin STRICT, json_extract, PRAGMA ni GLOB; datos JSONB', () => {
    const sql = stripSql(readFileSync(BASELINE_PATH, 'utf8') + readFileSync(REVISION_PATH, 'utf8') + readFileSync(USERNAME_PATH, 'utf8') + readFileSync(MICROCHIP_PATH, 'utf8') + readFileSync(RATE_SCOPE_PATH, 'utf8') + readFileSync(MEDIA_PATH, 'utf8'));
    for (const banned of [/\bSTRICT\b/i, /json_extract/i, /\bPRAGMA\b/i, /\bGLOB\b/i, /strftime/i, /\bAUTOINCREMENT\b/i]) {
      expect(sql).not.toMatch(banned);
    }
    expect(sql).toMatch(/data JSONB NOT NULL/);
  });

  it('schema_migrations queda con una sola fila (0001_baseline) y audit_log con una sola fila MIGRATION (D-20, REQ-MIG-001)', () => {
    const statements = postgresStatements();
    const migrationsInserts = statements.filter((s) => /^INSERT INTO schema_migrations\b/i.test(s));
    expect(migrationsInserts).toHaveLength(1);
    expect(migrationsInserts[0]).toContain("'0001_baseline'");
    const auditInserts = statements.filter((s) => /^INSERT INTO audit_log\b/i.test(s));
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0]).toMatch(/'MIGRATION'/);
    expect(auditInserts[0]).toMatch(/'SYSTEM'/);
    expect(statements.filter((s) => /^(INSERT|UPDATE|DELETE)\b/i.test(s))).toHaveLength(2);
  });

  it('audit_log no tiene claves foráneas (REQ-AUD-001) y pet_assignments.assigned_by_user_id tampoco', () => {
    const pg = postgresSchema();
    for (const col of pg.tables.get('audit_log')!.columns.values()) expect(col.references).toBeNull();
    expect(pg.tables.get('pet_assignments')!.columns.get('assigned_by_user_id')!.references).toBeNull();
  });
});

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_DATABASE_URL)(
  'paridad viva contra PostgreSQL (SE OMITE: falta la variable TEST_DATABASE_URL; levanta docker-compose.test.yml y defínela)',
  () => {
    it('0001_baseline.sql se aplica en un esquema vacío y expone las mismas tablas y columnas que SQLite', async () => {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: TEST_DATABASE_URL });
      await client.connect();
      const schemaName = `argos_parity_${process.pid}`;
      try {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
        await client.query(`CREATE SCHEMA ${schemaName}`);
        await client.query(`SET search_path TO ${schemaName}`);
        await client.query(readFileSync(BASELINE_PATH, 'utf8'));
        await client.query(readFileSync(REVISION_PATH, 'utf8'));
        await client.query(readFileSync(USERNAME_PATH, 'utf8'));
        await client.query(readFileSync(MICROCHIP_PATH, 'utf8'));
        await client.query(readFileSync(RATE_SCOPE_PATH, 'utf8'));
        await client.query(readFileSync(MEDIA_PATH, 'utf8'));
        const { rows } = await client.query<{ table_name: string; column_name: string; is_nullable: string }>(
          'SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = $1',
          [schemaName],
        );
        const live = new Map<string, Map<string, boolean>>();
        for (const r of rows) {
          if (!live.has(r.table_name)) live.set(r.table_name, new Map());
          live.get(r.table_name)!.set(r.column_name, r.is_nullable === 'NO');
        }
        expect([...live.keys()].sort()).toEqual(CANONICAL_TABLES);
        for (const [name, lite] of sqliteSchema().tables) {
          const cols = live.get(name)!;
          expect([...cols.keys()].sort(), `columnas vivas de ${name}`).toEqual([...lite.columns.keys()].sort());
          for (const [col, def] of lite.columns) expect(cols.get(col), `NOT NULL vivo de ${name}.${col}`).toBe(def.notNull);
        }
        const versions = await client.query('SELECT version FROM schema_migrations');
        expect(versions.rows).toEqual([{ version: '0001_baseline' }]);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
        await client.end();
      }
    });
  },
);
