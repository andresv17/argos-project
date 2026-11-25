/**
 * E2E de la eliminación de una cuenta nacida con Google (feature 009, deuda #17, T1221) en Chromium, Firefox y WebKit con Google SIMULADO (ver `google-sim-support.ts`):
 * sin la prueba de titularidad el servidor responde 403 y el foco va al título de la zona de peligro; con la prueba (reconfirmar con Google desde el perfil) la cuenta se elimina
 * y vuelve a pedir usuario como cuenta nueva; y con un hogar propio con otro miembro activo responde 409 con la lista de hogares y la cuenta se conserva.
 *
 * @implements REQ-DEL9-001, REQ-DEL9-002, INV-DEL9-001, EDGE-009-049
 */
import { expect, test, type Page } from '@playwright/test';
import { activateInFile } from '../../fixtures/active-accounts.ts';
import { apiCall, apiPost, registerViaApi } from './e2e-support.ts';
import { SIM_WEB_URL, startGoogleSim, type GoogleSim } from './google-sim-support.ts';

const TAGS: Record<string, string> = { chromium: 'c', firefox: 'f', webkit: 'w' };
const PHRASE = 'ELIMINAR MI CUENTA';
const REAUTH_MESSAGE = 'Para eliminar tu cuenta debes volver a confirmar tu identidad con Google. Inicia la verificación y vuelve a intentarlo.';

test.use({ baseURL: SIM_WEB_URL });
test.describe.configure({ mode: 'serial' });

let sim: GoogleSim;
let tag = 'x';

test.beforeAll(async ({}, testInfo) => {
  test.setTimeout(120_000);
  tag = TAGS[testInfo.project.name] ?? 'x';
  sim = await startGoogleSim();
});

test.afterAll(async () => {
  await sim?.stop();
});

const callbackResponse = (page: Page) => page.waitForResponse((r) => r.url().includes('/api/auth/google/callback'));

/** Nace una cuenta con Google (primer acceso + elección de usuario); la sesión queda en el contexto de `page`. */
async function bornWithGoogle(page: Page, sub: string, email: string, username: string): Promise<void> {
  sim.next = { kind: 'login', sub, email };
  await page.goto('/login');
  const callback = callbackResponse(page);
  await page.getByRole('link', { name: 'Continuar con Google' }).click();
  await callback;
  await expect(page).toHaveURL(/\/elige-usuario$/);
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel('Soy mayor de edad (18+)').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/solicitud-en-revision$/); // 009: la cuenta nace PENDING y sin sesión; se aprueba por repositorio (T1244) y se vuelve a entrar con Google
  await activateInFile(sim.databasePath, username);
  await page.goto('/login');
  const signedIn = callbackResponse(page);
  await page.getByRole('link', { name: 'Continuar con Google' }).click();
  await signedIn;
  await expect(page).toHaveURL(/\/$/);
  expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(200);
}

/** Descarga el respaldo desde el paso 2 y escribe la frase del paso 3. */
async function backupAndPhrase(page: Page): Promise<void> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar respaldo' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^argos-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText('Respaldo descargado. Ya puedes confirmar la eliminación.')).toBeVisible();
  await page.getByLabel('Escribe ELIMINAR MI CUENTA').fill(PHRASE);
}

/** El «consentimiento» de Google de la navegación del navegador (la URL llega en un JSON, no en un 302): se resuelve con el consentimiento simulado del servidor. WebKit no admite `fulfill` 302: `meta refresh`. */
async function routeGoogleConsent(page: Page): Promise<void> {
  await page.route('https://accounts.google.com/**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const consent = `${SIM_WEB_URL}/api/__sim/google-consent?${new URLSearchParams({ state: params.get('state') ?? '', nonce: params.get('nonce') ?? '' }).toString()}`;
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${consent.replaceAll('&', '&amp;')}">` });
  });
}

/** Paso 1: reconfirma con Google (Google simulado devuelve a la misma persona) y regresa al perfil con la sesión de origen. */
async function reauthWithGoogle(page: Page, sub: string, email: string): Promise<void> {
  sim.next = { kind: 'login', sub, email };
  await routeGoogleConsent(page);
  const callback = callbackResponse(page);
  await page.getByRole('button', { name: 'Confirmar con Google' }).click();
  expect((await callback).status()).toBe(200);
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.locator('[data-account-delete-google]')).toBeVisible();
}

test.describe('eliminar la cuenta nacida con Google, con Google simulado (T1221)', () => {
  test('[REQ-DEL9-001][INV-DEL9-001][SC-009-047] sin la prueba de titularidad: 403, mensaje del catálogo, foco en el título y la cuenta se conserva', async ({ page }) => {
    await bornWithGoogle(page, `google-sub-${tag}-del1`, `${tag}.del1@example.test`, `${tag}del1`);
    await page.goto('/cuenta');
    const zone = page.locator('[data-account-delete-google]');
    await expect(zone).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Contraseña actual');
    await backupAndPhrase(page);
    const deletion = page.waitForResponse((r) => r.url().endsWith('/api/account/deletion/google'));
    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    expect((await deletion).status()).toBe(403);
    await expect(zone.getByRole('alert')).toHaveText(REAUTH_MESSAGE);
    // H-T1220-S1: el foco llega al título de la zona de peligro (WCAG 3.3.1 y 4.1.3).
    await expect(page.locator('#delete-google-title')).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('delete-google-title');
    // La cuenta sigue viva y la sesión también.
    expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(200);
  });

  test('[REQ-DEL9-001][REQ-DEL9-002][INV-DEL9-001][SC-009-047] con la prueba de titularidad: se elimina, la sesión termina y el mismo Google vuelve como cuenta nueva', async ({ page }) => {
    const sub = `google-sub-${tag}-del2`;
    const email = `${tag}.del2@example.test`;
    await bornWithGoogle(page, sub, email, `${tag}del2`);
    await page.goto('/cuenta');
    await reauthWithGoogle(page, sub, email);
    await backupAndPhrase(page);
    const deletion = page.waitForResponse((r) => r.url().endsWith('/api/account/deletion/google'));
    await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    expect((await deletion).status()).toBe(204);
    await expect(page).toHaveURL(/\/login$/);
    expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(401);
    // La cuenta ya no existe: el mismo `sub` de Google se trata como una persona nueva y pide usuario.
    sim.next = { kind: 'login', sub, email };
    const callback = callbackResponse(page);
    await page.getByRole('link', { name: 'Continuar con Google' }).click();
    await callback;
    await expect(page).toHaveURL(/\/elige-usuario$/);
  });

  test('[REQ-DEL9-001][EDGE-009-049][SC-009-047] hogar propio con otro miembro activo: 409 con la lista de hogares y la cuenta se conserva', async ({ page, browser }) => {
    const sub = `google-sub-${tag}-del3`;
    const email = `${tag}.del3@example.test`;
    const owner = `${tag}del3`;
    await bornWithGoogle(page, sub, email, owner);
    const request = page.context().request;
    const guest = await browser.newContext({ baseURL: SIM_WEB_URL });
    try {
      const guestName = `${tag}invitado3`;
      await registerViaApi(guest.request, guestName, 'Invitado', 'InvitadoClave2026!', sim.databasePath);
      const house = { name: `Casa ${tag} del3`, id: (await apiPost<{ household: { id: string } }>(request, '/households', { name: `Casa ${tag} del3` })).household.id };
      expect((await apiCall(request, 'POST', `/households/${house.id}/invitations`, { username: guestName, roleOnJoin: 'READER' })).status).toBe(202);
      expect((await apiCall(guest.request, 'POST', `/invitations/${house.id}/accept`)).status).toBe(200);

      await page.goto('/cuenta');
      await reauthWithGoogle(page, sub, email);
      await backupAndPhrase(page);
      const deletion = page.waitForResponse((r) => r.url().endsWith('/api/account/deletion/google'));
      await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
      expect((await deletion).status()).toBe(409);
      const list = page.locator('[data-delete-households]');
      await expect(list).toBeVisible();
      await expect(list).toContainText(house.name);
      await expect(list).toContainText('1 miembro activo');
      await expect(page.locator('#delete-google-result')).toBeFocused();
      expect((await apiCall(request, 'GET', '/auth/me')).status).toBe(200);
    } finally {
      await guest.close();
    }
  });
});
