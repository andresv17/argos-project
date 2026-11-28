/**
 * T1697 (Feature 012, Bloque E, #81; `/keymaker`; ENM-005-E 0.2.2): autoridad por co-propiedad (`ENM-005-A`) aplicada al alcance `PETS`, tope del hogar y de mascotas y disparadores de la fila 2 de §5.1. Rojas primero (sin el hook y las rutas fallaban) y verdes con T1695.
 *
 * @implements REQ-VET12-001, REQ-VET12-006, D12-21, PN-08, SC-012-066
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { revokeLinksOfNonOwners } from '../../../src/application/use-cases/co-ownership-support.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import type { ShareApi } from '../../fixtures/share-api-harness.ts';
import { makeCoOwners } from '../../fixtures/co-ownership-012.ts';
import { ANDRES, ARGOS, H, LUNA, MARIA, P_ARGOS, P_KIRA, P_NYX, auditTypes, cases, codeOf, coOwn, createPets, linkRow, makePets, petRows, petsApi } from '../../fixtures/share-pets-012.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const summaryOf = (token: string) => api.publicGet(`/api/shared/${token}/summary`);

describe('T1697 autoridad por co-propiedad aplicada a PETS (ENM-005-A, REQ-VET12-006)', () => {
  it('[REQ-VET12-006] un co-propietario ACTIVE que es ADMIN del hogar incluye la mascota co-poseída y la propia en un PETS (201); un ID de una mascota ajena a su autoridad da el 422 uniforme', async () => {
    api = await petsApi({ role: 'ADMIN' });
    await coOwn(api, MARIA, P_ARGOS);
    const maria = await api.login('maria');
    const ok = await createPets(api, maria, { petIds: [P_ARGOS, LUNA.id] }, 1);
    expect(ok.status).toBe(201);
    const foreign = await createPets(api, maria, { petIds: [P_ARGOS, P_KIRA] }, 2); // Kira es de ANDRES: MARIA no es titular
    expect([foreign.status, codeOf(foreign)]).toEqual([422, 'ERR-VET12-PETS-EMPTY']);
  });

  it('[PN-08][fila 2 de §5.1] el co-propietario creador sale de la mascota (LEAVE): el PETS que la contiene queda REVOKED entero, sin borrar filas, con UN solo REVOKED', async () => {
    api = await petsApi({ role: 'ADMIN' });
    await coOwn(api, MARIA, P_ARGOS);
    const maria = await api.login('maria');
    const { id, token } = await makePets(api, maria, [P_ARGOS, LUNA.id]);
    expect((await summaryOf(token)).status).toBe(200);
    await cases(api.deps).leave(MARIA, P_ARGOS);
    expect(linkRow(api, id)!.revoked_at).toMatch(/^2026-/);
    expect((await summaryOf(token)).status).toBe(404); // Luna sigue siendo de MARIA y aun así el enlace entero dejó de servir
    expect(petRows(api, id)).toEqual([P_ARGOS, LUNA.id].sort());
    expect(auditTypes(api, id)).toEqual(['CREATED', 'REVOKED']);
  });

  it('[PN-08][A→B→A] el principal se va (sucede el co-propietario) y vuelve como co-propietario: su PETS sigue REVOKED, no resucita', async () => {
    api = await petsApi();
    await coOwn(api, MARIA, P_ARGOS);
    const andres = await api.login('andres');
    const { id, token } = await makePets(api, andres, [P_ARGOS, P_KIRA]);
    await cases(api.deps).leave(ANDRES, P_ARGOS, MARIA);
    expect(linkRow(api, id)!.revoked_at).toMatch(/^2026-/);
    // MARIA (la nueva principal) vuelve a invitar a ANDRES como co-propietario ACTIVE: es titular otra vez, pero su enlace anterior NO resucita (re-entrada = enlace nuevo).
    await makeCoOwners({ deps: api.deps, run: (work) => api.deps.uow.runInTransaction(work), setNow: (iso) => api.clock.setClock(iso.slice(0, 10), iso) }, [ANDRES], P_ARGOS, MARIA);
    expect((await api.deps.uow.runInTransaction((r) => r.coOwners.listByPet(P_ARGOS))).some((c) => c.userId === ANDRES && c.status === 'ACTIVE')).toBe(true);
    expect((await summaryOf(token)).status).toBe(404);
    expect(auditTypes(api, id)).toEqual(['CREATED', 'REVOKED']);
  });

  it('[disparadores ajenos a ENM-005-A] el arbitraje (REQUEST_CHANGE_PRINCIPAL y END_CO_OWNERSHIP) y la supresión administrativa pasan por revokeLinksOfNonOwners, que revoca los PETS del creador que ya no es titular y respeta los del titular', async () => {
    api = await petsApi({ role: 'ADMIN' });
    await coOwn(api, MARIA, P_ARGOS);
    const maria = await api.login('maria');
    const andres = await api.login('andres');
    const byMaria = await makePets(api, maria, [P_ARGOS], 1);
    const byAndres = await makePets(api, andres, [P_ARGOS, P_KIRA], 2);
    await api.deps.uow.runInTransaction(async (r) => {
      const row = (await r.coOwners.listByPet(P_ARGOS)).find((c) => c.userId === MARIA && c.status === 'ACTIVE')!;
      await r.coOwners.transition(row.id, 'ACTIVE', { status: 'ENDED', leftAt: '2026-11-26T12:00:00.000Z' }); // END_CO_OWNERSHIP por /admin
      await revokeLinksOfNonOwners(api.deps, r, P_ARGOS, ANDRES, '2026-11-26T12:00:00.000Z');
    });
    expect(linkRow(api, byMaria.id)!.revoked_at).toMatch(/^2026-/);
    expect(linkRow(api, byAndres.id)!.revoked_at).toBeNull();
    for (const file of ['src/application/use-cases/chip-dispute-admin-use-cases.ts', 'src/application/use-cases/owner-request-use-cases.ts', 'src/application/use-cases/co-ownership-use-cases.ts']) {
      expect(readFileSync(file, 'utf8'), file).toContain('revokeLinksOfNonOwners(');
    }
  });

  it('[D12-21][SC-012-066] un PETS cuenta como UNO del hogar (HOUSEHOLD + PETS) y NO consume el tope por mascota de los enlaces PET: con 20 PET de Argos el PETS que la incluye se crea', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    for (let n = 0; n < 20; n += 1) {
      api.db
        .prepare("INSERT INTO share_links (id, token_hash, scope, pet_id, household_id, created_by_user_id, created_at, expires_in_days, expires_at, idempotency_key, pet_owner_user_id_at_creation) VALUES (?, ?, 'PET', ?, NULL, ?, '2026-11-18T11:00:00.000Z', 7, '2026-11-25T11:00:00.000Z', ?, ?)")
        .run(`00000000-0000-4000-8000-0000000e${String(n).padStart(4, '0')}`, `e${String(n).padStart(63, '0')}`, P_ARGOS, ANDRES, `pet-${n}`, ANDRES);
    }
    const pets = await createPets(api, cookie, { petIds: [P_ARGOS] }, 1);
    expect(pets.status).toBe(201);
    const list = await api.call('GET', `/api/households/${H}/share-links/pets`, { cookie });
    expect((list.json as { activeCount: number }).activeCount).toBe(1); // los PET no cuentan en el hogar
  });

  it('[REQ-VET12-001] el tope es de 20 mascotas por enlace: 20 se crean (201) y 21 son 422 ERR-SCHEMA-VALIDATION-FAILED', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const extra: string[] = [];
    await api.deps.uow.runInTransaction(async (r) => {
      for (let n = 0; n < 16; n += 1) {
        const pet = { ...upgradePet(ARGOS), id: `11111111-1111-4111-8111-1111111816${String(n).padStart(2, '0')}`, name: `Extra${String(n).padStart(2, '0')}` };
        extra.push(pet.id);
        await r.pets.save(pet);
        await r.assignments.save({ petId: pet.id, householdId: H, assignedByUserId: pet.ownerUserId, assignedAt: '2026-11-18T12:00:00.000Z' });
      }
    });
    const mine = [P_ARGOS, P_KIRA, P_NYX, '11111111-1111-4111-8111-111111111104', '11111111-1111-4111-8111-111111111105'];
    const twenty = [...mine, ...extra].slice(0, 20);
    expect(twenty).toHaveLength(20);
    const created = await createPets(api, cookie, { petIds: twenty }, 1);
    expect(created.status).toBe(201);
    expect((created.json as { link: { petCount: number } }).link.petCount).toBe(20);
    const tooMany = await createPets(api, cookie, { petIds: [...twenty, '11111111-1111-4111-8111-1111111819ff'] }, 2);
    expect([tooMany.status, codeOf(tooMany)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
  });
});

