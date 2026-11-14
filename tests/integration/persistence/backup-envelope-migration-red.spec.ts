import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { PetProfile } from '../../../src/generated/index.ts';
import { migrateLegacyEnvelope } from '../../../src/domain/backup/backup-migration.ts';
import { createApi, problemOf, type Api } from '../api/api-harness.ts';
import { LUNA_ID, USERS_BY_NAME } from '../api/api-fixtures.ts';
import { ANDRES, MARIA, fixtures } from '../../fixtures/application-harness.ts';
import { v2 } from '../../fixtures/backup-harness.ts';
import { upgradeEnvelope } from '../../fixtures/storage-upgrade.ts';

/**
 * T275 (fase roja, Rebanada 5, REQ-BACKUP2-002): migración de sobres 1.0.0 y 2.0.0 a 3.0.0 al previsualizar e importar,
 * sobre SQLite: DOG → CANINE y CAT → FELINE, campos nuevos con sus valores neutros, propiedad forzada al usuario
 * autenticado, misma validación final que un 3.0.0, versión no soportada e idempotencia del reemplazo al repetir.
 *
 * @implements REQ-BACKUP2-002, STATE-BACKUP-001, INV-BACKUP-001, ERR-BACKUP-VERSION-UNSUPPORTED, ERR-BACKUP-SCHEMA-INVALID
 */
let api: Api;
afterEach(async () => api?.close());

const PREVIEW = '/api/backup/import/preview';
const IMPORT = '/api/backup/import';
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const preview = (cookie: string, raw: string) => api.call('POST', PREVIEW, { cookie, raw, contract: false });
const importFile = (cookie: string, raw: string) => api.call('POST', IMPORT, { cookie, raw, headers: { 'x-argos-import-confirm': sha256(raw) }, contract: false });
const auditCount = () => api.db.prepare('SELECT COUNT(*) FROM audit_log').pluck().get() as number;
const importRows = () => api.db.prepare("SELECT COUNT(*) FROM audit_log WHERE mutation_type = 'IMPORT'").pluck().get() as number;

/** Sobre 2.0.0 tal cual lo escribió la 001: DOG/CAT, ownerUserId por mascota y exportedByUserId. */
const legacyV2 = (mutate: (e: Record<string, any>) => void = () => {}): string => {
  const copy = structuredClone(fixtures.validBackupEnvelopeV2) as Record<string, any>;
  mutate(copy);
  return JSON.stringify(copy);
};
/** Sobre 1.0.0: sin ownerUserId ni exportedByUserId. */
const legacyV1 = (mutate: (e: Record<string, any>) => void = () => {}): string => {
  const copy = structuredClone(fixtures.validLegacyBackupEnvelopeV1) as Record<string, any>;
  mutate(copy);
  return JSON.stringify(copy);
};
/** El 3.0.0 equivalente del 2.0.0 canónico, escrito a mano con las reglas de la máquina (el mapeo de especie y los valores neutros). */
const equivalentV3 = (): string => {
  const upgraded = upgradeEnvelope(v2());
  const { exportedByUserId: _by, ...root } = upgraded as typeof upgraded & { exportedByUserId?: string };
  return JSON.stringify({ ...root, schemaVersion: '3.0.0', pets: (root.pets as unknown as Array<PetProfile>).map(({ ownerUserId: _o, ...pet }) => pet) });
};

const storedPets = () => api.deps.uow.runInTransaction((r) => r.pets.listByOwners([ANDRES]));
const storedRecords = (petId: string) => api.deps.uow.runInTransaction((r) => r.records.listForPet(petId));

describe('migración 2.0.0 → 3.0.0 al importar (STATE-BACKUP-001, REQ-BACKUP2-002)', () => {
  it('[STATE-BACKUP-001][REQ-BACKUP2-002] el sobre 2.0.0 se importa: 200 COMPLETED con sourceSchemaVersion 2.0.0 y los conteos del archivo', async () => {
    api = await createApi();
    const r = await importFile(await api.login('andres'), legacyV2());
    expect([r.status, r.json]).toEqual([200, { finalState: 'COMPLETED', sourceSchemaVersion: '2.0.0', importedPetsCount: 5, importedRecordsCount: 8 }]);
  });

  it('[STATE-BACKUP-001][REQ-BACKUP2-002] DOG pasa a CANINE y CAT a FELINE; birthDateIsEstimate false, neutered y microchipId nulos; el resto de la mascota no cambia', async () => {
    api = await createApi();
    const imported = await importFile(await api.login('andres'), legacyV2());
    const pets = await storedPets();
    const argos = pets.find((p) => p.name === 'Argos')!;
    const nyx = pets.find((p) => p.name === 'Nyx')!;
    const tuple = (p: PetProfile) => [p.species, p.birthDateIsEstimate, p.neutered, p.microchipId, p.speciesOther, p.breed, p.birthDate, p.sex];
    expect([imported.status, pets.map((p) => p.species).sort(), tuple(argos), tuple(nyx)]).toEqual([
      200,
      ['CANINE', 'CANINE', 'CANINE', 'FELINE', 'FELINE'],
      ['CANINE', false, null, null, null, 'Pastor Alemán', '2022-05-10', 'MALE'],
      ['FELINE', false, null, null, null, 'Bombay', '2021-11-05', 'FEMALE'],
    ]);
  });

  it('[STATE-BACKUP-001][REQ-BACKUP2-002] vacunas y desparasitaciones migradas llevan category derivada y veterinarianName/veterinarianLicense nulos', async () => {
    api = await createApi();
    const imported = await importFile(await api.login('andres'), legacyV2());
    const records = await Promise.all((await storedPets()).map((p) => storedRecords(p.id)));
    const vaccines = records.flatMap((r) => r.vaccinations) as unknown as Array<Record<string, unknown>>;
    const dewormings = records.flatMap((r) => r.dewormings) as unknown as Array<Record<string, unknown>>;
    const shape = (rows: Array<Record<string, unknown>>) => rows.map((x) => [x['category'], x['veterinarianName'], x['veterinarianLicense']]);
    expect([imported.status, shape(vaccines), shape(dewormings)]).toEqual([
      200,
      [['VACCINE', null, null], ['VACCINE', null, null]],
      [['DEWORMING', null, null]],
    ]);
  });

  it('[REQ-BACKUP2-002][INV-BACKUP-001] ownerUserId y exportedByUserId del archivo se descartan: aunque diga María, las mascotas quedan del usuario autenticado y sin asignaciones a hogares', async () => {
    api = await createApi();
    const lunaOwner = api.db.prepare('SELECT owner_user_id FROM pets WHERE id = ?').pluck().get(LUNA_ID);
    const r = await importFile(
      await api.login('andres'),
      legacyV2((e) => {
        e.exportedByUserId = MARIA;
        for (const pet of e.pets) pet.ownerUserId = MARIA;
      }),
    );
    const owners = api.db.prepare('SELECT DISTINCT owner_user_id FROM pets WHERE id IN (SELECT id FROM pets WHERE id LIKE ?)').pluck().all('11111111-1111-4111-8111-1111111111%');
    const assigned = api.db.prepare('SELECT COUNT(*) FROM pet_assignments WHERE pet_id IN (SELECT id FROM pets WHERE owner_user_id = ?)').pluck().get(USERS_BY_NAME.andres);
    expect([r.status, owners, assigned, api.db.prepare('SELECT owner_user_id FROM pets WHERE id = ?').pluck().get(LUNA_ID) === lunaOwner]).toEqual([200, [USERS_BY_NAME.andres], 0, true]);
  });

  it('[STATE-BACKUP-001][REQ-BACKUP2-002] importar el 2.0.0 deja exactamente la misma base que importar su 3.0.0 equivalente', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    await importFile(cookie, equivalentV3());
    const fromV3 = api.dump();
    await api.close();
    api = await createApi();
    const r = await importFile(await api.login('andres'), legacyV2());
    expect([r.status, api.dump() === fromV3]).toEqual([200, true]);
  });

  it('[STATE-BACKUP-001][INV-BACKUP-001] idempotencia: repetir la importación del mismo 2.0.0 deja el mismo volcado y cada importación escribe su única fila IMPORT', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = legacyV2();
    const first = await importFile(cookie, text);
    const afterFirst = api.dump();
    const second = await importFile(cookie, text);
    expect([first.status, second.status, second.json, api.dump() === afterFirst, importRows()]).toEqual([
      200,
      200,
      { finalState: 'COMPLETED', sourceSchemaVersion: '2.0.0', importedPetsCount: 5, importedRecordsCount: 8 },
      true,
      2,
    ]);
  });
});

describe('migración 1.0.0 → 3.0.0 al importar (STATE-BACKUP-001, REQ-BACKUP2-002)', () => {
  it('[STATE-BACKUP-001][REQ-BACKUP2-002] el sobre 1.0.0 se importa con sourceSchemaVersion 1.0.0: 4 mascotas del usuario, CANINE/FELINE y fechas en UTC canónico', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = legacyV1((e) => {
      e.exportedAt = '2026-11-05T07:00:00-05:00';
      e.pets[0].createdAt = '2026-01-01T05:00:00-05:00';
    });
    const r = await importFile(cookie, text);
    const pets = await storedPets();
    expect([r.status, (r.json as { sourceSchemaVersion?: string }).sourceSchemaVersion, pets.length, [...new Set(pets.map((p) => p.species))].sort(), pets.find((p) => p.name === 'Argos')?.createdAt]).toEqual([
      200,
      '1.0.0',
      4,
      ['CANINE', 'FELINE'],
      '2026-01-01T10:00:00.000Z',
    ]);
  });

  it('[STATE-BACKUP-001][REQ-BACKUP2-002] importar el 1.0.0 equivale a importar el 2.0.0 que produce la migración heredada: misma base', async () => {
    api = await createApi();
    const asV2 = JSON.stringify(migrateLegacyEnvelope(fixtures.validLegacyBackupEnvelopeV1, ANDRES));
    await importFile(await api.login('andres'), asV2);
    const fromV2 = api.dump();
    await api.close();
    api = await createApi();
    const r = await importFile(await api.login('andres'), legacyV1());
    expect([r.status, api.dump() === fromV2]).toEqual([200, true]);
  });

  it('[STATE-BACKUP-001][INV-BACKUP-001] idempotencia: repetir la importación del 1.0.0 deja el mismo volcado', async () => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = legacyV1();
    await importFile(cookie, text);
    const afterFirst = api.dump();
    const second = await importFile(cookie, text);
    expect([second.status, api.dump() === afterFirst]).toEqual([200, true]);
  });
});

describe('la previsualización migra sin persistir (STATE-BACKUP-001, REQ-BACKUP2-002)', () => {
  it.each([
    ['1.0.0', () => legacyV1(), 4],
    ['2.0.0', () => legacyV2(), 5],
  ] as const)('[REQ-BACKUP2-002][STATE-BACKUP-001] el %s se previsualiza con su sourceSchemaVersion y el fileDigest de los bytes, sin escribir nada', async (version, build, pets) => {
    api = await createApi();
    const cookie = await api.login('andres');
    const text = build();
    const before = { dump: api.dump(), audit: auditCount() };
    const r = await preview(cookie, text);
    const body = r.json as { sourceSchemaVersion?: string; fileDigest?: string; counts?: { pets?: number } };
    expect([r.status, body.sourceSchemaVersion, body.fileDigest, body.counts?.pets, api.dump() === before.dump, auditCount()]).toEqual([200, version, sha256(text), pets, true, before.audit]);
  });
});

describe('la migración ejecuta la misma validación final que un 3.0.0 (STATE-BACKUP-001, T7(f))', () => {
  it.each([
    ['2.0.0 con una especie fuera de las 8 (DRAGON)', 422, 'ERR-BACKUP-SCHEMA-INVALID', () => legacyV2((e) => (e.pets[0].species = 'DRAGON'))],
    ['2.0.0 con role en la mascota (FX-BAK-021)', 422, 'ERR-BACKUP-SCHEMA-INVALID', () => legacyV2((e) => (e.pets[0].role = 'OWNER'))],
    ['2.0.0 con assignments en la mascota (FX-BAK-022)', 422, 'ERR-BACKUP-SCHEMA-INVALID', () => legacyV2((e) => (e.pets[0].assignments = []))],
    ['1.0.0 con ownerUserId en la mascota (FX-BAK-023)', 422, 'ERR-BACKUP-SCHEMA-INVALID', () => legacyV1((e) => (e.pets[0].ownerUserId = MARIA))],
    ['1.0.0 con role en la mascota (FX-BAK-024)', 422, 'ERR-BACKUP-SCHEMA-INVALID', () => legacyV1((e) => (e.pets[0].role = 'OWNER'))],
    ['2.0.0 con peso fuera de rango', 422, 'ERR-REC-WEIGHT-OUT-OF-RANGE', () => legacyV2((e) => (e.records.weights[0].weightKg = 900))],
    ['2.0.0 con nacimiento futuro', 422, 'ERR-PET-FUTURE-BIRTHDATE', () => legacyV2((e) => (e.pets[0].birthDate = '2027-01-01'))],
    ['2.0.0 con un registro huérfano', 409, 'ERR-BACKUP-REFERENTIAL-INTEGRITY', () => legacyV2((e) => (e.records.weights[0].petId = '99999999-9999-4999-8999-999999999999'))],
    ['1.0.0 con una fecha sin forma RFC 3339', 422, 'ERR-BACKUP-SCHEMA-INVALID', () => legacyV1((e) => (e.pets[0].createdAt = 'ayer por la tarde'))],
  ])('[STATE-BACKUP-001][INV-BACKUP-001] %s → %i %s en vista previa e importación, ROLLED_BACK y sin cambios en base ni auditoría', async (_name, status, code, build) => {
    api = await createApi();
    const cookie = await api.login('andres');
    const before = { dump: api.dump(), audit: auditCount() };
    const text = build();
    const [p, r] = [await preview(cookie, text), await importFile(cookie, text)];
    const expected = { status, code, finalState: 'ROLLED_BACK' };
    expect([problemOf(p), problemOf(r), api.dump() === before.dump, auditCount()]).toEqual([expected, expected, true, before.audit]);
  });

  it.each([['0.9.0'], ['1.1.0'], ['2.1.0'], ['3.0.1'], ['4.0.0'], ['']])(
    '[ERR-BACKUP-VERSION-UNSUPPORTED][STATE-BACKUP-001] schemaVersion %j → 422 ERR-BACKUP-VERSION-UNSUPPORTED con ROLLED_BACK en vista previa e importación, sin intentar migrar',
    async (schemaVersion) => {
      api = await createApi();
      const cookie = await api.login('andres');
      const before = api.dump();
      const text = legacyV2((e) => (e.schemaVersion = schemaVersion));
      const [p, r] = [await preview(cookie, text), await importFile(cookie, text)];
      const expected = { status: 422, code: 'ERR-BACKUP-VERSION-UNSUPPORTED', finalState: 'ROLLED_BACK' };
      expect([problemOf(p), problemOf(r), api.dump() === before]).toEqual([expected, expected, true]);
    },
  );
});
