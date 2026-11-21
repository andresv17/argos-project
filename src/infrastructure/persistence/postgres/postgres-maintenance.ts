/**
 * Mantenimiento de retención de PostgreSQL (ADR-002-14 en SQL de Postgres, REQ-PG-008): solo `DELETE` por lotes.
 * - Criterio de lote: `DELETE ... WHERE ctid IN (SELECT ctid ... WHERE <retención> LIMIT $n)`, repetido por tabla hasta que un
 *   lote devuelve menos filas que el tamaño. Cada sentencia queda acotada (cabe en `statement_timeout`) y los conteos son la
 *   suma de los lotes. Se ejecuta dentro de la transacción de `PostgresUnitOfWork.purgeExpired` (candado asesor global), así
 *   que ctid no cambia entre la subconsulta y el borrado.
 * - Los umbrales son los de SQLite: sesiones (revocadas > 7 d, > 7 d + 24 h de creación o > 7 d + 30 min inactivas), tokens de
 *   confirmación vencidos, membresías `LEFT`/`REMOVED` y invitaciones terminales > 90 d, y auditoría anterior a `auditBefore`
 *   (24 meses). Las columnas de fecha son TEXT: se convierten con `::timestamptz` explícito y los valores van como `$n`.
 * - `login_attempts` (REQ-LOG-001, SC-CAT-030): se borran las filas sin ningún fallo dentro de la ventana de bloqueo (TTL = INV-AUTH-005).
 *   No tiene conteo propio: los cinco conteos de retención son los del contrato operativo y el log no cambia.
 * - NO ejecuta el compactador de tablas (el rol `argos_app` no es propietario: lo hace `vacuum-argos.yml`, T473, REQ-PG-011/015),
 *   no escribe filas de auditoría (INV-AUD-001) y devuelve solo conteos. Sin lectura del entorno ni de la tabla de migraciones.
 *
 * @implements REQ-PG-008, REQ-PG-011, INV-AUD-001, REQ-AUD-001
 */

import type { MaintenanceCounts, MaintenanceCutoffs } from '../../../application/ports/unit-of-work.port.ts';
import { loginAttemptsExpiryCutoff } from '../../../domain/auth/auth-policies.ts';
import type { PoolClientLike } from './postgres-database.ts';

/** Filas por lote: acota cada sentencia y el tiempo que se retiene el candado entre lotes. */
export const PURGE_BATCH_SIZE = 500;

const AT_NOW = '$1::timestamptz';

interface PurgeStep {
  readonly key: keyof MaintenanceCounts;
  readonly table: string;
  readonly where: string;
  /** Valor de `$1`: el reloj, o el umbral de auditoría. */
  readonly cutoff: (cutoffs: MaintenanceCutoffs) => string;
}

const STEPS: readonly PurgeStep[] = [
  {
    key: 'sessionsPurged',
    table: 'sessions',
    where: `revoked_at::timestamptz < ${AT_NOW} - interval '7 days' OR created_at::timestamptz < ${AT_NOW} - interval '7 days 24 hours' OR last_activity_at::timestamptz < ${AT_NOW} - interval '7 days 30 minutes'`,
    cutoff: (c) => c.now,
  },
  { key: 'confirmationTokensPurged', table: 'backup_confirmation_tokens', where: `expires_at::timestamptz < ${AT_NOW}`, cutoff: (c) => c.now },
  {
    key: 'membershipsPurged',
    table: 'household_members',
    where: `status IN ('LEFT', 'REMOVED') AND (data->>'updatedAt')::timestamptz < ${AT_NOW} - interval '90 days'`,
    cutoff: (c) => c.now,
  },
  {
    key: 'invitationsPurged',
    table: 'household_invitations',
    where: `status IN ('ACCEPTED', 'DECLINED', 'CANCELLED') AND COALESCE(responded_at, created_at)::timestamptz < ${AT_NOW} - interval '90 days'`,
    cutoff: (c) => c.now,
  },
  { key: 'auditRowsPurged', table: 'audit_log', where: `timestamp::timestamptz < ${AT_NOW}`, cutoff: (c) => c.auditBefore },
];

/** Borra por lotes lo vencido y devuelve solo conteos. Debe llamarse dentro de una transacción ya abierta. */
export async function purgeExpiredInBatches(client: PoolClientLike, cutoffs: MaintenanceCutoffs, batchSize: number = PURGE_BATCH_SIZE): Promise<MaintenanceCounts> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('El tamaño de lote debe ser un entero positivo.');
  const counts: Record<keyof MaintenanceCounts, number> = { sessionsPurged: 0, confirmationTokensPurged: 0, membershipsPurged: 0, invitationsPurged: 0, auditRowsPurged: 0 };
  for (const step of STEPS) {
    const sql = `DELETE FROM ${step.table} WHERE ctid IN (SELECT ctid FROM ${step.table} WHERE ${step.where} LIMIT $2)`;
    for (;;) {
      const deleted = (await client.query(sql, [step.cutoff(cutoffs), batchSize])).rowCount ?? 0;
      counts[step.key] += deleted;
      if (deleted < batchSize) break;
    }
  }
  const expired = `DELETE FROM login_attempts WHERE ctid IN (SELECT ctid FROM login_attempts WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(failures::jsonb) AS f(failed_at) WHERE f.failed_at::timestamptz >= $1::timestamptz) LIMIT $2)`;
  for (;;) {
    const deleted = (await client.query(expired, [loginAttemptsExpiryCutoff(cutoffs.now), batchSize])).rowCount ?? 0;
    if (deleted < batchSize) break;
  }
  // H-RAMA-008-T1134-01 / NFR-008-004: estados de flujo de Google vencidos (correo y sub pendientes incluidos); sin conteo propio.
  const flows = `DELETE FROM oauth_flow_states WHERE ctid IN (SELECT ctid FROM oauth_flow_states WHERE expires_at::timestamptz <= ${AT_NOW} LIMIT $2)`;
  for (;;) {
    const deleted = (await client.query(flows, [cutoffs.now, batchSize])).rowCount ?? 0;
    if (deleted < batchSize) break;
  }
  return counts;
}
