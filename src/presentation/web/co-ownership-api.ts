/**
 * Cliente HTTP de la co-propiedad y de las solicitudes de acciones críticas (Feature 012, T1617; OpenAPI de la 012). `fetch` propio, como `share-api.ts`: el cliente tipado de la SPA se genera
 * del OpenAPI de la 002. Las formas de las respuestas se declaran aquí (la capa de presentación solo admite módulos concretos de `generated/`). Toda petición de la sesión lleva `X-Argos-Request`
 * y notifica la actividad (INV-AUTH2-002). El texto de un error sale de su código; un 404 de co-propiedad es siempre «no encontrada» (INV-OWN12-004), nunca se distingue de un tercero.
 *
 * @implements REQ-OWN12-002, REQ-OWN12-004, REQ-OWN12-006, INV-OWN12-004, INV-AUTH-007
 */
import { notifyActivity } from './activity.ts';

export type CoOwnerStatusName = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'LEFT' | 'PROMOTED' | 'ENDED';
export interface CoOwnerRowView {
  readonly id: string;
  readonly userId: string;
  readonly username: string;
  readonly status: CoOwnerStatusName;
  readonly invitedByUsername?: string | null;
  readonly expiresAt: string;
  readonly joinedAt: string | null;
}
export interface OwnershipView {
  readonly petId: string;
  readonly ownershipVersion: number;
  readonly principal: { readonly userId: string; readonly username: string };
  readonly coOwners: readonly CoOwnerRowView[];
  readonly promotionNotice: { readonly pending: boolean };
  readonly absenceNotice?: { readonly open: boolean; readonly respondable: boolean; readonly frozenUntil: string | null };
}
export interface CoOwnerInvitationView {
  readonly coOwnerId: string;
  readonly petName: string;
  readonly invitedByUsername: string;
  readonly expiresAt: string;
}
export type OwnerRequestActionName = 'DELETE_PET' | 'TRANSFER_PRINCIPAL' | 'CHANGE_PRINCIPAL' | 'INVITE_CO_OWNER' | 'CLAIM_CO_OWNERSHIP' | 'CHIP_DISPUTE';
export interface OwnerRequestItem {
  readonly id: string;
  readonly action: OwnerRequestActionName;
  readonly status: string;
  readonly role: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly petId?: string | null;
  readonly petName?: string | null;
  readonly requesterUsername?: string | null;
  readonly targetUsername?: string | null;
  readonly approvers?: ReadonlyArray<{ readonly username: string; readonly vote: string }>;
  readonly canVote: boolean;
}

export const UNEXPECTED_OWNERSHIP_CODE = 'ERR-INTERNAL-UNEXPECTED';
export class CoOwnershipApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'CoOwnershipApiError';
  }
}

/** Texto de la interfaz por código; lo desconocido cae al genérico (sin detalle del servidor). */
export function ownershipProblemMessage(code: string): string {
  switch (code) {
    case 'ERR-PET-NOT-FOUND':
      return 'No encontramos esa mascota o ya no formas parte de ella.';
    case 'ERR-RATE-LIMITED':
      return 'Hiciste muchos intentos seguidos. Espera un momento e inténtalo de nuevo.';
    case 'ERR-OWN12-ALREADY-OWNER':
      return 'Esa persona ya es propietaria de esta mascota o tiene una invitación pendiente.';
    case 'ERR-OWN12-CO-OWNER-LIMIT':
      return 'La mascota ya tiene el máximo de propietarios (incluidas las invitaciones pendientes).';
    case 'ERR-OWN12-APPROVAL-PENDING':
      return 'Ya hay una solicitud igual esperando aprobación.';
    case 'ERR-OWN12-STALE':
      return 'Algo cambió mientras decidías. Recarga e inténtalo de nuevo.';
    case 'ERR-OWN12-RETRYABLE':
      return 'Hay otra operación en curso sobre esta mascota. Inténtalo de nuevo en unos segundos.';
    case 'ERR-OWN12-LAST-OWNER':
      return 'Eres el único propietario: no puedes salir sin dejar la mascota a otra persona.';
    case 'ERR-CHP12-CHIP-FROZEN':
      return 'Hay una disputa abierta sobre esta mascota: por ahora no se puede eliminar ni cambiar de principal.';
    case 'ERR-SCHEMA-VALIDATION-FAILED':
      return 'Revisa los datos: la solicitud no se pudo enviar tal como está.';
    default:
      return 'No pudimos completar la acción. Inténtalo de nuevo.';
  }
}

export interface CoOwnershipApi {
  getOwnership(petId: string): Promise<OwnershipView>;
  invite(petId: string, username: string): Promise<void>;
  cancelInvitation(petId: string, coOwnerId: string): Promise<void>;
  leave(petId: string, successorUserId?: string): Promise<void>;
  ackPromotion(petId: string): Promise<void>;
  listInvitations(): Promise<CoOwnerInvitationView[]>;
  acceptInvitation(coOwnerId: string): Promise<void>;
  declineInvitation(coOwnerId: string): Promise<void>;
  createRequest(petId: string, body: { readonly action: 'DELETE_PET' | 'TRANSFER_PRINCIPAL' | 'CHANGE_PRINCIPAL'; readonly targetUserId?: string }): Promise<OwnerRequestItem>;
  listRequests(): Promise<OwnerRequestItem[]>;
  approve(requestId: string): Promise<OwnerRequestItem>;
  reject(requestId: string): Promise<OwnerRequestItem>;
  cancelRequest(requestId: string): Promise<void>;
}

export function createCoOwnershipApi(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = '/api'): CoOwnershipApi {
  async function send(path: string, method: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { 'X-Argos-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new CoOwnershipApiError(UNEXPECTED_OWNERSHIP_CODE, 0);
    }
    if (!response.ok) {
      let code = UNEXPECTED_OWNERSHIP_CODE;
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // cuerpo no JSON: error del transporte
      }
      throw new CoOwnershipApiError(code, response.status);
    }
    notifyActivity();
    return response;
  }
  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;
  const enc = encodeURIComponent;
  return {
    async getOwnership(petId) {
      return json<OwnershipView>(await send(`/pets/${enc(petId)}/ownership`, 'GET'));
    },
    async invite(petId, username) {
      await send(`/pets/${enc(petId)}/co-owners`, 'POST', { username });
    },
    async cancelInvitation(petId, coOwnerId) {
      await send(`/pets/${enc(petId)}/co-owners/${enc(coOwnerId)}/cancel`, 'POST');
    },
    async leave(petId, successorUserId) {
      await send(`/pets/${enc(petId)}/co-owners/leave`, 'POST', successorUserId === undefined ? {} : { successorUserId });
    },
    async ackPromotion(petId) {
      await send(`/pets/${enc(petId)}/co-owners/promotion-notice/ack`, 'POST');
    },
    async listInvitations() {
      return json<CoOwnerInvitationView[]>(await send('/co-owner-invitations', 'GET'));
    },
    async acceptInvitation(coOwnerId) {
      await send(`/co-owner-invitations/${enc(coOwnerId)}/accept`, 'POST');
    },
    async declineInvitation(coOwnerId) {
      await send(`/co-owner-invitations/${enc(coOwnerId)}/decline`, 'POST');
    },
    async createRequest(petId, body) {
      return json<OwnerRequestItem>(await send(`/pets/${enc(petId)}/owner-requests`, 'POST', body));
    },
    async listRequests() {
      return json<OwnerRequestItem[]>(await send('/owner-requests', 'GET'));
    },
    async approve(requestId) {
      return json<OwnerRequestItem>(await send(`/owner-requests/${enc(requestId)}/approve`, 'POST'));
    },
    async reject(requestId) {
      return json<OwnerRequestItem>(await send(`/owner-requests/${enc(requestId)}/reject`, 'POST'));
    },
    async cancelRequest(requestId) {
      await send(`/owner-requests/${enc(requestId)}/cancel`, 'POST');
    },
  };
}
