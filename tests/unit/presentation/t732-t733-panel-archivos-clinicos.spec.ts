/**
 * T732 + T733 [US2] panel «Archivos» de «Historial / Archivos» (REQ-CLI5-001, REQ-CLI5-003; SC-005-001, SC-005-007, SC-005-010): solo `kind = FILE`
 * (sin selector «Tipo» ni filtro: H-4 de `/sati`), `accept` de PDF y fotos, estado vacío, fila con tipo, nombre, fecha de subida y tamaño (sin miniaturas),
 * errores con los textos de `/sati`, Lector sin subir ni borrar, borrado con confirmación y paginación; la sección «Historial / Archivos» de la ficha
 * contiene el panel debajo de los módulos clínicos y no aparece en modo edición. Render estático.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClinicalFilesPanelView, type ClinicalFilesPanelViewProps } from '../../../src/presentation/web/components/ClinicalFilesPanel.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { clinicalFilesMessage, FILE_ACCEPT } from '../../../src/presentation/web/media-view.ts';
import { dashboard } from './presentation-fixtures.ts';

const PET = '44444444-4444-4444-8444-444444444401';
const PDF_ITEM = { id: '55555555-5555-4555-8555-555555555501', petId: PET, kind: 'FILE', mime: 'application/pdf', sizeBytes: 2048, originalName: 'hemograma.pdf', createdAt: '2026-11-12T10:00:00.000Z' } as const;
const IMG_ITEM = { ...PDF_ITEM, id: '55555555-5555-4555-8555-555555555502', mime: 'image/jpeg', sizeBytes: 3 * 1024 * 1024, originalName: 'radiografia.jpg', createdAt: '2026-01-03T10:00:00.000Z' } as const;
const noop = (): void => undefined;

function view(overrides: Partial<ClinicalFilesPanelViewProps> = {}): string {
  const props: ClinicalFilesPanelViewProps = {
    items: [PDF_ITEM, IMG_ITEM],
    total: 2,
    page: 1,
    canUpload: true,
    canDelete: true,
    uploading: false,
    chosenName: null,
    error: null,
    viewer: null,
    confirmDeleteId: null,
    onChoose: noop,
    onUpload: noop,
    onView: noop,
    onCloseViewer: noop,
    onAskDelete: noop,
    onConfirmDelete: noop,
    onCancelDelete: noop,
    onPage: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(ClinicalFilesPanelView, props));
}

describe('T732 panel «Archivos» solo de archivos clínicos (REQ-CLI5-001)', () => {
  it('[SC-005-007] el selector acepta PDF y fotos (accept de archivos), no hay selector «Tipo» ni filtro y el título es «Archivos»', () => {
    const markup = view();
    expect(markup).toContain('>Archivos</h3>');
    expect(markup).toContain(`accept="${FILE_ACCEPT}"`);
    expect(markup).toContain('application/pdf');
    for (const dead of ['media-kind', 'media-filter', 'Tipo', 'Mostrar', '>Foto<', 'Fotos']) expect(markup).not.toContain(dead);
  });

  it('[SC-005-001] vacío muestra el texto de /sati con los formatos; con archivos lista nombre, tipo, fecha de subida y tamaño, sin miniaturas', () => {
    const empty = view({ items: [], total: 0 });
    expect(empty).toContain('Aún no hay archivos clínicos. Guarda aquí resultados de exámenes, radiografías o fotos médicas de control. Formatos: PDF, JPEG, PNG o WebP.');
    const markup = view();
    expect(markup).toContain('hemograma.pdf');
    expect(markup).toContain('radiografia.jpg');
    expect(markup).toContain('PDF · 2,0 KB · 12 nov 2026');
    expect(markup).toContain('Imagen · 3,0 MB · 3 ene 2026');
    expect(markup).not.toContain('<img');
  });

  it('[SC-005-009][REQ-CLI5-003] el Lector ve la lista y puede abrir, pero no hay selector de archivo ni «Borrar»; quien puede subir y borrar los ve', () => {
    const reader = view({ canUpload: false, canDelete: false });
    expect([reader.includes('type="file"'), reader.includes('Borrar'), reader.includes('aria-label="Ver hemograma.pdf"')]).toEqual([false, false, true]);
    const admin = view();
    expect([admin.includes('type="file"'), admin.includes('aria-label="Borrar hemograma.pdf"')]).toEqual([true, true]);
  });

  it('[REQ-CLI5-001] «Subir» exige elegir un archivo y dice «Subiendo…» deshabilitado en vuelo', () => {
    expect(view()).toMatch(/<button[^>]*disabled=""[^>]*>Subir<\/button>/);
    expect(view({ chosenName: 'a.pdf' })).not.toMatch(/<button[^>]*disabled=""[^>]*>Subir<\/button>/);
    expect(view({ chosenName: 'a.pdf', uploading: true })).toMatch(/<button[^>]*disabled=""[^>]*>Subiendo…<\/button>/);
  });

  it('[REQ-CLI5-001] el borrado pide confirmación con el nombre; el visor muestra «Abrir o descargar»', () => {
    const asking = view({ confirmDeleteId: PDF_ITEM.id });
    expect(asking).toContain('¿Borrar «hemograma.pdf»?');
    expect(asking).toContain('>Sí, borrar</button>');
    const url = 'https://b.storage.googleapis.com/x?sig=1';
    const viewing = view({ viewer: { item: PDF_ITEM, url, status: 'READY' } });
    expect(viewing).toContain('<iframe');
    expect(viewing).toContain('>Abrir o descargar</a>');
  });

  it('[SC-005-007][SC-005-008] los errores 415 y 409 de cuota usan los textos de /sati; otros códigos caen en el catálogo y en un aviso accesible', () => {
    expect(clinicalFilesMessage('ERR-MEDIA-TYPE-NOT-ALLOWED')).toBe('Ese formato no se admite. Usa PDF, JPEG, PNG o WebP.');
    expect(clinicalFilesMessage('ERR-MEDIA-QUOTA-EXCEEDED')).toBe('No hay espacio suficiente en tu cuota. Elimina archivos o fotos para liberar espacio.');
    expect(clinicalFilesMessage('ERR-MEDIA-TOO-LARGE')).toBe('El archivo supera el máximo de 10 MB.');
    expect(clinicalFilesMessage(undefined)).toContain('inesperado');
    const markup = view({ error: clinicalFilesMessage('ERR-MEDIA-QUOTA-EXCEEDED') });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No hay espacio suficiente en tu cuota.');
  });

  it('[REQ-ALB-001] con más de 24 archivos hay paginación acotada a FILE', () => {
    expect(view({ total: 50 })).toContain('Página 1 de 3');
    expect(view({ total: 50 })).toContain('aria-label="Páginas de archivos"');
    expect(view()).not.toContain('Páginas de archivos');
  });

  it('[REQ-CLI5-001] el contenedor lista y sube solo kind FILE (nunca PHOTO) y la ficha lo usa en lugar del panel mixto de 004', () => {
    const panel = readFileSync(new URL('../../../src/presentation/web/components/ClinicalFilesPanel.tsx', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(panel).toContain("api.list(petId, 'FILE'");
    expect(panel).toContain("api.upload(petId, 'FILE'");
    expect(panel).not.toContain('PHOTO');
    const page = readFileSync(new URL('../../../src/presentation/web/pages/PetsPage.tsx', import.meta.url), 'utf8');
    expect(page).toContain('<ClinicalFilesPanel');
    expect(page).not.toContain('<MediaPanel');
  });
});

describe('T733 sección «Historial / Archivos» de la ficha (REQ-CLI5-001; SC-005-010)', () => {
  const base = { dashboard: dashboard('OWNER'), activeTab: 'weights' as const, onTabChange: noop, onAddRecord: async () => undefined, onEdit: noop, onDelete: noop };
  const slot = h('p', null, 'RANURA-ARCHIVOS');

  it('[SC-005-010] debajo de los módulos clínicos hay una sección con el encabezado «Historial / Archivos» que contiene la ranura', () => {
    const markup = renderToStaticMarkup(h(PetDashboard, { ...base, mediaSlot: slot }));
    const tabpanel = markup.indexOf('role="tabpanel"');
    const heading = markup.indexOf('Historial / Archivos</h3>');
    const inside = markup.indexOf('RANURA-ARCHIVOS');
    expect(tabpanel).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(tabpanel);
    expect(inside).toBeGreaterThan(heading);
    expect(markup).toMatch(/<section[^>]*aria-labelledby="history-files-title"/);
    expect(markup).toContain('id="history-files-title"');
  });

  it('[SC-005-010] en modo edición o sin ranura no se pinta la sección ni su encabezado', () => {
    const editing = renderToStaticMarkup(h(PetDashboard, { ...base, mediaSlot: slot, editSlot: h('p', null, 'FORM') }));
    const without = renderToStaticMarkup(h(PetDashboard, base));
    expect([editing.includes('Historial / Archivos'), without.includes('Historial / Archivos')]).toEqual([false, false]);
  });
});
