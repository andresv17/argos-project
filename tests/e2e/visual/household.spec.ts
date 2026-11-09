/**
 * E2E de dos usuarios y un hogar en contextos de navegador separados (TASK-114, REQ-UI-006): crear, invitar,
 * INVITED sin acceso (404), aceptar, ver el hogar con distinción de dueño, abandonar, retirar, rechazar y eliminar.
 * Ana es la OWNER; Beto, el invitado.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPetViaApi, householdIdByName, registerViaApi } from './e2e-support.ts';

const HOUSE = 'Casa Ana';

test.describe.configure({ mode: 'serial' });

let ownerContext: BrowserContext;
let guestContext: BrowserContext;
let owner: Page;
let guest: Page;
let householdId: string;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  ownerContext = await browser.newContext();
  guestContext = await browser.newContext();
  owner = await ownerContext.newPage();
  guest = await guestContext.newPage();
  for (const p of [owner, guest]) p.on('pageerror', (error) => pageErrors.push(String(error)));
  await registerViaApi(ownerContext.request, 'ana.e2e', 'Ana', 'AnaClave2026');
  await registerViaApi(guestContext.request, 'beto.e2e', 'Beto', 'BetoClave2026');
  await createPetViaApi(ownerContext.request, 'Argos', 'DOG');
  await createPetViaApi(guestContext.request, 'Bruma', 'CAT');
});

test.afterAll(async () => {
  await ownerContext.close();
  await guestContext.close();
});

const pendingCounter = (page: Page) => page.locator('[data-pending-invitations]');
const householdHeading = (page: Page) => page.getByRole('heading', { name: new RegExp(HOUSE), level: 3 });

async function inviteGuest(): Promise<void> {
  await owner.getByLabel('Invitar por usuario').fill('beto.e2e');
  await owner.getByRole('button', { name: 'Invitar' }).click();
  await expect(owner.locator('[data-membership-status="INVITED"]')).toHaveCount(1);
}

test.describe('TASK-114: dos usuarios y un hogar (tests/e2e/visual)', () => {
  test('[REQ-HOUSE-001][REQ-UI-006] Ana crea el hogar desde la pantalla de hogares y queda como OWNER ACTIVE', async () => {
    await owner.goto('/households');
    await owner.getByLabel('Nombre del nuevo hogar').fill(HOUSE);
    await owner.getByRole('button', { name: 'Crear hogar' }).click();
    await expect(householdHeading(owner)).toBeVisible();
    await expect(owner.locator('[data-membership-status="ACTIVE"]')).toHaveCount(1);
    householdId = await householdIdByName(ownerContext.request, HOUSE);
  });

  test('[REQ-HOUSE-002][REQ-UI-006] Ana invita a Beto y ve la membresía INVITED; invitar a un usuario inexistente muestra el error del catálogo', async () => {
    await inviteGuest();
    await expect(owner.getByText('Invitación pendiente')).toBeVisible();
    await owner.getByLabel('Invitar por usuario').fill('nadie.e2e');
    await owner.getByRole('button', { name: 'Invitar' }).click();
    await expect(owner.getByText('No existe ningún usuario con ese nombre de usuario.').first()).toBeVisible();
  });

  test('[REQ-HOUSE-004][REQ-HOUSE-002] Beto INVITED ve la invitación pero no el hogar: ni tarjeta ni contexto, y la API responde 404 al hogar y a sus mascotas', async () => {
    await guest.goto('/households');
    await expect(pendingCounter(guest)).toHaveAttribute('data-pending-invitations', '1');
    await expect(guest.getByRole('button', { name: 'Aceptar' })).toBeVisible();
    await expect(householdHeading(guest)).toHaveCount(0);
    const house = await guest.request.get(`/api/households/${householdId}`);
    const pets = await guest.request.get(`/api/households/${householdId}/pets`);
    const houseBody = await house.text();
    expect([house.status(), (JSON.parse(houseBody) as { code: string }).code, pets.status(), houseBody.includes('Argos') || houseBody.includes('Ana')]).toEqual([
      404,
      'ERR-HOUSE-NOT-FOUND',
      404,
      false,
    ]);
    await guest.getByRole('link', { name: 'Mascotas' }).click();
    await expect(guest.getByRole('tab', { name: 'Mis mascotas' })).toBeVisible();
    await expect(guest.getByRole('tab', { name: HOUSE })).toHaveCount(0);
    await expect(guest.getByRole('option', { name: /Argos/ })).toHaveCount(0);
  });

  test('[REQ-HOUSE-003][REQ-UI-006] Beto acepta: el contador baja a 0, ve la tarjeta del hogar y la API ya le responde 200', async () => {
    await guest.getByRole('link', { name: /Hogares/ }).click();
    await guest.getByRole('button', { name: 'Aceptar' }).click();
    await expect(householdHeading(guest)).toBeVisible();
    await expect(pendingCounter(guest)).toHaveAttribute('data-pending-invitations', '0');
    expect((await guest.request.get(`/api/households/${householdId}`)).status()).toBe(200);
  });

  test('[REQ-HOUSE-005][REQ-UI-007][REQ-UI-001] en el contexto del hogar Beto ve las mascotas de ambos con dueño en texto y color; la ajena es de solo lectura', async () => {
    await guest.getByRole('link', { name: 'Mascotas' }).click();
    await guest.getByRole('tab', { name: HOUSE }).click();
    const foreign = guest.getByRole('option', { name: /Argos/ });
    const own = guest.getByRole('option', { name: /Bruma/ });
    await expect(foreign).toContainText('Dueño: Ana');
    await expect(foreign).toContainText('Solo lectura');
    await expect(foreign.locator('[data-owner-badge="OWNER_COLOR_1"]')).toHaveCount(1);
    await expect(own).toContainText('Dueño: Beto');
    await expect(own.locator('[data-owner-badge="OWNER_COLOR_2"]')).toHaveCount(1);
    await foreign.click();
    await expect(guest.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    await expect(guest.getByText('Dueño: Ana').first()).toBeVisible();
    for (const action of ['Editar', 'Eliminar', 'Guardar']) await expect(guest.getByRole('button', { name: action, exact: true })).toHaveCount(0);
  });

  test('[REQ-UI-001][REQ-HOUSE-005] el filtro en el hogar lo resuelve la API (q y species) y conserva los colores de dueño', async () => {
    const byName = guest.waitForRequest((r) => r.url().includes(`/api/households/${householdId}/pets?`) && r.url().includes('q=ARG'));
    await guest.getByRole('searchbox').fill('ARG');
    await byName;
    const options = guest.getByRole('listbox', { name: 'Mascotas' }).getByRole('option');
    await expect(options).toHaveCount(1);
    await expect(options.first().locator('[data-owner-badge="OWNER_COLOR_1"]')).toHaveCount(1);
    await guest.getByRole('searchbox').fill('');
    await expect(options).toHaveCount(2);
  });

  test('[REQ-UI-007] en "Mis mascotas" no hay insignia de color: el colorToken es null fuera del hogar', async () => {
    await owner.goto('/');
    await expect(owner.getByRole('option', { name: /Argos/ })).toBeVisible();
    await expect(owner.locator('[data-owner-badge^="OWNER_COLOR_"]')).toHaveCount(0);
    await expect(owner.getByRole('option', { name: /Bruma/ })).toHaveCount(0);
  });

  test('[REQ-HOUSE-004][REQ-UI-006] Beto abandona el hogar y vuelve a recibir 404; Ana lo invita otra vez, Beto acepta y Ana lo retira', async () => {
    await guest.getByRole('link', { name: /Hogares/ }).click();
    await guest.getByRole('button', { name: 'Abandonar hogar' }).click();
    await expect(guest.getByText('Aún no perteneces a ningún hogar.')).toBeVisible();
    expect((await guest.request.get(`/api/households/${householdId}`)).status()).toBe(404);

    await owner.goto('/households');
    await inviteGuest();
    await guest.reload();
    await guest.getByRole('button', { name: 'Aceptar' }).click();
    await expect(householdHeading(guest)).toBeVisible();

    await owner.reload();
    await expect(owner.locator('[data-membership-status="ACTIVE"]')).toHaveCount(2);
    await owner.getByRole('button', { name: 'Retirar' }).click();
    await expect(owner.locator('[data-membership-status="ACTIVE"]')).toHaveCount(1);
    await guest.reload();
    await expect(guest.getByText('Aún no perteneces a ningún hogar.')).toBeVisible();
    expect((await guest.request.get(`/api/households/${householdId}/pets`)).status()).toBe(404);
  });

  test('[REQ-HOUSE-003][REQ-HOUSE-004][REQ-UI-006] Beto rechaza una nueva invitación; Ana elimina el hogar con confirmación; sin errores de página', async () => {
    await inviteGuest();
    await guest.reload();
    await expect(pendingCounter(guest)).toHaveAttribute('data-pending-invitations', '1');
    await guest.getByRole('button', { name: 'Rechazar' }).click();
    await expect(pendingCounter(guest)).toHaveAttribute('data-pending-invitations', '0');
    await expect(householdHeading(guest)).toHaveCount(0);

    await owner.getByRole('button', { name: 'Eliminar hogar' }).click();
    await owner.getByRole('button', { name: 'Confirmar eliminación' }).click();
    await expect(owner.getByText('Aún no perteneces a ningún hogar.')).toBeVisible();
    expect((await ownerContext.request.get(`/api/households/${householdId}`)).status()).toBe(404);
    expect(pageErrors).toEqual([]);
  });
});
