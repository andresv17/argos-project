/**
 * T759 [US4] la página HTML `/shared/{token}` (SPA sin datos) lleva las cabeceras de REQ-VET-006 y su CSP propia, también en el fallback estático y en el 404 de rutas
 * sospechosas; no resuelve el token ni lee la base (REQ-VET-006, A-15 de /trinity, SC-005-020).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createShareApi, type ShareApi } from '../../fixtures/share-api-harness.ts';

const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
let root = '';
let api: ShareApi;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'argos-shared-page-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Argos</title></head><body><div id="root"></div></body></html>');
  writeFileSync(join(root, 'assets', 'app.js'), 'export {};');
});
afterEach(async () => {
  await api?.close();
  rmSync(root, { recursive: true, force: true });
});

const TOKEN = 'T'.repeat(43);

describe('T759 página /shared/{token} (REQ-VET-006, SC-005-020)', () => {
  it('[REQ-VET-006] /shared/{token} sirve index.html con no-store, no-referrer, noindex, nosniff y la CSP de la página (sin script en línea ni recursos de terceros), y no resuelve el token', async () => {
    api = await createShareApi({ staticRoot: root });
    api.calls.length = 0;
    const page = await api.publicGet(`/shared/${TOKEN}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('<div id="root">');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['content-security-policy']).toBe(PAGE_CSP);
    expect(page.headers['set-cookie']).toBeUndefined();
    expect(api.calls).toEqual([]);
  });

  it('[REQ-VET-006] cualquier ruta bajo /shared/ (también barra final o segmentos extra) lleva las mismas cabeceras; una ruta sospechosa da el 404 con las cabeceras y sin eco del token', async () => {
    api = await createShareApi({ staticRoot: root });
    for (const path of [`/shared/${TOKEN}/`, `/shared/${TOKEN}/extra`, '/shared', '/shared/']) {
      const response = await api.publicGet(path);
      expect(response.headers['cache-control'], path).toBe('no-store');
      expect(response.headers['referrer-policy'], path).toBe('no-referrer');
      expect(response.headers['content-security-policy'], path).toBe(PAGE_CSP);
    }
    const suspicious = await api.rawGet('/shared/%2e%2e/%2e%2e/etc');
    expect(suspicious.status).toBe(404);
    expect(suspicious.headers['cache-control']).toBe('no-store');
    expect(suspicious.headers['referrer-policy']).toBe('no-referrer');
    expect(suspicious.text).not.toContain('etc');
  });

  it('[REQ-VET-006] el resto de la SPA conserva su CSP y su política de caché (la página compartida no cambia las demás rutas)', async () => {
    api = await createShareApi({ staticRoot: root });
    const home = await api.publicGet('/');
    expect(home.headers['content-security-policy']).toContain("default-src 'self'");
    expect(home.headers['cache-control']).toBe('no-cache');
    const asset = await api.publicGet('/assets/app.js');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});
