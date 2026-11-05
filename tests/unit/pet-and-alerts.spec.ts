import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainError, type PetProfile } from '../../src/generated/index.ts';
import {
  assertCanRegisterPetSpecies,
  assertCanUpdatePetSpecies,
  evaluatePetQuotaState,
  validatePetCollectionInvariants,
} from '../../src/domain/pet/pet-invariants.ts';
import {
  evaluateDewormingAlerts,
  evaluateSanitaryAlertState,
  evaluateVaccinationAlerts,
  summarizeSanitaryAlerts,
} from '../../src/domain/alerts/sanitary-alert-evaluator.ts';

const canonicalFixturesRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'contracts/examples/canonical-fixtures.json'), 'utf8')
);
const canonicalPets: PetProfile[] = canonicalFixturesRaw.validBackupEnvelope.pets;
const FIXED_TODAY = '2026-11-05';

describe('Domain: Pet Quota Invariants & Sanitary Alert State Machine [REQ-PET-001, INV-PET-001, INV-PET-004, STATE-PET-QUOTA-001, STATE-ALERT-001]', () => {
  it('[STATE-PET-QUOTA-001][INV-PET-001] transita correctamente entre EMPTY -> PARTIAL -> FULL_QUOTA', () => {
    const emptyState = evaluatePetQuotaState([]);
    expect(emptyState).toEqual({
      state: 'EMPTY',
      totalPets: 0,
      dogsCount: 0,
      catsCount: 0,
      canAddDog: true,
      canAddCat: true,
    });

    const twoDogsState = evaluatePetQuotaState(canonicalPets.slice(0, 2));
    expect(twoDogsState).toEqual({
      state: 'PARTIAL',
      totalPets: 2,
      dogsCount: 2,
      catsCount: 0,
      canAddDog: false,
      canAddCat: true,
    });

    const fullState = evaluatePetQuotaState(canonicalPets);
    expect(fullState).toEqual({
      state: 'FULL_QUOTA',
      totalPets: 4,
      dogsCount: 2,
      catsCount: 2,
      canAddDog: false,
      canAddCat: false,
    });
  });

  it('[INV-PET-001][ERR-PET-QUOTA-EXCEEDED] rechaza el registro de un 3er perro cuando ya existen 2 perros (EDGE-001)', () => {
    const twoDogs = canonicalPets.slice(0, 2);
    let caughtError: DomainError | null = null;
    try {
      assertCanRegisterPetSpecies(twoDogs, 'DOG');
    } catch (err) {
      if (err instanceof DomainError) {
        caughtError = err;
      }
    }
    expect(caughtError?.code).toBe('ERR-PET-QUOTA-EXCEEDED');
    expect(caughtError?.status).toBe(409);
    expect(caughtError?.invariantRef).toBe('INV-PET-001');
  });

  it('[INV-PET-001][ERR-PET-QUOTA-EXCEEDED] rechaza el registro de un 3er gato o una 5ta mascota', () => {
    const twoCats = canonicalPets.slice(2, 4);
    let caughtCatError: DomainError | null = null;
    try {
      assertCanRegisterPetSpecies(twoCats, 'CAT');
    } catch (err) {
      if (err instanceof DomainError) {
        caughtCatError = err;
      }
    }
    expect(caughtCatError?.code).toBe('ERR-PET-QUOTA-EXCEEDED');

    let caughtFullError: DomainError | null = null;
    try {
      assertCanRegisterPetSpecies(canonicalPets, 'DOG');
    } catch (err) {
      if (err instanceof DomainError) {
        caughtFullError = err;
      }
    }
    expect(caughtFullError?.code).toBe('ERR-PET-QUOTA-EXCEEDED');
  });

  it('[INV-PET-004][ERR-PET-QUOTA-EXCEEDED] impide cambiar la especie de un gato a perro si ya hay 2 perros registrados', () => {
    // 2 perros (Argos, Kira) + 1 gato (Nyx)
    const threePets = canonicalPets.slice(0, 3);
    const nyxId = canonicalPets[2]!.id;

    let caughtError: DomainError | null = null;
    try {
      assertCanUpdatePetSpecies(threePets, nyxId, 'DOG');
    } catch (err) {
      if (err instanceof DomainError) {
        caughtError = err;
      }
    }
    expect(caughtError?.code).toBe('ERR-PET-QUOTA-EXCEEDED');
    expect(caughtError?.status).toBe(409);

    // Mantener la misma especie CAT para Nyx sí está permitido
    assertCanUpdatePetSpecies(threePets, nyxId, 'CAT');
    validatePetCollectionInvariants(canonicalPets, FIXED_TODAY);
  });

  it('[STATE-ALERT-001] evalúa umbrales exactos: OVERDUE (< 0d), DUE_SOON (0..15d), UP_TO_DATE (> 15d) y SUPERSEDED', () => {
    // -1 día -> OVERDUE
    const overdue = evaluateSanitaryAlertState('2026-11-04', FIXED_TODAY, false);
    expect(overdue.status).toBe('OVERDUE');
    expect(overdue.uiBadge).toBe('DANGER_RED');
    expect(overdue.daysRemaining).toBe(-1);
    expect(overdue.isActiveAlert).toBe(true);

    // 0 días -> DUE_SOON (límite inferior inclusivo)
    const dueToday = evaluateSanitaryAlertState('2026-11-05', FIXED_TODAY, false);
    expect(dueToday.status).toBe('DUE_SOON');
    expect(dueToday.uiBadge).toBe('WARNING_AMBER');
    expect(dueToday.daysRemaining).toBe(0);
    expect(dueToday.isActiveAlert).toBe(true);

    // 15 días -> DUE_SOON (límite superior inclusivo)
    const dueIn15 = evaluateSanitaryAlertState('2026-11-20', FIXED_TODAY, false);
    expect(dueIn15.status).toBe('DUE_SOON');
    expect(dueIn15.daysRemaining).toBe(15);
    expect(dueIn15.isActiveAlert).toBe(true);

    // 16 días -> UP_TO_DATE
    const upToDate = evaluateSanitaryAlertState('2026-11-21', FIXED_TODAY, false);
    expect(upToDate.status).toBe('UP_TO_DATE');
    expect(upToDate.uiBadge).toBe('SUCCESS_GREEN');
    expect(upToDate.daysRemaining).toBe(16);
    expect(upToDate.isActiveAlert).toBe(false);

    // Reemplazado por dosis más reciente -> SUPERSEDED
    const superseded = evaluateSanitaryAlertState('2025-10-01', FIXED_TODAY, true);
    expect(superseded.status).toBe('SUPERSEDED');
    expect(superseded.uiBadge).toBe('NEUTRAL_GRAY');
    expect(superseded.isActiveAlert).toBe(false);
  });

  it('[STATE-ALERT-001][REQ-REC-003][REQ-REC-004] marca dosis anteriores de la misma vacuna o tipo de desparasitación como SUPERSEDED', () => {
    const vaccinations = [
      {
        id: '44444444-4444-4444-8444-444444444401',
        petId: '11111111-1111-4111-8111-111111111101',
        vaccineName: 'Rabia Anual',
        appliedAt: '2024-10-01',
        nextBoosterAt: '2025-10-01', // Estaría vencida, pero hay una más reciente
        batchOrClinic: 'Vet A',
        notes: null,
        createdAt: '2024-10-01T10:00:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        petId: '11111111-1111-4111-8111-111111111101',
        vaccineName: '  rabia anual ',
        appliedAt: '2025-11-12',
        nextBoosterAt: '2026-11-12', // A 7 días -> DUE_SOON
        batchOrClinic: 'Vet B',
        notes: null,
        createdAt: '2025-11-12T10:00:00.000Z',
      },
    ];

    const evaluatedVac = evaluateVaccinationAlerts(vaccinations, FIXED_TODAY);
    expect(evaluatedVac[0]?.id).toBe('44444444-4444-4444-8444-444444444402');
    expect(evaluatedVac[0]?.alert.status).toBe('DUE_SOON');
    expect(evaluatedVac[1]?.id).toBe('44444444-4444-4444-8444-444444444401');
    expect(evaluatedVac[1]?.alert.status).toBe('SUPERSEDED');

    const dewormings = evaluateDewormingAlerts(
      canonicalFixturesRaw.validBackupEnvelope.records.dewormings,
      FIXED_TODAY
    );
    expect(dewormings[0]?.alert.status).toBe('UP_TO_DATE');

    const summary = summarizeSanitaryAlerts(evaluatedVac, dewormings);
    expect(summary).toEqual({
      overdueCount: 0,
      dueSoonCount: 1,
      upToDateCount: 1,
      totalActiveAlerts: 1,
    });
  });
});
