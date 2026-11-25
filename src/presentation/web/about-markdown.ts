/**
 * Render del Markdown de «Acerca de» en el CLIENTE (feature 010, T1431; D10-07, EDGE-010-007). Devuelve un ÁRBOL de nodos (sin HTML ni `innerHTML`; TRI-01 de /trinity T1432) que la vista React convierte en elementos. El texto pasa primero por una depuración propia
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

const SAFE_HREF = /^(?:https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|\/(?![\/\\])[^\s"'<>]*|#[^\s"'<>]*)$/i;
/** Destino con un nivel de paréntesis anidado (`[x](javascript:alert(1))`): igual que el servidor, el `)` interno no cierra el enlace y no queda suelto en el texto. */
const LINK = /\[([^\]\n]+)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Nodo en línea: texto plano, énfasis o enlace con `href` ya validado. */
export type AboutInline =
  | { readonly t: 'text'; readonly v: string }
  | { readonly t: 'strong'; readonly c: readonly AboutInline[] }
  | { readonly t: 'em'; readonly c: readonly AboutInline[] }
  | { readonly t: 'a'; readonly href: string; readonly c: readonly AboutInline[] };
/** Bloque: título (nivel 1..6), párrafo o lista. */
export type AboutBlock =
  | { readonly t: 'h'; readonly level: number; readonly c: readonly AboutInline[] }
  | { readonly t: 'p'; readonly c: readonly AboutInline[] }
  | { readonly t: 'list'; readonly ordered: boolean; readonly items: readonly (readonly AboutInline[])[] };

const STASH = /\uE000(\d+)\uE001/;

/** Énfasis sobre texto SIN escapar: cada coincidencia se aparta con un marcador privado y luego se resuelve (el `em` puede envolver un `strong`, igual que antes). */
function emphasis(raw: string): AboutInline[] {
  const stash: AboutInline[] = [];
  const keep = (t: 'strong' | 'em', inner: string): string => {
    stash.push({ t, c: [{ t: 'text', v: inner }] });
    return `\uE000${stash.length - 1}\uE001`;
  };
  const text = raw
    .replace(/[\uE000\uE001]/g, '\uFFFD')
    .replace(/\*\*([^*\n]+?)\*\*/g, (_m, inner: string) => keep('strong', inner))
    .replace(/(^|[^\w])__([^_\n]+?)__(?!\w)/g, (_m, pre: string, inner: string) => pre + keep('strong', inner))
    .replace(/\*([^*\n]+?)\*/g, (_m, inner: string) => keep('em', inner))
    .replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, (_m, pre: string, inner: string) => pre + keep('em', inner));
  const expand = (value: string): AboutInline[] => {
    const parts = value.split(new RegExp(STASH.source, 'g'));
    const out: AboutInline[] = [];
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        if (part !== '') out.push({ t: 'text', v: part });
        return;
      }
      const node = stash[Number(part)]!;
      out.push(node.t === 'em' ? { t: 'em', c: node.c.flatMap((child) => (child.t === 'text' ? expand(child.v) : [child])) } : node);
    });
    return out;
  };
  return expand(text);
}

function inline(raw: string): AboutInline[] {
  const out: AboutInline[] = [];
  let last = 0;
  for (const match of raw.matchAll(LINK)) {
    const [whole, label, target] = match as unknown as [string, string, string];
    const index = match.index ?? 0;
    out.push(...emphasis(raw.slice(last, index)));
    // Política del servidor (U+2028/2029 y espacios al borde): un destino con espacios en los extremos NO es enlace (TRI-03), no se recorta.
    if (target === target.trim() && SAFE_HREF.test(target)) out.push({ t: 'a', href: target, c: emphasis(label) });
    else out.push(...emphasis(label));
    last = index + whole.length;
  }
  out.push(...emphasis(raw.slice(last)));
  return out;
}

/** `headingOffset` baja el nivel de los títulos del texto (la página ya tiene su propio `h1`); los niveles se acotan a 6. */
export function parseAboutMarkdown(source: string, headingOffset = 0): AboutBlock[] {
  if (source.trim() === '') return [];
  const lines = clean(source).replace(/\r\n?/g, '\n').split('\n');
  const blocks: AboutBlock[] = [];
  let paragraph: string[] = [];
  let list: { readonly ordered: boolean; readonly items: string[] } | null = null;
  const flushParagraph = (): void => {
    if (paragraph.length > 0) blocks.push({ t: 'p', c: inline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = (): void => {
    if (list !== null) blocks.push({ t: 'list', ordered: list.ordered, items: list.items.map(inline) });
    list = null;
  };
  for (const line of lines) {
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
    const bullet = /^ {0,3}[-*+][ \t]+(.+)$/.exec(line);
    const ordered = /^ {0,3}\d{1,9}[.)][ \t]+(.+)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      blocks.push({ t: 'h', level: Math.min(6, heading[1]!.length + headingOffset), c: inline(heading[2]!) });
    } else if (bullet !== null || ordered !== null) {
      flushParagraph();
      const isOrdered = bullet === null;
      if (list !== null && list.ordered !== isOrdered) flushList();
      list ??= { ordered: isOrdered, items: [] };
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
  return blocks;
}

function serializeInline(nodes: readonly AboutInline[]): string {
  return nodes
    .map((node) => {
      if (node.t === 'text') return escapeHtml(node.v);
      if (node.t === 'a') return `<a href="${escapeHtml(node.href)}" rel="noopener noreferrer">${serializeInline(node.c)}</a>`;
      return `<${node.t}>${serializeInline(node.c)}</${node.t}>`;
    })
    .join('');
}

/** Serializador de PRUEBA y diagnóstico: la misma forma textual de siempre, derivada del árbol. La interfaz NO lo usa (renderiza elementos React, sin `innerHTML`). */
export function renderAboutMarkdown(source: string, headingOffset = 0): string {
  return parseAboutMarkdown(source, headingOffset)
    .map((block) => {
      if (block.t === 'h') return `<h${block.level}>${serializeInline(block.c)}</h${block.level}>`;
      if (block.t === 'p') return `<p>${serializeInline(block.c)}</p>`;
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => `<li>${serializeInline(item)}</li>`).join('')}</${tag}>`;
    })
    .join('');
}
