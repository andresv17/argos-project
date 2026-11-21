/**
 * T617 [US2] (REQ-RAZ-003, REQ-SIN-001, INV-RAZ-001, REQ-BACKUP2-001, REQ-BACKUP2-002): respaldo 3.1.0 de ida y vuelta en los tres motores
 * (memoria, SQLite y PostgreSQL real; este último se OMITE sin TEST_DATABASE_URL). La exportación lleva `breedCode` y los síntomas
 * (`symptomType`, `severity`), sin `avatarVersion`, `revision`, `ownerUserId`, medios ni `mediaToDeleteCount` (que es de la vista previa
 * de T604/T605). La importación acepta 1.0.0, 2.0.0, 3.0.0 y 3.1.0 (`breedCode` = null si falta, `breed` se conserva) y rechaza versiones futuras.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { validateBackupEnvelopeV33 } from '../../../src/generated/v31/index.ts';
import type { PetProfile } from '../../../src/generated/index.ts';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import type { UnitOfWorkPort } from '../../../src/application/ports/unit-of-work.port.ts';
import { ExportBackupUseCase, ImportBackupUseCase, PreviewBackupImportUseCase } from '../../../src/application/use-cases/backup-use-cases.ts';
import { FixedClockAdapter } from '../../../src/infrastructure/adapters/fixed-clock.adapter.ts';
import { InMemoryUnitOfWork } from '../../../src/infrastructure/persistence/memory/in-memory-unit-of-work.ts';
import { closePool, createPostgresPool, type PoolClientLike, type PoolLike } from '../../../src/infrastructure/persistence/postgres/postgres-database.ts';
import { PostgresUnitOfWork } from '../../../src/infrastructure/persistence/postgres/postgres-unit-of-work.ts';
import { IN_MEMORY_DATABASE, openSqliteDatabase, type SqliteDatabase } from '../../../src/infrastructure/persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../../../src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts';
import { ANDRES, createDeps, fixtures, HOUSEHOLD } from '../../fixtures/application-harness.ts';
import { digestOf, failure, v2, v3, validBackupState } from '../../fixtures/backup-harness.ts';
import { seedSqlite } from '../../fixtures/sqlite-harness.ts';
import { SpyPasswordHasher } from '../../fixtures/test-doubles.ts';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const REPOSITORIES_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
// Esquema vigente: el baseline y la 0002 (columna `revision` de los 6 registros, T540; los repositorios la leen y la escriben desde T614).
const BASELINE = ['0001_baseline.sql', '0002_record_revision.sql', '0003_username_case_insensitive.sql', '0004_pets_microchip_global.sql', '0005_pet_media.sql', '0009_home_scenes.sql', '0010_pet_life_status.sql']
  .map((name) => readFileSync(new URL(`../../../src/infrastructure/persistence/postgres/migrations/${name}`, import.meta.url), 'utf8'))
  .join('\n');
const SYMPTOM_ID = 'b1000000-0000-4000-8000-000000000001';

interface Engine {
  readonly uow: UnitOfWorkPort;
  readonly dispose: () => Promise<void>;
}
type MakeEngine = () => Promise<Engine>;

const memory: MakeEngine = async () => ({ uow: new InMemoryUnitOfWork(validBackupState()), dispose: async () => {} });

const sqlite: MakeEngine = async () => {
  const db: SqliteDatabase = openSqliteDatabase(IN_MEMORY_DATABASE);
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
  await pool.query(BASELINE);
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
  return {
    uow: engine.uow,
    exporter: new ExportBackupUseCase(deps),
    importer: new ImportBackupUseCase(deps),
    previewer: new PreviewBackupImportUseCase(deps),
  };
}

type Pets = Array<PetProfile & { breedCode?: string | null }>;
const sorted = <T extends { id: string }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

/** JSON con claves ordenadas: el orden de claves de cada motor no es el contrato. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1))) : v,
  );

/** Estado del usuario: mascotas (la anterior a la 004 sin `breedCode` se lee nula, SC-CAT-004) y sus 6 colecciones, ordenados por id. */
async function stateOf(uow: UnitOfWorkPort) {
  return uow.runInTransaction(async (r) => {
    // `version` queda fuera: importar sobre un id existente la sube (REQ-FAL7-011); el estado de la ficha no cambia.
    const pets = sorted((await r.pets.listByOwners([ANDRES])).map(({ version: _version, ...p }) => ({ ...p, breedCode: (p as { breedCode?: string | null }).breedCode ?? null }))) as Pets;
    const records = [];
    for (const pet of pets) {
      const own = await r.records.listForPet(pet.id);
      records.push(
        Object.fromEntries(
          Object.entries(own).map(([module, rows]) => [
            module,
            sorted(
              // Anterior a la 004 = nulos; `revision` queda fuera: importar sobre un id existente la sube (REQ-BOR-005), el estado clínico no cambia.
              (rows as Array<{ id: string; revision?: number }>).map(({ revision: _revision, ...row }) => (module === 'customParameters' ? { symptomType: null, severity: null, ...row } : row)),
            ),
          ]),
        ),
      );
    }
    return { pets, records };
  });
}

/** Siembra una mascota con `breedCode` (Toby, Beagle) y un síntoma suyo. */
async function seedBreedAndSymptom(uow: UnitOfWorkPort) {
  const toby = (await uow.runInTransaction((r) => r.pets.listByOwners([ANDRES]))).find((p) => p.name === 'Toby')!;
  await uow.runInTransaction(async (r) => {
    await r.pets.save({ ...toby, breedCode: 'DOG_BEAGLE', breed: 'Beagle' } as PetProfile);
    await r.records.add('customParameters', {
      id: SYMPTOM_ID,
      petId: toby.id,
      recordedAt: '2026-11-05',
      category: 'SYMPTOM',
      title: 'Vómito',
      description: 'Dos veces en la mañana.',
      notes: null,
      createdAt: '2026-11-05T12:00:00.000Z',
      symptomType: 'VOMIT',
      severity: 'MODERATE',
    } as never);
  });
  return toby;
}

/** Siembra la escena del hogar con imagen vigente, foto del hogar, consentimiento, intento y arrastre de cuota (feature 006). */
async function seedSceneData(uow: UnitOfWorkPort): Promise<void> {
  const now = '2026-11-18T10:00:00.000Z';
  await uow.runInTransaction(async (r) => {
    await r.scenes.insert({
      id: 'a1000000-0000-4000-8000-000000000001',
      householdId: HOUSEHOLD.id,
      ownerUserId: null,
      runState: null,
      currentAttemptId: null,
      leaseExpiresAt: null,
      image: { id: 'a3000000-0000-4000-8000-000000000001', mime: 'image/png', sizeBytes: 10, fingerprint: 'a'.repeat(64), inputsSnapshot: '{"v":1}', createdAt: now },
      imageDegraded: false,
      consumedGenerations: 1,
      quotaWindow: '2026-11',
      createdAt: now,
      updatedAt: now,
    });
    await r.scenes.putHouseholdPhoto({ householdId: HOUSEHOLD.id, objectId: 'a3000000-0000-4000-8000-000000000002', mime: 'image/jpeg', sizeBytes: 100, uploadedByUserId: ANDRES, createdAt: now });
    await r.scenes.upsertQuotaCarry(ANDRES, '2026-11', 2);
    await r.sceneConsents.grant({ id: 'a4000000-0000-4000-8000-000000000001', userId: ANDRES, scope: 'PET_PHOTOS', providerId: 'vertex', noticeVersion: '1', grantedAt: now, revokedAt: null });
  });
}

function defineRoundTrip(make: MakeEngine) {
  it('[REQ-ESC6-022][SC-ESC6-051] la foto del hogar y las escenas no viajan: la exportacion es identica con y sin escena, foto, consentimiento y arrastre, y no nombra sus tablas', async () => {
    const { uow, exporter } = await open(make);
    const before = (await exporter.execute(ANDRES)).json;
    await seedSceneData(uow);
    const after = (await exporter.execute(ANDRES)).json;
    expect(after).toBe(before);
    expect(after).not.toMatch(/home_scenes|household_photos|scene_|"scenes?"|sceneId|householdPhoto|image_inputs|imageFingerprint|a3000000-0000-4000-8000/);
    expect(validateBackupEnvelopeV33(JSON.parse(after))).toBe(true);
  });

  it('[REQ-ESC6-022] importar un respaldo no restaura ni crea la escena, la foto del hogar ni el consentimiento (sin ganchos de escena conectados)', async () => {
    const { uow, exporter, importer } = await open(make);
    const { json } = await exporter.execute(ANDRES);
    const counts = (): Promise<number[]> =>
      uow.runInTransaction(async (r) => [
        (await r.scenes.findByHouseholdId(HOUSEHOLD.id)) === null ? 0 : 1,
        (await r.scenes.findHouseholdPhoto(HOUSEHOLD.id)) === null ? 0 : 1,
        await r.scenes.findQuotaCarry(ANDRES, '2026-11') ?? 0,
        (await r.sceneConsents.findByUserId(ANDRES)) === null ? 0 : 1,
      ]);
    expect(await counts()).toEqual([0, 0, 0, 0]);
    await importer.execute(ANDRES, json, digestOf(json));
    expect(await counts()).toEqual([0, 0, 0, 0]);
    await seedSceneData(uow);
    await importer.execute(ANDRES, json, digestOf(json));
    expect(await counts()).toEqual([1, 1, 2, 1]); // sin gancho de escena (T867 lo agrega en la Fase 5) la importacion no toca las tablas de la escena
  });

  it('la exportación 3.3.0 lleva breedCode, lifeStatus, deceasedAt, biography nula y los síntomas, valida el esquema y no lleva medios ni mediaToDeleteCount (REQ-RAZ-003, REQ-SIN-001)', async () => {
    const { uow, exporter } = await open(make);
    const toby = await seedBreedAndSymptom(uow);
    const { envelope, json } = await exporter.execute(ANDRES);
    expect(validateBackupEnvelopeV33(JSON.parse(json))).toBe(true);
    expect(envelope.schemaVersion).toBe('3.3.0');
    const pets = envelope.pets as unknown as Array<Record<string, unknown>>;
    expect(pets.find((p) => p['id'] === toby.id)).toMatchObject({ breedCode: 'DOG_BEAGLE', breed: 'Beagle' });
    expect(pets.every((p) => p['breedCode'] !== undefined && p['lifeStatus'] === 'ALIVE' && p['deceasedAt'] === null && p['biography'] === null && !('avatarVersion' in p) && !('ownerUserId' in p) && !('version' in p))).toBe(true);
    const parameters = envelope.records.customParameters as unknown as Array<Record<string, unknown>>;
    expect(parameters.find((c) => c['id'] === SYMPTOM_ID)).toMatchObject({ category: 'SYMPTOM', symptomType: 'VOMIT', severity: 'MODERATE' });
    expect(parameters.every((c) => !('revision' in c))).toBe(true);
    expect(json).not.toMatch(/mediaToDeleteCount|"media"|avatarVersion|"revision"|"version"/);
  });

  it('ida y vuelta: exportar, alterar e importar restaura breedCode, breed y el síntoma exactos', async () => {
    const { uow, exporter, importer } = await open(make);
    const toby = await seedBreedAndSymptom(uow);
    const before = await stateOf(uow);
    const { json } = await exporter.execute(ANDRES);
    await uow.runInTransaction(async (r) => {
      await r.pets.save({ ...toby, breedCode: null, breed: 'Mestizo' } as PetProfile);
      await r.records.deleteForPet(toby.id);
    });
    expect(await stateOf(uow)).not.toEqual(before);
    const result = await importer.execute(ANDRES, json, digestOf(json));
    expect(result.sourceSchemaVersion).toBe('3.3.0');
    const after = await stateOf(uow);
    expect(after.pets.find((p) => p.id === toby.id)).toMatchObject({ breedCode: 'DOG_BEAGLE', breed: 'Beagle' });
    expect(JSON.parse(canonical(after))).toEqual(JSON.parse(canonical(before)));
  });

  it('la vista previa de un 3.3.0 informa sourceSchemaVersion 3.3.0 y no cambia nada', async () => {
    const { uow, exporter, previewer } = await open(make);
    await seedBreedAndSymptom(uow);
    const { json } = await exporter.execute(ANDRES);
    const before = JSON.stringify(await stateOf(uow));
    const preview = await previewer.execute(ANDRES, json);
    expect(preview.sourceSchemaVersion).toBe('3.3.0');
    expect(preview.counts.pets).toBe(5);
    expect(JSON.stringify(await stateOf(uow))).toBe(before);
  });

  it('un 3.0.0 se importa con breedCode nulo y el texto breed conservado; sin symptomType ni severity', async () => {
    const { uow, importer } = await open(make);
    const file = JSON.stringify(v3());
    const result = await importer.execute(ANDRES, file, digestOf(file));
    expect(result.sourceSchemaVersion).toBe('3.0.0');
    const { pets } = await stateOf(uow);
    expect(pets.map((p) => [p.name, p.breed, p.breedCode])).toEqual(
      sorted(v3().pets as unknown as Array<{ id: string; name: string; breed: string }>).map((p) => [p.name, p.breed, null]),
    );
  });

  it('un 2.0.0 y un 1.0.0 se importan con breedCode nulo y el texto breed conservado', async () => {
    for (const [version, envelope] of [['2.0.0', v2()], ['1.0.0', fixtures.validLegacyBackupEnvelopeV1]] as const) {
      const { uow, importer } = await open(make);
      const file = JSON.stringify(envelope);
      const result = await importer.execute(ANDRES, file, digestOf(file));
      expect(result.sourceSchemaVersion).toBe(version);
      const { pets } = await stateOf(uow);
      const expected = (envelope.pets as Array<{ id: string; breed: string }>).map((p) => [p.id, p.breed]);
      expect(sorted(pets).map((p) => [p.id, p.breed])).toEqual(expected.sort((a, b) => (a[0]! < b[0]! ? -1 : 1)));
      expect(pets.every((p) => p.breedCode === null)).toBe(true);
    }
  });

  it('una versión futura (3.4.0) se rechaza con ERR-BACKUP-VERSION-UNSUPPORTED y no cambia nada', async () => {
    const { uow, importer } = await open(make);
    const before = JSON.stringify(await stateOf(uow));
    const file = JSON.stringify({ ...v3(), schemaVersion: '3.4.0' });
    expect(await failure(importer.execute(ANDRES, file, digestOf(file)))).toMatchObject({ code: 'ERR-BACKUP-VERSION-UNSUPPORTED' });
    expect(JSON.stringify(await stateOf(uow))).toBe(before);
  });

  it('[REQ-FAL7-009][EDGE-007-006] un 3.1.0 (sin lifeStatus ni deceasedAt) se importa ALIVE y sin fecha; un 3.2.0 con una fallecida conserva el estado y la fecha en la ida y vuelta', async () => {
    const { uow, exporter, importer } = await open(make);
    const exported = JSON.parse((await exporter.execute(ANDRES)).json) as { schemaVersion: string; pets: Array<Record<string, unknown>> };
    const legacy = { ...exported, schemaVersion: '3.1.0', pets: exported.pets.map(({ lifeStatus: _l, deceasedAt: _d, biography: _b, ...pet }) => pet) };
    const legacyFile = JSON.stringify(legacy);
    expect((await importer.execute(ANDRES, legacyFile, digestOf(legacyFile))).sourceSchemaVersion).toBe('3.1.0');
    expect((await stateOf(uow)).pets.map((p) => [p.lifeStatus, p.deceasedAt])).toEqual(exported.pets.map(() => ['ALIVE', null]));
    const kira = exported.pets.find((p) => p['name'] === 'Kira')!;
    kira['lifeStatus'] = 'DECEASED';
    kira['deceasedAt'] = '2026-10-01';
    const deceasedFile = JSON.stringify(exported);
    expect((await importer.execute(ANDRES, deceasedFile, digestOf(deceasedFile))).sourceSchemaVersion).toBe('3.3.0');
    const imported = (await stateOf(uow)).pets.find((p) => p.name === 'Kira')!;
    expect([imported.lifeStatus, imported.deceasedAt]).toEqual(['DECEASED', '2026-10-01']);
    const again = JSON.parse((await exporter.execute(ANDRES)).json) as { pets: Array<Record<string, unknown>> };
    expect(again.pets.find((p) => p['name'] === 'Kira')).toMatchObject({ lifeStatus: 'DECEASED', deceasedAt: '2026-10-01' });
  });

  it('[REQ-FAL7-002][REQ-FAL7-009] un 3.2.0 con una fallecida de fecha anterior al nacimiento, futura o Vivo con fecha se rechaza sin cambiar nada', async () => {
    const { uow, exporter, importer } = await open(make);
    const exported = JSON.parse((await exporter.execute(ANDRES)).json) as { pets: Array<Record<string, unknown>> };
    const before = JSON.stringify(await stateOf(uow));
    const invalid: Array<Record<string, unknown>> = [
      { lifeStatus: 'DECEASED', deceasedAt: '1999-01-01' },
      { lifeStatus: 'DECEASED', deceasedAt: '2999-01-01' },
      { lifeStatus: 'ALIVE', deceasedAt: '2026-10-01' },
    ];
    for (const change of invalid) {
      const file = JSON.stringify({ ...exported, pets: exported.pets.map((p, i) => (i === 0 ? { ...p, ...change } : p)) });
      expect((await failure(importer.execute(ANDRES, file, digestOf(file)))).code, JSON.stringify(change)).toMatch(/^ERR-/);
      expect(JSON.stringify(await stateOf(uow))).toBe(before);
    }
  });

  it('un 3.1.0 con breedCode de otra especie se rechaza por invariante de dominio (INV-RAZ-001) y no cambia nada', async () => {
    const { uow, exporter, importer } = await open(make);
    await seedBreedAndSymptom(uow);
    const envelope = JSON.parse((await exporter.execute(ANDRES)).json) as { pets: Array<Record<string, unknown>> };
    envelope.pets.find((p) => p['name'] === 'Toby')!['breedCode'] = 'CAT_SIAMES';
    const before = JSON.stringify(await stateOf(uow));
    const file = JSON.stringify(envelope);
    expect((await failure(importer.execute(ANDRES, file, digestOf(file)))).code).toMatch(/^ERR-/);
    expect(JSON.stringify(await stateOf(uow))).toBe(before);
  });
}

describe('T617 respaldo 3.1.0 de ida y vuelta: memoria', () => defineRoundTrip(memory));
describe('T617 respaldo 3.1.0 de ida y vuelta: SQLite', () => defineRoundTrip(sqlite));
describe.skipIf(!TEST_DATABASE_URL)('T617 respaldo 3.1.0 de ida y vuelta: PostgreSQL real (requiere TEST_DATABASE_URL; se omite si no está definida)', { timeout: 60_000 }, () =>
  defineRoundTrip(postgres),
);
