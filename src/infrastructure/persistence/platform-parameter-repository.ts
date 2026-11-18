/**
 * `SqlPlatformParameterRepository`: lectura de `platform_parameters` en SQLite y en PostgreSQL (REQ-PRM-001, REQ-PRM-003).
 * Devuelve el texto de la fila sin interpretarlo: el tipo y el rango son del catálogo del dominio (MIF-005-07).
 * @implements REQ-PRM-001, REQ-PRM-003
 */
import type { PlatformParameterRepositoryPort } from '../../application/ports/platform-parameter.port.ts';
import type { PoolClientLike } from './postgres/postgres-database.ts';
import type { SqliteDatabase } from './sqlite/sqlite-database.ts';

export class SqlPlatformParameterRepository implements PlatformParameterRepositoryPort {
  private constructor(private readonly read: (key: string) => Promise<string | null>) {}

  static forSqlite(db: SqliteDatabase): SqlPlatformParameterRepository {
    const statement = db.prepare('SELECT value FROM platform_parameters WHERE key = ?').pluck();
    return new SqlPlatformParameterRepository(async (key) => {
      const value = statement.get(key);
      return typeof value === 'string' ? value : null;
    });
  }

  static forPostgres(client: Pick<PoolClientLike, 'query'>): SqlPlatformParameterRepository {
    return new SqlPlatformParameterRepository(async (key) => {
      const { rows } = await client.query('SELECT value FROM platform_parameters WHERE key = $1', [key]);
      const value = rows[0]?.['value'];
      return typeof value === 'string' ? value : null;
    });
  }

  findValue(key: string): Promise<string | null> {
    return this.read(key);
  }
}
