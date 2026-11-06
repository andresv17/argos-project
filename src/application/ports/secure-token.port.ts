/**
 * Generador de tokens de sesión inyectado (constitución §3.2).
 *
 * @implements INV-ARCH-002, INV-ARCH-004, REQ-AUTH-002
 */
export interface SecureTokenPort {
  nextSessionToken(): string;
}
