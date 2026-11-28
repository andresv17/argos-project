/**
 * Verificación de origen Cloudflare (`X-Origin-Verify`): cuando `ARGOS_ORIGIN_VERIFY_SECRET` está definido,
 * rechaza con 403 toda petición que llegue directo a `*.run.app` sin pasar por Cloudflare (mitiga H-01 a costo $0).
 * Excluye las sondas de Cloud Run (`/healthz`, `/readyz`) y las rutas internas autenticadas por OIDC de Google
 * (`/internal/maintenance`, `/internal/scene-worker`).
 */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export const ORIGIN_VERIFY_HEADER = 'x-origin-verify';

const ORIGIN_VERIFY_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/healthz',
  '/readyz',
  '/internal/maintenance',
  '/internal/scene-worker',
]);

function constantTimeEquals(received: string, expected: Buffer): boolean {
  const receivedBuf = Buffer.from(received, 'utf8');
  if (receivedBuf.length !== expected.length) return false;
  return timingSafeEqual(receivedBuf, expected);
}

export function registerOriginVerifyGuard(app: FastifyInstance, secret: string): void {
  const expected = Buffer.from(secret, 'utf8');
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (ORIGIN_VERIFY_EXEMPT_PATHS.has(path)) return;
    const header = request.headers[ORIGIN_VERIFY_HEADER];
    if (typeof header !== 'string' || !constantTimeEquals(header, expected)) {
      return reply.code(403).header('Cache-Control', 'no-store').type('text/plain; charset=utf-8').send('Forbidden');
    }
  });
}
