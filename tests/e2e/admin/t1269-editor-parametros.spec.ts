import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * T1269 (Feature 009, `[GH:#20]`, subfase 5a): editor de parámetros de `/admin` en Chromium con sesión y API simuladas en el navegador (la API real: t1258/t1260/t1262). Valor vigente,
 * defecto, rango, fecha y autor; aviso de 1 minuto; tope de fotos con If-Match; interruptor de escenas con confirmación; reinicio de cuota con confirmación; aviso de caducidad (25 min).
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-006, NFR-009-001; SC-009-017..021, SC-009-026
 */

const WIDTHS = [320, 1024, 1280] as const;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const ADMIN_ID = 'adm-opaque-7f3a';
const sessionBody = (expiresAt = '2030-01-01T00:30:00Z') => ({ authenticated: true, adminId: ADMIN_ID, expiresAt, idleExpiresAt: '2030-01-01T00:10:00Z' });

interface P {
  key: string; valueType: string; value: string; default: string; source: 'DATABASE' | 'DEFAULT'; constraints: Record<string, unknown>;
  writable: boolean; lastEditedAt: string | null; lastEditedBy: string | null; etag: string;
}
const base = (over: Partial<P> & Pick<P, 'key'>): P => ({ valueType: 'INTEGER', value: '10', default: '10', source: 'DATABASE', constraints: {}, writable: false, lastEditedAt: null, lastEditedBy: null, etag: '"etag0000000000aa"', ...over });
const catalog = (): P[] => [
  base({ key: 'album.max_photos_per_pet', constraints: { min: 1, max: 50 }, writable: true, lastEditedAt: '2026-11-20T15:00:00.000Z', lastEditedBy: ADMIN_ID, etag: '"etag-album-000001"' }),
  base({ key: 'scene.enabled', valueType: 'BOOLEAN', value: 'true', default: 'true', constraints: { allowed: ['true', 'false'] }, writable: true, etag: '"etag-scene-000001"' }),
  base({ key: 'scene.global_quota_max', value: '5', default: '5', constraints: { min: 1, max: 1000 } }),
  base({ key: 'scene.provider_model', valueType: 'STRING', value: 'gemini-2.5-flash-image', default: 'gemini-2.5-flash-image', constraints: { allowed: ['gemini-2.5-flash-image'] } }),
  base({ key: 'scene.prompt.blocks', valueType: 'JSON_BLOCKS', value: '{"SECRETO":"x"}', default: '{"SECRETO":"x"}', constraints: { maxBlockLength: 800 } }),
];

interface Fake {
  params: P[]; puts: Array<{ key: string; ifMatch: string | undefined; csrf: string | undefined; body: string | null }>; resets: Array<string | undefined>;
  putStatus: 200 | 412 | 422 | 500; resetStatus: 200 | 409 | 500; accountsReset: number; listStatus: 200 | 500; sessionExpiresAt: string;
}
async function fakeAdmin(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const fake: Fake = { params: catalog(), puts: [], resets: [], putStatus: 200, resetStatus: 200, accountsReset: 1, listStatus: 200, sessionExpiresAt: '2030-01-01T00:30:00Z', ...init };
  await page.route('**/api/admin/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody(fake.sessionExpiresAt)) }));
  await page.route('**/api/admin/pending-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 0, warning: false }) }));
  await page.route('**/api/admin/registrations**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
  await page.route('**/api/admin/parameters**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/admin/parameters/scene-quota/reset' && request.method() === 'POST') {
      fake.resets.push(request.headers()['x-argos-request']);
      if (fake.resetStatus === 409) return route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ code: 'ERR-ADMIN-QUOTA-RESET-CONFLICT' }) });
      if (fake.resetStatus === 500) return route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accountsReset: fake.accountsReset, resetAt: '2026-11-23T12:00:00Z' }) });
    }
    const put = /\/api\/admin\/parameters\/([^/]+)$/.exec(url.pathname);
    if (put !== null && request.method() === 'PUT') {
      const key = decodeURIComponent(put[1]!);
      fake.puts.push({ key, ifMatch: request.headers()['if-match'], csrf: request.headers()['x-argos-request'], body: request.postData() });
      if (fake.putStatus === 412) return route.fulfill({ status: 412, contentType: 'application/problem+json', body: JSON.stringify({ code: 'ERR-ADMIN-PARAMETER-PRECONDITION-FAILED' }) });
      if (fake.putStatus === 422) return route.fulfill({ status: 422, contentType: 'application/problem+json', body: JSON.stringify({ code: 'ERR-SCHEMA-VALIDATION-FAILED' }) });
      if (fake.putStatus === 500) return route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' });
      const index = fake.params.findIndex((p) => p.key === key);
      const next: P = { ...fake.params[index]!, value: (JSON.parse(request.postData() ?? '{}') as { value: string }).value, lastEditedAt: '2026-11-23T12:00:00.000Z', lastEditedBy: ADMIN_ID, etag: '"etag-nuevo-000002"' };
      fake.params[index] = next;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next) });
    }
    if (fake.listStatus === 500) return route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: fake.params }) });
  });
  return fake;
}
async function openPanel(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 2, name: 'Parámetros de la plataforma' })).toBeVisible();
  await expect(page.getByLabel('Máximo de fotos por mascota')).toBeVisible();
}
const axeViolations = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

test('[REQ-CFG9-001][REQ-CFG9-002] muestra valor vigente, defecto, rango, fecha y autor, el aviso de 1 minuto y ningún id ni correo', async ({ page }) => {
  await fakeAdmin(page);
  await openPanel(page);
  const album = page.getByTestId('param-album.max_photos_per_pet');
  await expect(album).toContainText('Valor por defecto: 10');
  await expect(album).toContainText('De 1 a 50');
  await expect(album).toContainText('Editado por: Tú');
  await expect(album).toContainText('2026');
  await expect(page.getByLabel('Máximo de fotos por mascota')).toHaveValue('10');
  await expect(page.getByText('Puede tardar hasta 1 minuto en aplicarse').first()).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toContain(ADMIN_ID);
  expect(text).not.toContain('SECRETO');
  expect(text).not.toMatch(/@/);
});

test('[REQ-CFG9-001] las claves de la subfase 5b (writable=false) no tienen campo ni botón de edición', async ({ page }) => {
  await fakeAdmin(page);
  await openPanel(page);
  for (const key of ['scene.global_quota_max', 'scene.provider_model', 'scene.prompt.blocks']) {
    const card = page.getByTestId(`param-${key}`);
    if ((await card.count()) > 0) {
      await expect(card.locator('input, textarea, select, button')).toHaveCount(0);
    }
  }
  await expect(page.getByRole('textbox')).toHaveCount(1);
});

test('[SC-009-017][SC-009-018] guardar 12 envía PUT con If-Match del etag vigente y muestra el valor nuevo; el siguiente guardado usa el etag nuevo', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  const input = page.getByLabel('Máximo de fotos por mascota');
  await input.fill('12');
  await page.getByRole('button', { name: 'Guardar tope de fotos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tope de fotos guardado.' })).toHaveCount(1);
  expect(fake.puts).toEqual([{ key: 'album.max_photos_per_pet', ifMatch: '"etag-album-000001"', csrf: '1', body: '{"value":"12"}' }]);
  await input.fill('13');
  await page.getByRole('button', { name: 'Guardar tope de fotos' }).click();
  await expect(page.getByTestId('param-album.max_photos_per_pet')).toContainText('Valor vigente: 13');
  expect(fake.puts[1]?.ifMatch).toBe('"etag-nuevo-000002"');
});

test('[SC-009-018][EDGE-009-014] valores inválidos se rechazan en pantalla sin llamar al servidor', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  const input = page.getByLabel('Máximo de fotos por mascota');
  for (const bad of ['0', '-1', 'abc', ' 12 ', '12.5', '51', '']) {
    await input.fill(bad);
    await page.getByRole('button', { name: 'Guardar tope de fotos' }).click();
    await expect(page.getByRole('alert')).toContainText('1 y 50');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
  }
  expect(fake.puts).toEqual([]);
});

test('[EDGE-009-016] 412 por edición concurrente: aviso y recarga del valor vigente; 500: alerta y reintento', async ({ page }) => {
  const fake = await fakeAdmin(page, { putStatus: 412 });
  await openPanel(page);
  const albumIndex = fake.params.findIndex((p) => p.key === 'album.max_photos_per_pet');
  fake.params[albumIndex] = { ...fake.params[albumIndex]!, value: '20', etag: '"etag-album-000009"' };
  await page.getByLabel('Máximo de fotos por mascota').fill('12');
  await page.getByRole('button', { name: 'Guardar tope de fotos' }).click();
  await expect(page.getByRole('alert')).toContainText('Otra persona cambió este valor');
  await expect(page.getByLabel('Máximo de fotos por mascota')).toHaveValue('20');
  await expect(page.getByTestId('param-album.max_photos_per_pet')).toContainText('Valor vigente: 20');
  fake.putStatus = 500;
  await page.getByLabel('Máximo de fotos por mascota').fill('12');
  await page.getByRole('button', { name: 'Guardar tope de fotos' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar');
});

test('[EDGE-009-016] 412 en el interruptor de escenas: cierra la confirmación abierta, recarga el estado vigente y devuelve el foco', async ({ page }) => {
  const fake = await fakeAdmin(page, { putStatus: 412 });
  await openPanel(page);
  const card = page.getByTestId('param-scene.enabled');
  await card.getByRole('button', { name: 'Deshabilitar escenas' }).click();
  await expect(page.getByRole('group', { name: '¿Deshabilitar la generación de escenas?' })).toBeFocused();
  const index = fake.params.findIndex((p) => p.key === 'scene.enabled');
  fake.params[index] = { ...fake.params[index]!, value: 'false', etag: '"etag-scene-000009"' };
  await page.getByRole('button', { name: 'Confirmar deshabilitar' }).click();
  await expect(page.getByRole('alert')).toContainText('Otra persona cambió este valor');
  await expect(page.getByRole('group')).toHaveCount(0);
  await expect(card.getByText('Escenas deshabilitadas', { exact: true })).toHaveCount(1);
  await expect(card.getByRole('button', { name: 'Habilitar escenas' })).toBeFocused();
});

test('[EDGE-009-015] avisa que bajar el tope conserva las fotos ya subidas', async ({ page }) => {
  await fakeAdmin(page);
  await openPanel(page);
  await expect(page.getByTestId('param-album.max_photos_per_pet')).toContainText('las fotos ya subidas se conservan');
});

test('[REQ-CFG9-003][SC-009-021] deshabilitar escenas pide confirmación en línea: cancelar no escribe y devuelve el foco; confirmar escribe false', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  const card = page.getByTestId('param-scene.enabled');
  await expect(card.getByText('Escenas habilitadas', { exact: true })).toHaveCount(1);
  await expect(card).toContainText('Valor por defecto: Escenas habilitadas');
  await card.getByRole('button', { name: 'Deshabilitar escenas' }).click();
  const group = page.getByRole('group', { name: '¿Deshabilitar la generación de escenas?' });
  await expect(group).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(group).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Deshabilitar escenas' })).toBeFocused();
  expect(fake.puts).toEqual([]);
  await card.getByRole('button', { name: 'Deshabilitar escenas' }).click();
  await page.getByRole('button', { name: 'Confirmar deshabilitar' }).click();
  await expect(card.getByText('Escenas deshabilitadas', { exact: true })).toHaveCount(1);
  await expect(card).toContainText('Valor por defecto: Escenas habilitadas');
  expect(fake.puts).toEqual([{ key: 'scene.enabled', ifMatch: '"etag-scene-000001"', csrf: '1', body: '{"value":"false"}' }]);
  await expect(card.getByRole('button', { name: 'Habilitar escenas' })).toBeVisible();
});

test('[REQ-CFG9-006][SC-009-026] reiniciar la cuota pide confirmación en línea y llama a POST con X-Argos-Request; 409 pide reintentar', async ({ page }) => {
  const fake = await fakeAdmin(page);
  await openPanel(page);
  await page.getByRole('button', { name: 'Reiniciar cuota de escenas' }).click();
  const group = page.getByRole('group', { name: '¿Reiniciar la cuota de escenas?' });
  await expect(group).toBeFocused();
  await group.getByRole('button', { name: 'Cancelar' }).click();
  expect(fake.resets).toEqual([]);
  await expect(page.getByRole('button', { name: 'Reiniciar cuota de escenas' })).toBeFocused();
  fake.resetStatus = 409;
  await page.getByRole('button', { name: 'Reiniciar cuota de escenas' }).click();
  await page.getByRole('button', { name: 'Confirmar reinicio' }).click();
  await expect(page.getByRole('alert')).toContainText('Inténtalo de nuevo');
  fake.resetStatus = 200;
  await page.getByRole('button', { name: 'Confirmar reinicio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cuota de escenas reiniciada.' })).toHaveCount(1);
  expect(fake.resets).toEqual(['1', '1']);
});

test('[EDGE-009-022] reinicio sin cuentas que reiniciar (accountsReset = 0) lo dice sin error', async ({ page }) => {
  await fakeAdmin(page, { accountsReset: 0 });
  await openPanel(page);
  await page.getByRole('button', { name: 'Reiniciar cuota de escenas' }).click();
  await page.getByRole('button', { name: 'Confirmar reinicio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No había cuentas de administración con cuota' })).toHaveCount(1);
});

test('[NFR-009-001] error al cargar: alerta con «Reintentar»', async ({ page }) => {
  const fake = await fakeAdmin(page, { listStatus: 500 });
  await page.goto('/admin');
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudieron cargar los parámetros.' })).toBeVisible();
  fake.listStatus = 200;
  await page.getByRole('button', { name: 'Reintentar' }).last().click();
  await expect(page.getByLabel('Máximo de fotos por mascota')).toBeVisible();
});

test('[LCK-25] a los 25 min de sesión aparece el aviso de caducidad (reloj simulado)', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await fakeAdmin(page);
  await page.goto('/admin');
  await expect(page.getByLabel('Máximo de fotos por mascota')).toBeVisible();
  await expect(page.getByTestId('session-expiry-warning')).toHaveCount(0);
  await page.getByLabel('Máximo de fotos por mascota').focus();
  await page.clock.fastForward(25 * 60_000 + 1000);
  await expect(page.getByTestId('session-expiry-warning')).toContainText('5 minutos');
  await expect(page.getByRole('status').filter({ hasText: '5 minutos' })).toHaveCount(1);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('album-cap');
  const order = await page.evaluate(() => {
    const warning = document.querySelector('[data-testid="session-expiry-warning"]')!;
    const params = document.getElementById('parameters-heading')!;
    return Boolean(warning.compareDocumentPosition(params) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
});

for (const width of WIDTHS) {
  test(`[NFR-009-001] ${width}px: sin desbordamiento horizontal y sin violaciones axe WCAG 2.1 AA`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 900 });
    await fakeAdmin(page);
    await openPanel(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Excepción aprobada por Neo (Nivel 2): Firefox 159 SIGSEGV de entorno en axe 4.14; cobertura axe completa en Chromium, WebKit y móviles.
    if (browserName !== 'firefox') expect(await axeViolations(page)).toEqual([]);
  });
}

test('[NFR-009-001] texto al 200 % a 320 px sin desbordamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await fakeAdmin(page);
  await openPanel(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
