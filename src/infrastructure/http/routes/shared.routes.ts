/**
 * Superficie PÚBLICA del enlace veterinario (OpenAPI 3.3.0, feature 005; REQ-VET-006, REQ-VET-007, INV-005-002, INV-005-007): solo dos rutas `GET`, sin cookie, sin
 * CSRF y sin escritura salvo la auditoría de acceso, bajo `/api/shared/`:
 * - `GET /api/shared/{token}/summary`  -> `SharedSummaryView`.
 * - `GET /api/shared/{token}/files/{mediaId}` -> 302 a una URL firmada V4 nueva (TTL <= min(300 s, restante)).
 * Todo lo demás bajo el prefijo (otro verbo, incluidos HEAD y OPTIONS; ruta no definida; barra final; parámetro de más de 100 caracteres; URL mal codificada) es el
 * MISMO 404 `ERR-SHARE-NOT-FOUND`: cuerpo constante, `instance` constante `"/shared"`, cabeceras de REQ-VET-006, y CUENTA para el límite de tasa (EDGE-005-25, SC-005-050).
 * Prohibido devolver el token, la URL o la plantilla de ruta de Fastify en cuerpo, cabeceras o registros; ningún fallo responde 400.
 * Un mecanismo único (`setNotFoundHandler` del prefijo, `setErrorHandler` del prefijo y `frameworkErrors` de la instancia) resuelve en el mismo manejador.
 *
 * @implements REQ-VET-006, REQ-VET-007, REQ-VET-008, INV-005-002, INV-005-007, INV-005-009, SC-005-020, SC-005-021, SC-005-041, SC-005-050, EDGE-005-25
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SharedAccessLimiter } from '../../../application/sharing/shared-access-limiter.ts';
import type { ApplicationDeps } from '../../../application/use-cases/use-case-support.ts';
import { normalizeClientIp } from '../../../domain/sharing/client-ip.ts';
import { DomainError as DomainErrorV31 } from '../../../generated/v31/index.ts';
import { DomainError as DomainErrorV33 } from '../../../generated/v33/index.ts';
import { PROBLEM_CONTENT_TYPE } from '../plugins/problem-details.ts';
import type { RouteContext } from './use-cases.ts';

/** Prefijo de la API pública y de la página HTML de la SPA (que también lleva las cabeceras de REQ-VET-006). */
export const SHARED_API_PREFIX = '/api/shared';
export const SHARED_PAGE_PREFIX = '/shared';
/** `instance` constante de todo ProblemDetails de la superficie pública (nunca la ruta con el token). */
export const SHARED_INSTANCE = '/shared';

const NO_STORE = 'no-store';
const API_CSP = "default-src 'none'; frame-ancestors 'none'";
/** CSP de la página HTML `/shared/{token}` (SPA sin datos): sin recursos de terceros ni script en línea. */
export const SHARED_PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Cabeceras de REQ-VET-006 en TODA respuesta de la superficie pública (200, 302, 404, 429 y 5xx). */
export function applySharedHeaders(reply: { header(name: string, value: string): unknown }, page = false): void {
  reply.header('Cache-Control', NO_STORE);
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Content-Security-Policy', page ? SHARED_PAGE_CSP : API_CSP);
}

/** La ruta pertenece a la superficie pública (`/api/shared…` o la página `/shared…`). */
export const isSharedApiPath = (url: string): boolean => url === SHARED_API_PREFIX || url.startsWith(`${SHARED_API_PREFIX}/`) || url.startsWith(`${SHARED_API_PREFIX}?`);
export const isSharedPagePath = (url: string): boolean => url === SHARED_PAGE_PREFIX || url.startsWith(`${SHARED_PAGE_PREFIX}/`) || url.startsWith(`${SHARED_PAGE_PREFIX}?`);

type AnyDomainError = DomainErrorV31 | DomainErrorV33;

function sendProblem(reply: FastifyReply, error: AnyDomainError): FastifyReply {
  applySharedHeaders(reply);
  if (error.status === 429) reply.header('Retry-After', String(SharedAccessLimiter.RETRY_AFTER_SECONDS));
  return reply.status(error.status).type(PROBLEM_CONTENT_TYPE).send(error.toProblemDetails(SHARED_INSTANCE));
}

/**
 * Fallo del propio framework (ruta no definida, verbo no registrado, parámetro largo, URL mal codificada): 429 si la IP ya agotó sus fallos y, si no,
 * el 404 uniforme tras contar el fallo. Sin resolver el token ni escribir en la base.
 */
function frameworkFailure(deps: ApplicationDeps, ip: string, reply: FastifyReply): FastifyReply {
  const sharing = deps.sharing;
  if (sharing === undefined) return sendProblem(reply, new DomainErrorV33('ERR-SHARE-NOT-FOUND'));
  const now = deps.clock.nowIsoTimestamp();
  const key = normalizeClientIp(ip);
  if (sharing.limiter.isLimited(key, now)) return sendProblem(reply, new DomainErrorV33('ERR-SHARE-RATE-LIMITED'));
  sharing.limiter.recordFailure(key, now);
  return sendProblem(reply, new DomainErrorV33('ERR-SHARE-NOT-FOUND'));
}

/** Token que jamás existe (los reales son 256 bits aleatorios): lo usa la resolución de relleno de los fallos del framework. */
const NEVER_A_TOKEN = '0'.repeat(43);

/**
 * Manejador ÚNICO de los fallos que genera el framework antes de llegar a una ruta pública (ruta no definida, barra final, parámetro largo, URL mal codificada,
 * verbos no registrados). Un `GET` ejecuta la MISMA resolución que un token inexistente (misma secuencia de puertos, cuenta para la tasa y agrega el fallo a la
 * auditoría): así un parámetro largo o una URL rara no se distingue de un token desconocido (INV-005-007, SC-005-050). Cualquier otro verbo no resuelve nada (REQ-VET-006):
 * solo cuenta para la tasa. Responde siempre el 404 uniforme (o el 429 si la IP ya agotó sus fallos).
 */
export function createSharedFailure(useCases: RouteContext['useCases'], deps: ApplicationDeps): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply> {
  return async (request, reply) => {
    if (request.method !== 'GET') return frameworkFailure(deps, request.ip, reply);
    try {
      await useCases.sharedSummary.execute(NEVER_A_TOKEN, request.ip);
    } catch (error) {
      return sendProblem(reply, error instanceof DomainErrorV33 && error.code === 'ERR-SHARE-RATE-LIMITED' ? error : new DomainErrorV33('ERR-SHARE-NOT-FOUND'));
    }
    return sendProblem(reply, new DomainErrorV33('ERR-SHARE-NOT-FOUND'));
  };
}

/**
 * `frameworkErrors` de la instancia (se pasa a `Fastify(...)`): las URL mal codificadas (`FST_ERR_BAD_URL`) llegan aquí ANTES del enrutador. Bajo `/api/shared`
 * responden el 404 uniforme; fuera de él conservan el 400 por defecto de Fastify.
 * @implements EDGE-005-25, SC-005-050
 */
export function sharedFrameworkErrors(getFailure: () => ((request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>) | null): (error: Error, request: FastifyRequest, reply: FastifyReply) => void {
  return (error, request, reply) => {
    const failure = getFailure();
    if (failure !== null && (isSharedApiPath(request.raw.url ?? '') || isSharedPagePath(request.raw.url ?? ''))) {
      void failure(request, reply);
      return;
    }
    const code = (error as { code?: string }).code ?? 'FST_ERR_BAD_URL';
    void reply.status(400).type('application/json; charset=utf-8').send({ error: 'Bad Request', code, message: error.message, statusCode: 400 });
  };
}

/** @implements REQ-VET-006, REQ-VET-007, REQ-VET-008, INV-005-002, INV-005-007, SC-005-020, SC-005-050 */
export function registerSharedRoutes(app: FastifyInstance, { useCases }: RouteContext, failure: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>): void {
  void app.register(
    async (shared) => {
      shared.addHook('onRequest', async (_request, reply) => {
        applySharedHeaders(reply);
      });
      // Los errores de Fastify y las excepciones de los casos de uso salen por el mismo canal: nunca el cuerpo ni el mensaje por defecto de Fastify.
      shared.setErrorHandler((error, request, reply) => {
        const code = (error as { code?: unknown }).code;
        if (error instanceof DomainErrorV33 || error instanceof DomainErrorV31) {
          // Un error interno de un caso de uso sale genérico: sin detalle personalizado ni mensaje de la excepción.
          return sendProblem(reply, error.code === 'ERR-INTERNAL-UNEXPECTED' ? new DomainErrorV33('ERR-INTERNAL-UNEXPECTED') : error);
        }
        if (typeof code === 'string' && code.startsWith('FST_')) return failure(request, reply);
        request.log.error({ err: error }, 'error no previsto en la superficie pública');
        return sendProblem(reply, new DomainErrorV33('ERR-INTERNAL-UNEXPECTED'));
      });
      shared.setNotFoundHandler((request, reply) => failure(request, reply));

      shared.get<{ Params: { token: string } }>('/:token/summary', { exposeHeadRoute: false }, async (request) => useCases.sharedSummary.execute(request.params.token, request.ip));

      shared.get<{ Params: { token: string; mediaId: string } }>('/:token/files/:mediaId', { exposeHeadRoute: false }, async (request, reply) => {
        const { url } = await useCases.sharedFile.execute(request.params.token, request.params.mediaId, request.ip);
        applySharedHeaders(reply);
        return reply.redirect(url, 302);
      });
    },
    { prefix: SHARED_API_PREFIX },
  );
}
