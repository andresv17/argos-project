import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DomainError, type PetProfile } from '../../src/generated/index.ts';
import type { LegacyHouseholdMember as HouseholdMember } from '../../src/domain/households/household-policies.ts';
import {
  assertCanRead,
  assertCanWrite,
  canRead,
  canWrite,
  type AccessMembership,
} from '../../src/domain/access/access-policy.ts';

const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), 'specs/001-pet-health-tracker/contracts/examples/canonical-fixtures.json'), 'utf8'),
);
const [andres, maria, carlos, lucia] = fixtures.users as Array<{ id: string }>;
const members: HouseholdMember[] = fixtures.householdMembers;
const argos: PetProfile = fixtures.validBackupEnvelopeV2.pets[0];
const luna: PetProfile = fixtures.otherUserPets[0];
const HOUSE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const HOUSE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';

function catchDomainError(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Se esperaba un DomainError');
}

const membership = (userId: string, householdId: string, status: AccessMembership['status']): AccessMembership => ({
  userId,
  householdId,
  status,
});

describe('política de acceso (src/domain/access/access-policy.ts)', () => {
  it('[INV-ACC-001] el dueño lee su mascota aunque no tenga ningún hogar', () => {
    expect(canRead(andres!, argos, [])).toBe(true);
    expect(argos.ownerUserId).toBe(andres!.id);
  });

  it('[INV-ACC-001] un miembro ACTIVE lee las mascotas de otro miembro ACTIVE del mismo hogar, en ambos sentidos', () => {
    expect(canRead(maria!, argos, members)).toBe(true);
    expect(canRead(andres!, luna, members)).toBe(true);
  });

  it('[INV-ACC-001] Carlos (INVITED) y Lucía (sin hogar) no leen a Argos (EDGE-008)', () => {
    expect(canRead(carlos!, argos, members)).toBe(false);
    expect(canRead(lucia!, argos, members)).toBe(false);
    const error = catchDomainError(() => assertCanRead(carlos!, argos, members));
    expect(error.code).toBe('ERR-PET-NOT-FOUND');
    expect(error.status).toBe(404);
    expect(error.invariantRef).toBe('INV-ACC2-001');
    expect(error.field).toBe('petId');
  });

  it('[INV-ACC-001] solo la membresía ACTIVE de los dos usuarios en el mismo hogar da lectura', () => {
    for (const status of ['INVITED', 'DECLINED', 'CANCELLED', 'LEFT', 'REMOVED'] as const) {
      const readerNotActive = [membership(andres!.id, HOUSE_A, 'ACTIVE'), membership(lucia!.id, HOUSE_A, status)];
      const ownerNotActive = [membership(andres!.id, HOUSE_A, status), membership(lucia!.id, HOUSE_A, 'ACTIVE')];
      expect(canRead(lucia!, argos, readerNotActive)).toBe(false);
      expect(canRead(lucia!, argos, ownerNotActive)).toBe(false);
    }
    const differentHouseholds = [membership(andres!.id, HOUSE_A, 'ACTIVE'), membership(lucia!.id, HOUSE_B, 'ACTIVE')];
    expect(canRead(lucia!, argos, differentHouseholds)).toBe(false);
    const sharedSecondHousehold = [
      ...differentHouseholds,
      membership(andres!.id, HOUSE_B, 'ACTIVE'),
    ];
    expect(canRead(lucia!, argos, sharedSecondHousehold)).toBe(true);
  });

  it('[INV-ACC-001] assertCanRead devuelve la misma mascota y trata null o undefined como inexistente', () => {
    expect(assertCanRead(maria!, argos, members)).toBe(argos);
    expect(catchDomainError(() => assertCanRead(andres!, null, members)).code).toBe('ERR-PET-NOT-FOUND');
    expect(catchDomainError(() => assertCanRead(andres!, undefined, members)).code).toBe('ERR-PET-NOT-FOUND');
  });

  it('[INV-ACC-002][ERR-ACC-FORBIDDEN] María puede leer pero no escribir en Argos: 403 (EDGE-009)', () => {
    expect(canWrite(maria!, argos)).toBe(false);
    const error = catchDomainError(() => assertCanWrite(maria!, argos, members));
    expect(error.code).toBe('ERR-ACC-FORBIDDEN');
    expect(error.status).toBe(403);
    expect(error.invariantRef).toBe('INV-ACC2-002');
    expect(error.field).toBe('petId');
  });

  it('[INV-ACC-002] quien no puede leer recibe ERR-PET-NOT-FOUND al escribir, no ERR-ACC-FORBIDDEN', () => {
    expect(catchDomainError(() => assertCanWrite(carlos!, argos, members)).code).toBe('ERR-PET-NOT-FOUND');
    expect(catchDomainError(() => assertCanWrite(lucia!, argos, [])).code).toBe('ERR-PET-NOT-FOUND');
    expect(catchDomainError(() => assertCanWrite(andres!, null, members)).code).toBe('ERR-PET-NOT-FOUND');
  });

  it('[INV-ACC-002] solo el dueño escribe, con o sin hogar', () => {
    expect(canWrite(andres!, argos)).toBe(true);
    expect(assertCanWrite(andres!, argos, [])).toBe(argos);
    expect(assertCanWrite(maria!, luna, members)).toBe(luna);
    expect(canWrite(andres!, luna)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 002: rol efectivo y visibilidad por asignación (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002).
// Firma supuesta (la spec no la fija; T244 la implementa en src/domain/access/effective-role.ts):
//   effectiveRole(usuario, mascota, membresías con rol, asignaciones mascota-hogar) -> RbacRole | null
// Las cargas son dinámicas dentro de cada caso para que cada prueba falle por separado mientras no exista el módulo.
// ---------------------------------------------------------------------------

type Role002 = 'OWNER' | 'ADMIN' | 'CAREGIVER' | 'READER';
type Action002 =
  | 'EDIT_PET_BASICS'
  | 'DELETE_PET'
  | 'WRITE_HEALTH_EVENTS'
  | 'DELETE_HEALTH_EVENTS'
  | 'WRITE_WEIGHTS_AND_MEASUREMENTS'
  | 'WRITE_APPOINTMENTS_AND_PARAMETERS'
  | 'DELETE_OTHER_RECORDS'
  | 'MANAGE_HOUSEHOLD_MEMBERS'
  | 'TRANSFER_PET_OWNERSHIP'
  | 'ASSIGN_PET_TO_HOUSEHOLDS'
  | 'EXPORT_IMPORT_BACKUP';
type Status002 = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'CANCELLED' | 'LEFT' | 'REMOVED';
interface Membership002 {
  userId: string;
  householdId: string;
  status: Status002;
  role: Exclude<Role002, 'OWNER'>;
}
interface Assignment002 {
  petId: string;
  householdId: string;
}
type EffectiveRoleFn = (
  user: { id: string },
  pet: { id: string; ownerUserId: string },
  memberships: readonly Membership002[],
  assignments: readonly Assignment002[],
) => Role002 | null;
type CanFn = (role: Role002, action: Action002) => boolean;

const HOUSE_C = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03';
const ALL_ACTIONS: readonly Action002[] = [
  'EDIT_PET_BASICS',
  'DELETE_PET',
  'WRITE_HEALTH_EVENTS',
  'DELETE_HEALTH_EVENTS',
  'WRITE_WEIGHTS_AND_MEASUREMENTS',
  'WRITE_APPOINTMENTS_AND_PARAMETERS',
  'DELETE_OTHER_RECORDS',
  'MANAGE_HOUSEHOLD_MEMBERS',
  'TRANSFER_PET_OWNERSHIP',
  'ASSIGN_PET_TO_HOUSEHOLDS',
  'EXPORT_IMPORT_BACKUP',
];

const loadEffectiveRole = async (): Promise<EffectiveRoleFn> =>
  (await import('../../src/domain/access/effective-role.ts')).effectiveRole as EffectiveRoleFn;
const loadCan = async (): Promise<CanFn> => (await import('../../src/domain/access/rbac.ts')).can as CanFn;

const member002 = (
  userId: string,
  householdId: string,
  status: Status002,
  role: Exclude<Role002, 'OWNER'>,
): Membership002 => ({ userId, householdId, status, role });
const assign002 = (householdId: string, petId: string = argos!.id): Assignment002 => ({ petId, householdId });

describe('rol efectivo y visibilidad por asignación (REQ-RBAC-001, INV-ACC2-001, INV-ACC2-002)', () => {
  it('[REQ-RBAC-001] el Propietario Legal tiene rol OWNER sin hogares ni asignaciones', async () => {
    const effectiveRole = await loadEffectiveRole();
    expect(effectiveRole(andres!, argos!, [], [])).toBe('OWNER');
  });

  it('[REQ-RBAC-001] el dueño manda: su membresía READER en un hogar con la mascota asignada no le quita OWNER', async () => {
    const effectiveRole = await loadEffectiveRole();
    const memberships = [member002(andres!.id, HOUSE_A, 'ACTIVE', 'READER')];
    expect(effectiveRole(andres!, argos!, memberships, [assign002(HOUSE_A)])).toBe('OWNER');
  });

  it('[REQ-RBAC-001] Cuidador en un hogar y Lector en otro, ambos con la mascota asignada: rol efectivo CAREGIVER en ambos órdenes', async () => {
    const effectiveRole = await loadEffectiveRole();
    const memberships = [
      member002(maria!.id, HOUSE_A, 'ACTIVE', 'CAREGIVER'),
      member002(maria!.id, HOUSE_B, 'ACTIVE', 'READER'),
    ];
    const assignments = [assign002(HOUSE_A), assign002(HOUSE_B)];
    expect(effectiveRole(maria!, argos!, memberships, assignments)).toBe('CAREGIVER');
    expect(effectiveRole(maria!, argos!, [...memberships].reverse(), [...assignments].reverse())).toBe('CAREGIVER');
  });

  it('[REQ-RBAC-001] con tres hogares asignados gana ADMIN sobre CAREGIVER y READER', async () => {
    const effectiveRole = await loadEffectiveRole();
    const memberships = [
      member002(maria!.id, HOUSE_A, 'ACTIVE', 'READER'),
      member002(maria!.id, HOUSE_B, 'ACTIVE', 'CAREGIVER'),
      member002(maria!.id, HOUSE_C, 'ACTIVE', 'ADMIN'),
    ];
    const assignments = [assign002(HOUSE_A), assign002(HOUSE_B), assign002(HOUSE_C)];
    expect(effectiveRole(maria!, argos!, memberships, assignments)).toBe('ADMIN');
  });

  it('[INV-ACC2-001] un ADMIN de un hogar donde la mascota NO está asignada no obtiene rol ni visibilidad', async () => {
    const effectiveRole = await loadEffectiveRole();
    const memberships = [member002(maria!.id, HOUSE_B, 'ACTIVE', 'ADMIN')];
    expect(effectiveRole(maria!, argos!, memberships, [assign002(HOUSE_A)])).toBeNull();
  });

  it('[INV-ACC2-001] INVITED, DECLINED, CANCELLED, LEFT y REMOVED no otorgan rol aunque el hogar tenga la mascota asignada', async () => {
    const effectiveRole = await loadEffectiveRole();
    for (const status of ['INVITED', 'DECLINED', 'CANCELLED', 'LEFT', 'REMOVED'] as const) {
      const memberships = [member002(lucia!.id, HOUSE_A, status, 'ADMIN')];
      expect(effectiveRole(lucia!, argos!, memberships, [assign002(HOUSE_A)])).toBeNull();
    }
  });

  it('[INV-ACC2-001] una membresía ACTIVE en un hogar al que la mascota no está asignada no hace visible la mascota', async () => {
    const effectiveRole = await loadEffectiveRole();
    const memberships = [member002(lucia!.id, HOUSE_B, 'ACTIVE', 'READER')];
    expect(effectiveRole(lucia!, argos!, memberships, [assign002(HOUSE_A)])).toBeNull();
  });

  it('[INV-ACC2-001] sin ninguna membresía el usuario no tiene rol sobre la mascota ajena', async () => {
    const effectiveRole = await loadEffectiveRole();
    expect(effectiveRole(lucia!, argos!, [], [assign002(HOUSE_A)])).toBeNull();
  });

  it('[INV-ACC2-001] una asignación de otra mascota no cuenta para esta mascota', async () => {
    const effectiveRole = await loadEffectiveRole();
    const memberships = [member002(maria!.id, HOUSE_A, 'ACTIVE', 'ADMIN')];
    expect(effectiveRole(maria!, argos!, memberships, [assign002(HOUSE_A, luna!.id)])).toBeNull();
  });

  it('[INV-ACC2-002][REQ-RBAC-001] un Cuidador asignado registra eventos sanitarios pero no edita el perfil ni elimina la mascota', async () => {
    const effectiveRole = await loadEffectiveRole();
    const can = await loadCan();
    const role = effectiveRole(maria!, argos!, [member002(maria!.id, HOUSE_A, 'ACTIVE', 'CAREGIVER')], [assign002(HOUSE_A)]);
    expect(role).toBe('CAREGIVER');
    expect(can(role!, 'WRITE_HEALTH_EVENTS')).toBe(true);
    expect(can(role!, 'EDIT_PET_BASICS')).toBe(false);
    expect(can(role!, 'DELETE_PET')).toBe(false);
  });

  it('[INV-ACC2-001][INV-ACC2-002] sin rol efectivo, ninguna acción de la mascota ajena queda permitida (usa can solo con rol no nulo)', async () => {
    const effectiveRole = await loadEffectiveRole();
    const can = await loadCan();
    const role = effectiveRole(lucia!, argos!, [member002(lucia!.id, HOUSE_B, 'ACTIVE', 'ADMIN')], [assign002(HOUSE_A)]);
    expect(role).toBeNull();
    const allowed = ALL_ACTIONS.filter((action) => role !== null && can(role, action));
    expect(allowed).toEqual([]);
  });
});
