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
import { registerAdminGate } from './admin-gate.ts';
import { registerCsrfGuard } from './plugins/csrf-guard.ts';
import { registerProblemDetails } from './plugins/problem-details.ts';
import { registerDevMediaRoutes, type DevMediaOptions } from './routes/dev-media.routes.ts';
import { registerSecurityHeaders } from './plugins/security-headers.ts';
import { registerStaticAssets } from './plugins/static-assets.ts';
import { registerAccountRoutes } from './routes/account.routes.ts';
import { registerAuthRoutes } from './routes/auth.routes.ts';
import { registerGoogleAuthRoutes } from './routes/google-auth.routes.ts';
import { GoogleRateLimiter } from './google-rate-limit.ts';
import { AdminAccessLimiter } from './admin-rate-limit.ts';
import { RegistrationRateLimiter } from './registration-rate-limit.ts';
import { registerAdminAboutRoutes, registerPublicAboutRoutes } from './routes/about.routes.ts';
import { registerAdminRoutes } from './routes/admin.routes.ts';
import { registerBackupRoutes } from './routes/backup.routes.ts';
import { registerAssignmentRoutes } from './routes/assignments.routes.ts';
import { registerOwnershipRoutes } from './routes/ownership.routes.ts';
import { registerCoOwnershipRoutes } from './routes/co-ownership.routes.ts';
import { emergencyFrameworkErrors, registerEmergencyRoutes } from './routes/emergency.routes.ts';
import { registerCareRoutes } from './routes/care.routes.ts';
import { CareRateLimiter } from './care-rate-limit.ts';
import { registerChipRoutes } from './routes/chip.routes.ts';
import { registerAdminDisputeRoutes } from './routes/admin-disputes.routes.ts';
import { registerHouseholdRoutes } from './routes/households.routes.ts';
import { registerOpsRoutes } from './routes/ops-routes.ts';
import { registerPetRoutes } from './routes/pets.routes.ts';
import { registerMediaRoutes } from './routes/media.routes.ts';
import { registerUserAvatarRoutes } from './routes/user-avatar.routes.ts';
import { registerShareLinkRoutes } from './routes/share-links.routes.ts';
import { applySharedHeaders, createSharedFailure, isSharedPagePath, registerSharedRoutes, sharedFrameworkErrors } from './routes/shared.routes.ts';
import { registerHouseholdPhotoRoutes } from './routes/household-photo.routes.ts';
import { registerSceneConsentRoutes } from './routes/scene-consent.routes.ts';
import { registerSceneHeaders } from './routes/scene-headers.ts';
import { registerSceneRoutes } from './routes/scene.routes.ts';
import { SceneRateLimiter } from './scene-rate-limit.ts';
import { registerRecordEditRoutes } from './routes/records-edit.routes.ts';
import { createUseCases } from './routes/use-cases.ts';

export interface HttpAppOptions {
  readonly deps: ApplicationDeps;
  readonly cookieSecure: boolean;
  /** Base pública de los enlaces (config `ARGOS_PUBLIC_BASE_URL`); sin ella, `http://localhost` (solo pruebas y desarrollo). */
  readonly publicBaseUrl?: string | null;
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
export async function buildApp({ deps, cookieSecure, publicBaseUrl, logger = false, trustProxy = false, checkReady, staticRoot, mediaHost, devMedia }: HttpAppOptions): Promise<FastifyInstance> {
  // `frameworkErrors` (EDGE-005-25): la URL mal codificada bajo `/api/shared/` responde el 404 uniforme del enlace veterinario, no el 400 de Fastify.
  const sharedFailure: { current: ReturnType<typeof createSharedFailure> | null } = { current: null };
  const app = Fastify({
    logger,
    trustProxy: typeof trustProxy === 'number' ? (_address: string, hop: number) => hop < trustProxy : trustProxy,
    frameworkErrors: emergencyFrameworkErrors(sharedFrameworkErrors(() => sharedFailure.current)),
  });
  await app.register(cookie);
  app.decorateRequest('userId', '');
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  registerProblemDetails(app);
  registerSecurityHeaders(app, mediaHost === undefined ? {} : { mediaHost });
  // La página HTML `/shared/{token}` (SPA sin datos) lleva las mismas cabeceras de REQ-VET-006 y su CSP propia, también en el fallback estático (REQ-VET-006, A-15).
  app.addHook('onRequest', async (request, reply) => {
    if (isSharedPagePath(request.url)) applySharedHeaders(reply, true);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (isSharedPagePath(request.url)) applySharedHeaders(reply, true);
    return payload;
  });
  registerCsrfGuard(app);
  const context = { useCases: createUseCases(deps), cookieSecure, publicBaseUrl: publicBaseUrl ?? 'http://localhost' };
  // Un solo límite de registros nuevos por IP efectiva (EDGE-009-040) compartido por el alta con contraseña y el primer acceso con Google.
  const registrationLimiter = new RegistrationRateLimiter(() => Date.parse(deps.clock.nowIsoTimestamp()));
  registerAuthRoutes(app, context, registrationLimiter);
  registerGoogleAuthRoutes(app, context, new GoogleRateLimiter(() => Date.parse(deps.clock.nowIsoTimestamp())), registrationLimiter);
  // Portal de administración (feature 009, Fase 3): solo si la composición conectó Google de administración; sin él `/api/admin/*` no existe (404).
  const sceneLimiter = deps.scene !== undefined && deps.media !== undefined ? new SceneRateLimiter(() => Date.parse(deps.clock.nowIsoTimestamp())) : undefined;
  if (deps.admin !== undefined) {
    // Puerta unica por peticion de /api/admin/* (011, H-7): antes de montar cualquier ruta de administracion (un hook global solo alcanza a las rutas posteriores).
    registerAdminGate(app, context.useCases);
    registerAdminRoutes(app, context, new AdminAccessLimiter(() => Date.parse(deps.clock.nowIsoTimestamp())), (userIds) => {
      for (const userId of userIds) sceneLimiter?.clearUser(userId);
    });
    // «Acerca de» (feature 010, T1430): escritura solo con sesión de administración (404 uniforme sin ella).
    registerAdminAboutRoutes(app, context, deps.media);
    // Cola de disputas de chip y arbitraje (feature 012, T1636): bajo la misma puerta única de /api/admin/*.
    registerAdminDisputeRoutes(app, context);
  }
  // «Acerca de» público (010, D10-07): anónimo, fuera de toda sesión; la foto solo se sirve si hay medios conectados (sin ellos, 404).
  registerPublicAboutRoutes(app, context);
  registerAccountRoutes(app, context);
  registerPetRoutes(app, context);
  registerRecordEditRoutes(app, context);
  // Medios (feature 004): solo si la composición conectó el almacenamiento (REQ-GCS-003); sin él las rutas no existen (404).
  if (deps.media !== undefined) registerMediaRoutes(app, context, deps.media);
  // Foto de perfil de la cuenta (feature 011, #78): solo con medios conectados; su limitador (ámbito USER_AVATAR) es propio de la instancia.
  if (deps.media !== undefined) registerUserAvatarRoutes(app, context, deps.media, new SceneRateLimiter(() => Date.parse(deps.clock.nowIsoTimestamp())));
  // Escena del hogar (feature 006): solo si la composición conectó la escena y los medios; sin ellos las rutas no existen (404).
  if (deps.scene !== undefined && deps.media !== undefined && sceneLimiter !== undefined) {
    const limiter = sceneLimiter;
    registerSceneHeaders(app);
    registerSceneRoutes(app, context, limiter);
    registerHouseholdPhotoRoutes(app, context, deps.media, limiter);
    registerSceneConsentRoutes(app, context, limiter);
  }
  registerShareLinkRoutes(app, context);
  sharedFailure.current = createSharedFailure(context.useCases, deps);
  registerSharedRoutes(app, context, sharedFailure.current);
  registerHouseholdRoutes(app, context);
  registerAssignmentRoutes(app, context);
  registerOwnershipRoutes(app, context);
  registerCoOwnershipRoutes(app, context);
  // Ficha QR de emergencia (feature 012, Bloque D, T1675): solo con `deps.emergency`; `/api/emergency/*` y `/e/*` van antes de los estáticos y comparten un 404 uniforme.
  await registerEmergencyRoutes(app, context, deps, staticRoot === undefined ? {} : { staticRoot });
  registerCareRoutes(app, context, new CareRateLimiter(() => Date.parse(deps.clock.nowIsoTimestamp())));
  // Reclamación y disputa de microchip (feature 012, T1636): la IP efectiva de los contadores sale de los saltos de proxy de confianza.
  registerChipRoutes(app, context, { trustProxyHops: typeof trustProxy === 'number' ? trustProxy : 0 });
  registerBackupRoutes(app, context);
  if (devMedia !== undefined) registerDevMediaRoutes(app, context, devMedia);
  if (checkReady !== undefined) registerOpsRoutes(app, { checkReady });
  if (staticRoot !== undefined) await registerStaticAssets(app, { root: staticRoot });
  return app;
}
