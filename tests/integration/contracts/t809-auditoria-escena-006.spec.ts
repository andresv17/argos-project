/**
 * T809 (N2-06 (a), 006): pruebas de la enmienda MINOR del esquema de auditoría de 004: `entity_type` nuevos `HOME_SCENE`,
 * `SCENE_CONSENT` y `HOUSEHOLD_PHOTO` (REQ-ESC6-021, INV-ESC6-016, SC-ESC6-046, SC-ESC6-094).
 *  - contrato: `AuditEntityType` admite los 3 valores nuevos y sigue cerrado; `AuditMutationType` no cambia (CREATE, UPDATE, DELETE existentes);
 *  - generado: v31, v33 y v34 derivan los valores del compilador (INV-ARCH-003);
 *  - persistencia: el CHECK de `audit_log.entity_type` admite los 3 valores en SQLite (0013) y Postgres (0009) y conserva las filas.
 * El esquema de 002 NO cambia (INV-ARCH-003 de la 002).
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../../src/generated/v31/index.ts';
import { RepositoryAuditLogAdapter } from '../../../src/infrastructure/adapters/repository-audit-log.adapter.ts';
import { InMemoryUnitOfWork, emptyMemoryState } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { DEFAULT_MIGRATIONS_DIR, IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const SCHEMAS_004 = join(ROOT, 'specs/004-catalogos-registros-archivos/contracts/schemas');
const SCHEMA_002 = join(ROOT, 'specs/002-plataforma-v21/contracts/schemas/audit-entry.schema.json');
const BASE = 'https://argos.local/contracts/schemas';
const PG_DIR = new URL('../../../src/infrastructure/persistence/postgres/migrations/', import.meta.url);
const NEW_ENTITIES = ['HOME_SCENE', 'SCENE_CONSENT', 'HOUSEHOLD_PHOTO'] as const;
const PREVIOUS_ENTITIES = [
  'USER', 'PET', 'WEIGHT_RECORD', 'BODY_MEASUREMENT', 'VACCINATION_RECORD', 'DEWORMING_RECORD', 'APPOINTMENT_RECORD', 'CUSTOM_PARAMETER',
  'HOUSEHOLD', 'HOUSEHOLD_MEMBERSHIP', 'HOUSEHOLD_INVITATION', 'PET_ASSIGNMENT', 'PET_MEDIA', 'SYSTEM',
];
const MUTATIONS = ['CREATE', 'UPDATE', 'DELETE', 'ROLE_CHANGE', 'ASSIGN', 'UNASSIGN', 'OWNERSHIP_TRANSFER', 'IMPORT', 'MIGRATION', 'ACCOUNT_DELETE'];
const UUID = '0b6f3c2e-8a4d-4c1b-9e3f-1a2b3c4d5e6f';
const HEX = 'a'.repeat(64);
const TS = '2026-11-18T10:00:00.000Z';

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: true, strictTypes: true, allowUnionTypes: true, allErrors: true, multipleOfPrecision: 10 });
  addFormats(ajv);
  for (const keyword of ['x-sdd-metadata', 'x-sdd-status', 'x-sdd-error', '$anchor']) ajv.addKeyword(keyword);
  for (const file of readdirSync(SCHEMAS_004).filter((f) => f.endsWith('.schema.json')).sort()) {
    const doc = JSON.parse(readFileSync(join(SCHEMAS_004, file), 'utf8')) as { $id: string };
    ajv.addSchema(doc, doc.$id);
  }
  return ajv;
}
const ajv = buildAjv();
const check = (def: string): ValidateFunction => {
  const fn = ajv.getSchema(`${BASE}/audit-entry.schema.json#/$defs/${def}`);
  if (!fn) throw new Error(`def ausente audit-entry#${def}`);
  return fn;
};
const entry = (entityType: string, mutationType: string, extra: Record<string, unknown> = {}) => ({
  id: UUID, timestamp: TS, executorUserId: UUID, mutationType, entityType, entityId: HEX, previousStateHash: null, newStateHash: HEX, ...extra,
});

describe('T809 contrato de auditoría 004 (3.2.0): entity_type de la escena', () => {
  it('REQ-ESC6-021: AuditEntityType admite HOME_SCENE, SCENE_CONSENT y HOUSEHOLD_PHOTO y conserva los 14 valores previos', () => {
    const type = check('AuditEntityType');
    for (const value of [...PREVIOUS_ENTITIES, ...NEW_ENTITIES]) expect(type(value), value).toBe(true);
    expect(type('HOME_SCENE_IMAGE')).toBe(false);
    expect(type('SCENE_ATTEMPT')).toBe(false);
    expect(type('home_scene')).toBe(false);
  });

  it('REQ-ESC6-021: la lista de entidades es exactamente los 14 valores de 3.1.0 más los 3 nuevos, en ese orden', () => {
    const doc = JSON.parse(readFileSync(join(SCHEMAS_004, 'audit-entry.schema.json'), 'utf8')) as { $defs: { AuditEntityType: { enum: string[] } } };
    expect(doc.$defs.AuditEntityType.enum).toEqual([...PREVIOUS_ENTITIES.slice(0, 13), ...NEW_ENTITIES, 'SYSTEM']);
  });

  it('REQ-ESC6-021: AuditMutationType no cambia (mapeo a CREATE, UPDATE y DELETE existentes)', () => {
    const doc = JSON.parse(readFileSync(join(SCHEMAS_004, 'audit-entry.schema.json'), 'utf8')) as { $defs: { AuditMutationType: { enum: string[] } } };
    expect(doc.$defs.AuditMutationType.enum).toEqual(MUTATIONS);
  });

  it('INV-ESC6-016: una fila de auditoría de la escena valida con CREATE, UPDATE y DELETE y no admite campos de detalle abiertos', () => {
    const valid = check('AuditEntry');
    for (const entityType of NEW_ENTITIES) {
      expect(valid(entry(entityType, 'CREATE')), `${entityType} CREATE`).toBe(true);
      expect(valid(entry(entityType, 'UPDATE', { previousStateHash: HEX })), `${entityType} UPDATE`).toBe(true);
      expect(valid(entry(entityType, 'DELETE', { previousStateHash: HEX, newStateHash: null })), `${entityType} DELETE`).toBe(true);
    }
    expect(valid(entry('HOME_SCENE', 'CREATE', { prompt: 'x' }))).toBe(false);
    expect(valid(entry('HOME_SCENE', 'CREATE', { photoRef: 'households/x/photo/y' }))).toBe(false);
  });

  it('REQ-ESC6-021: x-sdd-metadata declara MINOR 3.2.0 con trazabilidad a REQ-ESC6-021 e INV-ESC6-016; la 002 no cambia', () => {
    const doc = JSON.parse(readFileSync(join(SCHEMAS_004, 'audit-entry.schema.json'), 'utf8')) as {
      'x-sdd-metadata': { version: string; change_type: string; change_note: string; traceability: string[] };
    };
    const meta = doc['x-sdd-metadata'];
    expect(meta.version).toBe('3.2.0');
    expect(meta.change_type).toBe('MINOR');
    expect(meta.change_note).toContain('HOME_SCENE');
    expect(meta.traceability).toEqual(expect.arrayContaining(['REQ-ESC6-021', 'INV-ESC6-016', 'REQ-AUD-001']));
    expect(readFileSync(SCHEMA_002, 'utf8')).not.toContain('HOME_SCENE');
  });
});

describe('T809 tipos y validadores generados (INV-ARCH-003)', () => {
  for (const dir of ['v31', 'v33', 'v34']) {
    it(`REQ-ESC6-021: src/generated/${dir} incluye los 3 valores en el tipo y en el validador`, () => {
      const types = readFileSync(join(ROOT, `src/generated/${dir}/schemas/types.ts`), 'utf8');
      const validators = readFileSync(join(ROOT, `src/generated/${dir}/schemas/validators.mjs`), 'utf8');
      for (const value of NEW_ENTITIES) {
        expect(types, `${dir} types ${value}`).toContain(`"${value}"`);
        expect(validators, `${dir} validators ${value}`).toContain(value);
      }
    });
  }

  it('INV-ARCH-003: la 002 (src/generated/schemas) no incluye los valores nuevos', () => {
    expect(readFileSync(join(ROOT, 'src/generated/schemas/types.ts'), 'utf8')).not.toContain('HOME_SCENE');
  });
});

describe('T809 puerto de auditoría con la entidad de la escena (REQ-AUD-001)', () => {
  it('REQ-ESC6-021: RepositoryAuditLogAdapter en memoria conserva una fila HOME_SCENE confirmada con su transacción', async () => {
    const uow = new InMemoryUnitOfWork(emptyMemoryState());
    const adapter = new RepositoryAuditLogAdapter();
    const rows = NEW_ENTITIES.map((entityType, i): AuditEntry => ({
      id: `a1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, timestamp: TS, executorUserId: UUID, mutationType: 'CREATE',
      entityType: entityType as AuditEntry['entityType'], entityId: HEX, previousStateHash: null, newStateHash: HEX,
    }));
    await uow.runInTransaction(async (r) => {
      for (const row of rows) await adapter.append(r, row);
    });
    expect((uow as unknown as { state: { auditLog: AuditEntry[] } }).state.auditLog.map((r) => r.entityType)).toEqual([...NEW_ENTITIES]);
  });
});

describe('T809 CHECK de audit_log en SQLite (migración 0013)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const insert = (db: ReturnType<typeof openSqliteDatabase>, id: string, entity: string) =>
    db.prepare("INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id) VALUES (?, '2026-11-18T10:00:00.000Z', ?, 'CREATE', ?, 'x')").run(id, UUID, entity);

  it('REQ-ESC6-021: audit_log admite las 3 entidades nuevas y rechaza cualquier otra', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    NEW_ENTITIES.forEach((entity, i) => insert(db, `b1000000-0000-4000-8000-00000000000${i + 1}`, entity));
    expect(() => insert(db, 'b1000000-0000-4000-8000-000000000009', 'HOME_SCENE_IMAGE')).toThrow(/CHECK constraint failed/);
    db.close();
  });

  it('REQ-ESC6-021: antes de 0013 no las admitía; migrar conserva las filas byte a byte, los 3 índices y la fila MIGRATION única por ejecución', () => {
    const cache = join(process.cwd(), 'node_modules', '.cache');
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, 'argos-t809-'));
    dirs.push(dir);
    const previous = join(dir, 'previas');
    mkdirSync(previous);
    for (const file of readdirSync(DEFAULT_MIGRATIONS_DIR).filter((n) => n < '0013')) writeFileSync(join(previous, file), readFileSync(join(DEFAULT_MIGRATIONS_DIR, file), 'utf8'));
    const path = join(dir, 'argos.sqlite');
    const legacy = openSqliteDatabase(path, { migrationsDir: previous });
    insert(legacy, 'b1000000-0000-4000-8000-000000000001', 'PET_MEDIA');
    expect(() => insert(legacy, 'b1000000-0000-4000-8000-000000000002', 'HOME_SCENE')).toThrow(/CHECK constraint failed/);
    const before = legacy.prepare('SELECT * FROM audit_log ORDER BY id').all();
    legacy.close();
    const db = openSqliteDatabase(path);
    const after = db.prepare('SELECT * FROM audit_log ORDER BY id').all();
    expect(after).toEqual(before);
    insert(db, 'b1000000-0000-4000-8000-000000000002', 'HOME_SCENE');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'audit_log' AND name NOT LIKE 'sqlite_%' ORDER BY name").pluck().all())
      .toEqual(['audit_log_entity_id', 'audit_log_executor_user_id', 'audit_log_timestamp']);
    expect(db.prepare("SELECT count(*) FROM schema_migrations WHERE version = '0013_home_scenes.sql'").pluck().get()).toBe(1);
    db.close();
  });

  it('INV-AUD-001: tras 0013 la restricción MIGRATION de audit_log sigue vigente', () => {
    const db = openSqliteDatabase(IN_MEMORY_DATABASE);
    expect(() => db.prepare("INSERT INTO audit_log (id, timestamp, executor_user_id, mutation_type, entity_type, entity_id) VALUES (?, '2026-11-18T10:00:00.000Z', ?, 'MIGRATION', 'HOME_SCENE', 'MIG-1')").run('b1000000-0000-4000-8000-0000000000aa', 'SYSTEM')).toThrow(/CHECK constraint failed/);
    db.close();
  });
});

describe('T809 CHECK de audit_log en Postgres (migración 0009, texto)', () => {
  const sql = (): string => readFileSync(new URL('0009_home_scenes.sql', PG_DIR), 'utf8');

  it('REQ-ESC6-021: 0009_home_scenes.sql reconstruye audit_log_entity_type_check con los 17 valores, sin tocar las filas', () => {
    const text = sql();
    expect(text).toMatch(/ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;/);
    expect(text).toMatch(/ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check CHECK \(entity_type IN/);
    for (const value of [...PREVIOUS_ENTITIES, ...NEW_ENTITIES]) expect(text, value).toContain(`'${value}'`);
    expect(text).not.toMatch(/DELETE FROM audit_log|TRUNCATE|DROP TABLE audit_log/i);
  });
});
