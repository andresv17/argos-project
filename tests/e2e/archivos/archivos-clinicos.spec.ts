/**
 * T734 [US2] E2E y accesibilidad del panel «Archivos» de «Historial / Archivos» en móvil emulado a 320 px y con teclado, contra la API real y la SPA
 * (REQ-CLI5-001, REQ-CLI5-003, NFR-005-003; SC-005-001, SC-005-007, SC-005-008, SC-005-010):
 *  - la ficha muestra «Historial / Archivos» con el panel «Archivos» sin selector «Tipo» ni filtro; vacío con el texto de /sati;
 *  - un PDF y una imagen se suben desde la interfaz, se listan con tipo, fecha y tamaño y NO aparecen en «Álbum» (que muestra solo fotos);
 *  - las fotos del álbum no aparecen en el panel; un `.docx` recibe el texto del 415;
 *  - subir, ver y borrar se operan solo con teclado; el visor abre el PDF; sin desbordamiento horizontal a 320 px ni violaciones de axe (WCAG 2.1 AA).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, devices, type BrowserContext, type Page } from '@playwright/test';
import { createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';
import { makeImage, openClientPage } from '../media/media-support.ts';

const PNG_HEAD = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
const PDF_HEAD = Buffer.concat([Buffer.from('%PDF-1.4\n', 'ascii'), Buffer.alloc(56)]);
const DOCX_HEAD = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]), Buffer.alloc(56)]);
const CSRF = { 'X-Argos-Request': '1', 'Content-Type': 'application/octet-stream' } as const;

test.describe.configure({ mode: 'serial' });

test.describe('panel «Archivos» en 320 px (T734)', () => {
  let context: BrowserContext;
  let page: Page;
  let petId = '';

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 320, height: 640 }, locale: 'es-CO', timezoneId: 'America/Bogota' });
    await registerViaApi(context.request, `archivos.${info.project.name}`, 'Dueña Archivos', 'ArchivosClave2026!');
    petId = await createPetViaApi(context.request, 'Nube', 'CANINE');
    page = await context.newPage();
  });
  test.afterAll(async () => {
    await context.close();
  });

  const panel = () => page.getByRole('region', { name: 'Archivos', exact: true });
  const overflow = () => page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);

  test('[SC-005-010][REQ-CLI5-001] la ficha tiene la pestaña «Historial / Archivos» con el panel vacío, sin selector «Tipo» ni filtro, y no desborda a 320 px', async () => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Historial / Archivos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial / Archivos' })).toHaveCount(0); // 007: ya no hay sección final duplicada
    await page.getByRole('tab', { name: 'Historial / Archivos' }).click();
    await expect(panel()).toBeVisible();
    await expect(panel().getByText('Aún no hay archivos clínicos. Guarda aquí resultados de exámenes, radiografías o fotos médicas de control. Formatos: PDF, JPEG, PNG o WebP.')).toBeVisible();
    await expect(page.getByLabel('Tipo', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Mostrar', { exact: true })).toHaveCount(0);
    expect(await overflow()).toEqual([320, 320]);
  });

  test('[SC-005-007][REQ-CLI5-001] se sube un PDF y una imagen: se listan con tipo, fecha y tamaño; un .docx recibe el aviso de formato; nada aparece en «Álbum»', async () => {
    const clientPage = await context.newPage();
    await openClientPage(clientPage);
    const png = (await makeImage(clientPage, 'image/png', 64, 64))!;
    await clientPage.close();
    await page.setInputFiles('#clinical-file', { name: 'hemograma.pdf', mimeType: 'application/pdf', buffer: PDF_HEAD });
    await panel().getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(panel().getByText('hemograma.pdf')).toBeVisible();
    await page.setInputFiles('#clinical-file', { name: 'radiografia.png', mimeType: 'image/png', buffer: png });
    await panel().getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(panel().getByText('radiografia.png')).toBeVisible();
    await expect(panel().getByText(/^PDF · .* · \d{1,2} \p{L}{3} \d{4}$/u)).toHaveCount(1);
    await expect(panel().getByText(/^Imagen · .* · \d{1,2} \p{L}{3} \d{4}$/u)).toHaveCount(1);
    await page.setInputFiles('#clinical-file', { name: 'informe.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: DOCX_HEAD });
    await panel().getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(panel().getByRole('alert')).toHaveText('Ese formato no se admite. Usa PDF, JPEG, PNG o WebP.');
    await expect(panel().getByText('informe.docx')).toHaveCount(0);
    await page.goto(`/mascotas/${petId}/album`);
    await expect(page.getByRole('heading', { name: 'Álbum de Nube' })).toBeVisible();
    await expect(page.getByText('hemograma.pdf')).toHaveCount(0);
    await expect(page.getByText('radiografia.png')).toHaveCount(0);
    await expect(page.locator('#album-count')).toHaveText('0 de 10 fotos');
  });

  test('[SC-005-001] una foto del álbum no aparece en el panel «Archivos»', async () => {
    const response = await context.request.post(`/api/pets/${petId}/media?kind=PHOTO`, { headers: { ...CSRF, 'X-Argos-Filename': encodeURIComponent('paseo.png') }, data: PNG_HEAD });
    expect(response.status()).toBe(201);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Historial / Archivos' }).click();
    await expect(panel().getByText('hemograma.pdf')).toBeVisible();
    await expect(panel().getByText('paseo.png')).toHaveCount(0);
    await expect(panel().getByText('Foto')).toHaveCount(0);
  });

  test('[SC-005-010][NFR-005-003] solo con teclado: se llega al selector, al visor y al borrado con confirmación; los botones miden al menos 44 px de alto', async () => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Historial / Archivos' }).click();
    await expect(panel().getByText('hemograma.pdf')).toBeVisible();
    for (const name of ['Subir', 'Ver hemograma.pdf', 'Borrar hemograma.pdf']) {
      const button = panel().getByRole('button', { name, exact: true });
      const box = (await button.boundingBox())!;
      expect([name, box.height >= 44]).toEqual([name, true]);
    }
    await panel().locator('#clinical-file').focus();
    await expect(panel().locator('#clinical-file')).toBeFocused();
    const viewButton = panel().getByRole('button', { name: 'Ver radiografia.png' });
    await viewButton.focus();
    await expect(viewButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel().getByRole('region', { name: 'Visor de radiografia.png' })).toBeVisible();
    await panel().getByRole('button', { name: 'Cerrar visor' }).focus();
    await page.keyboard.press('Enter');
    await expect(panel().getByRole('region', { name: 'Visor de radiografia.png' })).toHaveCount(0);
    const del = panel().getByRole('button', { name: 'Borrar radiografia.png' });
    await del.focus();
    await page.keyboard.press('Enter');
    await expect(panel().getByText('¿Borrar «radiografia.png»?')).toBeVisible();
    await panel().getByRole('button', { name: 'Sí, borrar' }).focus();
    await page.keyboard.press('Enter');
    await expect(panel().getByText('radiografia.png')).toHaveCount(0);
    await expect(panel().getByText('hemograma.pdf')).toBeVisible();
  });

  test('[SC-005-010][NFR-005-003] axe-core (WCAG 2.1 A/AA) sin violaciones a 320 px con archivos listados y con el visor abierto', async () => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Historial / Archivos' }).click();
    await expect(panel().getByText('hemograma.pdf')).toBeVisible();
    const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(await scan()).toEqual([]);
    await panel().getByRole('button', { name: 'Ver hemograma.pdf' }).click();
    await expect(panel().getByRole('region', { name: 'Visor de hemograma.pdf' })).toBeVisible();
    expect(await scan()).toEqual([]);
    expect(await overflow()).toEqual([320, 320]);
  });
});
