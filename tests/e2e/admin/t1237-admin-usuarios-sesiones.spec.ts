import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, registerViaApi } from '../visual/e2e-support.ts';
import { ADMIN_EMAIL, ADMIN_SIM_WEB_URL, startAdminGoogleSim, type AdminGoogleSim } from './admin-google-sim-support.ts';

/**
 * T1237 (Feature 009, Fase 3, #19): E2E del portal `/admin` frente a la aplicación de usuarios, con Google SIMULADO (ninguna red ni credencial) en Chromium, Firefox y WebKit.
 * Un usuario normal no encuentra rastro de `/admin`; el administrador entra por `/admin` con Google simulado; y las dos sesiones (`argos_session`, `argos_admin_session`) no se cruzan.
 * @implements REQ-ADM9-001, REQ-ADM9-002, INV-ADM9-002; SC-009-009, SC-009-010, SC-009-011, SC-009-012
 */

const TAGS: Record<string, string> = { chromium: 'c', firefox: 'f', webkit: 'w' };
const PASSWORD = 'Clave-Segura-2026!';

test.use({ baseURL: ADMIN_SIM_WEB_URL });
test.describe.configure({ mode: 'serial' });

let sim: AdminGoogleSim;
let tag = 'x';

test.beforeAll(async ({}, testInfo) => {
  test.setTimeout(120_000);
  tag = TAGS[testInfo.project.name] ?? 'x';
  sim = await startAdminGoogleSim();
});
test.afterAll(async () => {
  await sim?.stop();
});

async function cookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).map((c) => c.name).sort();
}

/** Entra al portal por `/admin` con el Google simulado y termina en el shell autenticado. */
async function adminSignIn(page: Page): Promise<void> {
  sim.next = { kind: 'login', sub: `google-sub-admin-${tag}`, email: ADMIN_EMAIL };
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Entrar con Google' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Administración' })).toBeVisible({ timeout: 15_000 });
}

test('un usuario normal no tiene rastro de /admin: ni enlaces, ni texto, y /admin solo le muestra la pantalla de acceso', async ({ page, context }) => {
  await registerViaApi(context.request, `usr_${tag}_a`, 'Usuaria Normal', PASSWORD);
  expect(await cookieNames(context)).toEqual(['argos_session']);
  for (const route of ['/', '/profile', '/households']) {
    await page.goto(route);
    await expect(page.locator('main, #root').first()).toBeVisible();
    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    expect(hrefs.filter((h) => /\/admin/i.test(h)), `enlaces a /admin en ${route}`).toEqual([]);
    expect(await page.content(), `rastro en ${route}`).not.toMatch(/\/admin|admin\.html/i);
    expect(await page.getByRole('link', { name: /administraci[oó]n|portal/i }).count()).toBe(0);
  }
  // La cookie de usuario no abre el portal: /admin sirve solo la pantalla de acceso y la API de administración responde el 404 uniforme.
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Administración' })).toHaveCount(0);
  expect((await context.request.get('/api/admin/session')).status()).toBe(404);
  expect((await context.request.get('/api/admin/definitely-not-a-route')).status()).toBe(404);
});

test('el administrador entra por /admin con Google simulado y solo recibe su propia cookie', async ({ page, context }) => {
  await adminSignIn(page);
  expect(await cookieNames(context)).toEqual(['argos_admin_session']);
  expect((await context.request.get('/api/admin/session')).status()).toBe(200);
  // La sesión de administración no es sesión de usuario: la API de usuarios no la reconoce.
  expect((await apiCall(context.request, 'GET', '/auth/me')).status).toBe(401);
  expect((await apiCall(context.request, 'GET', '/households')).status).toBe(401);
});

test('las dos sesiones conviven en un mismo navegador sin cruzarse y cerrar una no cierra la otra', async ({ page, context }) => {
  await adminSignIn(page);
  await registerViaApi(context.request, `usr_${tag}_b`, 'Usuario Dos', PASSWORD);
  expect(await cookieNames(context)).toEqual(['argos_admin_session', 'argos_session']);
  expect((await context.request.get('/api/admin/session')).status()).toBe(200);
  expect((await apiCall(context.request, 'GET', '/auth/me')).status).toBe(200);
  // Cerrar la sesión de administración no toca la de usuario.
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Entrar con Google' })).toBeVisible();
  expect((await context.request.get('/api/admin/session')).status()).toBe(404);
  expect((await apiCall(context.request, 'GET', '/auth/me')).status).toBe(200);
  expect(await cookieNames(context)).toEqual(['argos_session']);
});

test('con solo la cookie de usuario (contexto nuevo) la API de administración es indistinguible de una ruta inexistente y ninguna ruta de usuario otorga el rol', async ({ browser }) => {
  const userOnly = await browser.newContext({ baseURL: ADMIN_SIM_WEB_URL });
  try {
    await registerViaApi(userOnly.request, `usr_${tag}_c`, 'Usuaria Tres', PASSWORD);
    const session = await userOnly.request.get('/api/admin/session');
    const unknown = await userOnly.request.get('/api/admin/no-existe');
    expect(session.status()).toBe(404);
    expect(await session.text()).toBe(await unknown.text());
    // SC-009-012: un intento de otorgarse el rol por el registro no produce cookie de administración ni acceso al portal.
    await apiCall(userOnly.request, 'POST', '/auth/register', { username: `usr_${tag}_d`, displayName: 'X', password: PASSWORD, confirmPassword: PASSWORD, role: 'ADMIN', isAdmin: true });
    expect((await userOnly.cookies()).map((c) => c.name)).not.toContain('argos_admin_session');
    expect((await userOnly.request.get('/api/admin/session')).status()).toBe(404);
  } finally {
    await userOnly.close();
  }
});
