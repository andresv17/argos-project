/**
 * E2E de hogar con roles en contextos de navegador separados (REQ-UI-006): primero dos navegadores (Ana, propietaria
 * del hogar, y Bruno, miembro ADMIN) y luego tres por rol (Ana, Carla CAREGIVER y Dario READER; Bruno sigue como ADMIN).
 * Verifica roles e invitaciones pendientes de la vista de hogar, la visibilidad por asignación (SC-017), la matriz de
 * permisos de la ficha (`myRole` y `permissions`) y que un READER no ve controles de edición.
 * Las invitaciones con `roleOnJoin` y los cambios de rol se hacen por la API real con la sesión de cada navegador, porque
 * la pantalla de hogares aún no ofrece selector de rol (el diseño de hogares con roles es T283/T284).
 *
 * @implements INV-ACC2-001, INV-ACC2-002, REQ-HOUSE2-004, SC-017
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, createPetViaApi, householdIdByName, registerViaApi } from './e2e-support.ts';

const HOUSE = 'Casa Ana';

interface MemberRow {
  readonly membership: { readonly userId: string; readonly displayName: string; readonly username: string; readonly role: string; readonly isHouseholdOwner: boolean; readonly status: string };
  readonly colorToken: string | null;
}
interface HouseholdViewBody {
  readonly household: { readonly id: string; readonly name: string };
  readonly myRole: string;
  readonly isHouseholdOwner: boolean;
  readonly members: readonly MemberRow[];
  readonly pendingInvitations: ReadonlyArray<{ readonly roleOnJoin: string; readonly status: string }>;
}
interface PetCardBody {
  readonly profile: { readonly id: string; readonly name: string };
  readonly owner: { readonly userId: string; readonly displayName: string; readonly colorToken: string };
  readonly myRole: string;
  readonly permissions: Readonly<Record<string, boolean>>;
}
interface InvitationBody {
  readonly household: { readonly name: string };
  readonly invitedBy: { readonly displayName: string };
  readonly roleOnJoin: string;
}

/** Matriz REQ-RBAC-001 proyectada sobre `PetPermissions` (S = true). */
const PERMISSIONS = {
  OWNER: { editPetBasics: true, deletePet: true, writeHealthEvents: true, deleteHealthEvents: true, writeWeightsAndMeasurements: true, writeAppointmentsAndParameters: true, deleteOtherRecords: true, transferPetOwnership: true, assignPetToHouseholds: true },
  ADMIN: { editPetBasics: true, deletePet: false, writeHealthEvents: true, deleteHealthEvents: true, writeWeightsAndMeasurements: true, writeAppointmentsAndParameters: true, deleteOtherRecords: true, transferPetOwnership: false, assignPetToHouseholds: false },
  CAREGIVER: { editPetBasics: false, deletePet: false, writeHealthEvents: true, deleteHealthEvents: false, writeWeightsAndMeasurements: true, writeAppointmentsAndParameters: false, deleteOtherRecords: false, transferPetOwnership: false, assignPetToHouseholds: false },
  READER: { editPetBasics: false, deletePet: false, writeHealthEvents: false, deleteHealthEvents: false, writeWeightsAndMeasurements: false, writeAppointmentsAndParameters: false, deleteOtherRecords: false, transferPetOwnership: false, assignPetToHouseholds: false },
} as const;

test.describe.configure({ mode: 'serial' });

let ana: BrowserContext;
let bruno: BrowserContext;
let carla: BrowserContext;
let dario: BrowserContext;
let anaPage: Page;
let brunoPage: Page;
let carlaPage: Page;
let darioPage: Page;
let householdId: string;
let argosId: string;
let brumaId: string;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  [ana, bruno, carla, dario] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext()]);
  [anaPage, brunoPage, carlaPage, darioPage] = await Promise.all([ana.newPage(), bruno.newPage(), carla.newPage(), dario.newPage()]);
  for (const p of [anaPage, brunoPage, carlaPage, darioPage]) p.on('pageerror', (error) => pageErrors.push(String(error)));
  await registerViaApi(ana.request, 'ana.e2e', 'Ana', 'AnaClave2026!');
  await registerViaApi(bruno.request, 'bruno.e2e', 'Bruno', 'BrunoClave2026!');
  await registerViaApi(carla.request, 'carla.e2e', 'Carla', 'CarlaClave2026!');
  await registerViaApi(dario.request, 'dario.e2e', 'Dario', 'DarioClave2026!');
  argosId = await createPetViaApi(ana.request, 'Argos', 'CANINE');
  brumaId = await createPetViaApi(bruno.request, 'Bruma', 'FELINE');
});

test.afterAll(async () => {
  await Promise.all([ana, bruno, carla, dario].map((context) => context.close()));
});

const pendingCounter = (page: Page) => page.locator('[data-pending-invitations]');
const householdHeading = (page: Page) => page.getByRole('heading', { name: new RegExp(HOUSE), level: 3 });
const householdView = async (context: BrowserContext) => apiCall<HouseholdViewBody>(context.request, 'GET', `/households/${householdId}`);
const householdPets = async (context: BrowserContext) => apiCall<{ pets: PetCardBody[] }>(context.request, 'GET', `/households/${householdId}/pets`);
const petNames = (pets: readonly PetCardBody[]) => pets.map((pet) => pet.profile.name);
const memberSummary = (view: HouseholdViewBody) =>
  [...view.members]
    .map((m) => ({ username: m.membership.username, role: m.membership.role, isHouseholdOwner: m.membership.isHouseholdOwner, status: m.membership.status }))
    .sort((a, b) => a.username.localeCompare(b.username));

/** Abre la ficha de Argos dentro del contexto del hogar, como lo haría la persona en su navegador. */
async function openArgosInHousehold(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('tab', { name: HOUSE }).click();
  await page.getByRole('option', { name: /Argos/ }).click();
  await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
}

test.describe('hogar con roles en dos y tres navegadores (tests/e2e/visual)', () => {
  test('[REQ-HOUSE-001][REQ-UI-006] Ana crea el hogar desde la pantalla de hogares y queda como propietaria ACTIVE con rol ADMIN', async () => {
    await anaPage.goto('/households');
    await anaPage.getByLabel('Nombre del nuevo hogar').fill(HOUSE);
    await anaPage.getByRole('button', { name: 'Crear hogar' }).click();
    await expect(householdHeading(anaPage)).toBeVisible();
    householdId = await householdIdByName(ana.request, HOUSE);
    const view = await householdView(ana);
    expect([view.status, view.body.myRole, view.body.isHouseholdOwner, memberSummary(view.body), view.body.pendingInvitations]).toEqual([
      200,
      'ADMIN',
      true,
      [{ username: 'ana.e2e', role: 'ADMIN', isHouseholdOwner: true, status: 'ACTIVE' }],
      [],
    ]);
  });

  test('[REQ-HOUSE2-001][REQ-HOUSE2-004] dos navegadores: Ana invita a Bruno como ADMIN; la invitación pendiente guarda el rol y Bruno, INVITED, no ve el hogar (INV-ACC2-001)', async () => {
    const invited = await apiCall(ana.request, 'POST', `/households/${householdId}/invitations`, { username: 'bruno.e2e', roleOnJoin: 'ADMIN' });
    expect(invited.status).toBe(202);
    const anaView = await householdView(ana);
    expect(anaView.body.pendingInvitations.map((i) => [i.roleOnJoin, i.status])).toEqual([['ADMIN', 'INVITED']]);
    expect(memberSummary(anaView.body)).toEqual([{ username: 'ana.e2e', role: 'ADMIN', isHouseholdOwner: true, status: 'ACTIVE' }]);

    const invitations = await apiCall<InvitationBody[]>(bruno.request, 'GET', '/invitations');
    expect(invitations.body.map((i) => [i.household.name, i.invitedBy.displayName, i.roleOnJoin])).toEqual([[HOUSE, 'Ana', 'ADMIN']]);
    const house = await householdView(bruno);
    const pets = await householdPets(bruno);
    expect([house.status, house.code, pets.status, pets.code, JSON.stringify(house.body).includes('Argos')]).toEqual([404, 'ERR-HOUSE-NOT-FOUND', 404, 'ERR-HOUSE-NOT-FOUND', false]);

    await brunoPage.goto('/households');
    await expect(pendingCounter(brunoPage)).toHaveAttribute('data-pending-invitations', '1');
    await expect(householdHeading(brunoPage)).toHaveCount(0);
  });

  test('[REQ-HOUSE-003][REQ-HOUSE2-004] Bruno acepta desde su navegador: el contador baja a 0 y la vista de hogar le da rol ADMIN sin ser propietario del hogar', async () => {
    await brunoPage.getByRole('button', { name: 'Aceptar' }).click();
    await expect(householdHeading(brunoPage)).toBeVisible();
    await expect(pendingCounter(brunoPage)).toHaveAttribute('data-pending-invitations', '0');
    const view = await householdView(bruno);
    expect([view.status, view.body.myRole, view.body.isHouseholdOwner, view.body.pendingInvitations]).toEqual([200, 'ADMIN', false, []]);
    expect(memberSummary(view.body)).toEqual([
      { username: 'ana.e2e', role: 'ADMIN', isHouseholdOwner: true, status: 'ACTIVE' },
      { username: 'bruno.e2e', role: 'ADMIN', isHouseholdOwner: false, status: 'ACTIVE' },
    ]);
    const anaView = await householdView(ana);
    expect(memberSummary(anaView.body)).toEqual(memberSummary(view.body));
  });

  test('[SC-017][INV-ACC2-001] solo se ve lo asignado: sin asignación Bruno ve cero mascotas, Ana asigna a Argos y Bruno ve exactamente Argos con dueño Ana; Bruma, no asignada, sigue oculta para Ana', async () => {
    expect((await householdPets(bruno)).body.pets).toEqual([]);
    expect((await apiCall(bruno.request, 'GET', `/pets/${argosId}/dashboard`)).code).toBe('ERR-PET-NOT-FOUND');

    const assigned = await apiCall(ana.request, 'PUT', `/pets/${argosId}/assignments/${householdId}`);
    expect(assigned.status).toBe(200);

    const brunoPets = (await householdPets(bruno)).body.pets;
    expect(petNames(brunoPets)).toEqual(['Argos']);
    expect([brunoPets[0]?.owner.displayName, brunoPets[0]?.owner.colorToken, brunoPets[0]?.myRole]).toEqual(['Ana', 'OWNER_COLOR_1', 'ADMIN']);
    expect(petNames((await householdPets(ana)).body.pets)).toEqual(['Argos']);
    const hidden = await apiCall(ana.request, 'GET', `/pets/${brumaId}/dashboard`);
    expect([hidden.status, hidden.code]).toEqual([404, 'ERR-PET-NOT-FOUND']);
  });

  test('[INV-ACC2-002][REQ-RBAC-001] ADMIN edita datos básicos pero no elimina ni asigna: 200 al editar, ERR-ACC-FORBIDDEN (403) al eliminar y al asignar', async () => {
    const edit = await apiCall<{ profile: { breed: string } } | { breed: string }>(bruno.request, 'PATCH', `/pets/${argosId}`, { breed: 'Labrador' });
    expect(edit.status).toBe(200);
    const remove = await apiCall(bruno.request, 'DELETE', `/pets/${argosId}`);
    const assign = await apiCall(bruno.request, 'PUT', `/pets/${argosId}/assignments/${householdId}`);
    expect([remove.status, remove.code, assign.status, assign.code]).toEqual([403, 'ERR-ACC-FORBIDDEN', 403, 'ERR-ACC-FORBIDDEN']);
    expect(petNames((await apiCall<PetCardBody[]>(ana.request, 'GET', '/pets')).body)).toContain('Argos');
  });

  test('[REQ-HOUSE2-001][REQ-HOUSE2-004] tres navegadores: Ana invita a Carla (CAREGIVER) y a Dario (READER); CAREGIVER y READER no ven invitaciones pendientes', async () => {
    expect((await apiCall(ana.request, 'POST', `/households/${householdId}/invitations`, { username: 'carla.e2e', roleOnJoin: 'CAREGIVER' })).status).toBe(202);
    expect((await householdView(carla)).code).toBe('ERR-HOUSE-NOT-FOUND');
    await carlaPage.goto('/households');
    await expect(pendingCounter(carlaPage)).toHaveAttribute('data-pending-invitations', '1');
    await carlaPage.getByRole('button', { name: 'Aceptar' }).click();
    await expect(householdHeading(carlaPage)).toBeVisible();

    expect((await apiCall(ana.request, 'POST', `/households/${householdId}/invitations`, { username: 'dario.e2e', roleOnJoin: 'READER' })).status).toBe(202);
    const owner = await householdView(ana);
    const admin = await householdView(bruno);
    const caregiver = await householdView(carla);
    expect(owner.body.pendingInvitations.map((i) => [i.roleOnJoin, i.status])).toEqual([['READER', 'INVITED']]);
    expect(admin.body.pendingInvitations.map((i) => [i.roleOnJoin, i.status])).toEqual([['READER', 'INVITED']]); // el ADMIN también ve las pendientes
    expect([caregiver.body.myRole, caregiver.body.pendingInvitations]).toEqual(['CAREGIVER', []]);

    await darioPage.goto('/households');
    await expect(pendingCounter(darioPage)).toHaveAttribute('data-pending-invitations', '1');
    await darioPage.getByRole('button', { name: 'Aceptar' }).click();
    await expect(householdHeading(darioPage)).toBeVisible();
    await expect(pendingCounter(darioPage)).toHaveAttribute('data-pending-invitations', '0');

    const reader = await householdView(dario);
    expect([reader.body.myRole, reader.body.isHouseholdOwner, reader.body.pendingInvitations]).toEqual(['READER', false, []]);
    const expectedMembers = [
      { username: 'ana.e2e', role: 'ADMIN', isHouseholdOwner: true, status: 'ACTIVE' },
      { username: 'bruno.e2e', role: 'ADMIN', isHouseholdOwner: false, status: 'ACTIVE' },
      { username: 'carla.e2e', role: 'CAREGIVER', isHouseholdOwner: false, status: 'ACTIVE' },
      { username: 'dario.e2e', role: 'READER', isHouseholdOwner: false, status: 'ACTIVE' },
    ];
    for (const context of [ana, bruno, carla, dario]) expect(memberSummary((await householdView(context)).body)).toEqual(expectedMembers);
    expect((await householdView(ana)).body.pendingInvitations).toEqual([]);
  });

  test('[REQ-RBAC-001][INV-ACC2-002] cada navegador recibe en la misma mascota su rol efectivo y los nueve permisos de la matriz', async () => {
    const seen: Array<[string, string, Readonly<Record<string, boolean>>]> = [];
    for (const [who, context] of [['OWNER', ana], ['ADMIN', bruno], ['CAREGIVER', carla], ['READER', dario]] as const) {
      const argos = (await householdPets(context)).body.pets.find((pet) => pet.profile.name === 'Argos');
      seen.push([who, argos?.myRole ?? 'AUSENTE', argos?.permissions ?? {}]);
    }
    expect(seen).toEqual([
      ['OWNER', 'OWNER', PERMISSIONS.OWNER],
      ['ADMIN', 'ADMIN', PERMISSIONS.ADMIN],
      ['CAREGIVER', 'CAREGIVER', PERMISSIONS.CAREGIVER],
      ['READER', 'READER', PERMISSIONS.READER],
    ]);
    for (const context of [bruno, carla, dario]) expect(petNames((await householdPets(context)).body.pets)).toEqual(['Argos']);
  });

  test('[INV-ACC2-002][REQ-RBAC-001] escrituras por rol: CAREGIVER registra peso (201) y no edita ni agenda citas; READER recibe ERR-ACC-FORBIDDEN en todo; ninguno gestiona miembros', async () => {
    const weight = { recordedAt: '2026-11-01', weightKg: 12.5 };
    const caregiverWeight = await apiCall(carla.request, 'POST', `/pets/${argosId}/records/weights`, weight);
    const caregiverEdit = await apiCall(carla.request, 'PATCH', `/pets/${argosId}`, { breed: 'Criollo' });
    const caregiverVisit = await apiCall(carla.request, 'POST', `/pets/${argosId}/records/visits`, { visitDate: '2026-11-01', reason: 'Control' });
    const readerWeight = await apiCall(dario.request, 'POST', `/pets/${argosId}/records/weights`, weight);
    const readerEdit = await apiCall(dario.request, 'PATCH', `/pets/${argosId}`, { breed: 'Criollo' });
    const readerDelete = await apiCall(dario.request, 'DELETE', `/pets/${argosId}`);
    expect([caregiverWeight.status, caregiverEdit.status, caregiverEdit.code, caregiverVisit.status, caregiverVisit.code]).toEqual([201, 403, 'ERR-ACC-FORBIDDEN', 403, 'ERR-ACC-FORBIDDEN']);
    expect([readerWeight.status, readerWeight.code, readerEdit.code, readerDelete.code]).toEqual([403, 'ERR-ACC-FORBIDDEN', 'ERR-ACC-FORBIDDEN', 'ERR-ACC-FORBIDDEN']);

    const caregiverInvite = await apiCall(carla.request, 'POST', `/households/${householdId}/invitations`, { username: 'nadie.e2e', roleOnJoin: 'READER' });
    const readerInvite = await apiCall(dario.request, 'POST', `/households/${householdId}/invitations`, { username: 'nadie.e2e', roleOnJoin: 'READER' });
    const readerRemove = await apiCall(dario.request, 'DELETE', `/households/${householdId}/members/${(await householdView(ana)).body.members[0]?.membership.userId}`);
    expect([caregiverInvite.status, caregiverInvite.code, readerInvite.status, readerInvite.code, readerRemove.status, readerRemove.code]).toEqual([
      403,
      'ERR-ACC-FORBIDDEN',
      403,
      'ERR-ACC-FORBIDDEN',
      403,
      'ERR-ACC-FORBIDDEN',
    ]);
  });

  test('[INV-ACC2-001] la mascota no asignada es inexistente para quien solo comparte el hogar: Carla y Dario reciben ERR-PET-NOT-FOUND (404) por Bruma', async () => {
    for (const context of [carla, dario]) {
      const hidden = await apiCall(context.request, 'GET', `/pets/${brumaId}/dashboard`);
      expect([hidden.status, hidden.code]).toEqual([404, 'ERR-PET-NOT-FOUND']);
    }
  });

  test('[INV-ACC2-002][REQ-UI-001] en su navegador el READER ve Argos con dueño Ana, en solo lectura y sin Editar, Eliminar ni Guardar; el CAREGIVER tampoco edita ni elimina', async () => {
    await openArgosInHousehold(darioPage);
    await expect(darioPage.getByText('Dueño: Ana').first()).toBeVisible();
    await expect(darioPage.getByText('Solo lectura').first()).toBeVisible();
    for (const action of ['Editar', 'Eliminar', 'Guardar']) await expect(darioPage.getByRole('button', { name: action, exact: true })).toHaveCount(0);

    await openArgosInHousehold(carlaPage);
    for (const action of ['Editar', 'Eliminar']) await expect(carlaPage.getByRole('button', { name: action, exact: true })).toHaveCount(0);
  });

  test('[REQ-HOUSE2-002][INV-HOUSE2-001] cambio de rol y límites del ADMIN: Ana sube a Dario a CAREGIVER y recibe permisos de escritura; Bruno no puede expulsar a Ana ni cambiar su rol; Ana no puede abandonar', async () => {
    const darioId = (await householdView(ana)).body.members.find((m) => m.membership.username === 'dario.e2e')?.membership.userId;
    const anaId = (await householdView(ana)).body.members.find((m) => m.membership.username === 'ana.e2e')?.membership.userId;
    const promoted = await apiCall(ana.request, 'PATCH', `/households/${householdId}/members/${darioId}`, { role: 'CAREGIVER' });
    expect(promoted.status).toBe(200);
    const argos = (await householdPets(dario)).body.pets[0];
    expect([argos?.myRole, argos?.permissions]).toEqual(['CAREGIVER', PERMISSIONS.CAREGIVER]);
    expect((await apiCall(dario.request, 'POST', `/pets/${argosId}/records/weights`, { recordedAt: '2026-11-02', weightKg: 12.6 })).status).toBe(201);

    const expel = await apiCall(bruno.request, 'DELETE', `/households/${householdId}/members/${anaId}`);
    const demote = await apiCall(bruno.request, 'PATCH', `/households/${householdId}/members/${anaId}`, { role: 'READER' });
    const leave = await apiCall(ana.request, 'DELETE', `/households/${householdId}/members/${anaId}`);
    expect([expel.status, expel.code, demote.status, demote.code, leave.status, leave.code]).toEqual([403, 'ERR-ACC-FORBIDDEN', 403, 'ERR-ACC-FORBIDDEN', 409, 'ERR-HOUSE-OWNER-CANNOT-LEAVE']);
    expect((await householdView(ana)).body.members.find((m) => m.membership.username === 'ana.e2e')?.membership.role).toBe('ADMIN');
  });

  test('[SC-017][REQ-HOUSE2-003] desasignar, reasignar y expulsar: Carla ve Argos solo mientras esté asignado y siga ACTIVE; expulsada recibe 404 del hogar y de la mascota', async () => {
    expect((await apiCall(ana.request, 'DELETE', `/pets/${argosId}/assignments/${householdId}`)).status).toBe(204);
    expect((await householdPets(carla)).body.pets).toEqual([]);
    const unassigned = await apiCall(carla.request, 'GET', `/pets/${argosId}/dashboard`);
    expect([unassigned.status, unassigned.code]).toEqual([404, 'ERR-PET-NOT-FOUND']);
    expect((await apiCall(ana.request, 'PUT', `/pets/${argosId}/assignments/${householdId}`)).status).toBe(200);
    expect(petNames((await householdPets(carla)).body.pets)).toEqual(['Argos']);

    const carlaId = (await householdView(ana)).body.members.find((m) => m.membership.username === 'carla.e2e')?.membership.userId;
    expect((await apiCall(ana.request, 'DELETE', `/households/${householdId}/members/${carlaId}`)).status).toBe(204);
    const house = await householdView(carla);
    const pets = await householdPets(carla);
    const dashboard = await apiCall(carla.request, 'GET', `/pets/${argosId}/dashboard`);
    expect([house.code, pets.code, dashboard.code]).toEqual(['ERR-HOUSE-NOT-FOUND', 'ERR-HOUSE-NOT-FOUND', 'ERR-PET-NOT-FOUND']);
    expect(memberSummary((await householdView(ana)).body).map((m) => m.username)).toEqual(['ana.e2e', 'bruno.e2e', 'dario.e2e']);
  });

  test('[REQ-HOUSE-004][REQ-UI-006] Dario abandona el hogar y vuelve a recibir 404; Ana elimina el hogar con confirmación, las mascotas siguen siendo suyas y no hubo errores de página', async () => {
    await darioPage.goto('/households');
    await darioPage.getByRole('button', { name: 'Abandonar hogar' }).click();
    await expect(darioPage.getByText('Aún no perteneces a ningún hogar.')).toBeVisible();
    expect((await householdView(dario)).code).toBe('ERR-HOUSE-NOT-FOUND');

    await anaPage.goto('/households');
    await anaPage.getByRole('button', { name: 'Eliminar hogar' }).click();
    await anaPage.getByRole('button', { name: 'Confirmar eliminación' }).click();
    await expect(anaPage.getByText('Aún no perteneces a ningún hogar.')).toBeVisible();
    for (const context of [ana, bruno]) expect((await householdView(context)).code).toBe('ERR-HOUSE-NOT-FOUND');
    expect(petNames((await apiCall<PetCardBody[]>(ana.request, 'GET', '/pets')).body)).toContain('Argos');
    expect((await apiCall(bruno.request, 'GET', `/pets/${argosId}/dashboard`)).code).toBe('ERR-PET-NOT-FOUND');
    expect(pageErrors).toEqual([]);
  });
});

test.describe('ADMIN de hogar que no es propietario (tests/e2e/visual)', () => {
  test('[REQ-HOUSE2-001][REQ-RBAC-001][INV-ACC2-002] el ADMIN invita (202) y en su navegador ve Editar pero no Eliminar el expediente, que solo es del Propietario Legal', async ({ browser }) => {
    const owner = await browser.newContext();
    const admin = await browser.newContext();
    const guest = await browser.newContext();
    const adminPage = await admin.newPage();
    try {
      await registerViaApi(owner.request, 'ana2.e2e', 'Ana Dos', 'AnaDosClave2026!');
      await registerViaApi(admin.request, 'bruno2.e2e', 'Bruno Dos', 'BrunoDosClave2026!');
      await registerViaApi(guest.request, 'carlos2.e2e', 'Carlos Dos', 'CarlosDosClave2026!');
      const house = await apiCall<{ household: { id: string } }>(owner.request, 'POST', '/households', { name: 'Casa Ana Dos' });
      const id = house.body.household.id;
      const petId = await createPetViaApi(owner.request, 'Argos Dos', 'CANINE');
      expect((await apiCall(owner.request, 'POST', `/households/${id}/invitations`, { username: 'bruno2.e2e', roleOnJoin: 'ADMIN' })).status).toBe(202);
      expect((await apiCall(admin.request, 'POST', `/invitations/${id}/accept`)).status).toBe(200);
      expect((await apiCall(owner.request, 'PUT', `/pets/${petId}/assignments/${id}`)).status).toBe(200);

      const adminInvite = await apiCall(admin.request, 'POST', `/households/${id}/invitations`, { username: 'carlos2.e2e', roleOnJoin: 'CAREGIVER' });
      expect.soft([adminInvite.status, adminInvite.code], 'el ADMIN no propietario invita (REQ-HOUSE2-001)').toEqual([202, null]);
      const seenByOwner = await apiCall<HouseholdViewBody>(owner.request, 'GET', `/households/${id}`);
      expect.soft(seenByOwner.body.pendingInvitations.map((i) => [i.roleOnJoin, i.status])).toEqual([['CAREGIVER', 'INVITED']]);

      await adminPage.goto('/');
      await adminPage.getByRole('tab', { name: 'Casa Ana Dos' }).click();
      await adminPage.getByRole('option', { name: /Argos Dos/ }).click();
      await expect(adminPage.getByRole('heading', { name: 'Argos Dos', level: 2 })).toBeVisible();
      await expect(adminPage.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(1);
      await expect.soft(adminPage.getByRole('button', { name: 'Eliminar', exact: true }), 'deletePet es false para ADMIN (REQ-RBAC-001)').toHaveCount(0);
    } finally {
      await Promise.all([owner.close(), admin.close(), guest.close()]);
    }
  });
});
