/**
 * Estado y reglas del combobox de colaboradores (feature 008, `[GH:#24]`, T1191): prefijo mínimo de 3 caracteres, espera de 300 ms sin teclear (la aplica
 * `useDebouncedValue`), descarte de respuestas obsoletas por número de petición (solo se pinta la última, EDGE-008-047), teclado (flechas, Enter, Escape) y los
 * anuncios para lectores de pantalla. Es lógica pura: no toca el DOM ni la red; el componente `InviteeCombobox` la conecta con la API generada.
 *
 * @implements REQ-INV8-001, REQ-INV8-005, NFR-008-002, EDGE-008-047
 */

export const INVITEE_MIN_CHARS = 3;
/** Mensaje neutro fijado por Neo para «sin coincidencias» (D8-11): no distingue entre «no existe» y «no disponible». */
export const INVITEE_EMPTY_MESSAGE = 'No se encontraron usuarios disponibles para invitar.';
export const INVITEE_RATE_LIMITED_MESSAGE = 'Hiciste muchas búsquedas seguidas. Espera un momento e inténtalo de nuevo.';
export const INVITEE_FAILED_MESSAGE = 'No se pudo buscar usuarios en este momento.';

export type InviteeStatus = 'idle' | 'loading' | 'ready' | 'rate-limited' | 'failed';

export interface InviteeState {
  readonly query: string;
  readonly status: InviteeStatus;
  readonly items: readonly string[];
  readonly activeIndex: number;
  readonly open: boolean;
  /** Número de la última petición emitida; una respuesta con otro número es obsoleta y se descarta. */
  readonly latest: number;
}

export type InviteeAction =
  | { readonly type: 'TYPE'; readonly query: string }
  | { readonly type: 'REQUEST'; readonly requestId: number }
  | { readonly type: 'RESULTS'; readonly requestId: number; readonly items: readonly string[] }
  | { readonly type: 'FAILED'; readonly requestId: number; readonly rateLimited: boolean }
  | { readonly type: 'KEY'; readonly key: string }
  | { readonly type: 'PICK' }
  | { readonly type: 'CLOSE' };

export const INITIAL_INVITEE_STATE: InviteeState = { query: '', status: 'idle', items: [], activeIndex: -1, open: false, latest: 0 };

/** Con menos de 3 caracteres (recortados) no se consulta nada. */
export const canSearchInvitees = (query: string): boolean => query.trim().length >= INVITEE_MIN_CHARS;

export function inviteeReducer(state: InviteeState, action: InviteeAction): InviteeState {
  switch (action.type) {
    case 'TYPE':
      // Escribir invalida las respuestas en vuelo: sube `latest` para que ninguna anterior se pinte (EDGE-008-047).
      return canSearchInvitees(action.query)
        ? { ...state, query: action.query, latest: state.latest + 1, activeIndex: -1 }
        : { ...INITIAL_INVITEE_STATE, query: action.query, latest: state.latest + 1 };
    case 'REQUEST':
      return action.requestId === state.latest ? { ...state, status: 'loading', open: true } : state;
    case 'RESULTS':
      return action.requestId === state.latest ? { ...state, status: 'ready', items: action.items, activeIndex: -1, open: true } : state;
    case 'FAILED':
      return action.requestId === state.latest ? { ...state, status: action.rateLimited ? 'rate-limited' : 'failed', items: [], activeIndex: -1, open: true } : state;
    case 'KEY': {
      const count = state.items.length;
      if (action.key === 'Escape') return { ...state, open: false, activeIndex: -1 };
      if (count === 0 || state.status !== 'ready') return state;
      if (action.key === 'ArrowDown') return { ...state, open: true, activeIndex: state.activeIndex + 1 >= count ? 0 : state.activeIndex + 1 };
      if (action.key === 'ArrowUp') return { ...state, open: true, activeIndex: state.activeIndex <= 0 ? count - 1 : state.activeIndex - 1 };
      return state;
    }
    case 'PICK':
      return state.activeIndex < 0 ? state : { ...state, query: state.items[state.activeIndex]!, open: false, activeIndex: -1, items: [], status: 'idle', latest: state.latest + 1 };
    case 'CLOSE':
      return { ...state, open: false, activeIndex: -1 };
  }
}

/** Texto del anuncio para lectores de pantalla (región `status` con `aria-live`). */
export function inviteeAnnouncement(state: InviteeState): string {
  if (!state.open) return '';
  if (state.status === 'loading') return 'Buscando usuarios.';
  if (state.status === 'rate-limited') return INVITEE_RATE_LIMITED_MESSAGE;
  if (state.status === 'failed') return INVITEE_FAILED_MESSAGE;
  if (state.status !== 'ready') return '';
  if (state.items.length === 0) return INVITEE_EMPTY_MESSAGE;
  return state.items.length === 1 ? '1 usuario disponible. Usa las flechas para elegir.' : `${state.items.length} usuarios disponibles. Usa las flechas para elegir.`;
}

export const inviteeOptionId = (baseId: string, index: number): string => `${baseId}-option-${index}`;
