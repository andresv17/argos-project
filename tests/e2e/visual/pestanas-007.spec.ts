/**
 * T1040 (007, Bloque B, [GH:#12]) E2E de teclado y lector de pantalla de las 7 pestañas a 320, 1024 y 1280 px: orden, flechas/`Home`/`End`, enfoque itinerante, relaciones
 * ARIA tab-panel, «Historial / Archivos» sin formulario ni «Registrar», sin sección duplicada y sin desbordamiento horizontal. REQ-PES7-001..003, NFR-007-002; SC-007-005..007.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPetViaApi, registerViaApi, VIEWPORT_WIDTHS } from './e2e-support.ts';

const TABS = ['Peso', 'Medidas', 'Vacunas', 'Desparasitación', 'Consultas', 'Parámetros', 'Historial / Archivos'];

test.describe.configure({ mode: 'serial' });

test.describe('siete pestañas de la ficha (007, T1040)', () => {
  let context: BrowserContext;
  let page: Page;
  const tab = (name: string) => page.getByRole('tab', { name, exact: true });

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `pestanas7.${info.project.name}`, 'Dueña Pestañas', 'PestanasClave2026!');
    await createPetViaApi(context.request, 'Argos', 'CANINE');
    page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('[SC-007-005][REQ-PES7-001] el tablist tiene 7 pestañas en orden y Peso está activa por defecto', async () => {
    const list = page.getByRole('tablist', { name: 'Módulos de la ficha' });
    await expect(list.getByRole('tab')).toHaveText(TABS);
    await expect(tab('Peso')).toHaveAttribute('aria-selected', 'true');
  });

  test('[SC-007-007][REQ-PES7-003] End, Home y flechas recorren las 7 pestañas con vuelta circular y enfoque itinerante', async () => {
    await tab('Peso').focus();
    await page.keyboard.press('End');
    await expect(tab('Historial / Archivos')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('Historial / Archivos')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tab('Peso')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tab('Historial / Archivos')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tab('Parámetros')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    await expect(tab('Peso')).toHaveAttribute('aria-selected', 'true');
    expect(await page.getByRole('tablist', { name: 'Módulos de la ficha' }).getByRole('tab').evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')))).toEqual(['0', '-1', '-1', '-1', '-1', '-1', '-1']);
  });

  test('[SC-007-006][REQ-PES7-002] «Historial / Archivos» muestra solo el panel de archivos: sin «Registrar», sin formulario de alta y sin h3 duplicado', async () => {
    await tab('Historial / Archivos').click();
    const panel = page.getByRole('tabpanel', { name: 'Historial / Archivos' });
    await expect(panel).toHaveAttribute('aria-labelledby', 'module-tab-history');
    await expect(panel.getByRole('region', { name: 'Archivos', exact: true })).toBeVisible();
    await expect(panel.getByText('Registrar', { exact: false })).toHaveCount(0);
    await expect(panel.locator('details')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Historial / Archivos' })).toHaveCount(0);
    await expect(page.locator('[id^="module-panel-"]')).toHaveCount(1);
  });

  for (const width of VIEWPORT_WIDTHS) {
    test(`[NFR-007-002][SC-007-007] a ${width} px: la pestaña final es alcanzable con teclado, sin desbordar la página y axe sin violaciones WCAG 2.1 A/AA`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.reload(); // cada ancho parte de un diseño recién calculado (sin el desplazamiento heredado del ancho anterior)
      await expect(tab('Peso')).toBeVisible();
      await tab('Peso').focus();
      await page.keyboard.press('End');
      // El tablist desplaza horizontalmente (overflow-x-auto): el foco debe dejar la última pestaña completa dentro del propio tablist y del viewport.
      await page.waitForTimeout(1000);
      await expect
        .poll(() =>
          tab('Historial / Archivos').evaluate((el) => {
            const list = el.parentElement!.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return box.left >= list.left - 1 && box.right <= list.right + 1 && box.left >= 0 && box.right <= window.innerWidth;
          }),
        )
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(violations).toEqual([]);
      await tab('Peso').click();
    });
  }
});
