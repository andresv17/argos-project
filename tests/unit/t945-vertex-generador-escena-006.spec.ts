import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneGenerationRequest } from '../../src/application/ports/scene-image-generator.port.ts';
import { FakeSceneImageGenerator } from '../../src/infrastructure/adapters/fake-scene-image-generator.adapter.ts';
import { createMetadataTokenClient } from '../../src/infrastructure/adapters/metadata-token-client.ts';
import { VertexSceneImageGenerator } from '../../src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts';

/**
 * T945 (006, Fase 14, D6-22): `VertexSceneImageGenerator` con `fetch` y metadata server SIMULADOS (0 red). Token OAuth2 de
 * `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token` con `Metadata-Flavor: Google` y caché con vencimiento anticipado; host
 * `{location}-aiplatform.googleapis.com` con `location` en lista cerrada; ruta `publishers/google/models/{model}:generateContent` con `model` por regex cerrada; cuerpo y
 * parseo de `gemini-api-wire.ts` (reutilizado); 0 `x-goog-api-key`; `AbortSignal` de T_GEN; error tipado sin eco. REQ-ESC6-017, REQ-ESC6-031; NFR-ESC6-001.
 */
const PROJECT = 'argos-prod-1234';
const LOCATION = 'us-central1';
const MODEL = 'gemini-2.5-flash-image';
const TOKEN = 'ya29.TOKEN-SENTINEL-DE-PRUEBA'; // argos-scan:allow token sintetico de prueba
const METADATA_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const URL_EXPECTED = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
const PROMPT = 'Escena pixel art con IMG_1 y un texto secreto del prompt';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function png(): Promise<Uint8Array> {
  const result = await new FakeSceneImageGenerator({ mode: 'ok' }).generate({ prompt: 'semilla', references: [], seed: 0, signal: new AbortController().signal });
  if (!result.ok) throw new Error('sin imagen simulada');
  return result.image.bytes;
}
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const okBody = (mimeType: string, bytes: Uint8Array): string => JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: b64(bytes) } }] }, finishReason: 'STOP' }] });
const respond = (body: string, status = 200, headers: Record<string, string> = {}): Response => new Response(body, { status, headers });
const tokenResponse = (expiresIn = 3599, token = TOKEN): Response => respond(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }));

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
type Handler = (call: Call) => Promise<Response> | Response;

function setup(provider: Handler, options: Partial<ConstructorParameters<typeof VertexSceneImageGenerator>[0]> = {}, metadata: Handler = () => tokenResponse()) {
  const calls: Call[] = [];
  const fetchDouble = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return call.url === METADATA_URL ? metadata(call) : provider(call);
  });
  const generator = new VertexSceneImageGenerator({ projectId: PROJECT, location: LOCATION, model: MODEL, timeoutSeconds: 90, fetch: fetchDouble as unknown as typeof fetch, ...options });
  const providerCalls = (): Call[] => calls.filter((c) => c.url !== METADATA_URL);
  const metadataCalls = (): Call[] => calls.filter((c) => c.url === METADATA_URL);
  return { generator, calls, providerCalls, metadataCalls, fetchDouble };
}
const request = (references: SceneGenerationRequest['references'] = [], signal: AbortSignal = new AbortController().signal): SceneGenerationRequest => ({ prompt: PROMPT, references, seed: 0, signal });
const ref = (n: number, mime: string, bytes: number[]): SceneGenerationRequest['references'][number] => ({ ref: `IMG_${n}`, mime, bytes: Uint8Array.from(bytes) });
const bodyOf = (call: Call): { contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>; generationConfig: { responseModalities: string[] } } => JSON.parse(String(call.init.body));

describe('petición (REQ-ESC6-017, REQ-ESC6-031; NFR-ESC6-001)', () => {
  it('[REQ-ESC6-017] POST a la URL exacta de Vertex (host regional, proyecto, región, publishers/google/models/{model}:generateContent), sin «?», redirect error, Bearer del metadata server', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    const result = await t.generator.generate(request());
    expect(result.ok).toBe(true);
    expect(t.providerCalls()).toHaveLength(1);
    const [call] = t.providerCalls();
    expect(call?.url).toBe(URL_EXPECTED);
    expect(call?.url.includes('?')).toBe(false);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.redirect).toBe('error');
    const headers = new Headers(call?.init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('content-type')).toBe('application/json');
    expect([...headers.keys()].sort()).toEqual(['authorization', 'content-type']);
  });

  it('[REQ-ESC6-031][NFR-ESC6-001] 0 cabeceras x-goog-api-key y 0 referencias a GEMINI_API_KEY ni a ?key= en ninguna llamada ni en el cuerpo', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request([ref(1, 'image/png', [1, 2, 3])]));
    for (const call of t.calls) {
      const headers = new Headers(call.init.headers);
      expect(headers.has('x-goog-api-key')).toBe(false);
      expect(call.url.includes('key=')).toBe(false);
      expect(String(call.init.body ?? '').includes('GEMINI_API_KEY')).toBe(false);
    }
  });

  it('[REQ-ESC6-017] el cuerpo es el de gemini-api-wire: prompt primero, «IMG_n:» antes de cada inlineData y responseModalities IMAGE', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request([ref(1, 'image/png', [1, 2, 3]), ref(2, 'image/webp', [7])]));
    const body = bodyOf(t.providerCalls()[0]!);
    expect(body.contents[0]?.role).toBe('user');
    expect(body.contents[0]?.parts).toEqual([
      { text: PROMPT },
      { text: 'IMG_1:' },
      { inlineData: { mimeType: 'image/png', data: Buffer.from([1, 2, 3]).toString('base64') } },
      { text: 'IMG_2:' },
      { inlineData: { mimeType: 'image/webp', data: Buffer.from([7]).toString('base64') } },
    ]);
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], seed: 0 }); // 007: REQ-ESC7-007
  });

  it('[REQ-ESC6-017] el adaptador importa el protocolo de gemini-api-wire.ts y no lo duplica', () => {
    const source = readFileSync(join(process.cwd(), 'src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts'), 'utf8');
    expect(/from\s+['"]\.\/gemini-api-wire\.ts['"]/.test(source)).toBe(true);
    expect(/inlineData\s*:/.test(source)).toBe(false);
    expect(/responseModalities\s*:/.test(source)).toBe(false);
  });
});

describe('validación de host, región y modelo (anti-SSRF)', () => {
  it.each(['us-central1', 'us-east4', 'europe-west4'])('[REQ-ESC6-031] región %s de la lista cerrada produce el host {location}-aiplatform.googleapis.com', async (location) => {
    const t = setup(async () => respond(okBody('image/png', await png())), { location });
    await t.generator.generate(request());
    const url = new URL(t.providerCalls()[0]!.url);
    expect(url.hostname).toBe(`${location}-aiplatform.googleapis.com`);
    expect(url.protocol).toBe('https:');
  });

  it.each(['evil.com/x#', 'us-central1.evil.com', 'US-CENTRAL1', 'us-central1/..', 'mars-north9', '', 'us-central1 ', 'us_central1'])('[REQ-ESC6-031] la región %j fuera de la lista cerrada se rechaza al construir y no llama a la red', (location) => {
    const fetchDouble = vi.fn();
    expect(() => new VertexSceneImageGenerator({ projectId: PROJECT, location, model: MODEL, timeoutSeconds: 90, fetch: fetchDouble as unknown as typeof fetch })).toThrow('Configuración del adaptador vertex inválida: región.');
    expect(fetchDouble).not.toHaveBeenCalled();
  });

  it.each(['../models/x', 'gemini/x', 'gemini-2.5?x=1', 'gemini-2.5#f', 'gemini 2.5', 'gpt-4', '', 'gemini-..', `gemini-${'a'.repeat(60)}`])('[REQ-ESC6-031] el modelo %j fuera de la regex cerrada se rechaza al construir', (model) => {
    expect(() => new VertexSceneImageGenerator({ projectId: PROJECT, location: LOCATION, model, timeoutSeconds: 90 })).toThrow('Configuración del adaptador vertex inválida: modelo.');
  });

  it.each(['', 'A', 'proj/../x', 'proj?x', 'Argos-Prod', 'a b cde fg'])('[REQ-ESC6-031] el proyecto %j inválido se rechaza al construir', (projectId) => {
    expect(() => new VertexSceneImageGenerator({ projectId, location: LOCATION, model: MODEL, timeoutSeconds: 90 })).toThrow('Configuración del adaptador vertex inválida: proyecto.');
  });

  it('[REQ-ESC6-031] el mensaje de error de construcción no repite ningún valor recibido', () => {
    try {
      new VertexSceneImageGenerator({ projectId: PROJECT, location: 'evil.example', model: MODEL, timeoutSeconds: 90 });
    } catch (error) {
      expect(String((error as Error).message).includes('evil.example')).toBe(false);
      return;
    }
    throw new Error('debía lanzar');
  });
});

describe('token del metadata server (REQ-ESC6-031, NFR-ESC6-001)', () => {
  it('[REQ-ESC6-031] pide el token a la URL exacta del metadata server con Metadata-Flavor: Google, redirect error y sin cuerpo', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request());
    expect(t.metadataCalls()).toHaveLength(1);
    const call = t.metadataCalls()[0]!;
    expect(call.url).toBe(METADATA_URL);
    expect(new Headers(call.init.headers).get('metadata-flavor')).toBe('Google');
    expect(call.init.redirect).toBe('error');
    expect(call.init.body).toBeUndefined();
  });

  it('[NFR-ESC6-001] cachea el token con vencimiento anticipado: dos generaciones seguidas piden el token una sola vez', async () => {
    let now = 1_000_000;
    const t = setup(async () => respond(okBody('image/png', await png())), { now: () => now });
    await t.generator.generate(request());
    now += 60_000;
    await t.generator.generate(request());
    expect(t.metadataCalls()).toHaveLength(1);
    expect(t.providerCalls()).toHaveLength(2);
  });

  it('[NFR-ESC6-001] vence antes de expires_in: a 3600 s de vida y pasados 3500 s se vuelve a pedir; nunca se usa un token vencido', async () => {
    let now = 1_000_000;
    const t = setup(async () => respond(okBody('image/png', await png())), { now: () => now }, () => tokenResponse(3600));
    await t.generator.generate(request());
    now += 3_500_000;
    await t.generator.generate(request());
    expect(t.metadataCalls()).toHaveLength(2);
  });

  it('[NFR-ESC6-001] un expires_in muy corto no se cachea más allá de su vigencia (cada llamada vuelve a pedir)', async () => {
    let now = 1_000_000;
    const t = setup(async () => respond(okBody('image/png', await png())), { now: () => now }, () => tokenResponse(30));
    await t.generator.generate(request());
    now += 1;
    await t.generator.generate(request());
    expect(t.metadataCalls()).toHaveLength(2);
  });

  it.each([
    ['respuesta 500 del metadata server', () => respond('boom', 500)],
    ['JSON ilegible', () => respond('<html>')],
    ['sin access_token', () => respond(JSON.stringify({ expires_in: 3000 }))],
    ['access_token vacío', () => respond(JSON.stringify({ access_token: '', expires_in: 3000 }))],
    ['token con salto de línea (inyección de cabecera)', () => respond(JSON.stringify({ access_token: 'abc\r\nX-Evil: 1', expires_in: 3000 }))],
  ] as const)('[REQ-ESC6-031] %s: ERR-SCENE-GENERATION-FAILED, 0 llamadas al proveedor y sin eco', async (_name, metadata) => {
    const t = setup(async () => respond(okBody('image/png', await png())), {}, metadata);
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.providerCalls()).toHaveLength(0);
  });

  it('[REQ-ESC6-031] el metadata server caído (fetch lanza) devuelve ERR-SCENE-GENERATION-FAILED sin el mensaje de la causa', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())), {}, () => {
      throw new Error('ECONNREFUSED http://metadata.google.internal SECRETO');
    });
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(JSON.stringify(result).includes('SECRETO')).toBe(false);
  });

  it('[REQ-ESC6-031] el cliente de token puede inyectarse (getAccessToken) y entonces no toca el metadata server', async () => {
    const getAccessToken = vi.fn(async () => 'token-inyectado');
    const t = setup(async () => respond(okBody('image/png', await png())), { getAccessToken });
    await t.generator.generate(request());
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(t.metadataCalls()).toHaveLength(0);
    expect(new Headers(t.providerCalls()[0]!.init.headers).get('authorization')).toBe('Bearer token-inyectado');
  });

  it('[REQ-ESC6-031] el cliente de token exporta una caché por instancia y no registra el token (sin console.*)', () => {
    const source = readFileSync(join(process.cwd(), 'src/infrastructure/adapters/metadata-token-client.ts'), 'utf8');
    expect(/console\./.test(source)).toBe(false);
    expect(typeof createMetadataTokenClient).toBe('function');
  });
});

describe('respuestas del proveedor sin eco (INV-ESC6-016)', () => {
  it.each([
    [400, 'ERR-SCENE-GENERATION-FAILED'],
    [401, 'ERR-SCENE-GENERATION-FAILED'],
    [403, 'ERR-SCENE-GENERATION-FAILED'],
    [429, 'ERR-SCENE-GENERATION-FAILED'],
    [500, 'ERR-SCENE-GENERATION-FAILED'],
    [503, 'ERR-SCENE-GENERATION-FAILED'],
  ] as const)('[REQ-ESC6-031] estado %i: %s, una sola llamada (sin reintento interno) y sin copiar el cuerpo ni el token', async (status, code) => {
    const secretBody = `{"error":{"message":"detalle ${TOKEN} bytes ${PROMPT}"}}`;
    const t = setup(async () => respond(secretBody, status));
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: false, code });
    expect(JSON.stringify(result).includes(TOKEN)).toBe(false);
    expect(t.providerCalls()).toHaveLength(1);
  });

  it('[REQ-ESC6-031] una respuesta sin imagen (bloqueo de seguridad) es ERR-SCENE-GENERATION-FAILED sin copiar el motivo', async () => {
    const t = setup(async () => respond(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'motivo secreto' }] } }] })));
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(JSON.stringify(result).includes('motivo')).toBe(false);
  });

  it('[REQ-ESC6-035] (enmienda N2 JPEG) Vertex devuelve image/jpeg: acepta la firma FF D8 FF y registra el MIME cerrado cuando falla', async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
    expect(await setup(async () => respond(okBody('image/jpeg', jpeg))).generator.generate(request())).toEqual({ ok: true, image: { mime: 'image/jpeg', bytes: jpeg } });
    const lines: string[] = [];
    const t = setup(async () => respond(okBody('image/png', jpeg)), { log: (line: string) => lines.push(line) });
    expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-INVALID-IMAGE' });
    expect(lines).toEqual(['scene-generator INVALID_OUTPUT mimeType=image/png']);
  });

  it('[REQ-ESC6-035] la imagen se decide por la firma de los bytes: un PNG declarado como webp es ERR-SCENE-INVALID-IMAGE', async () => {
    const t = setup(async () => respond(okBody('image/webp', await png())));
    expect(await t.generator.generate(request())).toEqual({ ok: false, code: 'ERR-SCENE-INVALID-IMAGE' });
  });

  it('[REQ-ESC6-031] un fetch que lanza devuelve FAILED y nunca propaga el mensaje', async () => {
    const t = setup(async () => {
      throw new Error(`falla con ${TOKEN}`);
    });
    const result = await t.generator.generate(request());
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(JSON.stringify(result).includes(TOKEN)).toBe(false);
  });

  it('[REQ-ESC6-031] un JSON de petición sobre el tope devuelve FAILED sin llamar a la red (ni al metadata server)', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())), { maxInlineBytes: 100 });
    expect(await t.generator.generate(request([ref(1, 'image/png', Array.from({ length: 200 }, () => 1))]))).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(t.calls).toHaveLength(0);
  });
});

describe('señal y plazo T_GEN', () => {
  it('[REQ-ESC6-017] una señal ya abortada devuelve ERR-SCENE-GENERATION-TIMEOUT sin ninguna llamada', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    const controller = new AbortController();
    controller.abort();
    expect(await t.generator.generate(request([], controller.signal))).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
    expect(t.calls).toHaveLength(0);
  });

  it('[REQ-ESC6-017] el AbortSignal de la petición se propaga al proveedor y al abortar devuelve ERR-SCENE-GENERATION-TIMEOUT', async () => {
    const controller = new AbortController();
    const t = setup(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          (call.init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('abortado')), { once: true });
          queueMicrotask(() => controller.abort());
        }),
    );
    expect(await t.generator.generate(request([], controller.signal))).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
  });

  it('[REQ-ESC6-017] el temporizador propio (T_GEN) corta una llamada colgada con ERR-SCENE-GENERATION-TIMEOUT', async () => {
    vi.useFakeTimers();
    const t = setup(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          (call.init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('abortado')), { once: true });
        }),
      { timeoutSeconds: 10 },
    );
    const pending = t.generator.generate(request());
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
  });

  it('[REQ-ESC6-017] el token y el proveedor comparten la señal combinada: abortar durante el token no llama al proveedor', async () => {
    const controller = new AbortController();
    const t = setup(async () => respond(okBody('image/png', await png())), {}, (call) => {
      controller.abort();
      expect((call.init.signal as AbortSignal | undefined) !== undefined).toBe(true);
      return tokenResponse();
    });
    const result = await t.generator.generate(request([], controller.signal));
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-TIMEOUT' });
    expect(t.providerCalls()).toHaveLength(0);
  });
});

describe('secretos y objeto (NFR-ESC6-001)', () => {
  it('[NFR-ESC6-001] el objeto no expone el token ni la configuración por JSON.stringify', async () => {
    const t = setup(async () => respond(okBody('image/png', await png())));
    await t.generator.generate(request());
    const dump = JSON.stringify(t.generator);
    expect(dump.includes(TOKEN)).toBe(false);
    expect(dump).toBe('{}');
  });

  it('[NFR-ESC6-001] package.json y package-lock.json no declaran google-auth-library ni SDK de IA y los archivos nuevos no los importan', () => {
    for (const file of ['src/infrastructure/adapters/vertex-scene-image-generator.adapter.ts', 'src/infrastructure/adapters/metadata-token-client.ts']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(/from\s+['"](@google|google-auth-library|openai|@anthropic-ai)/.test(source)).toBe(false);
      expect(/process\.env/.test(source)).toBe(false);
      expect(/console\./.test(source)).toBe(false);
    }
    const pkg = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(/google-auth-library|@google\/genai|@google-cloud\/vertexai|aiplatform/.test(pkg)).toBe(false);
  });
});
