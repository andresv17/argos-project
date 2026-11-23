import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * T1250 (Feature 009, `[GH:#18]`): pantalla de solicitudes de registro de `/admin` en Chromium. Contador de pendientes al entrar (con aviso si el servidor dice que se superó el umbral),
 * solicitudes paginadas por cursor con usuario, método y fecha, y aprobar/rechazar con confirmación. La sesión y la API se simulan en el navegador (no hay Google real aquí): lo que se
 * prueba es la UI y el contrato que consume; la API real la cubre `t1247-decision-registros-009.api.spec.ts` y el ciclo completo es T1251.
 * @implements REQ-APR9-005, NFR-009-001; SC-009-006, SC-009-008
 */

const WIDTHS = [320, 1024, 1280] as const;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const SESSION_BODY = { authenticated: true, adminId: 'adm-opaque-7f3a', expiresAt: '2030-01-01T00:30:00Z', idleExpiresAt: '2030-01-01T00:10:00Z' };
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Row {
  registrationId: string;
  username: string;
  requestedAt: string;
  method: 'PASSWORD' | 'GOOGLE';
}
const row = (n: number, username: string, method: Row['method'] = 'PASSWORD'): Row => ({
  registrationId: uuid(n),
  username,
  requestedAt: new Date(Date.UTC(2026, 10, 1, 15, n)).toISOString(),
  method,
});

interface Fake {
  rows: Row[];
  warning: boolean;
  pageSize: number;
  decisions: Array<{ id: string; action: string; csrf: string | undefined }>;
  listCalls: Array<string | null>;
  decisionStatus: 200 | 404 | 500;
  listStatus: 200 | 404 | 500;
}

/** Sesión de administración y API de solicitudes simuladas en el navegador, con estado (las decisiones sacan la fila). */
async function fakeAdmin(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const fake: Fake = { rows: [], warning: false, pageSize: 20, decisions: [], listCalls: [], decisionStatus: 200, listStatus: 200, ...init };
  await page.route('**/api/admin/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_BODY) }));
  await page.route('**/api/admin/pending-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: fake.rows.length, warning: fake.warning }) }));
  await page.route('**/api/admin/registrations**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const decision = /\/api\/admin\/registrations\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
    if (decision !== null && request.method() === 'POST') {
      fake.decisions.push({ id: decision[1]!, action: decision[2]!, csrf: request.headers()['x-argos-request'] });
      if (fake.decisionStatus === 404) return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ code: 'ERR-ADMIN-REGISTRATION-NOT-FOUND', status: 404 }) });
      if (fake.decisionStatus === 500) return route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' });
      fake.rows = fake.rows.filter((r) => r.registrationId !== decision[1]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ registrationId: decision[1], accountStatus: decision[2] === 'approve' ? 'ACTIVE' : 'REJECTED', decidedAt: '2026-11-23T12:00:00Z' }) });
    }
    const cursor = url.searchParams.get('cursor');
    fake.listCalls.push(cursor);
    if (fake.listStatus === 404) return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not Found' });
    if (fake.listStatus === 500) return route.fulfill({ status: 500, contentType: 'application/problem+json', body: '{}' });
    const start = cursor === null ? 0 : Number(Buffer.from(cursor, 'base64url').toString());
    const items = fake.rows.slice(start, start + fake.pageSize);
    const end = start + fake.pageSize;
    const nextCursor = end < fake.rows.length ? Buffer.from(String(end)).toString('base64url') : null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, nextCursor }) });
  });
  return fake;
}

async function openPanel(page: Page): Promise<void> {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 2, name: 'Solicitudes de registro' })).toBeVisible();
}

const axeViolations = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

test('[REQ-APR9-005][SC-009-008] al entrar muestra el contador de pendientes y cada solicitud con usuario, método y fecha, sin correo ni identificadores', async ({ page }) => {
  await fakeAdmin(page, { rows: [row(1, 'ana_perez'), row(2, 'luis_g', 'GOOGLE')] });
  await openPanel(page);
  await expect(page.getByTestId('pending-count')).toHaveText('2 solicitudes pendientes');
  await expect(page.getByTestId('pending-warning')).toHaveCount(0);
  const items = page.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('ana_perez');
  await expect(items.nth(0)).toContainText('Método: Usuario y contraseña');
  await expect(items.nth(0)).toContainText('1 de nov de 2026');
  await expect(items.nth(1)).toContainText('luis_g');
  await expect(items.nth(1)).toContainText('Método: Google');
  const html = (await page.content()).toLowerCase();
  expect(html).not.toContain(uuid(1));
  expect(await page.locator('body').innerText()).not.toMatch(/@|\blista\b/i);
});

test('[REQ-APR9-005][SC-009-008] el aviso aparece solo cuando el servidor lo indica y no revela el umbral', async ({ page }) => {
  await fakeAdmin(page, { rows: [row(1, 'ana_perez')], warning: true });
  await openPanel(page);
  const warning = page.getByTestId('pending-warning');
  await expect(warning).toHaveText('Hay muchas solicitudes pendientes. Conviene revisarlas pronto.');
  expect(await warning.innerText()).not.toMatch(/\d/);
  expect(await axeViolations(page)).toEqual([]);
});

test('[REQ-APR9-005][SC-009-006] vacío: «No hay solicitudes pendientes.» y sin lista', async ({ page }) => {
  await fakeAdmin(page, { rows: [] });
  await openPanel(page);
  await expect(page.getByTestId('pending-count')).toHaveText('No hay solicitudes pendientes.');
  await expect(page.getByText('No hay solicitudes por revisar.')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('[REQ-APR9-005][SC-009-006] pagina por cursor: «Cargar más solicitudes» añade la página siguiente en el mismo orden', async ({ page }) => {
  const rows = Array.from({ length: 5 }, (_, i) => row(i + 1, `usuario${i + 1}`));
  const fake = await fakeAdmin(page, { rows, pageSize: 2 });
  await openPanel(page);
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Cargar más solicitudes' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cargar más solicitudes' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Cargar más solicitudes' })).toHaveCount(0);
  expect(await page.getByRole('listitem').locator('p:first-child').allInnerTexts()).toEqual(['usuario1', 'usuario2', 'usuario3', 'usuario4', 'usuario5']);
  expect(fake.listCalls[0]).toBeNull();
  // Dos páginas más con cursor (en desarrollo StrictMode puede repetir la primera lectura sin cursor).
  expect(fake.listCalls.filter((c) => c !== null)).toHaveLength(2);
});

test('[REQ-APR9-005][SC-009-006] aprobar pide confirmación: cancelar no decide y devuelve el foco; confirmar decide, saca la fila y actualiza el contador', async ({ page }) => {
  const fake = await fakeAdmin(page, { rows: [row(1, 'ana_perez'), row(2, 'luis_g')] });
  await openPanel(page);
  await page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' }).click();
  const group = page.getByRole('group', { name: '¿Aprobar la solicitud de ana_perez?' });
  await expect(group).toBeFocused();
  expect(fake.decisions).toEqual([]);
  await group.getByRole('button', { name: 'Cancelar' }).click();
  expect(fake.decisions).toEqual([]);
  await expect(page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' })).toBeFocused();
  await page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' }).click();
  await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  expect(fake.decisions).toEqual([{ id: uuid(1), action: 'approve', csrf: '1' }]);
  await expect(page.getByTestId('pending-count')).toHaveText('1 solicitud pendiente');
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud de ana_perez aprobada.' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 2, name: 'Solicitudes de registro' })).toBeFocused();
});

test('[REQ-APR9-005][SC-009-006] rechazar pide confirmación que advierte los 30 días; Escape cancela', async ({ page }) => {
  const fake = await fakeAdmin(page, { rows: [row(1, 'ana_perez')] });
  await openPanel(page);
  await page.getByRole('button', { name: 'Rechazar solicitud de ana_perez' }).click();
  const group = page.getByRole('group', { name: '¿Rechazar la solicitud de ana_perez?' });
  await expect(group).toContainText('30 días');
  await page.keyboard.press('Escape');
  await expect(group).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rechazar solicitud de ana_perez' })).toBeFocused();
  expect(fake.decisions).toEqual([]);
  await page.getByRole('button', { name: 'Rechazar solicitud de ana_perez' }).click();
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  expect(fake.decisions).toEqual([{ id: uuid(1), action: 'reject', csrf: '1' }]);
  await expect(page.getByTestId('pending-count')).toHaveText('No hay solicitudes pendientes.');
});

test('[REQ-APR9-005] con una confirmación abierta las demás acciones quedan deshabilitadas (una decisión a la vez)', async ({ page }) => {
  await fakeAdmin(page, { rows: [row(1, 'ana_perez'), row(2, 'luis_g')] });
  await openPanel(page);
  await page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' }).click();
  await expect(page.getByRole('button', { name: 'Aprobar solicitud de luis_g' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rechazar solicitud de luis_g' })).toBeDisabled();
});

test('[EDGE-009-039] decisión sobre una solicitud ya no disponible (404 problem+json): aviso, fila fuera y contador actualizado', async ({ page }) => {
  const fake = await fakeAdmin(page, { rows: [row(1, 'ana_perez')], decisionStatus: 404 });
  await openPanel(page);
  await page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' }).click();
  await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(page.getByRole('alert')).toContainText('Esa solicitud ya no está disponible');
  await expect(page.getByRole('listitem')).toHaveCount(0);
  expect(fake.decisions).toHaveLength(1);
});

test('[NFR-009-001] un fallo del servidor al decidir deja la confirmación abierta con alerta y permite reintentar', async ({ page }) => {
  const fake = await fakeAdmin(page, { rows: [row(1, 'ana_perez')], decisionStatus: 500 });
  await openPanel(page);
  await page.getByRole('button', { name: 'Rechazar solicitud de ana_perez' }).click();
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo registrar la decisión. Inténtalo de nuevo.');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  fake.decisionStatus = 200;
  await page.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('[NFR-009-001] error al cargar: alerta con «Reintentar» que vuelve a pedir las solicitudes', async ({ page }) => {
  const fake = await fakeAdmin(page, { rows: [row(1, 'ana_perez')], listStatus: 500 });
  await openPanel(page);
  await expect(page.getByRole('alert')).toContainText('No se pudieron cargar las solicitudes.');
  fake.listStatus = 200;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
});

test('[EDGE-009-008] sesión perdida (404 uniforme al cargar): vuelve a la pantalla de acceso sin mensaje de error', async ({ page }) => {
  const fake = await fakeAdmin(page, { rows: [row(1, 'ana_perez')], listStatus: 404 });
  // La sesión es válida hasta que la lista responde su 404 uniforme; la lectura que dispara ese 404 ya responde 404.
  await page.route('**/api/admin/session', (route) => {
    return fake.listCalls.length === 0
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_BODY) })
      : route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not Found' });
  });
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(fake.listCalls.length).toBeGreaterThan(0);
});

test('[NFR-009-001] WCAG 2.1 AA (axe), sin desbordamiento horizontal y objetivos táctiles ≥ 44 px a 320/1024/1280 px, con lista y con confirmación abierta', async ({ page }) => {
  const long = 'u'.repeat(60);
  await fakeAdmin(page, { rows: [row(1, long), row(2, 'luis_g', 'GOOGLE')], pageSize: 1 });
  await openPanel(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    expect(await axeViolations(page), `lista@${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde@${width}`).toBe(true);
    for (const name of [`Aprobar solicitud de ${long}`, `Rechazar solicitud de ${long}`, 'Cargar más solicitudes']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.height, `${name}@${width}`).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole('button', { name: `Rechazar solicitud de ${long}` }).click();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    expect(await axeViolations(page), `confirmación@${width}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `desborde confirmación@${width}`).toBe(true);
  }
});

test('[NFR-009-001] texto al 200 % a 320 px sin desbordamiento y movimiento reducido sin transiciones', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fakeAdmin(page, { rows: [row(1, 'ana_perez')] });
  await page.setViewportSize({ width: 320, height: 800 });
  await openPanel(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' }).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('[NFR-009-001] consola limpia y sin peticiones a otros dominios', async ({ page }) => {
  const errors: string[] = [];
  const foreign: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (new URL(r.url()).origin !== new URL(page.url() === 'about:blank' ? r.url() : page.url()).origin) foreign.push(r.url()); });
  await fakeAdmin(page, { rows: [row(1, 'ana_perez')] });
  await openPanel(page);
  await page.getByRole('button', { name: 'Aprobar solicitud de ana_perez' }).click();
  await page.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});
