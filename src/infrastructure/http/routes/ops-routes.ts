/**
 * Sondas operativas: /healthz (vida, sin dependencias) y /readyz (base accesible y migraciones aplicadas).
 * /readyz guarda en memoria, por instancia (cierre del registro), el resultado 60 s (éxito o fallo, D-17) y comparte
 * la promesa en vuelo entre peticiones simultáneas (RC-1). Tiempo máximo de la comprobación: 5 s. El 503 no revela la causa.
 *
 * @implements REQ-CLD-004, INV-ARCH-003, ERR-INTERNAL-UNEXPECTED
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { nowEpochMs } from '../../adapters/system-clock.adapter.ts';

export const READYZ_CACHE_MS = 60_000;
export const READYZ_TIMEOUT_MS = 5_000;
const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

export interface OpsRoutesOptions {
  readonly checkReady: () => Promise<void>;
}

interface ReadyEntry {
  readonly ready: Promise<boolean>;
  readonly at: number;
}

const NOT_READY = {
  type: 'urn:argos:error:ERR-INTERNAL-UNEXPECTED',
  code: 'ERR-INTERNAL-UNEXPECTED',
  title: 'Servicio no disponible',
  status: 503,
  detail: 'El servicio aún no está listo para recibir tráfico.',
  invariantRef: 'INV-ARCH-003',
};

function withTimeout(check: () => Promise<void>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), READYZ_TIMEOUT_MS);
    let call: Promise<void>;
    try {
      call = check();
    } catch {
      clearTimeout(timer);
      resolve(false);
      return;
    }
    call.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

export function registerOpsRoutes(app: FastifyInstance, { checkReady }: OpsRoutesOptions): void {
  let cache: ReadyEntry | undefined;

  app.get('/healthz', async (_request, reply: FastifyReply) => reply.header('Cache-Control', 'no-store').send({ status: 'ok' }));

  app.get('/readyz', async (_request, reply: FastifyReply) => {
    const now = nowEpochMs();
    if (cache === undefined || now - cache.at >= READYZ_CACHE_MS) cache = { ready: withTimeout(checkReady), at: now };
    const ready = await cache.ready;
    reply.header('Cache-Control', 'no-store');
    if (ready) return reply.send({ status: 'ready' });
    return reply.status(503).type(PROBLEM_CONTENT_TYPE).send(NOT_READY);
  });
}
