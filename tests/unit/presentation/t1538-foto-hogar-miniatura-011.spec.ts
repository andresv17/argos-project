/**
 * T1538 [US6, Bloque F, #59] foto del hogar bajo demanda (D11-10 = C). La carga inicial muestra el indicador «Ya hay una foto del hogar guardada» y «Ver foto» SIN
 * pedir el objeto (la comprobación de presencia usa `redirect: 'manual'`: lee la respuesta 302 sin seguirla, así que el almacenamiento nunca se contacta); «Ver foto»
 * carga una miniatura de máx. 96 px generada EN EL CLIENTE con canvas (`photo-thumbnail.ts`, sin librería de imagen nueva; el único lugar del valor 96, INV-ARCH-006);
 * ampliar, reemplazar, borrar y subir siguen operando. Nota (lock F-10): «Ver foto» descarga el original una vez (sin cambio de contrato ni de servidor, H-01 aparte)
 * y la ruta propia lleva la clave de objeto como versión de caché (`?v=tag`).
 *
 * @implements REQ-HOG11-003, SC-011-041, SC-011-042, SC-011-043, SC-011-044
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdPhotoView, type HouseholdPhotoViewProps } from '../../../src/presentation/web/components/HouseholdPhoto.tsx';
import { createSceneApi } from '../../../src/presentation/web/scene-api.ts';
import { THUMBNAIL_MAX_PX, fitWithin, makeThumbnail, type ThumbnailPort } from '../../../src/presentation/web/photo-thumbnail.ts';
import { householdPhotoPath } from '../../../src/presentation/web/scene-view.ts';
import { HOUSEHOLD_ID } from './escena-fixtures.ts';

const noop = (): void => undefined;
const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const button = (html: string, label: string): string => new RegExp(`<button[^>]*>${label}</button>`).exec(html)?.[0] ?? '';
function render(overrides: Partial<HouseholdPhotoViewProps> = {}): string {
  const props: HouseholdPhotoViewProps = {
    idPrefix: 'hogar-1',
    photoState: 'PRESENT',
    photoSrc: householdPhotoPath(HOUSEHOLD_ID, 'd1000000-0000-4000-8000-000000000009'),
    thumbState: 'IDLE',
    thumbSrc: null,
    enlarged: false,
    canUpload: true,
    chosenName: null,
    uploading: false,
    confirmDelete: false,
    error: null,
    onPhotoError: noop,
    onShowPhoto: noop,
    onToggleEnlarge: noop,
    onChoose: noop,
    onUpload: noop,
    onAskDelete: noop,
    onConfirmDelete: noop,
    onCancelDelete: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(HouseholdPhotoView, props));
}

describe('T1538 carga inicial sin descargar el objeto (REQ-HOG11-003)', () => {
  it('[REQ-HOG11-003][SC-011-041] con foto y sin pedirla: indicador «Ya hay una foto del hogar guardada» + botón «Ver foto», y ninguna etiqueta img (cero petición del objeto)', () => {
    const html = render();
    expect(textOf(html)).toContain('Ya hay una foto del hogar guardada');
    expect(button(html, 'Ver foto')).not.toBe('');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/photo');
  });

  it('[SC-011-041] la comprobación inicial (CHECKING) tampoco emite img ni sonda oculta que descargue el objeto', () => {
    const html = render({ photoState: 'CHECKING' });
    expect(html).not.toContain('<img');
    expect(textOf(html)).not.toContain('Ya hay una foto del hogar guardada');
  });

  it('[SC-011-041] la presencia se comprueba con redirect manual: UNA petición GET a la ruta propia, la 302 no se sigue (0 descargas del objeto) y no se lee el cuerpo', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const redirect = { ok: false, status: 0, type: 'opaqueredirect', headers: new Headers() } as unknown as Response;
    const api = createSceneApi(async (url, init) => {
      calls.push({ url: String(url), init });
      return redirect;
    });
    await expect(api.householdPhotoExists(HOUSEHOLD_ID)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/households/${HOUSEHOLD_ID}/photo`);
    expect(calls[0]!.init?.redirect).toBe('manual');
    expect(calls.every((c) => !/googleapis|X-Goog|Signature/i.test(c.url))).toBe(true);
  });

  it('[SC-011-041] 404 = sin foto; otro fallo se informa con su código y no se confunde con «sin foto»', async () => {
    const problem = (status: number, code: string) => async () => ({ ok: false, status, type: 'basic', headers: new Headers(), json: async () => ({ code }) }) as unknown as Response;
    await expect(createSceneApi(problem(404, 'ERR-MEDIA-NOT-FOUND')).householdPhotoExists(HOUSEHOLD_ID)).resolves.toBe(false);
    await expect(createSceneApi(problem(403, 'ERR-ACCESS-DENIED')).householdPhotoExists(HOUSEHOLD_ID)).rejects.toMatchObject({ code: 'ERR-ACCESS-DENIED', status: 403 });
  });
});

describe('T1538 «Ver foto» carga una miniatura de máx. 96 px bajo demanda', () => {
  it('[SC-011-042] mientras carga: botón deshabilitado y aviso; con la miniatura lista: img con la miniatura, sin exceder 96 px de lado, con texto alternativo', () => {
    const loading = render({ thumbState: 'LOADING' });
    expect(/\sdisabled(=|\s|>)/.test(button(loading, 'Cargando…').replace(/class="[^"]*"/, ''))).toBe(true);
    expect(loading).not.toContain('<img');
    const ready = render({ thumbState: 'READY', thumbSrc: 'blob:http://localhost/mini' });
    expect(ready).toContain('src="blob:http://localhost/mini"');
    expect(ready).toMatch(/alt="Miniatura de la foto del hogar"/);
    expect(ready).toContain(`max-width:${THUMBNAIL_MAX_PX}px`);
    expect(ready).toContain(`max-height:${THUMBNAIL_MAX_PX}px`);
    expect(ready).not.toContain(`/api/households/${HOUSEHOLD_ID}/photo`);
  });

  it('[SC-011-042] el valor 96 vive en un solo lugar: photo-thumbnail.ts lo exporta y ni el componente ni la API lo repiten', () => {
    expect(THUMBNAIL_MAX_PX).toBe(96);
    expect(readFileSync('src/presentation/web/photo-thumbnail.ts', 'utf8')).toMatch(/THUMBNAIL_MAX_PX\s*=\s*96/);
    expect(readFileSync('src/presentation/web/components/HouseholdPhoto.tsx', 'utf8')).not.toMatch(/\b96\b/);
    expect(readFileSync('src/presentation/web/scene-api.ts', 'utf8')).not.toMatch(/\b96\b/);
  });

  it('[SC-011-042] la miniatura se genera en el cliente con canvas, sin librería de imagen nueva', () => {
    const source = readFileSync('src/presentation/web/photo-thumbnail.ts', 'utf8');
    expect(source).toMatch(/createImageBitmap/);
    expect(source).toMatch(/createElement\('canvas'\)/);
    expect(source).not.toMatch(/from '(sharp|jimp|pica|browser-image-compression|canvas)'/);
    const deps = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string> };
    expect(Object.keys(deps.dependencies ?? {}).filter((d) => /sharp|jimp|pica|compress|imagemagick|image-size/i.test(d))).toEqual([]);
  });

  it('[SC-011-042] fitWithin conserva la proporción, nunca excede el máximo ni amplía imágenes pequeñas', () => {
    expect(fitWithin(4000, 3000, 96)).toEqual({ width: 96, height: 72 });
    expect(fitWithin(3000, 4000, 96)).toEqual({ width: 72, height: 96 });
    expect(fitWithin(50, 40, 96)).toEqual({ width: 50, height: 40 });
    expect(fitWithin(10000, 1, 96)).toEqual({ width: 96, height: 1 });
  });

  it('[SC-011-042] makeThumbnail decodifica el original, lo codifica a ≤ 96 px y devuelve null si no se puede decodificar o codificar', async () => {
    const encoded: { w: number; h: number }[] = [];
    const port: ThumbnailPort = {
      async decode() {
        return { width: 4000, height: 3000, async encode(w, h) { encoded.push({ w, h }); return new Blob(['mini'], { type: 'image/jpeg' }); } };
      },
    };
    const blob = await makeThumbnail(new Blob(['x']), port);
    expect(blob?.type).toBe('image/jpeg');
    expect(encoded).toEqual([{ w: 96, h: 72 }]);
    expect(await makeThumbnail(new Blob(['x']), { decode: async () => null })).toBeNull();
    expect(await makeThumbnail(new Blob(['x']), { decode: async () => ({ width: 10, height: 10, encode: async () => null }) })).toBeNull();
  });
});

describe('T1538 ampliar, reemplazar, borrar y subir siguen operando', () => {
  it('[SC-011-043] con la miniatura lista aparece «Ampliar»; ampliada muestra la foto completa por la ruta propia (sin URL firmada) y ofrece «Reducir»', () => {
    const ready = render({ thumbState: 'READY', thumbSrc: 'blob:x' });
    expect(button(ready, 'Ampliar')).not.toBe('');
    const big = render({ thumbState: 'READY', thumbSrc: 'blob:x', enlarged: true });
    expect(big).toContain(`src="/api/households/${HOUSEHOLD_ID}/photo?v=`);
    expect(big).toMatch(/alt="Foto de referencia del hogar"/);
    expect(big).not.toMatch(/googleapis|X-Goog|Signature/i);
    expect(button(big, 'Reducir')).not.toBe('');
  });

  it('[SC-011-043] «Reemplazar foto» y «Quitar foto» siguen disponibles aun sin ver la foto; quitar mantiene su confirmación', () => {
    const html = render();
    expect(button(html, 'Reemplazar foto')).not.toBe('');
    expect(button(html, 'Quitar foto')).not.toBe('');
    expect(html).not.toContain('Subir foto del hogar');
    const dialog = render({ confirmDelete: true });
    expect(dialog).toContain('role="alertdialog"');
    expect(button(dialog, 'Sí, quitar')).not.toBe('');
  });

  it('[SC-011-044] sin foto: «Subir foto del hogar» (deshabilitado hasta elegir archivo), sin indicador ni «Ver foto»; sin permiso, ningún control de carga', () => {
    const none = render({ photoState: 'ABSENT' });
    expect(none).not.toContain('<img');
    expect(textOf(none)).toMatch(/Aún no hay foto del hogar/);
    expect(textOf(none)).not.toContain('Ya hay una foto del hogar guardada');
    expect(button(none, 'Ver foto')).toBe('');
    expect(/\sdisabled(=|\s|>)/.test(button(none, 'Subir foto del hogar').replace(/class="[^"]*"/, ''))).toBe(true);
    expect(/\sdisabled(=|\s|>)/.test(button(render({ photoState: 'ABSENT', chosenName: 'sala.jpg' }), 'Subir foto del hogar').replace(/class="[^"]*"/, ''))).toBe(false);
    expect(render({ canUpload: false })).not.toMatch(/type="file"/);
  });

  it('[SC-011-044] el contenedor sube con reexportPhoto, comprueba presencia por la API (no por img) y reinicia la miniatura al subir o borrar', () => {
    const source = readFileSync('src/presentation/web/components/HouseholdPhoto.tsx', 'utf8');
    expect(source).toMatch(/reexportPhoto\(/);
    expect(source).toMatch(/api\.putHouseholdPhoto\(/);
    expect(source).toMatch(/api\.deleteHouseholdPhoto\(/);
    expect(source).toMatch(/api\.householdPhotoExists\(/);
    expect(source).toMatch(/URL\.revokeObjectURL/);
  });
});
