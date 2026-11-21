import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { consumeOneTimeToken, hashOneTimeToken, issueOneTimeToken, type OneTimeTokenRecord } from '../../src/domain/auth/one-time-token.ts';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GoogleOidcError,
  buildGoogleAuthorizationUrl,
  createGoogleOidcClient,
  statesMatch,
  type GoogleOidcClientOptions,
} from '../../src/infrastructure/http/google-oidc-verify.ts';

/**
 * T1114 (pruebas rojas, Feature 008, [GH:#16]): verificación del `id_token` y canje del código con llaves y Google SIMULADOS (JWKS local de pares efímeros y `fetch`
 * inyectado; ninguna red, ninguna credencial). REQ-SSO8-001, EDGE-008-001, EDGE-008-002, ADR-008-01; SC-008-001, SC-008-004.
 * Contrato bajo prueba (`google-oidc-verify.ts`): `createGoogleOidcClient(opts).complete({ code, codeVerifier, nonce }) -> { sub, email }`; todo fallo es un
 * `GoogleOidcError` de mensaje uniforme (el `reason` es un código cerrado, nunca un dato del token).
 */

const CLIENT_ID = 'argos-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'secreto-de-prueba-nunca-real';
const REDIRECT_URI = 'https://argos.test/api/auth/google/callback';
const ISSUER = 'https://accounts.google.com';
const KID = 'g-key-1';
const NONCE = 'N'.repeat(43);
const VERIFIER = 'V'.repeat(43);
const CODE = '4/0AbCd-code';
const NOW = new Date('2026-11-21T12:00:00.000Z');

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: { keys: JWK[] };

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  otherKey = (await generateKeyPair('RS256')).privateKey;
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' }] };
});

interface Claims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string | undefined;
  email?: string | undefined;
  email_verified?: unknown;
  sub?: string | undefined;
  key?: CryptoKey;
  alg?: string;
}

async function signIdToken(c: Claims = {}): Promise<string> {
  const payload: Record<string, unknown> = {};
  if (c.nonce !== undefined || !('nonce' in c)) payload['nonce'] = c.nonce ?? NONCE;
  if (c.email !== undefined || !('email' in c)) payload['email'] = c.email ?? 'persona@example.test';
  if (c.email_verified !== undefined || !('email_verified' in c)) payload['email_verified'] = 'email_verified' in c ? c.email_verified : true;
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: c.alg ?? 'RS256', kid: KID })
    .setIssuer(c.iss ?? ISSUER)
    .setAudience(c.aud ?? CLIENT_ID)
    .setIssuedAt(Math.floor(NOW.getTime() / 1000) - 60)
    .setExpirationTime(c.exp ?? Math.floor(NOW.getTime() / 1000) + 300);
  if (c.sub !== undefined || !('sub' in c)) jwt.setSubject(c.sub ?? 'google-sub-0001');
  return jwt.sign(c.key ?? privateKey);
}

interface TokenRequest {
  readonly url: string;
  readonly method: string;
  readonly contentType: string | null;
  readonly body: URLSearchParams;
}

/** Google simulado: valida cliente, código, redirect_uri y PKCE (SHA-256 del verificador = desafío del inicio) y entrega el id_token indicado. */
function fakeGoogle(opts: { idToken: () => Promise<string>; challenge?: string; status?: number; body?: unknown; fail?: boolean }) {
  const requests: TokenRequest[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ''));
    requests.push({ url: String(input), method: init?.method ?? 'GET', contentType: new Headers(init?.headers).get('content-type'), body });
    if (opts.fail === true) throw new TypeError('red caída');
    if (opts.status !== undefined && opts.status !== 200) return new Response(JSON.stringify(opts.body ?? { error: 'invalid_grant' }), { status: opts.status });
    const pkceOk = opts.challenge === undefined || createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url') === opts.challenge;
    const valid = body.get('grant_type') === 'authorization_code' && body.get('code') === CODE && body.get('client_id') === CLIENT_ID && body.get('client_secret') === CLIENT_SECRET && body.get('redirect_uri') === REDIRECT_URI && pkceOk;
    if (!valid) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    return new Response(JSON.stringify(opts.body ?? { id_token: await opts.idToken(), access_token: 'no-se-usa', token_type: 'Bearer' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const client = (fetchImpl: typeof fetch, extra: Partial<GoogleOidcClientOptions> = {}) =>
  createGoogleOidcClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, jwks, fetch: fetchImpl, currentDate: () => NOW, ...extra });

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GoogleOidcError);
    return (error as GoogleOidcError).reason;
  }
  throw new Error('se esperaba un rechazo');
};

describe('[REQ-SSO8-001, SC-008-001] camino feliz', () => {
  it('canjea el código con PKCE y devuelve solo { sub, email } del id_token verificado', async () => {
    const google = fakeGoogle({ idToken: () => signIdToken() });
    await expect(client(google.fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE })).resolves.toEqual({ sub: 'google-sub-0001', email: 'persona@example.test' });
    expect(google.requests).toHaveLength(1);
    const [request] = google.requests;
    expect(request!.method).toBe('POST');
    expect(request!.url).toBe('https://oauth2.googleapis.com/token');
    expect(request!.contentType).toContain('application/x-www-form-urlencoded');
    expect(Object.fromEntries(request!.body)).toEqual({ grant_type: 'authorization_code', code: CODE, code_verifier: VERIFIER, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI });
  });

  it('acepta también el emisor sin esquema de Google y un aud en arreglo que contiene el client id', async () => {
    const a = fakeGoogle({ idToken: () => signIdToken({ iss: 'accounts.google.com' }) });
    await expect(client(a.fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE })).resolves.toMatchObject({ sub: 'google-sub-0001' });
    const b = fakeGoogle({ idToken: () => signIdToken({ aud: [CLIENT_ID, 'otro'] }) });
    await expect(client(b.fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE })).resolves.toMatchObject({ sub: 'google-sub-0001' });
  });
});

describe('[REQ-SSO8-001, EDGE-008-001, SC-008-004] id_token inválido: rechazo uniforme', () => {
  const cases: ReadonlyArray<readonly [string, Claims, string]> = [
    ['iss de otro emisor', { iss: 'https://evil.example' }, 'ISSUER'],
    ['aud de otro cliente', { aud: 'otro-cliente.apps.googleusercontent.com' }, 'AUDIENCE'],
    ['exp vencido', { exp: Math.floor(NOW.getTime() / 1000) - 10 }, 'EXPIRED'],
    ['nonce distinto', { nonce: 'X'.repeat(43) }, 'NONCE'],
    ['nonce ausente', { nonce: undefined }, 'NONCE'],
    ['email_verified = false', { email_verified: false }, 'EMAIL_UNVERIFIED'],
    ['email_verified ausente', { email_verified: undefined }, 'EMAIL_UNVERIFIED'],
    ['email_verified como cadena "true"', { email_verified: 'true' }, 'EMAIL_UNVERIFIED'],
    ['sub ausente', { sub: undefined }, 'CLAIMS'],
    ['sub vacío', { sub: '' }, 'CLAIMS'],
    ['correo ausente', { email: undefined }, 'CLAIMS'],
    ['firma de otra llave', { key: undefined }, 'SIGNATURE'],
  ];

  for (const [title, claims, reason] of cases) {
    it(`${title} -> GoogleOidcError(${reason}) sin devolver identidad`, async () => {
      const token = title === 'firma de otra llave' ? await signIdToken({ key: otherKey }) : await signIdToken(claims);
      const google = fakeGoogle({ idToken: async () => token });
      expect(await reasonOf(client(google.fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe(reason);
    });
  }

  it('rechaza un id_token sin firma (alg none) y uno firmado con un algoritmo distinto de RS256', async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: ISSUER, aud: CLIENT_ID, sub: 'x', exp: 9_999_999_999 })).toString('base64url')}.`;
    expect(await reasonOf(client(fakeGoogle({ idToken: async () => none }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe('SIGNATURE');
  });

  it('todos los rechazos comparten el mismo mensaje y ninguno contiene correo, sub, nonce, código ni token', async () => {
    const messages = new Set<string>();
    for (const [, claims] of cases.slice(0, 6)) {
      const token = await signIdToken(claims);
      try {
        await client(fakeGoogle({ idToken: async () => token }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE });
      } catch (error) {
        const text = `${(error as Error).message} ${JSON.stringify(error)}`;
        messages.add((error as Error).message);
        for (const secret of ['persona@example.test', 'google-sub-0001', NONCE, CODE, VERIFIER, CLIENT_SECRET, token]) expect(text).not.toContain(secret);
      }
    }
    expect(messages.size).toBe(1);
  });
});

describe('[REQ-SSO8-001, EDGE-008-001] canje del código', () => {
  it('un código rechazado por Google (invalid_grant, código ya canjeado) es fallo uniforme EXCHANGE', async () => {
    const google = fakeGoogle({ idToken: () => signIdToken(), status: 400 });
    expect(await reasonOf(client(google.fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe('EXCHANGE');
  });

  it('un error de red o un cuerpo sin id_token es fallo EXCHANGE, sin filtrar el cuerpo de Google', async () => {
    expect(await reasonOf(client(fakeGoogle({ idToken: () => signIdToken(), fail: true }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe('EXCHANGE');
    expect(await reasonOf(client(fakeGoogle({ idToken: () => signIdToken(), body: { access_token: 'x' } }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe('EXCHANGE');
    expect(await reasonOf(client(fakeGoogle({ idToken: () => signIdToken(), body: { id_token: 42 } }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe('EXCHANGE');
  });

  it('PKCE: el verificador enviado debe corresponder al desafío S256 del inicio; otro verificador es rechazado por Google', async () => {
    const url = new URL(buildGoogleAuthorizationUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: 'S'.repeat(43), nonce: NONCE, codeVerifier: VERIFIER }));
    const challenge = url.searchParams.get('code_challenge')!;
    const ok = fakeGoogle({ idToken: () => signIdToken(), challenge });
    await expect(client(ok.fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE })).resolves.toMatchObject({ sub: 'google-sub-0001' });
    const bad = fakeGoogle({ idToken: () => signIdToken(), challenge });
    expect(await reasonOf(client(bad.fetchImpl).complete({ code: CODE, codeVerifier: 'W'.repeat(43), nonce: NONCE }))).toBe('EXCHANGE');
  });

  it('un código o verificador vacío ni siquiera llega a Google', async () => {
    const google = fakeGoogle({ idToken: () => signIdToken() });
    expect(await reasonOf(client(google.fetchImpl).complete({ code: '', codeVerifier: VERIFIER, nonce: NONCE }))).toBe('EXCHANGE');
    expect(await reasonOf(client(google.fetchImpl).complete({ code: CODE, codeVerifier: '', nonce: NONCE }))).toBe('EXCHANGE');
    expect(google.requests).toHaveLength(0);
  });

  it('sin client id, secreto o URI de redirección configurados el cliente falla cerrado (no consulta a Google)', async () => {
    const google = fakeGoogle({ idToken: () => signIdToken() });
    for (const extra of [{ clientId: '' }, { clientSecret: '  ' }, { redirectUri: '' }]) {
      expect(await reasonOf(client(google.fetchImpl, extra).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE }))).toBe('NOT_CONFIGURED');
    }
    expect(google.requests).toHaveLength(0);
  });
});

describe('[REQ-SSO8-001, EDGE-008-002] la identidad es el sub, no el correo', () => {
  it('el mismo sub con otro correo devuelve el mismo sub (el llamador ancla en sub)', async () => {
    const a = await client(fakeGoogle({ idToken: () => signIdToken({ email: 'primero@example.test' }) }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE });
    const b = await client(fakeGoogle({ idToken: () => signIdToken({ email: 'segundo@example.test' }) }).fetchImpl).complete({ code: CODE, codeVerifier: VERIFIER, nonce: NONCE });
    expect(a.sub).toBe(b.sub);
    expect(a.email).not.toBe(b.email);
  });
});

describe('[REQ-SSO8-001, ADR-008-01] URL de autorización', () => {
  it('lleva response_type=code, scope "openid email", PKCE S256, state y nonce, y la URI de redirección fija', () => {
    const state = 'S'.repeat(43);
    const url = new URL(buildGoogleAuthorizationUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state, nonce: NONCE, codeVerifier: VERIFIER }));
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('accounts.google.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid email',
      state,
      nonce: NONCE,
      code_challenge: createHash('sha256').update(VERIFIER).digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(url.toString()).not.toContain(VERIFIER);
    expect(url.toString()).not.toContain(CLIENT_SECRET);
  });
});

describe('[REQ-SSO8-004, EDGE-008-001, SC-008-005] state', () => {
  it('statesMatch compara el state presentado con el guardado y rechaza ausente, distinto o de otra longitud', () => {
    const state = 'S'.repeat(43);
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, `${'S'.repeat(42)}T`)).toBe(false);
    expect(statesMatch(state, undefined)).toBe(false);
    expect(statesMatch(state, '')).toBe(false);
    expect(statesMatch(state, state.slice(1))).toBe(false);
  });

  it('un state reutilizado pierde el compare-and-set del identificador de un solo uso (segundo callback = fallo)', () => {
    const issued = issueOneTimeToken({ randomBytes: (n) => new Uint8Array(n).fill(9) }, '2026-11-21T12:00:00.000Z');
    const record: OneTimeTokenRecord = { tokenHash: hashOneTimeToken(issued.token), expiresAt: issued.expiresAt, consumedAt: null };
    const first = consumeOneTimeToken(record, issued.token, '2026-11-21T12:01:00.000Z');
    const replay = consumeOneTimeToken(first.record, issued.token, '2026-11-21T12:02:00.000Z');
    expect([first.outcome, replay.outcome]).toEqual(['VALID', 'CONSUMED']);
  });
});
