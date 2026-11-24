/**
 * Cliente HTTP de la escena del hogar (feature 006, contrato `home-scene.openapi.yaml`): estado, generación idempotente, aviso y consentimiento, y foto del hogar.
 * Usa `fetch` propio (como `media-api.ts`): el cliente tipado de la SPA se genera del OpenAPI 3.0.0 de la 002 y no declara estas rutas, y el cuerpo de la foto es
 * binario. Las formas se declaran aquí por la regla de capas de la presentación (`presentation-architecture.spec.ts`); `t875-contrato-escena-ui.spec.ts` comprueba
 * en compilación que son asignables en ambos sentidos a los tipos generados de `src/generated/v34/`. La `X-Argos-Request` se añade a toda petición (INV-AUTH-007).
 * Nunca se guarda ni se muestra el cuerpo de error del servidor: solo su `code` (INV-ESC6-016).
 *
 * @implements REQ-ESC6-001, REQ-ESC6-003, REQ-ESC6-005, REQ-ESC6-012, REQ-ESC6-019, REQ-ESC6-023, REQ-ESC6-025, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';

export type SceneStatus = 'idle' | 'outdated' | 'generating' | 'ready' | 'failed';
export type SceneErrorCode = 'ERR-SCENE-GENERATION-FAILED' | 'ERR-SCENE-GENERATION-TIMEOUT' | 'ERR-SCENE-INVALID-IMAGE' | 'ERR-SCENE-LEASE-EXPIRED';
export type SceneBlockedReason = 'NO_CHANGES' | 'QUOTA_EXHAUSTED' | 'GENERATING' | 'CONSENT_REQUIRED' | 'ROLE' | 'COOLDOWN';
export type ConsentScope = 'HOUSEHOLD_PHOTO' | 'PET_PHOTOS';
/** Uno o los dos alcances (sin repetir), como en el contrato. */
export type ConsentScopes = [ConsentScope] | [ConsentScope, ConsentScope];
export type SceneAction = 'UPDATE' | 'REGENERATE';

export interface SceneViewData {
  readonly sceneId: string;
  readonly owner: 'HOUSEHOLD' | 'OWNER';
  readonly status: SceneStatus;
  readonly imageTag: string | null;
  readonly pending: number;
  readonly quota: { readonly max: number; readonly remaining: number; readonly window: string; readonly resetsAt: string };
  readonly pets: { readonly shown: number; readonly total: number; readonly maxPets: number };
  readonly actions: { readonly canUpdate: boolean; readonly canRegenerate: boolean; readonly canUploadHouseholdPhoto: boolean; readonly blockedReason: SceneBlockedReason | null; /** Segundos hasta poder volver a intentar (1..86400) o `null`; opcional como en el contrato 1.1.0 (REQ-ESC6-034). */ readonly retryAfterSeconds?: number | null };
  readonly consent: { readonly required: boolean; readonly noticeVersion: string; readonly providerId: string; readonly householdPhotoGranted: boolean; readonly petPhotosGranted: boolean };
  readonly lastError: SceneErrorCode | null;
  readonly stale: boolean;
  readonly updatedAt: string;
  /** `true` si la creación de imágenes está deshabilitada (contrato 006 1.2.0, REQ-CFG9-003); ausente o `false` = habilitada. La imagen vigente sigue visible. */
  readonly disabled?: boolean;
}
export interface SceneNoticeData {
  readonly noticeVersion: string;
  readonly providerId: string;
  readonly scopes: ConsentScopes;
}
export interface GrantSceneConsentBody {
  readonly noticeVersion: string;
  readonly providerId: string;
  readonly scopes: ConsentScopes;
}
export interface HouseholdPhotoData {
  readonly tag: string;
  readonly mime: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly sizeBytes: number;
  readonly createdAt: string;
}

/** Ámbito de la escena: el hogar explícito o el propietario sin hogar (`/me`, D6-09). */
export type SceneScope = { readonly kind: 'HOUSEHOLD'; readonly householdId: string } | { readonly kind: 'OWNER' };

export const SCENE_UNEXPECTED_CODE = 'ERR-INTERNAL-UNEXPECTED';

/** Error de la API de la escena: `code` estable (o `ERR-INTERNAL-UNEXPECTED` ante un fallo de red), estado HTTP (0 sin respuesta) y `Retry-After` en segundos si vino. */
export class SceneApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'SceneApiError';
  }
}

const scenePath = (scope: SceneScope): string => (scope.kind === 'HOUSEHOLD' ? `/households/${scope.householdId}/scene` : '/me/scene');

export interface SceneApi {
  /** `passive: true` es el sondeo: no cuenta como actividad (no extiende la sesión). */
  get(scope: SceneScope, options?: { readonly passive?: boolean }): Promise<SceneViewData>;
  /** `idempotencyKey` es un UUID v4 NUEVO por clic (EDGE-ESC6-016). */
  generate(scope: SceneScope, action: SceneAction, idempotencyKey: string): Promise<SceneViewData>;
  notice(): Promise<SceneNoticeData>;
  grantConsent(body: GrantSceneConsentBody): Promise<void>;
  revokeConsent(): Promise<void>;
  putHouseholdPhoto(householdId: string, blob: Blob): Promise<HouseholdPhotoData>;
  deleteHouseholdPhoto(householdId: string): Promise<void>;
}

export function createSceneApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): SceneApi {
  async function send(path: string, method: string, headers: Record<string, string> = {}, body?: BodyInit, passive = false): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { method, headers: { 'X-Argos-Request': '1', ...headers }, ...(body === undefined ? {} : { body }) });
    } catch {
      throw new SceneApiError(SCENE_UNEXPECTED_CODE, 0);
    }
    if (!response.ok) {
      let code = SCENE_UNEXPECTED_CODE;
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // Cuerpo no JSON: se informa como inesperado con el estado HTTP real.
      }
      const retry = Number(response.headers.get('Retry-After'));
      throw new SceneApiError(code, response.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    if (!passive) notifyActivity();
    return response;
  }
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  return {
    async get(scope, options) {
      return json<SceneViewData>(await send(scenePath(scope), 'GET', {}, undefined, options?.passive === true));
    },
    async generate(scope, action, idempotencyKey) {
      return json<SceneViewData>(await send(`${scenePath(scope)}/generate`, 'POST', { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, JSON.stringify({ action })));
    },
    async notice() {
      return json<SceneNoticeData>(await send('/scene-consent/notice', 'GET'));
    },
    async grantConsent(body) {
      await send('/scene-consent', 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(body));
    },
    async revokeConsent() {
      await send('/scene-consent', 'DELETE');
    },
    async putHouseholdPhoto(householdId, blob) {
      return json<HouseholdPhotoData>(await send(`/households/${householdId}/photo`, 'PUT', { 'Content-Type': blob.type }, blob));
    },
    async deleteHouseholdPhoto(householdId) {
      await send(`/households/${householdId}/photo`, 'DELETE');
    },
  };
}
