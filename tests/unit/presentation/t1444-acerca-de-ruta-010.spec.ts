import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { createElement as h, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerStaticAssets } from '../../../src/infrastructure/http/plugins/static-assets.ts';
import type { ApiClient } from '../../../src/presentation/web/api.ts';

/**
 * T1444 (pruebas rojas, Feature 010, Bloque E, [GH:#33]) y parte de T1428: la ruta pública `/acerca-de` (D10-07, EDGE-010-004). Fuera de `Guard` y de `SessionProvider`; sin llamada a `/auth/me`
 * ni a otra API en el render (la lectura pública del contenido la hace un efecto del cliente, que `renderToStaticMarkup` no ejecuta); con cookie de sesión caducada no redirige a login;
 * enlace en el pie de `LoginPage`, `RegisterPage` y en el menú de la app (`AppShell`); el editor de `/admin` limita a 20 000 caracteres (EDGE-010-011).
 * Mismo método que T1411 (c)(d)(e). Nombres PROPUESTOS por Keymaker (confirmar en T1431): `src/presentation/web/pages/AboutPage.tsx` exporta `AboutPage` (sin props);
 * `src/presentation/admin/AboutPanel.tsx` es el editor del portal.
 *
 * ROJO esperado hasta T1431 (página, ruta en App.tsx, enlaces, panel) salvo la regresión de servidor (e), que ya cumple por el fallback SPA de `static-assets` (se mantiene como guarda).
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, EDGE-010-004, EDGE-010-011, SC-010-027
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const ROUTE = '/acerca-de';

async function loadAbout(): Promise<ComponentType> {
  const path = join(ROOT, 'src', 'presentation', 'web', 'pages', 'AboutPage.tsx');
  try {
    const mod = (await import(/* @vite-ignore */ path)) as { AboutPage?: ComponentType };
    if (mod.AboutPage === undefined) throw new Error('AboutPage.tsx no exporta AboutPage');
    return mod.AboutPage;
  } catch (e) {
    throw new Error(`AboutPage.tsx no existe o no carga: ${(e as Error).message.slice(0, 100)}`);
  }
}

/** ApiClient de prueba: toda petición queda registrada; cualquier llamada (sobre todo `/auth/me`) es la violación que buscamos. */
function spyApi(): { readonly api: ApiClient; readonly calls: string[] } {
  const calls: string[] = [];
  const record = (path: string): Promise<never> => {
    calls.push(path);
    return Promise.reject(new Error('sin sesión'));
  };
  return { api: { GET: record, POST: record, PUT: record, PATCH: record, DELETE: record } as unknown as ApiClient, calls };
}

const app = read('src/presentation/web/App.tsx');
const appBody = app
  .slice(app.indexOf('export function App('))
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

describe('T1444 (a) la página: estructura y accesibilidad (REQ-ACE10-001, SC-010-027)', () => {
  it('[REQ-ACE10-001] AboutPage: un solo h1, contenedor id="main-content" y enlace de regreso a /login o /', async () => {
    const Page = await loadAbout();
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [ROUTE] }, h(Page)));
    expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
    expect(html).toContain('id="main-content"');
    expect(html).toMatch(/<a [^>]*href="(\/login|\/)"/);
  });

  it('[REQ-ACE10-001] el render inicial no depende de sesión ni de API: el código de la página no usa useSession, Guard, /auth/me ni credenciales', () => {
    const source = read('src/presentation/web/pages/AboutPage.tsx');
    expect(source).not.toMatch(/useSession|Guard|auth\/me|SessionProvider/);
    expect(source).toMatch(/about/i);
  });
});

describe('T1444 (b) ruta pública fuera de la sesión (EDGE-010-004)', () => {
  it('[EDGE-010-004] App() declara /acerca-de ANTES de la ruta comodín que monta SessionProvider', () => {
    const wildcard = appBody.indexOf('<SessionProvider');
    expect(wildcard).toBeGreaterThan(-1);
    const at = appBody.indexOf(`path="${ROUTE}"`);
    expect(at, `${ROUTE} sin declarar en App()`).toBeGreaterThan(-1);
    expect(at, `${ROUTE} debe ir fuera de SessionProvider`).toBeLessThan(wildcard);
  });

  it('[EDGE-010-004] /acerca-de no pasa por Guard ni SessionProvider (no llama a /auth/me)', () => {
    const line = appBody.split('\n').find((l) => l.includes(`path="${ROUTE}"`)) ?? '';
    expect(line, `${ROUTE} sin declarar`).not.toBe('');
    expect(line).not.toMatch(/Guard|SessionProvider/);
  });

  it('[EDGE-010-004] App en /acerca-de muestra la página sin «Cargando…», sin redirección a login y sin tocar la API durante el render', async () => {
    await loadAbout();
    const { App } = await import('../../../src/presentation/web/App.tsx');
    const { api, calls } = spyApi();
    const html = renderToStaticMarkup(h(MemoryRouter, { initialEntries: [ROUTE] }, h(App, { api })));
    expect(html).toMatch(/<h1[\s>]/);
    expect(textOf(html)).not.toContain('Cargando');
    expect(html).not.toContain('href="/login" replace');
    expect(calls).toEqual([]);
  });

  it('[EDGE-010-004] las rutas públicas previas siguen fuera de SessionProvider (guarda de regresión)', () => {
    for (const route of ['/shared/:token', '/privacidad', '/terminos']) {
      expect(appBody.indexOf(`path="${route}"`), route).toBeGreaterThan(-1);
      expect(appBody.indexOf(`path="${route}"`), route).toBeLessThan(appBody.indexOf('<SessionProvider'));
    }
  });
});

describe('T1444 (c) enlaces: pie de login y registro y menú de la app (REQ-ACE10-001, D10-07)', () => {
  for (const comp of ['LoginPage', 'RegisterPage'] as const) {
    it(`[REQ-ACE10-001] ${comp} muestra en su pie un enlace a ${ROUTE} (junto a /privacidad y /terminos)`, async () => {
      const { SessionProvider } = await import('../../../src/presentation/web/session.tsx');
      const pages = (await import('../../../src/presentation/web/pages/AuthPages.tsx')) as unknown as Record<string, ComponentType>;
      const { api } = spyApi();
      const html = renderToStaticMarkup(h(MemoryRouter, null, h(SessionProvider, { api, children: h(pages[comp] as ComponentType) })));
      const footer = /<footer[\s\S]*?<\/footer>/.exec(html)?.[0] ?? '';
      expect(footer, 'sin <footer> en la pantalla').not.toBe('');
      expect(footer).toMatch(new RegExp(`<a [^>]*href="${ROUTE}"`));
      expect(footer).toMatch(/<a [^>]*href="\/privacidad"/);
    });
  }

  it('[REQ-ACE10-001] el menú de la app (AppShell) enlaza a /acerca-de', () => {
    expect(read('src/presentation/web/pages/AppShell.tsx')).toMatch(/["'`]\/acerca-de["'`]/);
  });
});

describe('T1444 (d) servidor: /acerca-de con cookie de sesión caducada responde 200 HTML sin redirigir (EDGE-010-004)', () => {
  let dir = '';
  let server: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 't1444-'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
    server = Fastify();
    await server.register(cookie);
    await registerStaticAssets(server, { root: join(dir, 'dist') });
    await server.ready();
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it('[SC-010-027] GET /acerca-de sin cookie y con cookie caducada: 200 text/html, sin redirección', async () => {
    for (const headers of [{}, { cookie: 'argos_session=caducada' }]) {
      const res = await server.inject({ method: 'GET', url: ROUTE, headers });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers.location).toBeUndefined();
    }
  });
});

describe('T1444 (e) editor de /admin: tope de 20 000 caracteres en el cliente (EDGE-010-011)', () => {
  it('[EDGE-010-011] AboutPanel.tsx existe y fija maxLength a 20000 en el campo de texto', () => {
    let source = '';
    try {
      source = read('src/presentation/admin/AboutPanel.tsx');
    } catch {
      throw new Error('src/presentation/admin/AboutPanel.tsx no existe (T1431)');
    }
    expect(source).toMatch(/maxLength=\{(20000|20_000|ABOUT_BODY_MAX_CHARS)\}/);
  });
});
