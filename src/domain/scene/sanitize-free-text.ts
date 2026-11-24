/**
 * Saneado de los textos libres que entran al prompt (INV-ESC6-011, H-TRI-006-04): normaliza NFKC, colapsa espacios y exige la LISTA BLANCA
 * `^[\p{L}\p{N} .'\-]{1,60}$` (sin `[ ] { } < > : ;`, comillas, acentos graves, controles Unicode, separadores de línea ni marcas bidi). Lo que no la supera se
 * omite (`null`) y el prompt usa el texto por defecto de `species`/`sex`. La lista de marcadores de instrucción es solo defensa secundaria. Pura (INV-ESC6-001).
 *
 * `sanitizeBiography` (enmienda 2026-11-24, INV-ESC6-010/017): biografía de la mascota saneada, determinista y pura; la única fuente es el servidor.
 *
 * @implements INV-ESC6-010, INV-ESC6-017, INV-ESC6-011, INV-ESC6-001, REQ-ESC6-016, SC-ESC6-024, SC-ESC6-082
 */

const WHITELIST = /^[\p{L}\p{N} .'\-]{1,60}$/u;
const INSTRUCTION_MARKERS = /\bignore\b|\bdisregard\b|instruction|system prompt|remove only|replace only|\badd:|keep the room|place all|\byou are\b|\bassistant\b/i;

export function sanitizeFreeText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.normalize('NFKC').replace(/[ ]{2,}/g, ' ').trim();
  if (!WHITELIST.test(text) || INSTRUCTION_MARKERS.test(text)) return null;
  return text;
}

/** Longitud máxima de la biografía saneada (0..280, REQ-BIO8-001). */
export const BIOGRAPHY_MAX_LENGTH = 280;

/** Categorías Unicode eliminadas: controles (Cc), formato (Cf, incluye marcas bidi y ancho cero), sustitutos (Cs), uso privado (Co), sin asignar (Cn), separadores de línea y párrafo (Zl, Zp). */
const BIOGRAPHY_STRIPPED = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu;
/** Delimitadores descartados: acento grave, `<`, `>`, `{`, `}`, `[`, `]`, `\`, `|` y comillas dobles (los de ancho completo ya los lleva NFKC a ASCII). */
const BIOGRAPHY_DELIMITERS = /[`<>{}[\]\\|"]/g;

/**
 * Biografía saneada para el prompt (REQ-ESC6-016, INV-ESC6-010/017 enmendados 2026-11-24): NFKC; saltos y tabuladores pasan a un espacio; se eliminan controles, formato,
 * sustitutos, uso privado, no asignados y separadores de línea/párrafo; se descartan los delimitadores; los espacios se colapsan; recorte a 280 caracteres; vacía o solo
 * espacios (o no cadena) → `null`. Idempotente. NO registrar su resultado en logs ni auditoría (REQ-ESC6-021).
 */
export function sanitizeBiography(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .normalize('NFKC')
    .replace(/[\t\n\r\v\f\u0085\u2028\u2029]/g, ' ')
    .replace(BIOGRAPHY_STRIPPED, '')
    .replace(BIOGRAPHY_DELIMITERS, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '') return null;
  const clipped = Array.from(text).slice(0, BIOGRAPHY_MAX_LENGTH).join('').trim();
  return clipped === '' ? null : clipped;
}
