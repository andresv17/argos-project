/**
 * Contraseña centinela de las cuentas nacidas con Google (Feature 008, ADR-008-14; decisión de Neo, Nivel 2, 2026-11-21; REQ-SSO8-003, SC-008-062).
 * `users.password_hash` conserva `NOT NULL`: la cuenta sin contraseña guarda el valor fijo `!no-password!`, que NO tiene el formato de un hash scrypt
 * (`scrypt$N$r$p$salt$clave`), de modo que ningún verificador lo acepta y no hace falta migración. Funciones puras: sin reloj, sin entropía, sin `crypto`.
 *  - El hasher ejecuta una verificación dummy del mismo coste ante cualquier hash que no parsea y devuelve siempre `false` (anti-enumeración).
 *  - `hasPassword` / `authMethodsOf` dicen si la cuenta tiene contraseña; `startGoogleLink` rechaza las que no la tienen.
 *
 * @implements REQ-SSO8-003, REQ-VIN8-002, INV-AUTH-006, INV-ARCH-001
 */

/** Valor guardado en `users.password_hash` por las cuentas sin contraseña. Formato imposible para scrypt. */
export const NO_PASSWORD_SENTINEL = '!no-password!';

/** `true` si el hash almacenado es una contraseña real; `false` para el centinela. */
export const hasPassword = (passwordHash: string): boolean => passwordHash !== NO_PASSWORD_SENTINEL;

/** Métodos de acceso de la cuenta propia (contrato `AuthMethods`): solo dos booleanos, nunca el `sub`, el correo de Google ni el hash. */
export interface AuthMethods {
  readonly password: boolean;
  readonly google: boolean;
}

export const authMethodsOf = (passwordHash: string, googleIdentityCount: number): AuthMethods => ({ password: hasPassword(passwordHash), google: googleIdentityCount > 0 });
