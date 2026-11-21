/**
 * Límite de tasa del autocompletado de colaboradores por usuario y por IP efectiva (REQ-INV8-003, EDGE-008-044). Lanza `ERR-RATE-LIMITED` si alguno de los dos
 * agotó su cupo; la implementación vive en `src/infrastructure/http/` y sus cifras en `src/infrastructure/config/`.
 *
 * @implements REQ-INV8-003, ERR-RATE-LIMITED
 */
export interface InviteeSearchLimiterPort {
  consume(userId: string, normalizedClientIp: string): void;
}
