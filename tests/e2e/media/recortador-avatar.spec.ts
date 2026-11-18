/**
 * T585/T586 [US5] recortador de avatar y presentación del avatar en el navegador (REQ-AVA-002, REQ-AVA-003, D-19 A, SC-ALM-018..020): salida 512×512 WebP
 * (o JPEG si `canvas` no codifica WebP), máscara circular, teclado, prioridad avatar cargado > inicial y `avatarUrl` solo como enlace de texto sin `<img>`
 * bajo la política `img-src 'self' data:` de producción. Se ejecuta en cada proyecto de Playwright (Chromium siempre; WebKit si está instalado, PE-04).
 *
 * @implements REQ-AVA-002, REQ-AVA-003
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';
import { decodeInPage, isBlue, isRed, makeImage } from './media-support.ts';

/** Política de imágenes de producción (`CONTENT_SECURITY_POLICY` de `security-headers.ts`: `img-src 'self' data:`), aplicada al documento. */
const IMG_SRC_PRODUCTION = "img-src 'self' data:";

/** Registra en la página los PUT de avatar (tipo y bytes) y las violaciones de CSP. */
async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __puts: { type: string; base64: string }[]; __violations: string[] };
    w.__puts = [];
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => w.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (init?.method === 'PUT' && /\/api\/pets\/[^/]+\/avatar$/.test(url) && init.body instanceof Blob) {
        const bytes = new Uint8Array(await init.body.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        w.__puts.push({ type: init.body.type, base64: btoa(binary) });
      }
      return original(input, init);
    };
  });
  // La política de producción se aplica al documento de la SPA: toda imagen que no sea de la misma origen o `data:` se bloquea y se registra.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': IMG_SRC_PRODUCTION } });
  });
}
const puts = (page: Page) => page.evaluate(() => (window as unknown as { __puts: { type: string; base64: string }[] }).__puts);
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

async function openEditor(page: Page, petName: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').filter({ hasText: petName }).first().click();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await expect(page.locator('#avatar-file')).toBeVisible();
}

/** RGB del píxel (x, y) del `canvas` de la vista previa. */
const previewPixel = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const canvas = document.querySelector('[aria-label^="Vista previa circular"] canvas') as HTMLCanvasElement;
    return Array.from(canvas.getContext('2d')!.getImageData(px!, py!, 1, 1).data.slice(0, 3));
  }, [x, y]);

test.describe.configure({ mode: 'serial' });

test.describe('recortador de avatar (T585/T586)', () => {
  let context: BrowserContext;
  let petId = '';

  test.beforeAll(async ({ browser }, info) => {
    context = await browser.newContext();
    await registerViaApi(context.request, `avatar.${info.project.name}`, 'Dueña Avatar', 'AvatarClave2026!');
    petId = await createPetViaApi(context.request, 'Argos', 'CANINE');
    await createPetViaApi(context.request, 'Nyx', 'FELINE');
  });
  test.afterAll(async () => {
    await context.close();
  });

  /** Página nueva sobre la sesión compartida, con la política de imágenes de producción y el registro de PUT. */
  async function newPage(): Promise<Page> {
    const page = await context.newPage();
    await instrument(page);
    return page;
  }

  test('[SC-ALM-018] sin avatar cargado se muestra la inicial y ninguna imagen; la vista previa es circular y responde al teclado', async () => {
    const page = await newPage();
    await openEditor(page, 'Argos');
    await expect(page.locator('img[src*="/avatar"]')).toHaveCount(0);
    const wide = (await makeImage(page, 'image/png', 400, 200))!;
    await page.locator('#avatar-file').setInputFiles({ name: 'ancha.png', mimeType: 'image/png', buffer: wide });
    const preview = page.getByRole('img', { name: /Vista previa circular/ });
    await expect(preview).toBeVisible();
    // Máscara circular: contenedor con radio completo y recorte del desbordamiento.
    const mask = await preview.evaluate((el) => {
      const style = getComputedStyle(el);
      return { radius: parseFloat(style.borderTopLeftRadius), overflow: style.overflow, width: el.getBoundingClientRect().width };
    });
    expect(mask.overflow).toBe('hidden');
    expect(mask.radius).toBeGreaterThanOrEqual(mask.width / 2);
    // Inicio centrado: lado = 200, x 100..300; el borde rojo/azul cae en el centro, a la izquierda rojo.
    expect(isRed(await previewPixel(page, 20, 128))).toBe(true);
    expect(isBlue(await previewPixel(page, 236, 128))).toBe(true);
    // Teclado: 12 veces ArrowRight lleva el recorte al borde derecho (todo azul).
    await preview.focus();
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => isBlue(await previewPixel(page, 20, 128))).toBe(true);
    // Teclado: ArrowLeft devuelve el rojo; '+' acerca (el recorte se centra más al borde, cambia el contenido).
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => isRed(await previewPixel(page, 20, 128))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Usar esta foto' })).toBeVisible();
  });

  test('[REQ-AVA-002] confirmar sube un cuadrado de 512×512 en WebP y la ficha pasa a mostrar la imagen del proxy en lugar de la inicial', async () => {
    const page = await newPage();
    await openEditor(page, 'Argos');
    await page.locator('#avatar-file').setInputFiles({ name: 'ancha.png', mimeType: 'image/png', buffer: (await makeImage(page, 'image/png', 400, 200))! });
    await page.getByRole('button', { name: 'Usar esta foto' }).click();
    await expect.poll(async () => (await puts(page)).length).toBe(1);
    const sent = (await puts(page))[0]!;
    const webpSupported = (await makeImage(page, 'image/webp', 4, 4)) !== null;
    expect(sent.type).toBe(webpSupported ? 'image/webp' : 'image/jpeg');
    const decoded = (await decodeInPage(page, Buffer.from(sent.base64, 'base64'), sent.type))!;
    expect([decoded.width, decoded.height]).toEqual([512, 512]);
    expect(isRed(decoded.left) && isBlue(decoded.right)).toBe(true);
    // Avatar cargado > inicial: el perfil tiene avatarVersion y la ficha usa la imagen del proxy de la misma origen.
    const dashboard = await apiCall<{ profile: { avatarVersion: number | null } }>(context.request, 'GET', `/pets/${petId}/dashboard`);
    expect(dashboard.body.profile.avatarVersion).toBe(1);
    await page.goto('/');
    await page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').filter({ hasText: 'Argos' }).first().click();
    const image = page.locator(`img[src^="/api/pets/${petId}/avatar?v=1"]`).first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(512);
    expect(await violations(page)).toEqual([]);
  });

  test('[REQ-AVA-002] si canvas no codifica WebP (Safari) el recorte sale como JPEG de 512×512', async () => {
    const page = await newPage();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        original.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality);
      };
    });
    await openEditor(page, 'Nyx');
    await page.locator('#avatar-file').setInputFiles({ name: 'cuadrada.png', mimeType: 'image/png', buffer: (await makeImage(page, 'image/png', 300, 300))! });
    await page.getByRole('button', { name: 'Usar esta foto' }).click();
    await expect.poll(async () => (await puts(page)).length).toBe(1);
    const sent = (await puts(page))[0]!;
    expect(sent.type).toBe('image/jpeg');
    const decoded = (await decodeInPage(page, Buffer.from(sent.base64, 'base64'), 'image/jpeg'))!;
    expect([decoded.width, decoded.height]).toEqual([512, 512]);
  });

  test('[SC-ALM-019][SC-ALM-020] avatarUrl no se renderiza como imagen bajo img-src de producción: enlace «Ver enlace externo» y ayuda del campo, sin pedir nada al tercero', async () => {
    const page = await newPage();
    const remote = 'https://img.example.invalid/perro.png';
    const created = await apiCall<{ id: string }>(context.request, 'POST', '/pets', { name: 'Remota', species: 'CANINE', breed: 'Mestiza', birthDate: '2020-05-01', sex: 'MALE', avatarUrl: remote });
    expect(created.status).toBe(201);
    const requested: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('img.example.invalid')) requested.push(request.url());
    });
    await page.goto('/');
    await page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').filter({ hasText: 'Remota' }).first().click();
    const link = page.getByRole('link', { name: 'Ver enlace externo' });
    await expect(link).toHaveAttribute('href', remote);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('rel', /noreferrer/);
    await expect(page.locator('img[src*="img.example"]')).toHaveCount(0);
    // Ficha y lista: sin avatar cargado, la inicial.
    await expect(page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').filter({ hasText: 'Remota' }).getByText('R', { exact: true })).toBeVisible();
    // Formulario de edición: ayuda del campo y enlace.
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await expect(page.getByLabel('URL del avatar (opcional)')).toHaveValue(remote);
    await expect(page.getByText('no se muestra como imagen en ARGOS', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver enlace externo' }).first()).toBeVisible();
    expect(requested).toEqual([]);
    expect(await violations(page)).toEqual([]);
    // Control: la política sí está activa, una imagen remota insertada a mano se bloquea y se registra (sin esto, «cero violaciones» no probaría nada).
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = 'https://img.example.invalid/control.png';
      document.body.append(img);
    });
    await expect.poll(async () => (await violations(page)).length).toBe(1);
  });
});
