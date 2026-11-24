import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_DELETE_REAUTH_MAX_AGE_SECONDS, isRecentAuthentication } from '../../src/domain/auth/reauthentication-policy.ts';
import { buildGoogleAuthorizationUrl, createGoogleOidcClient } from '../../src/infrastructure/http/google-oidc-verify.ts';

/**
 * T1130 (009, deuda #17, `D9-17` = A): piezas puras y del adaptador de la reautenticación reciente con Google, con llaves y Google SIMULADOS. REQ-DEL9-001, INV-DEL9-001, EDGE-009-031.
 * La política decide «reciente» con `auth_time`; el adaptador pide `max_age` + `prompt=login` solo cuando se le pide y devuelve `auth_time` solo si es un número finito.
 */
const NOW_ISO = '2026-11-23T12:00:00.000Z';
const NOW_SECONDS = Date.parse(NOW_ISO) / 1000;

describe('[REQ-DEL9-001][INV-DEL9-001] política de autenticación reciente', () => {
  it('el plazo es de 900 s (el de la prueba) y acepta auth_time desde 900 s atrás hasta ahora', () => {
    expect(ACCOUNT_DELETE_REAUTH_MAX_AGE_SECONDS).toBe(900);
    expect(isRecentAuthentication(NOW_SECONDS, NOW_ISO)).toBe(true);
    expect(isRecentAuthentication(NOW_SECONDS - 900, NOW_ISO)).toBe(true);
    expect(isRecentAuthentication(NOW_SECONDS - 901, NOW_ISO)).toBe(false);
  });

  it('sin auth_time o con un valor no finito NO acredita nada (fail-closed)', () => {
    expect(isRecentAuthentication(undefined, NOW_ISO)).toBe(false);
    expect(isRecentAuthentication(Number.NaN, NOW_ISO)).toBe(false);
    expect(isRecentAuthentication(Number.POSITIVE_INFINITY, NOW_ISO)).toBe(false);
    expect(isRecentAuthentication(NOW_SECONDS, 'no es una fecha')).toBe(false);
  });

  it('un auth_time del futuro lejano (más de 60 s) no se acepta; un adelanto de reloj menor sí', () => {
    expect(isRecentAuthentication(NOW_SECONDS + 30, NOW_ISO)).toBe(true);
    expect(isRecentAuthentication(NOW_SECONDS + 61, NOW_ISO)).toBe(false);
  });

  it('respeta un max_age distinto cuando se pasa explícito', () => {
    expect(isRecentAuthentication(NOW_SECONDS - 100, NOW_ISO, 60)).toBe(false);
    expect(isRecentAuthentication(NOW_SECONDS - 50, NOW_ISO, 60)).toBe(true);
  });
});

describe('[REQ-DEL9-001] URL de autorización', () => {
  const base = { clientId: 'cid', redirectUri: 'https://argos.test/api/auth/google/callback', state: 's', nonce: 'n', codeVerifier: 'v'.repeat(43) };

  it('con maxAgeSeconds añade max_age y prompt=login; sin él (acceso y vinculación de 008) la URL no los lleva', () => {
    const recent = new URL(buildGoogleAuthorizationUrl({ ...base, maxAgeSeconds: 900 }));
    expect([recent.searchParams.get('max_age'), recent.searchParams.get('prompt')]).toEqual(['900', 'login']);
    const plain = new URL(buildGoogleAuthorizationUrl(base));
    expect([plain.searchParams.has('max_age'), plain.searchParams.has('prompt')]).toEqual([false, false]);
  });
});

describe('[REQ-DEL9-001] id_token: auth_time', () => {
  const CLIENT_ID = 'argos-client-id.apps.googleusercontent.com';
  const NONCE = 'N'.repeat(43);
  const NOW = new Date(NOW_ISO);
  let privateKey: CryptoKey;
  let jwks: { keys: JWK[] };

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' }] };
  });

  async function completeWith(extra: Record<string, unknown>) {
    const idToken = await new SignJWT({ nonce: NONCE, email: 'persona@example.test', email_verified: true, ...extra })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject('google-sub-0001')
      .setIssuedAt(NOW_SECONDS - 10)
      .setExpirationTime(NOW_SECONDS + 300)
      .sign(privateKey);
    const fetchImpl = (async () => new Response(JSON.stringify({ id_token: idToken }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const client = createGoogleOidcClient({ clientId: CLIENT_ID, clientSecret: 'secreto-de-prueba', redirectUri: 'https://argos.test/api/auth/google/callback', jwks, fetch: fetchImpl, currentDate: () => NOW });
    return client.complete({ code: 'c', codeVerifier: 'v'.repeat(43), nonce: NONCE });
  }

  it('devuelve auth_time cuando el id_token trae un número finito', async () => {
    await expect(completeWith({ auth_time: NOW_SECONDS - 5 })).resolves.toEqual({ sub: 'google-sub-0001', email: 'persona@example.test', authTime: NOW_SECONDS - 5 });
  });

  it('sin auth_time (o con uno que no es número) el resultado no lo lleva: la política lo rechazará', async () => {
    await expect(completeWith({})).resolves.toEqual({ sub: 'google-sub-0001', email: 'persona@example.test' });
    await expect(completeWith({ auth_time: '1700000000' })).resolves.toEqual({ sub: 'google-sub-0001', email: 'persona@example.test' });
  });
});
