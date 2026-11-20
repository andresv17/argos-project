/**
 * T524 [US1] casos de uso con `breedCode` (SC-CAT-003, SC-CAT-004): alta y edición, `breed` derivado (rótulo; texto libre con
 * `*_OTHER`; «Otra» por defecto), `breed` distinto del rótulo rechazado y mascota antigua sin `breedCode` (REQ-RAZ-002,
 * REQ-RAZ-003, INV-RAZ-001).
 */
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/generated/index.ts';
import { GetPetDashboardUseCase, ListMyPetsUseCase, RegisterPetUseCase } from '../../src/application/use-cases/pet-use-cases.ts';
import { stateHash } from '../../src/domain/audit/state-hash.ts';
import { ANDRES, ARGOS, createHarness, petUpdater } from '../fixtures/application-harness.ts';

const BASE = { name: 'Rocky', birthDate: '2024-06-01', sex: 'MALE' };

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    if (error instanceof DomainError) return `${error.code}@${String(error.field)}`;
    throw error;
  }
}

describe('T524 alta con breedCode (REQ-RAZ-002)', () => {
  it('SC-CAT-003: DOG_CRIOLLA sin breed queda con breed «Criolla»', async () => {
    const { deps, uow } = createHarness();
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'CANINE', breedCode: 'DOG_CRIOLLA' });
    expect([pet.species, pet.breedCode, pet.breed]).toEqual(['CANINE', 'DOG_CRIOLLA', 'Criolla']);
    expect(uow.snapshot().pets.find((p) => p.id === pet.id)).toMatchObject({ breedCode: 'DOG_CRIOLLA', breed: 'Criolla' });
  });

  it('SC-CAT-003: DOG_OTHER con «Pastor Maremmano» guarda el texto libre; sin texto, «Otra»', async () => {
    const { deps } = createHarness();
    const register = new RegisterPetUseCase(deps);
    const free = await register.execute(ANDRES, { ...BASE, species: 'CANINE', breedCode: 'DOG_OTHER', breed: 'Pastor Maremmano' });
    const none = await register.execute(ANDRES, { ...BASE, species: 'CANINE', breedCode: 'DOG_OTHER' });
    expect([free.breedCode, free.breed, none.breedCode, none.breed]).toEqual(['DOG_OTHER', 'Pastor Maremmano', 'DOG_OTHER', 'Otra']);
  });

  it('REQ-RAZ-002: un gato con CAT_SIAMES y el rótulo exacto en breed es válido', async () => {
    const { deps } = createHarness();
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'FELINE', breedCode: 'CAT_SIAMES', breed: 'Siamés' });
    expect([pet.breedCode, pet.breed]).toEqual(['CAT_SIAMES', 'Siamés']);
  });

  it('SC-CAT-004: DOG_CRIOLLA con breed «Golden» se rechaza en breed', async () => {
    const { deps, uow } = createHarness();
    const before = uow.snapshot();
    expect(await outcome(new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'CANINE', breedCode: 'DOG_CRIOLLA', breed: 'Golden' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breed');
    expect(uow.snapshot()).toEqual(before);
  });

  it('SC-CAT-004: RABBIT con DOG_CRIOLLA y FELINE con DOG_CRIOLLA se rechazan en breedCode', async () => {
    const { deps } = createHarness();
    const register = new RegisterPetUseCase(deps);
    expect(await outcome(register.execute(ANDRES, { ...BASE, species: 'RABBIT', breed: 'Enano', breedCode: 'DOG_CRIOLLA' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breedCode');
    expect(await outcome(register.execute(ANDRES, { ...BASE, species: 'FELINE', breedCode: 'DOG_CRIOLLA' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breedCode');
  });

  it('INV-RAZ-001: un código de formato válido que no está en el catálogo se rechaza en breedCode', async () => {
    const { deps } = createHarness();
    expect(await outcome(new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'CANINE', breedCode: 'DOG_NO_EXISTE' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breedCode');
  });

  it('REQ-RAZ-003: las 6 especies sin catálogo siguen con breed de texto libre y breedCode nulo', async () => {
    const { deps } = createHarness();
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'RABBIT', breed: 'Cabeza de león' });
    expect([pet.breedCode, pet.breed]).toEqual([null, 'Cabeza de león']);
    expect(await outcome(new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'RABBIT' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breed');
  });

  it('REQ-RAZ-003: un perro sin breedCode con raza libre (cliente anterior) sigue aceptándose con breedCode nulo', async () => {
    const { deps } = createHarness();
    const pet = await new RegisterPetUseCase(deps).execute(ANDRES, { ...BASE, species: 'CANINE', breed: 'Golden' });
    expect([pet.breedCode, pet.breed]).toEqual([null, 'Golden']);
  });
});

describe('T524 edición con breedCode (REQ-RAZ-003, INV-RAZ-001)', () => {
  it('SC-CAT-004: una mascota antigua (sin breedCode) editada solo en su nombre conserva breed y expone breedCode nulo', async () => {
    const { deps, uow } = createHarness();
    const legacy = uow.snapshot().pets.find((p) => p.id === ARGOS.id);
    expect(legacy?.breedCode).toBeUndefined();
    const updated = await petUpdater(deps).execute(ANDRES, ARGOS.id, { name: 'Argos Magno' });
    expect([updated.name, updated.breed, updated.breedCode]).toEqual(['Argos Magno', ARGOS.breed, null]);
  });

  it('REQ-RAZ-003: elegir una raza del catálogo en la edición deriva breed del rótulo', async () => {
    const { deps } = createHarness();
    const updated = await petUpdater(deps).execute(ANDRES, ARGOS.id, { breedCode: 'DOG_BEAGLE' });
    expect([updated.breedCode, updated.breed]).toEqual(['DOG_BEAGLE', 'Beagle']);
  });

  it('REQ-RAZ-002: con DOG_OTHER la edición guarda el texto libre; editar el nombre después lo conserva', async () => {
    const { deps } = createHarness();
    const update = petUpdater(deps);
    const other = await update.execute(ANDRES, ARGOS.id, { breedCode: 'DOG_OTHER', breed: 'Pastor Maremmano' });
    expect([other.breedCode, other.breed]).toEqual(['DOG_OTHER', 'Pastor Maremmano']);
    const renamed = await update.execute(ANDRES, ARGOS.id, { name: 'Argos II' });
    expect([renamed.breedCode, renamed.breed]).toEqual(['DOG_OTHER', 'Pastor Maremmano']);
  });

  it('SC-CAT-004: un breed distinto del rótulo con un código de catálogo se rechaza, incluso si el código ya estaba guardado', async () => {
    const { deps } = createHarness();
    const update = petUpdater(deps);
    await update.execute(ANDRES, ARGOS.id, { breedCode: 'DOG_BEAGLE' });
    expect(await outcome(update.execute(ANDRES, ARGOS.id, { breed: 'Golden' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breed');
    expect(await outcome(update.execute(ANDRES, ARGOS.id, { breedCode: 'DOG_CRIOLLA', breed: 'Golden' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breed');
  });

  it('INV-RAZ-001: cambiar la especie sin cambiar el breedCode deja un estado incoherente y se rechaza; con breedCode nulo y raza libre se acepta', async () => {
    const { deps } = createHarness();
    const update = petUpdater(deps);
    await update.execute(ANDRES, ARGOS.id, { breedCode: 'DOG_BEAGLE' });
    expect(await outcome(update.execute(ANDRES, ARGOS.id, { species: 'RABBIT' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breedCode');
    expect(await outcome(update.execute(ANDRES, ARGOS.id, { species: 'FELINE', breedCode: 'DOG_CRIOLLA' }))).toBe('ERR-SCHEMA-VALIDATION-FAILED@breedCode');
    const rabbit = await update.execute(ANDRES, ARGOS.id, { species: 'RABBIT', breedCode: null, breed: 'Enano' });
    expect([rabbit.species, rabbit.breedCode, rabbit.breed]).toEqual(['RABBIT', null, 'Enano']);
  });

  it('REQ-RAZ-003: el listado y el panel exponen breedCode (nulo en mascotas antiguas)', async () => {
    const { deps } = createHarness();
    await petUpdater(deps).execute(ANDRES, ARGOS.id, { breedCode: 'DOG_BEAGLE' });
    const cards = await new ListMyPetsUseCase(deps).execute(ANDRES);
    expect(cards.find((c) => c.profile.id === ARGOS.id)?.profile.breedCode).toBe('DOG_BEAGLE');
    expect(cards.filter((c) => c.profile.id !== ARGOS.id).every((c) => c.profile.breedCode === null)).toBe(true);
    const dashboard = await new GetPetDashboardUseCase(deps).execute(ANDRES, ARGOS.id);
    expect([dashboard.profile.breedCode, dashboard.profile.breed]).toEqual(['DOG_BEAGLE', 'Beagle']);
  });
});

describe('T524 hash canónico de la auditoría con breedCode (REQ-AUD-001)', () => {
  it('el hash de estado cambia cuando cambia breedCode y la edición deja previous y new distintos', async () => {
    const { deps, uow } = createHarness();
    const before = uow.snapshot().pets.find((p) => p.id === ARGOS.id)!;
    const after = await petUpdater(deps).execute(ANDRES, ARGOS.id, { breedCode: 'DOG_BEAGLE' });
    expect(stateHash(after)).not.toBe(stateHash(before));
    expect(stateHash({ ...after, breedCode: 'DOG_BOXER' })).not.toBe(stateHash(after));
  });
});
