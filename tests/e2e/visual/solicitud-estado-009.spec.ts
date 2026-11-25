/**
 * E2E de las pantallas de estado de la solicitud (feature 009, `[GH:#18]`, T1249): el registro por la SPA termina en «Tu solicitud está en revisión» sin sesión ni cookie,
 * las rutas protegidas siguen llevando a `/login`, «Tu solicitud no fue aprobada.» se muestra en su ruta, sin formulario, botón ni campo, y axe no halla violaciones a 320/1024/1280 px.
 * El ciclo completo con aprobación y rechazo reales es T1251.
 *
 * @implements REQ-APR9-001, REQ-APR9-002, NFR-009-001; SC-009-001, SC-009-002
 */
import { expect, test } from '@playwright/test';
import { accessibilityFindingsAt, apiCall, VIEWPORT_WIDTHS } from './e2e-support.ts';

test('[SC-009-001][SC-009-002] registrarse lleva a «Tu solicitud está en revisión» sin sesión ni cookie, y sin acceso a la app', async ({ page }) => {
  const username = `pend${Date.now().toString(36)}`;
  await page.goto('/register');
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Nombre visible/).fill('Pendiente Prueba');
  await page.getByLabel(/^Contraseña \(/).fill('Clave2026x!Ab');
  await page.getByLabel(/^Confirmar contraseña/).fill('Clave2026x!Ab');
  await page.getByLabel('Soy mayor de edad (18+)').check();
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page).toHaveURL(/\/solicitud-en-revision$/);
  await expect(page.getByRole('heading', { name: 'Tu solicitud está en revisión' })).toBeFocused();
  expect((await page.context().cookies()).filter((c) => c.name === 'argos_session')).toEqual([]);
  expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).not.toBe(200);
  for (const path of ['/', '/households', '/cuenta']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  // El inicio de sesión con credenciales válidas devuelve a la misma pantalla, sin sesión.
  await page.getByLabel(/^Usuario o correo/).fill(username);
  await page.getByLabel(/^Contraseña/).fill('Clave2026x!Ab');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/solicitud-en-revision$/);
  expect((await page.context().cookies()).filter((c) => c.name === 'argos_session')).toEqual([]);
});

test('[REQ-APR9-002] «Tu solicitud no fue aprobada.» en su ruta; sin botón ni formulario', async ({ page }) => {
  await page.goto('/solicitud-no-aprobada');
  await expect(page.getByRole('heading', { name: 'Tu solicitud no fue aprobada.' })).toBeFocused();
  await expect(page.getByText(/30 días/)).toBeVisible();
  await expect(page.locator('main form, main button, main input')).toHaveCount(0);
});

test('[NFR-009-001] WCAG 2.1 AA (axe) y sin desborde horizontal a 320/1024/1280 px en ambas pantallas', async ({ page }) => {
  for (const path of ['/solicitud-en-revision', '/solicitud-no-aprobada']) {
    await page.goto(path);
    expect(await accessibilityFindingsAt(page, path, VIEWPORT_WIDTHS)).toEqual([]);
  }
});

test('[NFR-009-001] «Volver al acceso» mide al menos 48 px de alto (objetivo táctil) a 320/1024/1280 px en ambas pantallas', async ({ page }) => {
  for (const path of ['/solicitud-en-revision', '/solicitud-no-aprobada']) {
    await page.goto(path);
    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const box = await page.getByRole('link', { name: 'Volver al acceso' }).boundingBox();
      expect(box?.height ?? 0, `${path}@${width}px`).toBeGreaterThanOrEqual(48);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
});
