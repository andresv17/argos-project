/**
 * Acceso con Google (Feature 008, REQ-SSO8-001, ADR-008-01): URL de autorización (OIDC authorization code con PKCE `S256`), canje del código en el
 * *token endpoint* y verificación del `id_token` con `jose` 6.2.17 (`D8-05` = A, Enmienda constitucional 3.8.0). Este archivo es el ÚNICO lugar de 008 que
 * importa `jose`; no se importa desde `domain/`, `application/` ni `presentation/`.
 *
 * Verifica firma (RS256, JWKS de Google), `iss` (los dos emisores de Google), `aud` (el client id de ARGOS), `exp`, `nonce` (el del estado del flujo) y exige
 * `email_verified === true` (booleano) más `sub` y correo no vacíos. La identidad se ancla en `sub`, nunca en el correo (EDGE-008-002). Solo se pide el
 * *scope* `openid email`.
 *
 * FAIL-CLOSED y UNIFORME (REQ-SSO8-005, NFR-008-004): cualquier fallo lanza `GoogleOidcError` con un mensaje fijo; el `reason` es un código cerrado que
 * nunca contiene datos del token, del código ni de la persona. El cuerpo de la respuesta de Google no se propaga. No lee `process.env`
 * (argos-no-process-env): la configuración llega por parámetro desde `AppConfig`. `fetch` y el reloj son inyectables.
 *
 * @implements REQ-SSO8-001, REQ-SSO8-005, EDGE-008-001, EDGE-008-002, ADR-008-01, INV-AUTH-006, NFR-008-004
 */

import { createLocalJWKSet, createRemoteJWKSet, errors, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';
import type { GoogleOidcPort } from '../../application/ports/google-oidc.port.ts';
import { codeChallengeS256, constantTimeEqual } from '../../domain/auth/one-time-token.ts';
import { GOOGLE_OIDC_ISSUERS, GOOGLE_OIDC_JWKS_URI } from './oidc-verify.ts';

export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_SCOPE = 'openid email';
const DEFAULT_TIMEOUT_MS = 5000;

export type GoogleOidcFailureReason = 'NOT_CONFIGURED' | 'EXCHANGE' | 'SIGNATURE' | 'ISSUER' | 'AUDIENCE' | 'EXPIRED' | 'NONCE' | 'EMAIL_UNVERIFIED' | 'CLAIMS';

/** Fallo uniforme del flujo con Google: mensaje fijo; `reason` es solo un código cerrado para métricas y pruebas. */
export class GoogleOidcError extends Error {
  public readonly reason: GoogleOidcFailureReason;

  public constructor(reason: GoogleOidcFailureReason) {
    super('El acceso con Google no pudo completarse.');
    this.name = 'GoogleOidcError';
    this.reason = reason;
  }

  public toJSON(): { readonly name: string; readonly reason: GoogleOidcFailureReason } {
    return { name: this.name, reason: this.reason };
  }
}

export interface GoogleIdentity {
  readonly sub: string;
  readonly email: string;
}

export interface GoogleOidcClientOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  /** URI de redirección autorizada, fija por entorno (REQ-SSO8-007); nunca derivada de `Host`. */
  readonly redirectUri: string;
  /** JWKS inyectado (pruebas). Si falta se usa `jwksUri`. */
  readonly jwks?: JSONWebKeySet;
  readonly jwksUri?: string;
  readonly issuers?: readonly string[];
  readonly tokenEndpoint?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Reloj para `exp` (pruebas). */
  readonly currentDate?: () => Date;
}

export interface GoogleOidcClient {
  complete(input: { readonly code: string; readonly codeVerifier: string; readonly nonce: string }): Promise<GoogleIdentity>;
}

export interface GoogleAuthorizationParams {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/** URL de autorización de Google: `code` + PKCE `S256` + `state` + `nonce` + scope `openid email`. El verificador PKCE y el secreto nunca salen en la URL. */
export function buildGoogleAuthorizationUrl(params: GoogleAuthorizationParams): string {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', GOOGLE_SCOPE);
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', codeChallengeS256(params.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** El `state` del callback coincide con el del estado del flujo (tiempo constante); ausente o vacío nunca coincide. */
export function statesMatch(expected: string, presented: string | undefined): boolean {
  return presented !== undefined && presented !== '' && constantTimeEqual(expected, presented);
}

function keySource(options: GoogleOidcClientOptions): JWTVerifyGetKey | null {
  if (options.jwks !== undefined) return createLocalJWKSet(options.jwks);
  try {
    return createRemoteJWKSet(new URL(options.jwksUri ?? GOOGLE_OIDC_JWKS_URI));
  } catch {
    return null;
  }
}

function reasonOfVerifyError(error: unknown): GoogleOidcFailureReason {
  if (error instanceof errors.JWTExpired) return 'EXPIRED';
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === 'iss') return 'ISSUER';
    if (error.claim === 'aud') return 'AUDIENCE';
    if (error.claim === 'exp') return 'EXPIRED';
    return 'CLAIMS';
  }
  return 'SIGNATURE';
}

export function createGoogleOidcClient(options: GoogleOidcClientOptions): GoogleOidcClient {
  const configured = [options.clientId, options.clientSecret, options.redirectUri].every((value) => value.trim() !== '');
  const issuers = [...(options.issuers ?? GOOGLE_OIDC_ISSUERS)];
  const keys = configured && issuers.length > 0 ? keySource(options) : null;
  const doFetch = options.fetch ?? globalThis.fetch;
  const tokenEndpoint = options.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function exchange(code: string, codeVerifier: string): Promise<string> {
    if (code === '' || codeVerifier === '') throw new GoogleOidcError('EXCHANGE');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
    });
    try {
      const response = await doFetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: body.toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new GoogleOidcError('EXCHANGE');
      const parsed: unknown = await response.json();
      const idToken = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>)['id_token'] : undefined;
      if (typeof idToken !== 'string' || idToken === '') throw new GoogleOidcError('EXCHANGE');
      return idToken;
    } catch (error) {
      throw error instanceof GoogleOidcError ? error : new GoogleOidcError('EXCHANGE');
    }
  }

  async function verifyIdToken(idToken: string, nonce: string): Promise<GoogleIdentity> {
    if (keys === null) throw new GoogleOidcError('NOT_CONFIGURED');
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, keys, {
        issuer: issuers,
        audience: options.clientId,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iss', 'aud', 'sub'],
        ...(options.currentDate === undefined ? {} : { currentDate: options.currentDate() }),
      }));
    } catch (error) {
      throw new GoogleOidcError(reasonOfVerifyError(error));
    }
    const tokenNonce = payload['nonce'];
    if (typeof tokenNonce !== 'string' || nonce === '' || !constantTimeEqual(tokenNonce, nonce)) throw new GoogleOidcError('NONCE');
    if (payload['email_verified'] !== true) throw new GoogleOidcError('EMAIL_UNVERIFIED');
    const sub = payload.sub;
    const email = payload['email'];
    if (typeof sub !== 'string' || sub === '' || typeof email !== 'string' || email === '') throw new GoogleOidcError('CLAIMS');
    return { sub, email };
  }

  return {
    async complete({ code, codeVerifier, nonce }) {
      if (!configured) throw new GoogleOidcError('NOT_CONFIGURED');
      return verifyIdToken(await exchange(code, codeVerifier), nonce);
    },
  };
}

/**
 * Adaptador del puerto de aplicación (`GoogleOidcPort`) sobre el cliente OIDC y la URL de autorización de este archivo: la capa de aplicación no importa `jose`
 * ni este módulo (T1121).
 */
export function createGoogleOidcPort(options: GoogleOidcClientOptions): GoogleOidcPort {
  const client = createGoogleOidcClient(options);
  return {
    authorizationUrl: (request) => buildGoogleAuthorizationUrl({ clientId: options.clientId, redirectUri: options.redirectUri, ...request }),
    complete: (input) => client.complete(input),
  };
}
