/**
 * T615 [US4] reexportación de fotos en el navegador (D-13 A, SC-ALM-035, REQ-ARC-001): el cliente decodifica con `createImageBitmap` y recodifica por
 * `canvas`; lo que recibe el servidor no lleva EXIF ni GPS, conserva la orientación visual, WebP no codificable cae a JPEG, una imagen no decodificable
 * no se sube, el PDF no se modifica y el resultado respeta 10 MiB. Se ejecuta en cada proyecto de Playwright (Chromium siempre; WebKit si está instalado, PE-04).
 *
 * @implements REQ-ARC-001
 */
import { expect, test, type Page } from '@playwright/test';
import { createPetViaApi, registerViaApi } from '../visual/e2e-support.ts';
import { decodeInPage, hasMetadata, isBlue, isRed, jpegWithExif, makeImage, openClientPage, pngWithText, webpWithExif } from './media-support.ts';

interface Outcome {
  readonly ok: boolean;
  readonly reason?: string;
  readonly type?: string;
  readonly name?: string;
  readonly base64?: string;
}

/** Ejecuta `reexportPhoto(browserPhotoPort())` del cliente real dentro de la página. `noWebp` simula un navegador que no codifica WebP (Safari). */
async function reexport(page: Page, bytes: Buffer, type: string, name: string, options: { noWebp?: boolean; maxBytes?: number } = {}): Promise<Outcome> {
  return page.evaluate(
    async ({ base64, type, name, noWebp, maxBytes }) => {
      const load = new Function('p', 'return import(p)') as (p: string) => Promise<Record<string, unknown>>;
      const mod = (await load('/src/presentation/web/photo-reexport.ts')) as {
        reexportPhoto(file: File, port: unknown, max?: number): Promise<{ blob: Blob; name: string }>;
        browserPhotoPort(): unknown;
      };
      const original = HTMLCanvasElement.prototype.toBlob;
      if (noWebp) {
        HTMLCanvasElement.prototype.toBlob = function (callback, t, q) {
          original.call(this, callback, t === 'image/webp' ? 'image/png' : t, q);
        };
      }
      try {
        const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const file = new File([raw], name, { type });
        const result = await mod.reexportPhoto(file, mod.browserPhotoPort(), maxBytes);
        const out = new Uint8Array(await result.blob.arrayBuffer());
        let binary = '';
        for (const byte of out) binary += String.fromCharCode(byte);
        return { ok: true, type: result.blob.type, name: result.name, base64: btoa(binary) };
      } catch (e) {
        return { ok: false, reason: (e as { reason?: string }).reason ?? String(e) };
      } finally {
        HTMLCanvasElement.prototype.toBlob = original;
      }
    },
    { base64: bytes.toString('base64'), type, name, noWebp: options.noWebp ?? false, maxBytes: options.maxBytes },
  );
}

test.beforeEach(async ({ page }) => {
  await openClientPage(page);
});

test.describe('reexportación de fotos por canvas (T615)', () => {
  test('[SC-ALM-035] JPEG con EXIF y GPS sale sin segmentos EXIF y con la orientación visual correcta', async ({ page }) => {
    const plain = (await makeImage(page, 'image/jpeg', 80, 40))!;
    const input = jpegWithExif(plain, 6); // 6: girar 90° a la derecha; la foto se ve 40×80 con el rojo arriba
    expect(hasMetadata(input)).toBe(true);
    const inputSeen = await decodeInPage(page, input, 'image/jpeg');
    expect([inputSeen?.width, inputSeen?.height]).toEqual([40, 80]);
    const outcome = await reexport(page, input, 'image/jpeg', 'perro.jpg');
    expect(outcome.ok).toBe(true);
    expect(outcome.type).toBe('image/jpeg');
    const output = Buffer.from(outcome.base64!, 'base64');
    expect(hasMetadata(output)).toBe(false);
    const seen = (await decodeInPage(page, output, 'image/jpeg'))!;
    expect([seen.width, seen.height]).toEqual([40, 80]);
    expect(isRed(seen.top)).toBe(true);
    expect(isBlue(seen.bottom)).toBe(true);
  });

  test('[SC-ALM-035] PNG con fragmento de texto sale sin metadatos y sigue siendo PNG', async ({ page }) => {
    const input = pngWithText((await makeImage(page, 'image/png', 40, 20))!);
    expect(hasMetadata(input)).toBe(true);
    const outcome = await reexport(page, input, 'image/png', 'gato.png');
    expect([outcome.ok, outcome.type, outcome.name]).toEqual([true, 'image/png', 'gato.png']);
    const output = Buffer.from(outcome.base64!, 'base64');
    expect(hasMetadata(output)).toBe(false);
    const seen = (await decodeInPage(page, output, 'image/png'))!;
    expect([seen.width, seen.height]).toEqual([40, 20]);
    expect(isRed(seen.left) && isBlue(seen.right)).toBe(true);
  });

  test('[SC-ALM-035] WebP con fragmento EXIF sale sin metadatos y como WebP si el navegador lo codifica', async ({ page }) => {
    const webp = await makeImage(page, 'image/webp', 40, 20);
    expect(webp?.subarray(8, 12).toString('latin1'), 'Chromium codifica WebP (RIFF/WEBP)').toBe('WEBP');
    const input = webpWithExif(webp!, 40, 20);
    expect(hasMetadata(input)).toBe(true);
    const outcome = await reexport(page, input, 'image/webp', 'loro.webp');
    expect([outcome.ok, outcome.reason, outcome.type, outcome.name]).toEqual([true, undefined, 'image/webp', 'loro.webp']);
    expect(hasMetadata(Buffer.from(outcome.base64!, 'base64'))).toBe(false);
  });

  test('[SC-ALM-035] WebP no codificable cae a JPEG con extensión .jpg y sin metadatos', async ({ page }) => {
    const webp = await makeImage(page, 'image/webp', 40, 20);
    expect(webp?.subarray(8, 12).toString('latin1'), 'Chromium codifica WebP (RIFF/WEBP)').toBe('WEBP');
    const source = webpWithExif(webp!, 40, 20);
    const outcome = await reexport(page, source, 'image/webp', 'loro.webp', { noWebp: true });
    expect([outcome.ok, outcome.reason, outcome.type, outcome.name]).toEqual([true, undefined, 'image/jpeg', 'loro.jpg']);
    expect(hasMetadata(Buffer.from(outcome.base64!, 'base64'))).toBe(false);
  });

  test('[SC-ALM-035] una imagen no decodificable se rechaza con DECODE y no produce archivo', async ({ page }) => {
    const outcome = await reexport(page, Buffer.from('esto no es una imagen'), 'image/jpeg', 'rota.jpg');
    expect([outcome.ok, outcome.reason]).toEqual([false, 'DECODE']);
  });

  test('[SC-ALM-035] el PDF pasa sin cambios, byte a byte', async ({ page }) => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const outcome = await reexport(page, pdf, 'application/pdf', 'carnet.pdf');
    expect([outcome.ok, outcome.type, outcome.name]).toEqual([true, 'application/pdf', 'carnet.pdf']);
    expect(Buffer.from(outcome.base64!, 'base64').equals(pdf)).toBe(true);
  });

  test('[SC-ALM-035] el resultado respeta 10 MiB: una foto normal cabe y, si el resultado supera el tope, se rechaza con TOO_LARGE', async ({ page }) => {
    const input = (await makeImage(page, 'image/jpeg', 300, 200))!;
    const ok = await reexport(page, input, 'image/jpeg', 'normal.jpg');
    expect(ok.ok).toBe(true);
    expect(Buffer.from(ok.base64!, 'base64').length).toBeLessThanOrEqual(10 * 1024 * 1024);
    const tooLarge = await reexport(page, input, 'image/jpeg', 'normal.jpg', { maxBytes: 100 });
    expect([tooLarge.ok, tooLarge.reason]).toEqual([false, 'TOO_LARGE']);
  });
});

test.describe('subida desde el panel de archivos (T615, extremo a extremo)', () => {
  test('[SC-ALM-035] el POST que recibe el servidor lleva la foto reexportada (sin EXIF) y una imagen rota no genera ningún POST', async ({ page, context }) => {
    const username = `fotos.${test.info().project.name}`;
    await registerViaApi(context.request, username, 'Dueña Fotos', 'FotosClave2026!');
    await createPetViaApi(context.request, 'Argos', 'CANINE');
    await page.goto('/');
    await page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').first().click();
    await page.getByRole('tab', { name: 'Historial / Archivos' }).click();
    await expect(page.locator('#clinical-file')).toBeAttached();

    const plain = (await makeImage(page, 'image/jpeg', 80, 40))!;
    // `postDataBuffer` llega vacío con cuerpos Blob en streaming: se registran los bytes que el cliente entrega a `fetch`.
    await page.evaluate(() => {
      const w = window as unknown as { __posts: string[] };
      w.__posts = [];
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        if (init?.method === 'POST' && /\/api\/pets\/[^/]+\/media/.test(url) && init.body instanceof Blob) {
          const bytes = new Uint8Array(await init.body.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          w.__posts.push(btoa(binary));
        }
        return original(input, init);
      };
    });
    const posted = (): Promise<Buffer[]> => page.evaluate(() => (window as unknown as { __posts: string[] }).__posts).then((list) => list.map((b) => Buffer.from(b, 'base64')));
    await page.locator('#clinical-file').setInputFiles({ name: 'gps.jpg', mimeType: 'image/jpeg', buffer: jpegWithExif(plain, 6) });
    await page.getByRole('button', { name: /Subir/ }).click();
    await expect.poll(async () => (await posted()).length).toBe(1);
    const first = (await posted())[0]!;
    expect(hasMetadata(first)).toBe(false);
    expect(first.subarray(0, 2).toString('hex')).toBe('ffd8');

    await page.locator('#clinical-file').setInputFiles({ name: 'rota.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('no es una imagen') });
    await page.getByRole('button', { name: /Subir/ }).click();
    await expect(page.getByRole('alert')).toContainText('No se pudo leer la imagen');
    expect(await posted()).toHaveLength(1);
  });
});
