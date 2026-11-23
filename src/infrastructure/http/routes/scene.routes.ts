/**
 * Rutas de la escena del hogar (feature 006, `home-scene.openapi.yaml`; REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-007, REQ-ESC6-012, REQ-ESC6-019, REQ-ESC6-020, REQ-ESC6-034):
 * `GET /households/{id}/scene`, `POST …/scene/generate` (202 con el intento aceptado, 200 con el estado vigente), `GET …/scene/image` (302 firmada; con `download=1`, `attachment`, o 200 si el driver no firma) y las tres espejo
 * `/me/scene…` del propietario sin hogar (D6-09) con un solo manejador parametrizado por ámbito. Sesión → CSRF (global) → límite de tasa por usuario (solo la
 * generación) → caso de uso: el `404` sin acceso lo decide el caso de uso ANTES del `403` de rol (INV-ESC6-007, INV-ESC6-019). El cliente nunca envía modo, referencias
 * ni prompt: solo `action` y la cabecera `Idempotency-Key`.
 *
 * @implements REQ-UX8-002, REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-012, REQ-ESC6-019, REQ-ESC6-020, REQ-ESC6-034, INV-ESC6-007, INV-ESC6-019
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SceneTarget } from '../../../application/use-cases/scene-use-cases.ts';
import { DomainError } from '../../../generated/index.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { jsonBody } from '../request-input.ts';
import type { SceneRateLimiter } from '../scene-rate-limit.ts';
import type { RouteContext } from './use-cases.ts';

/** `v` es SOLO una etiqueta de caché (INV-ESC6-019): nunca decide qué imagen se entrega, así que uno ajeno, antiguo, repetido o mal formado se ignora (el contrato no declara 422 en esta ruta). */
function imageTag(query: unknown): string | undefined {
  const v = (query as { v?: unknown } | undefined)?.v;
  return typeof v === 'string' ? v : undefined;
}

/**
 * `download` (REQ-UX8-002, 006 3.5.0): ausente = lectura en línea sin cambios; solo se admite el valor `1` (enum del contrato). Cualquier otro valor, vacío o repetido es
 * `422 ERR-SCHEMA-VALIDATION-FAILED`. No elige imagen (INV-ESC6-019): solo cambia el tratamiento del archivo.
 */
function wantsDownload(query: unknown): boolean {
  const value = (query as { download?: unknown } | undefined)?.download;
  if (value === undefined) return false;
  if (value !== '1') throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'download solo admite el valor 1.', 'download');
  return true;
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
      const download = wantsDownload(request.query);
      const image = await useCases.getSceneImage.execute(request.userId, target(request), imageTag(request.query), { download });
      // Sin URL firmada (driver de memoria) y con download=1: 200 con la imagen como archivo, sin redirección (contrato 006 3.5.0, ImageAttachment).
      if (image.bytes !== null && image.downloadFilename !== null) {
        return reply.status(200).header('content-type', image.mime).header('content-disposition', `attachment; filename="${image.downloadFilename}"`).send(Buffer.from(image.bytes));
      }
      return redirectToSigned(reply, image.url);
    });
  };

  bind('/api/households/:householdId', (request) => ({ kind: 'HOUSEHOLD', householdId: (request.params as { householdId: string }).householdId }));
  bind('/api/me', () => ({ kind: 'OWNER' }));
}
