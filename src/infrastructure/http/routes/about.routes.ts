/**
 * Rutas de la sección «Acerca de» (feature 010, Bloque E, T1430; contrato `about.openapi.yaml` 1.0.1; D10-07, REQ-ACE10-001..004, INV-ACE10-001, EDGE-010-004, EDGE-010-006, EDGE-010-011).
 * - Públicas y anónimas (`GET /api/about`, `GET /api/about/photo`): sin sesión, sin cookie, sin `X-Argos-Request`; no leen ni emiten cookies, de modo que una cookie caducada o ajena
 *   da el mismo 200 (nunca 401 ni redirección). La respuesta pública es la vista cerrada: sin clave de objeto, versión, autor ni rutas de almacenamiento.
 * - Administración (`GET|PUT /api/admin/about`, `PUT /api/admin/about/photo`): solo con `argos_admin_session`; sin ella el MISMO 404 uniforme que una ruta inexistente de `/api/admin`.
 *   Orden de las escrituras: `X-Argos-Request` (403, hook global) -> sesión (404 uniforme; ANTES de leer el cuerpo, de modo que un cuerpo gigante sin sesión no distingue la ruta) -> origen ajeno (403)
 *   -> lectura del cuerpo (413) -> esquema (422) -> precondición (412). Un cuerpo JSON mayor que el límite de lectura es 413 `ERR-ACE10-BODY-TOO-LARGE` (H-ARCH-ACE-413, ver `problem-details.ts`);
 *   el de la foto cruda, `ERR-MEDIA-TOO-LARGE` heredado. Solo las escrituras renuevan la inactividad.
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, INV-ACE10-001, EDGE-010-004, EDGE-010-006, EDGE-010-011
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MediaServices } from '../../../application/use-cases/use-case-support.ts';
import { DomainError } from '../../../generated/index.ts';
import { jsonBody, rawBody } from '../request-input.ts';
import { ADMIN_API_CONTENT_SECURITY_POLICY, adminSessionTokenOf, hasForeignOrigin, uniformNotFound } from './admin.routes.ts';
import type { RouteContext } from './use-cases.ts';

/** Límite de lectura del JSON de texto: 20 000 caracteres como máximo (hasta 6 bytes por unidad `\uXXXX`) más el alt y la envoltura, con holgura. */
export const ABOUT_TEXT_BODY_LIMIT = 256 * 1024;
/** Un minuto en caché pública: la URL lleva `?v=<versión>`, de modo que una escritura nueva se ve de inmediato. */
const PUBLIC_PHOTO_CACHE_CONTROL = 'public, max-age=60';

/** Administrador autenticado por petición (se resuelve en `onRequest`, antes de leer el cuerpo). */
const adminOf = new WeakMap<FastifyRequest, string>();

/** @implements REQ-ACE10-001, EDGE-010-004, INV-ACE10-001 */
export function registerPublicAboutRoutes(app: FastifyInstance, { useCases }: RouteContext): void {
  app.get('/api/about', async (_request, reply) => reply.status(200).send(await useCases.getPublicAbout.execute()));

  app.get('/api/about/photo', async (_request, reply) => {
    const photo = await useCases.getPublicAboutPhoto.execute();
    return reply
      .status(200)
      .header('content-type', photo.mime)
      .header('cache-control', PUBLIC_PHOTO_CACHE_CONTROL)
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('content-disposition', 'inline')
      .send(Buffer.from(photo.bytes));
  });
}

/** @implements REQ-ACE10-002, REQ-ACE10-003, REQ-ACE10-004, INV-ACE10-001, EDGE-010-006, EDGE-010-011 */
export function registerAdminAboutRoutes(app: FastifyInstance, { useCases }: RouteContext, media: MediaServices | undefined): void {
  const noStore = (reply: FastifyReply): FastifyReply => reply.header('cache-control', 'no-store').header('content-security-policy', ADMIN_API_CONTENT_SECURITY_POLICY);

  /** `onRequest` de la administración: sesión (404 uniforme) y, en las escrituras, origen propio (403). Antes de leer cualquier cuerpo. */
  const adminGate = (write: boolean) => async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    const session = await useCases.adminAuthenticate.execute(adminSessionTokenOf(request), { renew: write });
    if (session === null) return uniformNotFound(reply);
    if (write && hasForeignOrigin(request)) throw new DomainError('ERR-AUTH-CSRF-REJECTED', undefined, 'Origin');
    adminOf.set(request, session.adminId);
    return undefined;
  };
  const adminId = (request: FastifyRequest): string => adminOf.get(request) ?? '';

  app.get('/api/admin/about', { onRequest: adminGate(false) }, async (_request, reply) => {
    const view = await useCases.getAdminAbout.execute();
    return noStore(reply).header('etag', view.etag).status(200).send(view);
  });

  app.put<{ Body: unknown }>('/api/admin/about', { onRequest: adminGate(true), bodyLimit: ABOUT_TEXT_BODY_LIMIT }, async (request, reply) => {
    const view = await useCases.updateAboutText.execute({ adminId: adminId(request), ifMatch: request.headers['if-match'], body: jsonBody(request.body) });
    return noStore(reply).header('etag', view.etag).status(200).send(view);
  });

  // Foto cruda (como el avatar de 004 y la foto del hogar de 006): el tipo lo decide la firma. Lectura hasta `ARGOS_MEDIA_MAX_BYTES + 1`; un byte más del tope es 422, mucho más es 413.
  app.put<{ Body: unknown }>('/api/admin/about/photo', { onRequest: adminGate(true), bodyLimit: (media?.limits.maxBytes ?? 0) + 1 }, async (request, reply) => {
    const view = await useCases.putAboutPhoto.execute({ adminId: adminId(request), ifMatch: request.headers['if-match'], bytes: rawBody(request.body) });
    return noStore(reply).header('etag', view.etag).status(200).send(view);
  });
}
