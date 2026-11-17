/**
 * T604 [P] [US2] importación de respaldo por reemplazo, en memoria, SQLite y PostgreSQL 17 real (se OMITE sin TEST_DATABASE_URL)
 * (SC-CAT-024, SC-CAT-031; REQ-IMP-001, REQ-PET4-001, REQ-GCS-004, EDGE-015, EDGE-016):
 *  - el reemplazo borra por `pet_id` las 6 tablas de TODAS las mascotas reemplazadas (también las que el archivo no trae) y no deja
 *    registros sobrantes de la mascota que sí vuelve;
 *  - exportar → borrar un registro → importar restaura el registro, sin error de clave (el borrado es físico);
 *  - un microchip repetido dentro del archivo falla completo sin modificar datos y el error nombra la mascota PROPIA del archivo (posición y
 *    nombre) sin repetir el microchip;
 *  - la vista previa informa `mediaToDeleteCount` (entero >= 0).
 *  - (cierre de medios) con 2 filas de `pet_media` y un avatar vigente la vista previa informa `mediaToDeleteCount` = 3; el reemplazo borra las filas,
 *    deja `avatar_object_id` nulo conservando `avatar_version` y encola las 3 claves con `DELETE` (REQ-GCS-004, D-15 A).
 * El duplicado de microchip ante OTRO usuario (índice global, T553/T554) se prueba en t552-microchip-global.spec.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { ExportBackupUseCase, ImportBackupUseCase, PreviewBackupImportUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import type { RecordModule } from '../../../src/domain/records/record-invariants.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, ARGOS, createDeps } from '../../fixtures/application-harness.ts';
import { digestOf, failure, validBackupState } from '../../fixtures/backup-harness.ts';
import { POSTGRES_SCHEMA_SQL, TEST_DATABASE_URL } from '../../fixtures/concurrent-engines.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
const MODULES: readonly RecordModule[] = ['weights', 'bodyMeasurements', 'vaccinations', 'dewormings', 'medicalVisits', 'customParameters'];
const EXTRA_PET = 'd0000000-0000-4000-8000-0000000000e1';
const EXTRA_WEIGHT = 'd0000000-0000-4000-8000-0000000000e2';
const EXTRA_ON_RETURNING = 'd0000000-0000-4000-8000-0000000000e3';

interface Engine {
  readonly uow: UnitOfWorkPort;
  dispose(): Promise<void>;
}
type MakeEngine = () => Promise<Engine>;

const memory: MakeEngine = async () => ({ uow: new InMemoryUnitOfWork(validBackupState()), dispose: async () => undefined });
const sqlite: MakeEngine = async () => {
  const db = openSqliteDatabase(IN_MEMORY_DATABASE);
  const uow = new SqliteUnitOfWork(db);
  await seedSqlite(uow, validBackupState());
  return { uow, dispose: async () => void (db.open && db.close()) };
};
const postgres: MakeEngine = async () => {
  const schema = `argos_t_${randomUUID().replaceAll('-', '')}`;
  const admin: PoolLike = createPostgresPool({ connectionString: TEST_DATABASE_URL ?? '', pgPoolMax: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(TEST_DATABASE_URL ?? '');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const pool: PoolLike = createPostgresPool({ connectionString: url.toString(), pgPoolMax: 4 });
  await pool.query(POSTGRES_SCHEMA_SQL);
  const { createPostgresRepositories } = (await import(/* @vite-ignore */ REPOSITORIES_PATH)) as { createPostgresRepositories: (client: PoolClientLike) => RepositorySet };
  const uow = new PostgresUnitOfWork(pool, createPostgresRepositories);
  await seedSqlite(uow, validBackupState());
  return {
    uow,
    dispose: async () => {
      await closePool(pool);
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await closePool(admin);
    },
  };
};

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

async function open(make: MakeEngine) {
  const engine = await make();
  disposers.push(engine.dispose);
  const deps = createDeps(engine.uow, new FixedClockAdapter(), new SpyPasswordHasher());
  return { uow: engine.uow, exporter: new ExportBackupUseCase(deps), importer: new ImportBackupUseCase(deps), previewer: new PreviewBackupImportUseCase(deps) };
}

/** Ids de registros de la mascota por módulo (las 6 tablas). */
async function recordIdsOf(uow: UnitOfWorkPort, petId: string): Promise<Record<RecordModule, string[]>> {
  const own = await uow.runInTransaction((r) => r.records.listForPet(petId));
  return Object.fromEntries(MODULES.map((m) => [m, (own[m] as Array<{ id: string }>).map((x) => x.id).sort()])) as Record<RecordModule, string[]>;
}
const allIds = (ids: Record<RecordModule, string[]>) => MODULES.flatMap((m) => ids[m]);

function define(make: MakeEngine) {
  it('[REQ-IMP-001][SC-CAT-031][EDGE-015] exportar → borrar un registro → importar por reemplazo restaura el registro y deja el estado igual al exportado', async () => {
    const { uow, exporter, importer } = await open(make);
    const before = await recordIdsOf(uow, ARGOS.id);
    const removed = before.weights[0]!;
    const { json } = await exporter.execute(ANDRES);
    await uow.runInTransaction(async (r) => {
      expect(await r.records.remove('weights', ARGOS.id, removed)).toBe(true);
    });
    expect((await recordIdsOf(uow, ARGOS.id)).weights).not.toContain(removed);
    await importer.execute(ANDRES, json, digestOf(json));
    expect(await recordIdsOf(uow, ARGOS.id)).toEqual(before);
  });

  it('[REQ-IMP-001] el reemplazo borra por pet_id las 6 tablas de TODAS las mascotas reemplazadas: no sobreviven registros extra de la que vuelve ni la mascota que el archivo no trae', async () => {
    const { uow, exporter, importer } = await open(make);
    const expected = await recordIdsOf(uow, ARGOS.id);
    const { json } = await exporter.execute(ANDRES);
    await uow.runInTransaction(async (r) => {
      // Registro extra en cada tabla de Argos y una mascota nueva (no está en el archivo) con un peso.
      const argosWeight = (await r.records.listForPet(ARGOS.id)).weights[0]!;
      await r.records.add('weights', { ...argosWeight, id: EXTRA_WEIGHT, recordedAt: '2026-01-02' } as never);
      const pet = (await r.pets.findById(ARGOS.id))!;
      await r.pets.save({ ...pet, id: EXTRA_PET, name: 'Extra', microchipId: null } as never);
      await r.records.add('weights', { ...argosWeight, id: EXTRA_ON_RETURNING, petId: EXTRA_PET } as never);
    });
    expect(allIds(await recordIdsOf(uow, ARGOS.id))).toContain(EXTRA_WEIGHT);
    await importer.execute(ANDRES, json, digestOf(json));
    expect(await recordIdsOf(uow, ARGOS.id)).toEqual(expected);
    expect(allIds(await recordIdsOf(uow, EXTRA_PET))).toEqual([]);
    expect(await uow.runInTransaction((r) => r.pets.findById(EXTRA_PET))).toBeNull();
  });

  it('[REQ-PET4-001][SC-CAT-024][EDGE-016] un microchip repetido dentro del archivo falla completo sin modificar datos y nombra la mascota propia del archivo (posición y nombre) sin repetir el microchip', async () => {
    const { uow, exporter, importer } = await open(make);
    const envelope = JSON.parse((await exporter.execute(ANDRES)).json) as { pets: Array<Record<string, unknown>> };
    envelope.pets[0]!['microchipId'] = '985112345678901';
    envelope.pets[1]!['microchipId'] = '985112345678901';
    const file = JSON.stringify(envelope);
    const before = JSON.stringify(await recordIdsOf(uow, ARGOS.id));
    const error = await failure(importer.execute(ANDRES, file, digestOf(file)));
    expect([error.code, error.status, error.field, error.finalState]).toEqual(['ERR-PET-MICROCHIP-DUPLICATE', 409, 'microchipId', 'ROLLED_BACK']);
    expect(error.detail).toContain(`n.º 2`);
    expect(error.detail).toContain(String(envelope.pets[1]!['name']));
    expect(error.detail).not.toContain('985112345678901');
    expect(JSON.stringify(await recordIdsOf(uow, ARGOS.id))).toBe(before);
  });

  it('[REQ-IMP-001][SC-CAT-031][D-15 A] la vista previa informa mediaToDeleteCount como entero >= 0 (sin medios, 0) y no escribe nada', async () => {
    const { uow, exporter, previewer } = await open(make);
    const { json } = await exporter.execute(ANDRES);
    const before = JSON.stringify(await recordIdsOf(uow, ARGOS.id));
    const preview = await previewer.execute(ANDRES, json);
    expect(Number.isInteger(preview.mediaToDeleteCount)).toBe(true);
    expect(preview.mediaToDeleteCount).toBe(0);
    expect(JSON.stringify(await recordIdsOf(uow, ARGOS.id))).toBe(before);
  });

  it('[REQ-IMP-001][SC-CAT-031][D-15 A][REQ-GCS-004] con archivos, fotos y avatar la vista previa cuenta 3; el reemplazo borra las filas, deja avatar_object_id nulo con avatar_version conservada y encola las 3 claves', async () => {
    const { uow, exporter, importer, previewer } = await open(make);
    const { json } = await exporter.execute(ANDRES);
    const avatarId = 'f0000000-0000-4000-8000-0000000a0a01';
    const media = [
      { id: 'f0000000-0000-4000-8000-0000000b0b01', kind: 'FILE', mime: 'application/pdf' },
      { id: 'f0000000-0000-4000-8000-0000000b0b02', kind: 'PHOTO', mime: 'image/png' },
    ] as const;
    await uow.runInTransaction(async (r) => {
      for (const m of media) await r.media.insert({ ...m, petId: ARGOS.id, sizeBytes: 64, originalName: 'a', createdAt: '2026-11-05T12:00:00.000Z' });
      await r.pets.replaceAvatar(ARGOS.id, 'f0000000-0000-4000-8000-0000000a0a00');
      await r.pets.replaceAvatar(ARGOS.id, avatarId);
    });
    expect((await previewer.execute(ANDRES, json)).mediaToDeleteCount).toBe(3);
    expect(await uow.runInTransaction((r) => r.mediaQueue.listPending(10))).toEqual([]); // la vista previa no escribe
    await importer.execute(ANDRES, json, digestOf(json));
    const queued = (await uow.runInTransaction((r) => r.mediaQueue.listPending(10))).map((q) => [q.objectKey, q.reason]).sort();
    expect(queued).toEqual(
      [
        [`pets/${ARGOS.id}/avatar/${avatarId}`, 'DELETE'],
        [`pets/${ARGOS.id}/files/${media[0].id}`, 'DELETE'],
        [`pets/${ARGOS.id}/photos/${media[1].id}`, 'DELETE'],
      ].sort(),
    );
    expect(await uow.runInTransaction((r) => r.media.listPage(ARGOS.id, null, 10, 0))).toMatchObject({ total: 0 });
    expect(await uow.runInTransaction((r) => r.pets.findAvatar(ARGOS.id))).toEqual({ version: 2, objectId: null });
  });
}

describe('T604 importación por reemplazo (memoria)', () => define(memory));
describe('T604 importación por reemplazo (SQLite)', () => define(sqlite));
describe.skipIf(!TEST_DATABASE_URL)('T604 importación por reemplazo (PostgreSQL 17 real)', { timeout: 60_000 }, () => define(postgres));
