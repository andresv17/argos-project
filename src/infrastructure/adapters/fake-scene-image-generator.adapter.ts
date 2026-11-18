/**
 * Generador de imágenes SIMULADO de la escena (feature 006, T850; REQ-ESC6-017, REQ-ESC6-031; NFR-ESC6-001). Es el ÚNICO adaptador activo en esta fase: no existe
 * `VertexSceneImageGenerator` como código seleccionable. Nunca usa red, SDK ni variables de entorno. Determinista: el PNG (1x1, un cuadro) deriva del SHA-256 del
 * prompt, así que mismo prompt = mismos bytes. Modos: `ok`, `fail` (SceneErrorCode, jamás cuerpo del proveedor, INV-ESC6-016), `slow` (espera la señal de aborto y
 * responde TIMEOUT), `invalid` (JPEG declarado PNG: la validación por firma de REQ-ESC6-035 lo rechaza) y `echo` (el prompt viaja en un trozo `tEXt`). Registra
 * cada llamada con prompt y referencias (ranura, tipo y tamaño; nunca los bytes ni el contenido).
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031, INV-ESC6-002, INV-ESC6-016, EDGE-ESC6-004, NFR-ESC6-001, SC-ESC6-025, SC-ESC6-050, SC-ESC6-061
 */

import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { SceneGenerationRequest, SceneGenerationResult, SceneImageGeneratorPort } from '../../application/ports/scene-image-generator.port.ts';

export type FakeSceneMode = 'ok' | 'fail' | 'slow' | 'invalid' | 'echo';

export interface FakeSceneCall {
  readonly prompt: string;
  readonly references: ReadonlyArray<{ readonly ref: string; readonly mime: string; readonly byteLength: number }>;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body.set(new TextEncoder().encode(type), 0);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG 1x1 RGB determinista a partir del texto; `text` opcional va en un trozo `tEXt` (modo eco). */
function pngOf(seed: string, text: string | null): Uint8Array {
  const color = createHash('sha256').update(seed).digest().subarray(0, 3);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [SIGNATURE, chunk('IHDR', ihdr), ...(text === null ? [] : [chunk('tEXt', new TextEncoder().encode(`prompt\0${text}`))]), chunk('IDAT', deflateSync(Uint8Array.from([0, color[0]!, color[1]!, color[2]!]))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export class FakeSceneImageGenerator implements SceneImageGeneratorPort {
  readonly calls: FakeSceneCall[] = [];
  private mode: FakeSceneMode;

  constructor(options: { readonly mode?: FakeSceneMode } = {}) {
    this.mode = options.mode ?? 'ok';
  }

  setMode(mode: FakeSceneMode): void {
    this.mode = mode;
  }

  async generate(request: SceneGenerationRequest): Promise<SceneGenerationResult> {
    this.calls.push({ prompt: request.prompt, references: request.references.map((r) => ({ ref: r.ref, mime: r.mime, byteLength: r.bytes.length })) });
    switch (this.mode) {
      case 'fail':
        return { ok: false, code: 'ERR-SCENE-GENERATION-FAILED' };
      case 'invalid':
        return { ok: true, image: { mime: 'image/png', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]) } };
      case 'slow':
        await new Promise<void>((resolve) => {
          if (request.signal.aborted) resolve();
          else request.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return { ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' };
      case 'echo':
        return { ok: true, image: { mime: 'image/png', bytes: pngOf(request.prompt, request.prompt) } };
      default:
        return { ok: true, image: { mime: 'image/png', bytes: pngOf(request.prompt, null) } };
    }
  }
}
