import { Writable } from 'node:stream';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { googleFailed } from '../../src/application/use-cases/google-errors.ts';
import { cloudLoggerOptions, redactSecrets } from '../../src/infrastructure/http/cloud-logging.ts';
import { GoogleRateLimiter } from '../../src/infrastructure/http/google-rate-limit.ts';
import { registerProblemDetails } from '../../src/infrastructure/http/plugins/problem-details.ts';
import { registerGoogleAuthRoutes } from '../../src/infrastructure/http/routes/google-auth.routes.ts';
import { RegistrationRateLimiter } from '../../src/infrastructure/http/registration-rate-limit.ts';
import type { UseCases } from '../../src/infrastructure/http/routes/use-cases.ts';

/**
 * T1134 (008, [GH:#17], tarea [GOV] `/rama`): la query `code`/`state`/`error` del callback de Google nunca llega a los logs de la aplicación ni al cuerpo de la
 * respuesta (NFR-008-004, REQ-VIN8-004, SC-008-063). Usa las rutas REALES (`registerGoogleAuthRoutes`), el registro real (`cloudLoggerOptions`) y el manejador real de
 * errores; solo sustituye el caso de uso por un doble que devuelve el resultado indicado. Los defectos de defensa en profundidad van con `it.fails`.
 */

const CODE = '4/0AbCd-t1134-codigo-secreto';
const STATE = 'Q'.repeat(43);
const ERROR_PARAM = 'access_denied';
const SUB = 'google-sub-t1134-logs';
const EMAIL = 'persona.t1134.logs@example.test';
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0MTEzNCJ9.firma-t1134';
const CALLBACK = '/api/auth/google/callback';

interface Captured {
  readonly status: number;
  readonly body: string;
  readonly setCookie: string | string[] | undefined;
  readonly logs: string;
}

/** App mínima con las rutas reales de Google, el logger de Cloud Run y los errores de dominio; `complete` es el caso de uso simulado. */
async function callbackApp(complete: () => Promise<unknown>): Promise<{ app: FastifyInstance; lines: string[] }> {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString('utf8'));
      done();
    },
  });
  const app = Fastify({ logger: { ...cloudLoggerOptions(), stream } });
  await app.register(cookie);
  registerProblemDetails(app);
  const useCases = { googleComplete: { execute: complete } } as unknown as UseCases;
  registerGoogleAuthRoutes(app, { useCases, cookieSecure: true }, new GoogleRateLimiter(() => Date.now()), new RegistrationRateLimiter(() => Date.now()));
  return { app, lines };
}

async function hit(url: string, complete: () => Promise<unknown>): Promise<Captured> {
  const { app, lines } = await callbackApp(complete);
  const response = await app.inject({ method: 'GET', url, headers: { cookie: 'argos_oauth=' + 'O'.repeat(43) } });
  await app.close();
  return { status: response.statusCode, body: response.body, setCookie: response.headers['set-cookie'], logs: lines.join('') };
}

const SECRETS = [CODE, STATE, ERROR_PARAM, SUB, EMAIL, ID_TOKEN];
const expectClean = (text: string): void => {
  for (const secret of SECRETS) expect(text, `fuga de ${secret.slice(0, 10)}…`).not.toContain(secret);
};
const query = `?code=${encodeURIComponent(CODE)}&state=${STATE}&error=${ERROR_PARAM}`;

describe('[NFR-008-004] el callback de Google no escribe code, state ni error en los logs de la aplicación', () => {
  it('fallo uniforme (400): la línea de petición y de respuesta usan la ruta con plantilla, sin query', async () => {
    const result = await hit(`${CALLBACK}${query}`, async () => {
      throw googleFailed();
    });
    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({ code: 'ERR-AUTH-GOOGLE-FAILED', instance: CALLBACK });
    expectClean(result.body);
    expectClean(result.logs);
    expect(result.logs).toContain(CALLBACK);
  });

  it('éxito con vinculación (REQ-VIN8-004): 200 sin Set-Cookie de argos_session y sin code ni state en cuerpo ni logs', async () => {
    const result = await hit(`${CALLBACK}?code=${encodeURIComponent(CODE)}&state=${STATE}`, async () => ({ kind: 'LINKED' }));
    expect(result.status).toBe(200);
    const cookies = Array.isArray(result.setCookie) ? result.setCookie.join(';') : (result.setCookie ?? '');
    expect(cookies).not.toContain('argos_session');
    expect(cookies).toContain('argos_oauth=;');
    expectClean(result.body);
    expectClean(result.logs);
  });

  it('error de motor con el code dentro del mensaje: el log solo conserva SQLSTATE y restricción, nunca el texto del error', async () => {
    const engine = Object.assign(new Error(`violación en ${CODE} para ${EMAIL} sub=${SUB} token=${ID_TOKEN}`), { code: '23505', constraint: 'auth_identities_pkey' });
    const result = await hit(`${CALLBACK}${query}`, async () => {
      throw engine;
    });
    expect(result.status).toBe(500);
    expectClean(result.body);
    expectClean(result.logs);
    expect(result.logs).toContain('auth_identities_pkey');
  });

  it('el parámetro `error` de Google no se refleja: un valor ajeno se sustituye por la constante antes de llegar al caso de uso', async () => {
    let received: { error?: string | undefined } | undefined;
    const result = await hit(`${CALLBACK}${query}`, async (...args: unknown[]) => {
      received = args[0] as { error?: string | undefined };
      throw googleFailed();
    });
    expect(result.status).toBe(400);
    expect(received?.error).toBe('error');
    expectClean(result.body);
  });
});

describe('[NFR-008-004] la redacción del registro cubre los secretos del flujo de Google que pueden aparecer en un texto', () => {
  it('control: la redacción oculta el token de acceso de Google y el Bearer', () => {
    const text = redactSecrets('acceso ya29.a0AfB_token-t1134 y Authorization: Bearer abc.def-t1134', undefined);
    expect(text).not.toContain('ya29.a0AfB_token-t1134');
    expect(text).not.toContain('abc.def-t1134');
  });

  it.fails('DEFECTO H-RAMA-008-T1134-02 (BAJO, defensa en profundidad): un `code` de OAuth escrito en un texto del registro no se redacta; hoy ningún código lo escribe', () => {
    expect(redactSecrets(`intercambio code=${CODE}`, undefined)).not.toContain(CODE);
  });

  it.fails('DEFECTO H-RAMA-008-T1134-03 (BAJO, defensa en profundidad): un id_token (JWT) escrito en un texto del registro no se redacta; hoy el serializador de error lo descarta', () => {
    expect(redactSecrets(`id_token=${ID_TOKEN}`, undefined)).not.toContain(ID_TOKEN);
  });
});
