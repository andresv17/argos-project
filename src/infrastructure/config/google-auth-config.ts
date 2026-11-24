/**
 * Cifras del límite de tasa de las rutas de Google (feature 008, REQ-SSO8-005, SC-008-061): ventana deslizante en memoria por instancia. Viven aquí y no en el
 * contrato (`x-sdd-rate-limit` de `startGoogleLogin`, `completeGoogleLogin`, `chooseGoogleUsername` y `startGoogleLink`). `start`, `callback` y `username` cuentan por IP
 * efectiva; `link` por usuario. Propuesta de /keymaker pendiente de confirmación de /architect o Neo (el contrato no fija las cifras).
 *
 * @implements REQ-SSO8-005, INV-ARCH-006
 */
export interface GoogleAuthLimit {
  readonly maxPerWindow: number;
  readonly windowMinutes: number;
}

export const GOOGLE_AUTH_LIMITS: Readonly<Record<'start' | 'callback' | 'username' | 'link' | 'deleteAccount', GoogleAuthLimit>> = {
  start: { maxPerWindow: 20, windowMinutes: 1 },
  callback: { maxPerWindow: 20, windowMinutes: 1 },
  username: { maxPerWindow: 10, windowMinutes: 1 },
  link: { maxPerWindow: 5, windowMinutes: 15 },
  /** 009 (TRI-02): `POST /api/account/deletion/google`, por usuario (ERR-RATE-LIMITED). */
  deleteAccount: { maxPerWindow: 5, windowMinutes: 15 },
};
