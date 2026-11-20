/**
 * T875 (006) conformidad de las formas y de los textos de la escena de la SPA con el contrato 006 (v34): la SPA declara las formas localmente (regla de capas de la
 * presentación) y aquí se comprueba, en compilación, que son asignables en ambos sentidos a los tipos generados; también que cada código de la lista cerrada
 * `SceneErrorCode` tiene su texto y que la constante del cliente del aviso coincide con la del servidor. REQ-ESC6-019, REQ-ESC6-026; INV-ESC6-016.
 */
import { describe, expect, it } from 'vitest';
import type { GrantSceneConsentInput, HouseholdPhotoView, SceneNotice, SceneView } from '../../../src/generated/v34/schemas/types.ts';
import { SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID } from '../../../src/domain/scene/notice.ts';
import type { GrantSceneConsentBody, HouseholdPhotoData, SceneErrorCode, SceneNoticeData, SceneViewData } from '../../../src/presentation/web/scene-api.ts';
import { sceneFailureText } from '../../../src/presentation/web/scene-view.ts';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same: [Same<SceneViewData, SceneView>, Same<SceneNoticeData, SceneNotice>, Same<GrantSceneConsentBody, GrantSceneConsentInput>, Same<HouseholdPhotoData, HouseholdPhotoView>] = [true, true, true, true];
const codes: SceneErrorCode[] = ['ERR-SCENE-GENERATION-FAILED', 'ERR-SCENE-GENERATION-TIMEOUT', 'ERR-SCENE-INVALID-IMAGE', 'ERR-SCENE-LEASE-EXPIRED'];

describe('T875 formas y textos de la escena frente al contrato 006', () => {
  it('[REQ-ESC6-019] SceneView, SceneNotice, GrantSceneConsentInput y HouseholdPhotoView son asignables en ambos sentidos a los tipos generados', () => {
    expect(same).toEqual([true, true, true, true]);
  });

  it('[INV-ESC6-016] cada código de SceneErrorCode tiene un texto propio y ninguno repite datos del proveedor', () => {
    const texts = codes.map((c) => sceneFailureText(c));
    expect(new Set(texts).size).toBe(4);
    for (const t of texts) expect(t).not.toMatch(/gemini|vertex|prompt|googleapis/i);
  });

  it('[REQ-ESC6-026] el servidor y el cliente comparten constantes de versión del aviso y proveedor (ver t877)', () => {
    expect([SCENE_NOTICE_VERSION, SCENE_PROVIDER_ID]).toEqual(['2', 'vertex-gemini-image']);
  });
});

describe('T875 cliente HTTP de la escena (INV-AUTH-007, INV-AUTH2-002, EDGE-ESC6-016)', () => {
  const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('[INV-AUTH-007] toda petición lleva X-Argos-Request: 1; el sondeo pasivo no cuenta como actividad y las demás sí', async () => {
    const { createSceneApi } = await import('../../../src/presentation/web/scene-api.ts');
    const { onActivity } = await import('../../../src/presentation/web/activity.ts');
    const { sceneView } = await import('./escena-fixtures.ts');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createSceneApi(async (url, init) => { calls.push({ url: String(url), init: init ?? {} }); return ok(sceneView())(); }, '/api');
    let activity = 0;
    const off = onActivity(() => { activity += 1; });
    await api.get({ kind: 'OWNER' }, { passive: true });
    expect(activity).toBe(0);
    await api.get({ kind: 'HOUSEHOLD', householdId: 'h1' });
    await api.generate({ kind: 'OWNER' }, 'REGENERATE', 'b0000000-0000-4000-8000-000000000001');
    off();
    expect(activity).toBe(2);
    expect(calls.map((c) => c.url)).toEqual(['/api/me/scene', '/api/households/h1/scene', '/api/me/scene/generate']);
    expect(calls.every((c) => (c.init.headers as Record<string, string>)['X-Argos-Request'] === '1')).toBe(true);
    expect((calls[2]!.init.headers as Record<string, string>)['Idempotency-Key']).toBe('b0000000-0000-4000-8000-000000000001');
    expect(calls[2]!.init.body).toBe('{"action":"REGENERATE"}');
  });

  it('[INV-ESC6-016] un error expone solo el code (y Retry-After), nunca el cuerpo; un fallo de red es ERR-INTERNAL-UNEXPECTED con estado 0', async () => {
    const { createSceneApi, SceneApiError } = await import('../../../src/presentation/web/scene-api.ts');
    const limited = createSceneApi(async () => new Response(JSON.stringify({ code: 'ERR-RATE-LIMITED', detail: 'prompt secreto' }), { status: 429, headers: { 'Retry-After': '42' } }));
    const error = await limited.generate({ kind: 'OWNER' }, 'UPDATE', 'k').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SceneApiError);
    expect(JSON.stringify([(error as Error).message, (error as InstanceType<typeof SceneApiError>).code, (error as InstanceType<typeof SceneApiError>).retryAfterSeconds])).toBe('["ERR-RATE-LIMITED","ERR-RATE-LIMITED",42]');
    const down = createSceneApi(async () => { throw new TypeError('red'); });
    await expect(down.get({ kind: 'OWNER' })).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED', status: 0 });
  });
});
