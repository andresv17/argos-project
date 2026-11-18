/**
 * T767 / T775 / T777 [US4 + vista de US5] interfaz del enlace veterinario (S4 «Compartir con mi veterinario», S5 vista del resumen, S6 impresión, S7 enlace no
 * disponible; REQ-VET-001, REQ-VET-005, REQ-SUM-004, REQ-SUM-005, REQ-SUM-007; SC-005-015, SC-005-019, SC-005-031, SC-005-032, SC-005-035, SC-005-040,
 * SC-005-046). Render estático de los componentes puros; el comportamiento en navegador real se prueba en `tests/e2e/enlace/`.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { SharedSummaryDocument, SharedUnavailable, formatUtcStamp, type SharedSummaryViewModel } from '../../../src/presentation/web/components/SharedSummary.tsx';

const noop = (): void => undefined;
const LINK_ID = '5a5a5a5a-0000-4000-8000-000000000001';
const link = (over: Record<string, unknown> = {}) => ({ id: LINK_ID, scope: 'PET', petId: 'p', householdId: null, status: 'ACTIVE', createdAt: '2026-11-18T12:00:00.000Z', expiresAt: '2026-11-25T12:00:00.000Z', revokedAt: null, includeMicrochip: false, includeClinicalFiles: false, ...over });

function shareView(over: Partial<ShareLinksViewProps> = {}): string {
  const props: ShareLinksViewProps = {
    petName: 'Luna',
    household: { petCount: 3 },
    now: '2026-11-18T12:00:00.000Z',
    scope: 'PET',
    expiresInDays: 7,
    includeMicrochip: false,
    includeClinicalFiles: false,
    busy: false,
    error: null,
    created: null,
    copyStatus: 'IDLE',
    list: { items: [], activeCount: 0, maxActiveLinks: 20 },
    confirmRevokeId: null,
    notice: null,
    onScope: noop,
    onExpiry: noop,
    onMicrochip: noop,
    onClinicalFiles: noop,
    onCreate: noop,
    onCancel: noop,
    onCopy: noop,
    onDone: noop,
    onAskRevoke: noop,
    onConfirmRevoke: noop,
    onCancelRevoke: noop,
    onPreview: noop,
    ...over,
  } as ShareLinksViewProps;
  return renderToStaticMarkup(h(ShareLinksView, props));
}

describe('T767 S4 «Compartir con mi veterinario» (REQ-VET-001, REQ-VET-005, SC-005-015, SC-005-040)', () => {
  it('[SC-005-040][D5-14][D5-21] las casillas de microchip y archivos clínicos nacen desmarcadas, visibles y con descripción; la caducidad por defecto es 7 días', () => {
    const markup = shareView();
    expect(markup).toContain('Compartir con mi veterinario');
    expect(markup).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
    for (const label of ['Incluir el número de microchip', 'Incluir archivos clínicos']) expect(markup).toContain(label);
    expect(markup).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(markup).toContain('Si no la marcas, el resumen no muestra el microchip.');
    expect(markup).toMatch(/<input[^>]*type="radio"[^>]*value="7"[^>]*checked|<input[^>]*checked[^>]*type="radio"[^>]*value="7"|<input[^>]*value="7"[^>]*checked/);
    expect(markup.match(/type="radio"[^>]*name="expiresInDays"/g)).toHaveLength(3);
    expect(markup).not.toContain('role="switch"');
  });

  it('[REQ-VET-001] fieldset/legend para alcance y caducidad; la opción «Todo el hogar» solo aparece si la mascota pertenece a un hogar y muestra el número de mascotas', () => {
    const markup = shareView();
    expect(markup.match(/<fieldset/g)).toHaveLength(2);
    expect(markup).toContain('¿Qué quieres compartir?');
    expect(markup).toContain('¿Cuánto tiempo estará disponible?');
    expect(markup).toContain('Solo esta mascota (Luna)');
    expect(markup).toContain('Todo el hogar (3 mascotas)');
    expect(shareView({ household: null })).not.toContain('Todo el hogar');
  });

  it('[REQ-VET-004] el texto de apoyo muestra la fecha de vencimiento resultante (7 días desde ahora) y el aviso permanente de credencial', () => {
    const markup = shareView();
    expect(markup).toContain('Vence el 25 nov 2026');
    expect(shareView({ expiresInDays: 1 })).toContain('Vence el 19 nov 2026');
    expect(shareView({ expiresInDays: 30 })).toContain('Vence el 18 dic 2026');
    expect(markup).toContain('Quien tenga el enlace puede ver el resumen sin iniciar sesión, hasta que venza o lo revoques.');
    expect(markup).toContain('Crear enlace');
    expect(markup).toContain('Cancelar');
    expect(markup).toContain('Ver vista previa del resumen');
  });

  it('[REQ-VET-001][INV-005-005] el resultado muestra la URL una sola vez en un campo de solo lectura, con «Copiar enlace», el aviso «no se vuelve a mostrar» y sin autofocus', () => {
    const url = `https://argos.example/shared/${'A'.repeat(43)}`;
    const markup = shareView({ created: { url, scopeLabel: 'Luna', expiresAt: '2026-11-25T12:00:00.000Z', includeMicrochip: false, includeClinicalFiles: false } });
    expect(markup).toContain('Enlace creado');
    expect(markup).toContain('Este enlace no se vuelve a mostrar. Cópialo ahora.');
    expect(markup).toContain(url);
    expect(markup).toMatch(/<input[^>]*readOnly=""[^>]*autoComplete="off"|<input[^>]*autoComplete="off"[^>]*readOnly=""/);
    expect(markup).not.toMatch(/autoFocus|autofocus/);
    expect(markup).toContain('Copiar enlace');
    expect(markup).toContain('Microchip: no incluido');
    expect(shareView({ created: null })).not.toContain(url);
    expect(shareView({ created: { url, scopeLabel: 'Luna', expiresAt: '2026-11-25T12:00:00.000Z', includeMicrochip: true, includeClinicalFiles: true }, copyStatus: 'COPIED' })).toContain('Enlace copiado');
    expect(shareView({ created: { url, scopeLabel: 'Luna', expiresAt: '2026-11-25T12:00:00.000Z', includeMicrochip: false, includeClinicalFiles: false }, copyStatus: 'FAILED' })).toContain('No se pudo copiar. Selecciona el texto y cópialo.');
  });

  it('[SC-005-019][SC-005-046] la lista muestra solo metadatos con insignias de texto (Activo, Revocado, Vencido), microchip Incluido/No incluido y «Revocar» solo en ACTIVO; sin token ni hash', () => {
    const list = { items: [link(), link({ id: LINK_ID.replace('01', '02'), status: 'REVOKED', revokedAt: '2026-11-19T00:00:00.000Z', includeMicrochip: true }), link({ id: LINK_ID.replace('01', '03'), status: 'EXPIRED' })], activeCount: 1, maxActiveLinks: 20 } as never;
    const markup = shareView({ list });
    for (const text of ['Activo', 'Revocado', 'Vencido', 'Microchip: Incluido', 'Microchip: No incluido', '1 de 20 enlaces activos']) expect(markup).toContain(text);
    expect(markup.match(/>Revocar</g)).toHaveLength(1);
    expect(markup).not.toMatch(/token|hash/i);
    expect(markup).not.toMatch(/Eliminar enlace|Reactivar/);
  });

  it('[SC-005-046][D5-22] «Revocar» pide confirmación en línea («¿Revocar este enlace? Dejará de funcionar de inmediato.») con Revocar/Cancelar; solo entonces se envía', () => {
    const list = { items: [link()], activeCount: 1, maxActiveLinks: 20 } as never;
    const markup = shareView({ list, confirmRevokeId: LINK_ID });
    expect(markup).toContain('¿Revocar este enlace? Dejará de funcionar de inmediato.');
    expect(markup).not.toContain('role="dialog"');
    expect(shareView({ list })).not.toContain('Dejará de funcionar de inmediato');
    expect(shareView({ list, notice: 'Enlace revocado' })).toMatch(/role="status"[^>]*>[^<]*Enlace revocado/);
  });

  it('[REQ-VET-001] sin enlaces muestra el vacío «Todavía no has compartido nada.» y el error de creación va en una alerta', () => {
    expect(shareView()).toContain('Todavía no has compartido nada. Crea un enlace para que tu veterinario vea el resumen sin cuenta.');
    expect(shareView({ error: 'Se alcanzó el máximo de 20 enlaces activos para este alcance. Revoca alguno para crear otro.' })).toMatch(/role="alert"[^>]*>[^<]*máximo de 20 enlaces/);
  });

  it('[SC-005-040] el componente no recuerda la casilla entre sesiones ni guarda el enlace: sin localStorage, sessionStorage, document.cookie ni dangerouslySetInnerHTML', () => {
    const source = readFileSync(new URL('../../../src/presentation/web/components/ShareLinks.tsx', import.meta.url), 'utf8');
    for (const forbidden of ['localStorage', 'sessionStorage', 'document.cookie', 'dangerouslySetInnerHTML', 'indexedDB']) expect(source).not.toContain(forbidden);
  });
});

const FILE_ID = '88888888-8888-4888-8888-888888888801';
function model(over: { microchip?: boolean; files?: boolean; household?: boolean; fileName?: string; empty?: boolean } = {}): SharedSummaryViewModel {
  const profile = { name: 'Argos', species: 'CANINE', speciesOther: null, breed: 'Pastor Alemán', sex: 'MALE', neutered: null, birthDate: '2022-05-10', birthDateIsEstimate: false, age: { years: 4, months: 6, totalDays: 1650 }, ...(over.microchip ? { microchipId: '982000123456789' } : {}) };
  const pet = (name: string) => ({
    profile: { ...profile, name },
    weights: over.empty ? [] : [{ recordedAt: '2026-11-01', weightKg: 32.85, notes: null }],
    bodyMeasurements: [],
    vaccinations: over.empty ? [] : [{ vaccineName: 'Séxtuple Canina', appliedAt: '2025-11-12', nextBoosterAt: '2026-11-12', batchOrClinic: null, veterinarianName: null, notes: null }],
    dewormings: [],
    medicalVisits: [],
    symptoms: [],
    otherParameters: [],
    clinicalFiles: over.files ? [{ id: FILE_ID, mime: 'application/pdf', sizeBytes: 2048, createdAt: '2026-11-10T10:00:00.000Z' }] : [],
  });
  return {
    summary: {
      summaryVersion: '1.0.0',
      generatedAt: '2026-11-18T14:32:00.000Z',
      scope: over.household ? 'HOUSEHOLD' : 'PET',
      dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED',
      automaticInterpretation: 'NONE',
      disclosure: { microchipIncluded: over.microchip === true, clinicalFilesIncluded: over.files === true },
      pets: over.household ? [pet('Argos'), pet('Luna')] : [pet('Argos')],
    },
    fileLabels: over.files ? [{ fileId: FILE_ID, displayName: over.fileName ?? 'Análisis Luna.pdf' }] : [],
    validUntil: '2026-11-25T12:00:00.000Z',
  } as unknown as SharedSummaryViewModel;
}
const doc = (view: SharedSummaryViewModel, mode: 'PUBLIC' | 'PREVIEW' = 'PUBLIC', token: string | null = 'T'.repeat(43)) =>
  renderToStaticMarkup(h(SharedSummaryDocument, { view, mode, downloadHref: token === null ? null : (id: string) => `/api/shared/${token}/files/${id}`, onPrint: noop }));

describe('T775 S5 vista del resumen: solo lectura (REQ-SUM-004, SC-005-031)', () => {
  it('[SC-005-031] título, fecha UTC de generación, vigencia, aviso «no sustituye la consulta veterinaria» y procedencia del cuidador', () => {
    const markup = doc(model());
    expect(markup).toContain('Resumen clínico de Argos');
    expect(markup).toContain('Generado el 18 nov 2026, 14:32 (UTC)');
    expect(markup).toContain('Enlace vigente hasta 25 nov 2026, 12:00 (UTC)');
    expect(markup).toContain('Este resumen no sustituye la consulta veterinaria.');
    expect(markup).toContain('Datos registrados por el cuidador; no verificados por un profesional.');
    expect(markup).toContain('Datos al momento de esta consulta; pueden cambiar');
    expect(formatUtcStamp('2026-11-18T14:32:00.000Z')).toBe('18 nov 2026, 14:32 (UTC)');
  });

  it('[SC-005-031][REQ-SUM-004] cero formularios y controles de edición: el único control es «Imprimir / Guardar como PDF»', () => {
    const markup = doc(model({ files: true, household: true }));
    for (const forbidden of ['<form', '<input', '<textarea', '<select', 'contenteditable']) expect(markup).not.toContain(forbidden);
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain('Imprimir / Guardar como PDF');
  });

  it('[REQ-SUM-004] cada módulo siempre aparece; vacío dice «Sin registros.» (la ausencia explícita es información)', () => {
    const markup = doc(model({ empty: true }));
    for (const heading of ['Peso', 'Medidas', 'Vacunas', 'Desparasitaciones', 'Consultas', 'Síntomas', 'Otros parámetros', 'Archivos clínicos']) expect(markup).toContain(heading);
    expect(markup.match(/Sin registros\./g)!.length).toBe(8);
    const filled = doc(model());
    expect(filled).toContain('32,85 kg');
    expect(filled).toContain('Séxtuple Canina');
    expect(filled.match(/Sin registros\./g)!.length).toBe(6);
  });

  it('[REQ-SUM-004] el alcance hogar usa el título «Resumen clínico · Hogar compartido · N mascotas», un índice de anclas y una sección h2 por mascota', () => {
    const markup = doc(model({ household: true }));
    expect(markup).toContain('Resumen clínico · Hogar compartido · 2 mascotas');
    expect(markup.match(/<h2/g)).toHaveLength(2);
    expect(markup).toMatch(/href="#pet-1"/);
    expect(markup).not.toContain('Casa Vallejo');
  });

  it('[D5-14][MAG-005-005] el microchip aparece solo si el enlace lo incluyó; si no, «Microchip no compartido por el cuidador»', () => {
    expect(doc(model({ microchip: true }))).toContain('982000123456789');
    const off = doc(model());
    expect(off).not.toContain('982000123456789');
    expect(off).toContain('Microchip no compartido por el cuidador');
  });

  it('[SC-005-035][INV-005-009] el nombre del archivo se muestra como texto escapado (nunca un elemento), con translate="no", y un nombre vacío se rotula «Archivo»', () => {
    const hostile = doc(model({ files: true, fileName: '<img src=x onerror=alert(1)>.pdf' }));
    expect(hostile).toContain('&lt;img src=x onerror=alert(1)&gt;.pdf');
    expect(hostile).not.toMatch(/<img|<script|onerror=alert\(1\)>(?!\.)/);
    expect(hostile).toContain('translate="no"');
    expect(doc(model({ files: true, fileName: 'Archivo' }))).toContain('>Archivo<');
  });

  it('[SC-005-035][SC-005-023] el enlace de descarga apunta a la ruta pública de archivos, con rel="noopener noreferrer", nombre accesible con el archivo y sin <img>, <iframe> ni <object>', () => {
    const markup = doc(model({ files: true }));
    expect(markup).toContain(`href="/api/shared/${'T'.repeat(43)}/files/${FILE_ID}"`);
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('Descargar Análisis Luna.pdf');
    for (const forbidden of ['<img', '<iframe', '<object', '<embed']) expect(markup).not.toContain(forbidden);
    expect(doc(model({ files: true }), 'PREVIEW', null)).not.toContain('/files/');
  });

  it('[D5-15] la vista previa añade la franja «Vista previa — así lo verá tu veterinario. Aún no se ha compartido nada.» con role="note" y el botón de volver', () => {
    const markup = doc(model(), 'PREVIEW', null);
    expect(markup).toMatch(/role="note"[^>]*>[^<]*Vista previa — así lo verá tu veterinario\. Aún no se ha compartido nada\./);
    expect(doc(model())).not.toContain('Vista previa');
    expect(doc(model())).not.toContain('role="note"');
  });

  it('[SC-005-031] sin recursos externos, scripts, estilos en línea ni HTML sin escapar en el componente (CSP de la página: default-src none, style-src self)', () => {
    const source = readFileSync(new URL('../../../src/presentation/web/components/SharedSummary.tsx', import.meta.url), 'utf8');
    for (const forbidden of ['dangerouslySetInnerHTML', 'style={{', 'http://', 'https://', 'innerHTML', 'localStorage']) expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain(forbidden);
    expect(doc(model({ files: true }))).not.toMatch(/ style="/);
    expect(doc(model())).not.toMatch(/<link|<script|https?:\/\//);
  });

  it('[REQ-SUM-008] no hay interpretación automática: ninguna alerta, valoración ni texto generado', () => {
    expect(doc(model())).not.toMatch(/alerta|anormal|urgente|riesgo|vencid/i);
  });
});

describe('T777 S6 impresión (REQ-SUM-005, SC-005-032, SC-005-047, EDGE-005-30)', () => {
  const css = readFileSync(new URL('../../../src/presentation/web/styles.css', import.meta.url), 'utf8');
  const printCss = css.slice(css.indexOf('@media print'));

  it('[SC-005-032] la hoja @media print usa @page { margin: 0 }, fondo blanco, oculta cabecera, franja, botón e índice y evita cortes dentro de las filas', () => {
    expect(css).toContain('@media print');
    expect(printCss).toMatch(/@page\s*\{\s*margin:\s*0/);
    expect(printCss).toMatch(/break-inside:\s*avoid/);
    expect(printCss).toMatch(/break-after:\s*avoid/);
    expect(printCss).toMatch(/\.print-hide[\s\S]*display:\s*none/);
    expect(printCss).toMatch(/a\[href\]::after\s*\{\s*content:\s*none/);
  });

  it('[SC-005-032][EDGE-005-30] los elementos de pantalla llevan print-hide y la leyenda «Datos al momento de esta consulta; pueden cambiar» solo se ve al imprimir', () => {
    const markup = doc(model({ files: true }), 'PREVIEW', null);
    expect(markup).toMatch(/class="[^"]*print-hide[^"]*"[^>]*>[^<]*(?:Imprimir \/ Guardar como PDF|Vista previa)/);
    expect(markup).toMatch(/class="[^"]*print-only[^"]*"[^>]*>[^<]*Datos al momento de esta consulta; pueden cambiar/);
    expect(printCss).toMatch(/\.print-only[\s\S]*display:\s*block/);
  });

  it('[SC-005-047] en papel no se imprimen los nombres de archivo ni las URL: los rótulos de archivo se ocultan al imprimir y no hay href visible', () => {
    expect(printCss).toMatch(/\.print-hide-file-name|\.file-name[\s\S]*display:\s*none/);
  });
});

describe('S7 enlace no disponible y límite de tasa (REQ-VET-007, INV-005-007)', () => {
  it('[REQ-VET-007] el mensaje es único para inexistente, vencido, revocado y mascota inaccesible; no dice «revocado» ni «vencido» como diagnóstico, sin botones ni enlaces', () => {
    const markup = renderToStaticMarkup(h(SharedUnavailable, { reason: 'NOT_FOUND' }));
    expect(markup).toContain('Este enlace no está disponible');
    expect(markup).toContain('El enlace no existe, venció o fue revocado. Pide a quien te lo compartió que genere uno nuevo.');
    for (const forbidden of ['<button', '<a ', '<img', '<form']) expect(markup).not.toContain(forbidden);
    expect(markup).toContain('<h1');
  });

  it('[REQ-VET-007] el 429 muestra «Demasiados intentos» sin prometer una duración', () => {
    const markup = renderToStaticMarkup(h(SharedUnavailable, { reason: 'RATE_LIMITED' }));
    expect(markup).toContain('Demasiados intentos');
    expect(markup).toContain('Espera unos minutos y vuelve a abrir el enlace.');
    expect(markup).not.toMatch(/\d+ minutos|10 minutos/);
  });
});
