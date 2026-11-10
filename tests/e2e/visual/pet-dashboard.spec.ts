/**
 * E2E de un usuario sobre la app real: registro, sesión, mascotas, ficha con sus módulos, semáforo de
 * alertas, filtro, respaldo y eliminación. Cada paso usa la SPA como lo haría una persona (roles y etiquetas
 * accesibles) y comprueba lo que devuelve la API real.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { isoDateFromToday } from './e2e-support.ts';

const USER = { username: 'duena.e2e', displayName: 'Dueña', password: 'Secreto2026a' };

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ acceptDownloads: true });
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
});

test.afterAll(async () => {
  await context.close();
});

const petOptions = () => page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option');

test.describe('flujo de un usuario (tests/e2e/visual)', () => {
  test('[REQ-UI-005][REQ-AUTH-001] una ruta protegida lleva a /login; el registro valida en cliente con el catálogo y deja la sesión abierta', async () => {
    await page.goto('/backup');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('link', { name: 'Regístrate' }).click();
    await page.getByLabel(/Usuario \(minúsculas/).fill(USER.username);
    await page.getByLabel('Nombre visible').fill(USER.displayName);
    await page.getByLabel('Contraseña (8 a 128, con letra y dígito)').fill('corta');
    await page.getByRole('button', { name: 'Registrarme' }).click();
    await expect(page.getByText('La contraseña debe tener entre 8 y 128 caracteres')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByLabel('Contraseña (8 a 128, con letra y dígito)').fill(USER.password);
    await page.getByRole('button', { name: 'Registrarme' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });

  test('[REQ-UI-001][REQ-UI-002] alta de mascota; el peso fuera de rango se rechaza en cliente; dos pesos dan tabla con variación y gráfico SVG', async () => {
    await page.getByRole('button', { name: 'Nueva mascota' }).click();
    await page.locator('#new-pet-name').fill('Argos');
    await page.getByLabel('Raza').fill('Pastor alemán');
    await page.getByLabel('Fecha de nacimiento').fill('2020-05-01');
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    await expect(petOptions()).toHaveCount(1);

    await page.locator('#weights-recordedAt').fill('2026-01-10');
    await page.locator('#weights-weightKg').fill('200');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('El peso debe situarse entre 0.05 kg y 150.00 kg').first()).toBeVisible();

    for (const [date, kg] of [['2026-01-10', '32.85'], ['2026-02-10', '32.40']] as const) {
      await page.locator('#weights-recordedAt').fill(date);
      await page.locator('#weights-weightKg').fill(kg);
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('cell', { name: `${kg} kg` }).first()).toBeVisible();
    }
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toContainText('−0.45 kg');
    await expect(firstRow).toContainText('−1.37 %');
    await expect(page.locator('svg[role="img"] circle')).toHaveCount(2);
  });

  test('[REQ-UI-003] semáforo: vacuna vencida en Rojo, próxima en Ámbar, al día en Verde y la reemplazada en Gris, cada una con texto', async () => {
    await page.getByRole('tab', { name: 'Vacunas' }).click();
    const vaccines = [
      ['Rabia', isoDateFromToday(-400), isoDateFromToday(-30)],
      ['Rabia', isoDateFromToday(-20), isoDateFromToday(-2)],
      ['Moquillo', isoDateFromToday(-100), isoDateFromToday(10)],
      ['Parvovirus', isoDateFromToday(-10), isoDateFromToday(200)],
    ] as const;
    for (const [index, [name, appliedAt, nextBoosterAt]] of vaccines.entries()) {
      await page.locator('#vaccinations-vaccineName').fill(name);
      await page.locator('#vaccinations-appliedAt').fill(appliedAt);
      await page.locator('#vaccinations-nextBoosterAt').fill(nextBoosterAt);
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.locator('[data-alert-status]')).toHaveCount(index + 1);
    }
    const badge = (status: string) => page.locator(`[data-alert-status="${status}"]`);
    await expect(badge('OVERDUE')).toHaveAttribute('data-ui-badge', 'DANGER_RED');
    await expect(badge('OVERDUE')).toContainText('2 días de retraso');
    await expect(badge('DUE_SOON')).toHaveAttribute('data-ui-badge', 'WARNING_AMBER');
    await expect(badge('DUE_SOON')).toContainText('10 días');
    await expect(badge('UP_TO_DATE')).toHaveAttribute('data-ui-badge', 'SUCCESS_GREEN');
    await expect(badge('SUPERSEDED')).toHaveAttribute('data-ui-badge', 'NEUTRAL_GRAY');
  });

  test('[REQ-UI-002] las pestañas de módulos se manejan con teclado: Fin, Inicio y flechas', async () => {
    const tab = (name: string) => page.getByRole('tab', { name });
    await tab('Vacunas').focus();
    await page.keyboard.press('End');
    await expect(tab('Parámetros')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(tab('Peso')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tab('Medidas')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tab('Peso')).toHaveAttribute('aria-selected', 'true');
  });

  test('[REQ-UI-001] la tarjeta cuenta las alertas OVERDUE y DUE_SOON; el filtro por nombre y especie lo resuelve la API sin tildes', async () => {
    await expect(petOptions().first()).toContainText('Alertas: 1 vencidas · 1 próximas');
    await page.getByRole('button', { name: 'Nueva mascota' }).click();
    await page.locator('#new-pet-name').fill('Ñandú');
    await page.locator('#new-pet-species').selectOption('CAT');
    await page.getByLabel('Raza').fill('Criollo');
    await page.getByLabel('Fecha de nacimiento').fill('2022-03-03');
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(page.getByRole('heading', { name: 'Ñandú', level: 2 })).toBeVisible();
    await expect(petOptions()).toHaveCount(2);

    await page.getByRole('option', { name: /Ñandú/ }).focus();
    await page.keyboard.press('Home');
    await expect(page.getByRole('option', { name: /Argos/ })).toHaveAttribute('aria-selected', 'true');

    const filtered = page.waitForRequest((r) => r.url().includes('/api/pets?') && r.url().includes('q=nandu'));
    await page.getByRole('searchbox').fill('nandu');
    await filtered;
    await expect(petOptions()).toHaveCount(1);
    await expect(petOptions().first()).toContainText('Ñandú');
    await page.getByRole('searchbox').fill('');
    await expect(petOptions()).toHaveCount(2);
  });

  test('[REQ-AUTH-003][REQ-AUTH-002][REQ-UI-005] cerrar sesión lleva a /login; credenciales erróneas muestran el error genérico; el login correcto vuelve a entrar', async () => {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
    await page.getByLabel('Usuario').fill(USER.username);
    await page.getByLabel('Contraseña').fill('Equivocada2026');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
    await page.getByLabel('Contraseña').fill(USER.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });

  test('[REQ-UI-001] respaldo: se descarga con el nombre de la API, se vuelve a importar y un JSON roto se rechaza sin cambios', async ({}, testInfo) => {
    await page.getByRole('link', { name: 'Respaldo' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar respaldo' }).click()]);
    const backupPath = testInfo.outputPath('backup.json');
    await download.saveAs(backupPath);
    const envelope = JSON.parse(readFileSync(backupPath, 'utf8')) as { schemaVersion: string; pets: Array<{ name: string }> };
    expect([download.suggestedFilename().match(/^argos-backup-\d{4}-\d{2}-\d{2}\.json$/) !== null, envelope.schemaVersion, envelope.pets.map((p) => p.name).sort()]).toEqual([
      true,
      '2.0.0',
      ['Argos', 'Ñandú'],
    ]);
    await page.locator('input[type="file"]').setInputFiles(backupPath);
    await page.getByRole('button', { name: 'Importar respaldo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Importación completada' })).toBeVisible();
    const brokenPath = testInfo.outputPath('roto.json');
    writeFileSync(brokenPath, '{ roto');
    await page.locator('input[type="file"]').setInputFiles(brokenPath);
    await page.getByRole('button', { name: 'Importar respaldo' }).click();
    await expect(page.getByText(/no es un documento JSON sintácticamente válido.*No se modificó ningún dato/)).toBeVisible();
  });

  test('[REQ-UI-001] eliminar una mascota exige escribir su nombre; después desaparece de la lista; sin errores de página en todo el flujo', async () => {
    await page.getByRole('link', { name: 'Mascotas' }).click();
    await page.getByRole('option', { name: /Argos/ }).click();
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    const confirm = page.getByRole('button', { name: 'Eliminar definitivamente' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Nombre de la mascota').fill('Argos');
    await confirm.click();
    await expect(petOptions()).toHaveCount(1);
    await expect(petOptions().first()).toContainText('Ñandú');
    expect(pageErrors).toEqual([]);
  });
});
