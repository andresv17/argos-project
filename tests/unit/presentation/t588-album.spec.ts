/**
 * T588 [US5] pantalla del álbum por mascota (REQ-ALB-001, INV-ALB-001, D-09, D-20 B, SC-ALM-021): cada imagen se carga completa con `loading="lazy"` (sin
 * miniaturas), 24 por página, orden del servidor, paginación y estados vacío/error. Render estático; el endpoint ya está probado en T587.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhotoAlbumView, type PhotoAlbumViewProps } from '../../../src/presentation/web/components/PhotoAlbum.tsx';
import { albumPageCount } from '../../../src/presentation/web/media-view.ts';

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
    ...overrides,
  };
  return renderToStaticMarkup(h(PhotoAlbumView, props));
}

describe('T588 álbum de fotos', () => {
  it('[SC-ALM-021][D-20 B] cada imagen del álbum lleva loading="lazy", la URL completa (sin miniatura) y un texto alternativo compuesto sin el nombre de archivo (T794 B4)', () => {
    const markup = view();
    const images = markup.match(/<img [^>]*>/g) ?? [];
    expect(images).toHaveLength(3);
    for (const tag of images) {
      expect(tag).toContain('loading="lazy"');
      expect(tag).toContain('decoding="async"');
      expect(tag).toMatch(/src="https:\/\/b\.storage\.googleapis\.com\//);
    }
    expect(markup).toContain('alt="Foto 1 de 3 de Luna, subida el 17 nov 2026"');
    expect(markup).not.toContain('alt="foto-1.jpg"');
  });

  it('[REQ-ALB-001] el título nombra la mascota y la paginación sigue el total de 24 por página (50 → 3 páginas)', () => {
    expect([albumPageCount(50), albumPageCount(24), albumPageCount(25), albumPageCount(0)]).toEqual([3, 1, 2, 1]);
    const markup = view({ total: 50, page: 2 });
    expect(markup).toContain('Álbum de Luna');
    expect(markup).toContain('Página 2 de 3');
    expect(markup).toContain('>Anterior</button>');
    expect(markup).toContain('>Siguiente</button>');
  });

  it('[REQ-ALB-001] sin fotos muestra «Aún no hay fotos» y sin imágenes; cargando y error son avisos accesibles', () => {
    const empty = view({ items: [], urls: {}, total: 0 });
    expect([empty.includes('Aún no hay fotos'), empty.includes('<img')]).toEqual([true, false]);
    expect(view({ status: 'LOADING', items: [], urls: {} })).toContain('role="status"');
    expect(view({ status: 'ERROR', error: 'No se pudo cargar el álbum.' })).toContain('role="alert"');
  });

  it('[INV-ALB-001] una imagen sin URL todavía no se renderiza (no se pide nada a ningún origen)', () => {
    const items = [item(1), item(2)];
    const markup = view({ items, urls: { [items[0]?.id ?? '']: 'https://b.storage.googleapis.com/a?sig=1' }, total: 2 });
    expect((markup.match(/<img /g) ?? []).length).toBe(1);
  });
});
