/**
 * T1432 ORA-T1432-01 (Feature 010, REQ-ACE10-001, EDGE-010-007, D10-07): el render por árbol (TRI-01) debe dar el MISMO contenido visible que el render viejo (e384094^, congelado en tests/fixtures).
 * Salida exacta para énfasis anidado y para los marcadores privados U+E000/U+E001 de la entrada, y propiedad nuevo == viejo.
 * Única exclusión de la propiedad: (a) TRI-03 intencional (destino de enlace con espacios/tab/NBSP/U+2028/2029 en los extremos; el viejo lo recortaba) y (b) HTML mal anidado del viejo (validado con una pila de strong/em).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { renderAboutMarkdown as legacyRender } from '../../fixtures/about-markdown-legacy-e384094.ts';
import { renderAboutMarkdown } from '../../../src/presentation/web/about-markdown.ts';

describe('T1432 ORA-T1432-01: énfasis anidado, salida exacta', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['**a _b_ c**', '<p><strong>a <em>b</em> c</strong></p>'],
    ['__a *b* c__', '<p><strong>a <em>b</em> c</strong></p>'],
    ['*a _b_ c*', '<p><em>a <em>b</em> c</em></p>'],
    ['**negrita y _cursiva_ dentro**', '<p><strong>negrita y <em>cursiva</em> dentro</strong></p>'],
    ['_a **b** c_', '<p><em>a <strong>b</strong> c</em></p>'],
    ['[**a _b_**](https://e.org)', '<p><a href="https://e.org" rel="noopener noreferrer"><strong>a <em>b</em></strong></a></p>'],
  ];
  for (const [input, expected] of cases) {
    it(`[EDGE-010-007] ${JSON.stringify(input)} -> ${expected}`, () => {
      expect(renderAboutMarkdown(input)).toBe(expected);
    });
  }
});

describe('T1432 ORA-T1432-01: caracteres privados de la entrada se conservan', () => {
  it('[EDGE-010-007] U+E000 y U+E001 del texto no se sustituyen por U+FFFD', () => {
    expect(renderAboutMarkdown('texto  raro  fin')).toBe('<p>texto  raro  fin</p>');
  });
  it('[EDGE-010-007] un falso marcador \\uE0000\\uE001 en la entrada no se expande como énfasis', () => {
    expect(renderAboutMarkdown('**a** 0 _b_')).toBe('<p><strong>a</strong> 0 <em>b</em></p>');
  });
});

const ALPHABET = ['*', '**', '_', '__', 'a', 'b', ' ', 'x1', '[', ']', '(', ')', 'https://e.org', '/r', '#', '- ', '1. ', '\n', '\n\n', '&', '<', '>', '"', "'", '', '', '\t', ' ', ' ', ' ', 'javascript:alert(1)'];
const LINK = /\[([^\]\n]+)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g;

function hasEdgeSpaceTarget(source: string): boolean {
  for (const match of source.matchAll(LINK)) if (match[2] !== match[2]!.trim()) return true;
  return false;
}
function wellNested(html: string): boolean {
  const stack: string[] = [];
  for (const tag of html.match(/<\/?(?:strong|em)>/g) ?? []) {
    const name = tag.replace(/[<\/>]/g, '');
    if (tag.startsWith('</')) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

describe('T1432 ORA-T1432-03: propiedad nuevo == viejo (render congelado de e384094^)', () => {
  const input = fc.array(fc.constantFrom(...ALPHABET), { minLength: 0, maxLength: 24 }).map((parts) => parts.join(''));
  it('[EDGE-010-007] 0 diferencias salvo TRI-03 (espacios al borde del destino) y HTML viejo mal anidado', () => {
    fc.assert(
      fc.property(input, fc.constantFrom(0, 1), (source, offset) => {
        const old = legacyRender(source, offset);
        if (hasEdgeSpaceTarget(source) || !wellNested(old)) return true;
        expect(renderAboutMarkdown(source, offset)).toBe(old);
        return true;
      }),
      { numRuns: 20000, seed: 1432 },
    );
  });
});
