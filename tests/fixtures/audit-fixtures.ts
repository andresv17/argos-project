import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SqliteDatabase } from '../../src/infrastructure/persistence/sqlite/sqlite-database.ts';

/**
 * Datos de prueba de la auditoría (Feature 002, T254/T256). El secreto y los vectores salen de
 * contracts/examples/canonical-fixtures.json (auditHmac): el oráculo no comparte código con la implementación.
 * SUPUESTO para la fase verde (T264/T265): el arnés de pruebas inyecta AUDIT_SECRET_HEX como ARGOS_AUDIT_HMAC_SECRET.
 */
const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'specs/002-plataforma-v21/contracts/examples/canonical-fixtures.json'), 'utf8'));

export const AUDIT_SECRET_HEX: string = raw.auditHmac.secretHexForTestsOnly;
export const AUDIT_HMAC_VECTORS: ReadonlyArray<{ readonly message: string; readonly hmac: string; readonly usedIn: string }> = raw.auditHmac.vectors;

/** HMAC-SHA256 hexadecimal minúscula con la clave decodificada del secreto de pruebas (>= 32 bytes). */
export const hmacHex = (message: string): string => createHmac('sha256', Buffer.from(AUDIT_SECRET_HEX, 'hex')).update(message, 'utf8').digest('hex');

export interface AuditRow {
  readonly id: string;
  readonly timestamp: string;
  readonly executor_user_id: string;
  readonly mutation_type: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly previous_state_hash: string | null;
  readonly new_state_hash: string | null;
}

const COLUMNS = 'id, timestamp, executor_user_id, mutation_type, entity_type, entity_id, previous_state_hash, new_state_hash';

/** Todas las filas de audit_log en orden de inserción (data-model §2.12). */
export const auditRows = (db: SqliteDatabase): AuditRow[] => db.prepare(`SELECT ${COLUMNS} FROM audit_log ORDER BY rowid`).all() as AuditRow[];

/** Texto completo de audit_log, para comprobar que no queda un identificador o secreto en claro. */
export const auditText = (db: SqliteDatabase): string => JSON.stringify(auditRows(db));

export function insertAuditRow(db: SqliteDatabase, row: AuditRow): void {
  db.prepare(`INSERT INTO audit_log (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    row.id, row.timestamp, row.executor_user_id, row.mutation_type, row.entity_type, row.entity_id, row.previous_state_hash, row.new_state_hash,
  );
}
