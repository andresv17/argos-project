/**
 * Arranque de la API local (plan §0 y §4): lee la configuración (INV-ARCH-006), abre SQLite con sus migraciones,
 * compone los adaptadores de producción y escucha solo en 127.0.0.1. Los registros de Fastify ocultan cookies.
 *
 * @implements INV-ARCH-004, INV-ARCH-006, INV-AUTH-003, INV-AUTH-006
 */

import { pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { ApplicationDeps } from '../../application/use-cases/use-case-support.ts';
import { CryptoSecureTokenAdapter } from '../adapters/crypto-secure-token.adapter.ts';
import { CryptoUuidAdapter } from '../adapters/crypto-uuid.adapter.ts';
import { ScryptPasswordHasherAdapter } from '../adapters/scrypt-password-hasher.adapter.ts';
import { SystemClockAdapter } from '../adapters/system-clock.adapter.ts';
import { loadAppConfig, type AppConfig } from '../config/app-config.ts';
import { openSqliteDatabase } from '../persistence/sqlite/sqlite-database.ts';
import { SqliteUnitOfWork } from '../persistence/sqlite/sqlite-unit-of-work.ts';
import { buildApp } from './app.ts';

/**
 * Compone la aplicación con los adaptadores de producción sobre la base de `config.databasePath`.
 * @implements INV-AUTH-003, INV-AUTH-006
 */
export async function createProductionApp(config: AppConfig, logger: boolean = true): Promise<FastifyInstance> {
  const db = openSqliteDatabase(config.databasePath);
  const hasher = new ScryptPasswordHasherAdapter();
  const deps: ApplicationDeps = {
    uow: new SqliteUnitOfWork(db),
    clock: new SystemClockAdapter(config.appTimezone),
    ids: new CryptoUuidAdapter(),
    tokens: new CryptoSecureTokenAdapter(),
    hasher,
    dummyPasswordHash: await hasher.createDummyHash(),
  };
  const app = await buildApp({
    deps,
    cookieSecure: config.cookieSecure,
    logger: logger && { level: 'info', redact: ['req.headers.cookie', 'res.headers["set-cookie"]'] },
  });
  app.addHook('onClose', async () => db.close());
  return app;
}

/** @implements INV-ARCH-006 */
export async function startServer(config: AppConfig = loadAppConfig()): Promise<FastifyInstance> {
  const app = await createProductionApp(config);
  await app.listen({ host: config.host, port: config.port });
  return app;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
