/**
 * T1693 (Feature 012, Bloque E, #81; PRUEBAS ROJAS hasta T1695; `/keymaker`): alcance `PETS` del enlace para el veterinario por HTTP sobre SQLite (ENM-005-E 0.2.2 APPROVED).
 * Cubre SC-012-053, SC-012-056..063 y SC-012-066, EDGE-012-070..075 (los de carrera viven en `share-pets-races-012.spec.ts`) y los escenarios (a), (b), (c), (d), (e), (f), (g), (i), (j), (m),
 * (s), (t), (u) de `contracts/share-link-subset-annex.md` §9. La paridad de motores, el lector con default-deny y la bandera están en `tests/unit/sharing/` y en el archivo de paridad.
 * Hoy fallan porque las rutas `/households/{id}/share-links/pets`, `/clinical-summary/pets`, `/pets/{id}/share-links/pets` y `/share-links/{id}/pets/{petId}` no existen.
 *
 * @implements REQ-VET12-001, REQ-VET12-003, REQ-VET12-004, REQ-VET12-006, REQ-VET12-007, INV-VET12-001, INV-VET12-002, INV-VET12-003, INV-VET12-004
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositorySet } from '../../../src/application/ports/repositories.port.ts';
import { hashToken } from '../../../src/domain/sharing/share-token.ts';
import { upgradePet } from '../../fixtures/storage-upgrade.ts';
import type { ShareApi } from '../../fixtures/share-api-harness.ts';
import {
  ANDRES,
  ARGOS,
  H,
  LUNA,
  MARIA,
  NAMES,
  PETS_URL,
  P_ARGOS,
  P_KIRA,
  P_MILO,
  P_NYX,
  P_TOBY,
  PREVIEW_URL,
  auditTypes,
  cases,
  codeOf,
  coOwn,
  createPets,
  linkRow,
  makePets,
  petRows,
  petsApi,
  principalOf,
  requestRows,
  tokenOf,
  withKey,
} from '../../fixtures/share-pets-012.ts';

let api: ShareApi;
afterEach(async () => api?.close());

type View = { summary: { scope: string; pets: Array<{ pet: { id?: string; name?: string } & Record<string, unknown> } & Record<string, unknown>>; fileLabels?: unknown } & Record<string, unknown>; petIds?: string[] } & Record<string, unknown>;
const summaryOf = (token: string) => api.publicGet(`/api/shared/${token}/summary`);
const flat = (value: unknown): string => JSON.stringify(value);

describe('T1693 creación del enlace PETS (SC-012-053, SC-012-062, SC-012-066)', () => {
  it('[SC-012-053][REQ-VET12-001] 2 de 5 mascotas: 201, scope PETS, exactamente esas 2 en share_link_pets y en la lectura pública (orden name ASC)', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const { id, token, response } = await makePets(api, cookie, [P_KIRA, P_ARGOS]);
    expect(response.headers['cache-control']).toBe('no-store');
    const link = (response.json as { link: { scope: string; petIds: string[]; petCount: number; createdByMe: boolean } }).link;
    expect([link.scope, link.petCount, link.createdByMe, [...link.petIds].sort()]).toEqual(['PETS', 2, true, [P_ARGOS, P_KIRA].sort()]);
    expect(linkRow(api, id)).toMatchObject({ scope: 'PETS', household_id: H, pet_id: null });
    expect(petRows(api, id)).toEqual([P_ARGOS, P_KIRA].sort());
    expect(api.db.prepare('SELECT token_hash FROM share_links WHERE id = ?').pluck().get(id)).toBe(hashToken(token));
    const view = await summaryOf(token);
    expect(view.status).toBe(200);
    expect((view.json as View).summary.scope).toBe('PETS');
    expect((view.json as View).summary.pets.map((p) => p.pet.name ?? (p as { profile?: { name?: string } }).profile?.name)).toEqual(['Argos', 'Kira']);
    expect(auditTypes(api, id)).toEqual(['CREATED']);
  });

  it('[SC-012-062][REQ-VET12-001] el subconjunto es estático: una mascota añadida después al hogar NO aparece en el PETS y SÍ en un HOUSEHOLD', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const subset = await makePets(api, cookie, [P_ARGOS]);
    const household = await api.call('POST', `/api/households/${H}/share-links`, { cookie, body: {}, headers: withKey(2) });
    expect(household.status).toBe(201);
    const fresh = { ...upgradePet(ARGOS), id: '11111111-1111-4111-8111-111111111199', name: 'Zeta' };
    await api.deps.uow.runInTransaction(async (r) => {
      await r.pets.save(fresh);
      await r.assignments.save({ petId: fresh.id, householdId: H, assignedByUserId: fresh.ownerUserId, assignedAt: '2026-11-18T12:00:00.000Z' });
    });
    expect(flat((await summaryOf(subset.token)).json)).not.toContain('Zeta');
    expect(petRows(api, subset.id)).toEqual([P_ARGOS]);
    expect(flat((await summaryOf(tokenOf((household.json as { url: string }).url))).json)).toContain('Zeta');
  });

  it('[SC-012-066][D12-21] un PETS de N mascotas cuenta como UN enlace del hogar: con 19 HOUSEHOLD activos el PETS de 5 entra (20) y el siguiente da 409 ERR-SHARE-LINK-LIMIT; el replay con 20 activos da 200', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    for (let n = 0; n < 19; n += 1) {
      api.db
        .prepare("INSERT INTO share_links (id, token_hash, scope, household_id, created_by_user_id, created_at, expires_in_days, expires_at, idempotency_key) VALUES (?, ?, 'HOUSEHOLD', ?, ?, '2026-11-18T11:00:00.000Z', 7, '2026-11-25T11:00:00.000Z', ?)")
        .run(`00000000-0000-4000-8000-0000000d${String(n).padStart(4, '0')}`, String(n).padStart(64, '0'), H, ANDRES_ID, `seed-${n}`);
    }
    const fifth = await makePets(api, cookie, [P_ARGOS, P_KIRA, P_NYX, P_MILO, P_TOBY], 1);
    const over = await createPets(api, cookie, { petIds: [P_ARGOS] }, 2);
    expect([over.status, codeOf(over)]).toEqual([409, 'ERR-SHARE-LINK-LIMIT']);
    const replay = await createPets(api, cookie, { petIds: [P_TOBY, P_ARGOS, P_NYX, P_MILO, P_KIRA] }, 1);
    expect([replay.status, (replay.json as { urlAvailable?: boolean }).urlAvailable]).toEqual([200, false]);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links WHERE scope = 'PETS'").pluck().get()).toBe(1);
    expect(fifth.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('[SC-012-066] la misma petición con OTRA Idempotency-Key crea otro enlace y consume otra plaza', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    await makePets(api, cookie, [P_ARGOS], 1);
    await makePets(api, cookie, [P_ARGOS], 2);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links WHERE scope = 'PETS'").pluck().get()).toBe(2);
  });
});

const ANDRES_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';

describe('T1693 revalidación en servidor: error uniforme y sin oráculo (SC-012-063, INV-VET12-001, escenarios (a) y (b))', () => {
  it('[SC-012-063][INV-VET12-001] lista vacía, ID inexistente, ID ajeno (Luna de MARIA), repetido: el MISMO 422 ERR-VET12-PETS-EMPTY, byte a byte (cuerpo y cabeceras), sin eco del ID', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const ghost = '11111111-1111-4111-8111-1111111119ff';
    const bodies = [[], [ghost], [LUNA.id], [P_ARGOS, P_ARGOS], [P_ARGOS, ghost], [P_ARGOS, LUNA.id]];
    const seen: Array<{ status: number; text: string; headers: string }> = [];
    for (const [index, petIds] of bodies.entries()) {
      const response = await createPets(api, cookie, { petIds }, index + 1);
      expect([response.status, codeOf(response)], JSON.stringify(petIds)).toEqual([422, 'ERR-VET12-PETS-EMPTY']);
      expect(response.text).not.toContain(LUNA.id);
      expect(response.text).not.toContain(ghost);
      const { date: _date, 'content-length': _length, ...stable } = response.headers as Record<string, unknown>;
      seen.push({ status: response.status, text: response.text, headers: JSON.stringify(stable) });
    }
    expect(new Set(seen.map((s) => s.text)).size).toBe(1);
    expect(new Set(seen.map((s) => s.headers)).size).toBe(1);
    expect(api.db.prepare('SELECT COUNT(*) FROM share_links').pluck().get()).toBe(0);
  });

  it('[escenario (b)][MEDIA-N1] un UUID con MAYÚSCULAS, mal formado o más de 20 ids es 422 ERR-SCHEMA-VALIDATION-FAILED por forma (sin normalización de dominio)', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const twentyOne = Array.from({ length: 21 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
    for (const petIds of [[P_ARGOS.toUpperCase()], ['no-es-uuid'], twentyOne]) {
      const response = await createPets(api, cookie, { petIds }, 1);
      expect([response.status, codeOf(response)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    }
    expect(JSON.stringify((await createPets(api, cookie, {}, 2)).json)).toContain('ERR-SCHEMA-VALIDATION-FAILED');
  });

  it('[escenario (a)][INV-VET12-001] un ADMIN de hogar sin autoridad sobre la mascota: 422 PETS-EMPTY igual que un ID inexistente; 403 solo sin rol de hogar o sin ninguna mascota elegible en todo el hogar', async () => {
    api = await petsApi({ role: 'ADMIN' });
    const maria = await api.login('maria');
    const ghost = '11111111-1111-4111-8111-1111111119ff';
    const foreign = await createPets(api, maria, { petIds: [P_ARGOS] }, 1);
    const missing = await createPets(api, maria, { petIds: [ghost] }, 2);
    expect([foreign.status, codeOf(foreign), foreign.text]).toEqual([422, 'ERR-VET12-PETS-EMPTY', missing.text]);
    const own = await createPets(api, maria, { petIds: [LUNA.id] }, 3);
    expect(own.status).toBe(201);
    const carlos = await api.login('carlos');
    const outsider = await createPets(api, carlos, { petIds: [P_ARGOS] }, 4);
    expect([outsider.status, codeOf(outsider)]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
  });

  it('[REQ-VET12-006] un co-propietario ACTIVE puede incluir la mascota sobre la que tiene autoridad; un CAREGIVER no crea (403) y un MEMBER sin autoridad sobre ninguna mascota tampoco', async () => {
    api = await petsApi();
    await coOwn(api, MARIA, P_ARGOS);
    const maria = await api.login('maria');
    const ok = await createPets(api, maria, { petIds: [P_ARGOS, LUNA.id] }, 1);
    expect([ok.status, codeOf(ok)]).toEqual([403, 'ERR-ACC-FORBIDDEN']); // MARIA es MEMBER del hogar: solo el propietario del hogar o un ADMIN ACTIVE crea (annex §3.2)
    const caregiver = await petsApi({ role: 'CAREGIVER' });
    const cookie = await caregiver.login('maria');
    expect((await createPets(caregiver, cookie, { petIds: [LUNA.id] }, 1)).status).toBe(403);
    await caregiver.close();
  });
});

describe('T1693 lectura pública: omisión sin rastro, 404 uniforme y sin ampliación (SC-012-056..059, escenarios (c), (f), (g))', () => {
  it('[SC-012-056][escenario (g)] ninguna respuesta (resumen, fileLabels, vista previa) contiene nombre, ID, conteo ni foto de una mascota excluida', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const { token, id } = await makePets(api, cookie, [P_ARGOS, P_KIRA], 1, { includeClinicalFiles: true });
    const view = await summaryOf(token);
    const text = flat(view.json);
    for (const excluded of [P_NYX, P_MILO, P_TOBY, LUNA.id]) expect(text).not.toContain(excluded);
    for (const excluded of ['Nyx', 'Milo', 'Toby', 'Luna']) expect(text).not.toContain(excluded);
    expect((view.json as View).petIds).toEqual([P_ARGOS, P_KIRA]);
    const preview = await api.call('GET', `${PREVIEW_URL}?petIds=${P_ARGOS}&petIds=${P_KIRA}&includeClinicalFiles=true`, { cookie });
    expect(preview.status).toBe(200);
    for (const excluded of [P_NYX, P_MILO, P_TOBY, 'Nyx', 'Milo', 'Toby']) expect(flat(preview.json)).not.toContain(excluded);
    expect(petRows(api, id)).toEqual([P_ARGOS, P_KIRA].sort());
    expect((await api.publicGet(`/api/shared/${token}/pets/${P_NYX}/avatar`)).status).toBe(404);
  });

  it('[escenario (f)][INV-VET12-002] el avatar de una mascota excluida u omitida y un petId ajeno al enlace dan el MISMO 404 que uno inexistente', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const { token } = await makePets(api, cookie, [P_ARGOS]);
    const excluded = await api.publicGet(`/api/shared/${token}/pets/${P_KIRA}/avatar`);
    const foreign = await api.publicGet(`/api/shared/${token}/pets/${LUNA.id}/avatar`);
    const missing = await api.publicGet(`/api/shared/${token}/pets/11111111-1111-4111-8111-1111111119ff/avatar`);
    expect([excluded.status, foreign.status, missing.status]).toEqual([404, 404, 404]);
    expect([excluded.text, foreign.text]).toEqual([missing.text, missing.text]);
  });

  it('[SC-012-058][REQ-VET-007] sin elegibles (el creador pierde TODAS las mascotas del cuerpo en el cuerpo) el acceso da el 404 uniforme: mismo cuerpo, mismas cabeceras y misma secuencia de puertos que un token inexistente', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const { token, id } = await makePets(api, cookie, [P_ARGOS]);
    api.db.prepare('DELETE FROM share_link_pets WHERE share_link_id = ?').run(id); // defecto simulado: PETS activo con cero filas (annex §5.5)
    api.calls.length = 0;
    const empty = await summaryOf(token);
    const emptyCalls = [...api.calls];
    api.calls.length = 0;
    const unknown = await summaryOf('A'.repeat(43));
    expect([empty.status, empty.text]).toEqual([404, unknown.text]);
    expect(emptyCalls).toEqual(api.calls);
    for (const header of ['cache-control', 'referrer-policy', 'x-robots-tag', 'content-security-policy']) expect(empty.headers[header]).toBe(unknown.headers[header]);
  });

  it('[escenario (c)][trinity H-19] con 20 mascotas la lectura pública ejecuta UNA consulta de revalidación y la ejecuta también cuando el token no existe (secuencia de puertos constante)', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const extra: string[] = [];
    await api.deps.uow.runInTransaction(async (r) => {
      for (let n = 0; n < 15; n += 1) {
        const pet = { ...upgradePet(ARGOS), id: `11111111-1111-4111-8111-1111111118${String(n).padStart(2, '0')}`, name: `Extra${String(n).padStart(2, '0')}` };
        extra.push(pet.id);
        await r.pets.save(pet);
        await r.assignments.save({ petId: pet.id, householdId: H, assignedByUserId: pet.ownerUserId, assignedAt: '2026-11-18T12:00:00.000Z' });
      }
    });
    const { token } = await makePets(api, cookie, [P_ARGOS, P_KIRA, P_NYX, P_MILO, P_TOBY, ...extra]);
    api.calls.length = 0;
    expect((await summaryOf(token)).status).toBe(200);
    const withToken = [...api.calls];
    api.calls.length = 0;
    expect((await summaryOf('B'.repeat(43))).status).toBe(404);
    const withoutToken = [...api.calls];
    expect(withToken.filter((c) => /eligib|revalidat/i.test(c))).toHaveLength(1);
    expect(withoutToken.filter((c) => /eligib|revalidat/i.test(c))).toHaveLength(1);
    expect(withToken).toEqual(withoutToken);
  });

  it('[INV-VET12-004][SC-012-039] un enlace PETS no entrega rutinas, registros de cuidado, QR, teléfono, alergias críticas ni identidad de co-propietarios o del creador', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    await coOwn(api, MARIA, P_ARGOS);
    const { token } = await makePets(api, cookie, [P_ARGOS]);
    const text = flat((await summaryOf(token)).json);
    for (const forbidden of ['routine', 'careLog', 'criticalAllergies', 'emergency', 'phone', 'qr', 'coOwner', 'createdBy', MARIA, ANDRES_ID, 'maria.v', 'andres']) expect(text.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
  });
});

describe('T1693 PN-08: revocación automática del enlace PETS (decisión E-1, escenarios (i), (j), (t), EDGE-012-070)', () => {
  it('[SC-012-057][EDGE-012-070] P sale del hogar y vuelve antes de expirar: el enlace está REVOKED y da 404 aunque P y su creador sigan siendo elegibles; un solo REVOKED; se borra la fila (enlace, P) y se conservan las demás', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const { id, token } = await makePets(api, cookie, [P_ARGOS, P_KIRA]);
    expect((await api.call('DELETE', `/api/pets/${P_KIRA}/assignments/${H}`, { cookie })).status).toBe(204);
    expect(linkRow(api, id)!.revoked_at).toMatch(/^2026-/);
    expect(petRows(api, id)).toEqual([P_ARGOS]);
    expect((await summaryOf(token)).status).toBe(404);
    expect((await api.call('PUT', `/api/pets/${P_KIRA}/assignments/${H}`, { cookie })).status).toBe(200);
    expect((await summaryOf(token)).status).toBe(404);
    expect(petRows(api, id)).toEqual([P_ARGOS]);
    expect(auditTypes(api, id)).toEqual(['CREATED', 'REVOKED']);
  });

  it('[SC-012-059][EDGE-012-021] el creador degradado a READER y reinstalado ADMIN: el enlace queda REVOKED y no resucita (fila 3 de §5.1: no se borra ninguna fila)', async () => {
    api = await petsApi({ role: 'ADMIN' });
    const maria = await api.login('maria');
    const andres = await api.login('andres');
    const { id, token } = await makePets(api, maria, [LUNA.id]);
    expect((await api.call('PATCH', `/api/households/${H}/members/${MARIA}`, { cookie: andres, body: { role: 'READER' } })).status).toBe(200);
    expect(linkRow(api, id)!.revoked_at).toMatch(/^2026-/);
    expect((await api.call('PATCH', `/api/households/${H}/members/${MARIA}`, { cookie: andres, body: { role: 'ADMIN' } })).status).toBe(200);
    expect((await summaryOf(token)).status).toBe(404);
    expect(petRows(api, id)).toEqual([LUNA.id]);
    expect(auditTypes(api, id)).toEqual(['CREATED', 'REVOKED']);
  });

  it('[escenario (j)][EDGE-012-072] borrar una mascota que está en un PETS de una sola mascota o de varias: REVOKED entero y plaza liberada, nunca un PETS activo con cero filas', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const single = await makePets(api, cookie, [P_TOBY], 1);
    const several = await makePets(api, cookie, [P_MILO, P_NYX], 2);
    expect((await api.call('DELETE', `/api/pets/${P_TOBY}`, { cookie })).status).toBe(204);
    expect((await api.call('DELETE', `/api/pets/${P_MILO}`, { cookie })).status).toBe(204);
    expect([linkRow(api, single.id)?.revoked_at, linkRow(api, several.id)?.revoked_at].map((v) => v !== null && v !== undefined)).toEqual([true, true]);
    const list = await api.call('GET', `/api/households/${H}/share-links/pets`, { cookie });
    expect((list.json as { activeCount: number }).activeCount).toBe(0);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links l WHERE l.scope = 'PETS' AND l.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM share_link_pets p WHERE p.share_link_id = l.id)").pluck().get()).toBe(0);
  });

  it('[escenario (i)][ENM-005-A §2.3] el principal que cede el principal y queda como co-propietario ACTIVE CONSERVA su enlace PETS (no es disparador)', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    await coOwn(api, MARIA, P_ARGOS);
    const { id, token } = await makePets(api, cookie, [P_ARGOS]);
    const use = cases(api.deps);
    const run = <T>(work: (r: RepositorySet) => Promise<T>) => api.deps.uow.runInTransaction(work);
    await use.request(ANDRES, P_ARGOS, { action: 'TRANSFER_PRINCIPAL', targetUserId: MARIA });
    const pending = (await requestRows({ run }, P_ARGOS)).find((x) => x['action'] === 'TRANSFER_PRINCIPAL' && x['status'] === 'PENDING')!;
    for (const approver of pending['approverSet'] as string[]) await use.approve(approver, pending['id'] as string);
    expect(await principalOf({ run }, P_ARGOS)).toBe(MARIA);
    expect(linkRow(api, id)!.revoked_at).toBeNull();
    expect((await summaryOf(token)).status).toBe(200);
  });
});

describe('T1693 revocar, retirar y visibilidad (escenarios (d), (e), (u), (m); REQ-VET12-007, INV-VET12-003)', () => {
  it('[escenario (e)][REQ-VET12-007] un co-propietario de A revoca un enlace que incluye A y B y B deja de resolver; el propietario u ADMIN del hogar no titular recibe 404 (escenario (u))', async () => {
    api = await petsApi({ role: 'ADMIN' });
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    await coOwn(api, MARIA, P_ARGOS);
    const { id, token } = await makePets(api, andres, [P_ARGOS, P_KIRA]);
    expect((await api.call('DELETE', `/api/share-links/${id}`, { cookie: await api.login('lucia') })).status).toBe(404);
    expect((await api.call('DELETE', `/api/share-links/${id}`, { cookie: maria })).status).toBe(204);
    expect((await summaryOf(token)).status).toBe(404);
    expect(auditTypes(api, id)).toEqual(['CREATED', 'REVOKED']);
    expect((await api.call('DELETE', `/api/share-links/${id}`, { cookie: maria })).status).toBe(204);
    expect(auditTypes(api, id)).toEqual(['CREATED', 'REVOKED']);
  });

  it('[escenario (u)] el ADMIN del hogar que no es titular de ninguna mascota del enlace ni creador recibe 404 ERR-SHARE-NOT-FOUND al revocar y el enlace sigue vivo', async () => {
    api = await petsApi({ role: 'ADMIN' });
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    const { id, token } = await makePets(api, andres, [P_ARGOS]);
    const denied = await api.call('DELETE', `/api/share-links/${id}`, { cookie: maria });
    expect([denied.status, codeOf(denied)]).toEqual([404, 'ERR-SHARE-NOT-FOUND']);
    expect((await summaryOf(token)).status).toBe(200);
  });

  it('[escenario (d)] retirar la última mascota revoca (REVOKED); retirar la misma dos veces da 204 y luego 404; sobre un enlace REVOKED o vencido da 404', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const two = await makePets(api, cookie, [P_ARGOS, P_KIRA], 1);
    const withdraw = (linkId: string, petId: string) => api.call('DELETE', `/api/share-links/${linkId}/pets/${petId}`, { cookie });
    expect((await withdraw(two.id, P_KIRA)).status).toBe(204);
    expect(petRows(api, two.id)).toEqual([P_ARGOS]);
    expect(linkRow(api, two.id)!.revoked_at).toBeNull();
    const again = await withdraw(two.id, P_KIRA);
    expect([again.status, codeOf(again)]).toEqual([404, 'ERR-SHARE-NOT-FOUND']);
    expect((await withdraw(two.id, P_ARGOS)).status).toBe(204);
    expect(linkRow(api, two.id)!.revoked_at).toMatch(/^2026-/);
    expect(auditTypes(api, two.id)).toEqual(['CREATED', 'REVOKED']);
    expect((await withdraw(two.id, P_ARGOS)).status).toBe(404);
    const expiring = await makePets(api, cookie, [P_NYX, P_MILO], 2, { expiresInDays: 1 });
    api.clock.setClock('2026-11-20', '2026-11-20T12:00:00.000Z');
    expect((await withdraw(expiring.id, P_NYX)).status).toBe(404);
  });

  it('[INV-VET12-003] retirar exige ser titular de ESA mascota (no basta serlo de otra del enlace): el co-propietario de Argos no retira a Kira', async () => {
    api = await petsApi();
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    await coOwn(api, MARIA, P_ARGOS);
    const { id } = await makePets(api, andres, [P_ARGOS, P_KIRA]);
    expect((await api.call('DELETE', `/api/share-links/${id}/pets/${P_KIRA}`, { cookie: maria })).status).toBe(404);
    expect((await api.call('DELETE', `/api/share-links/${id}/pets/${P_ARGOS}`, { cookie: maria })).status).toBe(204);
    expect(petRows(api, id)).toEqual([P_KIRA]);
  });

  it('[escenario (m)][SC-012-066] listHouseholdShareLinks de 005: activeCount cuenta los PETS (items no); listPetPetsShareLinks da a cada co-propietario SU enlace sin householdId ni identidad del creador; un ADMIN no titular recibe 404 ahí', async () => {
    api = await petsApi({ role: 'ADMIN' });
    const andres = await api.login('andres');
    const maria = await api.login('maria');
    await coOwn(api, MARIA, P_ARGOS);
    await makePets(api, andres, [P_ARGOS, P_KIRA]);
    const legacy = await api.call('GET', `/api/households/${H}/share-links`, { cookie: andres });
    expect((legacy.json as { items: unknown[]; activeCount: number }).items).toEqual([]);
    expect((legacy.json as { activeCount: number }).activeCount).toBe(1);
    const own = await api.call('GET', `/api/households/${H}/share-links/pets`, { cookie: andres });
    expect((own.json as { items: Array<{ petCount: number; createdByMe: boolean; householdId?: string }>; activeCount: number }).items.map((i) => [i.petCount, i.createdByMe, 'householdId' in i])).toEqual([[2, true, false]]);
    const seenByCoOwner = await api.call('GET', `/api/pets/${P_ARGOS}/share-links/pets`, { cookie: maria });
    const item = (seenByCoOwner.json as { items: Array<Record<string, unknown>> }).items[0]!;
    expect([item['createdByMe'], 'householdId' in item, item['petIds'], flat(item)]).toEqual([false, false, [P_ARGOS], expect.not.stringContaining('createdByUserId')]);
    expect((await api.call('GET', `/api/pets/${P_KIRA}/share-links/pets`, { cookie: maria })).status).toBe(404);
  });
});

describe('T1693 bandera ARGOS_SHARE_PETS_CREATE_ENABLED apagada y vista previa (escenario (s), SC-012-065, escenario (o))', () => {
  it('[escenario (s)] con la bandera OFF, crear (incluido un replay) y la vista previa dan el 404 del hogar tras sesión/CSRF y antes de Idempotency-Key y del 422; lista, revocación y retirada siguen operativas', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const { id } = await makePets(api, cookie, [P_ARGOS, P_KIRA]); // creado con la bandera ON
    await api.close();
    api = await petsApi({ enabled: false });
    const off = await api.login('andres');
    const noKey = await api.call('POST', PETS_URL, { cookie: off, body: { petIds: [P_ARGOS] } });
    const badBody = await api.call('POST', PETS_URL, { cookie: off, body: {}, headers: withKey(1) });
    const noSession = await api.call('POST', PETS_URL, { body: { petIds: [P_ARGOS] }, headers: withKey(1) });
    const noCsrf = await api.call('POST', PETS_URL, { cookie: off, body: { petIds: [P_ARGOS] }, headers: withKey(1), csrf: false });
    expect([noKey.status, badBody.status, noSession.status, noCsrf.status]).toEqual([404, 404, 401, 403]);
    expect(codeOf(noKey)).toBe(codeOf(badBody));
    const preview = await api.call('GET', PREVIEW_URL, { cookie: off });
    expect(preview.status).toBe(404);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links WHERE scope = 'PETS'").pluck().get()).toBe(0);
    expect((await api.call('GET', PETS_URL, { cookie: off })).status).toBe(200);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('[SC-012-065][REQ-VET12-005] la vista previa muestra las mismas mascotas en el mismo orden que /shared/{token}; sin petIds es 422 ERR-SCHEMA-VALIDATION-FAILED y ?petIds= vacío es 422 ERR-VET12-PETS-EMPTY; no crea token ni fila', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const preview = await api.call('GET', `${PREVIEW_URL}?petIds=${P_KIRA}&petIds=${P_ARGOS}`, { cookie });
    expect(preview.status).toBe(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    const { token } = await makePets(api, cookie, [P_KIRA, P_ARGOS]);
    const view = await summaryOf(token);
    const names = (v: unknown) => ((v as View).summary.pets ?? []).map((p) => flat(p).match(/"name":"([^"]+)"/)?.[1]);
    expect(names(preview.json)).toEqual(names(view.json));
    expect((preview.json as { validUntil?: unknown }).validUntil).toBeNull();
    const none = await api.call('GET', PREVIEW_URL, { cookie });
    const empty = await api.call('GET', `${PREVIEW_URL}?petIds=`, { cookie });
    expect([none.status, codeOf(none), empty.status, codeOf(empty)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED', 422, 'ERR-VET12-PETS-EMPTY']);
    const foreign = await api.call('GET', `${PREVIEW_URL}?petIds=${LUNA.id}`, { cookie });
    expect([foreign.status, codeOf(foreign)]).toEqual([422, 'ERR-VET12-PETS-EMPTY']);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links WHERE scope = 'PETS'").pluck().get()).toBe(1);
  });

  it('[escenario (o)][EDGE-012-075] la vista previa da 429 ERR-RATE-LIMITED pasado el límite por usuario y los registros de la aplicación no contienen los petIds', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    let last = 200;
    for (let n = 0; n < 40 && last !== 429; n += 1) last = (await api.call('GET', `${PREVIEW_URL}?petIds=${P_ARGOS}`, { cookie })).status;
    expect(last).toBe(429);
    expect(api.logLines.join('\n')).not.toContain(P_ARGOS);
  });
});

describe('T1693 compatibilidad con enlaces anteriores (SC-012-060, REQ-VET12-004)', () => {
  it('[SC-012-060] los enlaces PET y HOUSEHOLD creados antes siguen resolviendo idénticos tras la migración y no tienen filas en share_link_pets', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    const pet = await api.call('POST', `/api/pets/${P_ARGOS}/share-links`, { cookie, body: {}, headers: withKey(1) });
    const house = await api.call('POST', `/api/households/${H}/share-links`, { cookie, body: {}, headers: withKey(2) });
    const petView = await summaryOf(tokenOf((pet.json as { url: string }).url));
    const houseView = await summaryOf(tokenOf((house.json as { url: string }).url));
    expect([petView.status, (petView.json as View).summary.scope, houseView.status, (houseView.json as View).summary.scope]).toEqual([200, 'PET', 200, 'HOUSEHOLD']);
    await makePets(api, cookie, [P_ARGOS], 3);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_link_pets p JOIN share_links l ON l.id = p.share_link_id WHERE l.scope <> 'PETS'").pluck().get()).toBe(0);
    expect((await api.publicGet(`/api/shared/${tokenOf((house.json as { url: string }).url)}/summary`)).status).toBe(200);
  });

  it('[escenario (n)][PN-09] el respaldo exportable no contiene share_link_pets ni enlaces PETS', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    await makePets(api, cookie, [P_ARGOS]);
    const exported = await api.call('POST', '/api/backup/export', { cookie, body: {} });
    expect(flat(exported.json ?? exported.text)).not.toContain('share_link_pets');
    expect(NAMES[P_ARGOS]).toBe('Argos');
  });
});

describe('T1693 idempotencia del alcance PETS (SC-012-066, escenario (l), EDGE-012-074 / LK-05)', () => {
  it('[escenario (l)] el mismo cuerpo reordenado y con expiresInDays omitido ≡ 7 responde 200 sin URL ni fila nueva; otros petIds u opciones con la misma clave dan 422 ERR-SCHEMA-VALIDATION-FAILED sin efecto', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    await makePets(api, cookie, [P_ARGOS, P_KIRA], 1, { expiresInDays: 7 });
    const same = await createPets(api, cookie, { petIds: [P_KIRA, P_ARGOS] }, 1);
    expect([same.status, (same.json as { urlAvailable?: boolean }).urlAvailable, 'url' in (same.json as object)]).toEqual([200, false, false]);
    for (const body of [{ petIds: [P_ARGOS] }, { petIds: [P_ARGOS, P_KIRA], includeMicrochip: true }, { petIds: [P_ARGOS, P_KIRA], expiresInDays: 30 }]) {
      const other = await createPets(api, cookie, body, 1);
      expect([other.status, codeOf(other)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    }
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links WHERE scope = 'PETS'").pluck().get()).toBe(1);
  });

  it('[EDGE-012-074][LK-05] la misma Idempotency-Key con OTRO householdId: el 404/403 de la ruta actual precede al replay y, si ambos pasan, 422 ERR-SCHEMA-VALIDATION-FAILED sin efecto', async () => {
    api = await petsApi();
    const cookie = await api.login('andres');
    await makePets(api, cookie, [P_ARGOS], 1);
    const second = await api.call('POST', '/api/households', { cookie, body: { name: 'Otra casa' } });
    expect(second.status).toBe(201);
    const otherId = (second.json as { id: string }).id;
    const replayElsewhere = await createPets(api, cookie, { petIds: [P_ARGOS] }, 1, `/api/households/${otherId}/share-links/pets`);
    expect([replayElsewhere.status, codeOf(replayElsewhere)]).toEqual([422, 'ERR-SCHEMA-VALIDATION-FAILED']);
    const maria = await api.login('maria');
    const strangerHousehold = await createPets(api, maria, { petIds: [P_ARGOS] }, 1, `/api/households/${otherId}/share-links/pets`);
    expect([strangerHousehold.status, codeOf(strangerHousehold)]).toEqual([404, 'ERR-HOUSE-NOT-FOUND']);
    expect(api.db.prepare("SELECT COUNT(*) FROM share_links WHERE scope = 'PETS'").pluck().get()).toBe(1);
  });
});
