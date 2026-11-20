/**
 * Componente común de cabeceras de la escena (feature 006, H-TRI-006-13; REQ-ESC6-019, SC-ESC6-081): toda respuesta de las rutas de la escena, de la foto del hogar
 * y del consentimiento (incluidas las `302` firmadas y los errores) lleva `Cache-Control: no-store`, `Referrer-Policy: no-referrer` y `X-Content-Type-Options: nosniff`.
 * Una URL firmada, una vista de estado o un rechazo con el contexto del hogar nunca se cachean ni viajan en el `Referer`.
 *
 * @implements REQ-ESC6-019, INV-ESC6-019, NFR-ESC6-003
 */

import type { FastifyInstance, FastifyReply } from 'fastify';

/** `/api/households/<id>/(scene|photo)…`, `/api/me/scene…` y `/api/scene-consent…`. */
export const SCENE_PATH = /^\/api\/(?:households\/[^/?]+\/(?:scene|photo)|me\/scene|scene-consent)(?:[/?]|$)/;

export function applySceneHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('referrer-policy', 'no-referrer');
  reply.header('x-content-type-options', 'nosniff');
}

export function registerSceneHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? request.url;
    if (SCENE_PATH.test(path)) applySceneHeaders(reply);
    return payload;
  });
}
