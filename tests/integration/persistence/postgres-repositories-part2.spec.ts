/**
 * T423 (REQ-PG-002, INV-PET-005, REQ-PET2-001): repositorios de PostgreSQL, parte 2 (mascotas, pesos y los 5 módulos clínicos),
 * verificados con un doble del cliente: SQL parametrizado `$n` sin interpolación, orden de columnas, microchip único por
 * propietario (lo impone el índice parcial; el repositorio no lo oculta) y cascadas. El módulo se importa de forma dinámica
 * para que cada prueba falle por separado mientras falte la parte 2 (pruebas primero).
 * La conformidad contra Postgres real vive en postgres-repositories.spec.ts (se OMITE sin TEST_DATABASE_URL).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DomainError, type PetProfile } from '../../../src/generated/index.ts';
import type { MedicalRecordRepositoryPort, PetRepositoryPort } from '../../../src/application/ports/repositories.port.ts';
import type { PetRecordCollections } from '../../../src/domain/pet/pet-invariants.ts';
import type { RecordModule, RecordOf } from '../../../src/domain/records/record-invariants.ts';
import { ARGOS, envelope } from '../../fixtures/application-harness.ts';
import { upgradeRecords } from '../../fixtures/storage-upgrade.ts';
import { expectParametrized, fakeClient, type Reply } from '../../fixtures/pg-fake-client.ts';

const MODULE_PATH = '../../../src/infrastructure/persistence/postgres/postgres-repositories.ts';
interface Part2 {
  pets: PetRepositoryPort;
  records: MedicalRecordRepositoryPort;
}
const load = async () =>
  (await import(/* @vite-ignore */ MODULE_PATH)) as { createPostgresRepositoriesPart2(client: unknown): Part2 };
async function repos(...replies: Reply[]) {
  const client = fakeClient(...replies);
  const { createPostgresRepositoriesPart2 } = await load();
  return { client, r: createPostgresRepositoriesPart2(client) };
}

const HOSTILE = "x'; DROP TABLE pets; --";
const COLS = 'id, owner_user_id, data, species, species_other, neutered, microchip_id, birth_date_is_estimate, life_status, deceased_at, version, biography';
const CHIP = '123456789012345';
const PET: PetProfile = { ...ARGOS, species: 'FELINE', neutered: true, microchipId: CHIP, birthDateIsEstimate: true };
/** Lo que devuelve el repositorio: la ficha sin los campos de 007 se lee ALIVE, sin fecha y en versión 1. */
const PET_READ = { ...PET, lifeStatus: 'ALIVE', deceasedAt: null, version: 1 } as PetProfile;
const petRow = (pet: PetProfile = PET, over: Record<string, unknown> = {}) => ({
  id: pet.id,
  owner_user_id: pet.ownerUserId,
  data: pet,
  species: pet.species,
  species_other: pet.speciesOther,
  neutered: pet.neutered === null ? null : pet.neutered ? 1 : 0,
  microchip_id: pet.microchipId,
  birth_date_is_estimate: pet.birthDateIsEstimate ? 1 : 0,
  life_status: pet.lifeStatus ?? 'ALIVE', // 007 (0010): la columna es la autoridad de estado, fecha y versión
  deceased_at: pet.deceasedAt ?? null,
  version: pet.version ?? 1,
  biography: pet.biography ?? null, // 008 (0012): la columna es la autoridad de la biografía
  ...over,
});

describe('mascotas (T423, REQ-PG-002, INV-PET-005, REQ-PET2-001)', () => {
  it('findById: SELECT con las 12 columnas en orden y un parámetro; devuelve la mascota; sin fila devuelve null', async () => {
    const { client, r } = await repos({ rows: [petRow()] }, { rows: [] });
    expect(await r.pets.findById(PET.id)).toEqual(PET_READ);
    expect(await r.pets.findById(HOSTILE)).toBeNull();
    expect(client.calls).toEqual([
      { sql: `SELECT ${COLS} FROM pets WHERE id = $1`, values: [PET.id] },
      { sql: `SELECT ${COLS} FROM pets WHERE id = $1`, values: [HOSTILE] },
    ]);
    expectParametrized(client.calls);
  });

  it('findById: una columna que no coincide con data es dato corrupto (ERR-INTERNAL-UNEXPECTED)', async () => {
    for (const over of [{ species: 'CANINE' }, { microchip_id: '999999999999999' }, { neutered: 0 }, { birth_date_is_estimate: 0 }, { owner_user_id: 'otro' }]) {
      const { r } = await repos({ rows: [petRow(PET, over)] });
      await expect(r.pets.findById(PET.id)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
  });

  it('listByOwners: una sola consulta con ANY($1::text[]) y el arreglo como único valor', async () => {
    const { client, r } = await repos({ rows: [petRow()] });
    expect(await r.pets.listByOwners([PET.ownerUserId, 'otro'])).toEqual([PET_READ]);
    expect(client.calls).toEqual([{ sql: `SELECT ${COLS} FROM pets WHERE owner_user_id = ANY($1::text[])`, values: [[PET.ownerUserId, 'otro']] }]);
  });

  it('save: UPSERT con las 12 columnas en orden más el indicador de versión explícita; neutered y estimado como 0/1/null; sin interpolación', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 1 });
    await r.pets.save(PET);
    await r.pets.save({ ...PET, neutered: null, microchipId: null, birthDateIsEstimate: false });
    expect(client.calls[0]!.sql).toBe(
      `INSERT INTO pets (${COLS}) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, data = EXCLUDED.data, species = EXCLUDED.species, species_other = EXCLUDED.species_other, neutered = EXCLUDED.neutered, microchip_id = EXCLUDED.microchip_id, birth_date_is_estimate = EXCLUDED.birth_date_is_estimate, life_status = EXCLUDED.life_status, deceased_at = EXCLUDED.deceased_at, biography = EXCLUDED.biography, version = CASE WHEN $13 = 1 THEN EXCLUDED.version ELSE pets.version + 1 END`,
    );
    const [first, second] = client.calls;
    expect(first!.values.filter((_, i) => i !== 2)).toEqual([PET.id, PET.ownerUserId, 'FELINE', null, 1, CHIP, 1, 'ALIVE', null, 1, null, 0]); // sin `version` explícita: indicador 0 (incrementa sobre la fila existente)
    expect(JSON.parse(first!.values[2] as string)).toEqual(PET);
    expect(second!.values.filter((_, i) => i !== 2)).toEqual([PET.id, PET.ownerUserId, 'FELINE', null, null, null, 0, 'ALIVE', null, 1, null, 0]);
    expectParametrized(client.calls);
  });

  it('[REQ-FAL7-001][REQ-FAL7-011] save con una fallecida y versión explícita: columnas life_status/deceased_at/version y `data` sin `version`; findById devuelve las columnas como autoridad', async () => {
    const dead = { ...PET, lifeStatus: 'DECEASED', deceasedAt: '2026-10-01', version: 5 } as PetProfile;
    const { client, r } = await repos({ rowCount: 1 }, { rows: [petRow(dead)] });
    await r.pets.save(dead);
    const [call] = client.calls;
    expect(call!.values.filter((_, i) => i !== 2)).toEqual([PET.id, PET.ownerUserId, 'FELINE', null, 1, CHIP, 1, 'DECEASED', '2026-10-01', 5, null, 1]);
    expect(Object.keys(JSON.parse(call!.values[2] as string) as object)).not.toContain('version');
    expect(await r.pets.findById(PET.id)).toEqual(dead);
  });

  it('[REQ-FAL7-001] una fila cuya columna life_status o deceased_at no coincide con `data` es dato corrupto (ERR-INTERNAL-UNEXPECTED)', async () => {
    for (const over of [{ life_status: 'DECEASED' }, { deceased_at: '2026-10-01' }]) {
      const { r } = await repos({ rows: [petRow(PET, over)] });
      await expect(r.pets.findById(PET.id)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
  });

  it('save rechaza una mascota inválida sin emitir SQL', async () => {
    const { client, r } = await repos();
    await expect(r.pets.save({ ...PET, species: 'DRAGON' } as unknown as PetProfile)).rejects.toBeInstanceOf(DomainError);
    expect(client.calls).toEqual([]);
  });

  it('save es UPSERT (no REPLACE ni DELETE+INSERT): reemplazar una mascota no dispara la cascada de sus registros', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.pets.save(PET);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(client.calls[0]!.sql).not.toMatch(/DELETE|REPLACE/);
  });

  it('unicidad global de microchip (REQ-PET4-001): la violación 23505 del índice pets_microchip_global se propaga intacta desde el adaptador (la mapea el caso de uso)', async () => {
    const violation = Object.assign(new Error('duplicate key value violates unique constraint "pets_microchip_global"'), { code: '23505', constraint: 'pets_microchip_global' });
    const { client, r } = await repos({ error: violation });
    await expect(r.pets.save({ ...PET, id: '11111111-1111-4111-8111-1111111111ff' })).rejects.toBe(violation);
    expect(client.calls).toHaveLength(1);
  });

  it('el mismo microchip en propietarios distintos viaja con su propio owner_user_id (el adaptador no filtra: la unicidad global la impone el índice)', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 1 });
    await r.pets.save(PET);
    await r.pets.save({ ...PET, id: '11111111-1111-4111-8111-1111111111fe', ownerUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02' });
    expect(client.calls.map((c) => [c.values[1], c.values[6]])).toEqual([
      [PET.ownerUserId, CHIP],
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', CHIP],
    ]);
  });

  it('delete (cascada INV-PET-005): una sola sentencia DELETE; las filas de los 6 módulos caen por ON DELETE CASCADE', async () => {
    const { client, r } = await repos({ rowCount: 1 });
    await r.pets.delete(HOSTILE);
    expect(client.calls).toEqual([{ sql: 'DELETE FROM pets WHERE id = $1', values: [HOSTILE] }]);
  });
});

const MODULES: ReadonlyArray<{ module: RecordModule; table: string }> = [
  { module: 'weights', table: 'weights' },
  { module: 'bodyMeasurements', table: 'body_measurements' },
  { module: 'vaccinations', table: 'vaccinations' },
  { module: 'dewormings', table: 'dewormings' },
  { module: 'medicalVisits', table: 'medical_visits' },
  { module: 'customParameters', table: 'custom_parameters' },
];
const sample = <M extends RecordModule>(module: M): RecordOf<M> => (upgradeRecords(envelope.records as unknown as PetRecordCollections) as unknown as Record<M, RecordOf<M>[]>)[module][0]!;

describe('registros clínicos (T423, REQ-PG-002, INV-PET-005)', () => {
  it.each(MODULES)('add $module: INSERT en $table con (id, pet_id, data, revision) y data como JSONB sin revision (D-16 A); pesos añade weight_grams', async ({ module, table }) => {
    const { client, r } = await repos({ rowCount: 1 });
    const record = sample(module);
    await r.records.add(module, record);
    const call = client.calls[0]!;
    if (module === 'weights') {
      expect(call.sql).toBe(`INSERT INTO weights (id, pet_id, data, revision, weight_grams) VALUES ($1, $2, $3::jsonb, $4, $5)`);
      expect(call.values.filter((_, i) => i !== 2)).toEqual([record.id, record.petId, 0, 32400]);
    } else {
      expect(call.sql).toBe(`INSERT INTO ${table} (id, pet_id, data, revision) VALUES ($1, $2, $3::jsonb, $4)`);
      expect(call.values.filter((_, i) => i !== 2)).toEqual([record.id, record.petId, 0]);
    }
    expect(JSON.parse(call.values[2] as string)).toEqual(record);
    expectParametrized(client.calls);
  });

  it('add rechaza un registro inválido sin emitir SQL', async () => {
    const { client, r } = await repos();
    await expect(r.records.add('weights', { ...sample('weights'), weightKg: 'mucho' } as unknown as RecordOf<'weights'>)).rejects.toBeInstanceOf(DomainError);
    expect(client.calls).toEqual([]);
  });

  it('listForPet: 6 consultas fijas (sin N+1) en el orden de los módulos; pesos incluye weight_grams y se contrasta con data', async () => {
    const replies: Reply[] = MODULES.map(({ module }) => ({
      rows: [{ id: sample(module).id, pet_id: sample(module).petId, data: sample(module), revision: 0, ...(module === 'weights' ? { weight_grams: 32400 } : {}) }],
    }));
    const { client, r } = await repos(...replies);
    const lists = (await r.records.listForPet(sample('weights').petId)) as unknown as Record<RecordModule, unknown[]>;
    expect(client.calls.map((c) => c.sql)).toEqual(
      MODULES.map(({ module, table }) => `SELECT id, pet_id, data, revision${module === 'weights' ? ', weight_grams' : ''} FROM ${table} WHERE pet_id = $1`),
    );
    for (const { module } of MODULES) expect(lists[module]).toEqual([{ ...sample(module), revision: 0 }]);
    expectParametrized(client.calls);
  });

  it('listForPet: weight_grams distinto de data, o pet_id distinto, es dato corrupto (ERR-INTERNAL-UNEXPECTED)', async () => {
    const w = sample('weights');
    for (const row of [{ id: w.id, pet_id: w.petId, data: w, revision: 0, weight_grams: 1 }, { id: w.id, pet_id: 'otra', data: w, revision: 0, weight_grams: 32400 }]) {
      const { r } = await repos({ rows: [row] });
      await expect(r.records.listForPet(w.petId)).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    }
  });

  it('findPetIdOfRecord: UNION ALL de las 6 tablas con un único $1 y LIMIT 1', async () => {
    const { client, r } = await repos({ rows: [{ pet_id: 'p1' }] }, { rows: [] }, { rows: [{ pet_id: 7 }] });
    expect(await r.records.findPetIdOfRecord('r1')).toBe('p1');
    expect(await r.records.findPetIdOfRecord(HOSTILE)).toBeNull();
    await expect(r.records.findPetIdOfRecord('r3')).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expect(client.calls[0]!.sql).toBe(MODULES.map(({ table }) => `SELECT pet_id FROM ${table} WHERE id = $1`).join(' UNION ALL ') + ' LIMIT 1');
    expect(client.calls[0]!.values).toEqual(['r1']);
    expectParametrized(client.calls);
  });

  it('replace: UPDATE ... WHERE id y pet_id; pesos actualiza weight_grams; 0 filas falla con ERR-INTERNAL-UNEXPECTED', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 1 }, { rowCount: 0 });
    await r.records.replace('weights', sample('weights'));
    await r.records.replace('medicalVisits', sample('medicalVisits'));
    expect(client.calls[0]!.sql).toBe('UPDATE weights SET data = $1::jsonb, revision = $2, weight_grams = $3 WHERE id = $4 AND pet_id = $5');
    expect(client.calls[0]!.values.filter((_, i) => i !== 0)).toEqual([0, 32400, sample('weights').id, sample('weights').petId]);
    expect(client.calls[1]!.sql).toBe('UPDATE medical_visits SET data = $1::jsonb, revision = $2 WHERE id = $3 AND pet_id = $4');
    await expect(r.records.replace('weights', sample('weights'))).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
    expectParametrized(client.calls);
  });

  it('remove: DELETE ... WHERE id y pet_id; true solo si afectó exactamente 1 fila', async () => {
    const { client, r } = await repos({ rowCount: 1 }, { rowCount: 0 });
    expect(await r.records.remove('dewormings', 'p1', 'r1')).toBe(true);
    expect(await r.records.remove('dewormings', HOSTILE, 'r2')).toBe(false);
    expect(client.calls[0]).toEqual({ sql: 'DELETE FROM dewormings WHERE id = $1 AND pet_id = $2', values: ['r1', 'p1'] });
    expectParametrized(client.calls);
  });

  it('deleteForPet (cascada explícita): 6 DELETE por pet_id, uno por módulo y en orden', async () => {
    const { client, r } = await repos();
    await r.records.deleteForPet('p1');
    expect(client.calls).toEqual(MODULES.map(({ table }) => ({ sql: `DELETE FROM ${table} WHERE pet_id = $1`, values: ['p1'] })));
  });
});

describe('código fuente de la parte 2 (T423, INV-ARCH-006)', () => {
  const source = () => readFileSync(new URL(MODULE_PATH, import.meta.url), 'utf8');
  it('sigue sin leer process.env ni consultar schema_migrations tras añadir la parte 2', () => {
    expect(source()).toContain('createPostgresRepositoriesPart2');
    expect(source()).not.toMatch(/process\.env|schema_migrations/);
  });
});
