/**
 * T1533 [US5, Bloque E, #31] informe del veterinario (vista pública `/shared/{token}`): una sección diferenciada por mascota con encabezado semántico, el avatar SOLO
 * en el encabezado de su sección (D11-09 = A; nunca foto de álbum ni de expediente), mismo contenido de datos, sin campos prohibidos y reflow a 320 px. Render
 * estático de `SharedSummaryDocument`. Contrato de props que fija T1533 para T1535: `avatarHref?: (petIndex: number) => string | null` (ausente o `null` = sin imagen).
 *
 * @implements REQ-VET11-001, REQ-VET11-002, REQ-VET11-003, INV-VET11-001, SC-011-035, SC-011-036, SC-011-037, SC-011-038, SC-011-039, SC-011-040
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BRAND_NAME } from '../../../src/presentation/web/brand.ts';
import { sharedAvatarPath } from '../../../src/presentation/web/share-api.ts';
import { SharedSummaryDocument, type SharedSummaryViewModel } from '../../../src/presentation/web/components/SharedSummary.tsx';

const noop = (): void => undefined;
const TOKEN = 'T'.repeat(43);
const FILE_ID = '88888888-8888-4888-8888-888888888801';
const PET_IDS = ['aaaaaaaa-1111-4111-8111-aaaaaaaaaa01', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaa02'];

function model(names: readonly string[]): SharedSummaryViewModel {
  const profile = { species: 'CANINE', speciesOther: null, breed: 'Pastor Alemán', sex: 'MALE', neutered: null, birthDate: '2022-05-10', birthDateIsEstimate: false, age: { years: 4, months: 6, totalDays: 1650 } };
  const pet = (name: string) => ({
    profile: { ...profile, name },
    weights: [{ recordedAt: '2026-11-01', weightKg: 32.85, notes: null }],
    bodyMeasurements: [],
    vaccinations: [{ vaccineName: 'Séxtuple Canina', appliedAt: '2025-11-12', nextBoosterAt: null, batchOrClinic: null, veterinarianName: null, notes: null }],
    dewormings: [],
    medicalVisits: [],
    symptoms: [],
    otherParameters: [],
    clinicalFiles: [{ id: FILE_ID, mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-10T10:00:00.000Z' }],
  });
  return {
    summary: {
      summaryVersion: '1.0.0',
      generatedAt: '2026-11-18T14:32:00.000Z',
      scope: names.length > 1 ? 'HOUSEHOLD' : 'PET',
      dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED',
      automaticInterpretation: 'NONE',
      disclosure: { microchipIncluded: false, clinicalFilesIncluded: true },
      pets: names.map(pet),
    },
    fileLabels: [{ fileId: FILE_ID, displayName: 'Análisis.pdf' }],
    validUntil: '2026-11-25T12:00:00.000Z',
  } as unknown as SharedSummaryViewModel;
}

type AvatarHref = (petIndex: number) => string | null;
const avatarOf: AvatarHref = (i) => `/api/shared/${TOKEN}/pets/${PET_IDS[i]}/avatar`;
const render = (view: SharedSummaryViewModel, avatarHref?: AvatarHref | null): string =>
  renderToStaticMarkup(h(SharedSummaryDocument, { view, mode: 'PUBLIC', downloadHref: (id: string) => `/api/shared/${TOKEN}/files/${id}`, onPrint: noop, ...(avatarHref === undefined ? {} : { avatarHref }) } as never));
const sections = (markup: string): string[] => markup.split(/(?=<section )/).slice(1).map((s) => s.slice(0, s.indexOf('</section>') + 10));
const beforeFirstH3 = (section: string): string => section.slice(0, section.indexOf('<h3'));

describe('T1533 informe: una sección por mascota con encabezado semántico (REQ-VET11-001, SC-011-035, SC-011-036)', () => {
  it('[REQ-VET11-001][SC-011-035] cada mascota del hogar es una <section> nombrada por su <h2>; los módulos son <h3> dentro de ella y hay un único <h1>', () => {
    const markup = render(model(['Argos', 'Luna']));
    const parts = sections(markup);
    expect(parts).toHaveLength(2);
    expect(markup.match(/<h1[ >]/g)).toHaveLength(1);
    expect(markup.match(/<h2[ >]/g)).toHaveLength(2);
    parts.forEach((section, i) => {
      expect(section).toMatch(new RegExp(`aria-labelledby="pet-${i + 1}-title"`));
      expect(section).toMatch(new RegExp(`<h2[^>]*id="pet-${i + 1}-title"[^>]*>[\\s\\S]*${i === 0 ? 'Argos' : 'Luna'}[\\s\\S]*</h2>`));
      expect(section.match(/<h3[ >]/g)!.length).toBeGreaterThanOrEqual(8);
    });
  });

  it('[REQ-VET11-001][SC-011-036] las secciones se distinguen a simple vista: cada sección es una tarjeta o bloque con borde, fondo o sombra propios (no solo un salto de impresión)', () => {
    for (const section of sections(render(model(['Argos', 'Luna'])))) {
      const cls = /^<section[^>]*class="([^"]*)"/.exec(section)![1]!;
      expect(cls).toMatch(/\b(border|rounded(-\w+)?|shadow(-\w+)?|bg-(?!transparent)\S+|ring-\d)\b/);
    }
  });

  it('[REQ-VET11-001] el informe lleva marca y vigencia en el encabezado y listas (<ul>/<li>) para los registros, con el mismo contenido de datos que sin avatar', () => {
    const plain = render(model(['Argos', 'Luna']));
    expect(plain).toContain(BRAND_NAME.toUpperCase());
    expect(plain).toContain('Enlace vigente hasta');
    expect(plain).toMatch(/<ul[^>]*>[\s\S]*<li[^>]*>/);
    const withAvatar = render(model(['Argos', 'Luna']), avatarOf);
    const text = (html: string): string => html.replace(/<img[^>]*>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
    expect(text(withAvatar)).toBe(text(plain));
  });
});

describe('T1533 informe: avatar solo en el encabezado de su sección (REQ-VET11-002, INV-VET11-001, D11-09 = A)', () => {
  it('[REQ-VET11-002][SC-011-037] con avatar, cada sección tiene EXACTAMENTE una <img> y está en su encabezado (antes del primer módulo <h3>), apuntando a la ruta dedicada del enlace', () => {
    const markup = render(model(['Argos', 'Luna']), avatarOf);
    expect(markup.match(/<img[ >]/g)).toHaveLength(2);
    sections(markup).forEach((section, i) => {
      expect(section.match(/<img[ >]/g)).toHaveLength(1);
      const head = beforeFirstH3(section);
      expect(head).toMatch(/<img[ >]/);
      expect(head).toContain(`src="${avatarOf(i)}"`);
    });
  });

  it('[REQ-VET11-002] la imagen no filtra: sin srcset, sin referente, sin credenciales cruzadas, con dimensiones declaradas (sin saltos de maquetación) y con texto alternativo propio', () => {
    const img = /<img[^>]*>/.exec(render(model(['Argos']), avatarOf))![0];
    expect(img).toMatch(/referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/i);
    expect(img).not.toMatch(/srcset|crossorigin|use-credentials/i);
    expect(img).toMatch(/\bwidth="\d+"/);
    expect(img).toMatch(/\bheight="\d+"/);
    expect(img).toMatch(/\balt="[^"]*"/);
  });

  it('[REQ-VET11-002][INV-VET11-001] el HTML nunca incluye fotos de álbum o de expediente, claves de objeto, ids internos, correos ni URLs de la API autenticada', () => {
    const markup = render(model(['Argos', 'Luna']), avatarOf);
    const srcs = [...markup.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
    for (const src of srcs) expect(src).toMatch(new RegExp(`^/api/shared/${TOKEN}/pets/[0-9a-f-]{36}/avatar$`));
    expect(markup).not.toMatch(/\/api\/pets\/|\/media|\/album|pets\/[0-9a-f-]{36}\/(files|avatar)\/|objectId|object_id|ownerUserId|userId|@[a-z0-9.-]+\.[a-z]{2,}|<iframe|<video|<picture|<svg/i);
    expect(markup.replace(/href="[^"]*\/files\/[^"]*"/g, '')).not.toContain(FILE_ID);
  });

  it('[REQ-VET11-002] sin avatar (mascota sin foto, prop ausente o null) no hay <img> y el encabezado no deja hueco; mezcla: solo la mascota con foto la muestra', () => {
    expect(render(model(['Argos', 'Luna']))).not.toMatch(/<img/);
    expect(render(model(['Argos', 'Luna']), null)).not.toMatch(/<img/);
    const mixed = render(model(['Argos', 'Luna']), (i) => (i === 1 ? avatarOf(1) : null));
    const [first, second] = sections(mixed);
    expect(first).not.toMatch(/<img/);
    expect(second!.match(/<img[ >]/g)).toHaveLength(1);
  });

  it('[REQ-VET11-002][SC-011-038] la vista previa del propietario (sin token) no pide ninguna imagen y el documento no importa módulos de fotos ni de álbum', () => {
    const preview = renderToStaticMarkup(h(SharedSummaryDocument, { view: model(['Argos']), mode: 'PREVIEW', downloadHref: null, onPrint: noop }));
    expect(preview).not.toMatch(/<img/);
    const source = readFileSync(new URL('../../../src/presentation/web/components/SharedSummary.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/media-api|media-view|album|photo|\/api\/pets\//i);
  });
});

describe('T1533 informe: reflow a 320 px sin scroll horizontal (REQ-VET11-003, SC-011-039, SC-011-040)', () => {
  const source = readFileSync(new URL('../../../src/presentation/web/components/SharedSummary.tsx', import.meta.url), 'utf8');

  it('[REQ-VET11-003][SC-011-039] el encabezado de la sección envuelve (flex-wrap o columna), el nombre puede partirse (min-w-0 + break-words) y el avatar no se encoge ni desborda (shrink-0, tamaño fijo ≤ 96 px)', () => {
    const head = beforeFirstH3(sections(render(model(['Argos']), avatarOf))[0]!);
    expect(head).toMatch(/class="[^"]*\b(flex-wrap|flex-col|grid)\b/);
    expect(head).toMatch(/class="[^"]*\bmin-w-0\b[^"]*\b(break-words|\[overflow-wrap:anywhere\])\b|class="[^"]*\b(break-words|\[overflow-wrap:anywhere\])\b[^"]*\bmin-w-0\b/);
    const img = /<img[^>]*>/.exec(head)![0];
    expect(img).toMatch(/class="[^"]*\bshrink-0\b/);
    const w = Number(/\bwidth="(\d+)"/.exec(img)![1]);
    expect(w).toBeGreaterThanOrEqual(32);
    expect(w).toBeLessThanOrEqual(96);
  });

  it('[REQ-VET11-003][SC-011-039] ningún ancho fijo supera 320 px ni hay overflow-x, tablas rígidas o texto sin salto en el documento (prueba estática del código)', () => {
    for (const m of source.matchAll(/\b(?:min-w|w)-\[(\d+)px\]/g)) expect(Number(m[1])).toBeLessThanOrEqual(320);
    expect(source).not.toMatch(/overflow-x-(auto|scroll)|whitespace-nowrap|<table|min-w-\[|w-screen/);
    expect(source).toContain('min-w-0');
    expect(source).toMatch(/max-w-3xl/);
  });

  it('[REQ-VET11-003][SC-011-040] el árbol conserva el orden de lectura y de foco: marca, título, vigencia, botón, navegación del hogar y secciones; la navegación y el botón no se ocultan en pantalla', () => {
    const markup = render(model(['Argos', 'Luna']), avatarOf);
    const order = [BRAND_NAME.toUpperCase(), '<h1', 'Enlace vigente hasta', 'Imprimir / Guardar como PDF', 'aria-label="Mascotas del resumen"', '<section'].map((needle) => markup.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('T1535 contenedor: la URL del avatar sale de petIds y de la ruta dedicada (REQ-VET11-002)', () => {
  it('[REQ-VET11-002] sharedAvatarPath arma solo la ruta del enlace (sin /api/pets) y codifica token e id', () => {
    expect(sharedAvatarPath(TOKEN, PET_IDS[0]!)).toBe(`/api/shared/${TOKEN}/pets/${PET_IDS[0]}/avatar`);
    expect(sharedAvatarPath('a/b', 'c d')).toBe('/api/shared/a%2Fb/pets/c%20d/avatar');
  });

  it('[REQ-VET11-002] SharedPage pasa avatarHref desde view.petIds (null si falta) y no usa otra fuente', () => {
    const source = readFileSync(new URL('../../../src/presentation/web/pages/SharedPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain('state.view.petIds');
    expect(source).toContain('sharedAvatarPath(token, petId)');
    expect(source).not.toMatch(/\/api\/pets\/|album|media-api/i);
  });
});

describe('T1535 corrección Sati: nav de mascotas sin overflow a 320 px y con foco visible (WCAG 1.4.10, 2.4.7)', () => {
  const LONG = 'A'.repeat(50);
  it('[REQ-VET11-002] los enlaces de la nav con nombre de 50 caracteres sin espacios llevan ajuste de línea y foco terracota', () => {
    const html = render(model([LONG, 'Luna']));
    const nav = html.match(/<nav aria-label="Mascotas del resumen"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toContain(LONG);
    const anchors = nav.match(/<a [^>]*>/g) ?? [];
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a).toContain('break-words');
      expect(a).toContain('[overflow-wrap:anywhere]');
      expect(a).toContain('min-w-0');
      expect(a).toContain('focus-visible:ring-2');
      expect(a).toContain('focus-visible:ring-terracota');
    }
    expect(nav.match(/<nav [^>]*>/)?.[0]).toContain('[overflow-wrap:anywhere]');
  });
});
