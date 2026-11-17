/**
 * Arranque de la API local: lee la configuración (INV-ARCH-006), abre SQLite con sus migraciones,
 * compone los adaptadores de producción y escucha solo en 127.0.0.1. Los registros de Fastify ocultan cookies y salen
 * como JSON con `severity` (Cloud Logging); `SIGTERM` cierra el servidor en <= 7 s (REQ-CLD-006, REQ-CLD-008).
 *
 * @implements INV-ARCH-004, INV-ARCH-006, INV-AUTH-003, INV-AUTH-006
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { UnitOfWorkPort } from '../../application/ports/unit-of-work.port.ts';
import type { ApplicationDeps } from '../../application/use-cases/use-case-support.ts';
import { CryptoSecureTokenAdapter } from '../adapters/crypto-secure-token.adapter.ts';
import { CryptoUuidAdapter } from '../adapters/crypto-uuid.adapter.ts';
import { HmacAuditPseudonymAdapter } from '../adapters/hmac-audit-pseudonym.adapter.ts';
import { RepositoryAuditLogAdapter } from '../adapters/repository-audit-log.adapter.ts';
import { Sha256BackupTokenAdapter } from '../adapters/sha256-backup-token.adapter.ts';
import { SlidingWindowRateLimiterAdapter, rateLimitsFrom } from '../adapters/sliding-window-rate-limiter.adapter.ts';
import { ScryptPasswordHasherAdapter } from '../adapters/scrypt-password-hasher.adapter.ts';
import { SystemClockAdapter } from '../adapters/system-clock.adapter.ts';
import { DEVELOPMENT_AUDIT_HMAC_SECRET, loadAppConfig, type AppConfig } from '../config/app-config.ts';
import type { MediaStoragePort } from '../../application/ports/media-storage.port.ts';
import { runMaintenance, type MediaQueueResult } from '../../application/use-cases/maintenance-use-cases.ts';
import { buildApp } from './app.ts';
import { mediaBucketHost } from './plugins/security-headers.ts';
import { cloudLoggerOptions } from './cloud-logging.ts';
import { installShutdownHandlers } from './graceful-shutdown.ts';
import { createOidcVerifier } from './oidc-verify.ts';
import { registerMaintenanceRoute } from './routes/maintenance-routes.ts';

/**
 * Opciones del logger de producción: `cookie` de la petición y `set-cookie` de la respuesta se ocultan (INV-AUTH-003).
 * Se exportan para que `tests/security/` las ejerza con una salida capturada (H-113-5).
 * @implements INV-AUTH-003
 */
export const PRODUCTION_LOGGER_OPTIONS = cloudLoggerOptions();

/**
 * Persistencia por `config.dbDriver` (REQ-PG-010, SC-CLD-011): carga dinámica, de modo que con postgres solo se cargan
 * postgres-* y `pg`, y con sqlite solo sqlite-* y better-sqlite3. `memory` sigue el camino de sqlite (sin cambios).
 * Un 55P03 (lock_timeout) no se traduce: se propaga y `registerProblemDetails` responde 500 ERR-INTERNAL-UNEXPECTED
 * (el catálogo v2.1.1 no tiene 503; un código nuevo es cambio de contrato Nivel 3). No se registra `config` ni la URL.
 */
async function composePersistence(config: AppConfig): Promise<{ uow: UnitOfWorkPort; close: () => Promise<void>; checkReady: () => Promise<void> }> {
  if (config.dbDriver === 'postgres') {
    if (config.databaseUrl === null) throw new Error('DATABASE_URL ausente con ARGOS_DB_DRIVER=postgres');
    const { createPostgresPool, closePool } = await import('../persistence/postgres/postgres-database.ts');
    const { PostgresUnitOfWork } = await import('../persistence/postgres/postgres-unit-of-work.ts');
    const { createPostgresRepositories } = await import('../persistence/postgres/postgres-repositories.ts');
    const pool = createPostgresPool({ connectionString: config.databaseUrl, pgPoolMax: config.pgPoolMax });
    // Hasta T464: solo SELECT 1 (REQ-PG-013: nunca consulta schema_migrations en /healthz ni al arrancar).
    return { uow: new PostgresUnitOfWork(pool, createPostgresRepositories), close: () => closePool(pool), checkReady: async () => void (await pool.query('SELECT 1')) };
  }
  const { openSqliteDatabase, assertSchemaReady } = await import('../persistence/sqlite/sqlite-database.ts');
  const { SqliteUnitOfWork } = await import('../persistence/sqlite/sqlite-unit-of-work.ts');
  const db = openSqliteDatabase(config.databasePath);
  return { uow: new SqliteUnitOfWork(db), close: async () => void db.close(), checkReady: async () => assertSchemaReady(db) };
}

/**
 * Almacenamiento de objetos por `config.mediaDriver` (REQ-GCS-003). Solo se compone el adaptador de memoria (desarrollo y pruebas).
 *
 * PENDIENTE (T576/T577, declarado): con `gcs` NO se conecta el adaptador de GCS. Empaquetar `@google-cloud/storage` en el bundle de producción hace
 * fallar la prueba REQ-SEC-005 de `tests/integration/build/build-server.spec.ts` por dos falsos positivos de código de terceros (`process.env.DEBUG =` del
 * paquete `debug` y un ejemplo de JSDoc con `-----BEGIN PRIVATE KEY-----`), y la imagen final no lleva `node_modules` (no hay `external` posible). Requiere la
 * decisión de Neo/Link/Trinity sobre esa prueba o sobre la imagen; hasta entonces con `gcs` la API arranca sin rutas de medios.
 */
async function composeMediaStorage(config: AppConfig, now: () => Date): Promise<MediaStoragePort | null> {
  if (config.mediaDriver !== 'memory') return null;
  const { MemoryMediaStorageAdapter } = await import('../adapters/memory-media-storage.adapter.ts');
  return new MemoryMediaStorageAdapter({ now });
}

/**
 * Compone la aplicación con los adaptadores de producción sobre la persistencia de `config.dbDriver`.
 * @implements INV-AUTH-003, INV-AUTH-006
 */
export interface ProductionAppOptions {
  /** Carpeta de estáticos; por defecto `<cwd>/dist` (WORKDIR /app en la imagen). */
  readonly staticRoot?: string;
  /** Sustituye la sonda de /readyz (solo pruebas); por defecto la de la persistencia activa. */
  readonly checkReady?: () => Promise<void>;
}

export async function createProductionApp(config: AppConfig, logger: boolean = true, options: ProductionAppOptions = {}): Promise<FastifyInstance> {
  const staticRoot = options.staticRoot ?? resolve(process.cwd(), 'dist');
  const serveStatic = options.staticRoot !== undefined || existsSync(resolve(staticRoot, 'index.html'));
  // En producción (host 0.0.0.0) sin dist/index.html falla cerrado; en desarrollo se omiten los estáticos.
  if (!serveStatic && config.host === '0.0.0.0') throw new Error('Falta dist/index.html: ejecute el build del frontend');
  const persistence = await composePersistence(config);
  const hasher = new ScryptPasswordHasherAdapter();
  const ids = new CryptoUuidAdapter();
  const tokens = new CryptoSecureTokenAdapter();
  const clock = new SystemClockAdapter(config.appTimezone);
  const mediaStorage = await composeMediaStorage(config, () => new Date(clock.nowIsoTimestamp()));
  const deps: ApplicationDeps = {
    uow: persistence.uow,
    clock,
    ids,
    tokens,
    hasher,
    dummyPasswordHash: await hasher.createDummyHash(),
    rateLimiter: new SlidingWindowRateLimiterAdapter(ids, rateLimitsFrom(config)),
    backupTokens: new Sha256BackupTokenAdapter(tokens),
    auditLog: new RepositoryAuditLogAdapter(),
    auditPseudonym: new HmacAuditPseudonymAdapter(),
    auditHmacSecret: config.auditHmacSecret ?? DEVELOPMENT_AUDIT_HMAC_SECRET,
    auditIds: ids,
    ...(mediaStorage === null
      ? {}
      : {
          media: {
            storage: mediaStorage,
            limits: {
              maxBytes: config.mediaMaxBytes,
              maxBytesPerOwner: config.mediaMaxBytesPerOwner,
              maxConcurrentUploads: config.mediaMaxConcurrentUploads,
              signedUrlTtlSeconds: config.mediaSignedUrlTtlSeconds,
            },
          },
        }),
  };
  const app = await buildApp({
    deps,
    cookieSecure: config.cookieSecure,
    logger: logger && PRODUCTION_LOGGER_OPTIONS,
    // Un solo salto de confianza detrás de Cloud Run (REQ-CLD-003); `true` permitiría falsificar X-Forwarded-For.
    trustProxy: config.host === '0.0.0.0' ? 1 : false,
    checkReady: options.checkReady ?? persistence.checkReady,
    ...(serveStatic ? { staticRoot } : {}),
    // CSP con el host del bucket de medios solo con el driver gcs (T564, E3-03, SC-ALM-012).
    ...(config.mediaDriver === 'gcs' && config.mediaBucket !== null ? { mediaHost: mediaBucketHost(config.mediaBucket) } : {}),
    // Ruta de desarrollo `/__dev/media/…` solo con el adaptador de memoria; la configuración ya impide ese driver con NODE_ENV=production (T566).
    ...(mediaStorage !== null ? { devMedia: { storage: mediaStorage } } : {}),
  });
  app.addHook('onClose', () => persistence.close());
  // Solo con postgres (REQ-SEC-007): sin identidad configurada no hay ruta (404). El token OIDC del Scheduler se verifica con jose (createOidcVerifier, T486): firma, issuer, audiencia y correo.
  if (config.dbDriver === 'postgres' && config.schedulerEmail !== null && config.oidcAudience !== null) {
    registerMaintenanceRoute(app, {
      verifyOidc: createOidcVerifier({ audience: config.oidcAudience }),
      runMaintenance: () => runMaintenance(deps, (queue) => logMediaQueue(app, queue)),
      schedulerEmail: config.schedulerEmail,
    });
  }
  maintenanceDeps.set(app, deps);
  return app;
}

/** Resultado de la cola de borrado de medios: solo conteos (E3-04); con filas de más de 48 h es una alerta para Neo (REQ-GCS-004). */
function logMediaQueue(app: FastifyInstance, queue: MediaQueueResult): void {
  if (queue.overdue > 0) app.log.warn({ mediaQueue: queue }, 'cola de borrado de medios con filas de más de 48 h');
  else app.log.info({ mediaQueue: queue }, 'cola de borrado de medios');
}

/** Dependencias de cada app de producción, para que `startServer` programe el mantenimiento sin tocar las pruebas. */
const maintenanceDeps = new WeakMap<FastifyInstance, ApplicationDeps>();
const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * ADR-002-14: una pasada al arrancar y otra cada 24 h. Solo se registran conteos (nunca ids ni hashes) y un fallo no
 * detiene el servidor.
 * @implements REQ-AUD-001, INV-AUD-001
 */
function scheduleMaintenance(app: FastifyInstance, deps: ApplicationDeps): void {
  const pass = () =>
    runMaintenance(deps, (queue) => logMediaQueue(app, queue)).then(
      (counts) => app.log.info({ maintenance: counts }, 'mantenimiento ADR-002-14'),
      () => app.log.warn('mantenimiento ADR-002-14 falló; se reintenta en la siguiente pasada'),
    );
  void pass();
  const timer = setInterval(() => void pass(), MAINTENANCE_INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}

/** @implements INV-ARCH-006 */
export async function startServer(config: AppConfig = loadAppConfig()): Promise<FastifyInstance> {
  const app = await createProductionApp(config);
  if (config.dbDriver === 'sqlite') scheduleMaintenance(app, maintenanceDeps.get(app)!);
  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().then(
    (app) => installShutdownHandlers({ target: process, closeServer: () => app.close(), exit: (code) => process.exit(code), log: app.log }),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
