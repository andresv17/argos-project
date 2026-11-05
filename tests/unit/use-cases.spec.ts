import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from '../support/test-harness.ts';
import { DomainError } from '../../src/generated/index.ts';
import {
  GetPetDashboardUseCase,
  ListPetsOverviewUseCase,
  RegisterPetUseCase,
  UpdatePetUseCase,
} from '../../src/application/use-cases/pet-use-cases.ts';
import {
  AddBodyMeasurementUseCase,
  AddCustomParameterUseCase,
  AddDewormingUseCase,
  AddMedicalVisitUseCase,
  AddVaccinationUseCase,
  AddWeightRecordUseCase,
} from '../../src/application/use-cases/record-use-cases.ts';
import {
  DeterministicIdAdapter,
  FixedClockAdapter,
} from '../../src/infrastructure/adapters/deterministic-adapters.ts';
import { InMemoryTransactionalRepository } from '../../src/infrastructure/storage/transactional-repository.ts';

const seedDataRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/seed-data.json'), 'utf8')
);

function createTestHarness() {
  const repository = new InMemoryTransactionalRepository();
  const clock = new FixedClockAdapter(
    seedDataRaw.fixedClock.todayIsoDate,
    seedDataRaw.fixedClock.nowIsoTimestamp
  );
  const idGen = new DeterministicIdAdapter(seedDataRaw.deterministicUuidSequence);

  return {
    repository,
    clock,
    idGen,
    registerPet: new RegisterPetUseCase(repository, clock, idGen),
    updatePet: new UpdatePetUseCase(repository, clock),
    getDashboard: new GetPetDashboardUseCase(repository, clock),
    listOverview: new ListPetsOverviewUseCase(repository, clock),
    addWeight: new AddWeightRecordUseCase(repository, clock, idGen),
    addMeasurement: new AddBodyMeasurementUseCase(repository, clock, idGen),
    addVaccination: new AddVaccinationUseCase(repository, clock, idGen),
    addDeworming: new AddDewormingUseCase(repository, clock, idGen),
    addVisit: new AddMedicalVisitUseCase(repository, clock, idGen),
    addCustomParam: new AddCustomParameterUseCase(repository, clock, idGen),
  };
}

describe('Application Use Cases: Pet Profiles, 6 Clinical Modules & Data Isolation [REQ-PET-001..003, REQ-REC-001..006, INV-PET-003]', () => {
  it('[REQ-PET-001][INV-PET-001][STATE-PET-QUOTA-001][ERR-PET-QUOTA-EXCEEDED] registra hasta 2 perros y 2 gatos y bloquea el quinto o tercer de la misma especie', () => {
    const h = createTestHarness();

    const dog1 = h.registerPet.execute({
      name: 'Argos',
      species: 'DOG',
      breed: 'Pastor Alemán',
      birthDate: '2022-05-10',
      sex: 'MALE',
    });
    expect(dog1.id).toBe('11111111-1111-4111-8111-111111111101');

    const dog2 = h.registerPet.execute({
      name: 'Kira',
      species: 'DOG',
      breed: 'Border Collie',
      birthDate: '2023-08-20',
      sex: 'FEMALE',
    });
    expect(dog2.id).toBe('11111111-1111-4111-8111-111111111102');

    // Tercer perro debe fallar con ERR-PET-QUOTA-EXCEEDED
    let thirdDogError: DomainError | null = null;
    try {
      h.registerPet.execute({
        name: 'Rex',
        species: 'DOG',
        breed: 'Labrador',
        birthDate: '2024-01-01',
        sex: 'MALE',
      });
    } catch (err) {
      if (err instanceof DomainError) thirdDogError = err;
    }
    expect(thirdDogError?.code).toBe('ERR-PET-QUOTA-EXCEEDED');

    const cat1 = h.registerPet.execute({
      name: 'Nyx',
      species: 'CAT',
      breed: 'Bombay',
      birthDate: '2021-11-05',
      sex: 'FEMALE',
    });
    const cat2 = h.registerPet.execute({
      name: 'Milo',
      species: 'CAT',
      breed: 'Europeo Común',
      birthDate: '2024-02-14',
      sex: 'MALE',
    });
    expect(cat1.species).toBe('CAT');
    expect(cat2.species).toBe('CAT');

    const overview = h.listOverview.execute();
    expect(overview.quota.state).toBe('FULL_QUOTA');
    expect(overview.quota.totalPets).toBe(4);
    expect(overview.quota.canAddDog).toBe(false);
    expect(overview.quota.canAddCat).toBe(false);
  });

  it('[REQ-PET-003][REQ-REC-001..006][INV-PET-003] aísla el 100% de los 6 módulos clínicos por petId sin mezclar expedientes entre mascotas', () => {
    const h = createTestHarness();

    const argos = h.registerPet.execute({
      name: 'Argos',
      species: 'DOG',
      breed: 'Pastor Alemán',
      birthDate: '2022-05-10',
      sex: 'MALE',
    });
    const nyx = h.registerPet.execute({
      name: 'Nyx',
      species: 'CAT',
      breed: 'Bombay',
      birthDate: '2021-11-05',
      sex: 'FEMALE',
    });

    // Registrar los 6 módulos para Argos
    h.addWeight.execute({
      petId: argos.id,
      recordedAt: '2026-10-01',
      weightKg: 32.0,
      notes: 'Control 1',
    });
    const w2 = h.addWeight.execute({
      petId: argos.id,
      recordedAt: '2026-11-01',
      weightKg: 32.5,
      notes: 'Control 2',
    });
    expect(w2.deltaKg).toBe(0.5);

    h.addMeasurement.execute({
      petId: argos.id,
      recordedAt: '2026-11-01',
      neckCm: 46,
      chestCm: 78,
      backLengthCm: 65,
      waistCm: 58,
    });

    const vac = h.addVaccination.execute({
      petId: argos.id,
      vaccineName: 'Séxtuple Canina',
      appliedAt: '2025-11-12',
      nextBoosterAt: '2026-11-12',
      batchOrClinic: 'VetCentral',
    });
    expect(vac.alert.status).toBe('DUE_SOON');
    expect(vac.alert.daysRemaining).toBe(7);

    const dew = h.addDeworming.execute({
      petId: argos.id,
      productBrand: 'NexGard',
      dewormingType: 'EXTERNAL',
      appliedAt: '2026-11-01',
      nextSuggestedDoseAt: '2026-12-01',
    });
    expect(dew.alert.status).toBe('UP_TO_DATE');

    h.addVisit.execute({
      petId: argos.id,
      visitDate: '2026-09-15',
      reason: 'Control anual',
      diagnosis: 'Excelente condición',
      treatment: 'Preventivo habitual',
      clinicOrVet: 'VetCentral',
    });

    h.addCustomParam.execute({
      petId: argos.id,
      recordedAt: '2026-10-15',
      category: 'DIET_CHANGE',
      title: 'Dieta de salmón',
      description: 'Cambio progresivo de pienso',
    });

    const argosDashboard = h.getDashboard.execute(argos.id);
    const nyxDashboard = h.getDashboard.execute(nyx.id);

    expect(argosDashboard.weights).toHaveLength(2);
    expect(argosDashboard.bodyMeasurements).toHaveLength(1);
    expect(argosDashboard.vaccinations).toHaveLength(1);
    expect(argosDashboard.dewormings).toHaveLength(1);
    expect(argosDashboard.medicalVisits).toHaveLength(1);
    expect(argosDashboard.customParameters).toHaveLength(1);
    expect(argosDashboard.alertsSummary.dueSoonCount).toBe(1);

    // El expediente de Nyx debe estar 100% vacío y aislado
    expect(nyxDashboard.weights).toHaveLength(0);
    expect(nyxDashboard.bodyMeasurements).toHaveLength(0);
    expect(nyxDashboard.vaccinations).toHaveLength(0);
    expect(nyxDashboard.dewormings).toHaveLength(0);
    expect(nyxDashboard.medicalVisits).toHaveLength(0);
    expect(nyxDashboard.customParameters).toHaveLength(0);
    expect(nyxDashboard.alertsSummary.totalActiveAlerts).toBe(0);
  });

  it('[INV-PET-003][ERR-PET-NOT-FOUND] lanza ERR-PET-NOT-FOUND al consultar o registrar eventos sobre un petId inexistente', () => {
    const h = createTestHarness();
    const missingId = '00000000-0000-4000-8000-000000000000';

    let dashError: DomainError | null = null;
    try {
      h.getDashboard.execute(missingId);
    } catch (err) {
      if (err instanceof DomainError) dashError = err;
    }
    expect(dashError?.code).toBe('ERR-PET-NOT-FOUND');
    expect(dashError?.status).toBe(404);

    let weightError: DomainError | null = null;
    try {
      h.addWeight.execute({
        petId: missingId,
        recordedAt: '2026-11-01',
        weightKg: 10,
      });
    } catch (err) {
      if (err instanceof DomainError) weightError = err;
    }
    expect(weightError?.code).toBe('ERR-PET-NOT-FOUND');

    let updateError: DomainError | null = null;
    try {
      h.updatePet.execute({
        petId: missingId,
        name: 'Fantasma',
      });
    } catch (err) {
      if (err instanceof DomainError) updateError = err;
    }
    expect(updateError?.code).toBe('ERR-PET-NOT-FOUND');
  });
});
