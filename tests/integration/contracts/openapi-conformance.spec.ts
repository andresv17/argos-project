import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { createApi, type Api } from '../api/api-harness.ts';
import { ARGOS_ID, H1, NEW_PET, RECORD_INPUTS, USERS_BY_NAME } from '../api/api-fixtures.ts';
import { OPERATIONS, checkResponse } from './openapi-contract.ts';

/**: cada operación del OpenAPI está implementada y sus respuestas reales cumplen el contrato. */
let api: Api | null = null;

/**
 * Operaciones del OpenAPI 002 3.3.0 añadidas por la feature 008 (Google SSO, vinculación y autocompletado de invitados).
 * PENDIENTES explícitas: su ruta en Fastify se implementa en los bloques A (T1112..) y B de la 008; hasta entonces
 * el contrato las declara y la API aún no. Al implementar cada una, quitarla de esta lista (la prueba lo exige).
 */
const PENDING_008 = ['chooseGoogleUsername', 'completeGoogleLogin', 'startGoogleLink', 'startGoogleLogin'];
afterEach(async () => {
  await api?.close();
  api = null;
});

describe('conformidad de la API con contracts/openapi/pet-tracker-api.openapi.yaml', () => {
  it('[REQ-AUTH2-001][REQ-PET2-001][REQ-HOUSE2-001][REQ-BACKUP2-001][REQ-HOUSE2-002] cada una de las 45 operaciones del OpenAPI tiene su ruta en Fastify (las 4 de Google de la 008 siguen pendientes y explícitas; searchInvitees ya se sirve, T1190)', async () => {
    api = await createApi();
    const missing = OPERATIONS.filter((op) => !api!.app.hasRoute({ method: op.method as 'GET', url: op.path.replace(/\{([^}]+)\}/g, ':$1') }));
    const missingIds = missing.map((op) => op.operationId).sort();
    expect([OPERATIONS.length, missingIds.filter((id) => !PENDING_008.includes(id))]).toEqual([45, []]);
    expect(missingIds).toEqual(PENDING_008);
  });

  it('[ERR-INTERNAL-UNEXPECTED] el validador del contrato rechaza un estado no declarado, un cuerpo que no cumple el esquema y una ruta inexistente', () => {
    expect([
      checkResponse('GET', '/api/auth/me', 418, 'application/json', {}).errors,
      checkResponse('GET', '/api/auth/me', 200, 'application/json', { user: { id: 'x' } }).errors.length > 0,
      checkResponse('GET', '/api/auth/me', 401, 'application/json', {}).errors,
      checkResponse('GET', '/api/nada', 200, 'application/json', {}).errors,
    ]).toEqual([
      ['getCurrentSession: estado 418 no declarado (200, 401, 500)'],
      true,
      ['getCurrentSession: content-type application/json en vez de application/problem+json'],
      ['sin operación en el OpenAPI para GET /api/nada'],
    ]);
  });

  it('[REQ-AUTH2-002][REQ-PET2-003][REQ-REC2-002][REQ-HOUSE2-002][REQ-BACKUP2-002][REQ-ACC-002] recorrido feliz por las 40 operaciones implementadas (las 5 pendientes de la 008 quedan fuera): todas responden lo que declara el OpenAPI', async () => {
    api = await createApi();
    const seen = new Set<string>();
    const call: Api['call'] = async (method, url, options = {}) => {
      const response = await api!.call(method, url, options);
      seen.add(checkResponse(method, url, response.status, response.headers['content-type'] as string | undefined, response.json ?? (response.text || undefined)).operationId!);
      return response;
    };
    const rejected: string[] = [];
    const step = async (method: string, url: string, options: Parameters<Api['call']>[2] = {}) => {
      const r = await call(method, url, options);
      if (r.status >= 300) rejected.push(`${method} ${url} -> ${r.status} ${r.text.slice(0, 160)}`);
      return r;
    };
    const lucia = (await step('POST', '/api/auth/register', { body: { username: 'nueva.usuaria', displayName: 'Nueva', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' } })).cookie!;
    const andres = (await step('POST', '/api/auth/login', { body: { username: 'andres', password: 'Argos2026a' } })).cookie!;
    const carlos = await api.login('carlos_88');
    await step('GET', '/api/auth/me', { cookie: andres });
    await step('GET', '/api/pets?q=arg&species=CANINE', { cookie: andres });
    const created = (await step('POST', '/api/pets', { cookie: andres, body: NEW_PET })).json as { id: string };
    await step('PATCH', `/api/pets/${created.id}`, { cookie: andres, body: { breed: 'Criolla' } });
    await step('GET', `/api/pets/${ARGOS_ID}/dashboard`, { cookie: andres });
    for (const [path, body] of Object.entries(RECORD_INPUTS)) await step('POST', `/api/pets/${ARGOS_ID}/records/${path}`, { cookie: andres, body });
    await step('DELETE', `/api/pets/${created.id}`, { cookie: andres });
    await step('GET', '/api/households', { cookie: andres });
    const house = (await step('POST', '/api/households', { cookie: lucia, body: { name: 'Casa Nueva' } })).json as { household: { id: string } };
    await step('GET', `/api/households/${H1}`, { cookie: andres });
    await step('GET', `/api/households/${H1}/pets`, { cookie: andres });
    await step('POST', `/api/households/${house.household.id}/invitations`, { cookie: lucia, body: { username: 'carlos_88', roleOnJoin: 'READER' } });
    await step('GET', '/api/invitations', { cookie: carlos });
    await step('POST', `/api/invitations/${H1}/accept`, { cookie: carlos });
    await step('POST', `/api/invitations/${house.household.id}/decline`, { cookie: carlos });
    await step('DELETE', `/api/households/${H1}/members/${canonicalState().users[2]!.id}`, { cookie: andres });
    await step('DELETE', `/api/households/${house.household.id}`, { cookie: lucia });
    // Operaciones de la 002: registros (editar y eliminar), hogar con roles, cancelación de invitación, asignación y propiedad.
    const vaccination = ((await step('POST', `/api/pets/${ARGOS_ID}/records/vaccinations`, { cookie: andres, body: { ...RECORD_INPUTS.vaccinations, vaccineName: 'Leptospirosis' } })).json as { record: { id: string } }).record;
    await step('PATCH', `/api/pets/${ARGOS_ID}/records/vaccinations/${vaccination.id}`, { cookie: andres, headers: { 'if-match': '"0"' }, body: { collection: 'vaccinations', notes: 'corregido' } });
    await step('DELETE', `/api/pets/${ARGOS_ID}/records/vaccinations/${vaccination.id}`, { cookie: andres });
    const roles = (await step('POST', '/api/households', { cookie: andres, body: { name: 'Casa de roles' } })).json as { household: { id: string } };
    const rolesId = roles.household.id;
    await step('POST', `/api/households/${rolesId}/invitations`, { cookie: andres, body: { username: 'maria.v', roleOnJoin: 'CAREGIVER' } });
    await step('POST', `/api/invitations/${rolesId}/accept`, { cookie: await api.login('maria.v') });
    await step('POST', `/api/households/${rolesId}/invitations`, { cookie: andres, body: { username: 'lucia.r', roleOnJoin: 'READER' } });
    await step('GET', `/api/households/${rolesId}/invitees?q=car`, { cookie: andres }); // searchInvitees (T1190)
    const pending = (await step('GET', `/api/households/${rolesId}`, { cookie: andres })).json as { pendingInvitations: Array<{ invitationId: string }> };
    expect(pending.pendingInvitations).toHaveLength(1);
    await step('DELETE', `/api/households/${rolesId}/invitations/${pending.pendingInvitations[0]!.invitationId}`, { cookie: andres });
    await step('PATCH', `/api/households/${rolesId}/members/${USERS_BY_NAME.maria}`, { cookie: andres, body: { role: 'ADMIN' } });
    await step('GET', `/api/pets/${ARGOS_ID}/assignments`, { cookie: andres });
    await step('PUT', `/api/pets/${ARGOS_ID}/assignments/${rolesId}`, { cookie: andres });
    await step('DELETE', `/api/pets/${ARGOS_ID}/assignments/${rolesId}`, { cookie: andres });
    const transferable = (await step('POST', '/api/pets', { cookie: andres, body: { ...NEW_PET, name: 'Nala' } })).json as { id: string };
    await step('PUT', `/api/pets/${transferable.id}/assignments/${rolesId}`, { cookie: andres });
    await step('POST', `/api/pets/${transferable.id}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    await step('POST', `/api/households/${rolesId}/ownership-transfer`, { cookie: andres, body: { targetUserId: USERS_BY_NAME.maria } });
    // Cuenta propia de la usuaria nueva: perfil, contraseña y eliminación con token de confirmación.
    await step('PATCH', '/api/account/profile', { cookie: lucia, body: { displayName: 'Nueva Usuaria' } });
    await step('POST', '/api/account/password', { cookie: lucia, body: { currentPassword: 'Clave2026x!', newPassword: 'Clave2027y!x' } });
    const exported = await step('POST', '/api/backup/export', { cookie: andres });
    await step('POST', '/api/backup/import/preview', { cookie: andres, raw: exported.text });
    await step('POST', '/api/backup/import', { cookie: andres, raw: exported.text, headers: { 'x-argos-import-confirm': createHash('sha256').update(exported.text).digest('hex') } });
    const registered = await api.deps.uow.runInTransaction((r) => r.users.findByUsername('nueva.usuaria'));
    const token = await api.issueConfirmationToken(registered!.id);
    await step('POST', '/api/account/deletion', { cookie: lucia, body: { confirmationPhrase: 'ELIMINAR MI CUENTA', password: 'Clave2027y!x', backupConfirmationToken: token } });
    await step('POST', '/api/auth/logout', { cookie: andres });
    expect([[...seen].sort(), rejected]).toEqual([OPERATIONS.map((op) => op.operationId).filter((id) => !PENDING_008.includes(id)).sort(), []]);
  });
});
