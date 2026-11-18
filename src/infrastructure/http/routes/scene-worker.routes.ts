/**
 * `POST /internal/scene-worker`: la invoca Cloud Tasks con un token OIDC (Bearer) de la cuenta `argos-scene-tasks`. Ajena a cookies y a CSRF. Cloud Run es público: la
 * verificación de identidad es la ÚNICA barrera (REQ-ESC6-033, INV-ESC6-018, H-TRI-006-01) y ocurre en `onRequest`, ANTES de leer o parsear el cuerpo (tope 1 KiB):
 * - sin Bearer, token inválido, caducado, sin `email_verified` o con audiencia equivocada (p. ej. el token del Planificador) -> 401 sin cuerpo;
 * - audiencia correcta y correo distinto de `ARGOS_SCENE_TASKS_SA_EMAIL` (igualdad exacta) -> 403 sin cuerpo ni detalle;
 * - identidad correcta: el cuerpo (`SceneWorkerTask`: solo `sceneId` y `attemptId`, UUID) se valida (422) y la ruta ESPERA a `run` (la generación completa) antes de
 *   responder 204 (nunca trabajo tras responder; NFR-ESC6-002). Éxito, fallo registrado, cancelado, duplicado, intento de otra escena o inexistente: el mismo 204 sin
 *   cuerpo (sin oráculo; EDGE-ESC6-024, EDGE-ESC6-027). Un fallo inesperado es un 500 sin detalle (`maxAttempts = 1`; el arrendamiento resuelve).
 * El log no recibe el token, el correo ni los identificadores.
 *
 * @implements REQ-ESC6-033, REQ-ESC6-036, INV-ESC6-018, EDGE-ESC6-024, EDGE-ESC6-027, NFR-ESC6-002
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../../../generated/index.ts';
import type { VerifyOidc } from '../oidc-verify.ts';
import { jsonBody } from '../request-input.ts';

export const SCENE_WORKER_PATH = '/internal/scene-worker';
/** Tope del cuerpo de la tarea: dos UUID caben de sobra. */
export const SCENE_WORKER_BODY_LIMIT = 1024;

export interface SceneWorkerRouteOptions {
  readonly verifyOidc: VerifyOidc;
  /** `ARGOS_SCENE_TASKS_SA_EMAIL`: igualdad exacta. */
  readonly expectedEmail: string;
  readonly run: (job: { sceneId: string; attemptId: string }, signal: AbortSignal) => Promise<unknown>;
  /** `T_GEN` en segundos: la señal de aborto que recibe la ejecución. */
  readonly genTimeoutSeconds: number;
}

const BEARER = /^Bearer ([^\s]+)$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function parseTask(body: unknown): { sceneId: string; attemptId: string } {
  const invalid = (): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'El cuerpo de la tarea no cumple el esquema.');
  const parsed = jsonBody(body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid();
  const record = parsed as Record<string, unknown>;
  const { sceneId, attemptId } = record;
  if (Object.keys(record).length !== 2 || typeof sceneId !== 'string' || typeof attemptId !== 'string' || !UUID_V4.test(sceneId) || !UUID_V4.test(attemptId)) throw invalid();
  return { sceneId, attemptId };
}

/** @implements REQ-ESC6-033, REQ-ESC6-036, INV-ESC6-018 */
export function registerSceneWorkerRoute(app: FastifyInstance, { verifyOidc, expectedEmail, run, genTimeoutSeconds }: SceneWorkerRouteOptions): void {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) return reply.status(401).send();
    let email: string;
    try {
      email = (await verifyOidc(token)).email;
    } catch {
      return reply.status(401).send();
    }
    if (email !== expectedEmail) return reply.status(403).send();
    return undefined;
  };

  app.post(SCENE_WORKER_PATH, { onRequest: authenticate, bodyLimit: SCENE_WORKER_BODY_LIMIT }, async (request, reply) => {
    const job = parseTask(request.body);
    try {
      await run(job, AbortSignal.timeout(genTimeoutSeconds * 1000));
    } catch {
      // Sin `err`: la causa puede traer identificadores o datos del proveedor (INV-ESC6-016).
      request.log.warn('tarea de la escena terminó sin resultado');
      throw new DomainError('ERR-INTERNAL-UNEXPECTED');
    }
    return reply.status(204).send();
  });
}
