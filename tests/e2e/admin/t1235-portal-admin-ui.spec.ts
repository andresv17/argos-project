import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * T1235 (Feature 009, Fase 3, #19): portal `/admin`, comprobaciones de navegador A1..A13, A15..A17 de `sati-009-T1235-admin-ui.md` (A14 y la parte estática de A10/A15 viven en
 * `tests/integration/api/t1235-portal-admin-ui-009.api.spec.ts`). REQ-ADM9-001, NFR-009-001; SC-009-009, SC-009-010.
 * El servidor E2E no tiene Google configurado: `GET /api/admin/session` responde el 404 real (vista de acceso). La vista autenticada se obtiene interceptando
 * `/api/admin/session` en el navegador (no hay cookie real sin Google): lo que se prueba es la UI, no la sesión (cubierta por T1228/T1230/T1231/T1234).
 */

const WIDTHS = [320, 1024, 1280] as const;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const SESSION_BODY = { authenticated: true, adminId: 'adm-opaque-7f3a', expiresAt: '2030-01-01T00:30:00Z', idleExpiresAt: '2030-01-01T00:10:00Z' };

async function mockAuthenticated(page: Page, onDelete?: (headers: Record<string, string>) => { status: number } ): Promise<{ deletes: Array<Record<string, string>> }> {
  const deletes: Array<Record<string, string>> = [];
  let closed = false;
  // T1250: el shell autenticado ya pide el contador y las solicitudes; sin sesión real se responden vacíos (la UI de solicitudes se prueba en t1250-solicitudes-admin.spec.ts).
  await page.route('**/api/admin/pending-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 0, warning: false }) }));
  await page.route('**/api/admin/registrations', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
  await page.route('**/api/admin/parameters', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: ['album.max_photos_per_pet', 'scene.enabled', 'scene.global_quota_max', 'scene.provider_model', 'scene.prompt.blocks'].map((key) => ({ key, valueType: key === 'scene.enabled' ? 'BOOLEAN' : 'INTEGER', value: key === 'scene.enabled' ? 'true' : '5', default: key === 'scene.enabled' ? 'true' : '5', source: 'DATABASE', constraints: { min: 1, max: 50 }, writable: key === 'album.max_photos_per_pet' || key === 'scene.enabled', lastEditedAt: null, lastEditedBy: null, etag: '"etag0000000000aa"' })) }) })); // T1269: el editor de parámetros también carga en el shell
  await page.route('**/api/admin/session', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      deletes.push(request.headers());
      const outcome = onDelete?.(request.headers()) ?? { status: 204 };
      if (outcome.status === 204) closed = true;
      return route.fulfill({ status: outcome.status, ...(outcome.status === 204 ? {} : { contentType: 'text/plain', body: 'x' }) });
    }
    if (closed) return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not Found' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_BODY) });
  });
  return { deletes };
}

/**
 * Tecla de avance de foco. En WebKit sobre macOS, Tab solo recorre campos de formulario: los enlaces y botones exigen Option+Tab (preferencia de Safari
 * "Press Tab to highlight each item", desactivada por defecto). Verificado: tras Tab, document.activeElement sigue en BODY; con Alt+Tab llega al skip link y
 * luego al destino. El skip link es enfocable (.focus() funciona), por lo que no es un defecto de la UI. Solo ese caso usa Alt+Tab; Chromium y Firefox siguen con Tab.
 */
function focusKey(browserName: string): string {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

async function openAccess(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();
}
async function openShell(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Administración' })).toBeVisible();
}

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const luminance = ([r, g, b]: number[]): number => {
  const c = [r, g, b].map((v) => { const s = (v ?? 0) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
};

/** Contraste medido sobre colores computados (color del texto sobre el primer fondo opaco ascendente). */
async function contrastOf(page: Page, selector: string): Promise<number> {
  const pair = await page.locator(selector).first().evaluate((el) => {
    const parse = (v: string): number[] => (v.match(/[\d.]+/g) ?? []).map(Number);
    const fg = parse(getComputedStyle(el).color);
    let node: Element | null = el;
    let bg = [255, 255, 255];
    while (node !== null) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0) { bg = c; break; }
      node = node.parentElement;
    }
    return { fg, bg };
  });
  const [a, b] = [luminance(pair.fg), luminance(pair.bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe('T1235 portal /admin: pantalla de acceso', () => {
  test('A1 [A5] axe 0 violaciones a 320/1024/1280 y enlace de acceso exacto', async ({ page }) => {
    await openAccess(page);
    const link = page.getByRole('link', { name: 'Entrar con Google' });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', '/api/admin/auth/google/start');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      expect(await axeViolations(page), `acceso@${width}`).toEqual([]);
    }
  });

  test('A3 A4 sin desbordamiento y objetivo táctil ≥ 44 px', async ({ page }) => {
    await openAccess(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `acceso@${width}`).toBe(true);
    }
    const box = await page.getByRole('link', { name: 'Entrar con Google' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('A6 teclado: skip link, luego acceso, con anillo visible', async ({ page, browserName }) => {
    const tab = focusKey(browserName);
    await openAccess(page);
    await page.keyboard.press(tab);
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await page.keyboard.press(tab);
    const link = page.getByRole('link', { name: 'Entrar con Google' });
    await expect(link).toBeFocused();
    const ring = await link.evaluate((el) => { const s = getComputedStyle(el); return { shadow: s.boxShadow, outline: s.outlineStyle, width: s.outlineWidth }; });
    expect(ring.shadow !== 'none' || (ring.outline !== 'none' && parseFloat(ring.width) >= 2)).toBe(true);
    await page.keyboard.press(tab);
    await expect(link).not.toBeFocused();
  });

  test('A10 estructura: 1 h1, 1 main, lang es, título', async ({ page }) => {
    await openAccess(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await page.title()).toBe('Administración — ARGOS');
  });

  test('A11 contraste ≥ 4.5:1 (texto principal, secundario, enlace de acceso)', async ({ page }) => {
    await openAccess(page);
    for (const selector of ['main p >> nth=1', 'main p >> nth=0', 'a[href="/api/admin/auth/google/start"]']) expect(await contrastOf(page, selector), selector).toBeGreaterThanOrEqual(4.5);
    expect(await contrastOf(page, 'h1')).toBeGreaterThanOrEqual(4.5);
  });

  test('A12 movimiento reducido: sin transiciones', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAccess(page);
    for (const selector of ['a[href="/api/admin/auth/google/start"]', 'main section']) {
      expect(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).transitionDuration), selector).toBe('0s');
    }
  });

  test('A13 texto al 200 % a 320 px sin desbordamiento', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openAccess(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();
  });

  test('A15 [SC-009-009] /admin sirve acceso y /api/admin/session sin sesión es 404 uniforme (/admin/otra: vitest t1235 y servidor real, el dev de Vite no es static-assets.ts)', async ({ page, request }) => {
    await openAccess(page);
    for (const path of ['/api/admin/session']) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(404);
      expect(r.headers()['content-type'], path).toMatch(/^text\/plain/);
      expect(await r.text(), path).toBe('Not Found');
    }
  });

  test('A16 A17 sin fuga en el DOM, sin peticiones a otros dominios y consola limpia', async ({ page }) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (new URL(r.url()).origin !== new URL(page.url() === 'about:blank' ? r.url() : page.url()).origin) foreign.push(r.url()); });
    await openAccess(page);
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const banned of ['@', 'lista', 'adminid']) expect(text).not.toContain(banned);
    expect(foreign).toEqual([]);
    expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
  });
});

test.describe('T1235 portal /admin: shell autenticado vacío', () => {
  test('A2 axe 0 violaciones a 320/1024/1280', async ({ page }) => {
    await mockAuthenticated(page);
    await openShell(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      expect(await axeViolations(page), `shell@${width}`).toEqual([]);
    }
  });

  test('A3 A4 sin desbordamiento y objetivo táctil del botón', async ({ page }) => {
    await mockAuthenticated(page);
    await openShell(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `shell@${width}`).toBe(true);
    }
    const box = await page.getByRole('button', { name: 'Cerrar sesión' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('A7 teclado: skip link, luego Cerrar sesión, con anillo visible', async ({ page, browserName }) => {
    const tab = focusKey(browserName);
    await mockAuthenticated(page);
    await openShell(page);
    await page.keyboard.press(tab);
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await page.keyboard.press(tab);
    const button = page.getByRole('button', { name: 'Cerrar sesión' });
    await expect(button).toBeFocused();
    const ring = await button.evaluate((el) => { const s = getComputedStyle(el); return { shadow: s.boxShadow, outline: s.outlineStyle, width: s.outlineWidth }; });
    expect(ring.shadow !== 'none' || (ring.outline !== 'none' && parseFloat(ring.width) >= 2)).toBe(true);
  });

  test('A8 cierre de sesión: DELETE con X-Argos-Request, vuelve al acceso, foco en h1 y anuncio', async ({ page }) => {
    const { deletes } = await mockAuthenticated(page);
    await openShell(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!['x-argos-request']).toBe('1');
    await expect(page.getByRole('heading', { level: 1, name: 'Argos' })).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Sesión cerrada.' })).toHaveCount(1);
  });

  test('A9 cierre fallido (500): alerta, foco al botón, botón habilitado y axe 0', async ({ page }) => {
    await mockAuthenticated(page, () => ({ status: 500 }));
    await openShell(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('alert')).toHaveText('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    const button = page.getByRole('button', { name: 'Cerrar sesión' });
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    expect(await axeViolations(page)).toEqual([]);
  });

  test('A10 estructura: 1 h1, 1 main, 1 header, lang es, título', async ({ page }) => {
    await mockAuthenticated(page);
    await openShell(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    expect(await page.title()).toBe('Administración — ARGOS');
  });

  test('A11 contraste ≥ 4.5:1 (marca, botón, aviso, error de cierre)', async ({ page }) => {
    await mockAuthenticated(page, () => ({ status: 500 }));
    await openShell(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    for (const selector of ['header p', 'header button', 'main h2', 'main p >> nth=0', '[role="alert"]']) expect(await contrastOf(page, selector), selector).toBeGreaterThanOrEqual(4.5);
  });

  test('A12 movimiento reducido: sin transiciones', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAuthenticated(page);
    await openShell(page);
    for (const selector of ['header button', 'main section']) {
      expect(await page.locator(selector).first().evaluate((el) => getComputedStyle(el).transitionDuration), selector).toBe('0s');
    }
  });

  test('A13 texto al 200 % a 320 px sin desbordamiento', async ({ page }) => {
    await mockAuthenticated(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await openShell(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });

  test('A16 A17 el DOM no contiene adminId, correo ni la palabra «lista»; consola limpia', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await mockAuthenticated(page);
    await openShell(page);
    const html = (await page.content()).toLowerCase();
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(html).not.toContain('adm-opaque-7f3a');
    for (const banned of ['@', 'lista']) expect(text).not.toContain(banned);
    expect(errors).toEqual([]);
  });
});

test.describe('T1235 aislamiento de la app de usuarios (A14, navegador)', () => {
  for (const path of ['/login', '/register']) {
    test(`${path} sin enlaces a /admin ni mención del portal`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1, h2').first()).toBeVisible();
      await expect(page.locator('a[href*="admin"]')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/Administraci/i);
    });
  }
});
