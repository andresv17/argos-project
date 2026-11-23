/**
 * Puerto del proveedor OIDC de Google (Feature 008, REQ-SSO8-001, ADR-008-01): la capa de aplicación no conoce `jose`, `fetch` ni la URL del proveedor.
 * La infraestructura (`google-oidc-verify.ts`) lo implementa; cualquier fallo del canje o de la verificación lanza un error que el caso de uso traduce al error
 * uniforme `ERR-AUTH-GOOGLE-FAILED` sin propagar su causa (NFR-008-004).
 *
 * @implements REQ-SSO8-001, REQ-SSO8-005, INV-ARCH-004
 */

export interface GoogleAuthorizationRequest {
  readonly state: string;
  readonly nonce: string;
  /** Verificador PKCE (RFC 7636): solo el desafío S256 sale en la URL. */
  readonly codeVerifier: string;
  /**
   * 009 (REQ-DEL9-001, INV-DEL9-001): si viene, la autorización exige una autenticación reciente: la URL lleva `max_age` y `prompt=login` y el `id_token` trae `auth_time`.
   * Solo la reautenticación de borrado de cuenta lo usa; el acceso y la vinculación de 008 no lo envían.
   */
  readonly maxAgeSeconds?: number | undefined;
}

export interface GoogleVerifiedIdentity {
  /** `sub` de Google: ancla de la identidad (EDGE-008-002). Dato personal: nunca a logs ni `detail`/`instance`. */
  readonly sub: string;
  readonly email: string;
  /** `auth_time` del `id_token` en segundos Unix (instante de la autenticación del titular); ausente si Google no lo envía (solo viaja cuando se pidió `max_age`). */
  readonly authTime?: number | undefined;
}

export interface GoogleOidcPort {
  /** URL de autorización de Google con `code` + PKCE `S256` + `state` + `nonce` y el scope `openid email`. */
  authorizationUrl(request: GoogleAuthorizationRequest): string;
  /** Canjea el código y verifica el `id_token` (firma, `iss`, `aud`, `exp`, `nonce`, `email_verified`). Lanza ante cualquier fallo. */
  complete(input: { readonly code: string; readonly codeVerifier: string; readonly nonce: string }): Promise<GoogleVerifiedIdentity>;
}
