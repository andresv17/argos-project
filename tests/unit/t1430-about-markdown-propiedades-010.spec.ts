/**
 * T1430 (Feature 010, Bloque E, [GH:#33]): propiedades de `sanitizeAboutMarkdown` (dominio puro; D10-07, EDGE-010-007) sobre entradas generadas con el alfabeto de los ataques conocidos:
 * la salida nunca tiene etiquetas, atributos de evento, imágenes ni destinos fuera de la lista cerrada, y sanitizar dos veces es sanitizar una.
 *
 * @implements REQ-ACE10-003, EDGE-010-007, SC-010-030
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ABOUT_BODY_MAX_CHARS, sanitizeAboutMarkdown } from '../../src/domain/about/about-markdown.ts';

const PIECES = ['<', '>', '</', '<script>', '<img src=x onerror=1>', '![', '](', '[', ']', '(', ')', 'javascript:', 'JaVa\tScRiPt:', 'vbscript:', 'data:text/html,', '&#106;', '&colon;', 'https://ok.example/a', '//host', 'mailto:a@b.c', '\n', ' ', '"', "'", '`', '#', '*', '_', '-', 'a', 'ñ', '[r]: https://t.example', '![x][r]', '<!--', '-->', '<?xml', '\u0000', ' '];
const SAFE_TARGET = /^(https?:\/\/[^\s]+|mailto:[^\s]+|\/(?!\/)[^\s]*|#[^\s]*)$/i;
/** Destinos de los enlaces `[texto](...)` (un `](` sin `[` no es un enlace); el vacío `]()` es texto inerte (no navega a ningún sitio) y no cuenta. */
const targets = (text: string): string[] => [...text.matchAll(/\[[^\]]*\]\(\s*<?([^)>]*)>?\s*\)/g)].map((m) => m[1]!.trim()).filter((t) => t !== '');

const hostile = fc.array(fc.constantFrom(...PIECES), { minLength: 0, maxLength: 40 }).map((parts) => parts.join(''));

describe('T1430 sanitizeAboutMarkdown: propiedades (EDGE-010-007)', () => {
  it('toda entrada generada produce una salida sin etiquetas, eventos, imágenes ni esquemas ejecutables, con destinos seguros', () => {
    fc.assert(
      fc.property(hostile, (source) => {
        const out = sanitizeAboutMarkdown(source);
        expect(out).not.toMatch(/<\s*\/?\s*[a-z!?]/i);
        expect(out).not.toContain('![');
        expect(out).not.toMatch(/(java|vb)\s*script\s*:/i);
        expect(out).not.toMatch(/\bdata\s*:\s*(text|image)/i);
        for (const target of targets(out)) expect(target, JSON.stringify(out)).toMatch(SAFE_TARGET);
      }),
      { numRuns: 1500 },
    );
  });

  it('es idempotente y nunca alarga el texto', () => {
    fc.assert(
      fc.property(hostile, (source) => {
        const once = sanitizeAboutMarkdown(source);
        expect(sanitizeAboutMarkdown(once)).toBe(once);
        expect(once.length).toBeLessThanOrEqual(source.length);
      }),
      { numRuns: 1500 },
    );
  });

  it('el texto sin marcado peligroso pasa intacto (también en el tope de 20 000 caracteres)', () => {
    const plain = '# Título\n\nUn **párrafo** con [enlace](https://ejemplo.org/a?b=1&c=2), una lista:\n\n- uno\n- dos\n\n5 < 10 > 3 y metadata: textos.';
    expect(sanitizeAboutMarkdown(plain)).toBe(plain);
    expect(sanitizeAboutMarkdown('a'.repeat(ABOUT_BODY_MAX_CHARS))).toHaveLength(ABOUT_BODY_MAX_CHARS);
  });
});
