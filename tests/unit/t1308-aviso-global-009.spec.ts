import { describe, expect, it } from 'vitest';
import { currentNoticeVersion } from '../../src/application/use-cases/scene-use-cases.ts';
import type { SceneServices } from '../../src/application/use-cases/use-case-support.ts';
import { SCENE_GLOBAL_NOTICE_VERSION, SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../src/domain/scene/notice.ts';
import { NOTICE_GLOBAL_SECTIONS, NOTICE_GLOBAL_VERSION, NOTICE_SECTIONS, NOTICE_VERSION, consentBody, consentStep, noticeSectionsFor } from '../../src/presentation/web/scene-notice.ts';

/**
 * T1308 (009, Fase 5c; D9-27 (5); SC-009-053): el aviso previo con `global` tiene variante y `noticeVersion` PROPIA, de modo que los consentimientos previos (version '3') piden reconsentir
 * solo cuando la region efectiva es `global`. El TEXTO de la variante es provisional (declaracion de D9-27 (4)); el texto legal definitivo lo firma Neo: estas pruebas no fijan su redaccion,
 * solo que declara procesamiento sin region ni pais fijos y que el resto del aviso es el vigente.
 * @implements REQ-ESC6-026, EDGE-ESC6-018, EDGE-009-046
 */
const svcWith = (providerCall: SceneServices['providerCall'], providerId: string = SCENE_PROVIDER_ID): SceneServices => ({ noticeVersion: SCENE_NOTICE_VERSION, providerId, providerCall }) as unknown as SceneServices;

describe('T1308 [SC-009-053] versión de aviso vigente según la región efectiva', () => {
  it('constantes de servidor y cliente coinciden y son distintas de la base', () => {
    expect(SCENE_GLOBAL_NOTICE_VERSION).toBe('3-global');
    expect(NOTICE_GLOBAL_VERSION).toBe(SCENE_GLOBAL_NOTICE_VERSION);
    expect(SCENE_GLOBAL_NOTICE_VERSION).not.toBe(SCENE_NOTICE_VERSION);
    expect(NOTICE_VERSION).toBe(SCENE_NOTICE_VERSION);
  });

  it('global rige la variante; us-central1, sin lector o con fallo del lector rige la base (sin variante inventada)', async () => {
    expect(await currentNoticeVersion(svcWith(async () => ({ model: 'gemini-3.1-flash-image', location: 'global' })))).toBe('3-global');
    expect(await currentNoticeVersion(svcWith({ model: 'gemini-3.1-flash-image', location: 'global' }))).toBe('3-global');
    expect(await currentNoticeVersion(svcWith(async () => ({ model: 'gemini-2.5-flash-image', location: 'us-central1' })))).toBe('3');
    expect(await currentNoticeVersion(svcWith(undefined))).toBe('3');
    expect(await currentNoticeVersion(svcWith(async () => { throw new Error('lectura rota'); }))).toBe('3');
  });

  it('otro proveedor (gemini-api) nunca recibe la variante global', async () => {
    expect(await currentNoticeVersion(svcWith(async () => ({ model: 'm', location: 'global' }), 'gemini-api'))).toBe('3');
  });
});

describe('T1308 [SC-009-053] cliente: variante del aviso y reconsentimiento', () => {
  it('la variante global declara procesamiento sin región ni país fijos y conserva el resto del aviso', () => {
    expect(noticeSectionsFor('vertex-gemini-image', '3-global')).toBe(NOTICE_GLOBAL_SECTIONS);
    expect(noticeSectionsFor('vertex-gemini-image', '3')).toBe(NOTICE_SECTIONS);
    const where = NOTICE_GLOBAL_SECTIONS.find((s) => s.title.startsWith('3.'))!.paragraphs.join(' ');
    expect(where).toMatch(/global/);
    expect(where).toMatch(/no queda fijado a una región ni a un país/);
    expect(where).not.toMatch(/us-central1/);
    expect(NOTICE_GLOBAL_SECTIONS.filter((s) => !s.title.startsWith('3.'))).toEqual(NOTICE_SECTIONS.filter((s) => !s.title.startsWith('3.')));
  });

  it('el cuerpo de consentimiento usa la versión que el servidor declara; con global un consentimiento previo (3) debe reconsentirse', () => {
    expect(consentBody('vertex-gemini-image', '3-global').noticeVersion).toBe('3-global');
    expect(consentBody('vertex-gemini-image', '3').noticeVersion).toBe('3');
    expect(consentBody().noticeVersion).toBe('3');
    const consent = { required: true, noticeVersion: '3-global', providerId: 'vertex-gemini-image', householdPhotoGranted: false, petPhotosGranted: false };
    expect(consentStep(consent)).toBe('ASK');
    expect(consentStep({ ...consent, noticeVersion: '4' })).toBe('OUTDATED');
  });
});
