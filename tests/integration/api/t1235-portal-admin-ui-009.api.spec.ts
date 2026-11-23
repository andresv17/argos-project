import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adminKit } from '../../fixtures/admin-fixtures.ts';
import { createApi, type Api } from './api-harness.ts';

/**
 * T1235 (Feature 009, Fase 3, #19): UI del portal `/admin`, comprobaciones que no necesitan navegador (A14, A15, A10 estático y aislamiento del bundle).
 * REQ-ADM9-001, NFR-009-001; SC-009-009 (404 uniforme), SC-009-010 (la app de usuarios no sabe que /admin existe).
 * Las comprobaciones de navegador (axe, teclado, contraste, foco) viven en `tests/e2e/admin/t1235-portal-admin-ui.spec.ts`.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const ADMIN_HTML = '<!doctype html><html lang="es"><head><title>Administración — ARGOS</title></head><body><div id="admin-root"></div></body></html>';
const USER_HTML = '<!doctype html><html lang="es"><head><title>ARGOS</title></head><body><div id="root"></div></body></html>';

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css|html)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe('T1235 [REQ-ADM9-001] [SC-009-009] el servidor sirve el documento propio del portal solo en GET /admin', () => {
  it('GET /admin sin sesión sirve admin.html (no el index.html de usuarios); /admin/otra y /api/admin/session son el 404 uniforme text/plain', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-t1235-'));
    writeFileSync(join(dir, 'index.html'), USER_HTML);
    writeFileSync(join(dir, 'admin.html'), ADMIN_HTML);
    api = await createApi(undefined, { admin: adminKit().admin, staticRoot: dir });
    const portal = await api.call('GET', '/admin', { contract: false });
    expect(portal.status).toBe(200);
    expect(portal.text).toContain('id="admin-root"');
    expect(portal.text).not.toContain('id="root"');
    expect(String(portal.headers['content-type'])).toMatch(/text\/html/);
    for (const path of ['/admin/otra', '/admin/', '/api/admin/session']) {
      const hidden = await api.call('GET', path, { contract: false });
      expect(hidden.status, path).toBe(404);
      expect(String(hidden.headers['content-type']), path).toMatch(/^text\/plain/);
      expect(hidden.text, path).toBe('Not Found');
    }
    // El resto de rutas de la SPA de usuarios sigue cayendo en index.html.
    const login = await api.call('GET', '/login', { contract: false });
    expect(login.text).toContain('id="root"');
  });
});

describe('T1235 [REQ-ADM9-001] [INV-ADM9-002] sin admin.html el portal falla cerrado', () => {
  it('GET /admin con index.html pero SIN admin.html es el 404 uniforme text/plain y nunca la app de usuarios', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'argos-t1235-sin-admin-'));
    writeFileSync(join(dir, 'index.html'), USER_HTML);
    api = await createApi(undefined, { admin: adminKit().admin, staticRoot: dir });
    for (const method of ['GET', 'HEAD'] as const) {
      const res = await api.call(method, '/admin', { contract: false });
      expect(res.status, method).toBe(404);
      expect(String(res.headers['content-type']), method).toMatch(/^text\/plain/);
      expect(res.text, method).not.toContain('id="root"');
      if (method === 'GET') expect(res.text).toBe('Not Found');
    }
  });
});

describe('T1235 [SC-009-010] [A14] la app de usuarios no contiene rastro del portal', () => {
  // «Administrador» ya existe en la app de usuarios como ROL DE HOGAR (feature 008: ADMIN/Cuidador/Lector); no es el portal. Se fija la línea base: solo esos tres archivos, ninguno nuevo.
  const HOUSEHOLD_ROLE_FILES = ['pages/HouseholdsPage.tsx', 'role-help.ts', 'view-model.ts'];
  it('cero «/admin» y cero menciones del portal en src/presentation/web; «Administrador» solo como rol de hogar preexistente', () => {
    const offenders: string[] = [];
    const withRole: string[] = [];
    for (const file of listFiles(join(ROOT, 'src/presentation/web'))) {
      const text = readFileSync(file, 'utf8');
      if (/\/admin/i.test(text)) offenders.push(`${file}: /admin`);
      if (/portal de administraci|Administraci[oó]n — ARGOS/i.test(text)) offenders.push(`${file}: portal`);
      if (/Administrador/.test(text)) withRole.push(file.slice(join(ROOT, 'src/presentation/web').length + 1));
    }
    expect(offenders).toEqual([]);
    expect(withRole.sort()).toEqual(HOUSEHOLD_ROLE_FILES);
    expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).not.toMatch(/admin/i);
  });
});

describe('T1235 [REQ-ADM9-001] [A10] [A16] [A17] entrada y bundle propios del portal', () => {
  const admin = (): string => readFileSync(join(ROOT, 'admin.html'), 'utf8');
  it('admin.html: lang es, título, viewport, robots noindex, referrer no-referrer, sin script en línea ni recursos remotos', () => {
    const html = admin();
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<title>Administración — ARGOS</title>');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).toContain('src="/src/presentation/admin/main.tsx"');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('src/presentation/admin existe, no importa nada de la app de usuarios (web/), React Router ni sesión, y no usa «/admin/» como ruta de activos', () => {
    const files = listFiles(join(ROOT, 'src/presentation/admin'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from ['"][^'"]*\/web\//);
      expect(text, file).not.toMatch(/react-router/);
      expect(text, file).not.toMatch(/session\.tsx|App\.tsx/);
      expect(text, file).not.toMatch(/https?:\/\//);
    }
  });

  it('el enlace de acceso apunta exacto a /api/admin/auth/google/start y el cierre usa DELETE /api/admin/session con X-Argos-Request', () => {
    const source = listFiles(join(ROOT, 'src/presentation/admin')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(source).toContain('/api/admin/auth/google/start');
    expect(source).toContain('/api/admin/session');
    expect(source).toMatch(/X-Argos-Request/i);
    expect(source).not.toMatch(/adminId|idleExpiresAt/);
  });

  it('textos prohibidos en la pantalla de acceso (EDGE-009-008)', () => {
    const source = listFiles(join(ROOT, 'src/presentation/admin')).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const banned of ['correo no autorizado', 'no eres administrador', 'solicita acceso']) expect(source.toLowerCase()).not.toContain(banned);
    // T1250: «pendientes» solo existe en el panel de solicitudes del shell autenticado; el archivo que contiene la pantalla de acceso no lo menciona (el contador no se filtra sin sesión).
    expect(readFileSync(join(ROOT, 'src/presentation/admin/AdminPortal.tsx'), 'utf8').toLowerCase()).not.toContain('pendientes');
  });

  it('vite construye admin.html como segunda entrada (bundle propio)', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/admin:\s*resolve\([^)]*admin\.html/);
  });
});
