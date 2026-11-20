/**
 * T592 [US5/US4] E2E con las cabeceras de CSP de producción y WCAG 2.1 AA a 320, 1024 y 1280 px del recortador de avatar, el visor de medios y `PetForm`
 * (REQ-AVA-002, REQ-FRM-002, REQ-ARC-003). El documento de la SPA se sirve con la política real de `buildContentSecurityPolicy` de `security-headers.ts` (no una copia, con el host de medios de producción): toda
 * violación de CSP (`securitypolicyviolation`) hace fallar la prueba; la SPA se compila con `vite build` y se sirve bajo esa cabecera. La accesibilidad se mide con `@axe-core/playwright`
 * (etiquetas wcag2a/wcag2aa/wcag21a/wcag21aa; cero violaciones de cualquier impacto), sin desbordamiento horizontal y con las comprobaciones de teclado y de
 * objetivo táctil de Playwright (nombre accesible, foco visible, 44 px).
 *
 * @implements REQ-AVA-002, REQ-FRM-002, REQ-ARC-003
 */
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { buildContentSecurityPolicy } from '../../../src/infrastructure/http/plugins/security-headers.ts';
import { createPetViaApi, registerViaApi, VIEWPORT_WIDTHS } from '../visual/e2e-support.ts';
import { makeImage } from '../media/media-support.ts';

/**
 * El servidor de desarrollo de Vite inyecta scripts y estilos en línea que la política de producción (`default-src 'self'`) bloquearía y que no existen en
 * producción. Por eso la SPA se compila una vez con `vite build` (la misma salida que se despliega) y se sirve desde disco bajo la cabecera real; `/api`
 * sigue yendo al servidor Fastify de la prueba.
 */
let dist = '';
let context: BrowserContext;
/** Bucket de medios de producción simulado: la CSP real lo admite en `img-src` y `frame-src` (REQ-GCS-004) y el visor recibe URLs de ese host. */
const MEDIA_HOST = 'argos-media-t592.storage.googleapis.com';
const PRODUCTION_CSP = buildContentSecurityPolicy(MEDIA_HOST);
const DEV_API = 'http://127.0.0.1:3100';
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

/** Registra violaciones de CSP del documento y sirve la SPA compilada con la cabecera de producción. */
async function withProductionCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] };
    w.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => w.__violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === MEDIA_HOST) {
      // «GCS»: sirve los bytes que el adaptador de memoria guardó (la ruta de desarrollo `/__dev/media/` del API), con su tipo.
      const stored = await context.request.get(`${DEV_API}/__dev/media/${url.pathname.slice(1)}`);
      return route.fulfill({ status: stored.status(), body: await stored.body(), contentType: stored.headers()['content-type'] ?? 'application/octet-stream' });
    }
    if (/^\/api\/pets\/[^/]+\/media\/[^/]+\/access$/.test(url.pathname)) {
      // La URL firmada de producción es del host de GCS: se reescribe la que devuelve el adaptador de memoria.
      const response = await route.fetch();
      const access = (await response.json()) as { url: string; expiresAt: string };
      return route.fulfill({ response, json: { ...access, url: `https://${MEDIA_HOST}/${access.url.replace('/__dev/media/', '')}` } });
    }
    if (url.pathname.startsWith('/api/') || route.request().method() !== 'GET') return route.fallback();
    const file = join(dist, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    const isAsset = url.pathname.startsWith('/assets/') && existsSync(file);
    if (isAsset) return route.fulfill({ body: readFileSync(file), contentType: MIME[extname(file)] ?? 'application/octet-stream' });
    if (route.request().resourceType() !== 'document') return route.fallback();
    // Documento de la SPA (cualquier ruta del cliente): index.html compilado con la CSP de producción.
    return route.fulfill({ body: readFileSync(join(dist, 'index.html')), contentType: MIME['.html']!, headers: { 'content-security-policy': PRODUCTION_CSP } });
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);

/** axe-core WCAG 2.1 A/AA en un ancho: todas las violaciones (cualquier impacto) y el desbordamiento horizontal. */
async function wcagAt(page: Page, screen: string, width: number): Promise<string[]> {
  await page.setViewportSize({ width, height: 900 });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = result.violations.map((v) => `${screen}@${width}px ${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) found.push(`${screen}@${width}px desbordamiento horizontal`);
  return found;
}

/** Alto y ancho mínimos de los controles visibles y habilitados indicados (WCAG 2.5.5 como criterio de proyecto: 44 px). */
async function smallTargets(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 44 || box.width < 44)
      .map(({ name, box }) => `${name} ${Math.round(box.width)}x${Math.round(box.height)}`),
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('CSP de producción y WCAG 2.1 AA a 320/1024/1280 px: recortador, visor y PetForm (T592)', () => {
  test.beforeAll(async ({ browser }, info) => {
    dist = mkdtempSync(join(tmpdir(), 'argos-t592-dist-'));
    execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], { stdio: 'pipe', timeout: 120_000 });
    context = await browser.newContext();
    await registerViaApi(context.request, `t592.${info.project.name}`, 'Dueña T592', 'T592Clave2026!');
    await createPetViaApi(context.request, 'Argos', 'CANINE');
  });
  test.afterAll(async () => {
    rmSync(dist, { recursive: true, force: true });
    await context.close();
  });

  async function newPage(): Promise<Page> {
    const page = await context.newPage();
    await withProductionCsp(page);
    return page;
  }
  async function selectPet(page: Page): Promise<void> {
    await page.goto('/');
    await page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').filter({ hasText: 'Argos' }).first().click();
    await expect(page.getByRole('heading', { name: 'Argos', level: 2 })).toBeVisible();
  }

  test('[REQ-FRM-002] la cabecera de producción llega al documento y la SPA arranca bajo ella', async () => {
    const page = await newPage();
    const response = await page.goto('/');
    expect(response!.headers()['content-security-policy']).toBe(PRODUCTION_CSP);
    expect(PRODUCTION_CSP).toContain("default-src 'self'");
    expect(PRODUCTION_CSP).toContain(`img-src 'self' data: https://${MEDIA_HOST}`);
    expect(PRODUCTION_CSP).toContain(`frame-src https://${MEDIA_HOST}`);
    await expect(page.getByRole('listbox', { name: 'Mascotas' }).getByRole('option').filter({ hasText: 'Argos' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('[REQ-FRM-002] PetForm de alta y de edición: axe sin violaciones a 320, 1024 y 1280 px, etiquetas por campo y objetivos de 44 px', async () => {
    const page = await newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Nueva mascota' }).click();
    const nameField = page.getByLabel('Nombre', { exact: false }).first();
    await expect(nameField).toBeVisible();
    const findings: string[] = [];
    for (const width of VIEWPORT_WIDTHS) {
      findings.push(...(await wcagAt(page, 'PetForm-alta', width)));
      expect(await smallTargets(page, 'form button, form select, form input:not([type=checkbox]):not([type=radio])')).toEqual([]);
    }
    // Todo campo del formulario tiene nombre accesible (WCAG 4.1.2 / 1.3.1).
    const unnamed = await page.locator('form input, form select, form textarea').evaluateAll((els) =>
      els.filter((el) => {
        const e = el as HTMLInputElement;
        return !(e.labels && e.labels.length > 0) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby');
      }).map((el) => el.id || el.getAttribute('name') || el.tagName),
    );
    expect(unnamed).toEqual([]);
    // Con errores de validación: el formulario vacío se rechaza y los mensajes quedan asociados.
    await nameField.fill('');
    await page.getByRole('button', { name: /Guardar|Crear|Registrar/ }).first().click();
    findings.push(...(await wcagAt(page, 'PetForm-errores', 320)));
    await page.getByRole('button', { name: 'Cancelar' }).first().click();
    // Edición.
    await selectPet(page);
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await expect(page.locator('#avatar-file')).toBeVisible();
    for (const width of VIEWPORT_WIDTHS) findings.push(...(await wcagAt(page, 'PetForm-edicion', width)));
    expect(findings).toEqual([]);
    expect(await violations(page)).toEqual([]);
  });

  test('[REQ-AVA-002] recortador de avatar: axe a 320, 1024 y 1280 px, vista previa operable por teclado con rol y nombre, sin violaciones de CSP', async () => {
    const page = await newPage();
    await selectPet(page);
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    await page.locator('#avatar-file').setInputFiles({ name: 'ancha.png', mimeType: 'image/png', buffer: (await makeImage(page, 'image/png', 400, 200))! });
    const preview = page.getByRole('img', { name: /Vista previa circular/ });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usar esta foto' })).toBeVisible();
    const findings: string[] = [];
    for (const width of VIEWPORT_WIDTHS) {
      findings.push(...(await wcagAt(page, 'recortador', width)));
      await expect(preview).toBeVisible();
      const box = (await preview.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(width);
      expect(await smallTargets(page, 'button')).toEqual([]);
    }
    expect(findings).toEqual([]);
    // Teclado: la vista previa recibe el foco, muestra un indicador de foco y las flechas la mueven sin perder el foco.
    await page.locator('#avatar-file').focus();
    await page.keyboard.press('Tab');
    await expect(preview).toBeFocused();
    const outline = await preview.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outlineWidth: parseFloat(s.outlineWidth), outlineStyle: s.outlineStyle, shadow: s.boxShadow };
    });
    expect((outline.outlineStyle !== 'none' && outline.outlineWidth > 0) || outline.shadow !== 'none').toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(preview).toBeFocused();
    expect(await violations(page)).toEqual([]);
  });

  test('[REQ-ARC-003] visor de medios (imagen y PDF): axe a 320, 1024 y 1280 px, nombre accesible, cierre por teclado y URL del visor admitida por la CSP', async () => {
    const page = await newPage();
    await selectPet(page);
    await page.getByRole('tab', { name: 'Historial / Archivos' }).click();
    const photo = (await makeImage(page, 'image/png', 120, 60))!;
    await page.locator('#clinical-file').setInputFiles({ name: 'foto-visor.png', mimeType: 'image/png', buffer: photo });
    await page.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ver foto-visor.png' })).toBeVisible();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n', 'latin1');
    await page.locator('#clinical-file').setInputFiles({ name: 'informe.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ver informe.pdf' })).toBeVisible();

    const findings: string[] = [];
    // Imagen.
    await page.getByRole('button', { name: 'Ver foto-visor.png' }).click();
    const viewer = page.getByRole('region', { name: 'Visor de foto-visor.png' });
    const image = viewer.getByRole('img', { name: 'foto-visor.png' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(new URL((await image.getAttribute('src'))!).host).toBe(MEDIA_HOST);
    for (const width of VIEWPORT_WIDTHS) {
      findings.push(...(await wcagAt(page, 'visor-imagen', width)));
      expect(await smallTargets(page, 'section[aria-label^="Visor de"] button')).toEqual([]);
    }
    // Enlace «Abrir o descargar» seguro (WCAG 3.2.5/seguridad): se abre aparte sin pasar el opener.
    const link = viewer.getByRole('link', { name: 'Abrir o descargar' });
    await expect(link).toHaveAttribute('rel', /noopener/);
    // Teclado: el botón de cierre se alcanza y se activa con Enter.
    const close = viewer.getByRole('button', { name: 'Cerrar visor' });
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(viewer).toHaveCount(0);
    // PDF: bajo `sm` el iframe se oculta y queda el enlace; en escritorio el marco lleva título.
    await page.getByRole('button', { name: 'Ver informe.pdf' }).click();
    const pdfViewer = page.getByRole('region', { name: 'Visor de informe.pdf' });
    await expect(pdfViewer.getByRole('link', { name: 'Abrir o descargar' })).toBeVisible();
    for (const width of VIEWPORT_WIDTHS) {
      findings.push(...(await wcagAt(page, 'visor-pdf', width)));
      const frame = pdfViewer.locator('iframe[title="PDF informe.pdf"]');
      await expect(frame).toHaveCount(1);
      if (width >= 1024) await expect(frame).toBeVisible();
      else await expect(frame).toBeHidden();
    }
    expect(findings).toEqual([]);
    expect(await violations(page)).toEqual([]);
    // La política sigue cerrando el resto: una imagen de otro host se bloquea por `img-src` y queda registrada.
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.alt = '';
      img.src = 'https://evil.example/pixel.png';
      document.body.append(img);
    });
    await expect.poll(async () => (await violations(page)).length).toBe(1);
    expect((await violations(page))[0]).toMatch(/^img-src(-elem)? https:\/\/evil\.example/);
  });
});
