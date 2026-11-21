/**
 * E2E del acceso con Google (feature 008, `[GH:#16]`, T1123) en Chromium, Firefox y WebKit con Google SIMULADO (ver `google-sim-support.ts`): primer acceso con elección de
 * usuario, regreso de una cuenta conocida, cancelación, `state` reutilizado, `/elige-usuario` sin flujo activo y la cookie de sesión `Strict` establecida por el `200` del
 * *callback* (la cookie `Strict` no viaja en la navegación que vuelve de Google: EDGE-008-006).
 *
 * @implements REQ-SSO8-003, REQ-SSO8-004, EDGE-008-006, NFR-008-002
 */
import { expect, test, type Page, type Response } from '@playwright/test';
import { accessibilityFindings, apiCall } from './e2e-support.ts';
import { SIM_WEB_URL, startGoogleSim, type GoogleSim } from './google-sim-support.ts';

const TAGS: Record<string, string> = { chromium: 'c', firefox: 'f', webkit: 'w' };
const NEUTRAL = 'No se pudo completar el acceso con Google. Vuelve a intentarlo desde la pantalla de acceso.';

test.use({ baseURL: SIM_WEB_URL });
test.describe.configure({ mode: 'serial' });

let sim: GoogleSim;
let tag = 'x';
let sub = '';
let email = '';
let username = '';

test.beforeAll(async ({}, testInfo) => {
  test.setTimeout(120_000);
  tag = TAGS[testInfo.project.name] ?? 'x';
  sub = `google-sub-${tag}-0001`;
  email = `${tag}.ana.google@example.test`;
  username = `${tag}ana.google`;
  sim = await startGoogleSim();
});

test.afterAll(async () => {
  await sim?.stop();
});

/** «Google» resuelve el consentimiento: redirige al callback del servidor con el escenario vigente; nada sale a internet. */
async function routeGoogle(page: Page): Promise<void> {
  await page.route('https://accounts.google.com/**', (route) => route.fulfill({ status: 302, headers: { location: sim.consent(route.request().url()) } }));
}

const callbackResponse = (page: Page): Promise<Response> => page.waitForResponse((r) => r.url().includes('/api/auth/google/callback'));
const googleButton = (page: Page) => page.getByRole('link', { name: 'Continuar con Google' });
const cookieNamed = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name);
const setCookies = async (response: Response): Promise<string> => (await response.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value).join('\n');

test.describe('acceso con Google simulado (T1123)', () => {
  test('[REQ-SSO8-003][SC-008-002] primer acceso: Google lleva a «Elige tu usuario», se elige el usuario y la sesión queda iniciada', async ({ page }) => {
    await routeGoogle(page);
    sim.next = { kind: 'login', sub, email };
    await page.goto('/login');
    const callback = callbackResponse(page);
    await googleButton(page).click();
    const landing = await callback;
    expect(landing.status()).toBe(200);
    const cookies = await setCookies(landing);
    expect(cookies).toContain('argos_oauth=');
    expect(cookies).toMatch(/SameSite=Lax/i);
    expect(cookies).not.toContain('argos_session'); // sub desconocido: todavía no hay sesión
    await expect(page).toHaveURL(/\/elige-usuario$/);
    const heading = page.getByRole('heading', { name: 'Elige tu usuario' });
    await expect(heading).toBeFocused();
    await page.getByLabel(/^Usuario/).fill(username);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/$/);
    const me = await apiCall<{ user: { username: string; authMethods: { password: boolean; google: boolean } } }>(page.context().request, 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(username);
    expect(me.body.user.authMethods).toEqual({ password: false, google: true });
    const session = await cookieNamed(page, 'argos_session');
    expect([session?.httpOnly, session?.sameSite]).toEqual([true, 'Strict']);
    expect(await cookieNamed(page, 'argos_oauth')).toBeUndefined();
  });

  test('[REQ-SSO8-004][EDGE-008-006][SC-008-006] cuenta conocida: la cookie Strict no viaja al volver de Google y el 200 del callback la establece; la página navega a /', async ({ page }) => {
    await routeGoogle(page);
    sim.next = { kind: 'login', sub, email };
    await page.goto('/login');
    await expect(googleButton(page)).toBeVisible();
    const callback = callbackResponse(page);
    await googleButton(page).click();
    const landing = await callback;
    const sent = await landing.request().allHeaders();
    expect(sent['cookie'] ?? '').toContain('argos_oauth=');
    expect(sent['cookie'] ?? '').not.toContain('argos_session');
    expect(landing.status()).toBe(200);
    expect(landing.headers()['content-type']).toContain('text/html');
    const cookies = await setCookies(landing);
    expect(cookies).toMatch(/argos_session=[^;]+;[^\n]*HttpOnly/i);
    expect(cookies).toMatch(/argos_session=[^\n]*SameSite=Strict/i);
    await expect(page).toHaveURL(/\/$/);
    expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(200);
    expect((await cookieNamed(page, 'argos_session'))?.sameSite).toBe('Strict');
    expect(await cookieNamed(page, 'argos_oauth')).toBeUndefined();
  });

  test('[REQ-SSO8-004][EDGE-008-006] state reutilizado: repetir el retorno de Google no abre sesión y falla con el mismo error uniforme', async ({ page, browser }) => {
    const replay = sim.lastCallbackUrl!;
    expect(replay).toContain('state=');
    // En el mismo navegador: el estado ya se consumió y su cookie se retiró.
    const again = await page.request.get(replay, { maxRedirects: 0 });
    expect(again.status()).toBe(400);
    const sameBody = await again.json();
    expect(sameBody.code).toBe('ERR-AUTH-GOOGLE-FAILED');
    // En un navegador limpio (sin cookie argos_oauth): idéntico estado, código y cuerpo (no distingue la causa).
    const fresh = await browser.newContext({ baseURL: SIM_WEB_URL });
    const other = await fresh.request.get(replay, { maxRedirects: 0 });
    expect(other.status()).toBe(400);
    expect(await other.json()).toEqual(sameBody);
    expect((await fresh.cookies()).find((c) => c.name === 'argos_session')).toBeUndefined();
    await fresh.close();
  });

  test('[REQ-SSO8-004][SC-008-002] cancelación en Google: error uniforme sin sesión, sin reflejar el motivo y sin cookies de flujo', async ({ page }) => {
    await routeGoogle(page);
    sim.next = { kind: 'cancel' };
    await page.goto('/login');
    const callback = callbackResponse(page);
    await googleButton(page).click();
    const landing = await callback;
    expect(landing.status()).toBe(400);
    const body = await landing.text();
    expect(JSON.parse(body).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(body).not.toContain('access_denied');
    expect(await cookieNamed(page, 'argos_session')).toBeUndefined();
    expect(await cookieNamed(page, 'argos_oauth')).toBeUndefined();
    await page.goto('/login');
    await expect(googleButton(page)).toBeVisible();
    expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(401);
  });

  test('[REQ-SSO8-003][NFR-008-002] /elige-usuario sin flujo activo: mensaje neutro del catálogo, sin error crudo, y vuelve al acceso', async ({ page }) => {
    await page.goto('/elige-usuario');
    await expect(page.getByRole('heading', { name: 'Elige tu usuario' })).toBeFocused();
    await page.getByLabel(/^Usuario/).fill(`${tag}sinflujo`);
    await page.getByRole('button', { name: 'Continuar' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText(NEUTRAL);
    await expect(page.locator('body')).not.toContainText(/ERR-|"code"|problem\+json|400/);
    await page.getByRole('link', { name: 'Volver al acceso' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(googleButton(page)).toBeVisible();
  });

  test('[NFR-008-002] accesibilidad (axe WCAG 2.1 AA a 320, 1024 y 1280 px): acceso con Google y «Elige tu usuario», sin desbordamiento', async ({ page }) => {
    await page.goto('/login');
    await expect(googleButton(page)).toBeVisible();
    expect(await accessibilityFindings(page, 'login-google')).toEqual([]);
    await page.goto('/elige-usuario');
    await expect(page.getByRole('heading', { name: 'Elige tu usuario' })).toBeVisible();
    expect(await accessibilityFindings(page, 'elige-usuario')).toEqual([]);
  });
});
