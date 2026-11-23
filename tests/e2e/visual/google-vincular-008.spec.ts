/**
 * E2E de la vinculación de Google desde el perfil (feature 008, `[GH:#17]`, T1132) en Chromium, Firefox y WebKit con Google SIMULADO (`google-sim-support.ts`): una cuenta con usuario y
 * contraseña abre «Vincular Google» en `/cuenta`, escribe la contraseña actual y vuelve vinculada; con contraseña incorrecta nada cambia; una cuenta ya vinculada solo ve «Google
 * vinculado»; un `sub` ya vinculado a otra cuenta no se vincula (400 uniforme); y la vinculación revoca las demás sesiones de la cuenta conservando la de origen (REQ-VIN8-004).
 * La URL de autorización que entrega `startGoogleLink` (JSON, no un 302) se resuelve con `page.route` hacia el «consentimiento» simulado del servidor.
 *
 * @implements REQ-VIN8-001, REQ-VIN8-002, REQ-VIN8-004, SC-008-009..013, SC-008-014, SC-008-063, NFR-008-002
 */
import { expect, test, type Page, type Response } from '@playwright/test';
import { apiCall, registerViaApi } from './e2e-support.ts';
import { SIM_WEB_URL, startGoogleSim, type GoogleSim } from './google-sim-support.ts';

const TAGS: Record<string, string> = { chromium: 'c', firefox: 'f', webkit: 'w' };
const PASSWORD = 'ClaveE2E2026!';
const WRONG_PASSWORD = 'ClaveEquivocada2026!';
const WRONG_PASSWORD_TEXT = 'La contraseña actual no es correcta.';

test.use({ baseURL: SIM_WEB_URL });
test.describe.configure({ mode: 'serial' });

let sim: GoogleSim;
let tag = 'x';
let sharedSub = '';

test.beforeAll(async ({}, testInfo) => {
  test.setTimeout(120_000);
  tag = TAGS[testInfo.project.name] ?? 'x';
  sharedSub = `google-sub-${tag}-vinculo-0001`;
  sim = await startGoogleSim();
});

test.afterAll(async () => {
  await sim?.stop();
});

interface MeView {
  readonly user: { readonly username: string; readonly authMethods: { readonly password: boolean; readonly google: boolean } };
}

const callbackResponse = (page: Page): Promise<Response> => page.waitForResponse((r) => r.url().includes('/api/auth/google/callback'));
const currentPasswordField = (page: Page) => page.getByRole('form', { name: 'Vincular Google' }).getByLabel('Contraseña actual');
const linkButton = (page: Page) => page.getByRole('button', { name: 'Vincular Google' });
const linkForm = (page: Page) => page.getByRole('form', { name: 'Vincular Google' });

/** Cuenta con usuario y contraseña (sesión en el contexto de `page`). */
async function registerAccount(page: Page, suffix: string): Promise<string> {
  const username = `${tag}vin.${suffix}`;
  await registerViaApi(page.context().request, username, `Vinculo ${suffix}`, PASSWORD, sim.databasePath); // 009: cuenta ACTIVE por repositorio (T1244) y sesión por login
  return username;
}

/** El «consentimiento» de Google: la URL de autorización (navegación del navegador, no un 302 del servidor) se resuelve con el consentimiento simulado del propio servidor. */
async function routeGoogleConsent(page: Page): Promise<void> {
  await page.route('https://accounts.google.com/**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const consent = `${SIM_WEB_URL}/api/__sim/google-consent?${new URLSearchParams({ state: params.get('state') ?? '', nonce: params.get('nonce') ?? '' }).toString()}`;
    // WebKit no admite `fulfill` con 302: una página mínima con `meta refresh` navega al consentimiento simulado en los tres motores.
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${consent.replaceAll('&', '&amp;')}">` });
  });
}

async function openLinkForm(page: Page): Promise<void> {
  await page.goto('/cuenta');
  await expect(page.getByRole('heading', { name: 'Vincular Google' })).toBeVisible();
}

test.describe('vinculación de Google desde el perfil, Google simulado (T1132)', () => {
  test('[REQ-VIN8-002][SC-008-011] contraseña incorrecta: error bajo el campo con el texto fijo y foco; nada cambia', async ({ page }) => {
    const username = await registerAccount(page, 'mala');
    sim.next = { kind: 'login', sub: `google-sub-${tag}-mala-0001`, email: `${tag}.mala@example.test` };
    await routeGoogleConsent(page);
    await openLinkForm(page);
    await currentPasswordField(page).fill(WRONG_PASSWORD);
    await linkButton(page).click();
    const field = currentPasswordField(page);
    const error = page.locator('#google-link-currentPassword-error');
    await expect(error).toHaveText(WRONG_PASSWORD_TEXT);
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('body')).not.toContainText(/ERR-|urn:argos|problem\+json|pérdida de sesión/);
    // Sin navegación hacia Google: sigue en el perfil con el formulario y sin vínculo.
    await expect(page).toHaveURL(/\/cuenta$/);
    await expect(linkForm(page)).toBeVisible();
    const me = await apiCall<MeView>(page.context().request, 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(username);
    expect(me.body.user.authMethods).toEqual({ password: true, google: false });
  });

  test('[REQ-VIN8-002][SC-008-010] contraseña correcta: vuelve de Google vinculada, la sesión de origen se conserva y el perfil muestra «Google vinculado» sin formulario (cuenta ya con Google)', async ({ page }) => {
    const username = await registerAccount(page, 'ok');
    sim.next = { kind: 'login', sub: sharedSub, email: `${tag}.ok@example.test` };
    await routeGoogleConsent(page);
    await openLinkForm(page);
    const sessionBefore = (await page.context().cookies()).find((c) => c.name === 'argos_session')?.value;
    expect(sessionBefore).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    await currentPasswordField(page).fill(PASSWORD);
    const callback = callbackResponse(page);
    await linkButton(page).click();
    const landing = await callback;
    expect(landing.status()).toBe(200);
    // REQ-VIN8-004 / SC-008-063: la vinculación no emite sesión nueva (sin Set-Cookie argos_session) y conserva la de origen.
    const setCookies = (await landing.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value).join('\n');
    expect(setCookies).not.toContain('argos_session');
    await expect(page).toHaveURL(/\/$/);
    expect((await page.context().cookies()).find((c) => c.name === 'argos_session')?.value).toBe(sessionBefore);
    const me = await apiCall<MeView>(page.context().request, 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(username);
    expect(me.body.user.authMethods).toEqual({ password: true, google: true });
    // Cuenta ya con Google: tarjeta «Google vinculado», sin formulario ni campo de contraseña de la vinculación.
    await page.goto('/cuenta');
    await expect(page.getByRole('heading', { name: 'Google vinculado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vincular Google' })).toHaveCount(0);
    await expect(linkForm(page)).toHaveCount(0);
    await expect(linkButton(page)).toHaveCount(0);
    await expect(page.locator('#google-link-currentPassword')).toHaveCount(0);
  });

  test('[REQ-VIN8-004][SC-008-013] al vincular se revocan las demás sesiones de la cuenta y se conserva la de origen', async ({ page, browser }) => {
    const username = await registerAccount(page, 'rev');
    // Otra sesión de la misma cuenta, en otro contexto (otro dispositivo).
    const other = await browser.newContext({ baseURL: SIM_WEB_URL });
    const login = await apiCall(other.request, 'POST', '/auth/login', { username, password: PASSWORD });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    expect((await apiCall(other.request, 'GET', '/auth/me')).status).toBe(200);
    sim.next = { kind: 'login', sub: `google-sub-${tag}-rev-0001`, email: `${tag}.rev@example.test` };
    await routeGoogleConsent(page);
    await openLinkForm(page);
    await currentPasswordField(page).fill(PASSWORD);
    const callback = callbackResponse(page);
    await linkButton(page).click();
    expect((await callback).status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    const mine = await apiCall<MeView>(page.context().request, 'GET', '/auth/me');
    expect(mine.status).toBe(200);
    expect(mine.body.user.authMethods.google).toBe(true);
    // La promesa del copy del formulario («las demás sesiones se cierran»): la otra sesión ya no es válida.
    const revoked = await apiCall(other.request, 'GET', '/auth/me');
    expect(revoked.status).toBe(401);
    await other.close();
  });

  test('[REQ-VIN8-001][SC-008-014] sub ya vinculado a otra cuenta: el callback responde 400 uniforme y no vincula ni revoca nada', async ({ page, browser }) => {
    const username = await registerAccount(page, 'dup');
    const other = await browser.newContext({ baseURL: SIM_WEB_URL });
    expect((await apiCall(other.request, 'POST', '/auth/login', { username, password: PASSWORD })).status).toBe(200);
    // Por el navegador (UI): el sub compartido ya pertenece a la cuenta del caso anterior.
    sim.next = { kind: 'login', sub: sharedSub, email: `${tag}.dup@example.test` };
    await routeGoogleConsent(page);
    await openLinkForm(page);
    await currentPasswordField(page).fill(PASSWORD);
    const callback = callbackResponse(page);
    await linkButton(page).click();
    expect((await callback).status()).toBe(400);
    // Hallazgo conocido (callback 400 = JSON crudo; Firefox no termina de navegar): se comprueba el estado desde otra pestaña del mismo contexto.
    const next = await page.context().newPage();
    await next.goto('/cuenta');
    await expect(next.getByRole('heading', { name: 'Vincular Google' })).toBeVisible();
    await expect(next.getByRole('heading', { name: 'Google vinculado' })).toHaveCount(0);
    const me = await apiCall<MeView>(page.context().request, 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.authMethods).toEqual({ password: true, google: false });
    // La otra sesión de la cuenta sigue viva: un vínculo fallido no revoca nada.
    expect((await apiCall(other.request, 'GET', '/auth/me')).status).toBe(200);
    // Cuerpo uniforme del 400 por la misma cadena con el cliente HTTP del contexto (el navegador no siempre conserva el cuerpo).
    const request = page.context().request;
    const link = await apiCall<{ authorizationUrl: string }>(request, 'POST', '/auth/google/link', { currentPassword: PASSWORD });
    expect(link.status).toBe(200);
    const params = new URL(link.body.authorizationUrl).searchParams;
    const consent = await request.get(`/api/__sim/google-consent?${new URLSearchParams({ state: params.get('state') ?? '', nonce: params.get('nonce') ?? '' }).toString()}`, { maxRedirects: 0 });
    const failed = await request.get(consent.headers()['location']!, { maxRedirects: 0 });
    expect(failed.status()).toBe(400);
    const text = await failed.text();
    expect(JSON.parse(text).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(text).not.toContain(sharedSub);
    expect(text).not.toContain(`${tag}.dup@example.test`);
    expect((await apiCall<MeView>(request, 'GET', '/auth/me')).body.user.authMethods).toEqual({ password: true, google: false });
    await other.close();
  });
});
