/**
 * E2E del contador de hogares (hallazgo 6-B de Neo): al crear un hogar, el contador de "Hogares" del
 * encabezado se actualiza sin recargar la página y el hogar aparece en la lista de la pantalla.
 */
import { expect, test } from '@playwright/test';
import { registerViaApi } from './e2e-support.ts';

test.describe('contador de hogares (tests/e2e/visual)', () => {
  test('[REQ-HOUSE-001][REQ-UI-006] crear un hogar actualiza el contador de Hogares sin recargar y lo lista', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await registerViaApi(context.request, 'contador.e2e', 'Contador', 'ContadorClave2026');
    await page.goto('/households');
    const counter = page.locator('[data-household-count]');
    await expect(counter).toHaveAttribute('data-household-count', '0');
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });

    await page.getByLabel('Nombre del nuevo hogar').fill('Casa Contador');
    await page.getByRole('button', { name: 'Crear hogar' }).click();

    await expect(page.getByRole('heading', { name: /Casa Contador/, level: 3 })).toBeVisible();
    await expect(counter).toHaveAttribute('data-household-count', '1');
    expect(await page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga)).toBe(true);

    await page.getByRole('link', { name: /Mascotas/ }).click();
    await expect(page.getByRole('tab', { name: 'Casa Contador' })).toBeVisible();
    await context.close();
  });
});
