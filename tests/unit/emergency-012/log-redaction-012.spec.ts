import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { cloudLoggerOptions, redactSecrets, serializeRequest } from '../../../src/infrastructure/http/cloud-logging.ts';

/**
 * T1680 (Feature 012, Bloque D, #32; `/keymaker`): `redactSecrets` oculta el token de `/e/<token>` y de `/api/emergency/<token>` por FORMA y SIN ANCLAR, de cualquier longitud, con sufijo, con barra final,
 * dentro de `req.url` y de `Route GET:/… not found` (patrón `INV-005-009`; trinity N-01). El token de 256 bits es la capacidad de leer la ficha: no puede quedar en ningún registro.
 *
 * @implements REQ-QR12-008, INV-QR12-001, INV-QR12-002
 * Cubre SC-012-086.
 */
const base64url = (length: number, seed = 'k'): string => (seed + 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-').repeat(8).slice(0, length);
/** 43 (válido), 42 (truncado), 44 (con un carácter de más) y 200 (typo largo) caracteres. */
const TOKENS = [43, 42, 44, 200].map((length) => base64url(length));
const SHAPES: ReadonlyArray<readonly [string, (token: string) => string]> = [
  ['solo el token', (t) => t],
  ['con sufijo', (t) => `${t}extra`],
  ['con barra final', (t) => `${t}/`],
  ['con subruta', (t) => `${t}/x/y`],
  ['con consulta', (t) => `${t}?a=1`],
  ['con ancla', (t) => `${t}#frag`],
];
const PREFIXES = ['/e/', '/api/emergency/', '/E/', '/API/EMERGENCY/', '%2fe%2f', '/api%2Femergency%2F'];

describe('T1680 redactSecrets: ficha QR por forma, sin anclar y de cualquier longitud [SC-012-086]', () => {
  it.each(PREFIXES)('oculta el segmento tras %s en toda forma y longitud de token', (prefix) => {
    for (const token of TOKENS) {
      for (const [name, shape] of SHAPES) {
        const clean = redactSecrets(`GET ${prefix}${shape(token)} 404`, undefined);
        expect(clean, `${prefix} ${name} ${token.length}`).not.toContain(token);
        expect(clean).toContain('[REDACTED]');
      }
    }
  });

  it('no está anclado: busca el prefijo en cualquier posición de la cadena (URL absoluta, JSON, mensaje de ruta)', () => {
    const token = TOKENS[0]!;
    for (const text of [
      `https://argos.example/e/${token}`,
      `{"url":"/api/emergency/${token}","statusCode":404}`,
      `Route GET:/e/${token} not found`,
      `Route GET:/api/emergency/${token}/ not found`,
      `error en medio /api/emergency/${token}x otra cosa`,
      `referer: http://localhost:5173/e/${token}?utm=1`,
    ]) {
      expect(redactSecrets(text, undefined)).not.toContain(token);
    }
  });

  it('conserva el prefijo y el resto del texto para el diagnóstico', () => {
    const token = TOKENS[0]!;
    expect(redactSecrets(`GET /e/${token}/ 404 in 3ms`, undefined)).toBe('GET /e/[REDACTED]/ 404 in 3ms');
    expect(redactSecrets(`GET /api/emergency/${token}?x=1`, undefined)).toBe('GET /api/emergency/[REDACTED]?x=1');
  });

  it('un token con caracteres fuera de base64url (typo) también se oculta hasta el delimitador', () => {
    expect(redactSecrets('GET /e/abc.def~ghi%20jkl 404', undefined)).not.toMatch(/abc|def|ghi|jkl/);
  });

  it('no toca rutas ajenas con una «e» suelta ni textos sin prefijo', () => {
    expect(redactSecrets('GET /api/pets/e 200', undefined)).toBe('GET /api/pets/e 200');
    expect(redactSecrets('mensaje /emergency sin token', undefined)).toBe('mensaje /emergency sin token');
  });
});

describe('T1680 registros de la aplicación: ni el token ni la URL real salen en ningún campo [SC-012-086]', () => {
  async function run(request: (app: ReturnType<typeof Fastify>) => Promise<void>): Promise<string> {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const app = Fastify({ logger: { ...cloudLoggerOptions({ databaseUrl: undefined }), stream } });
    await app.ready();
    await request(app);
    await app.close();
    return lines.join('\n');
  }

  it('el 404 del enrutador (Route … not found) y el registro de petición no contienen el token (43, 42, 44 y 200; sufijo y barra final)', async () => {
    const dump = await run(async (app) => {
      for (const token of TOKENS) {
        for (const [, shape] of SHAPES) {
          await app.inject({ method: 'GET', url: `/e/${shape(token)}` });
          await app.inject({ method: 'GET', url: `/api/emergency/${shape(token)}` });
        }
      }
    });
    expect(dump.length).toBeGreaterThan(0);
    for (const token of TOKENS) expect(dump).not.toContain(token);
  });

  it('un registro explícito con la URL, el mensaje de error o un campo anidado sale redactado', async () => {
    const token = TOKENS[0]!;
    const dump = await run(async (app) => {
      app.log.info({ req: { url: `/e/${token}` }, nested: { deep: [`/api/emergency/${token}/`] } }, `visita /e/${token}`);
      app.log.error(`Route GET:/api/emergency/${token}x not found`);
    });
    expect(dump).not.toContain(token);
    expect(dump).toContain('[REDACTED]');
  });

  it('el serializador de petición nunca copia la URL real: solo método y plantilla de ruta', () => {
    expect(serializeRequest({ method: 'GET', routeOptions: undefined })).toEqual({ method: 'GET', url: '(sin-ruta)' });
    expect(serializeRequest({ method: 'GET', routeOptions: { url: '/api/emergency/*' } }).url).not.toContain(TOKENS[0]!);
  });
});
