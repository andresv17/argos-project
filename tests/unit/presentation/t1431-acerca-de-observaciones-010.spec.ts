/**
 * T1431 observaciones de /oracle y /sati (Feature 010, REQ-ACE10-001, REQ-ACE10-002, EDGE-010-006, EDGE-010-007, EDGE-010-011, D10-07).
 * (1) Ruta relativa `/\evil.com` (los navegadores la leen como `//evil.com`) rechazada en servidor y cliente. (2) El render web de `[x](javascript:alert(1))` coincide con el
 * del servidor (sin `)` suelto). (3) AboutPanel: If-Match con el etag mostrado, 412 con role="alert" y botón de recarga, maxLength 20000 con contador y aviso de alt vacío.
 * No hay jsdom: se prueba el cliente HTTP con `fetch` simulado y los fragmentos del panel con `renderToStaticMarkup`.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeAboutMarkdown } from '../../../src/domain/about/about-markdown.ts';
import { BodyEditor, ConflictNotice, altWarning } from '../../../src/presentation/admin/AboutPanel.tsx';
import { saveAboutPhoto, saveAboutText } from '../../../src/presentation/admin/about-api.ts';
import { renderAboutMarkdown } from '../../../src/presentation/web/about-markdown.ts';
import { AboutContent } from '../../../src/presentation/web/pages/AboutPage.tsx';

describe('T1431 OBS-1 (oracle): rutas relativas que el navegador trata como protocolo-relativas', () => {
  const cases: ReadonlyArray<readonly [string, boolean]> = [
    ['/\\evil.com', false],
    ['//evil.com', false],
    ['/\\/evil.com', false],
    ['/ruta', true],
    ['/ruta/sub?x=1', true],
    ['https://ejemplo.org/ruta', true],
  ];
  for (const [target, allowed] of cases) {
    it(`[EDGE-010-007] servidor: [x](${target}) ${allowed ? 'se conserva' : 'queda solo como texto'}`, () => {
      const out = sanitizeAboutMarkdown(`[x](${target})`);
      expect(out).toBe(allowed ? `[x](${target})` : 'x');
    });
    it(`[EDGE-010-007] cliente: [x](${target}) ${allowed ? 'es enlace' : 'queda solo como texto'}`, () => {
      const html = renderAboutMarkdown(`[x](${target})`);
      if (allowed) expect(html).toContain(`<a href="${target}"`);
      else {
        expect(html).not.toContain('<a');
        expect(html).toBe('<p>x</p>');
      }
    });
  }
});

describe('T1431 OBS-2 (oracle): el render web equivale al saneo del servidor', () => {
  it('[EDGE-010-007] [clic](javascript:alert(1)) deja solo el texto, sin «)» suelto', () => {
    expect(renderAboutMarkdown('[clic](javascript:alert(1))')).toBe('<p>clic</p>');
  });
  const inputs = ['[clic](javascript:alert(1))', 'antes [a](javascript:alert(document.cookie)) después', '[b](vbscript:msgbox(1)) y [c](https://ejemplo.org/x_(y)) fin', '[d](data:text/html,x)', '[e](/\\evil.com) [f](//evil.com)'];
  for (const input of inputs) {
    it(`render(entrada) == render(sanitizar(entrada)): ${JSON.stringify(input)}`, () => {
      expect(renderAboutMarkdown(input)).toBe(renderAboutMarkdown(sanitizeAboutMarkdown(input)));
    });
  }
  it('un enlace https con paréntesis balanceados se conserva entero', () => {
    expect(renderAboutMarkdown('[c](https://ejemplo.org/x_(y))')).toContain('href="https://ejemplo.org/x_(y)"');
  });
});

describe('T1431 OBS-3 (oracle, sati): AboutPanel', () => {
  afterEach(() => vi.unstubAllGlobals());
  const body = (): Response =>
    new Response(JSON.stringify({ bodyMarkdown: 'x', photoUrl: null, photoAlt: '', updatedAt: null, version: 4, etag: '"4"' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('[EDGE-010-006] guardar el texto envía If-Match con el etag mostrado y la cabecera CSRF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(body());
    vi.stubGlobal('fetch', fetchMock);
    await saveAboutText({ bodyMarkdown: 'x', photoAlt: '' }, '"3"');
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'If-Match': '"3"', 'X-Argos-Request': '1' });
  });

  it('[EDGE-010-006] guardar la foto envía If-Match con el etag mostrado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(body());
    vi.stubGlobal('fetch', fetchMock);
    await saveAboutPhoto(new File([new Uint8Array([1])], 'f.png', { type: 'image/png' }), '"7"');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/about/photo');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ 'If-Match': '"7"' });
  });

  it('[EDGE-010-006] un 412 se traduce a PRECONDITION', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 412 })));
    expect(await saveAboutText({ bodyMarkdown: 'x', photoAlt: '' }, '"1"')).toEqual({ kind: 'PRECONDITION' });
  });

  it('[EDGE-010-006] el bloque de conflicto es role="alert", enfocable y trae el botón de recarga', () => {
    const markup = renderToStaticMarkup(h(ConflictNotice, { onReload: () => undefined }));
    expect(markup).toMatch(/role="alert"/);
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('Otra persona guardó cambios');
    expect(markup).toMatch(/<button[^>]*type="button"[^>]*>Recargar la versión vigente<\/button>/);
  });

  it('[EDGE-010-011] el campo de texto fija maxLength 20000 y muestra el contador', () => {
    const markup = renderToStaticMarkup(h(BodyEditor, { body: 'hola', onChange: () => undefined }));
    expect(markup).toContain('maxLength="20000"');
    expect(markup).toContain('aria-describedby="about-count"');
    expect(markup).toMatch(/id="about-count"[^>]*>4 de 20000 caracteres/);
  });

  it('[REQ-ACE10-001] con foto y texto alternativo vacío o en blanco hay aviso (no bloquea); sin foto o con alt no', () => {
    expect(altWarning('/api/about/photo?v=1', '')).toMatch(/texto alternativo/);
    expect(altWarning('/api/about/photo?v=1', '   ')).toBe(altWarning('/api/about/photo?v=1', ''));
    expect(altWarning('/api/about/photo?v=1', 'Equipo en la clínica')).toBeNull();
    expect(altWarning(null, '')).toBeNull();
  });
});

describe('T1431 OBS-3 (architect H-ARCH-ACE-ALT): alt de la foto en la página pública', () => {
  const photoUrl = '/api/about/photo?v=3';
  const render = (photoAlt: string): string => renderToStaticMarkup(h(AboutContent, { about: { bodyMarkdown: 'Hola', photoUrl, photoAlt } }));
  const photoTag = (markup: string): string => /<img[^>]*src="\/api\/about\/photo\?v=3"[^>]*>/.exec(markup)?.[0] ?? '';

  it('[REQ-ACE10-001] con foto y alt vacío emite alt="" (decorativa), sin nombre de archivo ni ruta como alt', () => {
    const tag = photoTag(render(''));
    expect(tag).toMatch(/\salt=""/);
    expect(tag).not.toMatch(/alt="[^"]/);
    expect(tag).not.toMatch(/alt="[^"]*(photo|\.png|\.jpe?g|\/api)/i);
  });

  it('[REQ-ACE10-001] con alt no vacío lo emite escapado', () => {
    const tag = photoTag(render('Equipo "Tipi" <b>&</b>'));
    expect(tag).toContain('alt="Equipo &quot;Tipi&quot; &lt;b&gt;&amp;&lt;/b&gt;"');
    expect(tag).not.toContain('<b>');
  });
});
