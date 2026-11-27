/**
 * E2E de la escena del hogar en el bloque «Hogar» (Feature 008): texto mensual «Generaciones restantes este mes: R. Se renuevan el [fecha].» (T1165, `[GH:#53]`) y botón
 * «Descargar imagen» (T1169, `[GH:#54]`). La API es la real de los E2E (driver de escena simulado y medios en memoria, generación en proceso); la fecha de renovación se
 * calcula en el test desde `quota.resetsAt` que entrega el servidor, en `America/Bogota`. La descarga se verifica con el evento `download` del navegador: nombre sugerido
 * `argos-hogar-AAAA-MM-DD.png` (sin PII) y bytes PNG, con ratón y con teclado; sin imagen vigente no hay botón. Chromium siempre; Firefox y WebKit con `E2E_FIREFOX=1` /
 * `E2E_WEBKIT=1` (`playwright.config.ts`).
 *
 * @implements REQ-UX8-001, REQ-UX8-002, NFR-008-002, EDGE-008-020, EDGE-008-021, SC-008-034, SC-008-035, SC-008-036, SC-008-037, SC-008-038
 */
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { accessibilityFindingsAt, apiCall, apiPost, createPetViaApi, registerViaApi, VIEWPORT_WIDTHS } from './e2e-support.ts';

const CSRF = { 'X-Argos-Request': '1' } as const;
const PNG_SIGNATURE = '89504e470d0a1a0a';

interface SceneBody {
  readonly imageTag: string | null;
  readonly status: string;
  readonly quota: { readonly max: number; readonly remaining: number; readonly resetsAt: string };
}

async function waitForImage(request: APIRequestContext, householdId: string): Promise<SceneBody> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const scene = await apiCall<SceneBody>(request, 'GET', `/households/${householdId}/scene`);
    if (scene.body.status !== 'generating' && scene.body.imageTag !== null) return scene.body;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error('La escena no terminó de generarse');
}

/** Registra a la dueña con un hogar y una mascota; con `withImage` consiente y genera la primera imagen. */
async function setup(context: BrowserContext, username: string, withImage: boolean): Promise<string> {
  const request = context.request;
  await registerViaApi(request, username, 'Escena E2E', 'EscenaClave2026!');
  const created = await apiPost<{ household: { id: string } }>(request, '/households', { name: 'Casa Escena' });
  const householdId = created.household.id;
  const petId = await createPetViaApi(request, 'Luna', 'CANINE');
  expect((await apiCall(request, 'PUT', `/pets/${petId}/assignments/${householdId}`)).status).toBe(200);
  if (withImage) {
    const notice = await apiCall<{ noticeVersion: string; providerId: string; scopes: string[] }>(request, 'GET', '/scene-consent/notice');
    const consent = await request.post('/api/scene-consent', { headers: CSRF, data: { noticeVersion: notice.body.noticeVersion, providerId: notice.body.providerId, scopes: notice.body.scopes } });
    expect(consent.status(), await consent.text()).toBe(204);
    const generate = await request.post(`/api/households/${householdId}/scene/generate`, { headers: { ...CSRF, 'Idempotency-Key': randomUUID() }, data: { action: 'UPDATE' } });
    expect(generate.status(), await generate.text()).toBe(202);
    await waitForImage(request, householdId);
  }
  return householdId;
}

const sceneBlock = (page: Page) => page.getByRole('region', { name: 'Escena del hogar' });

test.describe('escena del hogar en «Hogar» (Feature 008)', () => {
  test('[REQ-UX8-001][SC-008-034][NFR-008-002] con cambios pendientes el bloque dice «Generaciones restantes este mes: R. Se renuevan el [fecha].» en 320, 1024 y 1280 px sin desbordar', async ({ browser, browserName }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const householdId = await setup(context, `escena.texto.${randomUUID().slice(0, 6)}`, true);
      const second = await createPetViaApi(context.request, 'Nube', 'FELINE'); // un cambio en las mascotas deja la escena con cambios pendientes
      expect((await apiCall(context.request, 'PUT', `/pets/${second}/assignments/${householdId}`)).status).toBe(200);
      const scene = await apiCall<SceneBody & { pending: number }>(context.request, 'GET', `/households/${householdId}/scene`);
      expect(scene.body.pending).toBeGreaterThan(0);
      const renewal = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'America/Bogota' }).format(Date.parse(scene.body.quota.resetsAt));
      const expected = `Generaciones restantes este mes: ${scene.body.quota.remaining} de ${scene.body.quota.max}. Se renuevan el ${renewal}.`;

      await page.goto('/households');
      await page.getByRole('tab', { name: 'Escena' }).click(); // 011 (#64, D11-05 = A): la escena vive en la pestaña «Escena» del detalle del hogar
      for (const width of VIEWPORT_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await expect(sceneBlock(page).getByText(expected, { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), `desbordamiento horizontal a ${width}px`).toBe(false);
      }
      await expect(sceneBlock(page).getByText(/Generaciones restantes: \d/)).toHaveCount(0); // ya no existe el texto sin «este mes»
      // axe-core hace caer la página en Firefox ("Page crashed", ajeno a la app); la auditoría WCAG corre en Chromium y WebKit.
      if (browserName !== 'firefox') expect(await accessibilityFindingsAt(page, 'hogar-escena-texto', VIEWPORT_WIDTHS)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('[REQ-UX8-002][SC-008-035][EDGE-008-021] sin imagen vigente no hay botón «Descargar imagen»', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await setup(context, `escena.sinimg.${randomUUID().slice(0, 6)}`, false);
      await page.goto('/households');
      await page.getByRole('tab', { name: 'Escena' }).click(); // 011 (#64, D11-05 = A): la escena vive en la pestaña «Escena» del detalle del hogar
      await expect(sceneBlock(page).getByRole('button', { name: 'Crear imagen del hogar' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Descargar imagen del hogar' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('[REQ-UX8-002][SC-008-036][SC-008-037][SC-008-038][EDGE-008-020][EDGE-008-021][NFR-008-002] con imagen vigente «Descargar imagen» baja argos-hogar-AAAA-MM-DD.png (PNG, sin PII) con clic y con teclado, con objetivo táctil de 44 px', async ({ browser, browserName }) => {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    try {
      await setup(context, `escena.desc.${randomUUID().slice(0, 6)}`, true);
      await page.goto('/households');
      await page.getByRole('tab', { name: 'Escena' }).click(); // 011 (#64, D11-05 = A): la escena vive en la pestaña «Escena» del detalle del hogar
      const link = sceneBlock(page).getByRole('link', { name: 'Descargar imagen del hogar' });
      await expect(link).toBeVisible();
      await expect(link).toHaveText('Descargar imagen');

      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);

      for (const how of ['clic', 'teclado'] as const) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          (async () => {
            if (how === 'clic') return link.click();
            await link.focus();
            await expect(link).toBeFocused();
            return page.keyboard.press('Enter');
          })(),
        ]);
        expect(download.suggestedFilename(), how).toMatch(/^argos-hogar-\d{4}-\d{2}-\d{2}\.png$/);
        expect(download.suggestedFilename(), how).not.toMatch(/Luna|Casa|Escena/i);
        const path = await download.path();
        const { readFile } = await import('node:fs/promises');
        const bytes = await readFile(path);
        expect(bytes.subarray(0, 8).toString('hex'), `${how}: bytes PNG`).toBe(PNG_SIGNATURE);
        expect(page.url(), `${how}: no navega fuera de «Hogar»`).toMatch(/\/households/);
      }
      if (browserName !== 'firefox') expect(await accessibilityFindingsAt(page, 'hogar-escena-descarga', VIEWPORT_WIDTHS)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
