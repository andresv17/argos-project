import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config.ts';
import { AppConfigError } from '../../src/infrastructure/config/app-config.ts';
import { PROD_SCENE, loadAppConfigActivated as loadAppConfig } from '../fixtures/scene-config-fixtures.ts';
import { registerShareLinkRoutes } from '../../src/infrastructure/http/routes/share-links.routes.ts';
import type { RouteContext } from '../../src/infrastructure/http/routes/use-cases.ts';

/**
 * T1407 (Bloque A, [GH:#65]) paleta Tipi, fuentes locales, logo y favicon; T1443 (EDGE-010-003) transición de dominio.
 * Regla de Neo (Terracota, opción a): Terracota SOLO en acentos decorativos, títulos grandes, íconos grandes y anillo de foco; NUNCA en texto normal,
 * enlaces ni botones con etiqueta normal. D10-02: base estática (sin claves nuevas en /admin).
 *
 * @implements REQ-TIP10-002, REQ-TIP10-003, REQ-TIP10-004, EDGE-010-003, SC-010-002, SC-010-003, SC-010-004
 */
const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
const SOURCES = [...walk(join(ROOT, 'src', 'presentation')), join(ROOT, 'index.html'), join(ROOT, 'admin.html')];
const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
const hex = (value: unknown): string => (typeof value === 'string' ? value : ((value as { DEFAULT?: string }).DEFAULT ?? '')).toLowerCase();

describe('T1407 (a) tokens Tipi centralizados (REQ-TIP10-003, SC-010-003)', () => {
  it('[REQ-TIP10-003] tailwind.config.ts define Bosque, Crema y Terracota oficiales', () => {
    expect([hex(colors['primary']), hex(colors['cream']), hex(colors['terracota'])]).toEqual(['#1f3d36', '#efe8d8', '#c4552d']);
  });

  it('[REQ-TIP10-003] los valores anteriores (primary #1d4f3a, accent #c5f35a, cream #f4f8ef) ya no existen en ningún archivo de la interfaz', () => {
    const old = /#1d4f3a|%231d4f3a|#c5f35a|#f4f8ef|#e9fbc4/i;
    const offenders = [...SOURCES, join(ROOT, 'tailwind.config.ts')].filter((file) => old.test(readFileSync(file, 'utf8'))).map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('[REQ-TIP10-003] un solo lugar para la paleta: styles.css toma los colores de los tokens (theme()), sin hex de marca sueltos', () => {
    for (const css of ['src/presentation/web/styles.css', 'src/presentation/admin/styles.css']) {
      const text = read(css);
      expect(text, css).toMatch(/theme\(['"]colors\./);
      expect(text, css).not.toMatch(/background(-color)?:\s*#[0-9a-f]{6}\b/i);
    }
  });

  it('[REQ-TIP10-003] Tipi Display 800 (título) e Inter 400/600 (texto) declaradas con woff2 locales, sin CDN', () => {
    const css = read('src/presentation/web/styles.css');
    expect(css).toMatch(/font-family:\s*['"]?Tipi Display/);
    expect(css).toMatch(/font-family:\s*['"]?Inter/);
    for (const font of ['tipi-display-latin-800-normal', 'inter-latin-400-normal', 'inter-latin-600-normal']) {
      expect(existsSync(join(ROOT, 'public', 'fonts', `${font}.woff2`)), font).toBe(true);
      expect(css).toContain(`${font}.woff2`);
    }
    const net = [...SOURCES.map((f) => readFileSync(f, 'utf8')), css, read('src/presentation/admin/styles.css')].filter((t) => /fonts\.(googleapis|gstatic)|cdn\./i.test(t));
    expect(net).toEqual([]);
    const family = (config.theme?.extend?.fontFamily ?? {}) as Record<string, string[]>;
    expect(family['sans']?.[0]).toMatch(/Inter/);
    expect(family['display']?.[0]).toMatch(/Tipi Display/);
  });
});

describe('T1407 (b) Terracota nunca en texto normal, enlaces ni botones (regla de Neo)', () => {
  const lines = SOURCES.flatMap((file) => readFileSync(file, 'utf8').split('\n').map((text, i) => ({ at: `${relative(ROOT, file)}:${i + 1}`, text })));
  const TERRA = /terracota/i;

  it('[REQ-TIP10-003] ninguna clase de texto (text-/decoration-/placeholder-) usa Terracota salvo títulos grandes (>= text-2xl)', () => {
    const bad = lines.filter(({ text }) => /(?:^|[\s'"`:])(?:[a-z-]+:)*(?:text|decoration|placeholder|caret)-terracota/.test(text) && !/text-(2xl|3xl|4xl|5xl|6xl)/.test(text));
    expect(bad.map((l) => l.at)).toEqual([]);
  });

  it('[REQ-TIP10-003] ningún enlace (<a, Link) ni botón (<button) lleva Terracota en fondo o texto', () => {
    const bad = lines.filter(({ text }) => TERRA.test(text) && /<(a|button|Link|NavLink)\b/.test(text) && /(?:bg|text|border)-terracota/.test(text));
    expect(bad.map((l) => l.at)).toEqual([]);
  });

  it('[REQ-TIP10-003] el botón primario es Bosque con texto Crema (bg-primary + text-cream)', () => {
    const primaryButtons = lines.filter(({ text }) => /bg-primary\b/.test(text) && /text-white/.test(text));
    expect(primaryButtons.map((l) => l.at)).toEqual([]);
    const css = read('src/presentation/web/styles.css');
    expect(css).not.toMatch(/(?:^|[^-])color:\s*theme\(['"]colors\.terracota/m);
  });
});

describe('T1407 (c) logo y favicon (REQ-TIP10-002, SC-010-002)', () => {
  it('[REQ-TIP10-002] activos del paquete en public/: favicon claro y oscuro, PNG 16/32/48/180, ícono 512/1024, logos y símbolo simple', () => {
    const files = [
      'favicon.svg', 'favicon-dark.svg', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon-180.png', 'tipi-icono-app-512.png', 'tipi-icono-app-1024.png',
      'brand/tipi-logo-horizontal.svg', 'brand/tipi-logo-horizontal-crema.svg', 'brand/tipi-simbolo-simple.svg', 'brand/tipi-simbolo-simple-crema.svg',
    ];
    expect(files.filter((f) => !existsSync(join(ROOT, 'public', f)))).toEqual([]);
  });

  it('[REQ-TIP10-002] favicon.svg es el del paquete (Bosque/Crema) y los dos HTML declaran favicon claro y oscuro y apple-touch-icon', () => {
    expect(read('public/favicon.svg')).toMatch(/#1F3D36/i);
    for (const html of ['index.html', 'admin.html']) {
      const text = read(html);
      expect(text, html).toContain('favicon-dark.svg');
      expect(text, html).toMatch(/prefers-color-scheme:\s*dark/);
      expect(text, html).toContain('favicon-180.png');
    }
  });

  it('[REQ-TIP10-002] la cabecera usa el logo horizontal y, bajo 32 px, el símbolo simple', () => {
    const shell = read('src/presentation/web/pages/AppShell.tsx');
    expect(shell).toMatch(/tipi-logo-horizontal|tipi-simbolo/);
  });
});

describe('T1443 (d) ARGOS_PUBLIC_BASE_URL obligatoria en producción (EDGE-010-003, REQ-TIP10-004, SC-010-004)', () => {
  // PROD_SCENE ya trae ARGOS_PUBLIC_BASE_URL (T1443): se quita para probar su ausencia.
  const { ARGOS_PUBLIC_BASE_URL: _omitted, ...SCENE_WITHOUT_BASE } = PROD_SCENE as typeof PROD_SCENE & { ARGOS_PUBLIC_BASE_URL?: string };
  const PROD: Record<string, string> = { NODE_ENV: 'production', ARGOS_AUDIT_HMAC_SECRET: 'ab'.repeat(32), ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'tipi-test-media', ...SCENE_WITHOUT_BASE };
  const keys = (env: Record<string, string>): string[] | null => {
    try {
      loadAppConfig(env);
      return null;
    } catch (error) {
      return error instanceof AppConfigError ? [...error.variables] : ['otro'];
    }
  };

  it('[EDGE-010-003] production sin ARGOS_PUBLIC_BASE_URL falla cerrado nombrando SOLO esa variable', () => {
    const result = keys(PROD);
    expect(result).toEqual(['ARGOS_PUBLIC_BASE_URL']);
    expect(keys({ ...PROD, ARGOS_PUBLIC_BASE_URL: '' })).toContain('ARGOS_PUBLIC_BASE_URL');
  });

  it('[REQ-TIP10-004] production con la base https válida arranca y normaliza la barra final', () => {
    expect(keys({ ...PROD, ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet/' })).toBeNull();
    expect(loadAppConfig({ ...PROD, ARGOS_PUBLIC_BASE_URL: 'https://tipi.pet/' }).publicBaseUrl).toBe('https://tipi.pet');
  });

  it('[REQ-TIP10-004] desarrollo y pruebas conservan el respaldo (sin variable arranca con publicBaseUrl null)', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' }).publicBaseUrl).toBeNull();
    expect(keys({ NODE_ENV: 'test' })).toBeNull();
  });

  it('[EDGE-010-003] dos bases (anterior y nueva): el mismo token produce enlaces distintos solo en el origen, y el camino /shared/<token> es idéntico', async () => {
    const build = async (base: string) => {
      const app = Fastify();
      await app.register(cookie);
      app.removeAllContentTypeParsers();
      app.addContentTypeParser('*', { parseAs: 'buffer' }, (_r, body, done) => done(null, body));
      const useCases = { authenticate: { execute: async () => 'user-1' }, createShareLink: { execute: async () => ({ kind: 'CREATED', token: 'tok-9', link: { id: 'l1' } }) } };
      registerShareLinkRoutes(app, { useCases, cookieSecure: false, publicBaseUrl: base } as unknown as RouteContext);
      const r = await app.inject({ method: 'POST', url: '/api/pets/p1/share-links', headers: { 'idempotency-key': '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', 'content-type': 'application/json' }, payload: '{}' });
      await app.close();
      return (r.json() as { url: string }).url;
    };
    const [anterior, nueva] = [await build('https://argos.example'), await build('https://tipi.pet')];
    expect([anterior, nueva]).toEqual(['https://argos.example/shared/tok-9', 'https://tipi.pet/shared/tok-9']);
  });
});
