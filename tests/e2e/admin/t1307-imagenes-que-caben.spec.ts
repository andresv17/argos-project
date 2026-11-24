import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * T1307 (Feature 009, 5b; contrato admin 1.5.0): «Imágenes que aún caben: N» junto a cada par seleccionable antes de guardar (EDGE-009-036) y el copy «Valor vigente: X (no seleccionable)»
 * cuando el valor vigente no está en la lista. API simulada en el navegador. Sin dinero en pantalla.
 * @implements REQ-CFG9-004, NFR-009-001; SC-009-051
 */
interface P { key: string; valueType: string; value: string; default: string; source: 'DATABASE'; constraints: Record<string, unknown>; writable: boolean; lastEditedAt: string | null; lastEditedBy: string | null; etag: string }
const BLOCKS = { STYLE_BASE_TEXT: 'a', HOUSEHOLD_WITH_PHOTO: 'b {photoRef}', HOUSEHOLD_GENERIC: 'c', PRESERVATION_BLOCK: 'd', PIXEL_REDRAW_RULE: 'e', STYLE_CLOSING: 'f' };
const p = (over: Partial<P> & Pick<P, 'key'>): P => ({ valueType: 'INTEGER', value: '10', default: '10', source: 'DATABASE', constraints: {}, writable: true, lastEditedAt: null, lastEditedBy: null, etag: '"etag0000000000aa"', ...over });
const catalog = (model = 'gemini-2.5-flash-image'): P[] => [
  p({ key: 'album.max_photos_per_pet', constraints: { min: 1, max: 50 } }),
  p({ key: 'scene.enabled', valueType: 'BOOLEAN', value: 'true', default: 'true', constraints: { allowed: ['true', 'false'] } }),
  p({ key: 'scene.global_quota_max', value: '50', default: '50', constraints: { min: 1, max: 111 }, etag: '"etag-quota-000001"' }),
  p({ key: 'scene.provider_model', valueType: 'STRING', value: model, default: 'gemini-2.5-flash-image', constraints: { allowed: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image'] }, etag: '"etag-model-000001"' }),
  p({ key: 'scene.prompt.blocks', valueType: 'JSON_BLOCKS', value: JSON.stringify(BLOCKS), default: JSON.stringify(BLOCKS), constraints: { maxBlockLength: 1000 }, etag: '"etag-blocks-000001"' }),
];
const FIT = [{ model: 'gemini-2.5-flash-image', location: 'us-central1', imagesFit: 111 }, { model: 'gemini-3.1-flash-image-preview', location: 'us-central1', imagesFit: 66 }];
async function fakeAdmin(page: Page, items: P[], fit: unknown): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/admin/session', (r) => r.fulfill(json({ authenticated: true, adminId: 'adm-opaque', expiresAt: '2030-01-01T00:30:00Z', idleExpiresAt: '2030-01-01T00:10:00Z' })));
  await page.route('**/api/admin/pending-count', (r) => r.fulfill(json({ pending: 0, warning: false })));
  await page.route('**/api/admin/registrations**', (r) => r.fulfill(json({ items: [], nextCursor: null })));
  await page.route('**/api/admin/parameters**', (r) => r.fulfill(json(fit === undefined ? { items } : { items, sceneImagesFit: fit })));
}

test('[EDGE-009-036] cada modelo seleccionable muestra «Imágenes que aún caben: N» antes de guardar', async ({ page, browserName }) => {
  await fakeAdmin(page, catalog(), FIT);
  await page.goto('/admin');
  const select = page.getByLabel('Modelo de imagen', { exact: true });
  await expect(select.locator('option')).toHaveText([
    'gemini-2.5-flash-image (se retira el 15 de marzo de 2027) · Imágenes que aún caben: 111',
    'gemini-3.1-flash-image-preview · Imágenes que aún caben: 66',
  ]);
  const card = page.getByTestId('param-scene.provider_model');
  await expect(card).toContainText('Imágenes que aún caben: 111'); // del modelo elegido en el selector
  await select.selectOption('gemini-3.1-flash-image-preview');
  await expect(card.getByTestId('images-fit')).toHaveText('Imágenes que aún caben: 66');
  expect(await page.locator('body').innerText()).not.toMatch(/USD|\$|micro/i);
  // Excepción aprobada por Neo (Nivel 2): Firefox 159 SIGSEGV de entorno en axe 4.14; cobertura axe completa en Chromium, WebKit y móviles.
  if (browserName !== 'firefox') {
    const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()).violations;
    expect(violations.map((v) => v.id)).toEqual([]);
  }
});

test('[EDGE-009-036] D9-29: el modelo vigente muestra las imágenes que caben; 0 se muestra como 0, no como no seleccionable', async ({ page }) => {
  await fakeAdmin(page, catalog(), [{ ...FIT[0], imagesFit: 0 }, { ...FIT[1], imagesFit: 0 }]);
  await page.goto('/admin');
  await expect(page.getByTestId('param-scene.provider_model').getByTestId('images-fit')).toHaveText('Imágenes que aún caben: 0');
  await expect(page.getByTestId('param-scene.provider_model')).not.toContainText('no seleccionable');
});

test('[EDGE-009-036] sin sceneImagesFit (falla cerrado) no se muestra ninguna cifra y el panel sigue funcionando', async ({ page }) => {
  await fakeAdmin(page, catalog(), []);
  await page.goto('/admin');
  await expect(page.getByLabel('Modelo de imagen', { exact: true })).toBeVisible();
  await expect(page.getByTestId('images-fit')).toHaveCount(0);
  await expect(page.getByLabel('Modelo de imagen', { exact: true }).locator('option')).toHaveText(['gemini-2.5-flash-image (se retira el 15 de marzo de 2027)', 'gemini-3.1-flash-image-preview']);
});

test('[REQ-CFG9-004] un valor vigente fuera de la lista (modelo retirado) muestra «Valor vigente: X (no seleccionable)»', async ({ page }) => {
  await fakeAdmin(page, catalog('gemini-3-pro-image'), FIT);
  await page.goto('/admin');
  await expect(page.getByTestId('param-scene.provider_model')).toContainText('Valor vigente: gemini-3-pro-image (no seleccionable)');
  await expect(page.getByTestId('param-scene.provider_location')).toHaveCount(0); // D9-29: la región ya no es una clave
});

test('[NFR-009-001] valor vigente seleccionable: sin la marca «(no seleccionable)»', async ({ page }) => {
  await fakeAdmin(page, catalog(), FIT);
  await page.goto('/admin');
  await expect(page.getByTestId('param-scene.provider_model')).toContainText('Valor vigente: gemini-2.5-flash-image');
  await expect(page.getByTestId('param-scene.provider_model')).not.toContainText('no seleccionable');
});
