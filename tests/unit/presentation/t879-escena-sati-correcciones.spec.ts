/**
 * T879 (006, Fase 7): correcciones de /sati a la interfaz de la escena (revisión `sati-006-escena-revision.md`): H-S1 jerarquía de encabezados, H-S2 foco en los
 * alertdialog, H-S3 «Recargar la página» en OUTDATED, H-S4 rejilla desde lg:, H-S5 medida de lectura, H-S6 motivo del botón deshabilitado, H-S10 botón en su línea,
 * H-S12 chip BORRADOR retirado en la Fase 14 (T950), H-S13 aria-busy durante la generación.
 * REQ-ESC6-019, REQ-ESC6-021, REQ-ESC6-026, NFR-ESC6-004; EDGE-ESC6-018; SC-ESC6-033.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyDialogFocus, dialogFocusTransition, type FocusTarget } from '../../../src/presentation/web/dialog-focus.ts';
import { HouseholdPhotoView, type HouseholdPhotoViewProps } from '../../../src/presentation/web/components/HouseholdPhoto.tsx';
import { SceneBlockView } from '../../../src/presentation/web/components/SceneBlock.tsx';
import { SceneConsentView, SceneNoticeCollapsed, type SceneConsentViewProps } from '../../../src/presentation/web/components/SceneConsent.tsx';
import { NOTICE_SECTIONS } from '../../../src/presentation/web/scene-notice.ts';
import { HOUSEHOLD_ID, sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
function consent(overrides: Partial<SceneConsentViewProps> = {}): string {
  return renderToStaticMarkup(
    h(SceneConsentView, { idPrefix: 'e', step: 'ASK', accepted: false, busy: false, confirmRevoke: false, error: null, onAccept: noop, onGrant: noop, onDecline: noop, onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onReload: noop, ...overrides }),
  );
}
function photo(overrides: Partial<HouseholdPhotoViewProps> = {}): string {
  return renderToStaticMarkup(
    h(HouseholdPhotoView, { idPrefix: 'e', photoState: 'ABSENT', photoSrc: `/api/households/${HOUSEHOLD_ID}/photo`, canUpload: true, chosenName: null, uploading: false, confirmDelete: false, error: null, onPhotoLoad: noop, onPhotoError: noop, onChoose: noop, onUpload: noop, onAskDelete: noop, onConfirmDelete: noop, onCancelDelete: noop, ...overrides }),
  );
}
function block(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(h(SceneBlockView, { idPrefix: 'e', scope: { kind: 'OWNER' }, view: sceneView(), status: 'READY', error: null, busy: false, onRegenerate: noop, ...overrides }));
}

describe('T879 H-S1 jerarquía de encabezados (WCAG 1.3.1)', () => {
  it('por defecto (Mis mascotas): h2 → h3 → h4; dentro de la tarjeta del hogar (h3): h4 → h5 → h6', () => {
    expect(block()).toMatch(/<h2[^>]*>Escena del hogar<\/h2>/);
    expect(consent()).toMatch(/<h3[^>]*>/);
    expect(consent()).toMatch(/<h4[^>]*>1\./);
    expect(photo()).toMatch(/<h3[^>]*>\s*Foto del hogar/);
    expect(block({ headingLevel: 4 })).toMatch(/<h4[^>]*>Escena del hogar<\/h4>/);
    const c = consent({ headingLevel: 5 });
    expect(c).toMatch(/<h5[^>]*>Crear la imagen/);
    expect(c).toMatch(/<h6[^>]*>1\./);
    expect(c).not.toMatch(/<h[234]/);
    expect(photo({ headingLevel: 5 })).toMatch(/<h5[^>]*>\s*Foto del hogar/);
  });
});

describe('T879 H-S2 gestión de foco en los alertdialog (WCAG 2.4.3, 4.1.2)', () => {
  it('abrir entra al diálogo, cerrar vuelve al disparador, sin cambio no hace nada', () => {
    expect(dialogFocusTransition(false, true)).toBe('ENTER');
    expect(dialogFocusTransition(true, false)).toBe('RETURN');
    expect(dialogFocusTransition(false, false)).toBe('NONE');
    expect(dialogFocusTransition(true, true)).toBe('NONE');
  });

  it('ENTER enfoca el diálogo; RETURN enfoca el disparador y, si ya no existe, el encabezado (nunca body)', () => {
    const calls: string[] = [];
    const t = (name: string): FocusTarget => ({ focus: () => void calls.push(name) });
    applyDialogFocus('ENTER', { dialog: t('dialog'), trigger: t('trigger'), fallback: t('fallback') });
    applyDialogFocus('RETURN', { dialog: t('dialog'), trigger: t('trigger'), fallback: t('fallback') });
    applyDialogFocus('RETURN', { dialog: null, trigger: null, fallback: t('fallback') });
    applyDialogFocus('NONE', { dialog: t('dialog'), trigger: t('trigger'), fallback: t('fallback') });
    expect(calls).toEqual(['dialog', 'trigger', 'fallback']);
  });

  it('los diálogos son enfocables (tabIndex -1) y los textos de apoyo siguen presentes', () => {
    expect(consent({ step: 'GRANTED', confirmRevoke: true })).toMatch(/role="alertdialog"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="alertdialog"/);
    expect(photo({ confirmDelete: true, photoState: 'PRESENT' })).toMatch(/role="alertdialog"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="alertdialog"/);
  });
});

describe('T879 H-S3 OUTDATED con acción', () => {
  it('muestra «Recargar la página» y no permite consentir', () => {
    const html = consent({ step: 'OUTDATED' });
    expect(/<button[^>]*>Recargar la página<\/button>/.test(html)).toBe(true);
    expect(/<button[^>]*>Consentir y continuar<\/button>/.test(html)).toBe(false);
    expect(textOf(html)).toMatch(/aviso cambió/i);
  });
});

describe('T879 H-S4 rejilla de dos columnas desde lg: y H-S13 aria-busy', () => {
  it('el bloque usa una rejilla de dos columnas desde lg: con la imagen a la izquierda (sin mx-auto)', () => {
    const html = block();
    expect(html).toMatch(/lg:grid-cols-\[/);
    expect(/<img[^>]*class="[^"]*mx-auto/.test(html)).toBe(false);
  });

  it('durante la generación la imagen anterior lleva aria-busy; en reposo no', () => {
    expect(/<img[^>]*aria-busy="true"/.test(block({ view: sceneView({ status: 'generating' }) }))).toBe(true);
    expect(/<img[^>]*aria-busy/.test(block())).toBe(false);
  });
});

describe('T879 H-S5 medida de lectura (max-w-prose)', () => {
  it('cada párrafo del aviso, la casilla y la nota de la foto llevan max-w-prose', () => {
    const html = consent();
    for (const section of NOTICE_SECTIONS) for (const paragraph of section.paragraphs) expect(html).toMatch(new RegExp(`<p class="[^"]*max-w-prose[^"]*">\\s*${paragraph.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(html).toMatch(/<label[^>]*class="[^"]*max-w-prose/);
    expect(photo()).toMatch(/<p class="[^"]*max-w-prose[^"]*">Es opcional/);
  });
});

describe('T879 H-S6 y H-S10 consentimiento', () => {
  it('H-S6: el botón «Consentir y continuar» deshabilitado se explica y se enlaza con aria-describedby; marcada la casilla el motivo desaparece', () => {
    const html = consent();
    const button = /<button[^>]*>Consentir y continuar<\/button>/.exec(html)?.[0] ?? '';
    const id = /aria-describedby="([^"]+)"/.exec(button)?.[1] ?? '';
    expect(id).not.toBe('');
    expect(html).toMatch(new RegExp(`id="${id}"[^>]*>Marca la casilla para continuar`));
    const ok = consent({ accepted: true });
    expect(ok).not.toContain('Marca la casilla para continuar');
    expect(/<button[^>]*aria-describedby[^>]*>Consentir y continuar<\/button>/.test(ok)).toBe(false);
  });

  it('H-S10: «Leer el aviso» no va dentro de un párrafo', () => {
    const html = renderToStaticMarkup(h(SceneNoticeCollapsed, { onRead: noop }));
    expect(html).toMatch(/<button[^>]*>Leer el aviso<\/button>/);
    expect(/<p[^>]*>(?:(?!<\/p>)[\s\S])*<button/.test(html)).toBe(false);
    expect(textOf(html)).toMatch(/solo si das tu consentimiento/);
  });
});

describe('T879 H-S12 el chip de borrador se retiró con el aviso final (T950)', () => {
  it('ASK, OUTDATED y GRANTED ya no muestran chip ni frase de borrador', () => {
    for (const step of ['ASK', 'OUTDATED', 'GRANTED'] as const) expect(consent({ step })).not.toMatch(/BORRADOR/);
    expect(textOf(consent({ step: 'GRANTED' }))).not.toMatch(/pendiente de revisión y firma legal/i);
  });
});
