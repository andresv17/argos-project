/**
 * E2E del autocompletado de colaboradores (feature 008, `[GH:#24]`, T1192) en Chromium con la app real: con 2 caracteres no hay búsqueda ni lista; con 3 aparecen las
 * sugerencias (solo `username`); flechas y Enter eligen sin enviar el formulario; Escape cierra la lista conservando lo escrito; y se puede escribir un `username`
 * completo e invitar sin elegir sugerencia; un prefijo sin candidatos muestra el mensaje neutro (D8-11) sin opciones; y, agotado el cupo de búsquedas, el combobox
 * muestra el mensaje de límite sin romper el formulario.
 *
 * @implements REQ-INV8-001, REQ-INV8-005
 */
import { expect, test, type Page } from '@playwright/test';
import { apiCall, apiPost, householdIdByName, registerViaApi } from './e2e-support.ts';

const HOUSE = 'Casa Autocompletado';
const PASSWORD = 'ClaveE2E2026!';
const SEEDS = ['pedro.a', 'pedro.b', 'pedro.c'] as const;

test.describe.configure({ mode: 'serial' });

let page: Page;
let householdId: string;
const pageErrors: string[] = [];
const inviteeRequests: string[] = [];

test.beforeAll(async ({ browser }) => {
  for (const username of SEEDS) {
    const context = await browser.newContext();
    await registerViaApi(context.request, username, username, PASSWORD);
    await context.close();
  }
  const context = await browser.newContext();
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('request', (request) => {
    if (request.url().includes('/invitees')) inviteeRequests.push(new URL(request.url()).searchParams.get('q') ?? '');
  });
  await registerViaApi(context.request, 'ana.auto', 'Ana', PASSWORD);
  await apiPost(context.request, '/households', { name: HOUSE });
  householdId = await householdIdByName(context.request, HOUSE);
  await page.goto('/households');
  await expect(page.getByRole('heading', { name: new RegExp(HOUSE), level: 3 })).toBeVisible();
});

test.afterAll(async () => {
  await page.context().close();
});

const combobox = () => page.getByRole('combobox', { name: /Invitar por usuario/ });
const listbox = () => page.getByRole('listbox', { name: 'Usuarios disponibles' });
const options = () => listbox().getByRole('option');
const pendingUsernames = async () => {
  const view = await apiCall<{ pendingInvitations: Array<{ inviteeUsername: string }> }>(page.context().request, 'GET', `/households/${householdId}`);
  return view.body.pendingInvitations.map((i) => i.inviteeUsername);
};

test.describe('autocompletado de colaboradores (T1192, Chromium)', () => {
  test('[REQ-INV8-001][SC-008-049] con 2 caracteres no hay búsqueda ni lista; con 3 aparecen las sugerencias solo por username', async () => {
    await combobox().click();
    await combobox().pressSequentially('pe');
    await page.waitForTimeout(600); // más que la espera de 300 ms: si hubiera búsqueda ya habría salido
    expect(inviteeRequests).toEqual([]);
    await expect(listbox()).toBeHidden();
    await combobox().pressSequentially('d');
    await expect(options()).toHaveText(['pedro.a', 'pedro.b', 'pedro.c']);
    await expect(combobox()).toHaveAttribute('aria-expanded', 'true');
    expect(inviteeRequests).toEqual(['ped']);
  });

  test('[REQ-INV8-005][SC-008-054] flechas y Enter eligen la sugerencia sin enviar el formulario', async () => {
    await combobox().press('ArrowDown');
    await combobox().press('ArrowDown');
    const second = options().nth(1);
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await expect(combobox()).toHaveAttribute('aria-activedescendant', (await second.getAttribute('id'))!);
    await combobox().press('Enter');
    await expect(combobox()).toHaveValue('pedro.b');
    await expect(listbox()).toBeHidden();
    expect(await pendingUsernames()).toEqual([]); // Enter eligió; no invitó
    expect(inviteeRequests).toEqual(['ped']); // elegir no lanza otra búsqueda
  });

  test('[REQ-INV8-005][SC-008-054] Escape cierra la lista y conserva lo escrito', async () => {
    await page.waitForTimeout(400); // deja pasar la espera de 300 ms tras elegir (borrar y reescribir el mismo prefijo antes no relanza la búsqueda: ver acta)
    await combobox().fill('');
    await combobox().pressSequentially('ped');
    await expect(options()).toHaveCount(3);
    await combobox().press('Escape');
    await expect(listbox()).toBeHidden();
    await expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    await expect(combobox()).toHaveValue('ped');
  });

  test('[REQ-INV8-005][REQ-HOUSE2-001] se puede escribir un username completo e invitar sin elegir sugerencia', async () => {
    await combobox().fill('');
    await combobox().pressSequentially('pedro.c');
    await expect(options()).toHaveText(['pedro.c']); // sugiere, pero no se elige
    await page.getByRole('form', { name: 'Invitar miembro' }).getByRole('button', { name: 'Invitar' }).click();
    await expect(combobox()).toHaveValue('');
    await expect.poll(pendingUsernames).toEqual(['pedro.c']);
    expect(pageErrors).toEqual([]);
  });

  test('[REQ-INV8-001][SC-008-049] un prefijo válido sin candidatos muestra el mensaje neutro y ninguna opción', async () => {
    const before = inviteeRequests.length;
    await combobox().fill('');
    await combobox().pressSequentially('qzx');
    await expect(page.locator('p.text-text-muted', { hasText: 'No se encontraron usuarios disponibles para invitar.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'No se encontraron usuarios disponibles para invitar.' })).toHaveCount(1); // anunciado a lectores de pantalla (H-T1192-2)
    await expect(options()).toHaveCount(0);
    await expect(listbox()).toBeHidden();
    await expect(combobox()).toHaveAttribute('aria-expanded', 'false');
    expect(inviteeRequests.slice(before)).toEqual(['qzx']);
    await expect(combobox()).toHaveValue('qzx'); // lo escrito se conserva
    expect(pageErrors).toEqual([]);
  });

  test('[REQ-INV8-005][SC-008-055] agotado el cupo, el combobox muestra el mensaje de límite y el formulario sigue operativo', async () => {
    // Se agota el cupo (30 por minuto por usuario) con la misma sesión; se detiene en el primer 429 para no depender de cuántas consultas gastaron las pruebas previas.
    let limited = false;
    for (let attempt = 0; attempt < 40 && !limited; attempt += 1) {
      const outcome = await apiCall(page.context().request, 'GET', `/households/${householdId}/invitees?q=qzx`);
      limited = outcome.status === 429;
    }
    expect(limited).toBe(true);
    await combobox().fill('');
    await combobox().pressSequentially('lim');
    const limitText = 'Hiciste muchas búsquedas seguidas. Espera un momento e inténtalo de nuevo.';
    await expect(page.locator('p.text-red-800', { hasText: limitText })).toBeVisible(); // aviso visible
    await expect(page.getByRole('status').filter({ hasText: limitText })).toHaveCount(1); // y anunciado a lectores de pantalla
    await expect(options()).toHaveCount(0);
    await expect(listbox()).toBeHidden();
    // El formulario no se rompe: el campo conserva lo escrito y sigue editable, el botón Invitar sigue habilitado y no hubo errores de página.
    await expect(combobox()).toHaveValue('lim');
    await expect(combobox()).toBeEditable();
    await expect(page.getByRole('form', { name: 'Invitar miembro' }).getByRole('button', { name: 'Invitar' })).toBeEnabled();
    await combobox().pressSequentially('x');
    await expect(combobox()).toHaveValue('limx');
    expect(pageErrors).toEqual([]);
  });
});
