import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneGenerationRequest } from '../../src/application/ports/scene-image-generator.port.ts';
import { GeminiApiSceneImageGenerator } from '../../src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { validateGeneratedImage } from '../../src/infrastructure/adapters/image-metadata-stripper.ts';

/**
 * T892 (006, tramo `gemini-api`): adaptador `GeminiApiSceneImageGenerator` con `fetch` SIMULADO (0 llamadas de red). URL exacta sin `?`, clave solo en la cabecera
 * `x-goog-api-key`, `redirect: 'error'`, orden `IMG_1..IMG_n`, tabla de estados HTTP sin reintento interno, aborto, payload sobre el tope, salida PNG/WebP por firma,
 * cadena con `validateOutput` y sin eco del cuerpo de error del proveedor. La clave es SINTÉTICA. REQ-ESC6-037, REQ-ESC6-038, REQ-ESC6-035; INV-ESC6-016; SC-ESC6-099.
 */
const KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000'; // argos-scan:allow clave sintetica de prueba
const MODEL = 'gemini-2.5-flash-image';
const URL_EXPECTED = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const PROMPT = 'Escena pixel art con IMG_1 e IMG_2 y un texto secreto del prompt';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function png(echo: string | null = null): Promise<Uint8Array> {
  const result = await new FakeSceneImageGenerator({ mode: echo === null ? 'ok' : 'echo' }).generate({ prompt: echo ?? 'semilla', references: [], seed: 0, signal: new AbortController().signal });
  if (!result.ok) throw new Error('sin imagen simulada');
  return result.image.bytes;
}
const WEBP = Uint8Array.from([...new TextEncoder().encode('RIFF'), 12, 0, 0, 0, ...new TextEncoder().encode('WEBP'), ...new TextEncoder().encode('VP8L'), 0, 0, 0, 0]);
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const okBody = (mimeType: string, bytes: Uint8Array, extra: unknown[] = []): string =>
  JSON.stringify({ candidates: [{ content: { parts: [...extra, { inlineData: { mimeType, data: b64(bytes) } }] }, finishReason: 'STOP' }] });
const respond = (body: string, status = 200, headers: Record<string, string> = {}): Response => new Response(body, { status, headers });

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function setup(handler: (call: Call) => Promise<Response> | Response, options: Partial<ConstructorParameters<typeof GeminiApiSceneImageGenerator>[0]> = {}) {
  const calls: Call[] = [];
  const fetchDouble = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call);
  });
  const generator = new GeminiApiSceneImageGenerator({ apiKey: KEY, model: MODEL, timeoutSeconds: 90, fetch: fetchDouble as unknown as typeof fetch, ...options });
  return { generator, calls, fetchDouble };
}
const request = (references: SceneGenerationRequest['references'] = [], signal: AbortSignal = new AbortController().signal): SceneGenerationRequest => ({ prompt: PROMPT, references, seed: 0, signal });
const ref = (n: number, mime: string, bytes: number[]): SceneGenerationRequest['references'][number] => ({ ref: `IMG_${n}`, mime, bytes: Uint8Array.from(bytes) });
const bodyOf = (call: Call): { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>; generationConfig: { responseModalities: string[] } } => JSON.parse(String(call.init.body));

describe('petición (REQ-ESC6-037, REQ-ESC6-038, SC-ESC6-099)', () => {
  it('[SC-ESC6-099] URL exacta de generateContent sin «?», POST, redirect error, clave solo en la cabecera x-goog-api-key', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    const result = await t.generator.generate(request());
    expect(result.ok).toBe(true);
    expect(t.calls).toHaveLength(1);
    const [call] = t.calls;
    expect(call?.url).toBe(URL_EXPECTED);
    expect(call?.url.includes('?')).toBe(false);
    expect(call?.url.includes(KEY)).toBe(false);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.redirect).toBe('error');
    const headers = new Headers(call?.init.headers);
    expect(headers.get('x-goog-api-key')).toBe(KEY);
    expect(headers.get('content-type')).toBe('application/json');
    expect([...headers.keys()].sort()).toEqual(['content-type', 'x-goog-api-key']);
    expect(String(call?.init.body).includes(KEY)).toBe(false);
  });

  it('[SC-ESC6-099][SC-ESC6-104] el cuerpo lleva el prompt primero y, antes de cada inlineData, una parte de texto «IMG_n:» en el orden IMG_1..IMG_n con su tipo y su base64', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    const refs = [ref(1, 'image/png', [1, 2, 3]), ref(2, 'image/jpeg', [9, 8]), ref(3, 'image/webp', [7])];
    await t.generator.generate(request(refs));
    const body = bodyOf(t.calls[0]!);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0]?.role).toBe('user');
    expect(body.contents[0]?.parts).toEqual([
      { text: PROMPT },
      { text: 'IMG_1:' },
      { inlineData: { mimeType: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') } },
      { text: 'IMG_2:' },
      { inlineData: { mimeType: 'image/jpeg', data: Buffer.from([9, 8]).toString('base64') } },
      { text: 'IMG_3:' },
      { inlineData: { mimeType: 'image/webp', data: Buffer.from([7]).toString('base64') } },
    ]);
  });

  it('[SC-ESC6-104] con 0 referencias las partes son solo el texto del prompt (0 etiquetas «IMG_n:»)', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request([]));
    const parts = bodyOf(t.calls[0]!).contents[0]?.parts;
    expect(parts).toEqual([{ text: PROMPT }]);
    expect(JSON.stringify(parts).includes('IMG_1:')).toBe(false);
  });

  it('[REQ-ESC6-037] responseModalities es IMAGE por defecto y TEXT+IMAGE cuando se configura', async () => {
    const a = setup(async () => respond(okBody('image/png', await png())));
    await a.generator.generate(request());
    expect(bodyOf(a.calls[0]!).generationConfig.responseModalities).toEqual(['IMAGE']);
    const b = setup(async () => respond(okBody('image/png', await png())), { responseModalities: ['TEXT', 'IMAGE'] });
    await b.generator.generate(request());
    expect(bodyOf(b.calls[0]!).generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
  });

  it('[INV-ESC6-018] el modelo con «/», «?», «..» o espacios, o una clave inválida, se rechazan al construir sin copiar el valor en el mensaje', () => {
    for (const model of ['../x', 'gemini/x', 'gemini?x=1', 'gemini x', '']) {
      expect(() => new GeminiApiSceneImageGenerator({ apiKey: KEY, model, timeoutSeconds: 90 })).toThrow('modelo');
    }
    let message = '';
    try {
      new GeminiApiSceneImageGenerator({ apiKey: 'corta', model: MODEL, timeoutSeconds: 90 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message.includes('corta')).toBe(false);
  });
});

describe('respuesta 200 (REQ-ESC6-035, SC-ESC6-099)', () => {
  it('[SC-ESC6-099] devuelve la primera inlineData PNG ignorando las partes de texto y decodifica los bytes', async () => {
    const bytes = await png();
    const t = setup(() => respond(okBody('image/png', bytes, [{ text: 'comentario del modelo' }])));
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: true, image: { mime: 'image/png', bytes } });
  });

  it('[SC-ESC6-099] acepta WebP por firma RIFF/WEBP', async () => {
    const t = setup(() => respond(okBody('image/webp', WEBP)));
    expect(await t.generator.generate(request())).toEqual({ ok: true, image: { mime: 'image/webp', bytes: WEBP } });
  });

  it('[REQ-ESC6-035][SC-ESC6-099] JPEG, tipo declarado distinto de la firma, firma desconocida, base64 inválido o base64 vacío devuelven ERR-SCENE-INVALID-IMAGE', async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
    const cases: string[] = [
      okBody('image/jpeg', jpeg),
      okBody('image/webp', await png()),
      okBody('image/png', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: '%%%no es base64%%%' } }] } }] }),
      JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: '' } }] } }] }),
    ];
    for (const body of cases) {
      const t = setup(() => respond(body));
      expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-INVALID-IMAGE' });
    }
  });

  it('[SC-ESC6-099] 200 sin imagen, sin candidatos, bloqueo de seguridad o JSON ilegible devuelven ERR-SCENE-GENERATION-FAILED sin copiar el motivo', async () => {
    const cases = [
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no pude' }] }, finishReason: 'STOP' }] }),
      JSON.stringify({ candidates: [] }),
      JSON.stringify({}),
      JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
      JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }),
      'esto no es json',
    ];
    for (const body of cases) {
      const t = setup(() => respond(body));
      const result = await t.generator.generate(request());
      expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
      expect(JSON.stringify(result).includes('SAFETY')).toBe(false);
    }
  });

  it('[REQ-ESC6-035] una imagen cuyo base64 implica más bytes que el tope de salida se rechaza antes de decodificar', async () => {
    const t = setup(() => respond(okBody('image/png', new Uint8Array(4096))), { maxOutputBytes: 1024 });
    expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-INVALID-IMAGE' });
  });

  it('[REQ-ESC6-035] un Content-Length anunciado mayor que el tope de lectura se rechaza sin leer el cuerpo', async () => {
    const t = setup(() => respond('{}', 200, { 'content-length': String(500 * 1024 * 1024) }), { maxOutputBytes: 1024 });
    expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
  });

  it('[REQ-ESC6-035][SC-ESC6-085] cadena con validateOutput: una salida con tEXt (eco del prompt) se publica sin ese trozo', async () => {
    const t = setup(async () => respond(okBody('image/png', await png(PROMPT))));
    const result = await t.generator.generate(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = new TextDecoder('latin1').decode(result.image.bytes);
    expect(raw.includes('tEXt')).toBe(true); // el adaptador solo valida firma: la reescritura por lista blanca es del worker
    const verdict = validateGeneratedImage(result.image.mime, result.image.bytes, 32 * 1024 * 1024);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const published = new TextDecoder('latin1').decode(verdict.bytes);
    expect(published.includes('tEXt')).toBe(false);
    expect(published.includes(PROMPT)).toBe(false);
  });
});

describe('errores y reintentos (SC-ESC6-099, INV-ESC6-016)', () => {
  it('[SC-ESC6-099] 400, 401, 403, 404, 429, 500, 502, 503 y 504 devuelven ERR-SCENE-GENERATION-FAILED con UNA sola llamada (sin reintento interno)', async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502, 503, 504]) {
      const t = setup(() => respond('{"error":{"message":"detalle del proveedor"}}', status, status === 429 ? { 'retry-after': '1' } : {}));
      expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
      expect(t.fetchDouble).toHaveBeenCalledTimes(1);
    }
  });

  it('[SC-ESC6-099] un fetch rechazado (red caída) devuelve ERR-SCENE-GENERATION-FAILED y la excepción no escapa; no hay reintento', async () => {
    const t = setup(() => {
      throw new TypeError(`fetch failed ${URL_EXPECTED}?key=${KEY}`);
    });
    expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.fetchDouble).toHaveBeenCalledTimes(1);
  });

  it('[SC-ESC6-099] la señal de la petición abortada devuelve ERR-SCENE-GENERATION-TIMEOUT', async () => {
    const controller = new AbortController();
    const t = setup(({ init }) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const pending = t.generator.generate(request([], controller.signal));
    controller.abort();
    expect(await pending).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
    expect(t.fetchDouble).toHaveBeenCalledTimes(1);
  });

  it('[SC-ESC6-099] una señal ya abortada no llama a la red y devuelve ERR-SCENE-GENERATION-TIMEOUT', async () => {
    const controller = new AbortController();
    controller.abort();
    const t = setup(() => respond('{}'));
    expect(await t.generator.generate(request([], controller.signal))).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
    expect(t.fetchDouble).not.toHaveBeenCalled();
  });

  it('[REQ-ESC6-037] el temporizador propio sigue ARGOS_SCENE_GEN_TIMEOUT_SECONDS: aborta a los 10 s configurados, ni antes ni después', async () => {
    vi.useFakeTimers();
    const t = setup(({ init }) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), { timeoutSeconds: 10 });
    let settled = false;
    const pending = t.generator.generate(request()).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
  });

  it('[REQ-ESC6-037] tras una respuesta normal no queda el temporizador pendiente', async () => {
    vi.useFakeTimers();
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('[SC-ESC6-099] un payload mayor que el tope inline devuelve ERR-SCENE-GENERATION-FAILED con 0 llamadas', async () => {
    const t = setup(() => respond('{}'), { maxInlineBytes: 1024 });
    const big = ref(1, 'image/png', Array.from({ length: 2048 }, (_, i) => i % 251));
    expect(await t.generator.generate(request([big]))).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.fetchDouble).not.toHaveBeenCalled();
  });
});

describe('sin eco del proveedor (INV-ESC6-016, REQ-ESC6-038)', () => {
  it('[INV-ESC6-016] un cuerpo de error que repite el prompt y la clave no aparece en el resultado ni en console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const t = setup(() => respond(JSON.stringify({ error: { message: `${PROMPT} ${KEY}`, status: 'PERMISSION_DENIED' } }), 403));
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    const serialized = JSON.stringify(result);
    expect(serialized.includes(KEY) || serialized.includes(PROMPT) || serialized.includes('PERMISSION_DENIED')).toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('[INV-ESC6-016] el cuerpo de error no se lee: se cancela', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(new TextEncoder().encode('x')), cancel: () => void (cancelled = true) });
    const t = setup(() => new Response(body, { status: 500 }));
    expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(cancelled).toBe(true);
  });

  it('[INV-ESC6-016] el adaptador no registra el prompt ni los bytes en éxito (console.* sin llamadas)', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request([ref(1, 'image/png', [1, 2, 3])]));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('0 llamadas de red reales (NFR-ESC6-001)', () => {
  it('[SC-ESC6-099] sin fetch inyectado el adaptador usa el fetch global (aquí sustituido por un doble: 0 red real)', async () => {
    const double = vi.fn(async () => respond(okBody('image/png', await png())));
    vi.stubGlobal('fetch', double);
    try {
      const generator = new GeminiApiSceneImageGenerator({ apiKey: KEY, model: MODEL, timeoutSeconds: 90 });
      expect((await generator.generate(request())).ok).toBe(true);
      expect(double).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
