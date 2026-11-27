import { describe, expect, it } from 'vitest';
import { can, type PetAction, type RbacRole } from '../../src/domain/access/rbac.ts';
import { ALL_PET_ACTIONS, canActOnPet, type ActOnPetAction } from '../../src/domain/access/can-act-on-pet.ts';
import type { CoOwnerStatus } from '../../src/domain/pet/co-ownership.ts';

/**
 * T1614 (Feature 012, Bloque A, #22): pruebas ROJAS de `canActOnPet(user, pet, action, households)` (`src/domain/access/can-act-on-pet.ts`), la ÚNICA función de autoridad sobre una mascota (REQ-OWN12-010, INV-ACC2-002 enmendado).
 * Fallan hoy porque el módulo no existe (lo crea T1621; T1616 fija la parte de co-propiedad). Firma SUPUESTA por este archivo: `pet` lleva `coOwners` (filas de `pet_co_owners`) y `households` las membresías y
 * asignaciones de la 002 (mismo contenido que `effectiveRole`). Devuelve `boolean`: quien no tiene lectura recibe el 404 uniforme por otra vía (`assertCanRead`), aquí solo importa permitir o no.
 *
 * @implements REQ-OWN12-005, REQ-OWN12-010, INV-ACC2-001, INV-ACC2-002, INV-OWN12-002, REQ-RBAC-001
 * Cubre SC-012-007, SC-012-012.
 */
const PRINCIPAL = 'a0000000-0000-4000-8000-000000000001';
const COOWNER = 'a0000000-0000-4000-8000-000000000002';
const HADMIN = 'a0000000-0000-4000-8000-000000000003';
const CAREGIVER = 'a0000000-0000-4000-8000-000000000004';
const READER = 'a0000000-0000-4000-8000-000000000005';
const STRANGER = 'a0000000-0000-4000-8000-000000000006';
const OPERATOR = 'a0000000-0000-4000-8000-000000000007';
const PET = 'b0000000-0000-4000-8000-0000000000c1';
const OTHER_PET = 'b0000000-0000-4000-8000-0000000000c2';
const H1 = 'c0000000-0000-4000-8000-000000000001';

const memberships = [
  { userId: HADMIN, householdId: H1, status: 'ACTIVE', role: 'ADMIN' as const },
  { userId: CAREGIVER, householdId: H1, status: 'ACTIVE', role: 'CAREGIVER' as const },
  { userId: READER, householdId: H1, status: 'ACTIVE', role: 'READER' as const },
];
const households = { memberships, assignments: [{ petId: PET, householdId: H1 }] };
const coOwners = (status: CoOwnerStatus, userId: string = COOWNER) => [{ userId, status }];
const pet = (rows: ReadonlyArray<{ userId: string | null; status: CoOwnerStatus }> = coOwners('ACTIVE')) => ({ id: PET, ownerUserId: PRINCIPAL, coOwners: rows });

const ACTIONS: readonly PetAction[] = ['EDIT_PET_BASICS', 'DELETE_PET', 'WRITE_HEALTH_EVENTS', 'DELETE_HEALTH_EVENTS', 'WRITE_WEIGHTS_AND_MEASUREMENTS', 'WRITE_APPOINTMENTS_AND_PARAMETERS', 'DELETE_OTHER_RECORDS', 'MANAGE_HOUSEHOLD_MEMBERS', 'TRANSFER_PET_OWNERSHIP', 'ASSIGN_PET_TO_HOUSEHOLDS', 'EXPORT_IMPORT_BACKUP', 'READ_MEDIA', 'WRITE_MEDIA', 'DELETE_MEDIA', 'CREATE_SHARE_LINK'];

describe('T1614 [REQ-OWN12-010][SC-012-012] canActOnPet: matriz acciones × roles', () => {
  it('el catálogo de acciones de la función cubre exactamente las 15 acciones de la matriz de la 002 (la prueba de matriz no deja casos sin cubrir)', () => {
    expect([...ALL_PET_ACTIONS].sort()).toEqual([...ACTIONS].sort());
  });

  it.each(ACTIONS)('principal %s: el rol OWNER de la matriz', (action) => {
    expect(canActOnPet({ id: PRINCIPAL }, pet(), action, households)).toBe(can('OWNER', action));
  });

  it.each(ACTIONS)('co-propietario ACTIVE %s: paridad con el principal (co-propietario ≡ Propietario Legal) salvo el respaldo, que solo exporta el principal (D12-05)', (action) => {
    const expected = action === 'EXPORT_IMPORT_BACKUP' ? false : can('OWNER', action);
    expect(canActOnPet({ id: COOWNER }, pet(), action, households)).toBe(expected);
  });

  it.each([
    ['ADMIN', HADMIN],
    ['CAREGIVER', CAREGIVER],
    ['READER', READER],
  ] as const)('%s de hogar con la mascota asignada: exactamente la fila de su rol; el respaldo es solo del principal', (role: Exclude<RbacRole, 'OWNER'>, userId) => {
    for (const action of ACTIONS) {
      const expected = action === 'EXPORT_IMPORT_BACKUP' ? false : can(role, action);
      expect(canActOnPet({ id: userId }, pet(), action, households), `${role} ${action}`).toBe(expected);
    }
  });

  it('un miembro de hogar con la mascota NO asignada a su hogar no puede nada (INV-ACC2-001)', () => {
    const elsewhere = { memberships, assignments: [{ petId: OTHER_PET, householdId: H1 }] };
    for (const action of ACTIONS) expect(canActOnPet({ id: HADMIN }, pet(), action, elsewhere), action).toBe(false);
  });

  it.each(['INVITED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'LEFT', 'PROMOTED', 'ENDED'] as const)('una fila de co-propiedad %s no lee ni escribe: ninguna acción (INV-ACC2-001 enmendado)', (status) => {
    for (const action of ACTIONS) expect(canActOnPet({ id: COOWNER }, pet(coOwners(status)), action, households), `${status} ${action}`).toBe(false);
  });

  it('un tercero y un OPERATOR de plataforma (sin relación con la mascota) no pueden ninguna acción', () => {
    for (const action of ACTIONS) {
      expect(canActOnPet({ id: STRANGER }, pet(), action, households), `tercero ${action}`).toBe(false);
      expect(canActOnPet({ id: OPERATOR, platformRole: 'OPERATOR' }, pet(), action, households), `operator ${action}`).toBe(false);
    }
  });

  it('una fila ACTIVE con user_id nulo (cuenta suprimida) no otorga nada a nadie', () => {
    for (const action of ACTIONS) expect(canActOnPet({ id: STRANGER }, pet([{ userId: null, status: 'ACTIVE' }]), action, households), action).toBe(false);
  });

  it('el ID del principal manda sobre las filas: un principal sin filas de co-propiedad sigue siendo OWNER (compatibilidad con las mascotas existentes)', () => {
    for (const action of ACTIONS) expect(canActOnPet({ id: PRINCIPAL }, pet([]), action, households), action).toBe(can('OWNER', action));
  });
});

describe('T1614 [SC-012-007][INV-OWN12-002] nadie elimina ni degrada a otro propietario', () => {
  it('ninguna acción del catálogo expulsa, degrada o elimina a otro propietario', () => {
    for (const action of ALL_PET_ACTIONS) expect(action, action).not.toMatch(/REMOVE|EXPEL|KICK|DEMOTE|ENDCOOWN|END_CO_OWNER|REVOKE_OWNER/i);
  });

  it('las acciones de expulsión inexistentes se deniegan a TODOS (principal, co-propietario, ADMIN de hogar, OPERATOR y terceros)', () => {
    for (const forbidden of ['REMOVE_CO_OWNER', 'EXPEL_CO_OWNER', 'DEMOTE_CO_OWNER', 'END_CO_OWNERSHIP']) {
      for (const user of [{ id: PRINCIPAL }, { id: COOWNER }, { id: HADMIN }, { id: OPERATOR, platformRole: 'OPERATOR' as const }, { id: STRANGER }]) {
        expect(canActOnPet(user, pet(), forbidden as unknown as ActOnPetAction, households), `${forbidden} ${user.id}`).toBe(false);
      }
    }
  });
});
