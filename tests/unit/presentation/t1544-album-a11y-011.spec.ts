/**
 * T1544 [US7, Bloque G, #62] correcciones de accesibilidad del álbum del hogar según /sati: OBS-1 (2.4.3) el foco vuelve a la primera foto nueva o al encabezado tras «Ver más fotos»;
 * OBS-2 (4.1.3) región `role=status` sr-only por mascota con el progreso; OBS-3 (2.5.3) el nombre accesible del botón coincide con el texto visible mientras carga.
 *
 * @implements REQ-ALB11-001, REQ-ALB11-003, SC-011-048
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdAlbumView } from '../../../src/presentation/web/components/HouseholdAlbum.tsx';
import { loadMoreFocusTarget } from '../../../src/presentation/web/dialog-focus.ts';
import type { MediaItem } from '../../../src/presentation/web/media-api.ts';

const noop = (): void => undefined;
const pet = '11111111-1111-4111-8111-111111111201';
const photo = (n: number): MediaItem => ({ id: `55555555-5555-4555-8555-1201${String(n).padStart(8, '0')}`, petId: pet, kind: 'PHOTO', mime: 'image/jpeg', sizeBytes: 10, originalName: `f${n}.jpg`, createdAt: '2026-11-10T10:00:00.000Z' });
const view = (loadingMore: boolean, count = 24, total = 30): string =>
  renderToStaticMarkup(h(HouseholdAlbumView, { householdName: 'Casa', groups: [{ petId: pet, petName: 'Nube', status: 'READY', items: Array.from({ length: count }, (_, i) => photo(i + 1)), total, loadingMore }], urls: {}, onMore: noop, onImageError: noop }));

describe('T1544 OBS-1 foco tras «Ver más fotos» (2.4.3)', () => {
  it('al terminar la carga con fotos nuevas, el foco va a la primera foto nueva', () => {
    expect(loadMoreFocusTarget(true, false, 24, 30)).toBe(24);
  });
  it('al terminar sin fotos nuevas, el foco va al encabezado de la mascota', () => {
    expect(loadMoreFocusTarget(true, false, 24, 24)).toBe('HEADING');
  });
  it('sin transición de carga a lista no se mueve el foco', () => {
    expect(loadMoreFocusTarget(false, true, 24, 24)).toBeNull();
    expect(loadMoreFocusTarget(false, false, 24, 24)).toBeNull();
    expect(loadMoreFocusTarget(true, true, 24, 24)).toBeNull();
  });
  it('el encabezado y las fotos del álbum del hogar son enfocables por programa (tabindex=-1)', () => {
    const html = view(false);
    expect(html).toMatch(/<h4[^>]*tabindex="-1"/);
    expect((html.match(/<li[^>]*tabindex="-1"/g) ?? []).length).toBe(24);
  });
  it('el componente aplica el foco con el efecto sobre las referencias', () => {
    const src = readFileSync('src/presentation/web/components/PhotoAlbum.tsx', 'utf8');
    expect(src).toContain('loadMoreFocusTarget(');
    expect(src).toMatch(/headingRef\.current\?\.focus\(\)/);
  });
});

describe('T1544 OBS-2 progreso anunciado (4.1.3)', () => {
  it('hay un role=status sr-only con «N de M fotos de <Nombre>»', () => {
    expect(view(false)).toMatch(/<p role="status" class="sr-only">24 de 30 fotos de Nube<\/p>/);
  });
  it('el progreso se actualiza con las fotos cargadas y la región persiste al completar el álbum', () => {
    expect(view(false, 30, 30)).toMatch(/<p role="status" class="sr-only">30 de 30 fotos de Nube<\/p>/);
  });
});

describe('T1544 OBS-3 nombre accesible durante la carga (2.5.3)', () => {
  it('en reposo: etiqueta «Ver más fotos de Nube» con texto visible «Ver más fotos»', () => {
    const html = view(false);
    expect(html).toContain('aria-label="Ver más fotos de Nube"');
    expect(html).toContain('>Ver más fotos<');
  });
  it('cargando: el nombre accesible contiene el texto visible «Cargando…»', () => {
    const html = view(true);
    expect(html).toContain('aria-label="Cargando fotos de Nube"');
    expect(html).toContain('>Cargando…<');
    expect(html).not.toContain('aria-label="Ver más fotos de Nube"');
  });
});
