/**
 * T794 [WCAG 2.1 AA] regresión de los bloqueantes B1..B4 del informe de `/sati` (`sati-T794-a11y-005.md`):
 * B1/B2 ids de campo y de título únicos entre el alta y varias ediciones abiertas (1.3.1, 4.1.2, 3.3.2);
 * B3 «Enlace creado» se anuncia (`role="status"`) y recibe el foco al montarse (4.1.3);
 * B4 el texto alternativo de la foto del álbum no es el nombre de archivo (1.1.1, diseño T705 §5.3 / H-3).
 * Render estático; el foco se comprueba con la referencia del `h4` (sin DOM).
 */
import { readFileSync } from 'node:fs';
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PhotoAlbumView, type PhotoAlbumViewProps } from '../../../src/presentation/web/components/PhotoAlbum.tsx';
import { RecordForm } from '../../../src/presentation/web/components/RecordForm.tsx';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { RECORD_MODULES } from '../../../src/presentation/web/records.ts';

const noop = (): void => undefined;
const asyncNoop = (): Promise<void> => Promise.resolve();

function idsOf(markup: string): string[] {
  return [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
}
function duplicates(values: readonly string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) !== i);
}

describe('T794 B1/B2 ids únicos entre alta y ediciones (1.3.1, 4.1.2, 3.3.2)', () => {
  for (const module of ['weights', 'customParameters'] as const) {
    const spec = RECORD_MODULES.find((m) => m.id === module)!;
    const edit = (n: number) => h(RecordForm, { key: n, spec: { ...spec, formTitle: `Editar ${n}` }, onSubmit: asyncNoop, onCancel: noop, mode: 'edit' } as never);
    const tree = h('div', null, h(RecordForm, { spec, onSubmit: asyncNoop }), edit(1), edit(2));
    const markup = renderToStaticMarkup(tree);

    it(`[B1][B2] ${module}: ningún id se repite con el alta y dos ediciones abiertas`, () => {
      expect(duplicates(idsOf(markup))).toEqual([]);
    });

    it(`[B1][B2] ${module}: cada label for y aria-labelledby apunta a exactamente un elemento`, () => {
      const ids = idsOf(markup);
      const refs = [...markup.matchAll(/(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)].map((m) => m[1]!);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(ids.filter((id) => id === ref)).toHaveLength(1);
    });
  }

  it('[B1][B2] el alta conserva sus ids (form-weights-title, weights-recordedAt) y la edición lleva el sufijo -edit-', () => {
    const spec = RECORD_MODULES.find((m) => m.id === 'weights')!;
    const create = renderToStaticMarkup(h(RecordForm, { spec, onSubmit: asyncNoop }));
    expect(create).toContain('id="form-weights-title"');
    expect(create).toContain('id="weights-recordedAt"');
    const edit = renderToStaticMarkup(h(RecordForm, { spec, onSubmit: asyncNoop, onCancel: noop, mode: 'edit' } as never));
    expect(edit).toMatch(/id="form-weights-edit-[^"]+-title"/);
    expect(edit).not.toContain('id="weights-recordedAt"');
  });

  it('[B1] RecordActions monta el formulario de edición con mode="edit"', () => {
    expect(readFileSync('src/presentation/web/components/RecordActions.tsx', 'utf8')).toMatch(/<RecordForm[^>]*\bmode="edit"/);
  });
});

const created = { url: 'https://argos.example/s/TOKEN-UNICO-123', scopeLabel: 'Luna', expiresAt: '2026-11-25T12:00:00.000Z', includeMicrochip: false, includeClinicalFiles: false };
function shareProps(): ShareLinksViewProps {
  return {
    petName: 'Luna', household: null, now: '2026-11-18T12:00:00.000Z', scope: 'PET', expiresInDays: 7, includeMicrochip: false, includeClinicalFiles: false,
    busy: false, error: null, created, copyStatus: 'IDLE', list: { items: [], activeCount: 0, maxActiveLinks: 20 }, confirmRevokeId: null, notice: null,
    onScope: noop, onExpiry: noop, onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop,
    onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop,
  } as ShareLinksViewProps;
}
function find(node: ReactNode, test: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child as ReactNode, test);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<Record<string, unknown>>;
  return test(el) ? el : find(el.props['children'] as ReactNode, test);
}

describe('T794 B3 «Enlace creado» se anuncia y recibe el foco (4.1.3)', () => {
  it('[B3] el bloque del resultado es role="status" y contiene el título «Enlace creado»', () => {
    const tree = ShareLinksView(shareProps());
    const block = find(tree, (el) => el.props['role'] === 'status' && find(el.props['children'] as ReactNode, (c) => c.props['id'] === 'share-created-title') !== null);
    expect(block?.type).toBe('div');
  });

  it('[B3] el h4 enfoca al montarse mediante una referencia estable', () => {
    const first = find(ShareLinksView(shareProps()), (el) => el.props['id'] === 'share-created-title');
    const again = find(ShareLinksView(shareProps()), (el) => el.props['id'] === 'share-created-title');
    const ref = (first as unknown as { ref: ((el: { focus: () => void } | null) => void) | null }).ref;
    expect(typeof ref).toBe('function');
    expect(ref).toBe((again as unknown as { ref: unknown }).ref);
    const focus = vi.fn();
    ref!({ focus });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(() => ref!(null)).not.toThrow();
  });

  it('[B3] la URL se muestra una sola vez y sin creación no hay bloque de estado del resultado', () => {
    const markup = renderToStaticMarkup(h(ShareLinksView, shareProps()));
    expect(markup.split(created.url)).toHaveLength(2);
    expect(markup).toContain('Enlace creado');
    expect(renderToStaticMarkup(h(ShareLinksView, { ...shareProps(), created: null }))).not.toContain('Enlace creado');
  });
});

describe('T794 B4 texto alternativo de la foto del álbum (1.1.1)', () => {
  const item = (n: number) => ({ id: `55555555-5555-4555-8555-5555555555${String(n).padStart(2, '0')}`, petId: 'p', kind: 'PHOTO', mime: 'image/jpeg', sizeBytes: 100, originalName: `IMG_2231-${n}.jpg`, createdAt: '2026-11-12T10:00:00.000Z' }) as const;
  function album(over: Partial<PhotoAlbumViewProps> = {}): string {
    const items = [1, 2, 3].map(item);
    return renderToStaticMarkup(h(PhotoAlbumView, { petName: 'Luna', items, urls: Object.fromEntries(items.map((i) => [i.id, `https://b.example/${i.id}`])), page: 1, total: 3, status: 'READY', error: null, onPage: noop, onImageError: noop, ...over }));
  }

  it('[B4] alt = «Foto {n} de {total} de {mascota}, subida el {fecha}» sin el nombre de archivo', () => {
    const images = album().match(/<img [^>]*>/g) ?? [];
    expect(images.map((t) => /alt="([^"]*)"/.exec(t)?.[1])).toEqual([
      'Foto 1 de 3 de Luna, subida el 12 nov 2026',
      'Foto 2 de 3 de Luna, subida el 12 nov 2026',
      'Foto 3 de 3 de Luna, subida el 12 nov 2026',
    ]);
    for (const tag of images) expect(tag).not.toContain('IMG_2231');
  });

  it('[B4] en la página 2 la numeración continúa (24 por página) y el total es el del álbum', () => {
    const images = album({ page: 2, total: 50 }).match(/<img [^>]*>/g) ?? [];
    expect(/alt="([^"]*)"/.exec(images[0]!)?.[1]).toBe('Foto 25 de 50 de Luna, subida el 12 nov 2026');
  });
});
