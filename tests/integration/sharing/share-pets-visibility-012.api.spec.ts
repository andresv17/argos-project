/**
 * T1701 (Feature 012, Bloque E, #81; `/keymaker`; ENM-005-E 0.2.2): revocación y retirada por cualquier co-propietario `ACTIVE` y visibilidad (`INV-VET12-003`, `INV-VET12-004`, SC-012-039). Rojas primero (sin el hook y las rutas fallaban) y verdes con T1695.
 *
 * @implements REQ-VET12-007, INV-VET12-003, INV-VET12-004, SC-012-039
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ShareApi } from '../../fixtures/share-api-harness.ts';
import { ANDRES, H, MARIA, P_ARGOS, P_KIRA, auditTypes, coOwn, makePets, petsApi, tokenOf, withKey } from '../../fixtures/share-pets-012.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const summaryOf = (token: string) => api.publicGet(`/api/shared/${token}/summary`);
type View = { summary: Record<string, unknown> & { pets: Array<Record<string, unknown>> }; petIds?: string[] };

describe('T1701 revocación y visibilidad con co-propiedad (REQ-VET12-007, INV-VET12-003, INV-VET12-004, SC-012-039)', () => {
  it('[REQ-VET12-007] el co-propietario ve en SU lista un enlace que incluye su mascota, también tras revocarse (status REVOKED), sin householdId ni identidad del creador', async () => {
    api = await petsApi({ role: 'ADMIN' });
    await coOwn(api, MARIA, P_ARGOS);
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    const { id } = await makePets(api, andres, [P_ARGOS, P_KIRA]);
    expect((await api.call('DELETE', `/api/share-links/${id}`, { cookie: andres })).status).toBe(204);
    const seen = await api.call('GET', `/api/pets/${P_ARGOS}/share-links/pets`, { cookie: maria });
    const item = (seen.json as { items: Array<Record<string, unknown>> }).items[0]!;
    expect([item['id'], item['status'], item['createdByMe'], item['petIds'], 'householdId' in item]).toEqual([id, 'REVOKED', false, [P_ARGOS], false]);
    expect(JSON.stringify(seen.json)).not.toContain(ANDRES);
  });

  it('[INV-VET12-003] el co-propietario retira SU mascota: desaparece de su lista y de la lectura pública, el enlace sigue vivo con las demás y no queda rastro de auditoría del retiro parcial (DEUDA-012-WITHDRAW-AUDIT)', async () => {
    api = await petsApi();
    await coOwn(api, MARIA, P_ARGOS);
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    const { id, token } = await makePets(api, andres, [P_ARGOS, P_KIRA]);
    expect((await api.call('DELETE', `/api/share-links/${id}/pets/${P_ARGOS}`, { cookie: maria })).status).toBe(204);
    const view = await summaryOf(token);
    expect([view.status, (view.json as View).petIds]).toEqual([200, [P_KIRA]]);
    expect(JSON.stringify(view.json)).not.toContain('Argos');
    expect(((await api.call('GET', `/api/pets/${P_ARGOS}/share-links/pets`, { cookie: maria })).json as { items: unknown[] }).items).toEqual([]);
    expect(auditTypes(api, id)).toEqual(['CREATED']); // sin evento PET_WITHDRAWN
    const mine = await api.call('GET', `/api/households/${H}/share-links/pets`, { cookie: andres });
    expect((mine.json as { items: Array<{ petIds: string[] }> }).items[0]!.petIds).toEqual([P_KIRA]);
  });

  it('[INV-VET12-004][SC-012-039] por mascota un PETS expone COMO MÁXIMO lo que un enlace PET: mismas claves del resumen y de cada mascota; ni teléfono, ni QR, ni rutinas, ni alergias críticas, ni usuarios', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const pet = await api.call('POST', `/api/pets/${P_ARGOS}/share-links`, { cookie, body: { includeMicrochip: true }, headers: withKey(1) });
    const pets = await makePets(api, cookie, [P_ARGOS], 2, { includeMicrochip: true });
    const single = (await summaryOf(tokenOf((pet.json as { url: string }).url))).json as View;
    const subset = (await summaryOf(pets.token)).json as View;
    expect(Object.keys(subset.summary.pets[0]!).sort()).toEqual(Object.keys(single.summary.pets[0]!).sort());
    const top = (view: View): string[] => Object.keys(view.summary).sort();
    expect(top(subset)).toEqual(top(single));
    const text = JSON.stringify(subset).toLowerCase();
    for (const forbidden of ['phone', 'qr', 'routine', 'carelog', 'criticalallergies', 'userid', 'owneruserid', 'evidence', 'dispute']) expect(text, forbidden).not.toContain(forbidden);
  });
});
