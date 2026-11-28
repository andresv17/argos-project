/**
 * Reglas puras del enlace veterinario (feature 005, `STATE-SHARE-001`): alcance, caducidad {1,7,30} días, estado derivado
 * (REVOKED > EXPIRED > ACTIVE) con el reloj inyectado, revocación idempotente (`EXPIRED -> REVOKED` es un no-op), tope de 20 enlaces activos por alcance
 * y TTL de la URL firmada de la superficie pública (<= 300 s, <= tiempo restante, mínimo 1 s).
 *
 * @implements REQ-VET-002, REQ-VET-004, REQ-VET-005, REQ-VET-012, STATE-SHARE-001, EDGE-005-23, SC-005-018, SC-005-019
 */
import { MS_PER_DAY, addMillis, toEpochMillis } from '../auth/utc-timestamp.ts';

export type ShareScope = 'PET' | 'HOUSEHOLD' | 'PETS';

/** Comprobación de exhaustividad (ENM-005-E §8.2.1): añadir un alcance sin rama hace fallar la compilación; en ejecución niega (null/404 uniforme). */
export function assertNever(value: never): null {
  void value;
  return null;
}
export type ShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/** Única caducidad admitida (D5-11); 7 días por defecto. */
export const EXPIRY_DAYS = [1, 7, 30] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];
export const DEFAULT_EXPIRY_DAYS: ExpiryDays = 7;
export const isExpiryDays = (value: unknown): value is ExpiryDays => typeof value === 'number' && (EXPIRY_DAYS as readonly number[]).includes(value);

/** Tope de enlaces activos por mascota (alcance PET) o por hogar (alcance HOUSEHOLD), de cualquier creador (D5-18). */
export const MAX_ACTIVE_SHARE_LINKS = 20;
/** Tope de mascotas de un enlace `PETS` (ENM-005-E §1, REQ-VET12-001): 1..20 de un solo hogar. */
export const MAX_SHARE_LINK_PETS = 20;
/** Tope duro de la URL firmada de la superficie pública, aunque `ARGOS_MEDIA_SIGNED_URL_TTL_SECONDS` sea mayor (RAMA-005-006). */
export const PUBLIC_SIGNED_URL_MAX_SECONDS = 300;
/** Retención de enlaces vencidos o revocados (D5-20) y de la auditoría (90 días; 30 si lleva `ip_hmac`, PN-06). */
export const LINK_RETENTION_DAYS = 30;
export const AUDIT_RETENTION_DAYS = 90;
export const AUDIT_WITH_IP_RETENTION_DAYS = 30;

/** Fila persistida de `share_links` (solo `token_hash`: nunca el token, INV-005-005). */
export interface ShareLinkRecord {
  readonly id: string;
  readonly tokenHash: string;
  readonly scope: ShareScope;
  readonly petId: string | null;
  readonly householdId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly expiresInDays: number;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  /** Opt-in del creador para publicar `deceasedAt` (007, T1026, SC-007-016); inmutable tras crear; las filas anteriores a la 007 valen `false`. */
  readonly includeDeceasedAt: boolean;
  readonly idempotencyKey: string;
  /** `pets.owner_user_id` vigente al crear un enlace PET (PN-08); nulo en HOUSEHOLD. No sale por la API. */
  readonly petOwnerUserIdAtCreation: string | null;
}

/** `expiresAt = createdAt + n días` exactos (UTC). */
export function computeExpiresAt(createdAt: string, days: ExpiryDays): string {
  return addMillis(createdAt, days * MS_PER_DAY);
}

/** REVOKED si `revokedAt` no es nulo; EXPIRED si `now >= expiresAt` (el instante exacto ya es VENCIDO); ACTIVE en otro caso. */
export function deriveStatus(link: Pick<ShareLinkRecord, 'revokedAt' | 'expiresAt'>, now: string): ShareStatus {
  if (link.revokedAt !== null) return 'REVOKED';
  return toEpochMillis(now) >= toEpochMillis(link.expiresAt) ? 'EXPIRED' : 'ACTIVE';
}

/** Revocar un enlace VENCIDO o ya REVOCADO no escribe ni audita (MIF-005-08). */
export const isRevocationNoop = (status: ShareStatus): boolean => status !== 'ACTIVE';

/**
 * `X-Goog-Expires` de la URL firmada pública: `min(300, floor(tiempo restante))` en segundos, mínimo 1; con menos de 1 s restante no se emite URL (null,
 * EDGE-005-23).
 */
export function signedUrlTtlSeconds(now: string, expiresAt: string): number | null {
  const remainingSeconds = Math.floor((toEpochMillis(expiresAt) - toEpochMillis(now)) / 1000);
  return remainingSeconds < 1 ? null : Math.min(PUBLIC_SIGNED_URL_MAX_SECONDS, remainingSeconds);
}

/** Umbrales de purga diaria (REQ-VET-013): enlaces a 30 días; auditoría sin IP a 90 días y con `ip_hmac` a 30. */
export function retentionCutoffs(now: string): { readonly links: string; readonly auditWithoutIp: string; readonly auditWithIp: string } {
  return {
    links: addMillis(now, -LINK_RETENTION_DAYS * MS_PER_DAY),
    auditWithoutIp: addMillis(now, -AUDIT_RETENTION_DAYS * MS_PER_DAY),
    auditWithIp: addMillis(now, -AUDIT_WITH_IP_RETENTION_DAYS * MS_PER_DAY),
  };
}

/** Ventana de 10 minutos que agrupa los fallos de una IP en `share_link_audit` (REQ-VET-008). */
export const ACCESS_FAILURE_WINDOW_MS = 600_000;
export function failureWindowStart(now: string): string {
  const ms = toEpochMillis(now);
  return addMillis(now, -(ms % ACCESS_FAILURE_WINDOW_MS));
}
