/**
 * T1535 [US5, Bloque E, #31] regresion del avatar del enlace publico con FOTOS REALES de navegador (WebP de Chromium por `canvas.toBlob`, JPEG de WebKit/Safari):
 * `stripImageMetadata` las acepta y `GET /api/shared/{token}/pets/{petId}/avatar` responde 200 con el tipo real y sin el chunk ICCP. Diagnostico (Keymaker, 2026-11-26): el
 * saneador NO falla con la salida real de los motores (120 WebP de Chromium de 64..1023 px y 120 JPEG de WebKit comprobados); solo rechaza un WebP con el ultimo chunk impar
 * SIN byte de relleno (RIFF mal formado: el padding es obligatorio), que se fija aqui como limite conocido (404 uniforme, nunca 500).
 *
 * @implements REQ-VET11-002, INV-VET11-001, SC-011-037
 */
import { afterEach, describe, expect, it } from 'vitest';
import { stripImageMetadata } from '../../src/domain/images/image-metadata-stripper.ts';
import { ARGOS } from '../fixtures/application-harness.ts';
import { CHROMIUM_CANVAS_WEBP, WEBKIT_CANVAS_JPEG } from '../fixtures/avatar-navegadores-reales-011.ts';
import { createShareApi, type ShareApi } from '../fixtures/share-api-harness.ts';
import { KEY } from '../fixtures/share-harness.ts';

let api: ShareApi;
afterEach(async () => api?.close());

const OBJECT_ID = '77777777-7777-4777-8777-777777777701';
const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n));

async function publicAvatar(bytes: Uint8Array, mime: string): Promise<{ status: number; type: string; body: Uint8Array }> {
  api = await createShareApi();
  await api.storage.put(`pets/${ARGOS.id}/avatar/${OBJECT_ID}`, bytes, mime);
  await api.deps.uow.runInTransaction((r) => r.pets.replaceAvatar(ARGOS.id, OBJECT_ID));
  const cookie = await api.login('andres');
  const created = await api.call('POST', `/api/pets/${ARGOS.id}/share-links`, { cookie, body: {}, headers: { 'idempotency-key': KEY(1) } });
  const token = String((created.json as { url: string }).url).split('/shared/')[1]!;
  const raw = await api.app.inject({ method: 'GET', url: `/api/shared/${token}/pets/${ARGOS.id}/avatar` });
  return { status: raw.statusCode, type: String(raw.headers['content-type']), body: new Uint8Array(raw.rawPayload) };
}

describe('T1535 avatar compartido con fotos reales de AvatarCropper (REQ-VET11-002, SC-011-037)', () => {
  it('[REQ-VET11-002] el WebP real de Chromium (VP8X + ICCP + VP8) se sanea: conserva VP8X y VP8, descarta ICCP y mantiene un RIFF coherente', () => {
    const result = stripImageMetadata('image/webp', CHROMIUM_CANVAS_WEBP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ascii(result.bytes, 0, 4)).toBe('RIFF');
    expect(new DataView(result.bytes.buffer, result.bytes.byteOffset).getUint32(4, true) + 8).toBe(result.bytes.length);
    expect(ascii(result.bytes, 12, 4)).toBe('VP8X');
    expect(Buffer.from(result.bytes).includes('ICCP')).toBe(false);
  });

  it('[REQ-VET11-002] el JPEG real de WebKit (Safari) se sanea y conserva la firma', () => {
    const result = stripImageMetadata('image/jpeg', WEBKIT_CANVAS_JPEG);
    expect(result.ok).toBe(true);
    if (result.ok) expect([...result.bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it('[REQ-VET11-002][SC-011-037] GET del avatar publico con el WebP real de Chromium responde 200 image/webp', async () => {
    const r = await publicAvatar(CHROMIUM_CANVAS_WEBP, 'image/webp');
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/^image\/webp/);
    expect(ascii(r.body, 8, 4)).toBe('WEBP');
  });

  it('[REQ-VET11-002][SC-011-037] GET del avatar publico con el JPEG real de WebKit responde 200 image/jpeg', async () => {
    const r = await publicAvatar(WEBKIT_CANVAS_JPEG, 'image/jpeg');
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/^image\/jpeg/);
  });

  it('[REQ-VET11-002][INV-VET11-001] limite conocido: un WebP con el ultimo chunk impar sin byte de relleno (RIFF mal formado) se trata como ausente (404 uniforme, nunca 500)', async () => {
    const padded = Uint8Array.from(CHROMIUM_CANVAS_WEBP);
    // VP8 de 872 bytes es par: lo volvemos impar (871) quitando el ultimo byte de datos y el riffSize en uno, sin relleno.
    const malformed = padded.slice(0, padded.length - 1);
    new DataView(malformed.buffer).setUint32(4, malformed.length - 8, true);
    new DataView(malformed.buffer).setUint32(12 + 18 + 456 + 4, 871, true);
    expect(stripImageMetadata('image/webp', malformed).ok).toBe(false);
    expect((await publicAvatar(malformed, 'image/webp')).status).toBe(404);
  });
});
