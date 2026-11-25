/**
 * Render del Markdown de «Acerca de» en el CLIENTE (feature 010, T1431; D10-07, EDGE-010-007). Devuelve HTML ya seguro por construcción: el texto pasa primero por una depuración propia
 * (defensa en profundidad: la capa web no importa del dominio, `presentation-architecture`), luego TODO se escapa y solo se emiten etiquetas de una lista cerrada (`h1..h6`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `a`).
 * Sin `<img>`, sin atributos de evento y los enlaces solo `https`/`http`/`mailto`/ruta propia/ancla, con `rel="noopener noreferrer"`.
 *
 * @implements REQ-ACE10-001, EDGE-010-007, D10-07
 */
const BLOCK_ELEMENTS = /<\s*(script|style|iframe)\b[^>]*>[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/gi;
const TAG = /<\s*\/?\s*[a-z!?][^>\n]*>?/gi;
const REFERENCE_DEFINITION = /^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*$/gm;
const IMAGE_INLINE = /!\[([^\]\n]*)\]\([^)\n]*\)/g;
const IMAGE_BY_REFERENCE = /!\[([^\]\n]*)\]\[[^\]\n]*\]/g;
const LINK_BY_REFERENCE = /\[([^\]\n]+)\]\[[^\]\n]*\]/g;
const SCHEME_LEFTOVER = /(java|vb)(\s*)script(\s*):/gi;
const DATA_LEFTOVER = /\bdata(\s*):(\s*)(text|image)/gi;

/** Quita HTML, imágenes y definiciones de referencia, y rompe los esquemas ejecutables que queden como texto. Se repite hasta que no cambie (tope de 8 pasadas). */
function clean(source: string): string {
  let current = source;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = current
      .replace(BLOCK_ELEMENTS, '')
      .replace(TAG, '')
      .replace(REFERENCE_DEFINITION, '')
      .replace(IMAGE_INLINE, '$1')
      .replace(IMAGE_BY_REFERENCE, '$1')
      .replace(LINK_BY_REFERENCE, '$1')
      .replace(SCHEME_LEFTOVER, '$1$2script$3')
      .replace(DATA_LEFTOVER, 'data$1$2$3');
    if (next === current) return current;
    current = next;
  }
  return current.replace(/[<>]/g, '');
}

const SAFE_HREF = /^(?:https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|\/(?!\/)[^\s"'<>]*|#[^\s"'<>]*)$/i;
const LINK = /\[([^\]\n]+)\]\(([^)\n]*)\)/g;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__([^_\n]+?)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
}

function inline(raw: string): string {
  let out = '';
  let last = 0;
  for (const match of raw.matchAll(LINK)) {
    const [whole, label, target] = match as unknown as [string, string, string];
    const index = match.index ?? 0;
    out += emphasis(escapeHtml(raw.slice(last, index)));
    out += SAFE_HREF.test(target.trim())
      ? `<a href="${escapeHtml(target.trim())}" rel="noopener noreferrer">${emphasis(escapeHtml(label))}</a>`
      : emphasis(escapeHtml(label));
    last = index + whole.length;
  }
  return out + emphasis(escapeHtml(raw.slice(last)));
}

/** `headingOffset` baja el nivel de los títulos del texto (la página ya tiene su propio `h1`); los niveles se acotan a 6. */
export function renderAboutMarkdown(source: string, headingOffset = 0): string {
  if (source.trim() === '') return '';
  const lines = clean(source).replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { readonly tag: 'ul' | 'ol'; readonly items: string[] } | null = null;
  const flushParagraph = (): void => {
    if (paragraph.length > 0) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (list !== null) html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const line of lines) {
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
    const bullet = /^ {0,3}[-*+][ \t]+(.+)$/.exec(line);
    const ordered = /^ {0,3}\d{1,9}[.)][ \t]+(.+)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const level = Math.min(6, heading[1]!.length + headingOffset);
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (bullet !== null || ordered !== null) {
      flushParagraph();
      const tag = bullet !== null ? 'ul' : 'ol';
      if (list !== null && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? ordered)![1]!);
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join('');
}
