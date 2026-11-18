/**
 * T758..T766 / T767 / T775 / T777 [US4] E2E del enlace veterinario contra la API real y la SPA (REQ-VET-001, REQ-VET-005, REQ-VET-006, REQ-VET-007, REQ-VET-009, REQ-SUM-004,
 * REQ-SUM-005; SC-005-015, SC-005-019, SC-005-020, SC-005-031, SC-005-032, SC-005-035, SC-005-040, SC-005-046, NFR-005-003) en móvil emulado (Pixel 5) a 320 px:
 *  - S4: desde la ficha se crea el enlace con las casillas desmarcadas, se ve la URL una sola vez, se lista y se revoca con confirmación en línea;
 *  - S5: la persona veterinaria abre la URL SIN cuenta (contexto sin cookies) y ve el resumen de solo lectura; sin sesión no se consulta /auth/me;
 *  - S7: tras revocar, el mismo enlace muestra «Este enlace no está disponible» (idéntico a uno inexistente);
 *  - S6: con `emulateMedia(print)` (Pixel 5 y 320 px) se ocultan los controles, no se imprimen nombres de archivo ni el token y la hoja no desborda;
 *  - un nombre de archivo hostil (`<img src=x onerror=…>`) se muestra como texto escapado, sin elemento ni script (SC-005-035);
 *  - las cabeceras de REQ-VET-006 llegan en la página y en la API, y no hay desbordamiento horizontal ni violaciones de axe (WCAG 2.1 AA) a 320 px.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, devices, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';

const CSRF = { 'X-Argos-Request': '1', 'Content-Type': 'application/octet-stream' } as const;
const PDF_HEAD = Buffer.concat([Buffer.from('%PDF-1.4\n', 'ascii'), Buffer.alloc(56)]);
const HOSTILE_NAME = '<img src=x onerror=window.__xss=1>.pdf';

test.describe.configure({ mode: 'serial' });

test.describe('enlace veterinario en móvil emulado a 320 px (T758..T766)', () => {
  let owner: BrowserContext;
  let ownerPage: Page;
  let petId = '';
  let url = '';
  let token = '';
  const apiOf = (context: BrowserContext): APIRequestContext => context.request;

  test.beforeAll(async ({ browser }, info) => {
    owner = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 320, height: 640 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(owner.request, `enlace.${info.project.name}`, 'Dueña Enlace', 'EnlaceClave2026!');
    petId = await createPetViaApi(owner.request, 'Nube', 'CANINE');
    expect((await apiCall(apiOf(owner), 'POST', `/pets/${petId}/records/weights`, { recordedAt: '2026-10-01', weightKg: 12.5, notes: 'Control' })).status).toBe(201);
    const upload = await owner.request.post(`/api/pets/${petId}/media?kind=FILE`, { headers: { ...CSRF, 'X-Argos-Filename': encodeURIComponent(HOSTILE_NAME) }, data: PDF_HEAD });
    expect(upload.status()).toBe(201);
    ownerPage = await owner.newPage();
  });
  test.afterAll(async () => {
    await owner.close();
  });

  const section = () => ownerPage.getByRole('region', { name: 'Compartir con mi veterinario' });
  const overflow = (page: Page) => page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);

  test('[SC-005-040][REQ-VET-001] la ficha ofrece «Compartir con mi veterinario» con las casillas desmarcadas, 7 días por defecto y sin desbordar a 320 px', async () => {
    await ownerPage.goto('/');
    await expect(section()).toBeVisible();
    await expect(section().getByLabel('Incluir el número de microchip')).not.toBeChecked();
    await expect(section().getByLabel('Incluir archivos clínicos')).not.toBeChecked();
    await expect(section().getByLabel('7 días')).toBeChecked();
    await expect(section().getByText('Quien tenga el enlace puede ver el resumen sin iniciar sesión, hasta que venza o lo revoques.')).toBeVisible();
    await expect(section().getByText('Todavía no has compartido nada. Crea un enlace para que tu veterinario vea el resumen sin cuenta.')).toBeVisible();
    expect(await overflow(ownerPage)).toEqual([320, 320]);
  });

  test('[SC-005-015][REQ-VET-001] crear el enlace muestra la URL UNA sola vez con «Copiar enlace»; «Listo» la descarta y el listado solo trae metadatos', async () => {
    await section().getByLabel('Incluir archivos clínicos').check();
    await section().getByRole('button', { name: 'Crear enlace' }).click();
    await expect(section().getByRole('heading', { name: 'Enlace creado' })).toBeVisible();
    await expect(section().getByText('Este enlace no se vuelve a mostrar. Cópialo ahora.')).toBeVisible();
    url = await section().getByLabel('Enlace para tu veterinario').inputValue();
    expect(url).toMatch(/\/shared\/[A-Za-z0-9_-]{43}$/);
    token = url.split('/shared/')[1]!;
    await section().getByRole('button', { name: 'Listo' }).click();
    await expect(section().getByLabel('Enlace para tu veterinario')).toHaveCount(0);
    await expect(section().getByText('1 de 20 enlaces activos')).toBeVisible();
    await expect(section().getByText('Archivos clínicos: Incluidos')).toBeVisible();
    const text = (await ownerPage.content()) + (await ownerPage.evaluate(() => JSON.stringify([localStorage, sessionStorage, document.cookie])));
    expect(text).not.toContain(token);
    expect(ownerPage.url()).not.toContain(token);
    expect(await overflow(ownerPage)).toEqual([320, 320]);
  });

  test('[SC-005-031][SC-005-035][REQ-VET-006] la persona veterinaria abre la URL sin cuenta: resumen de solo lectura, nombre del archivo como TEXTO escapado, cabeceras de seguridad y sin /auth/me', async ({ browser }) => {
    const vet = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 320, height: 640 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
    const page = await vet.newPage();
    const requests: string[] = [];
    const dialogs: string[] = [];
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    page.on('dialog', async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    // En E2E la SPA la sirve Vite: las cabeceras de la PÁGINA se prueban en `tests/integration/api/t759-pagina-compartida.api.spec.ts`; aquí, las de la API que la página consume.
    const apiResponse = page.waitForResponse((r) => r.url().includes('/api/shared/') && r.url().endsWith('/summary'));
    await page.goto(`/shared/${token}`);
    const headers = (await apiResponse).headers();
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    await expect(page.getByRole('heading', { level: 1, name: 'Resumen clínico de Nube' })).toBeVisible();
    await expect(page.getByText('Este resumen no sustituye la consulta veterinaria.')).toBeVisible();
    await expect(page.getByText('Microchip no compartido por el cuidador')).toBeVisible();
    await expect(page.getByText('12,5 kg')).toBeVisible();
    await expect(page.getByText(HOSTILE_NAME, { exact: true })).toBeVisible();
    expect(await page.locator('main img, article img, [onerror]').count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
    expect(await page.title()).toBe('Resumen clínico compartido');
    expect(page.url()).toContain(token);
    expect(await page.locator('form, input, textarea, select').count()).toBe(0);
    expect(requests.filter((p) => p.startsWith('/api/auth'))).toEqual([]);
    const cookies = await vet.cookies();
    expect(cookies).toEqual([]);
    expect(await overflow(page)).toEqual([320, 320]);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await vet.close();
  });

  test('[SC-005-023][SC-005-020] la descarga redirige (302) sin cookie y las rutas públicas rechazan otros verbos con el mismo 404', async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${process.env['E2E_WEB_PORT'] ?? '5173'}` });
    const summary = await anonymous.get(`/api/shared/${token}/summary`);
    expect(summary.status()).toBe(200);
    const body = (await summary.json()) as { fileLabels: Array<{ fileId: string; displayName: string }> };
    expect(body.fileLabels.map((l) => l.displayName)).toEqual([HOSTILE_NAME]);
    const file = await anonymous.get(`/api/shared/${token}/files/${body.fileLabels[0]!.fileId}`, { maxRedirects: 0 });
    expect(file.status()).toBe(302);
    expect(file.headers()['location']).toMatch(/^(?:https:\/\/|\/__dev\/media\/pets\/)/);
    expect(file.headers()['cache-control']).toBe('no-store');
    const post = await anonymous.post(`/api/shared/${token}/summary`, { headers: { 'X-Argos-Request': '1' } });
    expect(post.status()).toBe(404);
    expect(await post.json()).toMatchObject({ code: 'ERR-SHARE-NOT-FOUND', instance: '/shared' });
    await anonymous.dispose();
  });

  test('[SC-005-032][SC-005-047] impresión (Pixel 5 y 320 px): se ocultan botón y cabecera, no se imprimen nombres de archivo ni el token, la hoja no desborda y hay @page sin márgenes', async ({ browser }) => {
    const vet = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 320, height: 640 }, locale: 'es-CO' });
    const page = await vet.newPage();
    await page.goto(`/shared/${token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Resumen clínico de Nube' })).toBeVisible();
    const screenText = await page.locator('body').innerText();
    expect(screenText).toContain('Imprimir / Guardar como PDF');
    expect(screenText).toContain(HOSTILE_NAME);
    await page.emulateMedia({ media: 'print' });
    const printed = await page.locator('body').innerText();
    expect(printed).not.toContain('Imprimir / Guardar como PDF');
    expect(printed).not.toContain('ARGOS');
    expect(printed).not.toContain(HOSTILE_NAME);
    expect(printed).not.toContain(token);
    expect(printed).toContain('Datos al momento de esta consulta; pueden cambiar');
    expect(printed).toContain('Este resumen no sustituye la consulta veterinaria.');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toBe('none');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await overflow(page)).toEqual([320, 320]);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: false });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await vet.close();
  });

  test('[SC-005-045][SC-005-031][D5-15] vista previa del propietario (Pixel 5 y 320 px): muestra lo que verá el veterinario con la franja de vista previa, sin token ni formularios, con el microchip declarado no compartido, accesible y sin desbordar', async () => {
    const created: string[] = [];
    ownerPage.on('response', (r) => {
      if (r.request().method() === 'POST' && r.url().includes('/share-links')) created.push(r.url());
    });
    await ownerPage.goto('/');
    await section().getByLabel('Incluir archivos clínicos').check();
    await section().getByRole('button', { name: 'Ver vista previa del resumen' }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/mascotas/${petId}/resumen\\?includeMicrochip=false&includeClinicalFiles=true`));
    await expect(ownerPage.getByRole('heading', { level: 1, name: 'Resumen clínico de Nube' })).toBeVisible();
    await expect(ownerPage.getByRole('note').filter({ hasText: 'Vista previa — así lo verá tu veterinario. Aún no se ha compartido nada.' })).toBeVisible();
    await expect(ownerPage.getByText('Microchip no compartido por el cuidador')).toBeVisible();
    await expect(ownerPage.getByText('Este resumen no sustituye la consulta veterinaria.')).toBeVisible();
    await expect(ownerPage.getByText('12,5 kg')).toBeVisible();
    await expect(ownerPage.getByText(HOSTILE_NAME, { exact: true })).toBeVisible();
    expect(await ownerPage.locator('main form, main input, main textarea, main select').count()).toBe(0);
    expect(await ownerPage.content()).not.toContain(token);
    expect(ownerPage.url()).not.toContain(token);
    expect(created).toEqual([]);
    expect(await overflow(ownerPage)).toEqual([320, 320]);
    const axe = await new AxeBuilder({ page: ownerPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await ownerPage.emulateMedia({ media: 'print' });
    const printed = await ownerPage.locator('body').innerText();
    expect(printed).not.toContain('Vista previa — así lo verá tu veterinario');
    expect(printed).not.toContain('Imprimir / Guardar como PDF');
    expect(printed).toContain('Datos al momento de esta consulta; pueden cambiar');
    await ownerPage.emulateMedia({ media: 'screen' });
    await ownerPage.getByRole('button', { name: 'Volver' }).click();
    await expect(section()).toBeVisible();
    await expect(section().getByText('1 de 20 enlaces activos')).toBeVisible();
  });

  test('[SC-005-019][SC-005-046][D5-22] «Revocar» pide confirmación en línea y solo al confirmar se envía el DELETE; tras revocar, el enlace muestra la pantalla uniforme', async ({ browser }) => {
    const deletes: string[] = [];
    ownerPage.on('request', (r) => {
      if (r.method() === 'DELETE') deletes.push(r.url());
    });
    await ownerPage.reload();
    await section().getByRole('button', { name: 'Revocar', exact: true }).click();
    await expect(section().getByText('¿Revocar este enlace? Dejará de funcionar de inmediato.')).toBeVisible();
    await section().getByRole('button', { name: 'Cancelar' }).last().click();
    expect(deletes).toEqual([]);
    await section().getByRole('button', { name: 'Revocar', exact: true }).click();
    await section().getByRole('button', { name: 'Revocar', exact: true }).last().click();
    await expect(section().getByRole('status').filter({ hasText: 'Enlace revocado' })).toBeVisible();
    await expect(section().getByText(/Revocado$/)).toBeVisible();
    expect(deletes).toHaveLength(1);
    const vet = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 320, height: 640 } });
    const page = await vet.newPage();
    await page.goto(`/shared/${token}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Este enlace no está disponible' })).toBeVisible();
    await expect(page.getByText('El enlace no existe, venció o fue revocado. Pide a quien te lo compartió que genere uno nuevo.')).toBeVisible();
    expect(await page.title()).toBe('Enlace no disponible');
    expect(await page.locator('button, a, img, form').count()).toBe(0);
    await vet.close();
  });
});
