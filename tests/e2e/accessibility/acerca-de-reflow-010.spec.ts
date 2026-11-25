import { expect, test, type Page } from '@playwright/test';

/**
 * T1431 OBS-1 de /sati (Feature 010, WCAG 1.4.10 Reflow, REQ-ACE10-001, REQ-ACE10-002): una palabra o URL larga sin espacios en el texto publicado no genera scroll horizontal en
 * `/acerca-de` (320 y 1024 px) ni en la vista previa del panel de `/admin` (320 y 1024 px). Sin servidor de Google: la API de «Acerca de» y la sesión de administración se interceptan en el
 * navegador (lo que se prueba es el maquetado, no la sesión).
 */
const WIDTHS = [320, 1024] as const;
const LONG_TOKEN = `https://ejemplo.org/${'abcdefghij'.repeat(30)}`;
const LONG_WORD = 'Supercalifragilisticoespialidoso'.repeat(8);
const BODY = `# Título\n\nUna palabra enorme: ${LONG_WORD}\n\nUna URL: ${LONG_TOKEN}\n\n[enlace ${LONG_WORD}](${LONG_TOKEN})\n\n- ${LONG_WORD}`;

async function hasHorizontalScroll(page: Page): Promise<{ readonly scroll: number; readonly client: number }> {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
}

for (const width of WIDTHS) {
  test(`[WCAG 1.4.10] /acerca-de a ${width} px: un token largo no produce scroll horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/about', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bodyMarkdown: BODY, photoUrl: null, photoAlt: '' }) }));
    await page.goto('/acerca-de');
    await expect(page.locator('.about-text')).toContainText('Supercalifragilistico');
    const { scroll, client } = await hasHorizontalScroll(page);
    expect(scroll, `scrollWidth ${scroll} > clientWidth ${client}`).toBeLessThanOrEqual(client);
  });

  test(`[WCAG 1.4.10] vista previa del panel /admin a ${width} px: un token largo no produce scroll horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/admin/pending-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 0, warning: false }) }));
    await page.route('**/api/admin/registrations', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
    await page.route('**/api/admin/parameters', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
    await page.route('**/api/admin/session', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, adminId: 'adm-opaque-7f3a', expiresAt: '2030-01-01T00:30:00Z', idleExpiresAt: '2030-01-01T00:10:00Z' }) }),
    );
    await page.route('**/api/admin/about', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bodyMarkdown: BODY, photoUrl: null, photoAlt: '', updatedAt: null, version: 1, etag: '"1"' }) }),
    );
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Vista previa' }).click();
    await expect(page.getByRole('region', { name: 'Vista previa del texto' })).toContainText('Supercalifragilistico');
    const { scroll, client } = await hasHorizontalScroll(page);
    expect(scroll, `scrollWidth ${scroll} > clientWidth ${client}`).toBeLessThanOrEqual(client);
  });
}

/**
 * T1431 OBS-4 de /sati (WCAG 2.4.7): el enlace del texto enfocado por teclado muestra el anillo Terracota (box-shadow) y no el outline nativo.
 * `[&_a]:focus-visible:ring-*` compilaba a `:focus-visible a` (contenedor), por lo que el enlace conservaba el outline azul del navegador.
 */
async function expectLinkRing(page: Page, link: ReturnType<Page['locator']>): Promise<void> {
  await link.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const style = await link.evaluate((a) => ({ focusVisible: a.matches(':focus-visible'), shadow: getComputedStyle(a).boxShadow, outline: getComputedStyle(a).outlineStyle }));
  expect(style.focusVisible).toBe(true);
  expect(style.shadow, 'anillo Terracota ausente (box-shadow none)').not.toBe('none');
  expect(style.outline, 'outline nativo (auto) del navegador en lugar del anillo').not.toBe('auto');
}

test('[WCAG 2.4.7] /acerca-de: el enlace del texto enfocado por teclado muestra el anillo y no el outline nativo', async ({ page }) => {
  await page.route('**/api/about', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bodyMarkdown: 'Texto [enlace](/ruta) fin', photoUrl: null, photoAlt: '' }) }));
  await page.goto('/acerca-de');
  await expectLinkRing(page, page.locator('.about-text a').first());
});

test('[WCAG 2.4.7] vista previa del panel /admin: el enlace enfocado muestra el anillo y no el outline nativo', async ({ page }) => {
  await page.route('**/api/admin/pending-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 0, warning: false }) }));
  await page.route('**/api/admin/registrations', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
  await page.route('**/api/admin/parameters', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, adminId: 'adm-opaque-7f3a', expiresAt: '2030-01-01T00:30:00Z', idleExpiresAt: '2030-01-01T00:10:00Z' }) }),
  );
  await page.route('**/api/admin/about', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bodyMarkdown: 'Texto [enlace](/ruta) fin', photoUrl: null, photoAlt: '', updatedAt: null, version: 1, etag: '"1"' }) }),
  );
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await expectLinkRing(page, page.getByRole('region', { name: 'Vista previa del texto' }).locator('a').first());
});
