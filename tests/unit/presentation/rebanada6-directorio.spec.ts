import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetCardList, PetFilter } from '../../../src/presentation/web/components/PetCards.tsx';
import { OWNER_COLORS } from '../../../src/presentation/web/view-model.ts';
import { cardAs } from './rebanada6-fixtures.ts';

/** T284 — directorio de mascotas: filtros por especie (Todos, Perros, Gatos, Otros, Con alertas) y distinción visual del dueño (REQ-UI2-002, REQ-UI2-003). */
const noop = (): void => undefined;
const FILTER_LABELS: readonly string[] = ['Todos', 'Perros', 'Gatos', 'Otros', 'Con alertas sanitarias'];

describe('directorio de mascotas (T284)', () => {
  it('[REQ-UI2-002][REQ-PET2-002] los filtros del directorio son, en este orden, Todos, Perros, Gatos, Otros y Con alertas sanitarias', () => {
    const markup = renderToStaticMarkup(h(PetFilter, { q: '', species: '', onChange: noop }));
    const texts = [...markup.matchAll(/>([^<>]+)</g)].map((m) => (m[1] ?? '').trim());
    expect(texts.filter((t) => FILTER_LABELS.includes(t))).toEqual(FILTER_LABELS);
  });

  it('[REQ-UI2-003][INV-HOUSE-005] la tarjeta ajena en hogar muestra «Dueño: María» con el fondo de su colorToken y texto blanco; fuera de hogar, sin color', () => {
    const inHouse = renderToStaticMarkup(h(PetCardList, { cards: [cardAs('READER', 'p1', 'Luna', 'OWNER_COLOR_5')], activePetId: null, onSelect: noop }));
    const alone = renderToStaticMarkup(h(PetCardList, { cards: [cardAs('READER', 'p2', 'Kira', null)], activePetId: null, onSelect: noop }));
    expect([
      inHouse.includes('data-owner-badge="OWNER_COLOR_5"'),
      inHouse.includes(`background-color:${OWNER_COLORS.OWNER_COLOR_5};color:#ffffff`),
      inHouse.includes('Dueño: María'),
      inHouse.includes('Solo lectura'),
      alone.includes('data-owner-badge="none"'),
      alone.includes('background-color'),
    ]).toEqual([true, true, true, true, true, false]);
  });

  it('[REQ-UI2-003] el directorio mixto marca «Solo lectura» solo en la tarjeta del Lector, no en las del Cuidador ni del Administrador', () => {
    const cards = [cardAs('READER', 'p1', 'Luna'), cardAs('CAREGIVER', 'p2', 'Kira'), cardAs('ADMIN', 'p3', 'Nyx')];
    const markup = renderToStaticMarkup(h(PetCardList, { cards, activePetId: null, onSelect: noop }));
    const readOnlyPets = [...markup.matchAll(/data-pet-id="([^"]+)"[\s\S]*?<\/li>/g)].filter((m) => m[0].includes('Solo lectura')).map((m) => m[1]);
    expect(readOnlyPets).toEqual(['p1']);
  });
});
