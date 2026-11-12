/**
 * Seudonimización de identificadores de auditoría (REQ-AUD-001, T1): HMAC-SHA256 en hexadecimal minúscula. La clave
 * llega por parámetro (hexadecimal, >= 32 bytes, `ARGOS_AUDIT_HMAC_SECRET`); el puerto no la almacena ni la lee del
 * entorno (INV-ARCH-006). Sirve también para `PET_ASSIGNMENT`: `hmacUserId("<petId>:<householdId>", key)`.
 *
 * @implements REQ-AUD-001, INV-AUD-001, INV-ARCH-005, INV-ARCH-006
 */

export interface AuditPseudonymPort {
  /** HMAC-SHA256(clave, mensaje) en hexadecimal minúscula (64 caracteres). Lanza sin incluir la clave si esta es inválida. */
  hmacUserId(userId: string, key: string): string;
}
