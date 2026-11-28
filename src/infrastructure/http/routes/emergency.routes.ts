/**
 * Rutas de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1675; `contracts/openapi/emergency.openapi.yaml` 0.3.0 y `emergency-additive-annex.md` §5).
 *
 * SUPERFICIE PÚBLICA (`registerEmergencyPublicRoutes`): `GET /api/emergency/{token}` (vista mínima) y `GET /e/{token}` (shell estático de la SPA, 200 idéntico para cualquier valor). Anónima, sin cookie, sin CSRF, sin CORS.
 * Un mecanismo único por prefijo (`setNotFoundHandler`, `setErrorHandler` y `frameworkErrors`) responde SIEMPRE el mismo 404 `ERR-PET-NOT-FOUND` con `instance = "/emergency"` constante y las cabeceras públicas:
 * HEAD (la ruta se registra con `exposeHeadRoute: false`), OPTIONS, otros métodos, subrutas, barra final, parámetro largo y URL mal codificada. TODA petición del prefijo (válida o no) cuenta para
 * `QR_SCAN_MAX_PER_IP_PER_MINUTE` ANTES de consultar la ficha; el 429 lleva `Retry-After` y `X-Content-Type-Options: nosniff`. Prohibido devolver el token, la URL o la plantilla de ruta en cuerpo, cabeceras o registros.
 * El hash se calcula también para tokens mal formados (sin cortocircuito observable) y nunca viaja el token en claro hacia el caso de uso.
 *
 * SUPERFICIE PRIVADA (`registerEmergencyPrivateRoutes`): cookie `argos_session`, `X-Argos-Request` en toda escritura (el guarda CSRF global responde 403 antes) y tope por usuario dentro del caso de uso.
 *
 * @implements REQ-QR12-003, REQ-QR12-004, REQ-QR12-005, REQ-QR12-006, REQ-QR12-007, REQ-QR12-008, INV-QR12-002, SC-012-051, SC-012-084, SC-012-087, SC-012-109, SC-012-125, SC-012-126
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ActivateEmergencyCardUseCase,
  DeactivateEmergencyCardUseCase,
  GetEmergencyCardPublicUseCase,
  GetEmergencyCardStatusUseCase,
  RegenerateEmergencyCardUseCase,
  SetEmergencyPhoneConsentUseCase,
  UpdateAccountPhoneUseCase,
  UpdateCriticalAllergiesUseCase,
} from '../../../application/use-cases/emergency-use-cases.ts';
import type { ApplicationDeps } from '../../../application/use-cases/use-case-support.ts';
import { hashEmergencyToken } from '../../../domain/emergency/token.ts';
import { PUBLIC_PROBLEM_INSTANCE } from '../../../domain/platform/feature-012-limits.ts';
import { DomainError, type EmergencyCardPublicView } from '../../../generated/v38/index.ts';
import { EmergencyScanLimiter } from '../emergency-scan-limiter.ts';
import { PROBLEM_CONTENT_TYPE } from '../plugins/problem-details.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { jsonBody } from '../request-input.ts';
import { SHARED_PAGE_CSP } from './shared.routes.ts';
import type { RouteContext } from './use-cases.ts';

export const EMERGENCY_API_PREFIX = '/api/emergency';
export const EMERGENCY_PAGE_PREFIX = '/e';

/** La ruta pertenece a la superficie pública de la ficha (`/api/emergency…` o el shell `/e…`). */
export const isEmergencyPublicPath = (url: string): boolean => {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path === EMERGENCY_API_PREFIX || path.startsWith(`${EMERGENCY_API_PREFIX}/`) || path === EMERGENCY_PAGE_PREFIX || path.startsWith(`${EMERGENCY_PAGE_PREFIX}/`);
};

/** Shell por defecto: documento sin datos, sin script en línea, sin recursos de terceros ni metaetiquetas `og:`/`twitter:` (la SPA real, T1676, lo sustituye por su `index.html`). */
const DEFAULT_SHELL = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Ficha de emergencia</title></head><body><div id="root"></div></body></html>';

/** Cabeceras públicas en TODA respuesta del prefijo (200, 404, 429 y 5xx): sin caché, sin indexar, sin referrer, sin sniffing. */
function applyPublicHeaders(reply: { header(name: string, value: string): unknown }): void {
  reply.header('Cache-Control', 'no-store');
  reply.header('X-Robots-Tag', 'noindex, nofollow');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Content-Type-Options', 'nosniff');
}

function sendPublicProblem(reply: FastifyReply, error: DomainError, retryAfterSeconds?: number): FastifyReply {
  applyPublicHeaders(reply);
  if (retryAfterSeconds !== undefined) reply.header('Retry-After', String(retryAfterSeconds));
  return reply.status(error.status).type(PROBLEM_CONTENT_TYPE).send(error.toProblemDetails(PUBLIC_PROBLEM_INSTANCE));
}

/** Contador del prefijo por instancia de Fastify: el `frameworkErrors` de `app.ts` se construye antes de registrar las rutas y lo busca aquí. */
const failures = new WeakMap<object, (request: FastifyRequest, reply: FastifyReply) => FastifyReply>();

export interface EmergencyPublicRoutesOptions {
  /** Resuelve por el SHA-256 del token: la vista o `null` (cualquier otra falla, 404 uniforme). */
  readonly lookupByTokenHash: (tokenHash: string) => Promise<EmergencyCardPublicView | null>;
  /** Clave HMAC (≥ 32 caracteres) que reduce la IP efectiva a la clave opaca del contador. */
  readonly ipSecret: string;
  readonly clock: { now(): Date };
  /** HTML del shell (la SPA); ausente = shell mínimo. Debe ser idéntico para cualquier token y no llevar datos ni script en línea. */
  readonly shellHtml?: string;
  /** Contador inyectable (pruebas y composición); ausente = uno nuevo con los valores de `feature-012-limits.ts`. */
  readonly limiter?: EmergencyScanLimiter;
}

/** @implements REQ-QR12-004, REQ-QR12-007, INV-QR12-002, SC-012-051, SC-012-087, SC-012-125, SC-012-126 */
export async function registerEmergencyPublicRoutes(app: FastifyInstance, options: EmergencyPublicRoutesOptions): Promise<void> {
  const limiter = options.limiter ?? new EmergencyScanLimiter({ secret: options.ipSecret, nowMs: () => options.clock.now().getTime() });
  const shell = options.shellHtml ?? DEFAULT_SHELL;
  const notFound = (reply: FastifyReply): FastifyReply => sendPublicProblem(reply, new DomainError('ERR-PET-NOT-FOUND'));
  /** Cuenta la petición del prefijo y, si la IP superó el tope, responde el 429 uniforme. */
  const count = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const verdict = limiter.hit(request.ip);
    if (!verdict.limited) return false;
    sendPublicProblem(reply, new DomainError('ERR-RATE-LIMITED'), verdict.retryAfterSeconds);
    return true;
  };
  /** Fallo del enrutador (URL mal codificada, parámetro largo…): cuenta y responde el mismo 404 (o 429). */
  failures.set(app, (request, reply) => (count(request, reply) ? reply : notFound(reply)));

  const scope = (prefix: string, handler: (request: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => Promise<FastifyReply>) =>
    app.register(
      async (plugin) => {
        plugin.addHook('onRequest', async (request, reply) => {
          applyPublicHeaders(reply);
          if (count(request, reply)) return reply;
          return undefined;
        });
        // Un mecanismo único: toda ruta, método (HEAD y OPTIONS incluidos) o subruta no definidos del prefijo, y todo error del enrutador, dan el MISMO 404.
        plugin.setNotFoundHandler((_request, reply) => notFound(reply));
        plugin.setErrorHandler((error, request, reply) => {
          const code = (error as { code?: unknown }).code;
          if (typeof code === 'string' && code.startsWith('FST_')) return notFound(reply);
          request.log.error({ err: error }, 'error no previsto en la superficie pública de la ficha QR');
          return sendPublicProblem(reply, new DomainError('ERR-INTERNAL-UNEXPECTED'));
        });
        // `/*` y no `/:token`: un valor largo o con caracteres raros llega al mismo manejador (el parámetro nombrado de Fastify se limita a 100 caracteres y daría otro camino).
        plugin.get<{ Params: { '*': string } }>('/*', { exposeHeadRoute: false }, handler);
      },
      { prefix },
    );

  /** Segmento único tras el prefijo: vacío o con `/` (subruta, barra final) es el 404 uniforme. */
  const singleSegment = (request: FastifyRequest<{ Params: { '*': string } }>): string | null => {
    const segment = request.params['*'];
    return segment === '' || segment.includes('/') ? null : segment;
  };

  await scope(EMERGENCY_API_PREFIX, async (request, reply) => {
    const token = singleSegment(request);
    // El hash se calcula SIEMPRE (también para valores mal formados) y solo él viaja hacia el caso de uso.
    const hash = hashEmergencyToken(token ?? '');
    const view = token === null ? null : await options.lookupByTokenHash(hash);
    if (view === null) return notFound(reply);
    return reply.type('application/json; charset=utf-8').send(view);
  });

  await scope(EMERGENCY_PAGE_PREFIX, async (request, reply) => {
    if (singleSegment(request) === null) return notFound(reply);
    reply.header('Content-Security-Policy', SHARED_PAGE_CSP);
    return reply.type('text/html; charset=utf-8').send(shell);
  });
}

/**
 * `frameworkErrors` de la instancia: una URL mal codificada bajo el prefijo público responde el 404 uniforme (y cuenta); fuera de él se delega en `next` (400 por defecto o el 404 del enlace veterinario).
 * @implements SC-012-126, SC-012-125
 */
export function emergencyFrameworkErrors(
  next: (error: Error, request: FastifyRequest, reply: FastifyReply) => void,
): (error: Error, request: FastifyRequest, reply: FastifyReply) => void {
  return (error, request, reply) => {
    const failure = failures.get(request.server);
    if (failure !== undefined && isEmergencyPublicPath(request.raw.url ?? '')) {
      failure(request, reply);
      return;
    }
    next(error, request, reply);
  };
}

const privateHeaders = (reply: FastifyReply): void => {
  reply.header('Cache-Control', 'private, no-store');
  reply.header('Vary', 'Cookie');
};
/** La respuesta que lleva el token (activar/regenerar) no pasa por caché ni almacén de repetición (SC-012-109). */
const tokenHeaders = (reply: FastifyReply): void => {
  reply.header('Cache-Control', 'no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Vary', 'Cookie');
};

type PetParams = { Params: { petId: string } };

/** @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-001, SC-012-109 */
export function registerEmergencyPrivateRoutes(app: FastifyInstance, { useCases }: RouteContext, deps: ApplicationDeps): void {
  const onRequest = requireSession(useCases.authenticate);
  const status = new GetEmergencyCardStatusUseCase(deps);
  const activate = new ActivateEmergencyCardUseCase(deps);
  const regenerate = new RegenerateEmergencyCardUseCase(deps);
  const deactivate = new DeactivateEmergencyCardUseCase(deps);
  const consent = new SetEmergencyPhoneConsentUseCase(deps);
  const allergies = new UpdateCriticalAllergiesUseCase(deps);
  const phone = new UpdateAccountPhoneUseCase(deps);

  app.get<PetParams>('/api/pets/:petId/emergency-card', { onRequest }, async (request, reply) => {
    privateHeaders(reply);
    return status.execute(request.userId, request.params.petId);
  });

  app.post<PetParams>('/api/pets/:petId/emergency-card/activate', { onRequest }, async (request, reply) => {
    const issued = await activate.execute(request.userId, request.params.petId, jsonBody(request.body));
    tokenHeaders(reply);
    return reply.status(201).send(issued);
  });

  app.post<PetParams>('/api/pets/:petId/emergency-card/regenerate', { onRequest }, async (request, reply) => {
    const issued = await regenerate.execute(request.userId, request.params.petId, jsonBody(request.body));
    tokenHeaders(reply);
    return reply.status(201).send(issued);
  });

  app.post<PetParams>('/api/pets/:petId/emergency-card/deactivate', { onRequest }, async (request, reply) => {
    await deactivate.execute(request.userId, request.params.petId);
    privateHeaders(reply);
    return reply.status(204).send();
  });

  app.put<PetParams>('/api/pets/:petId/emergency-card/phone-consent', { onRequest }, async (request, reply) => {
    const view = await consent.execute(request.userId, request.params.petId, jsonBody(request.body));
    privateHeaders(reply);
    return view;
  });

  app.put<PetParams>('/api/pets/:petId/critical-allergies', { onRequest }, async (request, reply) => {
    const view = await allergies.execute(request.userId, request.params.petId, jsonBody(request.body));
    privateHeaders(reply);
    return view;
  });

  // El cuerpo y los errores NO se registran (LOG_REDACTION): ningún registro de esta ruta incluye el cuerpo; los errores salen por el manejador común sin eco del valor.
  app.put('/api/account/phone', { onRequest }, async (request, reply) => {
    const view = await phone.execute(request.userId, jsonBody(request.body));
    privateHeaders(reply);
    return view;
  });
}

export interface EmergencyRoutesOptions {
  /** Raíz de los estáticos de la SPA (`dist/`): su `index.html` es el shell de `/e/{token}`; ausente o ilegible = shell mínimo. */
  readonly staticRoot?: string;
  readonly limiter?: EmergencyScanLimiter;
}

/** `index.html` de la SPA como shell (sin datos); un fallo de lectura cae al shell mínimo, nunca rompe el arranque. */
async function readShell(staticRoot: string | undefined): Promise<string | undefined> {
  if (staticRoot === undefined) return undefined;
  try {
    return await readFile(join(staticRoot, 'index.html'), 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Registro único de la ficha en `app.ts` (H-01): sin la configuración de la ficha (`deps.emergency`) NO se registra ninguna ruta (404 del enrutador como si no existiera).
 * La clave HMAC de la IP de la lectura pública es la del enlace veterinario (`deps.sharing.ipHmacSecret`) o, sin ella, la de auditoría.
 */
export async function registerEmergencyRoutes(app: FastifyInstance, context: RouteContext, deps: ApplicationDeps, options: EmergencyRoutesOptions = {}): Promise<void> {
  if (deps.emergency === undefined) return;
  registerEmergencyPrivateRoutes(app, context, deps);
  const lookup = new GetEmergencyCardPublicUseCase(deps);
  const shellHtml = await readShell(options.staticRoot);
  await registerEmergencyPublicRoutes(app, {
    lookupByTokenHash: (hash) => lookup.lookupByTokenHash(hash),
    ipSecret: deps.sharing?.ipHmacSecret ?? deps.auditHmacSecret,
    clock: { now: () => new Date(Date.parse(deps.clock.nowIsoTimestamp())) },
    ...(shellHtml === undefined ? {} : { shellHtml }),
    ...(options.limiter === undefined ? {} : { limiter: options.limiter }),
  });
}
