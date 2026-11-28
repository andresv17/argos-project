/**
 * MEDIA-1 de /sati (Feature 012, T1676; REQ-QR12-005, SC-012-051): la hoja A6 de la ficha QR sale en UNA página A6, aunque cuelgue de una app más alta que la hoja,
 * y no se repite en cada página. Se imprime con Chromium real (`page.pdf` con `preferCSSPageSize`) el CSS de producción y el marcado de `EmergencyPrintSheet`.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmergencyPrintSheet, QR_PRINT_PAGE_CSS } from '../../../src/presentation/web/components/EmergencyCard.tsx';

const css = readFileSync('src/presentation/web/styles.css', 'utf8');
const sheetCss = css.slice(css.indexOf('/* Hoja A6 de la ficha QR'));
const QR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

/** La app: un contenedor de pantalla completa con relleno y contenido largo antes y después de la hoja (como el layout real). */
const appHtml = (): string =>
  `<!doctype html><html><head><style>${sheetCss}</style></head><body>
    <div id="root" style="min-height:100vh;padding:40px;display:flex;flex-direction:column">
      <header style="height:900px">Cabecera</header>
      <main style="padding:24px;min-height:2000px"><section>${renderToStaticMarkup(h(EmergencyPrintSheet, { petName: 'Luna', qrSrc: QR }))}<p style="height:1500px">Resto de la ficha</p></section></main>
      <footer style="height:600px">Pie</footer>
    </div></body></html>`;

async function printedPages(printing: boolean): Promise<{ pages: number; mediaBox: number[]; text: string }> {
  const page = await browser.newPage();
  await page.setContent(appHtml());
  await page.emulateMedia({ media: 'print' });
  if (printing) {
    await page.evaluate((pageCss) => {
      document.body.classList.add('printing-qr');
      const style = document.createElement('style');
      style.textContent = pageCss;
      document.head.appendChild(style);
    }, QR_PRINT_PAGE_CSS);
  }
  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
  await page.close();
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = /\/MediaBox\s*\[\s*([\d.\s]+)\]/.exec(pdf)?.[1]?.trim().split(/\s+/).map(Number) ?? [];
  return { pages, mediaBox: box, text: pdf };
}

describe('hoja A6 de la ficha QR al imprimir (MEDIA-1)', () => {
  it('[SC-012-051] con printing-qr sale exactamente 1 página de tamaño A6 (105 x 148 mm)', async () => {
    const { pages, mediaBox } = await printedPages(true);
    expect(pages).toBe(1);
    const [, , width, height] = mediaBox as [number, number, number, number];
    expect(Math.abs(width - (105 / 25.4) * 72)).toBeLessThan(1);
    expect(Math.abs(height - (148 / 25.4) * 72)).toBeLessThan(1);
  });

  it('[SC-012-051] sin printing-qr la hoja no existe en papel y el resto de la app sigue ocupando varias páginas', async () => {
    const { pages } = await printedPages(false);
    expect(pages).toBeGreaterThan(1);
  });
});
