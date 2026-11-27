/**
 * Cliente HTTP de la reclamación y la disputa de microchip (Feature 012, Bloque B, T1636; `chip-claim.openapi.yaml`). `fetch` propio, como `co-ownership-api.ts`. Todo POST responde el MISMO 202
 * `{ status: 'RECEIVED' }` (sin oráculo, INV-CHP12-003): la interfaz NUNCA afirma que la solicitud «existe» o «se creó», solo que se recibió. El chip completo viaja solo en la petición y nunca se
 * conserva en el estado de la pantalla tras enviarse; las respuestas solo traen `chipLast4`.
 *
 * @implements REQ-CHP12-003, REQ-CHP12-004, REQ-CHP12-005, INV-CHP12-003, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';

export interface ChipRequestView {
  readonly id: string;
  readonly action: 'CLAIM_CO_OWNERSHIP' | 'CHIP_DISPUTE';
  readonly status: string;
  readonly chipLast4: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly outcome: 'RESOLVED_APPROVED' | 'RESOLVED_REJECTED' | 'EXPIRED' | null;
  readonly resolvedAt: string | null;
}

export const MICROCHIP_REGISTERED_CODE = 'ERR-CHP12-MICROCHIP-REGISTERED';
export const MAX_EVIDENCE_FILES = 5;
export const EVIDENCE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export class ChipApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'ChipApiError';
  }
}

/** Texto por código; lo desconocido cae al genérico (sin detalle del servidor). */
export function chipProblemMessage(error: unknown): string {
  const code = error instanceof ChipApiError ? error.code : '';
  switch (code) {
    case 'ERR-RATE-LIMITED':
      return 'Hiciste muchos intentos seguidos. Espera un momento e inténtalo de nuevo.';
    case 'ERR-CHP12-CLAIM-COOLDOWN':
      return 'Tu solicitud anterior sobre este microchip fue rechazada hace poco. Podrás volver a pedirlo más adelante.';
    case 'ERR-CHP12-DISPUTE-LIMIT':
      return 'Ya tienes una disputa abierta sobre este microchip o has llegado al máximo de disputas simultáneas.';
    case 'ERR-CHP12-DISPUTE-COOLDOWN':
      return 'Una disputa anterior sobre este microchip fue rechazada hace poco. Podrás volver a abrirla más adelante.';
    case 'ERR-OWN12-RETRYABLE':
      return 'No pudimos procesar la solicitud en este momento. Inténtalo de nuevo en unos segundos.';
    case 'ERR-SCHEMA-VALIDATION-FAILED':
      return 'Revisa los datos: el microchip debe tener 15 dígitos y la evidencia debe ser PDF, JPG, PNG o WebP (hasta 5 archivos).';
    case 'ERR-MEDIA-TOO-LARGE':
      return 'Algún archivo es demasiado grande. Reduce su tamaño e inténtalo de nuevo.';
    default:
      return 'No pudimos completar la acción. Inténtalo de nuevo.';
  }
}

export interface ChipApi {
  claim(microchipId: string, message?: string): Promise<void>;
  openDispute(microchipId: string, evidence: readonly File[]): Promise<void>;
  listMine(): Promise<ChipRequestView[]>;
}

export function createChipApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): ChipApi {
  async function send(path: string, init: { method: string; headers?: Record<string, string>; body?: BodyInit }): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers: { 'X-Argos-Request': '1', ...(init.headers ?? {}) } });
    } catch {
      throw new ChipApiError('ERR-INTERNAL-UNEXPECTED', 0);
    }
    if (!response.ok) {
      let code = 'ERR-INTERNAL-UNEXPECTED';
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // cuerpo no JSON (411, 413 del borde): se queda el genérico
      }
      throw new ChipApiError(code, response.status);
    }
    notifyActivity();
    return response;
  }
  return {
    async claim(microchipId, message) {
      await send('/chip-claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message === undefined || message.trim() === '' ? { microchipId } : { microchipId, message }) });
    },
    async openDispute(microchipId, evidence) {
      const form = new FormData();
      form.append('microchipId', microchipId);
      for (const file of evidence) form.append('evidence', file);
      await send('/chip-disputes', { method: 'POST', body: form }); // el navegador fija el boundary y el Content-Length
    },
    async listMine() {
      const response = await send('/chip-requests?limit=100', { method: 'GET' });
      return ((await response.json()) as { items: ChipRequestView[] }).items;
    },
  };
}
