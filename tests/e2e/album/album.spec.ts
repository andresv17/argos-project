/**
 * T727 [US1] E2E del álbum en móvil emulado (Pixel 5, 393×727, táctil) contra la API real y la SPA (REQ-ALB5-001, REQ-ALB5-002, REQ-ALB5-003, REQ-ALB5-005;
 * SC-005-001, SC-005-002, SC-005-034):
 *  - «Álbum» muestra solo las 3 fotos (no los 2 archivos clínicos) con `loading="lazy"` y el contador «3 de 10 fotos» de `getAlbumLimits`;
 *  - sin desbordamiento horizontal a 393 px;
 *  - la décima foto se sube desde la interfaz, el álbum queda «Álbum lleno» (10 de 10) y desaparece el selector; la undécima por la API es 409;
 *  - borrar una foto con confirmación libera un hueco (9 de 10) y vuelve el selector;
 *  - con la pantalla desfasada (9 de 10) y el álbum lleno por otra sesión, subir muestra el mensaje del 409 y el contador se reconcilia (10 de 10).
 */
import { expect, test, devices, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';
import { makeImage, openClientPage } from '../media/media-support.ts';

const PNG_HEAD = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
const PDF_HEAD = Buffer.concat([Buffer.from('%PDF-1.4\n', 'ascii'), Buffer.alloc(56)]);
const CSRF = { 'X-Argos-Request': '1', 'Content-Type': 'application/octet-stream' } as const;

test.describe.configure({ mode: 'serial' });

test.describe('álbum en móvil emulado (T727)', () => {
  let context: BrowserContext;
  let page: Page;
  let petId = '';

  async function seed(kind: 'PHOTO' | 'FILE', name: string): Promise<number> {
    const response = await context.request.post(`/api/pets/${petId}/media?kind=${kind}`, {
      headers: { ...CSRF, 'X-Argos-Filename': encodeURIComponent(name) },
      data: kind === 'PHOTO' ? PNG_HEAD : PDF_HEAD,
    });
    return response.status();
  }
  const limits = async () => (await apiCall<{ photoCount: number; maxPhotosPerPet: number }>(context.request, 'GET', `/pets/${petId}/album/limits`)).body;

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ ...devices['Pixel 5'], locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `album.${info.project.name}`, 'Dueña Álbum', 'AlbumClave2026!');
    petId = await createPetViaApi(context.request, 'Nube', 'CANINE');
    page = await context.newPage();
  });
  test.afterAll(async () => {
    await context.close();
  });

  test('[SC-005-001][SC-005-034] con 3 fotos y 2 archivos clínicos, «Álbum» muestra solo las 3 fotos, «3 de 10 fotos» y no desborda a 393 px', async () => {
    for (const name of ['uno.png', 'dos.png', 'tres.png']) expect(await seed('PHOTO', name)).toBe(201);
    for (const name of ['analisis.pdf', 'radiografia.pdf']) expect(await seed('FILE', name)).toBe(201);
    await page.goto(`/mascotas/${petId}/album`);
    await expect(page.getByRole('heading', { name: 'Álbum de Nube' })).toBeVisible();
    await expect(page.locator('#album-count')).toHaveText('3 de 10 fotos');
    await expect(page.locator('ul img')).toHaveCount(3);
    for (const img of await page.locator('ul img').all()) await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(page.getByText('analisis.pdf')).toHaveCount(0);
    await expect(page.getByText('radiografia.pdf')).toHaveCount(0);
    await expect(page.getByText('Álbum lleno')).toHaveCount(0);
    expect(await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth])).toEqual([393, 393]);
  });

  test('[SC-005-002] la décima foto se sube desde la interfaz: «10 de 10 fotos», «Álbum lleno», sin selector; la undécima por la API es 409', async () => {
    for (let n = 4; n <= 9; n += 1) expect(await seed('PHOTO', `f${n}.png`)).toBe(201);
    await page.reload();
    await expect(page.locator('#album-count')).toHaveText('9 de 10 fotos');
    const clientPage = await context.newPage(); // imagen real decodificable para la reexportación por canvas
    await openClientPage(clientPage);
    const png = (await makeImage(clientPage, 'image/png', 64, 64))!;
    await clientPage.close();
    await page.setInputFiles('#album-file', { name: 'decima.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(page.locator('#album-count')).toHaveText('10 de 10 fotos');
    await expect(page.getByText('Álbum lleno', { exact: true })).toBeVisible();
    await expect(page.getByText('Historial / Archivos')).toBeVisible();
    await expect(page.locator('#album-file')).toHaveCount(0);
    expect(await limits()).toEqual({ photoCount: 10, maxPhotosPerPet: 10 });
    expect(await seed('PHOTO', 'once.png')).toBe(409);
    expect(await seed('FILE', 'otro.pdf')).toBe(201); // los archivos clínicos no cuentan
  });

  test('[REQ-ALB5-003] borrar una foto con confirmación libera un hueco: «9 de 10 fotos» y vuelve el selector', async () => {
    await page.reload();
    await expect(page.locator('#album-count')).toHaveText('10 de 10 fotos');
    await page.getByRole('button', { name: 'Borrar decima.png' }).click();
    await expect(page.getByText('¿Borrar «decima.png»?')).toBeVisible();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.locator('#album-count')).toHaveText('9 de 10 fotos');
    await expect(page.getByText('Álbum lleno', { exact: true })).toHaveCount(0);
    await expect(page.locator('#album-file')).toBeVisible();
  });

  test('[REQ-ALB5-005][EDGE-005-12] pantalla desfasada (9 de 10) y álbum lleno por otra sesión: el 409 muestra el mensaje y el contador se reconcilia a «10 de 10 fotos»', async () => {
    const clientPage = await context.newPage();
    await openClientPage(clientPage);
    const png = (await makeImage(clientPage, 'image/png', 64, 64))!;
    await clientPage.close();
    await page.reload();
    await expect(page.locator('#album-count')).toHaveText('9 de 10 fotos');
    expect(await seed('PHOTO', 'otra-sesion.png')).toBe(201); // otra sesión llena el álbum
    await page.setInputFiles('#album-file', { name: 'tarde.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('El álbum de esta mascota está completo');
    await expect(page.locator('#album-count')).toHaveText('10 de 10 fotos');
    await expect(page.getByText('Álbum lleno', { exact: true })).toBeVisible();
    expect((await limits()).photoCount).toBe(10);
  });
});
