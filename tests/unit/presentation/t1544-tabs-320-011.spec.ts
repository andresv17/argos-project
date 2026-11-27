/**
 * TECHDEBT-011-ALB-TAB320 (011): a 320 px la barra de pestañas del hogar no recorta «Álbum». La barra parte en filas (flex-wrap), sin scroll interno,
 * y cada pestaña conserva su texto en una línea (whitespace-nowrap) con altura táctil mínima.
 *
 * @implements REQ-HOG11-001, NFR-011-001
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdTabs } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';

const markup = renderToStaticMarkup(h(HouseholdTabs, { householdId: 'h1', active: 'album', onSelect: () => undefined }));

describe('HouseholdTabs a 320 px (TECHDEBT-011-ALB-TAB320)', () => {
  it('la barra se parte en filas y no usa scroll interno que recorte pestañas', () => {
    const tablist = markup.match(/<div role="tablist"[^>]*>/)?.[0] ?? '';
    expect(tablist).toContain('flex-wrap');
    expect(tablist).not.toContain('overflow-x-auto');
    expect(tablist).not.toContain('overflow-hidden');
  });
  it('«Álbum» sigue presente, con su texto en una sola línea y altura táctil', () => {
    expect(markup).toMatch(/aria-selected="true"[^>]*>Álbum</);
    const tabs = markup.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(tabs).toHaveLength(6);
    for (const t of tabs) {
      expect(t).toContain('whitespace-nowrap');
      expect(t).toContain('min-h-12');
      expect(t).toContain('px-3');
    }
  });
});
