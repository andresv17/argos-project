/**
 * T877 (006, Fase 7): aviso previo y consentimiento en el cliente. Texto EMPAQUETADO con `NOTICE_VERSION` y `PROVIDER_ID` como constantes (iguales a las del servidor),
 * alcance por usuario, versión desactualizada pide reconsentir, retiro con confirmación y la declaración de que la normalización es parcial (N2-01 = B), de PITR y de
 * personas fortuitas. El texto es el BORRADOR `aviso-consentimiento-borrador.md` hasta la firma legal de Neo (REQ-ESC6-026).
 * REQ-ESC6-021, REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-026; EDGE-ESC6-018, EDGE-ESC6-023; ERR-SCENE-NOTICE-OUTDATED; SC-ESC6-033, SC-ESC6-036, SC-ESC6-039, SC-ESC6-040, SC-ESC6-067.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../../src/domain/scene/notice.ts';
import { SceneConsentView, type SceneConsentViewProps } from '../../../src/presentation/web/components/SceneConsent.tsx';
import { NOTICE_DRAFT, NOTICE_PROVIDER_ID, NOTICE_SECTIONS, NOTICE_VERSION, consentBody, consentStep } from '../../../src/presentation/web/scene-notice.ts';
import { sceneView } from './escena-fixtures.ts';

const noop = (): void => undefined;
function render(overrides: Partial<SceneConsentViewProps> = {}): string {
  const props: SceneConsentViewProps = {
    idPrefix: 'escena-h1',
    step: 'ASK',
    accepted: false,
    busy: false,
    confirmRevoke: false,
    error: null,
    onAccept: noop,
    onGrant: noop,
    onDecline: noop,
    onAskRevoke: noop,
    onConfirmRevoke: noop,
    onCancelRevoke: noop,
    onReload: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(SceneConsentView, props));
}
const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('T877 constantes y pasos del consentimiento (REQ-ESC6-023, EDGE-ESC6-018)', () => {
  it('[REQ-ESC6-026] NOTICE_VERSION y PROVIDER_ID del cliente son constantes iguales a las del servidor (si divergieran el consentimiento quedaría inválido)', () => {
    expect([NOTICE_VERSION, NOTICE_PROVIDER_ID]).toEqual([SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID]);
    expect(readFileSync('src/presentation/web/scene-notice.ts', 'utf8')).not.toMatch(/import\.meta\.env|process\.env/);
  });

  it('[REQ-ESC6-023] el cuerpo del consentimiento lleva la versión y el proveedor del cliente y los dos alcances (HOUSEHOLD_PHOTO y PET_PHOTOS)', () => {
    expect(consentBody()).toEqual({ noticeVersion: NOTICE_VERSION, providerId: NOTICE_PROVIDER_ID, scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] });
  });

  it('[EDGE-ESC6-018][SC-ESC6-036] paso GRANTED con consentimiento vigente de la versión y proveedor actuales; ASK sin él; OUTDATED si el servidor ya exige otra versión o proveedor', () => {
    const granted = sceneView().consent;
    expect(consentStep(granted)).toBe('GRANTED');
    expect(consentStep({ ...granted, householdPhotoGranted: false, petPhotosGranted: false })).toBe('ASK');
    expect(consentStep({ ...granted, householdPhotoGranted: true, petPhotosGranted: false })).toBe('ASK'); // alcance por usuario: faltan los avatares
    expect(consentStep({ ...granted, noticeVersion: '2' })).toBe('OUTDATED');
    expect(consentStep({ ...granted, providerId: 'otro-proveedor' })).toBe('OUTDATED');
  });
});

describe('T877 texto del aviso empaquetado (REQ-ESC6-026, C4)', () => {
  const all = NOTICE_SECTIONS.map((s) => `${s.title} ${s.paragraphs.join(' ')}`).join(' ');

  it('[REQ-ESC6-026][SC-ESC6-033] declara los 6 elementos: qué se envía, a quién, dónde, cuánto retiene, no subir personas y sin respaldo con cómo borrar', () => {
    expect(NOTICE_SECTIONS).toHaveLength(6);
    for (const piece of [/foto de tu hogar/i, /avatar/i, /imagen de la escena anterior/i, /Google/, /Vertex AI/, /región/i, /transferencia internacional/i, /retiene|retención/i, /no subas fotos/i, /no se incluyen en el respaldo/i, /Retirar consentimiento y borrar imágenes de la escena/]) expect(all).toMatch(piece);
  });

  it('[N2-01 = B][EDGE-ESC6-023][SC-ESC6-067] declara que la normalización de metadatos es PARCIAL: quita metadatos pero no recodifica ni reduce la imagen', () => {
    expect(all).toMatch(/parcial/i);
    expect(all).toMatch(/no (se )?(recodifica|reduce)/i);
  });

  it('[RR-06-07][RR-06-10] declara las copias técnicas (hasta 6 horas de recuperación a un instante y 14 días de volcados) y a las personas fortuitas en las fotos', () => {
    expect(all).toMatch(/6 horas/);
    expect(all).toMatch(/14 días/);
    expect(all).toMatch(/personas/i);
    expect(all).toMatch(/sin que lo notes|fortuit/i);
  });

  it('[REQ-ESC6-026] sigue marcado BORRADOR hasta la firma legal de Neo y ninguna sección promete datos sin fuente (retención del proveedor pendiente de confirmar)', () => {
    expect(NOTICE_DRAFT).toBe(true);
    expect(all).toMatch(/pendiente de confirmar/i);
  });

  it('[SC-ESC6-040] el texto no contiene nombres de mascotas ni de personas (es estático, sin datos del usuario)', () => {
    expect(all).not.toMatch(/Luna|Rocky|Andr[eé]s|@\w+/);
  });
});

describe('T877 pantalla del aviso y del consentimiento (REQ-ESC6-023, REQ-ESC6-025)', () => {
  it('[SC-ESC6-033] ASK: muestra el aviso completo, la etiqueta de borrador y «Consentir y continuar» deshabilitado hasta marcar la casilla; «Ahora no» siempre disponible', () => {
    const html = render();
    const text = textOf(html);
    expect(text).toContain('Crear la imagen de tu hogar con inteligencia artificial');
    expect(text).toMatch(/borrador/i);
    const grant = /<button[^>]*>Consentir y continuar<\/button>/.exec(html)?.[0] ?? '';
    expect(grant.replace(/class="[^"]*"/, '')).toMatch(/\sdisabled(=|\s|>)/);
    expect(/<button[^>]*>Ahora no<\/button>/.test(html)).toBe(true);
    const accepted = /<button[^>]*>Consentir y continuar<\/button>/.exec(render({ accepted: true }))?.[0] ?? '';
    expect(accepted.replace(/class="[^"]*"/, '')).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it('[NFR-ESC6-004] la casilla tiene etiqueta asociada, alcance por usuario («tus» datos) y todo describedby apunta a un elemento', () => {
    const html = render();
    const checkbox = /<input[^>]*type="checkbox"[^>]*>/.exec(html)?.[0] ?? '';
    const id = /id="([^"]+)"/.exec(checkbox)?.[1] ?? '';
    expect(html).toContain(`for="${id}"`);
    expect(textOf(html)).toMatch(/de las que eres Propietario Legal/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    for (const m of html.matchAll(/(?:aria-labelledby|aria-describedby)="([^"]+)"/g)) expect(ids).toContain(m[1]);
    expect(ids.filter((v, i) => ids.indexOf(v) !== i)).toEqual([]);
  });

  it('[EDGE-ESC6-018] OUTDATED pide reconsentir: avisa del cambio y no deja consentir con un texto que ya no es el vigente; con error 409 también', () => {
    const html = render({ step: 'OUTDATED' });
    expect(textOf(html)).toMatch(/aviso cambió/i);
    expect(/<button[^>]*>Consentir y continuar<\/button>/.test(html)).toBe(false);
    expect(render({ error: 'El aviso cambió. Léelo de nuevo y consiente otra vez.' })).toMatch(/role="alert"/);
  });

  it('[REQ-ESC6-025][SC-ESC6-039] GRANTED ofrece «Retirar consentimiento y borrar imágenes de la escena»; el retiro pide confirmación que dice qué se borra y que el proveedor puede conservar lo ya enviado', () => {
    const granted = render({ step: 'GRANTED' });
    expect(/<button[^>]*>Retirar consentimiento y borrar imágenes de la escena<\/button>/.test(granted)).toBe(true);
    expect(granted).not.toContain('role="alertdialog"');
    const confirming = render({ step: 'GRANTED', confirmRevoke: true });
    expect(confirming).toContain('role="alertdialog"');
    const text = textOf(confirming);
    expect(text).toMatch(/foto del hogar/i);
    expect(text).toMatch(/proveedor puede conservar/i);
    expect(/<button[^>]*>Sí, retirar y borrar<\/button>/.test(confirming)).toBe(true);
    expect(/<button[^>]*>Cancelar<\/button>/.test(confirming)).toBe(true);
  });
});
