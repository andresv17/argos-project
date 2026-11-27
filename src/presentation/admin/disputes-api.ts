/**
 * Cliente del portal /admin para la cola de disputas de microchip (Feature 012, Bloque B, T1636; `admin-disputes.openapi.yaml`). Habla solo con `/api/admin/disputes*` (cookie propia, cabecera
 * `X-Argos-Request`). Nunca se pinta ni se conserva nada fuera del contrato: la cola trae `chipLast4`, fechas y SLA; el expediente, alias (`Parte A`/`Parte B`), evidencia sin contenido y actores por
 * alias; los identificadores de los actores solo llegan a `SUPER_ADMIN`.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-008, REQ-CHP12-009, INV-CHP12-004, INV-CHP12-006, EDGE-012-043
 */
export type DecisionPhase = 'NONE' | 'AWAITING_CONFIRMATION' | 'SCHEDULED_EXECUTION';
export type DisputeKind = 'CHIP_APPROPRIATION' | 'CO_OWNER_ABSENT_OR_BLOCKING' | 'PRINCIPAL_ABSENT';
export type Resolution = 'REJECT' | 'ADD_CO_OWNER' | 'REQUEST_CHANGE_PRINCIPAL' | 'END_CO_OWNERSHIP';
export type MootReason = 'PET_GONE' | 'REQUESTER_NOT_ACTIVE' | 'TARGET_LEFT' | 'TARGET_NOT_ACTIVE' | 'TRIGGER_LOST';

export interface QueueItem {
  readonly disputeId: string;
  readonly kind: DisputeKind;
  readonly chipLast4?: string;
  readonly createdAt: string;
  readonly slaDueAt: string;
  readonly slaOverdue: boolean;
  readonly decisionPhase: DecisionPhase;
  readonly iAmParty?: boolean;
}
export interface DisputeFile {
  readonly disputeId: string;
  readonly kind: DisputeKind;
  readonly status: string;
  readonly chipLast4?: string;
  readonly createdAt: string;
  readonly frozenUntil?: string;
  readonly freezeExtensionGranted?: boolean;
  readonly slaDueAt?: string;
  readonly slaOverdue: boolean;
  readonly decisionPhase: DecisionPhase;
  readonly resolution?: Resolution;
  readonly executesAfter?: string;
  readonly parties: ReadonlyArray<{ readonly alias: string; readonly role: string }>;
  readonly evidence: ReadonlyArray<{ readonly evidenceId: string; readonly contentType: string; readonly bytes: number; readonly readByMe?: boolean }>;
  readonly actors: ReadonlyArray<{ readonly alias: string; readonly role: string }>;
}

/** `SESSION_LOST`: 404 uniforme; `FORBIDDEN`: 403 (rol, parte del caso, sin step-up o sin haber leído la evidencia); `STALE`: 409; `FAILED`: red u otra forma. */
export type Outcome<T> = { readonly kind: 'OK'; readonly value: T } | { readonly kind: 'SESSION_LOST' } | { readonly kind: 'FORBIDDEN'; readonly code: string | null } | { readonly kind: 'STALE' } | { readonly kind: 'INVALID' } | { readonly kind: 'FAILED' };

const BASE = '/api/admin/disputes';
const HEADERS = { Accept: 'application/json', 'X-Argos-Request': '1' };

async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<Outcome<T>> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: init.method,
      credentials: 'same-origin',
      headers: init.body === undefined ? HEADERS : { ...HEADERS, 'Content-Type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    if (response.ok) return { kind: 'OK', value: (await response.json()) as T };
    if (response.status === 404) return { kind: 'SESSION_LOST' };
    if (response.status === 403) {
      let code: string | null = null;
      try {
        const problem = (await response.json()) as { code?: unknown };
        if (typeof problem.code === 'string') code = problem.code;
      } catch {
        // 403 genérico de /admin: sin código
      }
      return { kind: 'FORBIDDEN', code };
    }
    if (response.status === 409) return { kind: 'STALE' };
    if (response.status === 422) return { kind: 'INVALID' };
    return { kind: 'FAILED' };
  } catch {
    return { kind: 'FAILED' };
  }
}

export const fetchQueue = (): Promise<Outcome<{ items: QueueItem[]; nextCursor?: string }>> => call('?limit=100', { method: 'GET' });
export const fetchDispute = (id: string): Promise<Outcome<DisputeFile>> => call(`/${encodeURIComponent(id)}`, { method: 'GET' });
export const readEvidence = (id: string, evidenceId: string): Promise<Outcome<{ url: string; expiresAt: string }>> => call(`/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`, { method: 'GET' });
export const extendFreeze = (id: string, reason: string): Promise<Outcome<DisputeFile>> => call(`/${encodeURIComponent(id)}/extend-freeze`, { method: 'POST', body: { reason } });
export const cancelExecution = (id: string, reason: string): Promise<Outcome<DisputeFile>> => call(`/${encodeURIComponent(id)}/cancel-execution`, { method: 'POST', body: { reason } });
export const closeMoot = (id: string, mootReason: MootReason): Promise<Outcome<DisputeFile>> => call(`/${encodeURIComponent(id)}/close-moot`, { method: 'POST', body: { mootReason } });

/** Step-up de UN SOLO USO ligado a (administrador, disputa, acción), vigente 5 minutos; se pide inmediatamente antes de `resolve` o `confirm`. */
async function withStepUp<T>(id: string, action: 'resolve' | 'confirm', send: (grantId: string) => Promise<Outcome<T>>): Promise<Outcome<T>> {
  const grant = await call<{ grantId: string }>(`/${encodeURIComponent(id)}/step-up`, { method: 'POST', body: { disputeId: id, action } });
  if (grant.kind !== 'OK') return grant as Outcome<T>;
  return send(grant.value.grantId);
}
export const resolveDispute = (id: string, resolution: Resolution, reason: string): Promise<Outcome<DisputeFile>> =>
  withStepUp(id, 'resolve', (stepUpGrantId) => call(`/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: { resolution, reason, stepUpGrantId } }));
export const confirmDispute = (id: string, reason: string): Promise<Outcome<DisputeFile>> =>
  withStepUp(id, 'confirm', (stepUpGrantId) => call(`/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: { reason, stepUpGrantId } }));
