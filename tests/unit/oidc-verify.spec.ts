import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOidcVerifier } from '../../src/infrastructure/http/oidc-verify.ts';

/**
 * T486 (pruebas primero): verificación OIDC real de POST /internal/maintenance (REQ-SEC-007, SC-CLD-009).
 * JWKS local generado en la prueba con pares de claves efímeros: ninguna clave ni token de producción.
 * Contrato: createOidcVerifier({ audience, issuer?, jwks? }) -> (token) => Promise<{ email, sub }>.
 *  - `jwks` es inyectable ({ keys: JWK[] }) para las pruebas; sin él se usa el JWKS remoto de Google.
 *  - Valida firma, iss, exp, aud y email_verified === true. Falla cerrado si falta audiencia o JWKS.
 */

const AUDIENCE = 'https://argos.test/internal/maintenance';
const ISSUER = 'https://accounts.google.com';
const KID = 'test-key-1';

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: { keys: JWK[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});

interface Overrides {
  readonly iss?: string;
  readonly aud?: string;
  readonly exp?: number | string;
  readonly emailVerified?: boolean | undefined;
  readonly key?: CryptoKey;
}

async function sign(o: Overrides = {}): Promise<string> {
  const claims: Record<string, unknown> = { email: 'scheduler@argos-test.iam.example' };
  if (!('emailVerified' in o) || o.emailVerified !== undefined) claims['email_verified'] = o.emailVerified ?? true;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(o.iss ?? ISSUER)
    .setAudience(o.aud ?? AUDIENCE)
    .setSubject('1234567890')
    .setIssuedAt()
    .setExpirationTime(o.exp ?? '5m')
    .sign(o.key ?? privateKey);
}

describe('createOidcVerifier (T486, REQ-SEC-007)', () => {
  it('(a) acepta un token válido y devuelve email y sub', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign())).resolves.toEqual({ email: 'scheduler@argos-test.iam.example', sub: '1234567890' });
  });

  it('(a2) acepta también el emisor sin esquema de Google', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ iss: 'accounts.google.com' }))).resolves.toMatchObject({ sub: '1234567890' });
  });

  it('(b) rechaza un token expirado', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ exp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow();
  });

  it('(c) rechaza una audiencia ajena', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ aud: 'https://otro.test' }))).rejects.toThrow();
  });

  it('(d) rechaza una firma inválida (clave ajena al JWKS)', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ key: otherPrivateKey }))).rejects.toThrow();
  });

  it('(e) rechaza email_verified falso', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ emailVerified: false }))).rejects.toThrow();
  });

  it('(e2) rechaza email_verified ausente', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ emailVerified: undefined }))).rejects.toThrow();
  });

  it('(f) rechaza una iss ajena', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify(await sign({ iss: 'https://evil.test' }))).rejects.toThrow();
  });

  it('(g) falla cerrado sin audiencia', async () => {
    const verify = createOidcVerifier({ audience: '', jwks });
    await expect(verify(await sign())).rejects.toThrow();
  });

  it('(g2) falla cerrado con JWKS vacío', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks: { keys: [] } });
    await expect(verify(await sign())).rejects.toThrow();
  });

  it('(g3) falla cerrado con un token que no es JWT', async () => {
    const verify = createOidcVerifier({ audience: AUDIENCE, jwks });
    await expect(verify('no-es-un-jwt')).rejects.toThrow();
  });
});
