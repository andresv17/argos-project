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
/** T711 (005): la 0007 de Postgres equivale a la 0011 de SQLite (`platform_parameters`, REQ-PRM-001, siembra `album.max_photos_per_pet = 10`). */
const PLATFORM_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0007_platform_parameters.sql', import.meta.url);

/** T766 (005): la 0008 de Postgres equivale a la 0012 de SQLite (`share_links` y `share_link_audit`, REQ-VET-003..005, REQ-VET-010, REQ-VET-013). */
const SHARE_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0008_share_links.sql', import.meta.url);
/** T809..T833 (006): la 0009 de Postgres equivale a la 0013 de SQLite (CHECK de `audit_log.entity_type` y las 6 tablas de la escena con sus índices). */
const HOME_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0009_home_scenes.sql', import.meta.url);
/** T1017 (007): la 0010 de Postgres equivale a la 0014 de SQLite (`life_status`, `deceased_at` y `version` de `pets`, REQ-FAL7-001, EDGE-007-009). */
const LIFE_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0010_pet_life_status.sql', import.meta.url);

/** T1026 (007): la 0011 de Postgres equivale a la 0015 de SQLite (`share_links.include_deceased_at`, opt-in de `deceasedAt`, SC-007-016). */
const DECEASED_LINK_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0011_share_link_deceased_at.sql', import.meta.url);

/** T1180 (008, #21): la 0012 de Postgres equivale a la 0016 de SQLite (`pets.biography` anulable, 0..280 caracteres, REQ-BIO8-004). */
const BIOGRAPHY_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0012_pet_biography.sql', import.meta.url);

/** T1116 (008, #16): la 0013 de Postgres equivale a la 0017 de SQLite (`users.email_verified_at`, `auth_identities`, `oauth_flow_states`, REQ-SSO8-001, REQ-SSO8-003, REQ-SSO8-004, EDGE-008-036). */
const GOOGLE_SSO_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0013_google_sso.sql', import.meta.url);

/** T1219 (009, deuda #17): la 0014 de Postgres equivale a la 0018 de SQLite (`oauth_flow_states` admite la intención `DELETE`, REQ-DEL9-001, INV-DEL9-001). */
const DELETE_INTENT_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0014_oauth_flow_delete_intent.sql', import.meta.url);

/** T1232 (009, Fase 3, #19): la 0015 de Postgres equivale a la 0019 de SQLite (`admin_identities`, `admin_sessions`, `admin_oauth_flow_states`, `admin_audit_entries`, REQ-ADM9-002..006). */
const ADMIN_PORTAL_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0015_admin_portal.sql', import.meta.url);

/** T1243 (009, Fase 4, #18): la 0016 de Postgres equivale a la 0020 de SQLite (`users.account_status`, `decided_at`, `decided_by`, REQ-APR9-004, STATE-ACCT9-001). */
const PROVIDER_CALL_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0019_scene_attempts_provider_call.sql', import.meta.url);
/** T1321 (006, enmienda N2 REQ-ESC6-035): la 0020 de Postgres equivale a la 0024 de SQLite (`home_scenes.image_mime` admite `image/jpeg`). */
const IMAGE_MIME_JPEG_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0020_home_scenes_image_mime_jpeg.sql', import.meta.url);
/** T1315 (009, Fase 5d, D9-31): la 0022 de Postgres equivale a la 0026 de SQLite (`home_scenes.limits_reset_at` y la tabla `scene_actor_limit_marks`). */
const LIMITS_RESET_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0022_scene_limits_reset.sql', import.meta.url);
/** T1423 (010, Bloque D, #75): la 0024 de Postgres equivale a la 0028 de SQLite (`users.adult_declared_at` y `adult_notice_version`, anulables, REQ-MEN10-001, REQ-MEN10-002). */
const ADULT_DECLARATION_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0024_adult_declaration.sql', import.meta.url);
/** T1429 (010, Bloque E, #33): la 0025 de Postgres equivale a la 0029 de SQLite (tabla singleton `about_content`, REQ-ACE10-004). */
const ABOUT_CONTENT_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0025_about_content.sql', import.meta.url);
/** T1527 (011, Bloque D, #63): la 0027 de Postgres equivale a la 0031 de SQLite (tabla `admin_delegates`, REQ-ADM11-001, ORA-1 b). */
const ADMIN_DELEGATES_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0027_admin_delegates.sql', import.meta.url);
/** T1556 (011, Bloque I, #78): la 0028 de Postgres equivale a la 0032 de SQLite (`users.avatar_version` y `users.avatar_object_id`, REQ-PRF11-001). */
/** T1613 (012, Bloque A, #22): la 0029 de Postgres equivale a la 0033 de SQLite (`pets.ownership_version`, `pet_co_owners`, `owner_requests` y `pet_assignments.assigned_by_user_id` NULLable con FK SET NULL, REQ-OWN12-001, REQ-OWN12-007). */
const CO_OWNERSHIP_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0029_co_ownership.sql', import.meta.url);
/** T1616 (012, Bloque A, #22): la 0030 de Postgres equivale a la 0034 de SQLite (el CHECK de `audit_log.mutation_type` admite los tipos de auditoría de la co-propiedad, REQ-AUD-001). */
const CO_OWNERSHIP_AUDIT_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0030_co_ownership_audit.sql', import.meta.url);
/** B-4 (012, Bloque B, #22): la 0031 de Postgres equivale a la 0035 de SQLite (el CHECK de `rate_limit_events.scope` admite CO_OWNER_INVITE y OWNER_REQUEST, H-02 y H-10). */
const CO_OWNERSHIP_RATE_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0031_co_ownership_rate_limit_scopes.sql', import.meta.url);
const USER_AVATAR_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0028_user_avatar.sql', import.meta.url);
const ACCOUNT_STATUS_PATH = new URL('../../../src/infrastructure/persistence/postgres/migrations/0016_account_status.sql', import.meta.url);

/** Lista canónica independiente de ambos esquemas (data-model.md §2). */
const CANONICAL_TABLES = [
  'about_content', 'admin_audit_entries', 'admin_delegates', 'admin_identities', 'admin_oauth_flow_states', 'admin_sessions', 'audit_log', 'auth_identities', 'backup_confirmation_tokens', 'body_measurements', 'custom_parameters', 'dewormings', 'home_scenes', 'household_invitations',
  'household_members', 'household_photos', 'households', 'login_attempts', 'media_deletion_queue', 'medical_visits', 'oauth_flow_states', 'owner_requests', 'pet_assignments', 'pet_co_owners', 'pet_media', 'pets', 'platform_parameters', 'rate_limit_events',
  'scene_actor_limit_marks', 'scene_attempts', 'scene_consents', 'scene_image_sources', 'scene_quota_carry', 'schema_migrations', 'sessions', 'share_link_audit', 'share_links', 'users', 'vaccinations', 'weights',
];

/** Lista canónica de índices del esquema final (T555, 004): los que añaden las migraciones 0007/0008 (SQLite) y 0003/0004 (Postgres) y los de la 002. */
const CANONICAL_INDEXES = [
  'admin_audit_entries_admin_occurred', 'admin_delegates_active_subject', 'admin_delegates_email', 'admin_delegates_live_email', 'admin_delegates_status', 'admin_identities_email', 'admin_identities_subject', 'admin_oauth_flow_states_expires', 'admin_sessions_admin_id', 'admin_sessions_created', 'audit_log_entity_id', 'audit_log_executor_user_id', 'audit_log_timestamp', 'auth_identities_user_id', 'body_measurements_pet_id', 'custom_parameters_pet_id', 'dewormings_pet_id',
  'home_scenes_household', 'home_scenes_owner', 'household_invitations_household_id', 'household_invitations_invitee_user_id', 'household_invitations_one_open', 'household_members_household_id',
  'household_members_one_open_per_user', 'household_members_one_owner', 'household_members_user_id', 'medical_visits_pet_id', 'oauth_flow_states_expires', 'oauth_flow_states_user_id', 'owner_requests_absence_anchor', 'owner_requests_chip_reserve', 'owner_requests_claim_pending', 'owner_requests_cooldown', 'owner_requests_dispute_chip_open', 'owner_requests_one_live_action', 'owner_requests_pet_status', 'pet_assignments_household_id', 'pet_co_owners_live', 'pet_co_owners_pet_status', 'pet_co_owners_user_status',
  'pet_media_pet_created', 'pets_microchip_global', 'pets_owner_user_id', 'rate_limit_events_subject', 'scene_attempts_actor_started', 'scene_attempts_idempotency',
  'scene_attempts_scene_started', 'scene_consents_active', 'sessions_user_id', 'share_link_audit_actor', 'share_link_audit_failure_window',
  'share_link_audit_occurred', 'share_links_created_by', 'share_links_expires', 'share_links_household_active', 'share_links_pet_active', 'share_links_revoked', 'users_email_verified_unique', 'users_username_lower', 'vaccinations_pet_id', 'weights_pet_id',
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
    // T766: la restricción UNIQUE de tabla (`UNIQUE (created_by_user_id, idempotency_key)`) se compara como un CHECK más (mismo texto en ambos motores).
    const unique = /^UNIQUE \(([^)]*)\)$/i.exec(item);
    if (unique) {
      table.checks.push(`UNIQUE(${unique[1]!.split(',').map((c) => c.trim()).join(',')})`);
      continue;
    }
    const m = /^(\w+) (\w+)(.*)$/.exec(item);
    if (!m) throw new Error(`Definición no reconocida en ${name}: ${item}`);
    const tail = m[3]!;
    const references = /REFERENCES (\w+) ?\((\w+)\)( ON DELETE (CASCADE|SET NULL))?/i.exec(tail);
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
    const alter = /^ALTER TABLE (\w+) ADD COLUMN (?:IF NOT EXISTS )?([\s\S]+)$/i.exec(stmt.trim());
    if (alter) {
      const added = parseCreateTable(alter[1]!, alter[2]!);
      for (const [name, column] of added.columns) schema.tables.get(alter[1]!)!.columns.set(name, column);
      continue;
    }
    // Postgres nombra el CHECK de columna `<tabla>_<columna>_check`: DROP lo retira y ADD CONSTRAINT … CHECK pone el nuevo (0006).
    const dropCheck = /^ALTER TABLE (\w+) DROP CONSTRAINT (\w+)_check$/i.exec(stmt.trim());
    if (dropCheck) {
      const table = schema.tables.get(dropCheck[1]!)!;
      const column = dropCheck[2]!.slice(dropCheck[1]!.length + 1); // `<tabla>_<columna>_check`: la columna puede llevar guion bajo (entity_type)
      table.checks = table.checks.filter((c) => !c.startsWith(`${column} IN `));
      continue;
    }
    const addCheck = /^ALTER TABLE (\w+) ADD CONSTRAINT \w+ (CHECK[\s\S]+)$/i.exec(stmt.trim());
    if (addCheck) {
      const table = schema.tables.get(addCheck[1]!)!;
      table.checks.push(...extractChecks(addCheck[2]!).checks);
      table.checks.sort();
      continue;
    }
    // T1613 (012): `ALTER COLUMN … DROP NOT NULL` y `ADD CONSTRAINT … FOREIGN KEY (col) REFERENCES t (c) ON DELETE X [NOT VALID]` (Postgres) equivalen a la columna reconstruida de SQLite.
    const dropNotNull = /^ALTER TABLE (\w+) ALTER COLUMN (\w+) DROP NOT NULL$/i.exec(stmt.trim());
    if (dropNotNull) {
      schema.tables.get(dropNotNull[1]!)!.columns.get(dropNotNull[2]!)!.notNull = false;
      continue;
    }
    const addFk = /^ALTER TABLE (\w+) ADD CONSTRAINT \w+ FOREIGN KEY \((\w+)\) REFERENCES (\w+) ?\((\w+)\) ON DELETE (CASCADE|SET NULL)(?: NOT VALID)?$/i.exec(stmt.trim());
    if (addFk) {
      schema.tables.get(addFk[1]!)!.columns.get(addFk[2]!)!.references = `${addFk[3]}(${addFk[4]}) ON DELETE ${addFk[5]!.toUpperCase()}`;
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
const postgresSchema = (extra: URL[] = []): Schema => parseSchema([...postgresStatements(), ...postgresStatements(REVISION_PATH), ...postgresStatements(USERNAME_PATH), ...postgresStatements(MICROCHIP_PATH), ...postgresStatements(RATE_SCOPE_PATH), ...postgresStatements(MEDIA_PATH), ...postgresStatements(PLATFORM_PATH), ...postgresStatements(SHARE_PATH), ...postgresStatements(HOME_PATH), ...postgresStatements(LIFE_PATH), ...postgresStatements(DECEASED_LINK_PATH), ...postgresStatements(BIOGRAPHY_PATH), ...postgresStatements(GOOGLE_SSO_PATH), ...postgresStatements(DELETE_INTENT_PATH), ...postgresStatements(ADMIN_PORTAL_PATH), ...postgresStatements(ACCOUNT_STATUS_PATH), ...postgresStatements(PROVIDER_CALL_PATH), ...postgresStatements(IMAGE_MIME_JPEG_PATH), ...postgresStatements(LIMITS_RESET_PATH), ...postgresStatements(ADULT_DECLARATION_PATH), ...postgresStatements(ABOUT_CONTENT_PATH), ...postgresStatements(ADMIN_DELEGATES_PATH), ...postgresStatements(USER_AVATAR_PATH), ...postgresStatements(CO_OWNERSHIP_PATH), ...postgresStatements(CO_OWNERSHIP_AUDIT_PATH), ...postgresStatements(CO_OWNERSHIP_RATE_PATH), ...extra.flatMap((path) => postgresStatements(path))]);

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

  it('[T1017][REQ-FAL7-001][REQ-FAL7-002][EDGE-007-009] pets gana life_status, deceased_at y version en ambos motores, con los mismos CHECK y por defecto ALIVE, sin fecha y versión 1', () => {
    const pg = postgresSchema();
    for (const schema of [sqlite, pg]) {
      const pets = schema.tables.get('pets')!;
      expect(pets.columns.get('life_status'), 'life_status').toMatchObject({ type: 'TEXT', notNull: true, default: "'ALIVE'" });
      expect(pets.columns.get('deceased_at'), 'deceased_at').toMatchObject({ type: 'TEXT', notNull: false, default: null });
      expect(pets.columns.get('version'), 'version').toMatchObject({ type: 'INTEGER', notNull: true, default: '1' });
      expect(pets.checks).toContain("life_status IN ('ALIVE','DECEASED')");
      expect(pets.checks).toContain("(life_status = 'DECEASED') = (deceased_at IS NOT NULL)");
      expect(pets.checks).toContain('version >= 1');
    }
    expect(pg.tables.get('pets')!.checks).toEqual(sqlite.tables.get('pets')!.checks);
  });

  it('[GH:#21][T1180][REQ-BIO8-004] pets gana biography anulable en ambos motores, sin valor por defecto y con el mismo CHECK de 280 caracteres; la 0012 lo agrega NOT VALID y lo valida; las filas previas quedan NULL', () => {
    const pg = postgresSchema();
    for (const schema of [sqlite, pg]) {
      const pets = schema.tables.get('pets')!;
      expect(pets.columns.get('biography'), 'biography').toMatchObject({ type: 'TEXT', notNull: false, default: null });
      expect(pets.checks).toContain('biography IS NULL OR length(biography) <= 280');
    }
    expect(pg.tables.get('pets')!.checks).toEqual(sqlite.tables.get('pets')!.checks);
    const text = readFileSync(BIOGRAPHY_PATH, 'utf8');
    expect(text).toMatch(/ADD CONSTRAINT pets_biography_check CHECK[^;]+NOT VALID;/);
    expect(text).toContain('VALIDATE CONSTRAINT pets_biography_check;');
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    try {
      db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'ana', 'x', '{}')").run();
      db.prepare("INSERT INTO pets (id, owner_user_id, data) VALUES ('p1', 'u1', '{}')").run();
      expect(db.prepare('SELECT biography FROM pets').get()).toEqual({ biography: null });
      db.prepare("UPDATE pets SET biography = ? WHERE id = 'p1'").run('a'.repeat(280));
      expect(() => db.prepare("UPDATE pets SET biography = ? WHERE id = 'p1'").run('a'.repeat(281))).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  it('[GH:#16][T1116][REQ-SSO8-001][REQ-SSO8-003] users gana email_verified_at anulable y auth_identities / oauth_flow_states existen con las mismas columnas, CHECK, claves y cascadas en ambos motores', () => {
    const pg = postgresSchema();
    for (const schema of [sqlite, pg]) {
      expect(schema.tables.get('users')!.columns.get('email_verified_at'), 'email_verified_at').toMatchObject({ type: 'TEXT', notNull: false, default: null, references: null });
      const identities = schema.tables.get('auth_identities')!;
      expect([...identities.columns.keys()].sort()).toEqual(['created_at', 'provider', 'provider_subject', 'user_id']);
      expect([...identities.primaryKey].sort()).toEqual(['provider', 'provider_subject']);
      expect(identities.columns.get('user_id')).toMatchObject({ notNull: true, references: 'users(id) ON DELETE CASCADE' });
      expect(identities.checks).toContain("provider IN ('GOOGLE')");
      const flow = schema.tables.get('oauth_flow_states')!;
      expect(flow.primaryKey).toEqual(['token_hash']);
      expect(flow.columns.get('user_id')).toMatchObject({ notNull: false, references: 'users(id) ON DELETE CASCADE' });
      for (const column of ['state', 'nonce', 'code_verifier', 'pending_subject', 'pending_email', 'consumed_at']) expect(flow.columns.get(column), column).toMatchObject({ notNull: false });
      for (const column of ['phase', 'intent', 'created_at', 'expires_at']) expect(flow.columns.get(column), column).toMatchObject({ notNull: true });
      expect(flow.checks).toContain("phase IN ('AUTHORIZATION','USERNAME')");
      // T1219 (009): la intención DELETE amplía el CHECK de `intent` y comparte con LINK el usuario y la sesión de origen.
      expect(flow.checks).toContain("intent IN ('LOGIN','LINK','DELETE')");
      expect(flow.checks).toContain('length(token_hash) = 64');
      // [REQ-VIN8-004] [INV-VIN8-005] el hash de la sesión de origen: anulable, sin clave foránea, 64 caracteres y obligatorio solo en LINK.
      expect(flow.columns.get('origin_session_hash'), 'origin_session_hash').toMatchObject({ type: 'TEXT', notNull: false, default: null, references: null });
      expect(flow.checks).toContain('origin_session_hash IS NULL OR length(origin_session_hash) = 64');
      expect(flow.checks).toContain("(intent IN ('LINK','DELETE')) = (origin_session_hash IS NOT NULL)");
      expect(flow.checks).toContain("(intent IN ('LINK','DELETE')) = (user_id IS NOT NULL)");
    }
    expect(pg.tables.get('auth_identities')!.checks).toEqual(sqlite.tables.get('auth_identities')!.checks);
    expect(pg.tables.get('oauth_flow_states')!.checks).toEqual(sqlite.tables.get('oauth_flow_states')!.checks);
    expect(sqlite.indexes.get('users_email_verified_unique')).toMatchObject({ table: 'users', unique: true, columns: 'lower(email)', where: 'email_verified_at IS NOT NULL' });
    expect(pg.indexes.get('users_email_verified_unique')).toEqual(sqlite.indexes.get('users_email_verified_unique'));
  });

  it('[T1017][REQ-FAL7-001] la 0010 de Postgres agrega los CHECK NOT VALID y los valida; la 0014 de SQLite deja las filas previas ALIVE, sin fecha y en versión 1', () => {
    const text = readFileSync(LIFE_PATH, 'utf8');
    for (const name of ['pets_life_status_check', 'pets_deceased_at_check', 'pets_version_check']) {
      expect(text, name).toMatch(new RegExp(`ADD CONSTRAINT ${name} CHECK[^;]+NOT VALID;`));
      expect(text, name).toContain(`VALIDATE CONSTRAINT ${name};`);
    }
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    try {
      db.prepare("INSERT INTO users (id, username, password_hash, data) VALUES ('u1', 'ana', 'x', '{}')").run();
      db.prepare("INSERT INTO pets (id, owner_user_id, data) VALUES ('p1', 'u1', '{}')").run();
      expect(db.prepare('SELECT life_status, deceased_at, version FROM pets').get()).toEqual({ life_status: 'ALIVE', deceased_at: null, version: 1 });
      expect(() => db.prepare("UPDATE pets SET life_status = 'DECEASED' WHERE id = 'p1'").run()).toThrow(/CHECK/);
      expect(() => db.prepare("UPDATE pets SET deceased_at = '2026-01-01' WHERE id = 'p1'").run()).toThrow(/CHECK/);
      expect(() => db.prepare("UPDATE pets SET life_status = 'GONE' WHERE id = 'p1'").run()).toThrow(/CHECK/);
      expect(() => db.prepare("UPDATE pets SET version = 0 WHERE id = 'p1'").run()).toThrow(/CHECK/);
      db.prepare("UPDATE pets SET life_status = 'DECEASED', deceased_at = '2026-01-01' WHERE id = 'p1'").run();
      expect(db.prepare('SELECT life_status, deceased_at FROM pets').get()).toEqual({ life_status: 'DECEASED', deceased_at: '2026-01-01' });
    } finally {
      db.close();
    }
  });

  it('T809 (006, N2-06 (a)): el CHECK de audit_log.entity_type admite HOME_SCENE, SCENE_CONSENT y HOUSEHOLD_PHOTO en ambos motores y es el mismo', () => {
    const pg = postgresSchema([HOME_PATH]);
    const liteChecks = sqlite.tables.get('audit_log')!.checks;
    const pgChecks = pg.tables.get('audit_log')!.checks;
    expect(pgChecks).toEqual(liteChecks);
    const entityCheck = liteChecks.find((c) => c.startsWith('entity_type IN '))!;
    for (const value of ['HOME_SCENE', 'SCENE_CONSENT', 'HOUSEHOLD_PHOTO', 'PET_MEDIA']) expect(entityCheck, value).toContain(`'${value}'`);
  });

  it('T831 (006): las 6 tablas de la escena existen en ambos motores con las mismas columnas y los mismos CHECK; image_mime PNG/WebP/JPEG', () => {
    const pg = postgresSchema(); // HOME_PATH ya está en la base; reaplicarlo al final pisaría el CHECK ampliado por la 0020 (T1321)
    const scene = ['home_scenes', 'scene_attempts', 'scene_image_sources', 'household_photos', 'scene_consents', 'scene_quota_carry'];
    for (const name of scene) {
      expect(pg.tables.has(name), `Postgres ${name}`).toBe(true);
      expect(sqlite.tables.has(name), `SQLite ${name}`).toBe(true);
      expect(pg.tables.get(name)!.checks, `CHECK de ${name}`).toEqual(sqlite.tables.get(name)!.checks);
    }
    expect(sqlite.tables.get('home_scenes')!.checks).toContain("image_mime IN ('image/png','image/webp','image/jpeg')");
    expect(pg.tables.get('home_scenes')!.checks).toContain("image_mime IN ('image/png','image/webp','image/jpeg')");
    expect(sqlite.tables.get('home_scenes')!.checks.filter((c) => c.startsWith('image_mime IN '))).toHaveLength(1);
    expect(sqlite.tables.get('scene_attempts')!.checks).toContain("phase IN ('PENDING','RUNNING','DONE')");
    expect(sqlite.tables.get('scene_attempts')!.checks).toContain("outcome IS NULL OR outcome IN ('SUCCEEDED','FAILED','CANCELLED')");
    expect(sqlite.indexes.get('scene_attempts_idempotency')).toMatchObject({ table: 'scene_attempts', unique: true, columns: 'idempotency_key_hash', where: 'idempotency_key_hash IS NOT NULL' });
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
    const sql = stripSql(readFileSync(BASELINE_PATH, 'utf8') + readFileSync(REVISION_PATH, 'utf8') + readFileSync(USERNAME_PATH, 'utf8') + readFileSync(MICROCHIP_PATH, 'utf8') + readFileSync(RATE_SCOPE_PATH, 'utf8') + readFileSync(MEDIA_PATH, 'utf8') + readFileSync(PLATFORM_PATH, 'utf8'));
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

  it('[T711][REQ-PRM-001][REQ-PRM-003] platform_parameters: mismas 5 columnas en ambos motores, clave primaria textual, sin FK, sin value_type/min_value/max_value (MIF-005-07)', () => {
    const pg = postgresSchema();
    for (const schema of [sqlite, pg]) {
      const table = schema.tables.get('platform_parameters')!;
      expect([...table.columns.keys()].sort()).toEqual(['description', 'key', 'updated_at', 'updated_by_user_id', 'value']);
      expect(table.primaryKey).toEqual(['key']);
      expect(table.columns.get('value')).toMatchObject({ type: 'TEXT', notNull: true, references: null });
      expect(table.columns.get('description')).toMatchObject({ type: 'TEXT', notNull: true });
      expect(table.columns.get('updated_at')).toMatchObject({ type: 'TEXT', notNull: true });
      expect(table.columns.get('updated_by_user_id')).toMatchObject({ type: 'TEXT', notNull: false, references: null });
      expect([...table.columns.values()].filter((c) => c.references !== null)).toEqual([]);
    }
  });

  it('[T711][REQ-PRM-001][SC-005-004] la siembra es la misma en ambos motores: una sola fila album.max_photos_per_pet = 10 sin autor', () => {
    const sql = stripSql(readFileSync(PLATFORM_PATH, 'utf8'));
    const inserts = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter((s) => /^INSERT INTO platform_parameters\b/i.test(s));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("'album.max_photos_per_pet'");
    expect(inserts[0]).toContain("'10'");
    expect(inserts[0]).toContain("'Máximo de fotos de álbum por mascota'");
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    try {
      expect(db.prepare("SELECT key, value, description, updated_by_user_id FROM platform_parameters WHERE key = 'album.max_photos_per_pet'").all()).toEqual([
        { key: 'album.max_photos_per_pet', value: '10', description: 'Máximo de fotos de álbum por mascota', updated_by_user_id: null },
      ]);
    } finally {
      db.close();
    }
  });

  it('audit_log no tiene claves foráneas (REQ-AUD-001); pet_assignments.assigned_by_user_id gana FK SET NULL y es NULLable en ambos motores (T1613, REQ-OWN12-007)', () => {
    const pg = postgresSchema();
    for (const col of pg.tables.get('audit_log')!.columns.values()) expect(col.references).toBeNull();
    for (const schema of [sqlite, pg]) expect(schema.tables.get('pet_assignments')!.columns.get('assigned_by_user_id')).toMatchObject({ notNull: false, references: 'users(id) ON DELETE SET NULL' });
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
        await client.query(readFileSync(PLATFORM_PATH, 'utf8'));
        await client.query(readFileSync(SHARE_PATH, 'utf8'));
        await client.query(readFileSync(HOME_PATH, 'utf8'));
        await client.query(readFileSync(LIFE_PATH, 'utf8'));
        await client.query(readFileSync(DECEASED_LINK_PATH, 'utf8'));
        await client.query(readFileSync(BIOGRAPHY_PATH, 'utf8'));
        await client.query(readFileSync(GOOGLE_SSO_PATH, 'utf8'));
        await client.query(readFileSync(DELETE_INTENT_PATH, 'utf8'));
        await client.query(readFileSync(ADMIN_PORTAL_PATH, 'utf8'));
        await client.query(readFileSync(ACCOUNT_STATUS_PATH, 'utf8'));
        await client.query(readFileSync(PROVIDER_CALL_PATH, 'utf8'));
        await client.query(readFileSync(LIMITS_RESET_PATH, 'utf8'));
        await client.query(readFileSync(ADULT_DECLARATION_PATH, 'utf8'));
        await client.query(readFileSync(ABOUT_CONTENT_PATH, 'utf8'));
        await client.query(readFileSync(ADMIN_DELEGATES_PATH, 'utf8'));
        await client.query(readFileSync(USER_AVATAR_PATH, 'utf8'));
        await client.query(readFileSync(CO_OWNERSHIP_PATH, 'utf8'));
        await client.query(readFileSync(CO_OWNERSHIP_AUDIT_PATH, 'utf8'));
        await client.query(readFileSync(CO_OWNERSHIP_RATE_PATH, 'utf8'));
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
        const seeded = await client.query('SELECT key, value, description, updated_by_user_id FROM platform_parameters');
        expect(seeded.rows).toEqual([{ key: 'album.max_photos_per_pet', value: '10', description: 'Máximo de fotos de álbum por mascota', updated_by_user_id: null }]);
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
        await client.end();
      }
    });
  },
);
