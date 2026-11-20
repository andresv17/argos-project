/**
 * T878 (006, Fase 7): foto del hogar en la interfaz (carga, reemplazo, borrado, error `ERR-MEDIA-QUOTA-EXCEEDED`) y selección de la foto de referencia de la mascota
 * como avatar (`D6-07` = A). La foto se muestra por la ruta propia (302 firmada por el servidor): el DOM no guarda URL firmadas.
 * REQ-ESC6-001, REQ-ESC6-002; EDGE-ESC6-012, EDGE-ESC6-013; SC-ESC6-002, SC-ESC6-004, SC-ESC6-019.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdPhotoView, PetReferenceNote, type HouseholdPhotoViewProps } from '../../../src/presentation/web/components/HouseholdPhoto.tsx';
import { householdPhotoPath, sceneProblemMessage } from '../../../src/presentation/web/scene-view.ts';
import { HOUSEHOLD_ID } from './escena-fixtures.ts';

const noop = (): void => undefined;
const attrs = (button: string): string => button.replace(/class="[^"]*"/, '');
const isDisabled = (button: string): boolean => /\sdisabled(=|\s|>)/.test(attrs(button));
const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
function render(overrides: Partial<HouseholdPhotoViewProps> = {}): string {
  const props: HouseholdPhotoViewProps = {
    idPrefix: 'escena-h1',
    photoState: 'ABSENT',
    photoSrc: householdPhotoPath(HOUSEHOLD_ID, 'd1000000-0000-4000-8000-000000000009'),
    canUpload: true,
    chosenName: null,
    uploading: false,
    confirmDelete: false,
    error: null,
    onPhotoLoad: noop,
    onPhotoError: noop,
    onChoose: noop,
    onUpload: noop,
    onAskDelete: noop,
    onConfirmDelete: noop,
    onCancelDelete: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(HouseholdPhotoView, props));
}

describe('T878 foto del hogar (REQ-ESC6-001)', () => {
  it('[SC-ESC6-002] sin foto: ofrece «Subir foto del hogar» (deshabilitado hasta elegir archivo), solo JPEG, PNG o WebP, con la advertencia de no subir personas', () => {
    const html = render();
    const upload = /<button[^>]*>Subir foto del hogar<\/button>/.exec(html)?.[0] ?? '';
    expect(upload).not.toBe('');
    expect(isDisabled(upload)).toBe(true);
    expect(isDisabled(/<button[^>]*>Subir foto del hogar<\/button>/.exec(render({ chosenName: 'sala.jpg' }))?.[0] ?? '')).toBe(false);
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(textOf(html)).toMatch(/No subas fotos donde aparezca alguien/);
    expect(html).not.toContain('<img');
    expect(textOf(html)).toMatch(/Aún no hay foto del hogar/);
  });

  it('[SC-ESC6-004] con foto: la muestra por ruta propia (sin URL firmada), con texto alternativo; permite «Reemplazar foto» y «Quitar foto»', () => {
    const html = render({ photoState: 'PRESENT' });
    expect(html).toContain(`src="/api/households/${HOUSEHOLD_ID}/photo?v=`);
    expect(html).toMatch(/alt="Foto de referencia del hogar"/);
    expect(html).not.toMatch(/googleapis|X-Goog|Signature/i);
    expect(/<button[^>]*>Reemplazar foto<\/button>/.test(html)).toBe(true);
    expect(/<button[^>]*>Quitar foto<\/button>/.test(html)).toBe(true);
    expect(html).not.toContain('Subir foto del hogar');
  });

  it('[EDGE-ESC6-012] quitar pide confirmación y dice que la imagen de la escena queda desactualizada (1 cambio pendiente); «Cancelar» la cierra', () => {
    const html = render({ photoState: 'PRESENT', confirmDelete: true });
    expect(html).toContain('role="alertdialog"');
    expect(textOf(html)).toMatch(/desactualizada/);
    expect(/<button[^>]*>Sí, quitar<\/button>/.test(html)).toBe(true);
    expect(/<button[^>]*>Cancelar<\/button>/.test(html)).toBe(true);
    expect(render({ photoState: 'PRESENT' })).not.toContain('role="alertdialog"');
  });

  it('[EDGE-ESC6-013] ERR-MEDIA-QUOTA-EXCEEDED, ERR-MEDIA-TOO-LARGE y ERR-MEDIA-TYPE-NOT-ALLOWED se muestran con su texto estable en una región role=alert', () => {
    for (const code of ['ERR-MEDIA-QUOTA-EXCEEDED', 'ERR-MEDIA-TOO-LARGE', 'ERR-MEDIA-TYPE-NOT-ALLOWED']) {
      const message = sceneProblemMessage(code);
      expect(message.length).toBeGreaterThan(15);
      expect(message).not.toBe(sceneProblemMessage('ERR-INTERNAL-UNEXPECTED'));
      const html = render({ error: message });
      expect(html).toMatch(/role="alert"/);
      expect(textOf(html)).toContain(message);
    }
  });

  it('[REQ-ESC6-001] sin permiso (canUploadHouseholdPhoto falso) no hay controles de carga ni de borrado y se explica por qué', () => {
    const html = render({ canUpload: false, photoState: 'PRESENT' });
    expect(html).not.toMatch(/<button|type="file"/);
    expect(textOf(html)).toMatch(/Solo el propietario del hogar o un administrador/);
  });

  it('[NFR-ESC6-004] etiqueta del selector de archivo asociada, ids únicos y foco visible en los controles', () => {
    const html = render({ photoState: 'PRESENT' }) + render({ idPrefix: 'otro' });
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.filter((v, i) => ids.indexOf(v) !== i)).toEqual([]);
    for (const m of html.matchAll(/for="([^"]+)"/g)) expect(ids).toContain(m[1]);
    for (const button of html.match(/<button[^>]*>/g) ?? []) expect(button).toContain('focus-visible:ring-2');
  });

  it('[REQ-ESC6-001] mientras se comprueba si hay foto no se muestra imagen rota: una sonda oculta carga la ruta propia', () => {
    const html = render({ photoState: 'CHECKING' });
    expect(html).toMatch(/<img[^>]*aria-hidden="true"[^>]*class="hidden"|<img[^>]*class="hidden"[^>]*aria-hidden="true"/);
  });
});

describe('T878 foto de referencia de la mascota = avatar (D6-07 = A)', () => {
  it('[REQ-ESC6-002][SC-ESC6-019] dice que la referencia es el avatar y que sin avatar se dibuja por especie, raza y sexo; no ofrece otro selector de archivo', () => {
    const withAvatar = renderToStaticMarkup(h(PetReferenceNote, { hasAvatar: true }));
    const without = renderToStaticMarkup(h(PetReferenceNote, { hasAvatar: false }));
    expect(textOf(withAvatar)).toMatch(/avatar/i);
    expect(textOf(withAvatar)).toMatch(/foto de referencia/i);
    expect(textOf(without)).toMatch(/especie, raza y sexo/);
    expect(withAvatar + without).not.toMatch(/type="file"|<button/);
  });

  it('[D6-07] PetsPage muestra la nota junto al editor del avatar y HomeScene monta la foto del hogar', () => {
    expect(readFileSync('src/presentation/web/pages/PetsPage.tsx', 'utf8')).toMatch(/<PetReferenceNote[^>]*hasAvatar=/);
    expect(readFileSync('src/presentation/web/components/HomeScene.tsx', 'utf8')).toMatch(/<HouseholdPhoto\b/);
  });
});
