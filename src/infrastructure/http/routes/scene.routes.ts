/**
 * Rutas de la escena del hogar (feature 006, `home-scene.openapi.yaml`; REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-007, REQ-ESC6-012, REQ-ESC6-019, REQ-ESC6-020, REQ-ESC6-034):
 * `GET /households/{id}/scene`, `POST …/scene/generate` (202 con el intento aceptado, 200 con el estado vigente), `GET …/scene/image` (302 firmada) y las tres espejo
 * `/me/scene…` del propietario sin hogar (D6-09) con un solo manejador parametrizado por ámbito. Sesión → CSRF (global) → límite de tasa por usuario (solo la
 * generación) → caso de uso: el `404` sin acceso lo decide el caso de uso ANTES del `403` de rol (INV-ESC6-007, INV-ESC6-019). El cliente nunca envía modo, referencias
 * ni prompt: solo `action` y la cabecera `Idempotency-Key`.
 *
 * @implements REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-012, REQ-ESC6-019, REQ-ESC6-020, REQ-ESC6-034, INV-ESC6-007, INV-ESC6-019
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SceneTarget } from '../../../application/use-cases/scene-use-cases.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { jsonBody } from '../request-input.ts';
import type { SceneRateLimiter } from '../scene-rate-limit.ts';
import type { RouteContext } from './use-cases.ts';

/** `v` es SOLO una etiqueta de caché (INV-ESC6-019): nunca decide qué imagen se entrega, así que uno ajeno, antiguo, repetido o mal formado se ignora (el contrato no declara 422 en esta ruta). */
function imageTag(query: unknown): string | undefined {
  const v = (query as { v?: unknown } | undefined)?.v;
  return typeof v === 'string' ? v : undefined;
}

/** 302 sin cuerpo hacia la URL firmada; las cabeceras de seguridad las añade `registerSceneHeaders`. La URL no se registra. */
export function redirectToSigned(reply: FastifyReply, url: string): FastifyReply {
  return reply.status(302).header('location', url).send();
}

/** @implements REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-012, REQ-ESC6-019, REQ-ESC6-034 */
export function registerSceneRoutes(app: FastifyInstance, { useCases }: RouteContext, limiter: SceneRateLimiter): void {
  const onRequest = requireSession(useCases.authenticate);
  const limited = async (request: FastifyRequest): Promise<void> => limiter.consume('GENERATE', request.userId);

  const bind = (prefix: string, target: (request: FastifyRequest) => SceneTarget): void => {
    app.get(`${prefix}/scene`, { onRequest }, async (request) => useCases.getScene.execute(request.userId, target(request)));

    app.post(`${prefix}/scene/generate`, { onRequest: [onRequest, limited] }, async (request, reply) => {
      const result = await useCases.requestScene.execute(request.userId, target(request), jsonBody(request.body), request.headers['idempotency-key']);
      return reply.status(result.accepted ? 202 : 200).send(result.view);
    });

    app.get(`${prefix}/scene/image`, { onRequest }, async (request, reply) => {
      const image = await useCases.getSceneImage.execute(request.userId, target(request), imageTag(request.query));
      return redirectToSigned(reply, image.url);
    });
  };

  bind('/api/households/:householdId', (request) => ({ kind: 'HOUSEHOLD', householdId: (request.params as { householdId: string }).householdId }));
  bind('/api/me', () => ({ kind: 'OWNER' }));
}
