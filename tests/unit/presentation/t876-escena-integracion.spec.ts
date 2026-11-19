/**
 * T876 (006, Fase 7): el bloque de escena en la vista «Hogar» (encabezado de cada tarjeta de hogar) y en «Mis mascotas» para el propietario sin hogar (D6-04 = A,
 * D6-05 = A, D6-09 = A), con foco visible, contraste AA y reflujo a 320 px. REQ-ESC6-019, REQ-ESC6-005; NFR-ESC6-004; SC-ESC6-014, SC-ESC6-015, SC-ESC6-029.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdCard } from '../../../src/presentation/web/pages/HouseholdsPage.tsx';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { household } from './presentation-fixtures.ts';
import { HOUSEHOLD_ID, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
const read = (path: string): string => readFileSync(path, 'utf8');

describe('T876 integración del bloque de escena (D6-04 = A)', () => {
  it('[REQ-ESC6-019] la tarjeta del hogar muestra la escena en su encabezado (antes de los miembros) cuando recibe el bloque', () => {
    const view = household('OWNER');
    const html = renderToStaticMarkup(h(HouseholdCard, { view, myUserId: 'u', onMemberAction: noop, onDelete: noop, inviteForm: null, sceneSlot: h('div', { id: 'escena-prueba' }, 'ESCENA') }));
    expect(html.indexOf('ESCENA')).toBeGreaterThan(-1);
    expect(html.indexOf('ESCENA')).toBeLessThan(html.indexOf('Miembros de'));
    expect(renderToStaticMarkup(h(HouseholdCard, { view, myUserId: 'u', onMemberAction: noop, onDelete: noop, inviteForm: null }))).not.toContain('ESCENA');
  });

  it('[D6-04 = A][D6-09 = A] HouseholdsPage monta la escena del hogar y «Mis mascotas» la del propietario sin hogar (/me) o la del hogar elegido', () => {
    const households = read('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(households).toMatch(/<HomeScene[^>]*kind: 'HOUSEHOLD'/);
    const pets = read('src/presentation/web/pages/PetsPage.tsx');
    expect(pets).toMatch(/<HomeScene[^>]*kind: 'OWNER'/);
    expect(pets).toMatch(/<HomeScene[^>]*kind: 'HOUSEHOLD'/);
  });

  it('[SC-ESC6-109][REQ-ESC6-019] «Mis mascotas» ya no condiciona la escena OWNER a la lista /pets (cards.length) y la vuelve a leer al cambiar la lista (reloadToken)', () => {
    const pets = read('src/presentation/web/pages/PetsPage.tsx');
    expect(pets).toMatch(/<HomeScene[^>]*kind: 'OWNER'[^>]*reloadToken=\{petsRevision\}/);
    expect(pets).not.toMatch(/cards\.length\s*>\s*0\s*\?\s*<HomeScene/);
    expect(pets.match(/setPetsRevision\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('[NFR-ESC6-004] cada bloque monta con su propio prefijo de ids (varios hogares en la misma página no repiten ids)', () => {
    const households = read('src/presentation/web/pages/HouseholdsPage.tsx');
    expect(households).toMatch(/idPrefix=\{`escena-\$\{view\.household\.id\}`\}/);
  });

  it('[NFR-ESC6-004] reflujo a 320 px: ni anchos fijos ni desbordes; la imagen y los botones se ajustan (min-w-0, max-w-full, flex-wrap)', () => {
    const html = renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'x', scope: { kind: 'HOUSEHOLD', householdId: HOUSEHOLD_ID }, view: sceneView({ pending: 1 }), status: 'READY', error: null, busy: false, onUpdate: noop, onRegenerate: noop }));
    expect(html).toContain('min-w-0');
    expect(html).toContain('max-w-full');
    expect(html).toContain('flex-wrap');
    expect(html).not.toMatch(/\b(w|min-w)-\[\d+px\]/);
    expect(html).not.toMatch(/\bw-(\d{3,}|\[)/);
  });

  it('[NFR-ESC6-004] contraste AA: el texto usa slate-900/800 sobre blanco y el aviso ámbar amber-950 sobre amber-50 (sin texto gris claro)', () => {
    const source = read('src/presentation/web/components/SceneBlock.tsx');
    expect(source).not.toMatch(/text-(slate|gray)-(300|400|500)\b/);
    expect(source).toContain('text-amber-950');
  });
});
