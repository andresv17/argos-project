/**
 * Verificador de tokens OIDC de Google para las rutas internas `POST /internal/maintenance` (REQ-SEC-007, SC-CLD-009, T486) y `POST /internal/scene-worker`
 * (feature 006, REQ-ESC6-033, INV-ESC6-018, N2-07 = A, T870). El ámbito de `jose` es EXACTAMENTE esas dos rutas, cada una con audiencia propia.
 *
 * Valida con `jose` (decisión N2 de Neo, jose@6.2.17 exacta): firma contra el JWKS de Google, `iss`, `exp`, `aud`
 * (igual a la audiencia configurada) y `email_verified === true`. No se reimplementa criptografía a mano.
 * FAIL-CLOSED: sin audiencia o sin fuente de claves, o ante cualquier fallo, rechaza (la ruta responde 401).
 *
 * No lee `process.env` (argos-no-process-env): la audiencia llega por parámetro desde AppConfig. El JWKS y el emisor
 * son inyectables; los valores por defecto son los endpoints públicos de Google (no son secretos).
 *
 * @implements REQ-SEC-007, REQ-ESC6-033, INV-ESC6-018
 */

import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';

export interface Identity {
  readonly email: string;
  readonly sub: string;
}

export type VerifyOidc = (token: string) => Promise<Identity>;

export interface OidcVerifierOptions {
  readonly audience: string;
  /** Emisores aceptados; por defecto los dos de Google. */
  readonly issuers?: readonly string[];
  /** JWKS inyectado (pruebas). Si falta, se usa `jwksUri`. */
  readonly jwks?: JSONWebKeySet;
  /** URL del JWKS remoto; por defecto los certificados OIDC públicos de Google. */
  readonly jwksUri?: string;
}

export const GOOGLE_OIDC_ISSUERS: readonly string[] = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_OIDC_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

function buildKeySource(options: OidcVerifierOptions): JWTVerifyGetKey | null {
  if (options.jwks !== undefined) return createLocalJWKSet(options.jwks);
  const uri = options.jwksUri ?? GOOGLE_OIDC_JWKS_URI;
  try {
    return createRemoteJWKSet(new URL(uri));
  } catch {
    return null;
  }
}

export function createOidcVerifier(options: OidcVerifierOptions): VerifyOidc {
  const audience = options.audience;
  const issuers = [...(options.issuers ?? GOOGLE_OIDC_ISSUERS)];
  const keySource = audience.trim() === '' || issuers.length === 0 ? null : buildKeySource(options);

  return async (token: string): Promise<Identity> => {
    if (keySource === null) throw new Error('verificador OIDC no configurado');
    const { payload } = await jwtVerify(token, keySource, { issuer: issuers, audience, algorithms: ['RS256'] });
    if (payload['email_verified'] !== true) throw new Error('email no verificado');
    const email = payload['email'];
    const sub = payload.sub;
    if (typeof email !== 'string' || email === '' || typeof sub !== 'string' || sub === '') {
      throw new Error('token sin identidad');
    }
    return { email, sub };
  };
}

/** Rutas internas cuyo token OIDC verifica `jose` (N2-07 = A): ninguna otra ruta admite verificador. */
export const OIDC_ROUTES: readonly OidcRoute[] = ['/internal/maintenance', '/internal/scene-worker'];
export type OidcRoute = '/internal/maintenance' | '/internal/scene-worker';

/**
 * Verificador de una ruta interna: la audiencia es la de ESA ruta (`ARGOS_OIDC_AUDIENCE` para el mantenimiento, `ARGOS_SCENE_WORKER_URL` para el worker), de modo
 * que el token del Planificador no sirve en la ruta de la cola ni al revés. El correo exacto lo compara la ruta (403). Una ruta fuera de `OIDC_ROUTES` lanza.
 * @implements REQ-ESC6-033, INV-ESC6-018
 */
export function createRouteOidcVerifier(route: string, options: OidcVerifierOptions): VerifyOidc {
  if (!(OIDC_ROUTES as readonly string[]).includes(route)) throw new Error('ruta sin verificador OIDC autorizado');
  return createOidcVerifier(options);
}
