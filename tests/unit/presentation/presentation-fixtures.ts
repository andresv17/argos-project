import type { HouseholdMemberView, HouseholdView, PetCardView, PetDashboardView, Schemas } from '../../../src/presentation/web/view-model.ts';

/**
 * Vistas del contrato 3.0.0 para las pruebas de presentación de la 002 (formas de contracts/openapi): `permissions` y
 * `myRole` de mascota (OWNER, ADMIN, CAREGIVER, READER), roles de hogar ADMIN/CAREGIVER/READER con `isHouseholdOwner`,
 * `pendingInvitations` aparte de `members` (solo ACTIVE), 8 especies y `WeightEntryView` con `deltaKg` sin `deltaPercent`.
 * Sustituye a los fixtures de la 001 según la fila 21 de la tabla de sustitución (T284).
 */
export const ME = '22222222-2222-4222-8222-222222222201';
export const OTHER = '22222222-2222-4222-8222-222222222202';
export const INVITEE = '22222222-2222-4222-8222-222222222203';
export const HOUSE = '33333333-3333-4333-8333-333333333301';
const TS = '2026-11-01T10:00:00.000Z';

type PetRole = Schemas['PetEffectiveRole'];
type Species = Schemas['Species'];

/** Matriz REQ-RBAC-001 proyectada sobre una mascota (los 9 permisos que la API envía en `permissions`). */
const PERMISSIONS_BY_ROLE: Readonly<Record<PetRole, Schemas['PetPermissions']>> = {
  OWNER: { editPetBasics: true, deletePet: true, writeHealthEvents: true, deleteHealthEvents: true, writeWeightsAndMeasurements: true, writeAppointmentsAndParameters: true, deleteOtherRecords: true, transferPetOwnership: true, assignPetToHouseholds: true },
  ADMIN: { editPetBasics: true, deletePet: false, writeHealthEvents: true, deleteHealthEvents: true, writeWeightsAndMeasurements: true, writeAppointmentsAndParameters: true, deleteOtherRecords: true, transferPetOwnership: false, assignPetToHouseholds: false },
  CAREGIVER: { editPetBasics: false, deletePet: false, writeHealthEvents: true, deleteHealthEvents: false, writeWeightsAndMeasurements: true, writeAppointmentsAndParameters: false, deleteOtherRecords: false, transferPetOwnership: false, assignPetToHouseholds: false },
  READER: { editPetBasics: false, deletePet: false, writeHealthEvents: false, deleteHealthEvents: false, writeWeightsAndMeasurements: false, writeAppointmentsAndParameters: false, deleteOtherRecords: false, transferPetOwnership: false, assignPetToHouseholds: false },
};
export const permissionsOf = (role: PetRole): Schemas['PetPermissions'] => ({ ...PERMISSIONS_BY_ROLE[role] });

export function profile(id: string, name: string, ownerUserId = ME, species: Species = 'CANINE'): Schemas['PetProfile'] {
  return {
    id,
    ownerUserId,
    name,
    species,
    speciesOther: species === 'OTHER' ? 'Erizo' : null,
    breed: 'Mestiza',
    birthDate: '2020-05-01',
    birthDateIsEstimate: false,
    sex: 'MALE',
    neutered: null,
    microchipId: null,
    avatarUrl: null,
    createdAt: TS,
    updatedAt: TS,
  } as Schemas['PetProfile'];
}

export function card(id: string, name: string, options: { owner?: string; ownerName?: string; color?: Schemas['OwnerColorToken'] | null; role?: PetRole; species?: Species } = {}): PetCardView {
  const owner = options.owner ?? ME;
  const role = options.role ?? 'OWNER';
  return {
    profile: profile(id, name, owner, options.species ?? 'CANINE'),
    owner: { userId: owner, displayName: options.ownerName ?? 'Andrés', colorToken: options.color ?? null },
    myRole: role,
    permissions: permissionsOf(role),
    computedAge: { years: 6, months: 6, totalDays: 2383 },
    alertsSummary: { overdueCount: 1, dueSoonCount: 2, upToDateCount: 0, totalActiveAlerts: 3 },
    globalAlertStatus: 'OVERDUE',
    latestWeightKg: 32.4,
  };
}

export const alert = (status: Schemas['AlertStatus'], daysRemaining: number, label: string, uiBadge: Schemas['AlertStateMetadata']['uiBadge']): Schemas['AlertStateMetadata'] => ({
  status,
  uiBadge,
  label,
  isActiveAlert: status === 'OVERDUE' || status === 'DUE_SOON',
  daysRemaining,
});

/** `WeightEntryView` 3.0.0: solo `record` y `deltaKg` (diferencia exacta, sin `deltaPercent`). */
export function weight(id: string, recordedAt: string, weightKg: number, deltaKg: number | null): Schemas['WeightEntryView'] {
  return { record: { id, petId: 'p', recordedAt, weightKg, notes: null, createdAt: TS }, deltaKg };
}

/** Ficha de «Argos» vista con el rol efectivo dado: OWNER es propia; los demás roles la ven por el hogar (dueña María). */
export function dashboard(role: PetRole = 'OWNER', color: Schemas['OwnerColorToken'] | null = null): PetDashboardView {
  const own = role === 'OWNER';
  const base = card('44444444-4444-4444-8444-444444444401', 'Argos', { role, color, owner: own ? ME : OTHER, ownerName: own ? 'Andrés' : 'María' });
  return {
    profile: base.profile,
    owner: base.owner,
    myRole: role,
    permissions: base.permissions,
    computedAge: base.computedAge,
    alertsSummary: base.alertsSummary,
    weights: [weight('w2', '2026-02-10', 32.4, -0.45), weight('w1', '2026-01-10', 32.85, null)],
    bodyMeasurements: [],
    vaccinations: [
      {
        record: { id: 'v1', petId: base.profile.id, category: 'VACCINE', vaccineName: 'Rabia', appliedAt: '2025-01-01', nextBoosterAt: '2025-06-01', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null, createdAt: TS },
        alert: alert('OVERDUE', -5, 'Vencida', 'DANGER_RED'),
      },
    ],
    supersededVaccinations: [],
    dewormings: [],
    supersededDewormings: [],
    medicalVisits: [],
    customParameters: [],
  };
}

const user = (id: string, username: string, displayName: string): Schemas['UserPublicProfile'] => ({ id, username, displayName, createdAt: TS });

/** Miembro ACTIVE (el contrato 3.0.0 solo lista ACTIVE en `members`); `isOwner` marca al propietario del hogar. */
export function member(userId: string, username: string, displayName: string, role: Schemas['HouseholdRole'], isOwner: boolean, color: Schemas['OwnerColorToken'] | null): HouseholdMemberView {
  return {
    membership: { membershipId: `m-${userId}`, householdId: HOUSE, userId, username, displayName, role, isHouseholdOwner: isOwner, status: 'ACTIVE', joinedAt: TS, firstJoinedAt: TS, updatedAt: TS },
    colorToken: color,
  };
}

export const invitationView = (roleOnJoin: Schemas['HouseholdRole'] = 'READER'): Schemas['InvitationView'] => ({
  roleOnJoin,
  household: { id: HOUSE, name: 'Casa', ownerUserId: ME, createdAt: TS },
  invitedBy: user(ME, 'andres', 'Andrés'),
  invitedAt: TS,
});

/**
 * Hogar «Casa» visto por quien mira: `OWNER` es el propietario (rol ADMIN con `isHouseholdOwner`) y ve la invitación
 * INVITED de Lucía en `pendingInvitations`; `ADMIN` la ve también sin ser propietario; `CAREGIVER` y `READER` no.
 */
export function household(viewer: 'OWNER' | 'ADMIN' | 'CAREGIVER' | 'READER'): HouseholdView {
  const owner = viewer === 'OWNER';
  const myRole: Schemas['HouseholdRole'] = owner ? 'ADMIN' : viewer;
  const members = [
    member(ME, 'andres', 'Andrés', 'ADMIN', true, 'OWNER_COLOR_1'),
    member(OTHER, 'maria', 'María', owner ? 'CAREGIVER' : myRole, false, 'OWNER_COLOR_2'),
  ];
  const sees = owner || viewer === 'ADMIN';
  return {
    household: { id: HOUSE, name: 'Casa', ownerUserId: ME, createdAt: TS },
    myRole,
    isHouseholdOwner: owner,
    members,
    pendingInvitations: sees
      ? [{ invitationId: '55555555-5555-4555-8555-555555555501', householdId: HOUSE, inviteeUsername: 'lucia', roleOnJoin: 'READER', invitedByUserId: ME, status: 'INVITED', createdAt: TS, respondedAt: null }]
      : [],
  };
}
