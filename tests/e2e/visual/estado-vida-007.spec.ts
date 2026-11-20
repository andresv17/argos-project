/**
 * T1029 (007, Bloque C, [GH:#13]) E2E del estado de vida contra la API real y la SPA: marcar fallecida (selector «Estado» y «Fecha de fallecimiento»), ver la insignia y
 * «Vivió …» con el historial intacto, revertir con la confirmación explícita, exportar e importar el respaldo (con aviso de Fallecido → Vivo) y la edición obsoleta con 412
 * («Esta ficha cambió, recarga»). REQ-FAL7-003, REQ-FAL7-007, REQ-FAL7-009, EDGE-007-009; SC-007-010..012, SC-007-034.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { accessibilityFindings, apiCall, createPetViaApi, registerViaApi, typeDate } from './e2e-support.ts';

test.describe.configure({ mode: 'serial' });

test.describe('estado de vida de la ficha (007, T1029)', () => {
  let context: BrowserContext;
  let page: Page;
  let petId = '';
  const form = () => page.getByRole('form', { name: /Editar a Argos/ });
  const save = async (): Promise<void> => {
    await form().getByRole('button', { name: 'Guardar' }).click();
  };
  const edit = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Editar a Argos/ })).toBeVisible();
  };

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `vida7.${info.project.name}`, 'Dueña Vida', 'VidaClave2026!');
    petId = await createPetViaApi(context.request, 'Argos', 'CANINE', '2020-05-01');
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('[SC-007-011][REQ-FAL7-003] marcar Fallecido pide la fecha, muestra la insignia en la ficha y en la tarjeta y «Vivió …» en lugar de la edad', async () => {
    await edit();
    await expect(page.getByLabel('Estado')).toHaveValue('ALIVE');
    await expect(page.getByText('Fecha de fallecimiento')).toHaveCount(0);
    await page.getByLabel('Estado').selectOption('DECEASED');
    await typeDate(page, page.locator(`#edit-pet-${petId}-deceasedAt`), '2026-06-10');
    await save();
    await expect(page.getByText('Fallecido · 10/06/2026').first()).toBeVisible();
    await expect(page.getByLabel('Edad', { exact: true })).toContainText('Vivió 6 años');
    await expect(page.getByRole('option', { name: /Argos/ })).toContainText('Fallecido');
  });

  test('[SC-007-012][REQ-FAL7-003] el historial sigue intacto: «Historial / Archivos» se abre y la ficha conserva los módulos', async () => {
    await page.getByRole('tab', { name: 'Historial / Archivos', exact: true }).click();
    await expect(page.getByRole('tabpanel', { name: 'Historial / Archivos' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Módulos de la ficha' }).getByRole('tab')).toHaveCount(7);
  });

  test('[SC-007-010][REQ-FAL7-009] el respaldo exportado lleva lifeStatus y deceasedAt y al importarlo la ficha sigue fallecida', async ({}, testInfo) => {
    await page.getByRole('link', { name: 'Respaldo' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar respaldo' }).click()]);
    const file = testInfo.outputPath('vida.json');
    await download.saveAs(file);
    const envelope = JSON.parse(readFileSync(file, 'utf8')) as { schemaVersion: string; pets: Array<{ lifeStatus: string; deceasedAt: string | null }> };
    expect([envelope.schemaVersion, envelope.pets[0]?.lifeStatus, envelope.pets[0]?.deceasedAt]).toEqual(['3.2.0', 'DECEASED', '2026-06-10']);
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText('Previsualización (versión 3.2.0)')).toBeVisible();
    await expect(page.getByText(/volverá a figurar como viva/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Importar respaldo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Importación completada' })).toBeVisible();
    const pets = await apiCall<Array<{ profile: { lifeStatus: string } }>>(context.request, 'GET', '/pets');
    expect(pets.body[0]?.profile.lifeStatus).toBe('DECEASED');
  });

  test('[SC-007-030][REQ-FAL7-009] un respaldo con la ficha viva sobre una fallecida avisa y exige la casilla antes de importar', async ({}, testInfo) => {
    const exported = await apiCall<{ pets: Array<{ lifeStatus: string; deceasedAt: string | null }> }>(context.request, 'POST', '/backup/export');
    expect(exported.status).toBe(200);
    const alive = { ...exported.body, pets: exported.body.pets.map((p) => ({ ...p, lifeStatus: 'ALIVE', deceasedAt: null })) };
    const { writeFileSync } = await import('node:fs');
    const file = testInfo.outputPath('viva.json');
    writeFileSync(file, JSON.stringify(alive));
    await page.goto('/backup');
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText('1 mascota fallecida volverá a figurar como viva con este archivo.')).toBeVisible();
    const importButton = page.getByRole('button', { name: 'Importar respaldo' });
    await expect(importButton).toBeDisabled();
    await page.getByLabel(/Confirmo que 1 mascota fallecida volverá a Vivo/).check();
    await expect(importButton).toBeEnabled();
  });

  test('[REQ-FAL7-003][EDGE-007-004] volver a Vivo pide confirmación explícita; «Mantener Fallecido» no cambia nada y confirmar borra la fecha', async () => {
    await page.goto('/');
    await page.getByRole('option', { name: /Argos/ }).click();
    await edit();
    await page.getByLabel('Estado').selectOption('ALIVE');
    await save();
    await expect(page.getByRole('alert').filter({ hasText: 'Al volver a Vivo se reactivarán las alertas' })).toBeVisible();
    await page.getByRole('button', { name: 'Mantener Fallecido' }).click();
    await expect(page.getByLabel('Estado')).toHaveValue('DECEASED');
    let current = await apiCall<{ profile: { lifeStatus: string } }>(context.request, 'GET', `/pets/${petId}/dashboard`);
    expect(current.body.profile.lifeStatus).toBe('DECEASED');
    await page.getByLabel('Estado').selectOption('ALIVE');
    await save();
    await page.getByRole('button', { name: 'Confirmar y volver a Vivo' }).click();
    await expect(page.getByText('Fallecido · 10/06/2026')).toHaveCount(0);
    current = await apiCall(context.request, 'GET', `/pets/${petId}/dashboard`);
    expect(current.body.profile.lifeStatus).toBe('ALIVE');
  });

  test('[SC-007-034][EDGE-007-009] una edición con la ficha obsoleta recibe 412 «Esta ficha cambió, recarga» y no cambia nada', async () => {
    await edit();
    // Otra sesión edita la ficha mientras el formulario sigue abierto con la versión anterior.
    const dashboard = await apiCall<{ profile: { version: number } }>(context.request, 'GET', `/pets/${petId}/dashboard`);
    const other = await context.request.patch(`/api/pets/${petId}`, { headers: { 'X-Argos-Request': '1', 'If-Match': `"${dashboard.body.profile.version}"` }, data: { name: 'Argos II' } });
    expect(other.status()).toBe(200);
    await page.locator(`#edit-pet-${petId}-name`).fill('Cambio local');
    await save();
    await expect(page.getByText('Esta ficha cambió, recarga')).toBeVisible();
    const after = await apiCall<{ profile: { name: string } }>(context.request, 'GET', `/pets/${petId}/dashboard`);
    expect(after.body.profile.name).toBe('Argos II');
  });

  test('[NFR-007-002][SC-007-011] la ficha de una fallecida y su formulario no tienen violaciones críticas de WCAG 2.1 AA ni desbordan a 320, 1024 y 1280 px', async () => {
    await page.goto('/');
    await page.getByRole('option', { name: /Argos/ }).click();
    await edit();
    await page.getByLabel('Estado').selectOption('DECEASED');
    await typeDate(page, page.locator(`#edit-pet-${petId}-deceasedAt`), '2026-06-10');
    expect(await accessibilityFindings(page, 'formulario con estado Fallecido')).toEqual([]);
    await save();
    await expect(page.getByText('Fallecido · 10/06/2026').first()).toBeVisible();
    expect(await accessibilityFindings(page, 'ficha de una fallecida')).toEqual([]);
  });
});
