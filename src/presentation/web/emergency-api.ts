/**
 * Cliente HTTP de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1676; `emergency.openapi.yaml` 0.3.0). `fetch` propio, como `chip-api.ts`. La lectura PÚBLICA por token no envía cookie
 * (`credentials: 'omit'`), ni referente, ni usa la caché (REQ-QR12-004, INV-QR12-002). El token y la URL solo viven en el estado de la pantalla que los recibe una vez (REQ-QR12-003). Los textos de
 * error salen del código, sin eco del valor (el teléfono y las alergias nunca se repiten desde el servidor).
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-004, REQ-QR12-006, INV-QR12-002, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';

export type EmergencyStatusReason = 'USER_DEACTIVATED' | 'AUTO_GUARD_LOST' | 'AUTO_PET_DECEASED' | 'AUTO_NOTICE_CHANGED';
export type EmergencyLastChangeKind = 'ACTIVATED' | 'REGENERATED' | 'DEACTIVATED' | 'AUTO_DEACTIVATED';

export interface EmergencyCardOwnerView {
  readonly petId: string;
  readonly status: 'OFF' | 'ON';
  readonly statusReason: EmergencyStatusReason | null;
  readonly guardSatisfied: boolean;
  readonly myPhoneVisible: boolean;
  readonly myPhoneReconfirmRequired: boolean;
  readonly visiblePhonesCount: number;
  readonly criticalAllergiesCount: number;
  readonly lastScannedAt: string | null;
  readonly lastChange: { readonly kind: EmergencyLastChangeKind; readonly at: string; readonly byMe: boolean } | null;
  readonly criticalAllergiesChange: { readonly at: string; readonly byMe: boolean } | null;
  readonly noticeVersion: string | null;
}

export interface EmergencyActivationResult {
  readonly petId: string;
  readonly status: 'ON';
  readonly token: string;
  readonly url: string;
  readonly qrSvg: string;
  readonly noticeVersion: string;
  readonly activatedAt: string;
  readonly shownOnce: true;
}

export interface EmergencyPublicView {
  readonly petName: string;
  readonly criticalAllergies: readonly string[];
  readonly contactPhones: readonly { readonly phone: string }[];
}

export interface CriticalAllergiesView {
  readonly petId: string;
  readonly criticalAllergies: readonly string[];
  readonly cardAutoDeactivated?: boolean;
}

export interface AccountPhoneView {
  readonly phone: string | null;
  readonly emergencyCardsAutoDeactivated?: number;
}

export class EmergencyApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'EmergencyApiError';
  }
}

/** Texto por código; lo desconocido cae al genérico (sin detalle ni eco del servidor). */
export function emergencyProblemMessage(error: unknown): string {
  const code = error instanceof EmergencyApiError ? error.code : '';
  switch (code) {
    case 'ERR-QR12-ACTIVATION-REQUIREMENTS':
      return 'Para activar la ficha necesitas al menos una alergia crítica o un teléfono visible.';
    case 'ERR-QR12-ALREADY-ACTIVE':
      return 'La ficha ya estaba activa. Recarga la pantalla; si necesitas otro código, genera uno nuevo.';
    case 'ERR-QR12-PHONE-INVALID':
      return 'El teléfono no es válido. Escríbelo con código de país, por ejemplo +573001234567.';
    case 'ERR-QR12-CONSENT-REQUIRED':
      return 'Debes confirmar el aviso para activar la ficha.';
    case 'ERR-QR12-URL-TOO-LONG':
      return 'No se pudo generar el código con la dirección configurada. Avisa al administrador.';
    case 'ERR-RATE-LIMITED':
      return 'Hiciste muchos cambios seguidos. Espera un momento e inténtalo de nuevo.';
    case 'ERR-SCHEMA-VALIDATION-FAILED':
      return 'Revisa los datos: hasta 5 alergias de 1 a 60 caracteres, sin caracteres especiales ni invisibles.';
    case 'ERR-PET-NOT-FOUND':
      return 'No tienes acceso a esta ficha o la mascota ya no existe.';
    default:
      return 'No pudimos completar la acción. Inténtalo de nuevo.';
  }
}

export interface EmergencyApi {
  getStatus(petId: string): Promise<EmergencyCardOwnerView>;
  activate(petId: string, body: { readonly consentAccepted: boolean; readonly noticeVersion: string; readonly showMyPhone?: boolean }): Promise<EmergencyActivationResult>;
  regenerate(petId: string, body: { readonly consentAccepted: boolean; readonly noticeVersion: string; readonly showMyPhone?: boolean }): Promise<EmergencyActivationResult>;
  deactivate(petId: string): Promise<void>;
  setPhoneConsent(petId: string, body: { readonly visible: boolean; readonly noticeVersion?: string }): Promise<EmergencyCardOwnerView>;
  updateAllergies(petId: string, criticalAllergies: readonly string[]): Promise<CriticalAllergiesView>;
  updatePhone(phone: string | null): Promise<AccountPhoneView>;
}

export function createEmergencyApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): EmergencyApi {
  async function send(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method,
        headers: { 'X-Argos-Request': '1', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      throw new EmergencyApiError('ERR-INTERNAL-UNEXPECTED', 0);
    }
    if (!response.ok) {
      let code = 'ERR-INTERNAL-UNEXPECTED';
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // cuerpo no JSON: se queda el genérico
      }
      throw new EmergencyApiError(code, response.status);
    }
    notifyActivity();
    return response;
  }
  const pet = (petId: string): string => `/pets/${encodeURIComponent(petId)}`;
  return {
    async getStatus(petId) {
      return (await (await send(`${pet(petId)}/emergency-card`, { method: 'GET' })).json()) as EmergencyCardOwnerView;
    },
    async activate(petId, body) {
      return (await (await send(`${pet(petId)}/emergency-card/activate`, { method: 'POST', body })).json()) as EmergencyActivationResult;
    },
    async regenerate(petId, body) {
      return (await (await send(`${pet(petId)}/emergency-card/regenerate`, { method: 'POST', body })).json()) as EmergencyActivationResult;
    },
    async deactivate(petId) {
      await send(`${pet(petId)}/emergency-card/deactivate`, { method: 'POST', body: {} });
    },
    async setPhoneConsent(petId, body) {
      return (await (await send(`${pet(petId)}/emergency-card/phone-consent`, { method: 'PUT', body })).json()) as EmergencyCardOwnerView;
    },
    async updateAllergies(petId, criticalAllergies) {
      return (await (await send(`${pet(petId)}/critical-allergies`, { method: 'PUT', body: { criticalAllergies } })).json()) as CriticalAllergiesView;
    },
    async updatePhone(phone) {
      return (await (await send('/account/phone', { method: 'PUT', body: { phone } })).json()) as AccountPhoneView;
    },
  };
}

/** Lectura PÚBLICA `GET /api/emergency/{token}`: sin cookie, sin referente, sin caché ni cabecera propia (no es una petición de la sesión). */
export async function fetchEmergencyPublic(token: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): Promise<EmergencyPublicView> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/emergency/${encodeURIComponent(token)}`, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  } catch {
    throw new EmergencyApiError('ERR-INTERNAL-UNEXPECTED', 0);
  }
  if (!response.ok) throw new EmergencyApiError(response.status === 404 ? 'ERR-PET-NOT-FOUND' : response.status === 429 ? 'ERR-RATE-LIMITED' : 'ERR-INTERNAL-UNEXPECTED', response.status);
  return (await response.json()) as EmergencyPublicView;
}
