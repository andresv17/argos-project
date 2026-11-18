/**
 * Ruta de desarrollo `GET /__dev/media/<clave>` del adaptador de memoria (REQ-GCS-003): autenticada, solo con `NODE_ENV != production`,
 * `X-Content-Type-Options: nosniff` (también global) y `Content-Disposition: attachment` salvo imágenes. Una clave no válida o un objeto
 * inexistente responden 404 sin repetir la clave.
 *
 * @implements REQ-GCS-003, INV-ARC-003, INV-ARC-004
 */

import type { FastifyInstance } from 'fastify';
import type { MediaStoragePort } from '../../../application/ports/media-storage.port.ts';
import { isMediaObjectKey } from '../../../domain/media/index.ts';
import { DEV_MEDIA_PATH } from '../../adapters/memory-media-storage.adapter.ts';
import { requireSession } from '../plugins/session-auth.ts';
import type { RouteContext } from './use-cases.ts';

export interface DevMediaOptions {
  readonly storage: MediaStoragePort;
  /** `NODE_ENV` que recibe la composición (solo `app-config` lee el entorno). Con `production` no se registra la ruta. */
  readonly nodeEnv?: string;
}

/** @returns true si la ruta quedó registrada. */
export function registerDevMediaRoutes(app: FastifyInstance, { useCases }: RouteContext, options: DevMediaOptions): boolean {
  if (options.nodeEnv === 'production') return false;
  const onRequest = requireSession(useCases.authenticate);
  app.get<{ Params: { '*': string } }>(`${DEV_MEDIA_PATH}*`, { onRequest }, async (request, reply) => {
    const key = request.params['*'];
    const found = isMediaObjectKey(key) ? await options.storage.get(key) : null;
    if (found === null) return reply.code(404).header('Cache-Control', 'no-store').send({ status: 404 });
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').type(found.contentType);
    if (!found.contentType.startsWith('image/')) reply.header('Content-Disposition', 'attachment');
    return reply.send(Buffer.from(found.bytes));
  });
  return true;
}
