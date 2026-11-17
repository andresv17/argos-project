/**
 * Cabeceras de seguridad en todas las respuestas (HTML, estáticos, 404, /api/*, sondas). Sin @fastify/helmet (D-27).
 * CSP de medios (T564, E3-03, D-19 A, SC-ALM-012): con un host de bucket, `img-src` y `frame-src` admiten exactamente
 * `https://<bucket>.storage.googleapis.com` y nada más amplio; `object-src 'none'` se mantiene.
 * @implements REQ-CLD-009, SC-CLD-022, H-MERO-013, REQ-ARC-003
 */

import type { FastifyInstance } from 'fastify';

export const CONTENT_SECURITY_POLICY = "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,62}$/;
const MEDIA_HOST = /^[a-z0-9][a-z0-9._-]{1,62}\.storage\.googleapis\.com$/;

/** Host virtual del bucket (`<bucket>.storage.googleapis.com`). Lanza si el nombre no es un nombre de bucket válido. */
export function mediaBucketHost(bucket: string): string {
  if (!BUCKET_NAME.test(bucket)) throw new Error('Nombre de bucket de medios no válido.');
  return `${bucket}.storage.googleapis.com`;
}

export interface SecurityHeadersOptions {
  /** Host `<bucket>.storage.googleapis.com` del bucket de medios; ausente con el adaptador de memoria. */
  readonly mediaHost?: string;
}

/** CSP con el host de medios en `img-src` y `frame-src` (solo ese host). Sin host devuelve la CSP base. */
export function buildContentSecurityPolicy(mediaHost?: string): string {
  if (mediaHost === undefined) return CONTENT_SECURITY_POLICY;
  if (!MEDIA_HOST.test(mediaHost)) throw new Error('Host de medios no válido para la CSP.');
  return CONTENT_SECURITY_POLICY.replace("img-src 'self' data:", `img-src 'self' data: https://${mediaHost}`).replace("object-src 'none'", `frame-src https://${mediaHost}; object-src 'none'`);
}

export function registerSecurityHeaders(app: FastifyInstance, options: SecurityHeadersOptions = {}): void {
  const policy = buildContentSecurityPolicy(options.mediaHost);
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Content-Security-Policy', policy);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });
}
