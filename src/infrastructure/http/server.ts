/**
 * Arranque de la API local: lee la configuración (INV-ARCH-006), abre SQLite con sus migraciones,
 * compone los adaptadores de producción y escucha solo en 127.0.0.1. Los registros de Fastify ocultan cookies.
 *
 * @implements INV-ARCH-004, INV-ARCH-006, INV-AUTH-003, INV-AUTH-006
 */

import { pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
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
import { openSqliteDatabase } from '../persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../persistence/sqlite/sqlite-unit-of-work.ts';
import { runMaintenance } from '../../application/use-cases/maintenance-use-cases.ts';
import { buildApp } from './app.ts';

/**
 * Opciones del logger de producción: `cookie` de la petición y `set-cookie` de la respuesta se ocultan (INV-AUTH-003).
 * Se exportan para que `tests/security/` las ejerza con una salida capturada (H-113-5).
 * @implements INV-AUTH-003
 */
export const PRODUCTION_LOGGER_OPTIONS = { level: 'info', redact: ['req.headers.cookie', 'res.headers["set-cookie"]'] } as const;

/**
 * Compone la aplicación con los adaptadores de producción sobre la base de `config.databasePath`.
 * @implements INV-AUTH-003, INV-AUTH-006
 */
export async function createProductionApp(config: AppConfig, logger: boolean = true): Promise<FastifyInstance> {
  const db = openSqliteDatabase(config.databasePath);
  const hasher = new ScryptPasswordHasherAdapter();
  const ids = new CryptoUuidAdapter();
  const tokens = new CryptoSecureTokenAdapter();
  const deps: ApplicationDeps = {
    uow: new SqliteUnitOfWork(db),
    clock: new SystemClockAdapter(config.appTimezone),
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
  };
  const app = await buildApp({
    deps,
    cookieSecure: config.cookieSecure,
    logger: logger && { ...PRODUCTION_LOGGER_OPTIONS, redact: [...PRODUCTION_LOGGER_OPTIONS.redact] },
  });
  app.addHook('onClose', async () => db.close());
  maintenanceDeps.set(app, deps);
  return app;
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
    runMaintenance(deps).then(
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
  scheduleMaintenance(app, maintenanceDeps.get(app)!);
  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
