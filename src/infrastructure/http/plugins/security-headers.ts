/**
 * Cabeceras de seguridad en todas las respuestas (HTML, estáticos, 404, /api/*, sondas). Sin @fastify/helmet (D-27).
 * @implements REQ-CLD-009, SC-CLD-022, H-MERO-013
 */

import type { FastifyInstance } from 'fastify';

export const CONTENT_SECURITY_POLICY = "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
  });
}
