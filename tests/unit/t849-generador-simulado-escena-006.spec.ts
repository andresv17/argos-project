import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { SceneGenerationRequest } from '../../src/application/ports/scene-image-generator.port.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { InProcessSceneDispatcher } from '../../src/infrastructure/adapters/in-process-scene-dispatcher.adapter.ts';

/**
 * T849 (006, Fase 5): `FakeSceneImageGenerator` e `InProcessSceneDispatcher`. Determinista, modos fallo/lento/respuesta inválida/eco de prompt, registro de llamadas,
 * jamás red ni proveedor; ejecución con `setImmediate` solo en desarrollo y CI. REQ-ESC6-013, REQ-ESC6-017, REQ-ESC6-031; INV-ESC6-002, INV-ESC6-005, INV-ESC6-016;
 * EDGE-ESC6-004, EDGE-ESC6-017; NFR-ESC6-001; SC-ESC6-017, SC-ESC6-018, SC-ESC6-025, SC-ESC6-046, SC-ESC6-050, SC-ESC6-061, SC-ESC6-062.
 */
const request = (prompt = 'draw a room', signal: AbortSignal = new AbortController().signal): SceneGenerationRequest => ({
  prompt,
  references: [{ ref: 'IMG_1', mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
  seed: 0,
  signal,
});
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const head = (bytes: Uint8Array, n: number): number[] => [...bytes.slice(0, n)];

function pngChunks(bytes: Uint8Array): Array<{ type: string; data: Uint8Array }> {
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let at = 8;
  while (at < bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);
    chunks.push({ type: new TextDecoder().decode(bytes.slice(at + 4, at + 8)), data: bytes.slice(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

describe('FakeSceneImageGenerator (T849)', () => {
  it('[SC-ESC6-025][REQ-ESC6-017] el modo normal devuelve un PNG válido de un cuadro y determinista: mismo prompt, mismos bytes; otro prompt, otros bytes', async () => {
    const fake = new FakeSceneImageGenerator();
    const a = await fake.generate(request('uno'));
    const b = await new FakeSceneImageGenerator().generate(request('uno'));
    const c = await fake.generate(request('dos'));
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!(a.ok && b.ok && c.ok)) return;
    expect([a.image.mime, head(a.image.bytes, 8)]).toEqual(['image/png', PNG_SIGNATURE]);
    expect([...a.image.bytes]).toEqual([...b.image.bytes]);
    expect([...a.image.bytes]).not.toEqual([...c.image.bytes]);
    expect(pngChunks(a.image.bytes).map((x) => x.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(inflateSync(pngChunks(a.image.bytes)[1]!.data).length).toBeGreaterThan(0);
  });

  it('[SC-ESC6-046][NFR-ESC6-001] registra cada llamada con prompt y referencias (solo ranura, tipo y tamaño: nunca los bytes) y cuenta las llamadas', async () => {
    const fake = new FakeSceneImageGenerator();
    await fake.generate(request('a'));
    await fake.generate(request('b'));
    expect(fake.calls).toEqual([
      { prompt: 'a', seed: 0, references: [{ ref: 'IMG_1', mime: 'image/png', byteLength: 3 }] },
      { prompt: 'b', seed: 0, references: [{ ref: 'IMG_1', mime: 'image/png', byteLength: 3 }] },
    ]);
    expect(JSON.stringify(fake.calls).includes('"bytes"')).toBe(false);
  });

  it('[EDGE-ESC6-004][SC-ESC6-062] el modo fallo devuelve un SceneErrorCode (nunca cuerpo ni mensaje del proveedor) y el modo respuesta inválida devuelve un JPEG declarado PNG', async () => {
    const failing = await new FakeSceneImageGenerator({ mode: 'fail' }).generate(request());
    expect(failing).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    const invalid = await new FakeSceneImageGenerator({ mode: 'invalid' }).generate(request());
    expect(invalid.ok).toBe(true);
    if (invalid.ok) expect([invalid.image.mime, head(invalid.image.bytes, 3)]).toEqual(['image/png', [0xff, 0xd8, 0xff]]);
  });

  it('[REQ-ESC6-013][SC-ESC6-017] el modo lento espera la señal de aborto y responde ERR-SCENE-GENERATION-TIMEOUT; con la señal ya abortada responde de inmediato', async () => {
    const controller = new AbortController();
    const slow = new FakeSceneImageGenerator({ mode: 'slow' });
    const pending = slow.generate(request('x', controller.signal));
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    controller.abort();
    expect(await pending).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
    const already = new AbortController();
    already.abort();
    expect(await slow.generate(request('y', already.signal))).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
  });

  it('[SC-ESC6-018][EDGE-ESC6-017] el modo eco incrusta el prompt recibido en un trozo tEXt del PNG para verificarlo sin red', async () => {
    const out = await new FakeSceneImageGenerator({ mode: 'echo' }).generate(request('Place all 2 pets'));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const text = pngChunks(out.image.bytes).find((c) => c.type === 'tEXt');
    expect(new TextDecoder().decode(text?.data)).toBe('prompt\0Place all 2 pets');
  });

  it('[SC-ESC6-050][SC-ESC6-061] no usa red ni proveedor: el módulo no referencia fetch, sockets, SDK ni process.env', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('src/infrastructure/adapters/fake-scene-image-generator.adapter.ts', 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(/\bfetch\s*\(|node:https?|node:net|process\.env|@google|undici|XMLHttpRequest/.test(code)).toBe(false);
  });
});

describe('InProcessSceneDispatcher (T849)', () => {
  const job = { sceneId: 'a1000000-0000-4000-8000-000000000001', attemptId: 'a2000000-0000-4000-8000-000000000001' };

  it('[REQ-ESC6-013][SC-ESC6-017] enqueue registra el trabajo y lo ejecuta con setImmediate DESPUÉS de volver (el POST responde antes que la generación)', async () => {
    const ran: string[] = [];
    const dispatcher = new InProcessSceneDispatcher(async (j) => void ran.push(j.attemptId), { allowed: true });
    await dispatcher.enqueue(job);
    expect(ran).toEqual([]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await dispatcher.idle();
    expect([ran, dispatcher.enqueued]).toEqual([[job.attemptId], [job]]);
  });

  it('[EDGE-ESC6-017] un fallo del manejador no se propaga ni tumba el proceso: se descarta sin datos', async () => {
    const dispatcher = new InProcessSceneDispatcher(async () => { throw new Error('boom con datos'); }, { allowed: true });
    await dispatcher.enqueue(job);
    await dispatcher.idle();
    expect(dispatcher.failures).toBe(1);
  });

  it('[SC-ESC6-050] en producción (allowed = false) enqueue se niega: el adaptador en proceso solo existe en desarrollo y CI', async () => {
    const dispatcher = new InProcessSceneDispatcher(async () => undefined, { allowed: false });
    await expect(dispatcher.enqueue(job)).rejects.toThrow(/solo desarrollo y CI/);
    expect(dispatcher.enqueued).toEqual([]);
  });
});
