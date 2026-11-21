/**
 * T1191 (008, bloque J, `[GH:#24]`) combobox de colaboradores: prefijo mínimo de 3 sin consulta, descarte de respuestas obsoletas (solo se pinta la última), teclado,
 * anuncios para lectores de pantalla, mensaje neutro D8-11 y marcado accesible (roles `combobox` y `listbox`, objetivos de 44 px). Render estático
 * (`renderToStaticMarkup`) y reductor puro; el recorrido con navegador real es el E2E T1192 y la revisión visual de `/sati` va aparte.
 * REQ-INV8-001, REQ-INV8-005, NFR-008-002, EDGE-008-047; SC-008-054.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InviteeComboboxView } from '../../../src/presentation/web/components/InviteeCombobox.tsx';
import {
  INITIAL_INVITEE_STATE,
  INVITEE_EMPTY_MESSAGE,
  canSearchInvitees,
  inviteeAnnouncement,
  inviteeReducer,
  type InviteeAction,
  type InviteeState,
} from '../../../src/presentation/web/invitee-search.ts';
import { SEARCH_DEBOUNCE_MS } from '../../../src/presentation/web/use-debounced-value.ts';

const run = (actions: readonly InviteeAction[], from: InviteeState = INITIAL_INVITEE_STATE): InviteeState => actions.reduce(inviteeReducer, from);
const noop = (): void => undefined;
const view = (state: InviteeState): string =>
  renderToStaticMarkup(h(InviteeComboboxView, { id: 'invite-h1', label: 'Invitar por usuario', name: 'username', errors: {}, state, onType: noop, onKey: () => false, onPick: noop }));
const ready = (items: readonly string[], query = 'ped'): InviteeState => run([{ type: 'TYPE', query }, { type: 'REQUEST', requestId: 1 }, { type: 'RESULTS', requestId: 1, items }]);

describe('reglas del combobox de colaboradores (T1191)', () => {
  it('[REQ-INV8-001][REQ-INV8-005][SC-008-054] con 2 caracteres no hay consulta ni lista; con 3 se puede consultar; la espera es de 300 ms', () => {
    expect([canSearchInvitees('pe'), canSearchInvitees('  pe '), canSearchInvitees('ped'), canSearchInvitees('pe d'), SEARCH_DEBOUNCE_MS]).toEqual([false, false, true, true, 300]);
    const short = run([{ type: 'TYPE', query: 'pe' }]);
    expect([short.status, short.open, short.items]).toEqual(['idle', false, []]);
  });

  it('[REQ-INV8-005][EDGE-008-047] una respuesta de una consulta anterior se descarta: solo se pinta la última', () => {
    const typed = run([{ type: 'TYPE', query: 'ped' }, { type: 'REQUEST', requestId: 1 }, { type: 'TYPE', query: 'pedr' }, { type: 'REQUEST', requestId: 2 }]);
    const late = inviteeReducer(typed, { type: 'RESULTS', requestId: 1, items: ['pedro.viejo'] });
    expect([late.status, late.items]).toEqual(['loading', []]);
    const fresh = inviteeReducer(late, { type: 'RESULTS', requestId: 2, items: ['pedro.a'] });
    expect([fresh.status, fresh.items]).toEqual(['ready', ['pedro.a']]);
    expect(inviteeReducer(fresh, { type: 'RESULTS', requestId: 1, items: ['pedro.viejo'] })).toBe(fresh);
    expect(inviteeReducer(typed, { type: 'FAILED', requestId: 1, rateLimited: true })).toBe(typed); // un fallo obsoleto tampoco pinta nada
  });

  it('[REQ-INV8-005][SC-008-054] el teclado recorre las sugerencias con las flechas (circular), Escape cierra y elegir deja el username en el campo', () => {
    const base = ready(['pedro.a', 'pedro.b', 'pedro.c']);
    const down = { type: 'KEY', key: 'ArrowDown' } as const;
    const indexes = [run([down], base), run([{ type: 'KEY', key: 'ArrowUp' }], base), run([down, down, down, down], base)].map((s) => s.activeIndex);
    expect(indexes).toEqual([0, 2, 0]);
    expect(run([down, { type: 'KEY', key: 'Escape' }], base)).toMatchObject({ open: false, activeIndex: -1 });
    const picked = run([down, down, { type: 'PICK' }], base);
    expect([picked.query, picked.open, picked.items]).toEqual(['pedro.b', false, []]);
    expect(inviteeReducer(base, { type: 'PICK' })).toBe(base); // sin opción activa no elige nada
  });

  it('[REQ-INV8-005][NFR-008-002][SC-008-054] los anuncios: cantidad de resultados, buscando, mensaje neutro D8-11, tasa y fallo', () => {
    expect(inviteeAnnouncement(ready(['a1b', 'a2b']))).toBe('2 usuarios disponibles. Usa las flechas para elegir.');
    expect(inviteeAnnouncement(ready(['a1b']))).toBe('1 usuario disponible. Usa las flechas para elegir.');
    expect(inviteeAnnouncement(ready([]))).toBe('No se encontraron usuarios disponibles para invitar.');
    expect(INVITEE_EMPTY_MESSAGE).toBe('No se encontraron usuarios disponibles para invitar.');
    expect(inviteeAnnouncement(run([{ type: 'TYPE', query: 'ped' }, { type: 'REQUEST', requestId: 1 }]))).toBe('Buscando usuarios.');
    expect(inviteeAnnouncement(run([{ type: 'TYPE', query: 'ped' }, { type: 'REQUEST', requestId: 1 }, { type: 'FAILED', requestId: 1, rateLimited: true }]))).toMatch(/muchas búsquedas/);
    expect(inviteeAnnouncement(run([{ type: 'TYPE', query: 'ped' }, { type: 'REQUEST', requestId: 1 }, { type: 'FAILED', requestId: 1, rateLimited: false }]))).toMatch(/No se pudo buscar/);
  });
});

describe('marcado accesible del combobox (T1191)', () => {
  it('[REQ-INV8-005][NFR-008-002][SC-008-054] el campo es un combobox con lista asociada, región de estado y etiqueta; cerrado no muestra la lista', () => {
    const markup = view(INITIAL_INVITEE_STATE);
    expect(markup).toMatch(/<label[^>]*for="invite-h1"[^>]*>Invitar por usuario/);
    expect(markup).toMatch(/<input[^>]*role="combobox"/);
    expect(markup).toMatch(/<input[^>]*aria-autocomplete="list"[^>]*aria-expanded="false"[^>]*aria-controls="invite-h1-listbox"/);
    expect(markup).toMatch(/<ul[^>]*id="invite-h1-listbox"[^>]*role="listbox"[^>]*hidden/);
    expect(markup).toMatch(/<p[^>]*id="invite-h1-status"[^>]*role="status"[^>]*aria-live="polite"/);
  });

  it('[REQ-INV8-005][NFR-008-002][SC-008-054] abierto lista las opciones con role option, la activa se marca y se apunta con aria-activedescendant; cada opción mide al menos 44 px', () => {
    const down = { type: 'KEY', key: 'ArrowDown' } as const;
    const markup = view(run([down, down], ready(['pedro.a', 'pedro.b'])));
    expect(markup).toMatch(/aria-expanded="true"/);
    expect(markup).toMatch(/aria-activedescendant="invite-h1-option-1"/);
    expect(markup).toMatch(/<li[^>]*id="invite-h1-option-0"[^>]*role="option"[^>]*aria-selected="false"[^>]*min-h-11[^>]*>pedro\.a/);
    expect(markup).toMatch(/<li[^>]*id="invite-h1-option-1"[^>]*role="option"[^>]*aria-selected="true"[^>]*>pedro\.b/);
    expect(markup).not.toMatch(/<ul[^>]*hidden/);
    expect(markup).toMatch(/>2 usuarios disponibles\./);
  });

  it('[REQ-INV8-005][SC-008-054] sin coincidencias muestra el mensaje fijo D8-11 visible y sin lista; nunca dice que el usuario no existe', () => {
    const markup = view(ready([]));
    expect(markup).toContain('No se encontraron usuarios disponibles para invitar.');
    expect(markup).toMatch(/<ul[^>]*hidden/);
    expect(markup).not.toMatch(/no existe/i);
    expect(markup).toMatch(/aria-expanded="false"/);
  });
});
