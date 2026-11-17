/**
 * Rutas de medios del OpenAPI 3.1.0 (T578; REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-ALB-001, REQ-GCS-004; D-18 A):
 * - `POST /api/pets/{petId}/media?kind=FILE|PHOTO`: cuerpo crudo (cualquier `Content-Type`, nunca decide el tipo; cero multipart) y nombre original en
 *   `X-Argos-Filename` (`encodeURIComponent`). `bodyLimit = ARGOS_MEDIA_MAX_BYTES + 1`: Fastify corta la lectura al superarlo (más, a lo sumo, un
 *   fragmento) y el caso de uso rechaza el byte sobrante con 413; una corriente truncada nunca llega al manejador (no hay `put`).
 * - como máximo `ARGOS_MEDIA_MAX_CONCURRENT_UPLOADS` subidas simultáneas por instancia desde antes de leer el cuerpo; la siguiente: 429 ERR-RATE-LIMITED.
 * - `GET /media`, `GET /media/{mediaId}/access`, `DELETE /media/{mediaId}` (204 siempre tras el COMMIT).
 * - `Cache-Control: no-store` en `/access` y en todo error de estas rutas (la URL firmada nunca se cachea ni se registra).
 *
 * @implements REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, REQ-ALB-001, REQ-GCS-004, ERR-RATE-LIMITED, INV-ARC-004
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError as DomainErrorV31 } from '../../../generated/v31/index.ts';
import { AVATAR_MAX_BYTES } from '../../../domain/media/index.ts';
import type { MediaServices } from '../../../application/use-cases/use-case-support.ts';
import { rawBody } from '../request-input.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

type PetParams = { Params: { petId: string } };
type MediaParams = { Params: { petId: string; mediaId: string } };

const FILENAME_HEADER = 'x-argos-filename';
const FILENAME_MAX_ENCODED = 1000;
/** `/api/pets/<id>/media…` y `/api/pets/<id>/avatar…`: las respuestas de error nunca se cachean. */
export const MEDIA_PATH = /^\/api\/pets\/[^/?]+\/(?:media|avatar)(?:[/?]|$)/;

/** Nombre original decodificado; ausente es null (el caso de uso lo reemplaza por `archivo.<ext>`); una codificación inválida es 422. */
export function decodeFilename(header: string | string[] | undefined): string | null {
  if (header === undefined) return null;
  const fail = () => new DomainErrorV31('ERR-SCHEMA-VALIDATION-FAILED', 'X-Argos-Filename debe estar codificado con encodeURIComponent (hasta 1000 caracteres).', 'X-Argos-Filename');
  if (typeof header !== 'string' || header.length > FILENAME_MAX_ENCODED) throw fail();
  try {
    return decodeURIComponent(header);
  } catch {
    throw fail();
  }
}

/** Contador de subidas en vuelo de la instancia; se libera cuando la respuesta termina o la conexión se cierra. */
function uploadLimiter(max: number) {
  let inFlight = 0;
  return async (_request: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> => {
    if (inFlight >= max) throw new DomainErrorV31('ERR-RATE-LIMITED');
    inFlight += 1;
    let released = false;
    reply.raw.once('close', () => {
      if (!released) {
        released = true;
        inFlight -= 1;
      }
    });
    return payload;
  };
}

/** @implements REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, REQ-GCS-004 */
export function registerMediaRoutes(app: FastifyInstance, { useCases }: RouteContext, media: MediaServices): void {
  const onRequest = requireSession(useCases.authenticate);

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (MEDIA_PATH.test(path) && (reply.statusCode >= 400 || path.endsWith('/access'))) reply.header('cache-control', 'no-store');
    return payload;
  });

  // Un solo contador por instancia para las subidas de archivos y de avatar.
  const limiter = uploadLimiter(media.limits.maxConcurrentUploads);

  app.post<PetParams & { Querystring: { kind?: unknown } }>(
    '/api/pets/:petId/media',
    { onRequest, bodyLimit: media.limits.maxBytes + 1, preParsing: limiter },
    async (request, reply) => {
      const item = await useCases.uploadMedia.execute(request.userId, request.params.petId, {
        kind: request.query.kind,
        filename: decodeFilename(request.headers[FILENAME_HEADER]),
        bytes: rawBody(request.body),
      });
      return reply.status(201).send(item);
    },
  );

  app.get<PetParams & { Querystring: { kind?: unknown; page?: unknown } }>('/api/pets/:petId/media', { onRequest }, async (request) =>
    useCases.listMedia.execute(request.userId, request.params.petId, { kind: request.query.kind, page: request.query.page }),
  );

  app.get<MediaParams>('/api/pets/:petId/media/:mediaId/access', { onRequest }, async (request) =>
    useCases.mediaAccess.execute(request.userId, request.params.petId, request.params.mediaId),
  );

  app.delete<MediaParams>('/api/pets/:petId/media/:mediaId', { onRequest }, async (request, reply) => {
    await useCases.deleteMedia.execute(request.userId, request.params.petId, request.params.mediaId);
    return reply.status(204).send();
  });

  // Avatar (REQ-AVA-001): cuerpo crudo JPEG/PNG/WebP de hasta 512 KiB; el tipo lo decide la firma, no el Content-Type.
  app.put<PetParams>('/api/pets/:petId/avatar', { onRequest, bodyLimit: AVATAR_MAX_BYTES + 1, preParsing: limiter }, async (request) =>
    useCases.putAvatar.execute(request.userId, request.params.petId, rawBody(request.body)),
  );

  app.get<PetParams & { Querystring: { v?: unknown } }>('/api/pets/:petId/avatar', { onRequest }, async (request, reply) => {
    const image = await useCases.getAvatar.execute(request.userId, request.params.petId, request.query.v);
    // `v` igual a la versión actual: inmutable (la URL cambia con cada versión); en otro caso el navegador revalida (REQ-AVA-001, RR-04).
    return reply
      .header('cache-control', image.immutable ? 'private, max-age=31536000, immutable' : 'no-cache')
      .header('vary', 'Cookie')
      .type(image.contentType)
      .send(Buffer.from(image.bytes));
  });

  app.delete<PetParams>('/api/pets/:petId/avatar', { onRequest }, async (request, reply) => {
    await useCases.deleteAvatar.execute(request.userId, request.params.petId);
    return reply.status(204).send();
  });
}
