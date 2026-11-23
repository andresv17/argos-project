/**
 * Contador global mensual de generaciones de la escena sobre `platform_parameters` (feature 006, Fase 14, T948; D6-22, N2-02 = A; REQ-ESC6-017, REQ-ESC6-031): una fila
 * `scene.global_quota_used.YYYY-MM` con el entero en texto, creada a demanda con `INSERT ... ON CONFLICT DO NOTHING` y descontada con UNA sola sentencia
 * `UPDATE ... SET value = value + 1 WHERE key = ? AND CAST(value AS INTEGER) < max`: atómica en SQLite y en PostgreSQL (bloqueo de fila), sin lectura previa ni carrera. Sin
 * esquema nuevo: la tabla `platform_parameters` ya admite las filas (sin migración). Falla CERRADO: cualquier error o ventana inválida devuelve `false`, sin eco del mensaje.
 * La fila queda fuera del respaldo exportable (RAMA-005-008) por pertenecer a `platform_parameters`.
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031, REQ-LIM9-003, INV-LIM9-002, EDGE-009-042
 */

import type { SceneGlobalQuotaPort } from '../../application/ports/scene-global-quota.port.ts';
import { SCENE_GLOBAL_QUOTA_USED_PREFIX } from '../../domain/scene/provider-parameters.ts';
import type { PoolClientLike } from './postgres/postgres-database.ts';
import type { SqliteDatabase } from './sqlite/sqlite-database.ts';

export interface SqlSceneGlobalQuotaDeps {
  /** Tope vigente (se lee en cada llamada, para que el portal admin lo cambie sin reiniciar). Puede lanzar: entonces falla cerrado. */
  readonly readMax: () => Promise<number>;
  /** Instante ISO para `updated_at`. */
  readonly now: () => string;
}

const WINDOW_PATTERN = /^[0-9]{4}-(?:0[1-9]|1[0-2])$/;
const DESCRIPTION = 'Generaciones de escena consumidas en la ventana mensual (cuota global)';

export class SqlSceneGlobalQuota implements SceneGlobalQuotaPort {
  private constructor(
    private readonly deps: SqlSceneGlobalQuotaDeps,
    private readonly ensureRow: (key: string, now: string) => Promise<void>,
    private readonly incrementBelow: (key: string, now: string, max: number) => Promise<number>,
    private readonly decrement: (key: string, now: string) => Promise<void>,
  ) {}

  static forSqlite(db: SqliteDatabase, deps: SqlSceneGlobalQuotaDeps): SqlSceneGlobalQuota {
    const insert = db.prepare("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES (?, '0', ?, ?, NULL) ON CONFLICT (key) DO NOTHING");
    const update = db.prepare('UPDATE platform_parameters SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = ? AND CAST(value AS INTEGER) < ?');
    const refund = db.prepare('UPDATE platform_parameters SET value = CAST(CAST(value AS INTEGER) - 1 AS TEXT), updated_at = ? WHERE key = ? AND CAST(value AS INTEGER) > 0');
    return new SqlSceneGlobalQuota(
      deps,
      async (key, now) => void insert.run(key, DESCRIPTION, now),
      async (key, now, max) => update.run(now, key, max).changes,
      async (key, now) => void refund.run(now, key),
    );
  }

  static forPostgres(client: Pick<PoolClientLike, 'query'>, deps: SqlSceneGlobalQuotaDeps): SqlSceneGlobalQuota {
    return new SqlSceneGlobalQuota(
      deps,
      async (key, now) => {
        await client.query("INSERT INTO platform_parameters (key, value, description, updated_at, updated_by_user_id) VALUES ($1, '0', $2, $3, NULL) ON CONFLICT (key) DO NOTHING", [key, DESCRIPTION, now]);
      },
      async (key, now, max) => {
        const result = await client.query('UPDATE platform_parameters SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = $1 WHERE key = $2 AND CAST(value AS INTEGER) < $3', [now, key, max]);
        return result.rowCount ?? 0;
      },
      async (key, now) => {
        await client.query('UPDATE platform_parameters SET value = CAST(CAST(value AS INTEGER) - 1 AS TEXT), updated_at = $1 WHERE key = $2 AND CAST(value AS INTEGER) > 0', [now, key]);
      },
    );
  }

  async refund(window: string): Promise<void> {
    if (!WINDOW_PATTERN.test(window)) return;
    try {
      await this.decrement(`${SCENE_GLOBAL_QUOTA_USED_PREFIX}${window}`, this.deps.now());
    } catch {
      // falla cerrado: la unidad queda descontada (sobreconteo conservador, EDGE-009-042)
    }
  }

  async tryConsume(window: string): Promise<boolean> {
    if (!WINDOW_PATTERN.test(window)) return false;
    try {
      const max = await this.deps.readMax();
      if (!Number.isInteger(max) || max < 1) return false;
      const key = `${SCENE_GLOBAL_QUOTA_USED_PREFIX}${window}`;
      const now = this.deps.now();
      await this.ensureRow(key, now);
      return (await this.incrementBelow(key, now, max)) === 1;
    } catch {
      return false; // falla cerrado: ni el mensaje ni la causa salen
    }
  }
}
