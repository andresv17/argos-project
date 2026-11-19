import { Writable } from 'node:stream';
import { inspect } from 'node:util';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiApiSceneImageGenerator } from '../../src/infrastructure/adapters/gemini-api-scene-image-generator.adapter.ts';
import { AppConfigError, loadAppConfig } from '../../src/infrastructure/config/app-config.ts';
import { cloudLoggerOptions, redactSecrets } from '../../src/infrastructure/http/cloud-logging.ts';
import { composeSceneServices } from '../../src/infrastructure/http/scene-composition.ts';

/**
 * T896 (006, tramo `gemini-api`): no-fuga de la clave. Con una clave SINTÉTICA de forma `AIza` + 35 caracteres, ni la clave ni la cabecera `x-goog-api-key` aparecen en
 * registros, errores, mensajes ni resultados del adaptador, del arranque ni de la composición; y la redacción de `cloud-logging.ts` (añadida por /architect) sustituye
 * ambas formas por `[REDACTED]`. 0 llamadas de red reales. REQ-ESC6-038; INV-ESC6-016; SC-ESC6-100.
 */
const KEY = 'AIzaSyTEST-SENTINEL-0000000000000000000';
const MODEL = 'gemini-2.5-flash-image';
const PROMPT = 'texto del prompt que no debe salir';
const HEADER = 'x-goog-api-key';
const leaks = (text: string): boolean => text.includes(KEY) || text.toLowerCase().includes(HEADER);

afterEach(() => vi.restoreAllMocks());

describe('forma de la clave sintética (SC-ESC6-100)', () => {
  it('[SC-ESC6-100] la clave de prueba tiene la forma AIza + 35 caracteres [0-9A-Za-z_-] y no es una clave real', () => {
    expect(KEY).toMatch(/^AIza[0-9A-Za-z_-]{35}$/);
    expect(KEY).toContain('TEST-SENTINEL');
  });
});

describe('redactSecrets (cloud-logging.ts, REQ-ESC6-038)', () => {
  it('[SC-ESC6-100] sustituye por [REDACTED] la clave suelta, en query, en texto de cabecera y en JSON de cabeceras', () => {
    const forms = [KEY, `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, `${HEADER}: ${KEY}`, `{"${HEADER}":"${KEY}"}`, `X-Goog-Api-Key=${KEY}`, `fallo con ${KEY} al final`];
    for (const form of forms) {
      const clean = redactSecrets(form, undefined);
      expect(clean).toContain('[REDACTED]');
      expect(leaks(clean)).toBe(false);
    }
  });

  it('[SC-ESC6-100] la cabecera se redacta aunque el valor no tenga la forma AIza', () => {
    const clean = redactSecrets(`${HEADER}: ZZ-clave-de-otra-forma-0123456789`, undefined);
    expect(clean).not.toContain('ZZ-clave-de-otra-forma-0123456789');
    expect(clean).toContain('[REDACTED]');
  });

  it('[SC-ESC6-100] el registro real (logger de Fastify) no emite la clave en el mensaje, en un objeto anidado ni en el campo x-goog-api-key', async () => {
    const lines: string[] = [];
    const stream = new Writable({ write(chunk: Buffer, _e, done) { lines.push(chunk.toString('utf8')); done(); } });
    const app = Fastify({ logger: { ...cloudLoggerOptions({ databaseUrl: undefined }), stream } });
    await app.ready();
    app.log.error(`fallo con ${KEY}`);
    app.log.info({ headers: { [HEADER]: KEY, 'content-type': 'application/json' }, detail: `${HEADER}: ${KEY}`, nested: [{ url: `https://x/y?key=${KEY}` }] }, 'llamada');
    await app.close();
    const all = lines.join('');
    expect(all).toContain('[REDACTED]');
    expect(leaks(all.replace(/"x-goog-api-key":"\[REDACTED\]"/gi, ''))).toBe(false);
    expect(all.includes(KEY)).toBe(false);
  });
});

describe('adaptador: ningún resultado, error ni registro lleva la clave (INV-ESC6-016)', () => {
  const request = { prompt: PROMPT, references: [], signal: new AbortController().signal };
  const silence = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
  const make = (fetchDouble: typeof fetch) => new GeminiApiSceneImageGenerator({ apiKey: KEY, model: MODEL, timeoutSeconds: 90, fetch: fetchDouble });

  it('[SC-ESC6-100] con una respuesta de error que repite la clave, el resultado, el volcado del adaptador y console.* no la contienen', async () => {
    const spies = silence();
    const double = vi.fn(async () => new Response(JSON.stringify({ error: { message: `API key ${KEY} invalid`, details: [{ metadata: { [HEADER]: KEY } }] } }), { status: 400 })) as unknown as typeof fetch;
    const generator = make(double);
    const result = await generator.generate(request);
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(leaks(JSON.stringify(result))).toBe(false);
    expect(leaks(JSON.stringify(generator))).toBe(false);
    expect(leaks(String(generator))).toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('[SC-ESC6-100] con un fetch que rechaza con un Error cuyo mensaje trae la URL y la clave, el resultado es solo un código y nada se registra', async () => {
    const spies = silence();
    const double = vi.fn(async () => {
      throw Object.assign(new TypeError(`fetch failed: ${HEADER}=${KEY}`), { cause: new Error(KEY) });
    }) as unknown as typeof fetch;
    const result = await make(double).generate(request);
    expect(result).toEqual({ ok: false, code: 'ERR-SCENE-GENERATION-FAILED' });
    expect(leaks(JSON.stringify(result))).toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('[SC-ESC6-100] con éxito, la imagen devuelta no contiene la clave y la clave solo viaja en la cabecera de la petición (no en URL ni cuerpo)', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const double = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from(png).toString('base64') } }] } }] }));
    }) as unknown as typeof fetch;
    const result = await make(double).generate(request);
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url.includes(KEY)).toBe(false);
    expect(String(seen[0]?.init.body).includes(KEY)).toBe(false);
    expect(new Headers(seen[0]?.init.headers).get(HEADER)).toBe(KEY);
  });

  it('[SC-ESC6-100] el constructor con modelo o clave inválidos lanza un mensaje sin el valor', () => {
    for (const [apiKey, model] of [[KEY, '../x'], ['corta', MODEL], [`${KEY} con espacio`, MODEL]] as const) {
      let message = '';
      try {
        new GeminiApiSceneImageGenerator({ apiKey, model, timeoutSeconds: 90 });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(leaks(message)).toBe(false);
      expect(message.includes('../x') || message.includes('corta')).toBe(false);
    }
  });
});

describe('arranque y composición: la clave no se filtra (REQ-ESC6-038)', () => {
  const ENV = { NODE_ENV: 'development', ARGOS_DB_DRIVER: 'sqlite', ARGOS_AUDIT_HMAC_SECRET: '1f'.repeat(32), ARGOS_SCENE_DRIVER: 'gemini-api', GEMINI_API_KEY: KEY, ARGOS_SCENE_GEMINI_MODEL: MODEL };

  it('[SC-ESC6-100] los errores de configuración (producción, modelo inválido) no contienen la clave ni su cabecera', () => {
    for (const env of [{ ...ENV, NODE_ENV: 'production', ARGOS_MEDIA_DRIVER: 'gcs', ARGOS_MEDIA_BUCKET: 'argos-test-media' }, { ...ENV, ARGOS_SCENE_GEMINI_MODEL: '../x' }, { ...ENV, GEMINI_API_KEY: `${KEY} ${KEY}` }]) {
      let message = '';
      try {
        loadAppConfig(env);
      } catch (error) {
        expect(error).toBeInstanceOf(AppConfigError);
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(leaks(message)).toBe(false);
    }
  });

  it('[SC-ESC6-100] la configuración y los servicios compuestos no exponen la clave a JSON.stringify ni a util.inspect', () => {
    const config = loadAppConfig(ENV);
    const services = composeSceneServices(config, { run: async () => 'NOOP', fetch: vi.fn() as unknown as typeof fetch });
    for (const value of [config, config.scene, services, services.generator]) {
      expect(leaks(JSON.stringify(value))).toBe(false);
      expect(leaks(inspect(value, { depth: 6, showHidden: false }))).toBe(false);
    }
  });
});
