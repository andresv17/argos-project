/**
 * Sanitización del Markdown de «Acerca de» en el SERVIDOR (feature 010, Bloque E, T1430; D10-07, EDGE-010-007, EDGE-010-011). Función pura y sin dependencias.
 * Se conserva el Markdown básico (títulos, énfasis, listas, enlaces `https`, `http`, `mailto`, rutas propias y anclas) y se elimina todo lo demás:
 *  - HTML: toda etiqueta (`<x`, `</x`, `<!`, `<?`) y, completo, el contenido de `script`, `style` e `iframe`; un `<` que no abre una etiqueta (`5 < 10`) se conserva.
 *  - Enlaces con destino fuera de la lista cerrada (`javascript:`, `vbscript:`, `data:`, `//host`, con espacios, tabuladores, controles o entidades): se conserva solo el texto.
 *  - Imágenes (`![alt](url)`, por referencia y las que quedan sueltas) y definiciones de referencia (`[r]: url`): se conserva solo el texto alternativo.
 * Es idempotente: sanitizar el resultado no lo cambia. El tope de 20 000 caracteres (`ABOUT_BODY_MAX_CHARS`, EDGE-010-011) lo aplica el caso de uso ANTES de sanitizar.
 *
 * @implements REQ-ACE10-001, REQ-ACE10-003, EDGE-010-007, EDGE-010-011, D10-07, INV-ARCH-004
 */

/** Tope de `body_markdown` en caracteres (APPROVED por Neo 2026-11-24, `EDGE-010-011`). */
export const ABOUT_BODY_MAX_CHARS = 20_000;
/** Tope del texto alternativo de la foto (`about.schema.json` AboutPhotoAlt). */
export const ABOUT_PHOTO_ALT_MAX_CHARS = 300;

const MAX_PASSES = 8;
const BLOCK_ELEMENTS = /<\s*(script|style|iframe)\b[^>]*>[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi;
const TAG = /<\s*\/?\s*[a-z!?][^>\n]*>?/gi;
const REFERENCE_DEFINITION = /^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*$/gm;
const IMAGE_BY_REFERENCE = /!\[([^\]\n]*)\]\[[^\]\n]*\]/g;
const LINK_BY_REFERENCE = /\[([^\]\n]+)\]\[[^\]\n]*\]/g;
const SAFE_DESTINATION = /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|\/(?![\/\\])[^\s]*|#[^\s]*)$/i;
const UNSAFE_CHARS = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/;
const ENTITY = /&#?[0-9a-z]+;/i;
const SCHEME_LEFTOVER = /(java|vb)(\s*)script(\s*):/gi;
const DATA_LEFTOVER = /\bdata(\s*):(\s*)(text|image)/gi;

/** Destino de un enlace o imagen que empieza en `from` (justo tras `](`): devuelve el texto bruto del destino y el índice posterior al `)` de cierre, o `null` si no cierra. */
function scanDestination(source: string, from: number): { readonly raw: string; readonly end: number } | null {
  let index = from;
  while (index < source.length && (source[index] === ' ' || source[index] === '\t')) index += 1;
  const start = index;
  let raw: string;
  if (source[index] === '<') {
    const close = source.indexOf('>', index + 1);
    if (close < 0 || source.slice(index + 1, close).includes('\n')) return null;
    raw = source.slice(index + 1, close);
    index = close + 1;
  } else {
    let depth = 0;
    while (index < source.length) {
      const ch = source[index]!;
      if (ch === '\n') return null;
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        if (depth === 0) break;
        depth -= 1;
      } else if ((ch === ' ' || ch === '\t') && depth === 0) break;
      index += 1;
    }
    raw = source.slice(start, index);
  }
  // Título opcional `"..."` (se descarta) y cierre `)`.
  const title = /^[ \t]+(?:"[^"\n]*"|'[^'\n]*')?[ \t]*\)/.exec(source.slice(index));
  if (title !== null) return { raw, end: index + title[0].length };
  const bare = /^[ \t]*\)/.exec(source.slice(index));
  return bare === null ? null : { raw, end: index + bare[0].length };
}

/** Cierre laxo: un `](...)` cuyo destino no sigue la gramática (p. ej. con un tabulador interno) se trata igualmente como enlace y, al tener caracteres no permitidos, se descarta. */
function scanLoose(source: string, from: number): { readonly raw: string; readonly end: number } | null {
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const ch = source[index]!;
    if (ch === '\n') return null;
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      if (depth === 0) return { raw: source.slice(from, index), end: index + 1 };
      depth -= 1;
    }
  }
  return null;
}

/** Destino seguro y canónico, o `null` si hay que descartar el enlace (falla cerrado ante controles, espacios internos, entidades o esquemas fuera de la lista). */
function safeDestination(raw: string): string | null {
  if (UNSAFE_CHARS.test(raw) || ENTITY.test(raw) || raw.length === 0) return null;
  return SAFE_DESTINATION.test(raw) ? raw : null;
}

/** Sustituye enlaces e imágenes en línea `[texto](destino)` / `![alt](destino)`: la imagen deja el alt; el enlace inseguro deja el texto. */
function rewriteInline(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('[', index);
    if (open < 0) break;
    const image = open > 0 && source[open - 1] === '!';
    const close = source.indexOf(']', open + 1);
    const between = close < 0 ? '' : source.slice(open + 1, close);
    if (close < 0 || between.includes('\n') || source[close + 1] !== '(') {
      out += source.slice(index, open + 1);
      index = open + 1;
      continue;
    }
    const destination = scanDestination(source, close + 2) ?? scanLoose(source, close + 2);
    if (destination === null) {
      // `[texto](` sin cierre válido: no es un enlace en CommonMark, pero un cliente laxo podría tratarlo como tal; se rompe la sintaxis (el `(` pasa a espacio, sin alargar el texto) y queda como texto inerte.
      out += `${source.slice(index, close + 1)} `;
      index = close + 2;
      continue;
    }
    const head = source.slice(index, image ? open - 1 : open);
    const safe = image ? null : safeDestination(destination.raw);
    out += image || safe === null ? `${head}${between}` : `${head}[${between}](${safe})`;
    index = destination.end;
  }
  return out + source.slice(index);
}

function onePass(source: string): string {
  let text = source.replace(BLOCK_ELEMENTS, '').replace(TAG, '');
  text = text.replace(REFERENCE_DEFINITION, '').replace(IMAGE_BY_REFERENCE, '$1').replace(LINK_BY_REFERENCE, '$1');
  text = rewriteInline(text);
  // Restos de imagen suelta (`![x]`) y de esquemas ejecutables en texto plano: ninguno sobrevive aunque no formen un enlace.
  return text.replace(/!\[/g, '[').replace(SCHEME_LEFTOVER, '$1$2script$3').replace(DATA_LEFTOVER, 'data$1$2$3');
}

/** Markdown sanitizado: sin HTML, sin esquemas ejecutables y sin imágenes. Idempotente. @implements EDGE-010-007, D10-07 */
export function sanitizeAboutMarkdown(source: string): string {
  let current = source;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = onePass(current);
    if (next === current) return current;
    current = next;
  }
  // Una entrada que sigue cambiando tras el tope de pasadas es adversarial: se descarta todo lo que aún parece marcado.
  return current.replace(/[<>]/g, '');
}
