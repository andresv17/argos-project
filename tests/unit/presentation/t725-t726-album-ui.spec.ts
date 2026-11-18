/**
 * T725 + T726 [US1] «Álbum» (REQ-ALB5-001, REQ-ALB5-002, REQ-ALB5-003, REQ-ALB5-004, REQ-ALB5-005; SC-005-001, SC-005-002, SC-005-005, SC-005-034):
 * contador «N de M fotos» tomado de `getAlbumLimits` (sin «10» cableado), estado «Álbum lleno» con el conteo (también por encima del tope), mensaje de
 * ERR-MEDIA-ALBUM-LIMIT, subida de fotos (nunca PDF), borrado con confirmación y `loading="lazy"`. Render estático de `PhotoAlbumView`.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhotoAlbumView, type PhotoAlbumViewProps } from '../../../src/presentation/web/components/PhotoAlbum.tsx';
import { mediaProblemMessage } from '../../../src/presentation/web/media-view.ts';

const PET = '44444444-4444-4444-8444-444444444401';
const item = (n: number) => ({ id: `55555555-5555-4555-8555-5555555555${String(n).padStart(2, '0')}`, petId: PET, kind: 'PHOTO', mime: 'image/jpeg', sizeBytes: 100, originalName: `foto-${n}.jpg`, createdAt: '2026-11-17T10:00:00.000Z' }) as const;
const noop = (): void => undefined;

function view(overrides: Partial<PhotoAlbumViewProps> = {}): string {
  const items = Array.from({ length: 3 }, (_, i) => item(i + 1));
  const props: PhotoAlbumViewProps = {
    petName: 'Luna',
    items,
    urls: Object.fromEntries(items.map((i) => [i.id, `https://b.storage.googleapis.com/${i.id}?sig=1`])),
    page: 1,
    total: 3,
    status: 'READY',
    error: null,
    onPage: noop,
    onImageError: noop,
    limits: { photoCount: 7, maxPhotosPerPet: 10 },
    canUpload: true,
    canDelete: true,
    uploading: false,
    chosenName: null,
    confirmDeleteId: null,
    onChoose: noop,
    onUpload: noop,
    onAskDelete: noop,
    onConfirmDelete: noop,
    onCancelDelete: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(PhotoAlbumView, props));
}

describe('T726 contador «N de M fotos» desde getAlbumLimits (REQ-ALB5-005, SC-005-034)', () => {
  it('[SC-005-034] muestra «7 de 10 fotos» y, con el parámetro en 12, «7 de 12 fotos»; sin límites aún no muestra contador', () => {
    expect(view({ limits: { photoCount: 7, maxPhotosPerPet: 10 } })).toContain('7 de 10 fotos');
    expect(view({ limits: { photoCount: 7, maxPhotosPerPet: 12 } })).toContain('7 de 12 fotos');
    expect(view({ limits: null })).not.toMatch(/ de \d+ fotos/);
  });

  it('[SC-005-034] el componente no cablea la cifra 10 (el tope viene de getAlbumLimits)', () => {
    const source = readFileSync(new URL('../../../src/presentation/web/components/PhotoAlbum.tsx', import.meta.url), 'utf8');
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '').match(/\b10\b/g)).toBeNull();
  });
});

describe('T725 estado «Álbum lleno» con conteo (REQ-ALB5-002, REQ-ALB5-003, SC-005-002, SC-005-005)', () => {
  it('[SC-005-002] con 10 de 10 muestra «Álbum lleno» con el conteo, remite a «Historial / Archivos» y no ofrece subir', () => {
    const markup = view({ limits: { photoCount: 10, maxPhotosPerPet: 10 } });
    expect(markup).toContain('Álbum lleno');
    expect(markup).toContain('10 de 10 fotos');
    expect(markup).toContain('Historial / Archivos');
    expect(markup).not.toContain('type="file"');
  });

  it('[SC-005-005][EDGE-005-01] una mascota con 14 de 10 sigue marcada «Álbum lleno» (14 de 10 fotos) y conserva los botones de borrar', () => {
    const markup = view({ limits: { photoCount: 14, maxPhotosPerPet: 10 } });
    expect(markup).toContain('Álbum lleno');
    expect(markup).toContain('14 de 10 fotos');
    expect(markup).toContain('aria-label="Borrar foto-1.jpg"');
  });

  it('[REQ-ALB5-002] con 9 de 10 no dice «Álbum lleno» y permite subir', () => {
    const markup = view({ limits: { photoCount: 9, maxPhotosPerPet: 10 } });
    expect(markup).not.toContain('Álbum lleno');
    expect(markup).toContain('type="file"');
  });

  it('[REQ-ALB5-002][REQ-ALB5-005] el texto de ERR-MEDIA-ALBUM-LIMIT es el del catálogo incremental de la 005 (remite a Historial / Archivos)', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../../specs/005-album-archivos-clinicos/contracts/errors/error-catalog.json', import.meta.url), 'utf8')) as {
      errors: Record<string, { detailTemplate: string }>;
    };
    const text = mediaProblemMessage('ERR-MEDIA-ALBUM-LIMIT');
    expect(text).toBe(catalog.errors['ERR-MEDIA-ALBUM-LIMIT']!.detailTemplate);
    expect(text).toContain('Historial / Archivos');
  });
});

describe('T726 subir, ver y eliminar fotos (REQ-ALB5-001, REQ-ALB5-004; SC-005-001)', () => {
  it('[REQ-ALB5-001] el selector solo acepta JPEG, PNG y WebP (nunca PDF) y el botón «Subir» exige elegir una foto', () => {
    const markup = view();
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).not.toContain('application/pdf');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Subir<\/button>/);
    expect(view({ chosenName: 'perro.png' })).not.toMatch(/<button[^>]*disabled=""[^>]*>Subir<\/button>/);
  });

  it('[REQ-ALB5-001] subiendo, el botón dice «Subiendo…» y queda deshabilitado', () => {
    expect(view({ uploading: true, chosenName: 'perro.png' })).toMatch(/<button[^>]*disabled=""[^>]*>Subiendo…<\/button>/);
  });

  it('[REQ-ALB5-001] un lector (sin permisos) ve las fotos pero no el selector ni los botones de borrar', () => {
    const markup = view({ canUpload: false, canDelete: false });
    expect([markup.includes('type="file"'), markup.includes('Borrar foto-1.jpg')]).toEqual([false, false]);
    expect((markup.match(/<img /g) ?? []).length).toBe(3);
  });

  it('[REQ-ALB5-001] cada foto lleva «Borrar» y la confirmación pregunta antes de borrar; cada imagen mantiene loading="lazy"', () => {
    expect(view()).toContain('aria-label="Borrar foto-2.jpg"');
    const confirming = view({ confirmDeleteId: item(1).id });
    expect(confirming).toContain('¿Borrar «foto-1.jpg»?');
    expect(confirming).toContain('Sí, borrar');
    for (const tag of view().match(/<img [^>]*>/g) ?? []) expect(tag).toContain('loading="lazy"');
  });

  it('[REQ-ALB5-004] hasta el tope no hay paginación (10 fotos, una sola página)', () => {
    expect(view({ total: 10, limits: { photoCount: 10, maxPhotosPerPet: 10 } })).not.toContain('Páginas del álbum');
  });
});
