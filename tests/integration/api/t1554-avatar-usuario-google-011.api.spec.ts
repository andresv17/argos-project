/**
 * T1554 [US8, Bloque I, #78] la foto de perfil se borra TAMBIÉN en la segunda vía de eliminación de cuenta (la cuenta nacida con Google, `POST /api/account/deletion/google`,
 * Trinity H-8; la vía con contraseña está en `t1554-avatar-usuario-011.api.spec.ts`). PRUEBA ROJA sobre la API real con Google SIMULADO y SQLite (D11-13 = C: la foto es
 * solo subida propia; el `picture` de Google nunca se lee ni se copia).
 *
 * @implements REQ-PRF11-001, INV-PRF11-001, SC-011-060
 */
import { afterEach, describe, expect, it } from 'vitest';
import { activateAccount, sqliteRunner } from '../../fixtures/active-accounts.ts';
import { canonicalState } from '../../fixtures/application-harness.ts';
import { GOOGLE_CODE, SequentialEntropy, fakeGoogleOidc, type FakeGoogleOidc } from '../../fixtures/google-fixtures.ts';
import { ControlledStorage, DEFAULT_LIMITS } from '../../fixtures/media-harness.ts';
import { jpegOf } from '../../fixtures/user-avatar-011.ts';
import { createApi, type Api, type ApiResponse } from './api-harness.ts';

let api: Api | null = null;
afterEach(async () => {
  await api?.close();
  api = null;
});

const setCookies = (r: ApiResponse): string[] => ([] as string[]).concat((r.headers['set-cookie'] as string | string[] | undefined) ?? []);
const cookieNamed = (r: ApiResponse, name: string): string | undefined => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string | undefined): string => cookie!.split(';')[0]!.split('=')[1]!;
const stateOfUrl = (url: string): string => new URL(url).searchParams.get('state')!;
const callback = (a: Api, oauth: string | null, query: string) => a.call('GET', `/api/auth/google/callback?${query}`, { csrf: false, cookie: oauth });

async function bornWithGoogle(a: Api, username = 'gina.google'): Promise<{ session: string; userId: string }> {
  const start = await a.call('GET', '/api/auth/google/start', { csrf: false });
  const step = await callback(a, `argos_oauth=${valueOf(cookieNamed(start, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl(start.headers['location'] as string)}`);
  const chosen = await a.call('POST', '/api/auth/google/username', { cookie: `argos_oauth=${valueOf(cookieNamed(step, 'argos_oauth'))}`, body: { username, adultDeclaration: true }, contract: false });
  expect(chosen.status).toBe(201);
  await activateAccount(sqliteRunner(a.db), 'sqlite', username, a.clock.nowIsoTimestamp());
  const userId = (a.db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username) as { id: string }).id;
  const again = await a.call('GET', '/api/auth/google/start', { csrf: false });
  const done = await callback(a, `argos_oauth=${valueOf(cookieNamed(again, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl(again.headers['location'] as string)}`);
  return { session: `argos_session=${valueOf(cookieNamed(done, 'argos_session'))}`, userId };
}

async function reauthenticate(a: Api, oidc: FakeGoogleOidc, session: string): Promise<void> {
  const started = await a.call('POST', '/api/account/deletion/reauth', { cookie: session, contract: false });
  expect(started.status).toBe(200);
  oidc.authTimeSeconds = Date.parse(a.clock.nowIsoTimestamp()) / 1000 - 3;
  await callback(a, `argos_oauth=${valueOf(cookieNamed(started, 'argos_oauth'))}`, `code=${GOOGLE_CODE}&state=${stateOfUrl((started.json as { authorizationUrl: string }).authorizationUrl)}`);
}

describe('T1554 eliminación de cuenta con Google borra la foto de perfil (INV-PRF11-001, SC-011-060)', () => {
  it('[INV-PRF11-001][SC-011-060] la cuenta nacida con Google sube su foto, la ve y, al eliminarse con reautenticación, no queda objeto en users/<uuid>/ ni fila en la cola', async () => {
    const storage = new ControlledStorage(() => new Date('2026-11-18T12:00:00.000Z'));
    const oidc = fakeGoogleOidc();
    const a = await createApi(canonicalState(), { google: { oidc, entropy: new SequentialEntropy() }, media: { storage, limits: DEFAULT_LIMITS } });
    api = a;
    const { session, userId } = await bornWithGoogle(a);
    const uploaded = await a.call('PUT', '/api/account/avatar', { cookie: session, raw: jpegOf(512, 512), headers: { 'content-type': 'image/jpeg' }, contract: false });
    expect([uploaded.status, uploaded.json]).toEqual([200, { avatarVersion: 1 }]);
    expect(await storage.keys(`users/${userId}/`)).toHaveLength(1);
    await reauthenticate(a, oidc, session);
    const deleted = await a.call('POST', '/api/account/deletion/google', { cookie: session, body: { confirmationPhrase: 'ELIMINAR MI CUENTA' }, contract: false });
    expect(deleted.status).toBe(204);
    expect(await storage.keys(`users/${userId}/`)).toEqual([]);
    const queued = (a.db.prepare('SELECT object_key AS k FROM media_deletion_queue').all() as Array<{ k: string }>).map((r) => r.k);
    expect(queued.filter((k) => k.startsWith(`users/${userId}/`))).toEqual([]);
    expect(a.dump().includes(userId)).toBe(false);
  });
});
