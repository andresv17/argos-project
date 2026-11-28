/**
 * Cliente HTTP del enlace veterinario (OpenAPI 3.3.0, feature 005): crear y listar por mascota u hogar, revocar, vista previa autenticada y lectura PÚBLICA por
 * token. `fetch` propio (el cliente tipado de la SPA se genera del OpenAPI 3.0.0 de la 002). Las formas de las respuestas se declaran aquí porque la regla de capa
 * de la presentación solo admite módulos concretos de `generated/`; `tests/unit/presentation/t767-contrato-enlace.spec.ts` comprueba que son asignables a los tipos generados.
 * La lectura pública NO envía cookie (`credentials: 'omit'`), ni referente, ni usa la caché (REQ-VET-006); el token solo viaja en la ruta de esa petición.
 *
 * @implements REQ-VET-001, REQ-VET-005, REQ-VET-006, REQ-SUM-004, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';
import { parseHttpDate } from './share-view.ts';

export type ShareScopeName = 'PET' | 'HOUSEHOLD' | 'PETS';
export type ShareStatusName = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export interface ShareLinkView {
  readonly id: string;
  readonly scope: ShareScopeName;
  readonly petId: string | null;
  readonly householdId: string | null;
  readonly status: ShareStatusName;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  /** Opcional (007, T1026): ausente en enlaces anteriores a la 007 equivale a `false`. */
  readonly includeDeceasedAt?: boolean;
}
export interface ShareLinkList {
  readonly items: ShareLinkView[];
  readonly activeCount: number;
  readonly maxActiveLinks: 20;
}
/** Lista con el instante del servidor (cabecera `Date` de la respuesta) para los textos «Vence el…». */
export type ShareLinkListResult = ShareLinkList & { readonly serverNow: string | null };
export interface CreateShareLinkBody {
  readonly expiresInDays: 1 | 7 | 30;
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  readonly includeDeceasedAt: boolean;
}
export type CreateShareLinkOutcome = { readonly kind: 'CREATED'; readonly link: ShareLinkView; readonly url: string } | { readonly kind: 'REPLAY'; readonly link: ShareLinkView };

export interface ClinicalProfileView {
  readonly name: string;
  readonly species: string;
  readonly speciesOther: string | null;
  readonly breed: string;
  readonly sex: string;
  readonly neutered: boolean | null;
  readonly birthDate: string;
  readonly birthDateIsEstimate: boolean;
  readonly age: { readonly years: number; readonly months: number; readonly totalDays: number };
  readonly microchipId?: string;
  /** 007 (REQ-FAL7-008): visible siempre; ausente en resúmenes anteriores. */
  readonly lifeStatus?: 'ALIVE' | 'DECEASED';
  /** 007 (SC-007-016): solo llega con el opt-in del creador del enlace. */
  readonly deceasedAt?: string | null;
}
export interface ClinicalPetView {
  readonly profile: ClinicalProfileView;
  readonly weights: ReadonlyArray<{ readonly recordedAt: string; readonly weightKg: number; readonly notes: string | null }>;
  readonly bodyMeasurements: ReadonlyArray<{ readonly recordedAt: string; readonly neckCm: number; readonly chestCm: number; readonly backLengthCm: number; readonly waistCm: number; readonly notes: string | null }>;
  readonly vaccinations: ReadonlyArray<{ readonly vaccineName: string; readonly appliedAt: string; readonly nextBoosterAt: string | null; readonly batchOrClinic: string | null; readonly veterinarianName: string | null; readonly notes: string | null }>;
  readonly dewormings: ReadonlyArray<{ readonly productBrand: string; readonly dewormingType: 'INTERNAL' | 'EXTERNAL'; readonly appliedAt: string; readonly nextSuggestedDoseAt: string | null; readonly batchOrClinic: string | null; readonly veterinarianName: string | null; readonly notes: string | null }>;
  readonly medicalVisits: ReadonlyArray<{ readonly visitDate: string; readonly reason: string; readonly diagnosis: string; readonly treatment: string; readonly clinicOrVet: string; readonly observations: string | null }>;
  readonly symptoms: ReadonlyArray<{ readonly recordedAt: string; readonly symptomType: 'VOMIT' | 'APPETITE' | 'STOOL' | 'ENERGY' | null; readonly severity: 'MILD' | 'MODERATE' | 'SEVERE' | null; readonly title: string; readonly description: string; readonly notes: string | null }>;
  readonly otherParameters: ReadonlyArray<{ readonly recordedAt: string; readonly category: 'DIET_CHANGE' | 'ALLERGY' | 'SURGERY' | 'BEHAVIOR' | 'OTHER'; readonly title: string; readonly description: string; readonly notes: string | null }>;
  readonly clinicalFiles: ReadonlyArray<{ readonly id: string; readonly mime: string; readonly sizeBytes: number; readonly createdAt: string }>;
}
export interface SharedSummaryViewModel {
  readonly summary: {
    readonly summaryVersion: string;
    readonly generatedAt: string;
    readonly scope: ShareScopeName;
    readonly dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED';
    readonly automaticInterpretation: 'NONE';
    readonly disclosure: { readonly microchipIncluded: boolean; readonly clinicalFilesIncluded: boolean; readonly deceasedAtIncluded?: boolean };
    readonly pets: readonly ClinicalPetView[];
  };
  readonly fileLabels: ReadonlyArray<{ readonly fileId: string; readonly displayName: string }>;
  readonly validUntil: string | null;
  /** 1.2.0 (ENM-005-3.5.0): ids de las mascotas del alcance, en el orden de `summary.pets`; en la vista pública por token y, por autorización de Neo, también en la vista previa autenticada. */
  readonly petIds?: readonly string[];
}

export const UNEXPECTED_SHARE_CODE = 'ERR-INTERNAL-UNEXPECTED';

/** Error de la API del enlace: `code` del catálogo (o `ERR-INTERNAL-UNEXPECTED` ante un fallo de red) y estado HTTP (0 sin respuesta). */
export class ShareApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'ShareApiError';
  }
}

export type ShareRef = { readonly scope: 'PET'; readonly id: string } | { readonly scope: 'HOUSEHOLD'; readonly id: string };

const base = (ref: ShareRef): string => (ref.scope === 'PET' ? `/pets/${ref.id}` : `/households/${ref.id}`);

export interface ShareApi {
  create(ref: ShareRef, body: CreateShareLinkBody, idempotencyKey: string): Promise<CreateShareLinkOutcome>;
  list(ref: ShareRef): Promise<ShareLinkListResult>;
  revoke(shareLinkId: string): Promise<void>;
  preview(ref: ShareRef, options: { readonly includeMicrochip: boolean; readonly includeClinicalFiles: boolean; readonly includeDeceasedAt?: boolean }): Promise<SharedSummaryViewModel>;
  /** Lectura pública por token: sin cookie, sin CSRF, solo GET. */
  getShared(token: string): Promise<SharedSummaryViewModel>;
  /** Avatar de una mascota del enlace (ENM-005-3.5.0): sin cookie, sin referente, sin caché. 404 uniforme si no aplica. */
  getSharedAvatar(token: string, petId: string): Promise<Blob>;
}

/** Ruta de la imagen del avatar de una mascota del enlace; el token y el id solo viajan en la ruta y la respuesta nunca los refleja. */
export const sharedAvatarPath = (token: string, petId: string): string => `/api/shared/${encodeURIComponent(token)}/pets/${encodeURIComponent(petId)}/avatar`;

/**
 * Ruta de la imagen del avatar en la vista previa AUTENTICADA (D5-15, REQ-SUM-004): proxy de la misma origen `/api/pets/{petId}/avatar` con la sesión del propietario.
 * La vista previa lleva `petIds` (ENM-005-3.5.0, autorizado por Neo): el avatar de cada mascota sale de `petIds[i]`; con alcance de una mascota sin `petIds`, se usa el id de la ruta.
 */
export const previewAvatarPath = (petId: string | undefined): string | null => (petId === undefined || petId === '' ? null : `/api/pets/${encodeURIComponent(petId)}/avatar`);

export function createShareApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): ShareApi {
  /** `authenticated`: toda petición de la sesión notifica la actividad (INV-AUTH2-002); la lectura pública por token no tiene sesión y no la notifica. */
  async function send(path: string, init: RequestInit, authenticated = true): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch {
      throw new ShareApiError(UNEXPECTED_SHARE_CODE, 0);
    }
    if (!response.ok) {
      let code = UNEXPECTED_SHARE_CODE;
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // cuerpo no JSON: error del transporte
      }
      throw new ShareApiError(code, response.status);
    }
    if (authenticated) notifyActivity();
    return response;
  }
  const authed = (method: string, headers: Record<string, string> = {}, body?: string): RequestInit => ({ method, headers: { 'X-Argos-Request': '1', ...headers }, ...(body === undefined ? {} : { body }) });
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  return {
    async create(ref, body, idempotencyKey) {
      const response = await send(`${base(ref)}/share-links`, authed('POST', { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, JSON.stringify(body)));
      const result = await json<{ link: ShareLinkView; url?: string }>(response);
      return response.status === 201 && typeof result.url === 'string' ? { kind: 'CREATED', link: result.link, url: result.url } : { kind: 'REPLAY', link: result.link };
    },
    async list(ref) {
      const response = await send(`${base(ref)}/share-links`, authed('GET'));
      return { ...(await json<ShareLinkList>(response)), serverNow: parseHttpDate(response.headers.get('date')) };
    },
    async revoke(shareLinkId) {
      await send(`/share-links/${shareLinkId}`, authed('DELETE'));
    },
    async preview(ref, options) {
      const query = `includeMicrochip=${String(options.includeMicrochip)}&includeClinicalFiles=${String(options.includeClinicalFiles)}${options.includeDeceasedAt === true ? '&includeDeceasedAt=true' : ''}`;
      return json<SharedSummaryViewModel>(await send(`${base(ref)}/clinical-summary?${query}`, authed('GET')));
    },
    async getShared(token) {
      return json<SharedSummaryViewModel>(await send(`/shared/${encodeURIComponent(token)}/summary`, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }, false));
    },
    async getSharedAvatar(token, petId) {
      return (await send(`/shared/${encodeURIComponent(token)}/pets/${encodeURIComponent(petId)}/avatar`, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }, false)).blob();
    },
  };
}
