import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { registerShareLinkRoutes } from '../../src/infrastructure/http/routes/share-links.routes.ts';
import type { RouteContext } from '../../src/infrastructure/http/routes/use-cases.ts';

/**
 * T1404 (Feature 010, Bloque A, [GH:#65]) PRUEBAS ROJAS: marca «Tipi» visible, módulo `brand` y base de enlaces desde configuración.
 * Rojas a propósito hasta T1406 (marca) y T1408 (base). D10-01: los identificadores internos (cabeceras `X-Argos-*`, cookies `argos_*`,
 * variables `ARGOS_*`, `urn:argos:`, reglas semgrep) NO cambian y están en la lista blanca; D10-02: base estática, sin claves nuevas en /admin.
 *
 * Nombres PROPUESTOS por Keymaker (confirmar en T1406/T1408; si cambian, se ajustan estas pruebas, no la intención):
 *   - módulo `src/presentation/web/brand.ts` con `export const BRAND_NAME = 'Tipi'`;
 *   - `AppConfig.publicBaseUrl` (string | null) leída de `ARGOS_PUBLIC_BASE_URL`;
 *   - `RouteContext.publicBaseUrl` consumida por `share-links.routes.ts`.
 *
 * @implements REQ-TIP10-001, REQ-TIP10-004, EDGE-010-012, SC-010-001, SC-010-004
 */
const ROOT = join(import.meta.dirname, '..', '..');
const WEB = join(ROOT, 'src', 'presentation', 'web');
const ADMIN = join(ROOT, 'src', 'presentation', 'admin');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Lista blanca D10-01: identificadores internos que conservan «argos». */
const INTERNAL = /X-Argos-|x-argos-|argos_|ARGOS_|urn:argos|nosemgrep|sast-rules\.argos/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

function visibleArgos(path: string, text: string): string[] {
  return text
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !COMMENT_LINE.test(line) && /argos/i.test(line) && !INTERNAL.test(line))
    .map(({ line, n }) => `${path}:${n}: ${line.trim().slice(0, 120)}`);
}

describe('T1404 (a) ninguna aparición visible de «Argos» en la interfaz (REQ-TIP10-001, SC-010-001)', () => {
  it('[REQ-TIP10-001] index.html y admin.html no muestran «Argos» (título y metadatos)', () => {
    const found = ['index.html', 'admin.html'].flatMap((file) => visibleArgos(file, read(file)));
    expect(found).toEqual([]);
  });

  it('[REQ-TIP10-001] src/presentation/web no contiene «Argos» visible fuera de la lista blanca de identificadores internos', () => {
    const found = walk(WEB).flatMap((file) => visibleArgos(relative(ROOT, file), readFileSync(file, 'utf8')));
    expect(found).toEqual([]);
  });

  it('[REQ-TIP10-001] src/presentation/admin no contiene «Argos» visible (portal /admin, B-3 de la validación de Bloque A)', () => {
    const found = walk(ADMIN).flatMap((file) => visibleArgos(relative(ROOT, file), readFileSync(file, 'utf8')));
    expect(found).toEqual([]);
  });

  it('[REQ-TIP10-002] AuthPages, AppShell y AdminPortal muestran el logo del paquete y el título usa Nunito 800 (B-1, B-2)', () => {
    for (const file of [join(WEB, 'pages/AuthPages.tsx'), join(WEB, 'pages/AppShell.tsx'), join(ADMIN, 'AdminPortal.tsx')]) {
      // Cambio de expectativa (corrección de marca, BRAND-TIPI.md §2 y §5): barra superior y pantallas de acceso usan el logo
      // HORIZONTAL; el símbolo simple es solo para ≤32 px (favicon/íconos) y el logo completo nunca baja de 32 px. La intención
      // (el logo del paquete es visible) no cambia.
      expect(readFileSync(file, 'utf8'), file).toMatch(/\/brand\/tipi-logo-horizontal\.svg/);
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/tipi-simbolo-simple\.svg/);
    }
    expect(readFileSync(join(WEB, 'pages/AuthPages.tsx'), 'utf8')).toMatch(/<h1[^>]*font-display[^>]*font-extrabold/);
  });
});

describe('T1404 (b) el nombre sale del módulo `brand` y el título lo usa (REQ-TIP10-001, SC-010-001)', () => {
  it('[REQ-TIP10-001] existe src/presentation/web/brand.ts con BRAND_NAME = «Tipi»', async () => {
    const brandPath = '../../src/presentation/web/brand.ts'; // ruta en variable: el módulo aún no existe y tsc no debe fallar
    const mod = (await import(/* @vite-ignore */ brandPath)) as { BRAND_NAME?: unknown };
    expect(mod.BRAND_NAME).toBe('Tipi');
  });

  it('[REQ-TIP10-001] <title> de index.html y admin.html contienen «Tipi» y no «Argos»', () => {
    for (const file of ['index.html', 'admin.html']) {
      const title = /<title>([^<]*)<\/title>/.exec(read(file))?.[1] ?? '';
      expect(title, file).toMatch(/Tipi/);
      expect(title, file).not.toMatch(/argos/i);
    }
  });

  it('[REQ-TIP10-001] index.html declara el favicon de marca (favicon.svg)', () => {
    expect(read('index.html')).toMatch(/<link[^>]+rel="icon"[^>]+favicon\.svg/);
  });

  it('[REQ-TIP10-001] cabecera y portada importan `brand` y no escriben «Tipi» a mano', () => {
    for (const file of ['pages/AppShell.tsx', 'pages/AuthPages.tsx']) {
      const text = readFileSync(join(WEB, file), 'utf8');
      expect(text, file).toMatch(/from ['"][./]*brand(\.ts)?['"]/);
      expect(text, file).not.toMatch(/>\s*Tipi\s*</);
    }
  });

  it('[REQ-TIP10-001] el portal admin tiene su propia constante de marca (sin importar de web/) y coincide con la de web', async () => {
    const adminBrandPath = '../../src/presentation/admin/brand.ts';
    const webBrandPath = '../../src/presentation/web/brand.ts';
    const adminMod = (await import(/* @vite-ignore */ adminBrandPath)) as { BRAND_NAME?: unknown };
    const webMod = (await import(/* @vite-ignore */ webBrandPath)) as { BRAND_NAME?: unknown };
    expect(adminMod.BRAND_NAME).toBe('Tipi');
    expect(adminMod.BRAND_NAME).toBe(webMod.BRAND_NAME);
    expect(readFileSync(join(ADMIN, 'AdminPortal.tsx'), 'utf8')).toMatch(/from ['"]\.\/brand\.ts['"]/);
  });
});

describe('T1404 (c) la base de los enlaces sale de configuración, no de la petición (REQ-TIP10-004, EDGE-010-012, SC-010-004)', () => {
  const BASE = 'http://127.0.0.1:5173';

  it('[REQ-TIP10-004] AppConfig expone publicBaseUrl desde ARGOS_PUBLIC_BASE_URL (sin barra final)', () => {
    const config = loadAppConfig({ NODE_ENV: 'test', ARGOS_PUBLIC_BASE_URL: `${BASE}/` }) as unknown as { publicBaseUrl?: unknown };
    expect(config.publicBaseUrl).toBe(BASE);
  });

  it('[EDGE-010-012] el enlace público ignora Host y X-Forwarded-Host de la petición (trustProxy activo)', async () => {
    const app = Fastify({ trustProxy: '127.0.0.1' });
    await app.register(cookie);
    // Igual que app.ts: cuerpo crudo en Buffer (jsonBody lo decodifica).
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    const useCases = {
      authenticate: { execute: async () => 'user-1' },
      createShareLink: { execute: async () => ({ kind: 'CREATED', token: 'tok-1', link: { id: 'l1' } }) },
    };
    registerShareLinkRoutes(app, { useCases, cookieSecure: false, publicBaseUrl: BASE } as unknown as RouteContext);
    const response = await app.inject({
      method: 'POST',
      url: '/api/pets/p1/share-links',
      headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', 'idempotency-key': '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', 'content-type': 'application/json' },
      payload: '{}',
    });
    await app.close();
    expect(response.statusCode, response.body).toBe(201);
    expect((response.json() as { url: string }).url).toBe(`${BASE}/shared/tok-1`);
  });

  it('[EDGE-010-012] share-links.routes.ts no deriva la URL de request.host ni request.protocol', () => {
    const code = read('src/infrastructure/http/routes/share-links.routes.ts')
      .split('\n')
      .filter((line) => !COMMENT_LINE.test(line))
      .join('\n');
    expect(code).not.toMatch(/request\.(host|hostname|protocol)/);
  });
});
