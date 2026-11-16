/**
 * Estáticos de dist/ con @fastify/static y fallback SPA a index.html (solo GET/HEAD fuera de /api/* y /assets/*).
 * Dotfiles (segmentos con punto inicial, también /.well-known/*) dan 404 sin contenido ni SPA; sin listado de directorios; rutas con traversal codificado, barras dobles o invertidas y byte
 * nulo dan 404 sin contenido. El fallback no se aplica a rutas con extensión en el último segmento (parecen archivos:
 * el cliente o el analizador de URL pueden haber normalizado un traversal a /secret.txt, que no debe devolver index.html).
 * @implements REQ-CLD-001, REQ-CLD-009, SC-CLD-022
 */

import { sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export interface StaticAssetsOptions {
  readonly root: string;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';
// Incluye cualquier segmento que empiece por punto (dotfiles): 404 uniforme; @fastify/static con dotfiles:'deny' lanzaría un 403 sin código FST_* que acabaría en 500.
const SUSPICIOUS = /%2e|%2f|%5c|%00|\\|\/\/|\.\.|\/\./i;

export async function registerStaticAssets(app: FastifyInstance, { root }: StaticAssetsOptions): Promise<void> {
  const assetsDir = `${root}${sep}assets${sep}`;
  // Traversal codificado, barras dobles/invertidas y byte nulo: 404 uniforme antes de tocar el sistema de archivos.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/') && SUSPICIOUS.test(path)) return reply.status(404).type('text/plain; charset=utf-8').send('Not Found');
    return undefined;
  });

  await app.register(fastifyStatic, {
    root,
    dotfiles: 'deny',
    index: ['index.html'],
    list: false,
    cacheControl: false,
    wildcard: true,
    setHeaders: (res, filePath) => {
      res.header('Cache-Control', filePath.startsWith(assetsDir) ? IMMUTABLE : NO_CACHE);
    },
  });

  app.setNotFoundHandler(async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const spa = isRead && !path.startsWith('/api/') && !path.startsWith('/assets/') && !SUSPICIOUS.test(path) && !/\.[^/]*$/.test(path);
    if (!spa) return reply.status(404).type('text/plain; charset=utf-8').send('Not Found');
    return reply.header('Cache-Control', NO_CACHE).sendFile('index.html');
  });
}
