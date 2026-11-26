/**
 * Foto de perfil de la cuenta (feature 011, #78, T1556; REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001; contrato `user-avatar.openapi.yaml` 3.2.0): `PUT`, `GET`, `GET /meta` y `DELETE` de
 * `/api/account/avatar`. SOLO la propia cuenta: el id de usuario sale de la sesión y ninguna ruta lo recibe. `PUT` con cuerpo crudo JPEG/PNG/WebP de hasta 512 KiB: el `Content-Type`
 * declarado debe coincidir con la firma de los bytes (si no, 415, Trinity H-2); el límite de 10 subidas por hora se consume en `onRequest`, tras autenticar y ANTES de leer el cuerpo,
 * y cuenta éxitos y fallos 413/415/422 (H-6); `GET` y `DELETE` no consumen. `GET` sirve la imagen por proxy (nunca URL firmada ni redirección) con `Cache-Control: private, max-age=300`
 * y `Vary: Cookie` si `v` es la versión vigente (decisión de Neo 1A), `private, no-cache` en otro caso; errores, `PUT`, `DELETE` y `/meta`, `no-store` (H-1).
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001, SC-011-057, SC-011-058, SC-011-059, SC-011-061, ERR-RATE-LIMITED
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { userAvatarMimeOf } from '../../../domain/images/user-avatar-image.ts';
import { USER_AVATAR_MAX_BYTES } from '../../../domain/media/index.ts';
import { DomainError } from '../../../generated/v37/index.ts';
import type { MediaServices } from '../../../application/use-cases/use-case-support.ts';
import { requireSession } from '../plugins/session-auth.ts';
import { rawBody } from '../request-input.ts';
import type { SceneRateLimiter } from '../scene-rate-limit.ts';
import type { RouteContext } from './use-cases.ts';

/** `/api/account/avatar` y `/api/account/avatar/meta`: lo no exitoso de lectura nunca se cachea. */
const AVATAR_PATH = /^\/api\/account\/avatar(?:\/meta)?$/;

/** Tipo declarado sin parámetros y en minúsculas; vacío si no vino. */
const declaredType = (request: FastifyRequest): string => String(request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();

/** @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001 */
export function registerUserAvatarRoutes(app: FastifyInstance, { useCases }: RouteContext, _media: MediaServices, limiter: SceneRateLimiter): void {
  const onRequest = requireSession(useCases.authenticate);
  // Tras autenticar y ANTES de leer el cuerpo (Trinity H-6): cuenta todo intento autenticado con CSRF válido (el guardián CSRF global ya corrió).
  const limited = async (request: FastifyRequest): Promise<void> => limiter.consume('USER_AVATAR', request.userId);

  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (!AVATAR_PATH.test(path)) return payload;
    if (reply.statusCode >= 400 || request.method === 'PUT' || request.method === 'DELETE') reply.header('cache-control', 'no-store');
    else if (path.endsWith('/meta')) reply.header('cache-control', 'private, no-store');
    return payload;
  });

  app.put('/api/account/avatar', { onRequest: [onRequest, limited], bodyLimit: USER_AVATAR_MAX_BYTES + 1 }, async (request) => {
    const bytes = rawBody(request.body);
    // H-2: el tipo declarado debe ser JPEG, PNG o WebP Y coincidir con la firma; el tamaño (413) se decide antes en el caso de uso.
    if (bytes.length <= USER_AVATAR_MAX_BYTES && declaredType(request) !== userAvatarMimeOf(bytes)) throw new DomainError('ERR-MEDIA-TYPE-NOT-ALLOWED');
    return useCases.putUserAvatar.execute(request.userId, bytes);
  });

  app.get('/api/account/avatar/meta', { onRequest }, async (request) => useCases.getUserAvatarMeta.execute(request.userId));

  app.get<{ Querystring: { v?: unknown } }>('/api/account/avatar', { onRequest }, async (request, reply) => {
    const image = await useCases.getUserAvatar.execute(request.userId, request.query.v);
    return reply
      .header('cache-control', image.cacheable ? 'private, max-age=300' : 'private, no-cache')
      .header('vary', 'Cookie')
      .header('x-content-type-options', 'nosniff')
      .type(image.contentType)
      .send(Buffer.from(image.bytes));
  });

  app.delete('/api/account/avatar', { onRequest }, async (request, reply) => {
    await useCases.deleteUserAvatar.execute(request.userId);
    return reply.status(204).send();
  });
}
