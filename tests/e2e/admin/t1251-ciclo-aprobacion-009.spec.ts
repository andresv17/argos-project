import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { activateInFile } from '../../fixtures/active-accounts.ts';
import { apiCall } from '../visual/e2e-support.ts';
import { ADMIN_EMAIL, ADMIN_SIM_WEB_URL, startAdminGoogleSim, type AdminGoogleSim } from './admin-google-sim-support.ts';

/**
 * T1251 (Feature 009, Fase 4, `[GH:#18]`): E2E del ciclo COMPLETO de aprobación SIN correo, en Chromium (y Firefox/WebKit si se piden), con Google del administrador SIMULADO (ninguna red
 * ni credencial) y la API real de usuarios del mismo servidor:
 *  1. registro por la interfaz -> «Tu solicitud está en revisión» sin sesión; el administrador ve la solicitud en `/admin`, la aprueba con confirmación y la persona entra a `/`;
 *  2. registro -> el administrador rechaza -> el inicio de sesión devuelve «Tu solicitud no fue aprobada.» sin sesión y el reintento del MISMO usuario (cualquier capitalización) recibe el
 *     409 uniforme de «usuario ocupado», sin revelar el rechazo (bloqueo de 30 días, EDGE-009-004);
 *  3. la cuenta aprobada ya no figura entre las pendientes (contador) y la rechazada tampoco; ninguna decisión emite correo (la interfaz lo dice y la API no tiene canal de salida).
 * La purga a 30 días es de persistencia (`t1245`/`t1248`); aquí solo se comprueba que el bloqueo está vigente tras el rechazo. Las pantallas de administración y de estado tienen su propio axe.
 *
 * @implements REQ-APR9-001, REQ-APR9-002, REQ-APR9-003, REQ-APR9-005, REQ-APR9-007; SC-009-001..008, SC-009-049
 */

const TAGS: Record<string, string> = { chromium: 'c', firefox: 'f', webkit: 'w' };
const PASSWORD = 'Clave-Segura-2026!';

test.use({ baseURL: ADMIN_SIM_WEB_URL });
test.describe.configure({ mode: 'serial' });

let sim: AdminGoogleSim;
let tag = 'x';
let admin: BrowserContext;
let adminPage: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  tag = TAGS[testInfo.project.name] ?? 'x';
  sim = await startAdminGoogleSim();
  admin = await browser.newContext({ baseURL: ADMIN_SIM_WEB_URL });
  adminPage = await admin.newPage();
  sim.next = { kind: 'login', sub: `google-sub-admin-t1251-${tag}`, email: ADMIN_EMAIL };
  await adminPage.goto('/admin');
  await adminPage.getByRole('link', { name: 'Entrar con Google' }).click();
  await expect(adminPage.getByRole('heading', { level: 1, name: 'Administración' })).toBeVisible({ timeout: 15_000 });
});
test.afterAll(async () => {
  await admin?.close();
  await sim?.stop();
});

const cookieNames = async (context: BrowserContext): Promise<string[]> => (await context.cookies()).map((c) => c.name).sort();

/** Registro por la interfaz (la SPA de usuarios): termina en «Tu solicitud está en revisión» sin sesión. */
async function registerViaUi(page: Page, username: string, displayName: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Nombre visible/).fill(displayName);
  await page.getByLabel(/^Contraseña \(/).fill(PASSWORD);
  await page.getByLabel(/^Confirmar contraseña/).fill(PASSWORD);
  await page.getByLabel('Soy mayor de edad (18+)').check();
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page).toHaveURL(/\/solicitud-en-revision$/);
  await expect(page.getByRole('heading', { name: 'Tu solicitud está en revisión' })).toBeFocused();
  expect(await cookieNames(page.context())).toEqual([]);
}

/** El administrador recarga `/admin`, localiza la solicitud, la decide con confirmación en línea y verifica el aviso y que la fila desaparece. */
async function decide(username: string, action: 'Aprobar' | 'Rechazar'): Promise<void> {
  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { name: 'Solicitudes de registro' })).toBeVisible();
  await expect(adminPage.getByTestId('pending-count')).toContainText(/solicitud/);
  const row = adminPage.getByRole('listitem').filter({ hasText: username });
  await expect(row).toContainText('Usuario y contraseña'); // método de registro (REQ-APR9-005)
  await expect(adminPage.getByText(ADMIN_EMAIL)).toHaveCount(0);
  await adminPage.getByRole('button', { name: `${action} solicitud de ${username}` }).click();
  await expect(adminPage.getByText(`¿${action} la solicitud de ${username}?`)).toBeVisible();
  await expect(adminPage.getByText('No se envía correo.')).toBeVisible(); // SC-009-008: sin correo, ni de entrada ni de salida
  await adminPage.getByRole('button', { name: action === 'Aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo' }).click();
  await expect(adminPage.getByRole('region', { name: 'Solicitudes de registro' }).getByRole('status')).toHaveText(action === 'Aprobar' ? `Solicitud de ${username} aprobada.` : `Solicitud de ${username} rechazada.`);
  await expect(adminPage.getByRole('listitem').filter({ hasText: username })).toHaveCount(0);
}

test('[REQ-APR9-001][REQ-APR9-003][REQ-APR9-005][SC-009-001..006] registro -> en revisión -> el administrador aprueba -> la persona entra', async ({ page }) => {
  const username = `apr_${tag}_ok`;
  await registerViaUi(page, username, 'Persona Aprobada');
  // Sin sesión: la app protegida la devuelve a /login y el inicio de sesión con credenciales válidas repite la pantalla de estado, sin cookie.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/solicitud-en-revision$/);
  expect(await cookieNames(page.context())).toEqual([]);
  expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(401);

  await decide(username, 'Aprobar');

  // Aprobada: entra con el mismo usuario y contraseña y llega a la app con su sesión.
  await page.goto('/login');
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  expect(await cookieNames(page.context())).toEqual(['argos_session']);
  expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(200);
});

test('[REQ-APR9-002][REQ-APR9-007][SC-009-002][SC-009-007][SC-009-049] registro -> el administrador rechaza -> sin acceso y el reintento queda bloqueado', async ({ page }) => {
  const username = `apr_${tag}_no`;
  await registerViaUi(page, username, 'Persona Rechazada');
  await decide(username, 'Rechazar');

  // Rechazada: las credenciales válidas devuelven la pantalla de rechazo, sin sesión ni cookie.
  await page.goto('/login');
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/solicitud-no-aprobada$/);
  await expect(page.getByRole('heading', { name: 'Tu solicitud no fue aprobada.' })).toBeFocused();
  expect(await cookieNames(page.context())).toEqual([]);
  expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(401);
  for (const path of ['/', '/households', '/cuenta']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }

  // Bloqueo del reintento: el MISMO usuario (también con otra capitalización) recibe el mismo 409 que un usuario ocupado, sin revelar el rechazo y sin sesión.
  const taken = await apiCall<{ code: string }>(page.context().request, 'POST', '/auth/register', { adultDeclaration: true, username, displayName: 'Otra Vez', password: PASSWORD, confirmPassword: PASSWORD });
  expect([taken.status, taken.code]).toEqual([409, 'ERR-AUTH-USERNAME-TAKEN']);
  const upper = await apiCall<{ code: string }>(page.context().request, 'POST', '/auth/register', { adultDeclaration: true, username: username.toUpperCase(), displayName: 'Otra Vez', password: PASSWORD, confirmPassword: PASSWORD });
  expect([upper.status, upper.code]).toEqual([409, 'ERR-AUTH-USERNAME-TAKEN']);
  expect(JSON.stringify(taken.body) + JSON.stringify(upper.body)).not.toMatch(/REJECTED|accountStatus|rechaz/i);
  expect(await cookieNames(page.context())).toEqual([]);

  // Por la interfaz el reintento se queda en /register con el error de usuario ocupado.
  await page.goto('/register');
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Nombre visible/).fill('Otra Vez');
  await page.getByLabel(/^Contraseña \(/).fill(PASSWORD);
  await page.getByLabel(/^Confirmar contraseña/).fill(PASSWORD);
  await page.getByLabel('Soy mayor de edad (18+)').check();
  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('alert').or(page.locator('[id$="-error"]')).first()).toBeVisible();
});

test('[REQ-APR9-005][SC-009-006] el contador de /admin refleja solo lo pendiente: aprobar y rechazar lo reducen, y una nueva solicitud lo sube', async ({ page }) => {
  await adminPage.goto('/admin');
  await expect(adminPage.getByTestId('pending-count')).toHaveText('No hay solicitudes pendientes.');
  const username = `apr_${tag}_cnt`;
  await registerViaUi(page, username, 'Persona Contada');
  await adminPage.goto('/admin');
  await expect(adminPage.getByTestId('pending-count')).toHaveText('1 solicitud pendiente');
  await expect(adminPage.getByRole('listitem').filter({ hasText: username })).toBeVisible();
  // La decisión directa de un tercero (otra pestaña/instancia) no deja una acción colgada: la cuenta pasa a ACTIVE por el arnés de T1244 y la fila ya no se puede decidir.
  await activateInFile(sim.databasePath, username);
  await adminPage.getByRole('button', { name: `Aprobar solicitud de ${username}` }).click();
  await adminPage.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(adminPage.getByRole('region', { name: 'Solicitudes de registro' }).getByRole('alert')).toContainText('ya no está disponible');
  await expect(adminPage.getByTestId('pending-count')).toHaveText('No hay solicitudes pendientes.');
});
