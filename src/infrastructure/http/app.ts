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
import { registerDevMediaRoutes, type DevMediaOptions } from './routes/dev-media.routes.ts';
import { registerSecurityHeaders } from './plugins/security-headers.ts';
import { registerStaticAssets } from './plugins/static-assets.ts';
import { registerAccountRoutes } from './routes/account.routes.ts';
import { registerAuthRoutes } from './routes/auth.routes.ts';
import { registerBackupRoutes } from './routes/backup.routes.ts';
import { registerAssignmentRoutes } from './routes/assignments.routes.ts';
import { registerOwnershipRoutes } from './routes/ownership.routes.ts';
import { registerHouseholdRoutes } from './routes/households.routes.ts';
import { registerOpsRoutes } from './routes/ops-routes.ts';
import { registerPetRoutes } from './routes/pets.routes.ts';
import { registerRecordEditRoutes } from './routes/records-edit.routes.ts';
import { createUseCases } from './routes/use-cases.ts';

export interface HttpAppOptions {
  readonly deps: ApplicationDeps;
  readonly cookieSecure: boolean;
  readonly logger?: FastifyServerOptions['logger'];
  /** Saltos de proxy de confianza (REQ-CLD-003). Por defecto `false`. */
  readonly trustProxy?: boolean | number;
  /** Si está presente se registran /healthz y /readyz (REQ-CLD-004). */
  readonly checkReady?: () => Promise<void>;
  /** Si está presente se sirven los estáticos de dist/ con fallback SPA (REQ-CLD-001), siempre al final. */
  readonly staticRoot?: string;
  /** Host `<bucket>.storage.googleapis.com` del bucket de medios para la CSP (T564); ausente con el driver memory. */
  readonly mediaHost?: string;
  /** Adaptador de memoria y entorno para la ruta de desarrollo `/__dev/media/…` (T571); ausente con el driver gcs. */
  readonly devMedia?: DevMediaOptions;
}

/** @implements INV-ARCH-004, INV-AUTH-007 */
export async function buildApp({ deps, cookieSecure, logger = false, trustProxy = false, checkReady, staticRoot, mediaHost, devMedia }: HttpAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: typeof trustProxy === 'number' ? (_address: string, hop: number) => hop < trustProxy : trustProxy });
  await app.register(cookie);
  app.decorateRequest('userId', '');
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(app);
  registerSecurityHeaders(app, mediaHost === undefined ? {} : { mediaHost });
  registerCsrfGuard(app);
  const context = { useCases: createUseCases(deps), cookieSecure };
  registerAuthRoutes(app, context);
  registerAccountRoutes(app, context);
  registerPetRoutes(app, context);
  registerRecordEditRoutes(app, context);
  registerHouseholdRoutes(app, context);
  registerAssignmentRoutes(app, context);
  registerOwnershipRoutes(app, context);
  registerBackupRoutes(app, context);
  if (devMedia !== undefined) registerDevMediaRoutes(app, context, devMedia);
  if (checkReady !== undefined) registerOpsRoutes(app, { checkReady });
  if (staticRoot !== undefined) await registerStaticAssets(app, { root: staticRoot });
  return app;
}
