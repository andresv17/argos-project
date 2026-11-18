/**
 * Saneado de los textos libres que entran al prompt (INV-ESC6-011, H-TRI-006-04): normaliza NFKC, colapsa espacios y exige la LISTA BLANCA
 * `^[\p{L}\p{N} .'\-]{1,60}$` (sin `[ ] { } < > : ;`, comillas, acentos graves, controles Unicode, separadores de línea ni marcas bidi). Lo que no la supera se
 * omite (`null`) y el prompt usa el texto por defecto de `species`/`sex`. La lista de marcadores de instrucción es solo defensa secundaria. Pura (INV-ESC6-001).
 *
 * @implements INV-ESC6-011, INV-ESC6-001, REQ-ESC6-016, SC-ESC6-024, SC-ESC6-082
 */

const WHITELIST = /^[\p{L}\p{N} .'\-]{1,60}$/u;
const INSTRUCTION_MARKERS = /\bignore\b|\bdisregard\b|instruction|system prompt|remove only|replace only|\badd:|keep the room|place all|\byou are\b|\bassistant\b/i;

export function sanitizeFreeText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.normalize('NFKC').replace(/[ ]{2,}/g, ' ').trim();
  if (!WHITELIST.test(text) || INSTRUCTION_MARKERS.test(text)) return null;
  return text;
}
