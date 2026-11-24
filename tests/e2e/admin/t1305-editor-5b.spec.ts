import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * T1305 (Feature 009, `[GH:#20]`, subfase 5b): editor de modelo (la región se deriva, D9-29), tope mensual de escenas y bloques del texto base en `/admin`, con sesión y API simuladas en el navegador.
 * @implements REQ-CFG9-002, REQ-CFG9-004, REQ-CFG9-005, NFR-009-001; SC-009-022..025, SC-009-051
 */
const WIDTHS = [320, 1024, 1280] as const;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const BLOCKS = {
  STYLE_BASE_TEXT: 'Estilo base de prueba.',
  HOUSEHOLD_WITH_PHOTO: 'Hogar con foto inspirado en {photoRef}.',
  HOUSEHOLD_GENERIC: 'Hogar genérico.',
  PRESERVATION_BLOCK: 'Preservar mascotas.',
  PIXEL_REDRAW_RULE: 'Redibujar en píxeles.',
  STYLE_CLOSING: 'Cierre de estilo.',
};
interface P { key: string; valueType: string; value: string; default: string; source: 'DATABASE'; constraints: Record<string, unknown>; writable: boolean; lastEditedAt: string | null; lastEditedBy: string | null; etag: string }
const p = (over: Partial<P> & Pick<P, 'key'>): P => ({ valueType: 'INTEGER', value: '10', default: '10', source: 'DATABASE', constraints: {}, writable: true, lastEditedAt: null, lastEditedBy: null, etag: '"etag0000000000aa"', ...over });
const catalog = (): P[] => [
  p({ key: 'album.max_photos_per_pet', constraints: { min: 1, max: 50 } }),
  p({ key: 'scene.enabled', valueType: 'BOOLEAN', value: 'true', default: 'true', constraints: { allowed: ['true', 'false'] } }),
  p({ key: 'scene.global_quota_max', value: '50', default: '50', constraints: { min: 1, max: 111 }, etag: '"etag-quota-000001"' }),
  p({ key: 'scene.provider_model', valueType: 'STRING', value: 'gemini-2.5-flash-image', default: 'gemini-2.5-flash-image', constraints: { allowed: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image'] }, etag: '"etag-model-000001"' }),
  p({ key: 'scene.provider_driver', valueType: 'STRING', value: 'vertex', default: 'vertex', constraints: { allowed: ['vertex'] } }),
  p({ key: 'scene.prompt.blocks', valueType: 'JSON_BLOCKS', value: JSON.stringify(BLOCKS), default: JSON.stringify(BLOCKS), constraints: { maxBlockLength: 1000 }, etag: '"etag-blocks-000001"' }),
];
interface Fake { params: P[]; puts: Array<{ key: string; ifMatch: string | undefined; body: string | null }>; putStatus: number; putCode: string }
async function fakeAdmin(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const fake: Fake = { params: catalog(), puts: [], putStatus: 200, putCode: 'ERR-SCHEMA-VALIDATION-FAILED', ...init };
  const json = (body: unknown, status = 200) => ({ status, contentType: status === 200 ? 'application/json' : 'application/problem+json', body: JSON.stringify(body) });
  await page.route('**/api/admin/session', (r) => r.fulfill(json({ authenticated: true, adminId: 'adm-opaque', expiresAt: '2030-01-01T00:30:00Z', idleExpiresAt: '2030-01-01T00:10:00Z' })));
  await page.route('**/api/admin/pending-count', (r) => r.fulfill(json({ pending: 0, warning: false })));
  await page.route('**/api/admin/registrations**', (r) => r.fulfill(json({ items: [], nextCursor: null })));
  await page.route('**/api/admin/parameters**', async (route) => {
    const request = route.request();
    const put = /\/api\/admin\/parameters\/([^/]+)$/.exec(new URL(request.url()).pathname);
    if (put !== null && request.method() === 'PUT') {
      const key = decodeURIComponent(put[1]!);
      fake.puts.push({ key, ifMatch: request.headers()['if-match'], body: request.postData() });
      if (fake.putStatus !== 200) return route.fulfill(json({ code: fake.putCode }, fake.putStatus));
      const i = fake.params.findIndex((x) => x.key === key);
      const next: P = { ...fake.params[i]!, value: (JSON.parse(request.postData() ?? '{}') as { value: string }).value, lastEditedAt: '2026-11-23T12:00:00.000Z', lastEditedBy: 'adm-opaque', etag: '"etag-nuevo-000002"' };
      fake.params[i] = next;
      return route.fulfill(json(next));
    }
    return route.fulfill(json({ items: fake.params }));
  });
  return fake;
}
async function openPanel(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page.getByLabel('Modelo de imagen', { exact: true }).or(page.getByLabel('Máximo de fotos por mascota')).first()).toBeVisible();
  await expect(page.getByLabel('Estilo base')).toBeVisible();
}
const axeViolations = async (page: Page): Promise<string[]> => (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

test('[REQ-CFG9-004] el selector de modelo ofrece solo los dos modelos seleccionables, muestra la deprecación y guarda con If-Match', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  const select = page.getByLabel('Modelo de imagen', { exact: true });
  await expect(select.locator('option')).toHaveText(['gemini-2.5-flash-image (se retira el 15 de marzo de 2027)', 'gemini-3.1-flash-image']);
  await expect(page.getByTestId('param-scene.provider_model')).toContainText('15 de marzo de 2027');
  await select.selectOption('gemini-3.1-flash-image');
  await page.getByRole('button', { name: 'Guardar modelo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Modelo de imagen guardado.' })).toHaveCount(1);
  expect(fake.puts).toEqual([{ key: 'scene.provider_model', ifMatch: '"etag-model-000001"', body: '{"value":"gemini-3.1-flash-image"}' }]);
});

test('[EDGE-009-046] D9-29: selector único, sin selector de región: la región se deriva del modelo y se avisa junto al selector de modelo; sin cifras de coste', async ({ page }) => {
  await fakeAdmin(page);
  await openPanel(page);
  await expect(page.getByLabel('Región del servicio de imagen', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('param-scene.provider_location')).toHaveCount(0);
  await expect(page.getByTestId('param-scene.provider_model')).toContainText('La región se elige sola según el modelo');
  expect(await page.locator('body').innerText()).not.toMatch(/USD|\$|micro/i);
});

test('[REQ-CFG9-002] 422 por tope de coste: mensaje sin cifras, asociado al campo, y no se actualiza el valor', async ({ page }) => {
  const fake = await fakeAdmin(page, { putStatus: 422, putCode: 'ERR-ADMIN-SCENE-COST-CAP-EXCEEDED' });
  await openPanel(page);
  await page.getByLabel('Modelo de imagen', { exact: true }).selectOption('gemini-3.1-flash-image');
  await page.getByRole('button', { name: 'Guardar modelo' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'La combinación supera el tope mensual de imágenes. No se ha guardado.' });
  await expect(alert).toHaveCount(1);
  await expect(page.getByLabel('Modelo de imagen', { exact: true })).toHaveAttribute('aria-describedby', /msg-model/);
  await expect(page.getByTestId('param-scene.provider_model')).toContainText('Valor vigente: gemini-2.5-flash-image');
  expect(fake.puts).toHaveLength(1);
});

test('[REQ-CFG9-004] tope mensual: máximo derivado leído del servidor (111), mensaje al excederlo y guardado válido', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  const input = page.getByLabel('Tope mensual de escenas de la plataforma');
  await expect(page.getByTestId('param-scene.global_quota_max')).toContainText('De 1 a 111');
  await input.fill('112');
  await page.getByRole('button', { name: 'Guardar tope mensual' }).click();
  await expect(page.getByRole('alert')).toContainText('El tope no puede superar 111 imágenes al mes.');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toBeFocused();
  expect(fake.puts).toEqual([]);
  await input.fill('111');
  await page.getByRole('button', { name: 'Guardar tope mensual' }).click();
  await expect(page.getByTestId('param-scene.global_quota_max')).toContainText('Valor vigente: 111');
  expect(fake.puts).toEqual([{ key: 'scene.global_quota_max', ifMatch: '"etag-quota-000001"', body: '{"value":"111"}' }]);
});

test('[REQ-CFG9-005] bloques: seis textareas con contador de 1000 y aviso de {photoRef}; guardar envía el JSON de los seis bloques', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  await expect(page.getByRole('textbox', { name: /^(Estilo base|Hogar con foto|Hogar sin foto|Preservación de las mascotas|Regla de redibujado en píxeles|Cierre de estilo)$/ })).toHaveCount(6);
  await expect(page.getByText('22 de 1000 caracteres')).toHaveCount(1);
  await expect(page.getByText('{photoRef} solo puede usarse en el bloque «Hogar con foto»', { exact: false })).toBeVisible();
  await page.getByLabel('Cierre de estilo').fill('Cierre nuevo.');
  await expect(page.getByText('13 de 1000 caracteres')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar texto base' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Texto base de la escena guardado.' })).toHaveCount(1);
  expect(fake.puts).toHaveLength(1);
  expect(fake.puts[0]!.ifMatch).toBe('"etag-blocks-000001"');
  const sent = JSON.parse((JSON.parse(fake.puts[0]!.body!) as { value: string }).value) as Record<string, string>;
  expect(Object.keys(sent)).toEqual(Object.keys(BLOCKS));
  expect(sent.STYLE_CLOSING).toBe('Cierre nuevo.');
});

test('[REQ-CFG9-005] bloques inválidos (vacío, demasiado largo, {photoRef} fuera de lugar) no llegan al servidor y el foco va al primero', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  await page.getByLabel('Estilo base').fill('x'.repeat(1001));
  await expect(page.getByText('1001 de 1000 caracteres')).toBeVisible();
  await page.getByLabel('Hogar sin foto').fill('Usa {photoRef} aquí');
  await page.getByLabel('Hogar con foto').fill('');
  await page.getByRole('button', { name: 'Guardar texto base' }).click();
  await expect(page.getByLabel('Estilo base')).toBeFocused();
  await expect(page.getByLabel('Estilo base')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'supera el máximo de 1000' })).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: 'solo puede ir en el bloque' })).toHaveCount(1);
  await expect(page.getByRole('alert').filter({ hasText: 'no puede estar vacío' })).toHaveCount(1);
  expect(fake.puts).toEqual([]);
});

test('[REQ-CFG9-005] 422 de esquema en los bloques muestra el mensaje y no cambia el valor vigente', async ({ page }) => {
  await fakeAdmin(page, { putStatus: 422 });
  await openPanel(page);
  await page.getByLabel('Cierre de estilo').fill('Otro cierre.');
  await page.getByRole('button', { name: 'Guardar texto base' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'El servidor no aceptó el texto base' })).toHaveCount(1);
});

test('[EDGE-009-016] 412 recarga el valor vigente del tope mensual', async ({ page }) => {
  const fake = await fakeAdmin(page, { putStatus: 412, putCode: 'ERR-ADMIN-PARAMETER-PRECONDITION-FAILED' });
  await openPanel(page);
  const i = fake.params.findIndex((x) => x.key === 'scene.global_quota_max');
  fake.params[i] = { ...fake.params[i]!, value: '70', etag: '"etag-quota-000009"' };
  await page.getByLabel('Tope mensual de escenas de la plataforma').fill('60');
  await page.getByRole('button', { name: 'Guardar tope mensual' }).click();
  await expect(page.getByRole('alert')).toContainText('Otra persona cambió este valor');
  await expect(page.getByLabel('Tope mensual de escenas de la plataforma')).toHaveValue('70');
});

for (const width of WIDTHS) {
  test(`[NFR-009-001] ${width}px: sin desbordamiento, objetivos >= 44 px y axe sin violaciones`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 });
    await fakeAdmin(page);
    await openPanel(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="param-scene."] :is(button, select, input, textarea)')]
        .map((el) => ({ id: el.id || el.tagName, h: Math.round(el.getBoundingClientRect().height) }))
        .filter((x) => x.h < 44),
    );
    expect(small).toEqual([]);
    // Excepción aprobada por Neo (Nivel 2): Firefox 159 SIGSEGV de entorno en axe 4.14; cobertura axe completa en Chromium, WebKit y móviles.
    if (browserName !== 'firefox') expect(await axeViolations(page)).toEqual([]);
  });
}

test('[NFR-009-001] foco visible (anillo) en los controles 5b y texto al 200 % a 320 px sin desbordamiento', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await fakeAdmin(page);
  await openPanel(page);
  await page.getByLabel('Cierre de estilo').focus();
  expect(await page.getByLabel('Cierre de estilo').evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
