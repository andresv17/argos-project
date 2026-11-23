/**
 * Política pura de la reautenticación reciente para eliminar una cuenta sin contraseña (Feature 009, deuda #17, `D9-17` = A, ADR-009-04).
 * - `max_age` que se pide a Google: 900 s, el MISMO plazo de la prueba de titularidad (un solo número; con `prompt=login` Google vuelve a pedir las credenciales).
 * - La autenticación es reciente si el `id_token` trae `auth_time` y no es anterior a `max_age` ni futuro (más de 60 s de adelanto = reloj ajeno = no se acepta).
 * Sin `auth_time` no se acredita nada (fail-closed): el borrado jamás depende de que Google omita el claim.
 *
 * @implements REQ-DEL9-001, INV-DEL9-001, EDGE-009-031, ADR-009-04
 */

import { ONE_TIME_TOKEN_TTL_SECONDS } from './one-time-token.ts';

/** `max_age` de la reautenticación de borrado y vigencia de la prueba (900 s). */
export const ACCOUNT_DELETE_REAUTH_MAX_AGE_SECONDS = ONE_TIME_TOKEN_TTL_SECONDS;

const FUTURE_SKEW_SECONDS = 60;

/** @implements REQ-DEL9-001, INV-DEL9-001 */
export function isRecentAuthentication(authTimeSeconds: number | undefined, nowIsoTimestamp: string, maxAgeSeconds: number = ACCOUNT_DELETE_REAUTH_MAX_AGE_SECONDS): boolean {
  if (authTimeSeconds === undefined || !Number.isFinite(authTimeSeconds)) return false;
  const nowSeconds = Date.parse(nowIsoTimestamp) / 1000;
  if (!Number.isFinite(nowSeconds)) return false;
  const age = nowSeconds - authTimeSeconds;
  return age >= -FUTURE_SKEW_SECONDS && age <= maxAgeSeconds;
}
