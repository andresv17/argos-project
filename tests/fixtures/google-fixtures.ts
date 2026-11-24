import type { GoogleOidcPort } from '../../src/application/ports/google-oidc.port.ts';
import type { OneTimeTokenEntropyPort } from '../../src/domain/auth/one-time-token.ts';
import { buildGoogleAuthorizationUrl, GoogleOidcError } from '../../src/infrastructure/http/google-oidc-verify.ts';

/** Dobles de la Feature 008 (acceso con Google): ninguna red, ninguna credencial real (JWKS y token endpoint simulados en t1114). */
export const GOOGLE_CLIENT_ID = 'argos-client-id.apps.googleusercontent.com';
export const GOOGLE_REDIRECT = 'https://argos.test/api/auth/google/callback';
/** URI de redirección del flujo de administración (009-A (c)): fija por entorno, distinta de la de usuarios. */
export const GOOGLE_ADMIN_REDIRECT = 'https://argos.test/api/admin/auth/google/callback';
export const GOOGLE_SUB = 'google-sub-0001';
export const GOOGLE_EMAIL = 'persona@example.test';
export const GOOGLE_CODE = '4/0AbCd-code';

/** Entropía determinista: cada llamada devuelve bytes distintos (contador en los dos primeros). */
export class SequentialEntropy implements OneTimeTokenEntropyPort {
  private n = 0;
  nextEntropyBytes(length: number): Uint8Array {
    this.n += 1;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = (this.n * 31 + i * 7) & 0xff;
    bytes[0] = this.n & 0xff;
    bytes[1] = (this.n >> 8) & 0xff;
    return bytes;
  }
}

export interface FakeGoogleOidc extends GoogleOidcPort {
  readonly completions: Array<{ code: string; codeVerifier: string; nonce: string }>;
  /** Peticiones de autorización recibidas (T1218, 009: `maxAgeSeconds` de la reautenticación). */
  readonly authorizations: Array<{ state: string; nonce: string; codeVerifier: string; maxAgeSeconds?: number | undefined }>;
  identity: { sub: string; email: string } | GoogleOidcError;
  /** Instante (segundos Unix) de la autenticación que Google declara en `auth_time`; `undefined` = el `id_token` no lo trae (T1218, 009). */
  authTimeSeconds: number | undefined;
}

export function fakeGoogleOidc(redirectUri: string = GOOGLE_REDIRECT): FakeGoogleOidc {
  const fake: FakeGoogleOidc = {
    completions: [],
    authorizations: [],
    identity: { sub: GOOGLE_SUB, email: GOOGLE_EMAIL },
    authTimeSeconds: undefined,
    authorizationUrl: (p) => {
      fake.authorizations.push(p);
      return buildGoogleAuthorizationUrl({ clientId: GOOGLE_CLIENT_ID, redirectUri, ...p });
    },
    async complete(p) {
      fake.completions.push(p);
      if (fake.identity instanceof GoogleOidcError) throw fake.identity;
      return fake.authTimeSeconds === undefined ? fake.identity : { ...fake.identity, authTime: fake.authTimeSeconds };
    },
  };
  return fake;
}
