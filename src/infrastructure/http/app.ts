/**
 * Aplicación Fastify de la API. Orden de la frontera: CSRF (`onRequest` global) → sesión
 * (`onRequest` de la ruta) → cuerpo → esquema y dominio (casos de uso). Los cuerpos se leen como bytes, en cualquier
 * tipo de contenido, y se decodifican en UTF-8 estricto; los errores salen como `application/problem+json`.
 *
 * @implements INV-ARCH-004, INV-AUTH-007, ERR-INTERNAL-UNEXPECTED
 */

import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { ApplicationDeps } from '../../application/use-cases/use-case-support.ts';
import { registerCsrfGuard } from './plugins/csrf-guard.ts';
import { registerProblemDetails } from './plugins/problem-details.ts';
import { registerAccountRoutes } from './routes/account.routes.ts';
import { registerAuthRoutes } from './routes/auth.routes.ts';
import { registerBackupRoutes } from './routes/backup.routes.ts';
import { registerHouseholdRoutes } from './routes/households.routes.ts';
import { registerPetRoutes } from './routes/pets.routes.ts';
import { createUseCases } from './routes/use-cases.ts';

export interface HttpAppOptions {
  readonly deps: ApplicationDeps;
  readonly cookieSecure: boolean;
  readonly logger?: FastifyServerOptions['logger'];
}

/** @implements INV-ARCH-004, INV-AUTH-007 */
export async function buildApp({ deps, cookieSecure, logger = false }: HttpAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });
  await app.register(cookie);
  app.decorateRequest('userId', '');
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(app);
  registerCsrfGuard(app);
  const context = { useCases: createUseCases(deps), cookieSecure };
  registerAuthRoutes(app, context);
  registerAccountRoutes(app, context);
  registerPetRoutes(app, context);
  registerHouseholdRoutes(app, context);
  registerBackupRoutes(app, context);
  return app;
}
