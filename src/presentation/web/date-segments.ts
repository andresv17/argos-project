/**
 * Lógica pura del campo de fecha por segmentos (feature 007, REQ-FEC7-002, REQ-FEC7-003, REQ-FEC7-005; ADR-007-01). Sin DOM, sin reloj y sin zona horaria:
 * dos funciones, una para la entrada tecleada (avance y retroceso) y otra para el análisis de texto (ISO o `DD/MM/AAAA` a segmentos). No valida el calendario
 * (29 de febrero, mes 13, día 00): la validación sigue siendo la del esquema del contrato (EDGE-007-001).
 *
 * @implements REQ-FEC7-002, REQ-FEC7-003, REQ-FEC7-005, EDGE-007-001
 */

export type SegmentName = 'day' | 'month' | 'year';

export interface DateSegments {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export const EMPTY_SEGMENTS: DateSegments = { day: '', month: '', year: '' };

/** Orden de los segmentos y su longitud máxima. */
export const SEGMENT_ORDER: readonly SegmentName[] = ['day', 'month', 'year'];
export const SEGMENT_LENGTH: Readonly<Record<SegmentName, number>> = { day: 2, month: 2, year: 4 };

/** Primer dígito a partir del cual el segmento ya no puede tener un segundo dígito válido (día 4..9, mes 2..9). */
const AUTO_PAD_FROM: Readonly<Record<'day' | 'month', number>> = { day: 4, month: 2 };

export type SegmentEvent =
  | { readonly kind: 'input'; readonly value: string; /** `true` si el evento de entrada fue un borrado (`inputType` `delete*`). */ readonly deleting?: boolean }
  | { readonly kind: 'backspace' };

export interface SegmentEditResult {
  readonly segments: DateSegments;
  /** Segmento al que debe pasar el foco; `null` si se queda donde está. */
  readonly focus: SegmentName | null;
  /** Valor `YYYY-MM-DD` con los tres segmentos completos; cadena vacía en cualquier otro caso. */
  readonly iso: string;
  /** `Backspace`: `true` si el componente debe impedir la acción por defecto (el retroceso lo resolvió esta función). */
  readonly consumed: boolean;
}

/** Valor ISO si los tres segmentos están completos (2, 2 y 4 dígitos); `''` si no. */
const isoOf = (segments: DateSegments): string =>
  segments.day.length === 2 && segments.month.length === 2 && segments.year.length === 4 ? `${segments.year}-${segments.month}-${segments.day}` : '';

const digitsOf = (text: string): string => text.replace(/\D/g, '');

const result = (segments: DateSegments, focus: SegmentName | null, consumed = false): SegmentEditResult => ({ segments, focus, iso: isoOf(segments), consumed });

/**
 * Aplica una edición a un segmento. `input`: solo dígitos, recortado al máximo del segmento; al teclear (no al borrar) pasa al siguiente segmento con 2 dígitos
 * o con un primer dígito de día 4..9 / mes 2..9 (se completa con cero). `backspace`: con el segmento vacío y no siendo el primero, el foco pasa al anterior y se
 * borra su último dígito; con el segmento no vacío, o siendo el primero, no se consume (el navegador borra un dígito sin mover el foco).
 */
export function applySegmentEdit(segments: DateSegments, segment: SegmentName, event: SegmentEvent): SegmentEditResult {
  const index = SEGMENT_ORDER.indexOf(segment);
  if (event.kind === 'backspace') {
    const previous = SEGMENT_ORDER[index - 1];
    if (segments[segment] !== '' || previous === undefined) return result(segments, null);
    return result({ ...segments, [previous]: segments[previous].slice(0, -1) }, previous, true);
  }
  const value = digitsOf(event.value).slice(0, SEGMENT_LENGTH[segment]);
  const next = { ...segments, [segment]: value };
  if (event.deleting === true || segment === 'year') return result(next, null);
  const following = SEGMENT_ORDER[index + 1] ?? null;
  if (value.length === 1 && Number(value) >= AUTO_PAD_FROM[segment]) return result({ ...segments, [segment]: `0${value}` }, following);
  return result(next, value.length === SEGMENT_LENGTH[segment] ? following : null);
}

const ISO_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY_TEXT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Reparte un texto pegado o un valor inicial: cadena vacía, `YYYY-MM-DD` o `DD/MM/AAAA` (se aceptan `D/M/AAAA`). Cualquier otro texto devuelve `null`. */
export function parseDateText(text: string): { readonly segments: DateSegments; readonly iso: string } | null {
  const trimmed = text.trim();
  if (trimmed === '') return { segments: EMPTY_SEGMENTS, iso: '' };
  const iso = ISO_TEXT.exec(trimmed);
  const dmy = DMY_TEXT.exec(trimmed);
  const parts = iso !== null ? { day: iso[3]!, month: iso[2]!, year: iso[1]! } : dmy !== null ? { day: dmy[1]!.padStart(2, '0'), month: dmy[2]!.padStart(2, '0'), year: dmy[3]! } : null;
  return parts === null ? null : { segments: parts, iso: isoOf(parts) };
}
