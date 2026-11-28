/**
 * Ficha QR bajo la CSP REAL de producción (Feature 012, T1676; REQ-QR12-005, SC-012-051): la hoja A6 sale en UNA página 105 x 148 mm con el QR cargado,
 * el PNG se genera en el cliente y la descarga SVG no se corta. La CSP es la de `security-headers.ts` (`img-src 'self' data:`, sin `blob:`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmergencyPrintSheet } from '../../../src/presentation/web/components/EmergencyCard.tsx';
import { CONTENT_SECURITY_POLICY } from '../../../src/infrastructure/http/plugins/security-headers.ts';
import { encodeQr, qrToSvg } from '../../../src/domain/emergency/qr-encoder.ts';
import { downloadBlobAs, isSafeQrSvg, svgDataUri } from '../../../src/presentation/web/emergency-view.ts';

const HAS_CHROMIUM = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const css = readFileSync('src/presentation/web/styles.css', 'utf8');
const sheetCss = css.slice(css.indexOf('/* Hoja A6 de la ficha QR'));
const SVG = qrToSvg(encodeQr('https://argos.example/e/token-de-prueba'));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('hoja A6 de la ficha QR — contrato sin navegador (SC-012-051)', () => {
  it('[SC-012-051] el CSS declara @page qr-a6 de 105mm x 148mm sin margen y la hoja usa esa página con nombre', () => {
    expect(css).toMatch(/@page qr-a6\s*{\s*size:\s*105mm 148mm;\s*margin:\s*0;\s*}/);
    expect(css).toMatch(/\.qr-a6\s*{\s*page:\s*qr-a6;\s*}/);
    expect(sheetCss).toContain('body.printing-qr');
  });

  it('[SC-012-051] la CSP de producción no admite blob: y el QR se ofrece como data: URI solo si el SVG es seguro', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("img-src 'self' data:");
    expect(CONTENT_SECURITY_POLICY).not.toContain('blob:');
    const uri = svgDataUri(SVG);
    expect(uri?.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    expect(isSafeQrSvg(SVG)).toBe(true);
    expect(svgDataUri('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBeNull();
  });

  it('[SC-012-051] el SVG del codificador declara width y height además de viewBox', () => {
    expect(SVG).toMatch(/<svg [^>]*width="49" height="49" viewBox="0 0 49 49"/);
  });
});

/** Separadores de la app como clases (la CSP real no admite `style` en línea). */
const spacerCss = '.app{min-height:100vh;padding:40px;display:flex;flex-direction:column}.s900{height:900px}.s2000{padding:24px;min-height:2000px}.s1500{height:1500px}.s600{height:600px}';
/** `emergency-view.ts` de producción empaquetado para ejecutarlo dentro de Chromium. */
const viewBundleFn = (): string =>
  buildSync({ entryPoints: ['src/presentation/web/emergency-view.ts'], bundle: true, write: false, format: 'iife', globalName: 'View', platform: 'browser' }).outputFiles[0]!.text;
let browser: Browser | undefined;
let server: Server | undefined;
let origin = '';
beforeAll(async () => {
  if (!HAS_CHROMIUM) return;
  browser = await chromium.launch();
  server = createServer((req, res) => {
    const csp = { 'content-security-policy': CONTENT_SECURITY_POLICY };
    if (req.url === '/app.css') res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', ...csp }).end(`${spacerCss}\n${sheetCss}`);
    else if (req.url === '/view.js') res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', ...csp }).end(viewBundleFn());
    else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...csp }).end(appHtml());
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => (server === undefined ? resolve() : void server.close(() => resolve())));
});

/** La hoja cuelga directo de `body` (como el portal de producción); la app es más alta que la hoja. */
function appHtml(): string {
  const sheet = renderToStaticMarkup(h(EmergencyPrintSheet, { petName: 'Luna', qrSrc: svgDataUri(SVG) ?? '' }));
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body>
    <div id="root" class="app"><header class="s900">Cabecera</header><main class="s2000"><p class="s1500">Resto de la ficha</p></main><footer class="s600">Pie</footer></div>${sheet}</body></html>`;
}

describe.skipIf(!HAS_CHROMIUM)('ficha QR con Chromium bajo la CSP real de producción', () => {
  it('[SC-012-051] la función de producción svgToPngBlob devuelve un Blob PNG con firma válida (sin CSP violada) y null ante un SVG inseguro', async () => {
    const page = await browser!.newPage();
    await page.addInitScript('window.__v = []; document.addEventListener("securitypolicyviolation", (e) => window.__v.push(e.violatedDirective));');
    await page.goto(origin);
    await page.addScriptTag({ url: '/view.js' });
    const result = await page.evaluate(async (svg) => {
      const view = (window as unknown as { View: { svgToPngBlob: (s: string, n?: number) => Promise<Blob | null> } }).View;
      const blob = await view.svgToPngBlob(svg, 256);
      const unsafe = await view.svgToPngBlob('<svg><script></script></svg>');
      return { type: blob?.type ?? null, head: blob === null ? null : Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)), unsafe };
    }, SVG);
    const violations = await page.evaluate(() => (window as unknown as { __v: string[] }).__v);
    await page.close();
    expect(result).toEqual({ type: 'image/png', head: PNG_SIGNATURE, unsafe: null });
    expect(violations).toEqual([]);
  });

  it('[SC-012-051] con printing-qr sale exactamente 1 página de 105 x 148 mm, con el QR cargado (naturalWidth > 0) y 0 violaciones de CSP', async () => {
    const page = await browser!.newPage();
    await page.addInitScript('window.__v = []; document.addEventListener("securitypolicyviolation", (e) => window.__v.push(e.violatedDirective));');
    await page.goto(origin);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.body.classList.add('printing-qr'));
    const natural = await page.evaluate(async () => {
      const img = document.querySelector<HTMLImageElement>('.qr-a6__code')!;
      await img.decode();
      return img.naturalWidth;
    });
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    const violations = await page.evaluate(() => (window as unknown as { __v: string[] }).__v);
    await page.close();
    const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const [, , width, height] = (/\/MediaBox\s*\[\s*([\d.\s]+)\]/.exec(pdf)?.[1]?.trim().split(/\s+/).map(Number) ?? []) as [number, number, number, number];
    expect(natural).toBe(49);
    expect(violations).toEqual([]);
    expect(pages).toBe(1);
    expect(Math.abs(width - (105 / 25.4) * 72)).toBeLessThan(1);
    expect(Math.abs(height - (148 / 25.4) * 72)).toBeLessThan(1);
  });

  it('[SC-012-051] sin printing-qr la hoja no existe en papel y el resto de la app sigue ocupando varias páginas', async () => {
    const page = await browser!.newPage();
    await page.goto(origin);
    await page.emulateMedia({ media: 'print' });
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    await page.close();
    expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('descarga SVG — la URL del Blob se revoca DESPUÉS del click (SC-012-051)', () => {
  it('[SC-012-051] no revoca de forma síncrona, difiere 10 s y marca rel=noopener', () => {
    const calls: string[] = [];
    const timers: Array<{ ms: number; fn: () => void }> = [];
    const anchor = { href: '', download: '', rel: '', click: () => calls.push('click'), remove: () => calls.push('remove') };
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { document: g.document, URL: g.URL, setTimeout: g.setTimeout };
    const FakeUrl = Object.assign(function () {}, { createObjectURL: () => 'blob:fake', revokeObjectURL: (u: string) => calls.push(`revoke:${u}`) });
    g.document = { createElement: () => anchor, body: { appendChild: () => calls.push('append') } };
    g.URL = FakeUrl;
    g.setTimeout = (fn: () => void, ms: number) => timers.push({ fn, ms });
    try {
      downloadBlobAs(new Blob([SVG], { type: 'image/svg+xml' }), 'ficha-qr-emergencia.svg');
      expect(calls).toEqual(['append', 'click', 'remove']);
      expect(anchor.rel).toBe('noopener');
      expect(timers.map((t) => t.ms)).toEqual([10_000]);
      timers[0]!.fn();
      expect(calls).toEqual(['append', 'click', 'remove', 'revoke:blob:fake']);
    } finally {
      Object.assign(g, saved);
    }
  });
});
