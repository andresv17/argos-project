import type { SceneViewData } from '../../../src/presentation/web/scene-api.ts';

/** Vista de escena de prueba (forma de `SceneView` de la 006). */
export const SCENE_ID = 'c1000000-0000-4000-8000-000000000001';
export const IMAGE_TAG = 'd1000000-0000-4000-8000-000000000001';
export const HOUSEHOLD_ID = '22222222-2222-4222-8222-222222222201';

export function sceneView(overrides: Partial<SceneViewData> = {}): SceneViewData {
  return {
    sceneId: SCENE_ID,
    owner: 'HOUSEHOLD',
    status: 'ready',
    imageTag: IMAGE_TAG,
    pending: 0,
    quota: { max: 10, remaining: 7, window: '2026-11', resetsAt: '2026-12-01T05:00:00.000Z' },
    pets: { shown: 3, total: 3, maxPets: 8 },
    actions: { canUpdate: false, canRegenerate: true, canUploadHouseholdPhoto: true, blockedReason: 'NO_CHANGES' },
    consent: { required: false, noticeVersion: '1', providerId: 'vertex-gemini-image', householdPhotoGranted: true, petPhotosGranted: true },
    lastError: null,
    stale: false,
    updatedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}
