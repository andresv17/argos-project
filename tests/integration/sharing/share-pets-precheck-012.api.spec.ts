/**
 * T1695 (Feature 012, Bloque E, #81; `/keymaker`; lote de corrección tras `/oracle`, BAJA-1; ENM-005-E 0.2.2 annex §6): la creación `PETS` comprueba la membresía ACTIVE del creador en el hogar ANTES de
 * tomar ningún bloqueo (mascota o candado del hogar). Un usuario sin relación con el hogar recibe el mismo `404` de siempre y NO adquiere bloqueos sobre mascotas ni hogar ajenos. Para un usuario
 * válido el orden de §6 no cambia: bloqueo por mascota (`pet_id ASC`) → candado del hogar.
 *
 * @implements REQ-VET12-001, LK-02, EDGE-012-075
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ShareApi } from '../../fixtures/share-api-harness.ts';
import { P_ARGOS, P_KIRA, codeOf, createPets, petsApi } from '../../fixtures/share-pets-012.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const LOCKS = ['pets.findOwnershipForUpdate', 'shareLinks.lockScope'];
const locksTaken = (): string[] => api.calls.filter((c) => LOCKS.includes(c));

describe('BAJA-1 precheck de membresía antes de bloquear (annex §6)', () => {
  it('[§6] un usuario SIN membresía ACTIVE en el hogar recibe el 404 del hogar y no toma ni el bloqueo de mascota ni el candado del hogar', async () => {
    api = await petsApi();
    const outsider = await api.login('carlos');
    const probe = await createPets(api, outsider, { petIds: [P_ARGOS, P_KIRA] }, 1);
    api.calls.length = 0;
    const second = await createPets(api, outsider, { petIds: [P_ARGOS, P_KIRA] }, 2);
    expect([probe.status, codeOf(probe)]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
    expect([second.status, codeOf(second)]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
    expect(locksTaken()).toEqual([]);
  });

  it('[§6] un miembro válido conserva el orden: primero los bloqueos de mascota (pet_id ASC), después el candado del hogar', async () => {
    api = await petsApi();
    const andres = await api.login('andres');
    api.calls.length = 0;
    const response = await createPets(api, andres, { petIds: [P_ARGOS, P_KIRA] }, 1);
    expect(response.status).toBe(201);
    const taken = locksTaken();
    expect(taken).toEqual(['pets.findOwnershipForUpdate', 'pets.findOwnershipForUpdate', 'shareLinks.lockScope']);
  });
});
