import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAboutMarkdown as adminParse, renderAboutMarkdown as adminRender } from '../../../src/presentation/admin/about-markdown.ts';
import { parseAboutMarkdown as webParse, renderAboutMarkdown as webRender } from '../../../src/presentation/web/about-markdown.ts';

/**
 * T1431 (010): el portal admin no puede importar de web/ (guarda T1235) ni existe carpeta compartida (presentation-architecture),
 * por eso admin/about-markdown{.ts,-view.tsx} son copias de las de web/. Esta prueba evita que diverjan.
 */
const read = (p: string): string => readFileSync(p, 'utf8');

describe('T1431 [REQ-ACE10-001] copia admin del render de Acerca de equivalente a la de web', () => {
  it('el modulo puro y la vista son identicos byte a byte', () => {
    expect(read('src/presentation/admin/about-markdown.ts')).toBe(read('src/presentation/web/about-markdown.ts'));
    expect(read('src/presentation/admin/about-markdown-view.tsx')).toBe(read('src/presentation/web/about-markdown-view.tsx'));
  });

  it('mismo arbol y mismo texto renderizado sobre entradas representativas', () => {
    const samples = ['# T\n\nHola **a _b_ c** [x](https://e.org) <script>x</script>', '- a\n- b\n\n1. c\n2. d', '**x _y** z_', '[m](mailto:a@b.c) [r](/ruta) [h](#a)', '', '![i](https://e.org/a.png)'];
    for (const s of samples) for (const off of [0, 1]) {
      expect(adminParse(s, off)).toEqual(webParse(s, off));
      expect(adminRender(s, off)).toBe(webRender(s, off));
    }
  });
});
