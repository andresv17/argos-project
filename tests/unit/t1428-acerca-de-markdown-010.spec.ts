import { describe, expect, it } from 'vitest';
import { HOSTILE_MARKDOWN, markdownOfLength } from '../fixtures/about-fixtures.ts';

/**
 * T1428 (pruebas rojas, Feature 010, Bloque E, [GH:#33]): sanitización de Markdown de «Acerca de» en SERVIDOR (dominio puro) y en CLIENTE (componente de render), D10-07 y EDGE-010-007.
 * Sin HTML arbitrario, sin esquemas ejecutables (`javascript:`, `vbscript:`, `data:`) y sin imágenes remotas; el Markdown básico (títulos, énfasis, listas, enlaces https) se conserva.
 *
 * Nombres PROPUESTOS por Keymaker (se fijan en T1430/T1431; la prueba los importa de forma dinámica para que cada caso falle por separado mientras no existan):
 *  - `src/domain/about/about-markdown.ts` exporta `sanitizeAboutMarkdown(source: string): string` (idempotente) y `ABOUT_BODY_MAX_CHARS = 20_000` (EDGE-010-011).
 *  - `src/presentation/web/about-markdown.ts` exporta `renderAboutMarkdown(source: string): string` (HTML ya seguro, sin `<img>` ni atributos de evento).
 *
 * ROJO esperado hasta T1430 (dominio) y T1431 (cliente): los módulos aún no existen.
 *
 * @implements REQ-ACE10-001, REQ-ACE10-003, EDGE-010-007, EDGE-010-011, SC-010-030, SC-010-031
 */
const SAFE = '# Título\n\n**negrita** y _cursiva_\n\n- uno\n- dos\n\nVisita [el sitio](https://ejemplo.org/ruta) hoy. 5 < 10 y 10 > 5.';

type Sanitize = (source: string) => string;
type Render = (source: string) => string;
async function loadSanitize(): Promise<Sanitize> {
  const path = '../../src/domain/about/about-markdown.ts';
  const mod = (await import(/* @vite-ignore */ path)) as { sanitizeAboutMarkdown?: Sanitize };
  if (mod.sanitizeAboutMarkdown === undefined) throw new Error('about-markdown.ts (dominio) no exporta sanitizeAboutMarkdown');
  return mod.sanitizeAboutMarkdown;
}
async function loadRender(): Promise<Render> {
  const path = '../../src/presentation/web/about-markdown.ts';
  const mod = (await import(/* @vite-ignore */ path)) as { renderAboutMarkdown?: Render };
  if (mod.renderAboutMarkdown === undefined) throw new Error('about-markdown.ts (cliente) no exporta renderAboutMarkdown');
  return mod.renderAboutMarkdown;
}

/** Destinos de todos los enlaces e imágenes Markdown `](destino)` que sobreviven en el texto. */
const markdownTargets = (text: string): string[] => [...text.matchAll(/\]\(\s*<?([^)>]*)>?\s*\)/g)].map((m) => m[1]!.trim());
const SAFE_TARGET = /^(https?:\/\/[^\s]+|mailto:[^\s]+|\/(?!\/)[^\s]*|#[^\s]*)$/i;

describe('T1428 (a) servidor: sanitizeAboutMarkdown (D10-07, EDGE-010-007)', () => {
  for (const { name, source } of HOSTILE_MARKDOWN) {
    it(`[EDGE-010-007][SC-010-030] ${name}: sin etiquetas HTML, sin atributos de evento, sin imagen y todo destino de enlace es https/mailto/ruta propia`, async () => {
      const out = (await loadSanitize())(source);
      expect(out).not.toMatch(/<\s*\/?\s*[a-z!?]/i);
      expect(out).not.toMatch(/\bon(error|load|click|mouseover|focus)\s*=/i);
      expect(out).not.toContain('![');
      for (const target of markdownTargets(out)) expect(target, `destino ${JSON.stringify(target)} en ${JSON.stringify(out)}`).toMatch(SAFE_TARGET);
      expect(out).not.toMatch(/(java|vb)\s*script\s*:/i);
      expect(out).not.toMatch(/data\s*:\s*(text|image)/i);
      expect(out).not.toMatch(/tracker\.example/);
    });
  }

  it('[REQ-ACE10-001] conserva el Markdown básico: título, énfasis, lista, enlace https y un «<» que no abre una etiqueta', async () => {
    const out = (await loadSanitize())(SAFE);
    for (const piece of ['# Título', '**negrita**', '_cursiva_', '- uno', '- dos', '[el sitio](https://ejemplo.org/ruta)', '5 < 10']) expect(out).toContain(piece);
  });

  it('es idempotente: sanitizar el resultado no lo cambia (ninguna entrada hostil se reconstruye en una segunda pasada)', async () => {
    const sanitize = await loadSanitize();
    for (const { source } of [...HOSTILE_MARKDOWN, { source: SAFE }]) {
      const once = sanitize(source);
      expect(sanitize(once)).toBe(once);
    }
  });

  it('[EDGE-010-011] el tope de body_markdown es de 20 000 caracteres y el sanitizador no recorta el texto legítimo en ese límite', async () => {
    const path = '../../src/domain/about/about-markdown.ts';
    const mod = (await import(/* @vite-ignore */ path)) as { ABOUT_BODY_MAX_CHARS?: number };
    expect(mod.ABOUT_BODY_MAX_CHARS).toBe(20_000);
    const body = markdownOfLength(20_000);
    expect((await loadSanitize())(body)).toBe(body);
  });
});

describe('T1428 (b) cliente: renderAboutMarkdown no inyecta HTML ni esquemas ejecutables (D10-07)', () => {
  for (const { name, source } of HOSTILE_MARKDOWN) {
    it(`[EDGE-010-007][SC-010-030] ${name}: la salida no tiene etiquetas activas, atributos de evento ni imágenes, y todo href es https/mailto/ruta propia`, async () => {
      const html = (await loadRender())(source);
      expect(html).not.toMatch(/<\s*(script|iframe|img|svg|object|embed|style|link|form|meta|base)\b/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/\ssrc\s*=/i);
      expect(html).not.toMatch(/(java|vb)\s*script\s*:/i);
      for (const match of html.matchAll(/\shref\s*=\s*"([^"]*)"/gi)) expect(match[1], `href ${match[1]} en ${html}`).toMatch(SAFE_TARGET);
      expect(html).not.toContain('tracker.example');
    });
  }

  it('[REQ-ACE10-001] el Markdown básico se convierte en título, énfasis, lista y enlace https con rel="noopener noreferrer"; el texto «<b>» se escapa', async () => {
    const html = (await loadRender())(`${SAFE}\n\n<b>x</b>`);
    expect(html).toMatch(/<h1[^>]*>Título<\/h1>/);
    expect(html).toMatch(/<(strong|b)>negrita<\/\1>/);
    expect(html).toMatch(/<(em|i)>cursiva<\/\1>/);
    expect(html).toMatch(/<ul[^>]*>\s*<li>uno<\/li>\s*<li>dos<\/li>\s*<\/ul>/);
    expect(html).toMatch(/<a [^>]*href="https:\/\/ejemplo\.org\/ruta"[^>]*>el sitio<\/a>/);
    expect(html).toMatch(/<a [^>]*rel="[^"]*noopener[^"]*noreferrer[^"]*"|<a [^>]*rel="[^"]*noreferrer[^"]*noopener[^"]*"/);
    expect(html).not.toContain('<b>x</b>');
  });

  it('[REQ-ACE10-001] el texto vacío produce una cadena vacía (el estado vacío lo pinta la página, no el render)', async () => {
    expect((await loadRender())('')).toBe('');
  });
});
