/**
 * Compuerta técnica de restauración de enlaces para el veterinario (T795; PN-09, EDGE-005-32, REQ-VET-013, SC-005-042).
 * Tras restaurar una copia (PITR o volcado), los enlaces revocados después de la copia vuelven a aparecer como activos.
 * Este paso es OBLIGATORIO e INCONDICIONAL antes de reabrir el tráfico: revoca todo enlace aún no revocado.
 * Uso: `RESTORED_URL=<url directa de la base restaurada> tsx scripts/restore-share-links.ts` (salida sin secretos: solo conteos).
 * Falla (código 1) si no puede ejecutar el UPDATE o si queda algún enlace con `revoked_at` nulo. Sin `RESTORED_URL` no hace nada y falla.
 *
 * @implements REQ-VET-013
 */

import { pathToFileURL } from 'node:url';
import pg from 'pg';

/** Instrucción única del paso (PostgreSQL; `$1` = instante UTC ISO con milisegundos y `Z`, como el reloj de la aplicación). */
export const REVOKE_ALL_SHARE_LINKS_SQL = 'UPDATE share_links SET revoked_at = $1 WHERE revoked_at IS NULL';
export const COUNT_ACTIVE_SHARE_LINKS_SQL = 'SELECT count(*)::int AS activos FROM share_links WHERE revoked_at IS NULL';

export interface RestoreQueryable {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: Array<Record<string, unknown>> }>;
}

export interface RestoreShareLinksResult {
  readonly revoked: number;
  readonly activeAfter: number;
}

export class RestoreShareLinksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreShareLinksError';
  }
}

/** Revoca todos los enlaces no revocados y verifica la poscondición (cero activos). Lanza si queda alguno. */
export async function revokeAllShareLinks(client: RestoreQueryable, nowIso: string): Promise<RestoreShareLinksResult> {
  const updated = await client.query(REVOKE_ALL_SHARE_LINKS_SQL, [nowIso]);
  const after = await client.query(COUNT_ACTIVE_SHARE_LINKS_SQL);
  const activeAfter = Number(after.rows[0]?.['activos'] ?? Number.NaN);
  if (activeAfter !== 0) throw new RestoreShareLinksError(`quedan ${String(activeAfter)} enlaces sin revocar tras la restauración`);
  return { revoked: updated.rowCount ?? 0, activeAfter };
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const url = env['RESTORED_URL'];
  if (url === undefined || url === '') {
    console.error('restore-share-links: falta RESTORED_URL (URL directa de la base restaurada)');
    return 1;
  }
  const client = new pg.Client({ connectionString: url, application_name: 'argos-restore-share-links' });
  try {
    await client.connect();
    const result = await revokeAllShareLinks(client as unknown as RestoreQueryable, new Date().toISOString());
    console.log(`restore-share-links: ${String(result.revoked)} enlaces revocados; activos restantes: ${String(result.activeAfter)}`);
    return 0;
  } catch (error) {
    console.error(`restore-share-links: FALLO (${error instanceof RestoreShareLinksError ? error.message : 'no se pudo ejecutar la revocación'})`);
    return 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
