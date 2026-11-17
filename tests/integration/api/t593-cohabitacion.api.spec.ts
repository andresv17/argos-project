/**
 * T593 /kid: simulación del co-cuidador (segundo usuario) de un hogar compartido por la API real (Fastify `inject` sobre SQLite), recorriendo
 * STATE-HOUSE-MEMBERSHIP-001 (INVITED, ACTIVE, DECLINED, LEFT, REMOVED) y los permisos cruzados sobre las mascotas compartidas, sus medios
 * y su avatar (INV-ACC-001, INV-ACC-002, REQ-ARC-002, REQ-AVA-001, REQ-RBAC-001).
 * Casa Vallejo (estado canónico): Andrés OWNER y dueño de Argos; María ACTIVE y dueña de Luna; Carlos INVITED con roleOnJoin CAREGIVER; Lucía sin hogar.
 * El E2E de navegador (Chromium y WebKit, dos sesiones) queda para el cierre de la feature: aquí se cubren los mismos estados y permisos sin navegador.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ARGOS, LUNA } from '../../fixtures/application-harness.ts';
import { ControlledStorage, DEFAULT_LIMITS, JPEG, PDF, PNG } from '../../fixtures/media-harness.ts';
import { H1, USERS_BY_NAME } from './api-fixtures.ts';
import { createApi, problemOf, type Api } from './api-harness.ts';

let api: Api;
afterEach(async () => api?.close());

const PET = `/api/pets/${ARGOS.id}`;
const LUNA_PET = `/api/pets/${LUNA.id}`;
const name = (value: string) => ({ 'x-argos-filename': encodeURIComponent(value), 'content-type': 'application/octet-stream' });
const NOT_FOUND = { status: 404, code: 'ERR-PET-NOT-FOUND' };
const FORBIDDEN = { status: 403, code: 'ERR-ACC-FORBIDDEN' };

async function setup() {
  const storage = new ControlledStorage(() => new Date('2026-11-05T12:00:00.000Z'));
  api = await createApi(undefined, { media: { storage, limits: DEFAULT_LIMITS } });
  const andres = await api.login('andres');
  const carlos = await api.login('carlos_88');
  const maria = await api.login('maria.v');
  const photo = await api.call('POST', `${PET}/media?kind=PHOTO`, { cookie: andres, raw: PNG(), headers: name('foto.png') });
  const file = await api.call('POST', `${PET}/media?kind=FILE`, { cookie: andres, raw: PDF(), headers: name('analisis.pdf') });
  await api.call('PUT', `${PET}/avatar`, { cookie: andres, raw: JPEG(1024), headers: { 'content-type': 'image/jpeg' } });
  return { storage, andres, carlos, maria, photoId: (photo.json as { id: string }).id, fileId: (file.json as { id: string }).id };
}

/** Todo lo que un usuario sin acceso (o con acceso de lectura) intenta sobre Argos; devuelve el problema (o el estado) de cada llamada. */
async function probeReads(cookie: string, photoId: string) {
  const calls = [
    api.call('GET', `${PET}/dashboard`, { cookie }),
    api.call('GET', `${PET}/media`, { cookie }),
    api.call('GET', `${PET}/media/${photoId}/access`, { cookie }),
    api.call('GET', `${PET}/avatar`, { cookie }),
  ];
  return (await Promise.all(calls)).map((r) => (r.status === 200 ? 200 : problemOf(r)));
}

describe('T593 INVITED: la invitación no da visibilidad (INV-HOUSE-004, INV-ACC-001)', () => {
  it('[STATE-HOUSE-MEMBERSHIP-001][INV-ACC-001] Carlos INVITED no ve el hogar, la mascota, sus medios ni su avatar: todo 404 ERR-PET-NOT-FOUND, y tampoco puede escribir ni borrar', async () => {
    const { carlos, photoId } = await setup();
    expect(await probeReads(carlos, photoId)).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    const upload = await api.call('POST', `${PET}/media?kind=FILE`, { cookie: carlos, raw: PDF(), headers: name('x.pdf') });
    const del = await api.call('DELETE', `${PET}/media/${photoId}`, { cookie: carlos });
    const avatar = await api.call('PUT', `${PET}/avatar`, { cookie: carlos, raw: JPEG(), headers: { 'content-type': 'image/jpeg' } });
    expect([upload, del, avatar].map(problemOf)).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    const household = await api.call('GET', `/api/households/${H1}`, { cookie: carlos });
    expect(problemOf(household)).toEqual({ status: 404, code: 'ERR-HOUSE-NOT-FOUND' });
  });

  it('[STATE-HOUSE-MEMBERSHIP-001][INV-HOUSE-004] la invitación aparece en su bandeja con el hogar; el OWNER la ve pendiente y el invitado no entra en `members`', async () => {
    const { andres, carlos } = await setup();
    const inbox = (await api.call('GET', '/api/invitations', { cookie: carlos })).json as Array<{ household: { id: string } }>;
    const owner = (await api.call('GET', `/api/households/${H1}`, { cookie: andres })).json as {
      members: Array<{ membership: { userId: string } }>;
      pendingInvitations: Array<{ inviteeUsername: string; status: string }>;
    };
    expect([inbox.map((i) => i.household.id), owner.pendingInvitations.map((i) => `${i.inviteeUsername}:${i.status}`), owner.members.some((m) => m.membership.userId === USERS_BY_NAME.carlos)]).toEqual([
      [H1],
      ['carlos_88:INVITED'],
      false,
    ]);
  });
});

describe('T593 ACTIVE (rol CAREGIVER): permisos cruzados sobre la mascota compartida (INV-ACC-001, INV-ACC-002, REQ-RBAC-001, REQ-ARC-002)', () => {
  it('[INV-ACC-001][REQ-ARC-003] tras aceptar, Carlos lee ficha, lista, URL firmada de corta vida (300 s) y avatar de Argos', async () => {
    const { carlos, photoId } = await setup();
    const accepted = await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    expect(accepted.status).toBe(200);
    expect(await probeReads(carlos, photoId)).toEqual([200, 200, 200, 200]);
    const access = (await api.call('GET', `${PET}/media/${photoId}/access`, { cookie: carlos })).json as { expiresAt: string };
    expect((Date.parse(access.expiresAt) - Date.parse('2026-11-05T12:00:00.000Z')) / 1000).toBeLessThanOrEqual(300);
    const view = (await api.call('GET', `${PET}/dashboard`, { cookie: carlos })).json as { permissions: Record<string, boolean> };
    expect([view.permissions.editPetBasics, view.permissions.deletePet, view.permissions.writeHealthEvents, view.permissions.writeAppointmentsAndParameters]).toEqual([false, false, true, false]);
  });

  it('[INV-ACC-002][REQ-RBAC-001] CAREGIVER sube foto y archivo (201), no borra medios (403), no cambia ni quita el avatar (403), no edita la mascota (403) ni escribe citas (403), pero sí pesos (201)', async () => {
    const { storage, carlos, photoId } = await setup();
    await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    const upPhoto = await api.call('POST', `${PET}/media?kind=PHOTO`, { cookie: carlos, raw: PNG(), headers: name('de-carlos.png') });
    const upFile = await api.call('POST', `${PET}/media?kind=FILE`, { cookie: carlos, raw: PDF(), headers: name('de-carlos.pdf') });
    const delOwn = await api.call('DELETE', `${PET}/media/${(upPhoto.json as { id: string }).id}`, { cookie: carlos });
    const delOther = await api.call('DELETE', `${PET}/media/${photoId}`, { cookie: carlos });
    const putAvatar = await api.call('PUT', `${PET}/avatar`, { cookie: carlos, raw: PNG(512), headers: { 'content-type': 'image/png' } });
    const delAvatar = await api.call('DELETE', `${PET}/avatar`, { cookie: carlos });
    const patch = await api.call('PATCH', PET, { cookie: carlos, body: { name: 'Otro' } });
    const visit = await api.call('POST', `${PET}/records/visits`, {
      cookie: carlos,
      body: { visitDate: '2026-11-04', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'VetCentral' },
    });
    const weight = await api.call('POST', `${PET}/records/weights`, { cookie: carlos, body: { recordedAt: '2026-11-04', weightKg: 32.4, notes: null } });
    expect([upPhoto.status, upFile.status, problemOf(delOwn), problemOf(delOther), problemOf(putAvatar), problemOf(delAvatar), problemOf(patch), problemOf(visit), weight.status]).toEqual([
      201,
      201,
      FORBIDDEN,
      FORBIDDEN,
      FORBIDDEN,
      FORBIDDEN,
      FORBIDDEN,
      FORBIDDEN,
      201,
    ]);
    // El avatar y los medios de Andrés quedan intactos: 2 medios de Andrés + 2 de Carlos y un único objeto de avatar (5 objetos).
    expect((await storage.keys(`pets/${ARGOS.id}/`)).length).toBe(5);
  });

  it('[INV-ACC-001][INV-ACC-002] el flujo inverso: Andrés (OWNER del hogar) sobre Luna de María: ve la ficha por el hogar compartido y no la borra', async () => {
    const { andres, maria } = await setup();
    const read = await api.call('GET', `${LUNA_PET}/dashboard`, { cookie: andres });
    const del = await api.call('DELETE', LUNA_PET, { cookie: andres });
    const owner = await api.call('GET', `${LUNA_PET}/dashboard`, { cookie: maria });
    expect([read.status, problemOf(del).status === 403 || problemOf(del).status === 404, owner.status]).toEqual([200, true, 200]);
  });

  it('[INV-ACC-001] un tercero sin hogar (Lucía) recibe 404 indistinguible de una mascota inexistente en ficha, medios y avatar', async () => {
    const { photoId } = await setup();
    const lucia = await api.login('lucia.r');
    const real = await probeReads(lucia, photoId);
    const ghost = (await Promise.all([api.call('GET', `/api/pets/99999999-9999-4999-8999-999999999999/dashboard`, { cookie: lucia })])).map(problemOf)[0];
    expect([real, ghost]).toEqual([[NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND], NOT_FOUND]);
  });
});

describe('T593 DECLINED: el rechazo no da acceso y no es final (re-invitación)', () => {
  it('[STATE-HOUSE-MEMBERSHIP-001] rechazar → 204, 404 en la mascota y los medios, la segunda respuesta es 404 ERR-HOUSE-INVITATION-NOT-FOUND (nunca 403); el OWNER re-invita y Carlos acepta', async () => {
    const { andres, carlos, photoId } = await setup();
    const declined = await api.call('POST', `/api/invitations/${H1}/decline`, { cookie: carlos });
    const after = await probeReads(carlos, photoId);
    const again = await api.call('POST', `/api/invitations/${H1}/decline`, { cookie: carlos });
    const acceptAfter = await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    expect([declined.status, after, problemOf(again), problemOf(acceptAfter)]).toEqual([
      204,
      [NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND],
      { status: 404, code: 'ERR-HOUSE-INVITATION-NOT-FOUND' },
      { status: 404, code: 'ERR-HOUSE-INVITATION-NOT-FOUND' },
    ]);
    const reinvite = await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'carlos_88', roleOnJoin: 'READER' } });
    const accepted = await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    expect([reinvite.status, accepted.status, await probeReads(carlos, photoId)]).toEqual([202, 200, [200, 200, 200, 200]]);
  });
});

describe('T593 LEFT: abandonar quita la visibilidad al instante y lo que subió se queda en la mascota', () => {
  it('[STATE-HOUSE-MEMBERSHIP-001][INV-ACC-001] Carlos sube un archivo, abandona (204) y recibe 404 en todo; el archivo sigue en la mascota y Andrés lo ve; un segundo abandono es 404', async () => {
    const { andres, carlos, photoId } = await setup();
    await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    const up = await api.call('POST', `${PET}/media?kind=FILE`, { cookie: carlos, raw: PDF(), headers: name('de-carlos.pdf') });
    const upId = (up.json as { id: string }).id;
    const left = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: carlos });
    const reads = await probeReads(carlos, photoId);
    const oldAccess = await api.call('GET', `${PET}/media/${upId}/access`, { cookie: carlos });
    const writeAfter = await api.call('POST', `${PET}/media?kind=FILE`, { cookie: carlos, raw: PDF(), headers: name('y.pdf') });
    const leftAgain = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: carlos });
    const list = (await api.call('GET', `${PET}/media?kind=FILE`, { cookie: andres })).json as { items: Array<{ id: string }> };
    expect([left.status, reads, problemOf(oldAccess), problemOf(writeAfter), problemOf(leftAgain).status, list.items.some((i) => i.id === upId)]).toEqual([
      204,
      [NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND],
      NOT_FOUND,
      NOT_FOUND,
      404,
      true,
    ]);
  });

  it('[STATE-HOUSE-MEMBERSHIP-001] re-invitar a quien se fue crea una fila nueva (nuevo membershipId) que hereda firstJoinedAt del par; aceptar devuelve el acceso', async () => {
    const { andres, carlos, photoId } = await setup();
    await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    const first = api.db.prepare('SELECT membership_id AS id, first_joined_at AS fj FROM household_members WHERE household_id = ? AND user_id = ?').get(H1, USERS_BY_NAME.carlos) as { id: string; fj: string };
    await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: carlos });
    await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'carlos_88', roleOnJoin: 'CAREGIVER' } });
    await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    const rows = api.db
      .prepare("SELECT membership_id AS id, first_joined_at AS fj, status FROM household_members WHERE household_id = ? AND user_id = ? ORDER BY status")
      .all(H1, USERS_BY_NAME.carlos) as Array<{ id: string; fj: string; status: string }>;
    const active = rows.filter((r) => r.status === 'ACTIVE');
    expect([active.length, active[0]?.fj === first.fj, active[0]?.id !== first.id, await probeReads(carlos, photoId)]).toEqual([1, true, true, [200, 200, 200, 200]]);
  });
});

describe('T593 REMOVED: la expulsión corta el acceso cruzado en ambos sentidos', () => {
  it('[STATE-HOUSE-MEMBERSHIP-001][INV-ACC-001] el OWNER expulsa a María (204): María pierde Argos y su hogar (404), Andrés pierde Luna; los medios de Luna siguen siendo de María', async () => {
    const { storage, andres, maria, photoId } = await setup();
    const lunaUp = await api.call('POST', `${LUNA_PET}/media?kind=PHOTO`, { cookie: maria, raw: PNG(), headers: name('luna.png') });
    const lunaId = (lunaUp.json as { id: string }).id;
    const mariaReadBefore = await api.call('GET', `${PET}/dashboard`, { cookie: maria });
    const removed = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.maria}`, { cookie: andres });
    const mariaReads = await probeReads(maria, photoId);
    const mariaHousehold = await api.call('GET', `/api/households/${H1}`, { cookie: maria });
    const andresOnLuna = await api.call('GET', `${LUNA_PET}/media/${lunaId}/access`, { cookie: andres });
    const mariaOwn = await api.call('GET', `${LUNA_PET}/media/${lunaId}/access`, { cookie: maria });
    expect([mariaReadBefore.status, removed.status, mariaReads, problemOf(mariaHousehold).code, problemOf(andresOnLuna), mariaOwn.status]).toEqual([
      200,
      204,
      [NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND],
      'ERR-HOUSE-NOT-FOUND',
      NOT_FOUND,
      200,
    ]);
    expect((await storage.keys(`pets/${LUNA.id}/`)).length).toBe(1);
  });

  it('[STATE-HOUSE-MEMBERSHIP-001] un MEMBER no expulsa a nadie ni borra el hogar (403) y el OWNER no puede abandonar (409); cancelar a un INVITED es 204 y lo deja sin acceso', async () => {
    const { andres, maria, carlos, photoId } = await setup();
    const memberRemoves = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: maria });
    const ownerLeaves = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.andres}`, { cookie: andres });
    const cancelled = await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: andres });
    const accept = await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    expect([problemOf(memberRemoves).status === 403 || problemOf(memberRemoves).status === 404, problemOf(ownerLeaves), cancelled.status, problemOf(accept), await probeReads(carlos, photoId)]).toEqual([
      true,
      { status: 409, code: 'ERR-HOUSE-OWNER-CANNOT-LEAVE' },
      204,
      { status: 404, code: 'ERR-HOUSE-INVITATION-NOT-FOUND' },
      [NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND],
    ]);
  });
});

describe('T593 roles cruzados sobre medios: el Lector y el ADMIN del hogar', () => {
  it('[REQ-RBAC-001][REQ-ARC-002] como READER Carlos lee todo (200) pero sube, borra y cambia el avatar con 403; promovido a ADMIN borra medios (204) y cambia el avatar (200)', async () => {
    const { andres, carlos, photoId } = await setup();
    await api.call('DELETE', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: andres });
    await api.call('POST', `/api/households/${H1}/invitations`, { cookie: andres, body: { username: 'carlos_88', roleOnJoin: 'READER' } });
    await api.call('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    const reads = await probeReads(carlos, photoId);
    const up = await api.call('POST', `${PET}/media?kind=FILE`, { cookie: carlos, raw: PDF(), headers: name('r.pdf') });
    const del = await api.call('DELETE', `${PET}/media/${photoId}`, { cookie: carlos });
    const avatar = await api.call('PUT', `${PET}/avatar`, { cookie: carlos, raw: JPEG(), headers: { 'content-type': 'image/jpeg' } });
    expect([reads, problemOf(up), problemOf(del), problemOf(avatar)]).toEqual([[200, 200, 200, 200], FORBIDDEN, FORBIDDEN, FORBIDDEN]);
    const promote = await api.call('PATCH', `/api/households/${H1}/members/${USERS_BY_NAME.carlos}`, { cookie: andres, body: { role: 'ADMIN' } });
    const delAdmin = await api.call('DELETE', `${PET}/media/${photoId}`, { cookie: carlos });
    const avatarAdmin = await api.call('PUT', `${PET}/avatar`, { cookie: carlos, raw: JPEG(2048), headers: { 'content-type': 'image/jpeg' } });
    expect([promote.status, delAdmin.status, avatarAdmin.status]).toEqual([200, 204, 200]);
  });
});
