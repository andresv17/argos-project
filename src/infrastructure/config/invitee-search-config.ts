/**
 * Cifras del límite de tasa del autocompletado de colaboradores (feature 008, REQ-INV8-003; propuesta del spec: 30 consultas por minuto por usuario).
 * Viven aquí y no en el contrato (`x-sdd-rate-limit` de `searchInvitees`).
 *
 * @implements REQ-INV8-003, INV-ARCH-006
 */
export interface InviteeSearchLimits {
  readonly maxPerWindow: number;
  readonly windowMinutes: number;
}

export const INVITEE_SEARCH_LIMITS: InviteeSearchLimits = { maxPerWindow: 30, windowMinutes: 1 };
