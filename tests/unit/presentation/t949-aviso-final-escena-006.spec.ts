/**
 * T949 (006, Fase 14, D6-22; DEUDA-006-AVISO-REGENERACION): aviso legal FINAL de la escena. 0 apariciones de «BORRADOR» y de «usa solo imágenes de prueba»; el texto nombra a
 * Google Cloud Vertex AI, la región, el procesamiento sin entrenamiento con datos del cliente (formulación sujeta a `T958`) y que CADA regeneración reenvía la foto del hogar y las
 * fotos vigentes de las mascotas con consentimiento; `SCENE_NOTICE_VERSION` sube respecto del valor vigente ('1') y un usuario con consentimiento de la versión anterior debe
 * reconsentir (D-2). El texto queda en REVIEW hasta la firma de Neo (T958). REQ-ESC6-026, REQ-ESC6-028; EDGE-ESC6-018.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SCENE_GEMINI_API_NOTICE_VERSION, SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../../src/domain/scene/notice.ts';
import { SceneConsentView, type SceneConsentViewProps } from '../../../src/presentation/web/components/SceneConsent.tsx';
import * as notice from '../../../src/presentation/web/scene-notice.ts';
import {
  NOTICE_GEMINI_API_SECTIONS,
  NOTICE_GEMINI_API_VERSION,
  NOTICE_INTRO,
  NOTICE_PROVIDER_ID,
  NOTICE_SECTIONS,
  NOTICE_TITLE,
  NOTICE_VERSION,
  consentBody,
  consentStep,
} from '../../../src/presentation/web/scene-notice.ts';
import { sceneView } from './escena-fixtures.ts';

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const noop = (): void => undefined;
const render = (overrides: Partial<SceneConsentViewProps> = {}): string =>
  renderToStaticMarkup(
    h(SceneConsentView, {
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
    }),
  );
const all = [NOTICE_TITLE, NOTICE_INTRO, ...NOTICE_SECTIONS.flatMap((s) => [s.title, ...s.paragraphs])].join('\n');
const allGemini = NOTICE_GEMINI_API_SECTIONS.flatMap((s) => [s.title, ...s.paragraphs]).join('\n');
const FILES = ['src/presentation/web/scene-notice.ts', 'src/domain/scene/notice.ts', 'src/presentation/web/components/SceneConsent.tsx'] as const;

describe('T949 retiro de los rótulos de borrador y de imágenes de prueba (REQ-ESC6-026)', () => {
  it.each(FILES)('[REQ-ESC6-026] %s no contiene «BORRADOR» ni «borrador» ni «usa solo imágenes de prueba»', (file) => {
    const source = read(file);
    expect(/borrador/i.test(source)).toBe(false);
    expect(/usa solo im[aá]genes de prueba/i.test(source)).toBe(false);
    expect(/NOTICE_DRAFT/.test(source)).toBe(false);
  });

  it('[REQ-ESC6-026] el aviso de Vertex y el de gemini-api no contienen el rótulo ni la frase retirada', () => {
    for (const text of [all, allGemini]) {
      expect(/borrador/i.test(text)).toBe(false);
      expect(/usa solo im[aá]genes de prueba/i.test(text)).toBe(false);
    }
  });

  it('[REQ-ESC6-026] el módulo ya no exporta constantes de borrador', () => {
    expect(Object.keys(notice).filter((k) => /DRAFT|BORRADOR/i.test(k))).toEqual([]);
  });

  it.each(['ASK', 'OUTDATED', 'GRANTED'] as const)('[REQ-ESC6-026] el paso %s no pinta ningún chip ni frase de borrador', (step) => {
    const html = render({ step });
    expect(/borrador/i.test(html)).toBe(false);
    expect(/firma legal/i.test(html)).toBe(false);
  });
});

describe('T949 contenido final del aviso (REQ-ESC6-026, REQ-ESC6-028)', () => {
  it('[REQ-ESC6-028] nombra a Google Cloud Vertex AI y la región us-central1 con la transferencia internacional', () => {
    expect(all).toMatch(/Google Cloud Vertex AI/);
    expect(all).toMatch(/us-central1/);
    expect(all).toMatch(/transferencia internacional/i);
    expect(all).not.toMatch(/Entidad contratante y nombre exacto del modelo: pendientes de confirmar/);
  });

  it('[REQ-ESC6-028] declara el procesamiento sin entrenamiento con los datos del cliente, sujeto a los términos de Google Cloud', () => {
    expect(all).toMatch(/no (se )?(usan|utilizan) para entrenar/i);
    expect(all).toMatch(/Data Processing Addendum|Service Specific Terms|términos/i);
  });

  it('[DEUDA-006-AVISO-REGENERACION] declara que CADA regeneración reenvía la foto del hogar y las fotos vigentes de las mascotas con consentimiento', () => {
    const section = NOTICE_SECTIONS.find((s) => s.title === '1. Qué se envía');
    const text = (section?.paragraphs ?? []).join(' ');
    expect(text).toMatch(/cada vez que (generas|regeneras)|cada regeneración/i);
    expect(text).toMatch(/vuelve a enviar|reenv[ií]a|se envía de nuevo/i);
    expect(text).toMatch(/foto de tu hogar/i);
    expect(text).toMatch(/fotos? (vigentes?|actuales?) de (tus|las) mascotas/i);
    expect(text).toMatch(/consentimiento/i);
  });

  it('[REQ-ESC6-026] conserva las 6 secciones y la declaración de normalización parcial, personas fortuitas y copias técnicas', () => {
    expect(NOTICE_SECTIONS).toHaveLength(6);
    expect(all).toMatch(/parcial/i);
    expect(all).toMatch(/personas/i);
    expect(all).toMatch(/6 horas/);
    expect(all).toMatch(/14 días/);
    expect(all).toMatch(/Retirar consentimiento y borrar imágenes de la escena/);
  });

  it('[REQ-ESC6-028] no afirma datos sin fuente: retención, borrado, región exacta del modelo y SLA siguen declarados como pendientes o remitidos al proveedor', () => {
    const retention = NOTICE_SECTIONS.find((s) => s.title.startsWith('4.'))?.paragraphs.join(' ') ?? '';
    expect(retention).toMatch(/pendiente de confirmar|se rige por|según/i);
    expect(retention).not.toMatch(/\b\d+\s*(días|horas|meses)\b/);
  });

  it('[SC-ESC6-040] el texto sigue siendo estático: sin nombres de mascotas ni de personas', () => {
    expect(all).not.toMatch(/Luna|Rocky|Andr[eé]s|@\w+/);
  });

  it('[REQ-ESC6-026] el aviso de gemini-api conserva su apartado propio (Developer API) y también declara el reenvío en cada regeneración', () => {
    expect(allGemini).toMatch(/Gemini Developer API/);
    expect(allGemini).not.toMatch(/Google Cloud Vertex AI/);
    expect(allGemini).toMatch(/cada vez que (generas|regeneras)|cada regeneración/i);
  });
});

describe('T949 versión nueva y reconsentimiento (D-2, EDGE-ESC6-018)', () => {
  it('[REQ-ESC6-026] SCENE_NOTICE_VERSION sube respecto del valor vigente («1») y sigue ≤ 32 caracteres', () => {
    expect(SCENE_NOTICE_VERSION).not.toBe('1');
    expect(Number(SCENE_NOTICE_VERSION)).toBeGreaterThan(1);
    expect(SCENE_NOTICE_VERSION.length).toBeLessThanOrEqual(32);
  });

  it('[REQ-ESC6-026] el cliente y el servidor comparten versión y proveedor (constantes del código)', () => {
    expect([NOTICE_VERSION, NOTICE_PROVIDER_ID]).toEqual([SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID]);
    expect(consentBody()).toEqual({ noticeVersion: SCENE_NOTICE_VERSION, providerId: SCENE_PROVIDER_ID, scopes: ['HOUSEHOLD_PHOTO', 'PET_PHOTOS'] });
  });

  it('[EDGE-ESC6-018] un consentimiento dado con la versión anterior («1») queda OUTDATED y pide reconsentir; con la vigente y los dos alcances queda GRANTED', () => {
    const consent = (noticeVersion: string): ReturnType<typeof sceneView>['consent'] => ({ ...sceneView().consent, noticeVersion, providerId: SCENE_PROVIDER_ID, householdPhotoGranted: true, petPhotosGranted: true });
    expect(consentStep(consent('1'))).toBe('OUTDATED');
    expect(consentStep(consent(SCENE_NOTICE_VERSION))).toBe('GRANTED');
  });

  it('[EDGE-ESC6-018] el aviso de gemini-api sube su versión (cambió su texto) y sigue igual en cliente y servidor', () => {
    expect(SCENE_GEMINI_API_NOTICE_VERSION).not.toBe('gemini-api-draft-1');
    expect(NOTICE_GEMINI_API_VERSION).toBe(SCENE_GEMINI_API_NOTICE_VERSION);
    expect(SCENE_GEMINI_API_NOTICE_VERSION.length).toBeLessThanOrEqual(32);
  });
});
