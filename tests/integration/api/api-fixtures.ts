import { ANDRES, CARLOS, HOUSEHOLD, LUCIA, MARIA } from '../../fixtures/application-harness.ts';

/** Datos de las pruebas HTTP de (sobre el estado canónico de contracts/examples/canonical-fixtures.json). */
export const H1 = HOUSEHOLD.id;
export const ARGOS_ID = '11111111-1111-4111-8111-111111111101';
export const KIRA_ID = '11111111-1111-4111-8111-111111111102';
export const LUNA_ID = '11111111-1111-4111-8111-111111111201';
export const USERS_BY_NAME = { andres: ANDRES, maria: MARIA, carlos: CARLOS, lucia: LUCIA } as const;

export const NEW_PET = { name: 'Lucía', species: 'CANINE', breed: 'Mestiza', birthDate: '2024-03-01', sex: 'FEMALE', avatarUrl: null };

export const RECORD_INPUTS = {
  weights: { recordedAt: '2026-11-04', weightKg: 32.85, notes: null },
  measurements: { recordedAt: '2026-11-04', neckCm: 47, chestCm: 79, backLengthCm: 65.5, waistCm: 59 },
  vaccinations: { vaccineName: 'Rabia', appliedAt: '2026-11-04', nextBoosterAt: '2027-11-04' },
  dewormings: { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-11-04', nextSuggestedDoseAt: '2027-02-04' },
  visits: { visitDate: '2026-11-04', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral' },
  'custom-parameters': { recordedAt: '2026-11-04', category: 'OTHER', title: 'Paseo largo', description: 'Caminó 10 km sin fatiga.' },
} as const;
