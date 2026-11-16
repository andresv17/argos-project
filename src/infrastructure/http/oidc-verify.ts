/**
 * Verificador de tokens OIDC de Google para POST /internal/maintenance (REQ-SEC-007, SC-CLD-009).
 *
 * ESTADO: FAIL-CLOSED. `createOidcVerifier` devuelve una función que RECHAZA siempre, porque validar un JWT de Google
 * exige verificar la firma contra el JWKS de Google (más `iss`, `exp`, `aud === audience` y `email_verified`) y eso
 * requiere una librería. No se reimplementa criptografía a mano.
 *
 * TODO (bloqueo N2 abierto): requiere decisión N2: librería de verificación JWT/JWKS (jose o google-auth-library).
 * Hasta que Neo la autorice, la ruta de mantenimiento responde 401 a todo token, nunca ejecuta una purga sin verificación.
 *
 * No lee `process.env` (argos-no-process-env): la audiencia llega por parámetro desde AppConfig.
 *
 * @implements REQ-SEC-007
 */

export interface Identity {
  readonly email: string;
  readonly sub: string;
}

export type VerifyOidc = (token: string) => Promise<Identity>;

export interface OidcVerifierOptions {
  readonly audience: string;
}

export function createOidcVerifier(_options: OidcVerifierOptions): VerifyOidc {
  return async (_token: string): Promise<Identity> => {
    throw new Error('verificador OIDC no configurado: falta la librería JWT/JWKS (decisión N2 pendiente)');
  };
}
