import type { PetCardView, PetDashboardView, Schemas } from '../../../src/presentation/web/view-model.ts';

/**
 * Fixtures de la Rebanada 6 con la forma del contrato 002: `myRole` y `permissions` (matriz REQ-RBAC-001) en lugar de
 * `canEdit`, las 8 especies y `supersededVaccinations`. Los permisos de cada rol son los de la matriz de la spec.
 */
export type Role = Schemas['PetEffectiveRole'];
export type Permissions = Schemas['PetPermissions'];

export const MATRIX: Readonly<Record<Role, Permissions>> = {
  OWNER: {
    editPetBasics: true,
    deletePet: true,
    writeHealthEvents: true,
    deleteHealthEvents: true,
    writeWeightsAndMeasurements: true,
    writeAppointmentsAndParameters: true,
    deleteOtherRecords: true,
    transferPetOwnership: true,
    assignPetToHouseholds: true,
  },
  ADMIN: {
    editPetBasics: true,
    deletePet: false,
    writeHealthEvents: true,
    deleteHealthEvents: true,
    writeWeightsAndMeasurements: true,
    writeAppointmentsAndParameters: true,
    deleteOtherRecords: true,
    transferPetOwnership: false,
    assignPetToHouseholds: false,
  },
  CAREGIVER: {
    editPetBasics: false,
    deletePet: false,
    writeHealthEvents: true,
    deleteHealthEvents: false,
    writeWeightsAndMeasurements: true,
    writeAppointmentsAndParameters: false,
    deleteOtherRecords: false,
    transferPetOwnership: false,
    assignPetToHouseholds: false,
  },
  READER: {
    editPetBasics: false,
    deletePet: false,
    writeHealthEvents: false,
    deleteHealthEvents: false,
    writeWeightsAndMeasurements: false,
    writeAppointmentsAndParameters: false,
    deleteOtherRecords: false,
    transferPetOwnership: false,
    assignPetToHouseholds: false,
  },
};

const TS = '2026-11-01T10:00:00.000Z';
export const PET_ID = '44444444-4444-4444-8444-444444444401';
const OWNER_ID = '22222222-2222-4222-8222-222222222202';

function profile(id: string, name: string, species: Schemas['Species']): Schemas['PetProfile'] {
  const wire = {
    id,
    ownerUserId: OWNER_ID,
    name,
    species,
    speciesOther: species === 'OTHER' ? 'Axolote' : null,
    breed: 'Mestiza',
    birthDate: '2020-05-01',
    birthDateIsEstimate: false,
    sex: 'MALE' as const,
    neutered: null,
    microchipId: null,
    avatarUrl: null,
    createdAt: TS,
    updatedAt: TS,
  };
  return wire as unknown as Schemas['PetProfile'];
}

/** Tarjeta de una mascota ajena (dueña María) vista con el rol efectivo `role` dentro de un hogar. */
export function cardAs(role: Role, id: string, name: string, color: Schemas['OwnerColorToken'] | null = 'OWNER_COLOR_5', species: Schemas['Species'] = 'CANINE'): PetCardView {
  return {
    profile: profile(id, name, species),
    owner: { userId: OWNER_ID, displayName: 'María', colorToken: color },
    myRole: role,
    permissions: MATRIX[role],
    computedAge: { years: 6, months: 6, totalDays: 2383 },
    alertsSummary: { overdueCount: 0, dueSoonCount: 1, upToDateCount: 1, totalActiveAlerts: 1 },
    globalAlertStatus: 'DUE_SOON',
    latestWeightKg: 12.5,
  } as unknown as PetCardView;
}

const alertOf = (status: Schemas['AlertStatus'], daysRemaining: number, label: string, uiBadge: Schemas['AlertStateMetadata']['uiBadge']): Schemas['AlertStateMetadata'] => ({
  status,
  uiBadge,
  label,
  isActiveAlert: status === 'OVERDUE' || status === 'DUE_SOON',
  daysRemaining,
});

const vaccination = (id: string, appliedAt: string, nextBoosterAt: string, alert: Schemas['AlertStateMetadata']): Schemas['VaccinationEntryView'] =>
  ({
    record: { id, petId: PET_ID, vaccineName: 'Rabia', appliedAt, nextBoosterAt, batchOrClinic: null, notes: null, createdAt: TS },
    alert,
  }) as unknown as Schemas['VaccinationEntryView'];

/** Ficha de la mascota ajena de María vista con el rol `role`; la vacuna Rabia antigua está reemplazada por la nueva. */
export function dashboardAs(role: Role): PetDashboardView {
  const base = cardAs(role, PET_ID, 'Argos');
  return {
    profile: base.profile,
    owner: base.owner,
    myRole: role,
    permissions: MATRIX[role],
    computedAge: base.computedAge,
    alertsSummary: base.alertsSummary,
    weights: [],
    bodyMeasurements: [],
    vaccinations: [vaccination('v2', '2026-10-01', '2027-10-01', alertOf('UP_TO_DATE', 321, 'Al día', 'SUCCESS_GREEN'))],
    supersededVaccinations: [vaccination('v1', '2025-10-01', '2026-10-01', alertOf('SUPERSEDED', -44, 'Histórico reemplazado', 'NEUTRAL_GRAY'))],
    dewormings: [],
    supersededDewormings: [],
    medicalVisits: [],
    customParameters: [],
  } as unknown as PetDashboardView;
}
