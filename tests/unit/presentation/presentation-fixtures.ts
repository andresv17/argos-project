import type { HouseholdMemberView, HouseholdView, PetCardView, PetDashboardView, Schemas } from '../../../src/presentation/web/view-model.ts';

/**
 * Vistas del contrato para las pruebas de presentación de (formas de contracts/openapi).
 * T284 PENDIENTE: estos fixtures siguen con la forma 001 (canEdit, OWNER/MEMBER, INVITED en members, DOG/CAT) y se
 * convierten con `as unknown as` solo para compilar; la tabla de sustitución (fila 21) los reescribe con permissions y roles 002.
 */
export const ME = '22222222-2222-4222-8222-222222222201';
export const OTHER = '22222222-2222-4222-8222-222222222202';
export const INVITEE = '22222222-2222-4222-8222-222222222203';
export const HOUSE = '33333333-3333-4333-8333-333333333301';
const TS = '2026-11-01T10:00:00.000Z';

/**
 * `openapi-types.ts` tipa `pet.schema` con su `$defs` (la API nunca lo envía; ver H-108-2): el perfil de prueba
 * tiene la forma real de la API y se convierte al tipo generado.
 */
export function profile(id: string, name: string, ownerUserId = ME, species: 'DOG' | 'CAT' = 'DOG'): Schemas['PetProfile'] {
  const wire = { id, ownerUserId, name, species, breed: 'Mestiza', birthDate: '2020-05-01', sex: 'MALE' as const, avatarUrl: null, createdAt: TS, updatedAt: TS };
  return wire as unknown as Schemas['PetProfile'];
}

export function card(id: string, name: string, options: { owner?: string; ownerName?: string; color?: Schemas['OwnerColorToken'] | null; canEdit?: boolean; species?: 'DOG' | 'CAT' } = {}): PetCardView {
  const owner = options.owner ?? ME;
  return {
    profile: profile(id, name, owner, options.species ?? 'DOG'),
    owner: { userId: owner, displayName: options.ownerName ?? 'Andrés', colorToken: options.color ?? null },
    canEdit: options.canEdit ?? true,
    computedAge: { years: 6, months: 6, totalDays: 2383 },
    alertsSummary: { overdueCount: 1, dueSoonCount: 2, upToDateCount: 0, totalActiveAlerts: 3 },
    latestWeightKg: 32.4,
  } as unknown as PetCardView;
}

export const alert = (status: Schemas['AlertStatus'], daysRemaining: number, label: string, uiBadge: Schemas['AlertStateMetadata']['uiBadge']): Schemas['AlertStateMetadata'] => ({
  status,
  uiBadge,
  label,
  isActiveAlert: status === 'OVERDUE' || status === 'DUE_SOON',
  daysRemaining,
});

export function weight(id: string, recordedAt: string, weightKg: number, deltaKg: number | null, deltaPercent: number | null): Schemas['WeightEntryView'] {
  return { record: { id, petId: 'p', recordedAt, weightKg, notes: null, createdAt: TS }, deltaKg, deltaPercent } as unknown as Schemas['WeightEntryView'];
}

export function dashboard(canEdit: boolean, color: Schemas['OwnerColorToken'] | null = null): PetDashboardView {
  const base = card('44444444-4444-4444-8444-444444444401', 'Argos', { canEdit, color, owner: canEdit ? ME : OTHER, ownerName: canEdit ? 'Andrés' : 'María' });
  return {
    profile: base.profile,
    owner: base.owner,
    canEdit,
    computedAge: base.computedAge,
    alertsSummary: base.alertsSummary,
    weights: [weight('w2', '2026-02-10', 32.4, -0.45, -1.37), weight('w1', '2026-01-10', 32.85, null, null)],
    bodyMeasurements: [],
    vaccinations: [
      {
        record: { id: 'v1', petId: base.profile.id, vaccineName: 'Rabia', appliedAt: '2025-01-01', nextBoosterAt: '2025-06-01', batchOrClinic: null, notes: null, createdAt: TS } as unknown as Schemas['VaccinationRecord'],
        alert: alert('OVERDUE', -5, 'Vencida', 'DANGER_RED'),
      },
    ],
    dewormings: [],
    medicalVisits: [],
    customParameters: [],
  } as unknown as PetDashboardView;
}

const user = (id: string, username: string, displayName: string): Schemas['UserPublicProfile'] => ({ id, username, displayName, createdAt: TS });

export function member(userId: string, username: string, displayName: string, role: 'OWNER' | 'MEMBER', status: 'ACTIVE' | 'INVITED', color: Schemas['OwnerColorToken'] | null): HouseholdMemberView {
  return {
    membership: {
      membershipId: `m-${userId}`,
      householdId: HOUSE,
      userId,
      role,
      status,
      invitedByUserId: role === 'OWNER' ? null : ME,
      invitedAt: role === 'OWNER' ? null : TS,
      joinedAt: status === 'ACTIVE' ? TS : null,
      firstJoinedAt: status === 'ACTIVE' ? TS : null,
      updatedAt: TS,
    },
    user: user(userId, username, displayName),
    colorToken: color,
  } as unknown as HouseholdMemberView;
}

/** Hogar "Casa" de ME (OWNER) con OTHER activo e INVITEE invitado; `myRole` según quién mira. */
export function household(myRole: 'OWNER' | 'MEMBER'): HouseholdView {
  const members = [member(ME, 'andres', 'Andrés', 'OWNER', 'ACTIVE', 'OWNER_COLOR_1'), member(OTHER, 'maria', 'María', 'MEMBER', 'ACTIVE', 'OWNER_COLOR_2')];
  return {
    household: { id: HOUSE, name: 'Casa', ownerUserId: ME, createdAt: TS },
    myRole,
    members: myRole === 'OWNER' ? [...members, member(INVITEE, 'lucia', 'Lucía', 'MEMBER', 'INVITED', null)] : members,
  } as unknown as HouseholdView;
}
