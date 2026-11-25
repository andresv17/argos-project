import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { createElement as h, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerStaticAssets } from '../../src/infrastructure/http/plugins/static-assets.ts';
import type { ApiClient } from '../../src/presentation/web/api.ts';

/**
 * T1411 (Feature 010, Bloque B, [GH:#67]) PRUEBAS ROJAS: páginas legales públicas `/privacidad` y `/terminos`, pie en login y registro,
 * rutas fuera de sesión (EDGE-010-004), cláusula de mayoría de edad (D10-05) y los 4 placeholders literales (D10-06).
 * Rojas a propósito hasta T1413 (páginas, rutas en App.tsx, pie en AuthPages). No dependen del texto exacto de `legal-texts.md` (T1412):
 * solo de estructura, rutas, placeholders literales y la presencia de la cláusula de mayoría de edad.
 *
 * Nombres PROPUESTOS por Keymaker (confirmar en T1413): `src/presentation/web/pages/PrivacyPolicyPage.tsx` exporta `PrivacyPolicyPage`;
 * `TermsPage.tsx` exporta `TermsPage` (sin props). Rutas `/privacidad` y `/terminos` declaradas en `App()` fuera de `SessionProvider`.
 *
 * @implements REQ-LEG10-001, REQ-LEG10-003, REQ-LEG10-004, INV-LEG10-001, EDGE-010-004, SC-010-007, SC-010-008, SC-010-009
 */
const ROOT = join(import.meta.dirname, '..', '..');
const WEB = join(ROOT, 'src', 'presentation', 'web');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const PLACEHOLDERS = ['[NOMBRE DEL RESPONSABLE O PROYECTO]', '[CORREO DE CONTACTO / PRIVACIDAD]', '[PAÍS / JURISDICCIÓN]', '[FECHA DE ÚLTIMA ACTUALIZACIÓN]'] as const;
const ADULT = /mayor(es)? de edad|mayoría de edad|18\s*(años|\+)/i;

type Loaded = { readonly Page: ComponentType | null; readonly error: string };
async function loadPage(file: string, name: string): Promise<Loaded> {
  const path = join(WEB, 'pages', file);
  try {
    const mod = (await import(/* @vite-ignore */ path)) as Record<string, ComponentType | undefined>;
    return { Page: mod[name] ?? null, error: mod[name] === undefined ? `${file} no exporta ${name}` : '' };
  } catch (e) {
    return { Page: null, error: `${file} no existe o no carga: ${(e as Error).message.slice(0, 80)}` };
  }
}
async function renderPage(file: string, name: string): Promise<string> {
  const { Page, error } = await loadPage(file, name);
  if (Page === null) throw new Error(error);
  return renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/${name === 'TermsPage' ? 'terminos' : 'privacidad'}`] }, h(Page)));
}
const PAGES = [
  { file: 'PrivacyPolicyPage.tsx', name: 'PrivacyPolicyPage', route: '/privacidad' },
  { file: 'TermsPage.tsx', name: 'TermsPage', route: '/terminos' },
] as const;

/** ApiClient de prueba: cada petición queda registrada; cualquier llamada a `/auth/me` es la violación que buscamos. */
function spyApi(): { readonly api: ApiClient; readonly calls: string[] } {
  const calls: string[] = [];
  const record = (path: string): Promise<never> => {
    calls.push(path);
    return Promise.reject(new Error('sin sesión'));
  };
  const api = { GET: record, POST: record, PUT: record, PATCH: record, DELETE: record } as unknown as ApiClient;
  return { api, calls };
}

describe('T1411 (a) páginas legales: estructura y accesibilidad (REQ-LEG10-003, SC-010-007)', () => {
  for (const { file, name } of PAGES) {
    it(`[REQ-LEG10-003] ${file}: un solo h1, al menos un h2 y enlace de regreso a /login o /`, async () => {
      const html = await renderPage(file, name);
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
      expect((html.match(/<h2[\s>]/g) ?? []).length).toBeGreaterThanOrEqual(1);
      expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'));
      expect(html).toMatch(/<a [^>]*href="(\/login|\/)"/);
      expect(html).toContain('id="main-content"');
    });
  }
});

describe('T1411 (b) cláusula de mayoría de edad y placeholders literales (D10-05, D10-06)', () => {
  for (const { file, name } of PAGES) {
    it(`[REQ-LEG10-001] ${file}: contiene la cláusula de mayoría de edad (D10-05)`, async () => {
      expect(textOf(await renderPage(file, name))).toMatch(ADULT);
    });
  }
  it('[SC-010-009] los 4 placeholders literales aparecen sin rellenar entre /privacidad y /terminos (D10-06)', async () => {
    const all = (await Promise.all(PAGES.map(({ file, name }) => renderPage(file, name)))).map(textOf).join('\n');
    for (const placeholder of PLACEHOLDERS) expect(all, placeholder).toContain(placeholder);
  });
  it('[SC-010-009] la política de privacidad cita el placeholder de contacto y la fecha de última actualización', async () => {
    const text = textOf(await renderPage('PrivacyPolicyPage.tsx', 'PrivacyPolicyPage'));
    expect(text).toContain('[CORREO DE CONTACTO / PRIVACIDAD]');
    expect(text).toContain('[FECHA DE ÚLTIMA ACTUALIZACIÓN]');
  });
});

describe('T1411 (c) rutas públicas fuera de la sesión (REQ-LEG10-001, INV-LEG10-001, EDGE-010-004)', () => {
  const app = read('src/presentation/web/App.tsx');
  const appBody = app
    .slice(app.indexOf('export function App('))
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  it('[REQ-LEG10-001] App() declara /privacidad y /terminos ANTES de la ruta comodín que monta SessionProvider', () => {
    const wildcard = appBody.indexOf('<SessionProvider');
    expect(wildcard).toBeGreaterThan(-1);
    for (const route of ['/privacidad', '/terminos']) {
      const at = appBody.indexOf(`path="${route}"`);
      expect(at, `${route} sin declarar en App()`).toBeGreaterThan(-1);
      expect(at, `${route} debe ir fuera de SessionProvider`).toBeLessThan(wildcard);
    }
  });
  it('[EDGE-010-004] /privacidad y /terminos no pasan por Guard ni SessionProvider (no llaman a /auth/me)', () => {
    for (const route of ['/privacidad', '/terminos']) {
      const line = appBody.split('\n').find((l) => l.includes(`path="${route}"`)) ?? '';
      expect(line, `${route} sin declarar`).not.toBe('');
      expect(line).not.toMatch(/Guard|SessionProvider/);
    }
  });
  for (const { route, name, file } of PAGES) {
    it(`[EDGE-010-004] App en ${route} muestra la página legal sin «Cargando…» y sin tocar la API`, async () => {
      const { Page, error } = await loadPage(file, name);
      expect(Page, error).not.toBeNull();
      const { App } = await import('../../src/presentation/web/App.tsx');
      const { api, calls } = spyApi();
      const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [route] }, h(App, { api })));
      expect(html).toMatch(/<h1[\s>]/);
      expect(textOf(html)).not.toContain('Cargando');
      expect(html).not.toContain('href="/login" replace');
      expect(calls).toEqual([]);
    });
  }
  it('[EDGE-010-004] /shared/:token sigue declarada fuera de SessionProvider (guarda de regresión)', () => {
    expect(appBody.indexOf('path="/shared/:token"')).toBeGreaterThan(-1);
    expect(appBody.indexOf('path="/shared/:token"')).toBeLessThan(appBody.indexOf('<SessionProvider'));
  });
  it('[EDGE-010-004] el bootstrap de App.tsx no consulta /auth/me fuera de SessionProvider', () => {
    const before = appBody.slice(0, appBody.indexOf('<SessionProvider'));
    expect(before).not.toMatch(/auth\/me|useSession|\.GET\(/);
  });
});

describe('T1411 (d) pie con ambos enlaces en login y registro (REQ-LEG10-004, SC-010-008)', () => {
  for (const comp of ['LoginPage', 'RegisterPage'] as const) {
    it(`[REQ-LEG10-004] ${comp} muestra un pie discreto con enlaces a /privacidad y /terminos`, async () => {
      const { SessionProvider } = await import('../../src/presentation/web/session.tsx');
      const pages = (await import('../../src/presentation/web/pages/AuthPages.tsx')) as unknown as Record<string, ComponentType>;
      const { api } = spyApi();
      const html = renderToStaticMarkup(h(MemoryRouter, null, h(SessionProvider, { api, children: h(pages[comp] as ComponentType) })));
      const footer = /<footer[\s\S]*?<\/footer>/.exec(html)?.[0] ?? '';
      expect(footer, 'sin <footer> en la pantalla').not.toBe('');
      expect(footer).toMatch(/<a [^>]*href="\/privacidad"/);
      expect(footer).toMatch(/<a [^>]*href="\/terminos"/);
    });
  }
});

describe('T1411 (e) servidor: rutas públicas con cookie de sesión caducada responden 200 HTML (EDGE-010-004, SC-010-007)', () => {
  let dir = '';
  let app: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 't1411-'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
    app = Fastify();
    await app.register(cookie);
    await registerStaticAssets(app, { root: join(dir, 'dist') });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  for (const route of ['/privacidad', '/terminos', '/shared/abc123']) {
    it(`[SC-010-007] GET ${route} sin cookie y con cookie caducada: 200 text/html, sin redirección`, async () => {
      for (const headers of [{}, { cookie: 'argos_session=caducada' }]) {
        const res = await app.inject({ method: 'GET', url: route, headers });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.headers.location).toBeUndefined();
      }
    });
  }
});
