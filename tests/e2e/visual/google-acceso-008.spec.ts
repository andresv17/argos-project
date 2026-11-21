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

const callbackResponse = (page: Page): Promise<Response> => page.waitForResponse((r) => r.url().includes('/api/auth/google/callback'));
const googleButton = (page: Page) => page.getByRole('link', { name: 'Continuar con Google' });
const cookieNamed = async (page: Page, name: string) => (await page.context().cookies()).find((c) => c.name === name);
const setCookies = async (response: Response): Promise<string> => (await response.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value).join('\n');

test.describe('acceso con Google simulado (T1123)', () => {
  test('[REQ-SSO8-003][SC-008-002] primer acceso: Google lleva a «Elige tu usuario», se elige el usuario y la sesión queda iniciada', async ({ page }) => {
    sim.next = { kind: 'login', sub, email };
    await page.goto('/login');
    const callback = callbackResponse(page);
    await googleButton(page).click();
    const landing = await callback;
    // El botón llevó a startGoogleLogin y el servidor entregó la URL real de Google: code + PKCE S256 + state + nonce + scope «openid email» y la URI de retorno fija.
    const authorization = new URL(sim.lastAuthorizationUrl!);
    expect(`${authorization.origin}${authorization.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(['response_type', 'scope', 'code_challenge_method', 'redirect_uri'].map((k) => [k, authorization.searchParams.get(k)]))).toEqual({
      response_type: 'code',
      scope: 'openid email',
      code_challenge_method: 'S256',
      redirect_uri: `${SIM_WEB_URL}/api/auth/google/callback`,
    });
    expect(['state', 'nonce', 'code_challenge'].every((k) => (authorization.searchParams.get(k) ?? '').length >= 32)).toBe(true);
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

  test('[REQ-SSO8-004][EDGE-008-006] state reutilizado: repetir el retorno con el mismo estado ya consumido no abre sesión y falla con el mismo error uniforme', async ({ page, browser }) => {
    const request = page.context().request;
    sim.next = { kind: 'login', sub, email };
    const start = await request.get('/api/auth/google/start', { maxRedirects: 0 });
    expect(start.status()).toBe(302);
    const oauth = /argos_oauth=([^;\s]+)/.exec(start.headers()['set-cookie'] ?? '')?.[1];
    expect(oauth).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const consent = await request.get(start.headers()['location']!, { maxRedirects: 0 });
    const callbackUrl = consent.headers()['location']!;
    expect((await request.get(callbackUrl, { maxRedirects: 0 })).status()).toBe(200); // primer retorno: el estado se consume
    // Repetición con el mismo identificador opaco y el mismo state (p. ej. otro navegador o una pestaña vieja): mismo 400 uniforme, sin sesión.
    const replayer = await browser.newContext({ baseURL: SIM_WEB_URL });
    const replay = await replayer.request.get(callbackUrl, { maxRedirects: 0, headers: { cookie: `argos_oauth=${oauth}` } });
    expect(replay.status()).toBe(400);
    const replayBody = await replay.json();
    expect(replayBody.code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect((await replayer.cookies()).find((c) => c.name === 'argos_session')).toBeUndefined();
    // Sin cookie de flujo: el mismo estado, código y cuerpo (no distingue la causa).
    const bare = await replayer.request.get(callbackUrl, { maxRedirects: 0 });
    expect(bare.status()).toBe(400);
    expect(await bare.json()).toEqual(replayBody);
    await replayer.close();
  });

  test('[REQ-SSO8-004][SC-008-002] cancelación en Google: error uniforme sin sesión, sin reflejar el motivo y sin cookies de flujo', async ({ page }) => {
    sim.next = { kind: 'cancel' };
    await page.goto('/login');
    const callback = callbackResponse(page);
    await googleButton(page).click();
    const landing = await callback;
    expect(landing.status()).toBe(400);
    expect(await cookieNamed(page, 'argos_session')).toBeUndefined();
    expect(await cookieNamed(page, 'argos_oauth')).toBeUndefined();
    // Hallazgo: el 400 del callback es un `application/problem+json` crudo; Firefox puede tratarlo como descarga y no terminar de navegar. Se sigue en otra pestaña del mismo contexto.
    const next = await page.context().newPage();
    await next.goto('/login');
    await expect(googleButton(next)).toBeVisible();
    expect((await apiCall(page.context().request, 'GET', '/auth/me')).status).toBe(401);
    // El cuerpo del 400 (que el navegador no siempre conserva tras navegar) se verifica por la misma cadena de redirecciones con el cliente HTTP del contexto.
    const request = page.context().request;
    const start = await request.get('/api/auth/google/start', { maxRedirects: 0 });
    const consent = await request.get(start.headers()['location']!, { maxRedirects: 0 });
    const failed = await request.get(consent.headers()['location']!, { maxRedirects: 0 });
    expect(failed.status()).toBe(400);
    const text = await failed.text();
    expect(JSON.parse(text).code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(text).not.toContain('access_denied');
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

  test('[REQ-SSO8-003][NFR-008-002] H-T1122-S1: con un usuario inválido o ocupado el foco pasa al campo con el error (WCAG 3.3.1 y 4.1.3)', async ({ page }) => {
    await page.goto('/elige-usuario');
    const field = page.getByLabel(/^Usuario/);
    await expect(page.getByRole('heading', { name: 'Elige tu usuario' })).toBeFocused();
    // Inválido (validación de cliente): el foco va al campo, que apunta al error con aria-describedby.
    await field.fill('a b!');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', 'choose-username-error');
    await expect(page.locator('#choose-username-error')).toBeVisible();
    // Ocupado (respuesta del servidor): tras enviar, el foco vuelve a estar en el botón y debe moverse de nuevo al campo.
    await page.route('**/api/auth/google/username', (route) =>
      route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ type: 'urn:argos:error:ERR-AUTH-USERNAME-TAKEN', title: 'Nombre de usuario no disponible', status: 409, code: 'ERR-AUTH-USERNAME-TAKEN', detail: 'Ya existe una cuenta con ese nombre de usuario.', invariantRef: 'INV-AUTH-001', field: 'username' }) }),
    );
    await field.fill(`${tag}ocupado`);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('#choose-username-error')).toHaveText('Ya existe una cuenta con ese nombre de usuario.');
    await expect(field).toBeFocused();
  });

  test('[REQ-SSO8-003][NFR-008-002] H-FOCO-1: enviar con Enter dentro del campo anuncia el error por una live region puntual, también al repetirlo, sin doble lectura (WCAG 4.1.3)', async ({ page }) => {
    await page.goto('/elige-usuario');
    const field = page.getByLabel(/^Usuario/);
    const live = page.locator('#choose-username-announce');
    const ERROR = page.locator('#choose-username-error');
    await expect(page.getByRole('heading', { name: 'Elige tu usuario' })).toBeFocused();
    // Registra cada contenido que toma la live region (vaciar y reponer es lo que hace que un lector vuelva a leerla).
    await page.evaluate(() => {
      const w = window as unknown as { __ann: string[] };
      w.__ann = [];
      const node = document.getElementById('choose-username-announce');
      if (node === null) return;
      new MutationObserver((records) => records.forEach((r) => w.__ann.push(Array.from(r.addedNodes).map((n) => n.textContent ?? '').join('')))).observe(node, { childList: true, characterData: true, subtree: true });
    });
    await field.fill('a b!');
    await field.press('Enter');
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', 'choose-username-error');
    await expect(ERROR).toBeVisible();
    const message = (await ERROR.textContent()) ?? '';
    expect(message).not.toBe('');
    // Live region: asertiva, atómica y con el mismo texto que el error; el error visible no lleva role=alert (una sola vía de anuncio).
    await expect(live).toHaveAttribute('aria-live', 'assertive');
    await expect(live).toHaveText(message);
    await expect(ERROR).not.toHaveAttribute('role', 'alert');
    // Segundo envío con el mismo error: la live region se vacía y se repone para que se anuncie otra vez.
    const before = await page.evaluate(() => (window as unknown as { __ann: string[] }).__ann.length);
    await field.press('Enter');
    await expect(live).toHaveText(message);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ann: string[] }).__ann.slice())).toContain('');
    const after = await page.evaluate(() => (window as unknown as { __ann: string[] }).__ann.slice(0));
    expect(after.length).toBeGreaterThan(before);
    expect(after.slice(before)).toContain('');
    expect(after[after.length - 1]).toBe(message);
    await expect(field).toBeFocused();
    // Con clic en el botón el foco se mueve al campo (el lector lee aria-describedby): la live region queda vacía, sin doble lectura.
    await page.reload();
    await field.fill('a b!');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(field).toBeFocused();
    await expect(ERROR).toBeVisible();
    await expect(page.locator('#choose-username-announce')).toHaveText('');
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
