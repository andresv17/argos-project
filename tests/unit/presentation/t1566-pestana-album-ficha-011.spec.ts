/**
 * T1566 (011, [GH:#64]): pestaña propia «Álbum» en la ficha de mascota. REQ-PET11-002; SC-011-064.
 * @implements REQ-PET11-002 SC-011-064
 * «Álbum» va al final, tras «Historial / Archivos» y «Compartir»; existe solo con `albumSlot` (la página lo pasa a quien puede leer la mascota) y fuera de la edición;
 * «Historial / Archivos» conserva solo `mediaSlot` (ClinicalFilesPanel, sin enlace ni panel del álbum). Sin jsdom: `renderToStaticMarkup` e inspección de fuentes.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { nextFocusIndex } from '../../../src/presentation/web/view-model.ts';
import { dashboard } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const MEDIA = h('p', null, 'RANURA-ARCHIVOS');
const ALBUM = h('p', null, 'RANURA-ALBUM');
const SHARE = h('p', null, 'RANURA-COMPARTIR');
const ORDER = ['Peso', 'Medidas', 'Vacunas', 'Desparasitación', 'Consultas', 'Parámetros', 'Historial / Archivos', 'Compartir', 'Álbum'];
const DASH = readFileSync('src/presentation/web/components/PetDashboard.tsx', 'utf8');
const PAGE = readFileSync('src/presentation/web/pages/PetsPage.tsx', 'utf8');
const render = (activeTab: string, extra: Record<string, unknown> = {}, role: 'OWNER' | 'ADMIN' | 'READER' = 'OWNER'): string =>
  renderToStaticMarkup(h(PetDashboard, { dashboard: dashboard(role), activeTab, onTabChange: noop, onAddRecord: async () => undefined, onEdit: noop, onDelete: noop, mediaSlot: MEDIA, albumSlot: ALBUM, shareSlot: SHARE, ...extra } as never));
const tabs = (markup: string): string[] => [...markup.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]!);
const tabpanel = (markup: string): string => /<section[^>]*role="tabpanel".*?<\/section>/s.exec(markup)?.[0] ?? '';

describe('T1566 pestaña Álbum (REQ-PET11-002; SC-011-064)', () => {
  it('[SC-011-064] OWNER/ADMIN con albumSlot y shareSlot ven 9 pestañas: «Compartir» tras «Historial / Archivos» y «Álbum» al final', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) expect(tabs(render('weights', {}, role))).toEqual(ORDER);
  });

  it('[SC-011-064] un rol de solo lectura (sin shareSlot) con albumSlot ve «Álbum» como última pestaña (8), sin «Compartir»', () => {
    expect(tabs(render('weights', { shareSlot: undefined }, 'READER'))).toEqual(ORDER.filter((l) => l !== 'Compartir'));
  });

  it('[SC-011-064] sin albumSlot (sin permiso de lectura) no hay pestaña «Álbum»', () => {
    const markup = render('weights', { albumSlot: undefined });
    expect(tabs(markup)).toEqual(ORDER.filter((l) => l !== 'Álbum'));
    expect(markup).not.toContain('Álbum');
  });

  it('[SC-011-064] en modo edición (editSlot) no hay pestaña «Álbum»', () => {
    const markup = render('weights', { editSlot: h('p', null, 'FORM') });
    expect(tabs(markup)).toEqual(ORDER.slice(0, 6));
    expect(markup).not.toContain('Álbum');
  });

  it('[SC-011-064] con album activa el tabpanel enlaza con su pestaña y contiene solo albumSlot', () => {
    const markup = render('album');
    const panel = tabpanel(markup);
    expect(panel).toContain('id="module-panel-album"');
    expect(panel).toContain('aria-labelledby="module-tab-album"');
    expect(panel).toContain('RANURA-ALBUM');
    expect(panel).not.toContain('RANURA-ARCHIVOS');
    expect(panel).not.toContain('RANURA-COMPARTIR');
    expect(/id="module-tab-album"[^>]*aria-selected="true"/.test(markup)).toBe(true);
    expect(/id="module-tab-album"[^>]*aria-controls="module-panel-album"/.test(markup)).toBe(true);
  });

  it('[SC-011-064] «Historial / Archivos» solo trae mediaSlot, sin la ranura ni el texto del álbum', () => {
    const panel = tabpanel(render('history'));
    expect(panel).toContain('RANURA-ARCHIVOS');
    expect(panel).not.toContain('RANURA-ALBUM');
  });

  it('[SC-011-064] si album está activa sin pestaña (sin albumSlot o en edición) se muestra Peso, no un panel vacío', () => {
    for (const extra of [{ albumSlot: undefined }, { editSlot: h('p', null, 'FORM') }]) {
      const markup = render('album', extra);
      expect(markup).toContain('id="module-panel-weights"');
      expect(markup).not.toContain('module-panel-album');
    }
  });

  it('[SC-011-064] el teclado recorre las 9 pestañas con vuelta circular', () => {
    expect(nextFocusIndex('End', 0, 9)).toBe(8);
    expect(nextFocusIndex('Home', 8, 9)).toBe(0);
    expect(nextFocusIndex('ArrowRight', 8, 9)).toBe(0);
    expect(nextFocusIndex('ArrowLeft', 0, 9)).toBe(8);
    expect(DASH).toMatch(/nextFocusIndex\(event\.key, index, tabs\.length\)/);
  });
});

describe('T1566 PetsPage: el álbum sale de mediaSlot y va en albumSlot (REQ-PET11-002)', () => {
  const mediaStart = PAGE.indexOf('mediaSlot={');
  const albumStart = PAGE.indexOf('albumSlot=');
  const media = PAGE.slice(mediaStart, albumStart > mediaStart ? albumStart : mediaStart + 800);
  const album = PAGE.slice(albumStart, albumStart + 900);

  it('[SC-011-064] mediaSlot contiene solo ClinicalFilesPanel: sin enlace «Ver el álbum de fotos» ni /album ni PhotoAlbum', () => {
    expect(mediaStart).toBeGreaterThan(0);
    expect(albumStart).toBeGreaterThan(mediaStart);
    expect(media).toContain('ClinicalFilesPanel');
    expect(media).not.toContain('Ver el álbum de fotos');
    expect(media).not.toContain('/album');
    expect(media).not.toContain('PhotoAlbum');
  });

  it('[SC-011-064] albumSlot monta PhotoAlbum de la mascota con los permisos de la matriz, sin condicionarlo a escritura', () => {
    expect(albumStart).toBeGreaterThan(0);
    expect(album).toContain('<PhotoAlbum');
    expect(album).toContain('petId={dashboard.profile.id}');
    expect(album).toContain('canUpload={dashboard.permissions.writeHealthEvents}');
    expect(album).toContain('canDelete={dashboard.permissions.deleteHealthEvents}');
    expect(album).toContain('embedded');
  });
});
