/**
 * Generador de tokens inyectado: de sesión (cookie) y de confirmación de respaldo. Ambos son 32 bytes aleatorios en
 * base64url (43 caracteres).
 *
 * @implements INV-ARCH-002, INV-ARCH-004, REQ-AUTH2-002, REQ-ACC-002
 */
export interface SecureTokenPort {
  nextSessionToken(): string;
  nextConfirmationToken(): string;
}
