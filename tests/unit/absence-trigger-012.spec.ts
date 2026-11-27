import { describe, expect, it } from 'vitest';
import { addBusinessDays, evaluateAbsenceTrigger, type AbsenceTriggerRequest } from '../../src/domain/pet/absence-trigger.ts';

/**
 * T1627 (Feature 012, Bloque A, #22): disparador objetivo de la disputa por ausencia (`src/domain/pet/absence-trigger.ts`, función pura con el reloj de pruebas): ≥ 2 solicitudes críticas SECUENCIALES expiradas por
 * TTL en 60 días con el `target` en `approver_set` sin voto ni rechazo; `DELETE_PET` no cuenta (ni en el conteo, ni en la secuencia, ni en «sin voto»); 14 días de inactividad continua; condición de sesión desde la más
 * antigua; precedencia: aplica la más estricta.
 *
 * @implements REQ-OWN12-009, INV-OWN12-006, EDGE-012-056, SC-012-091, SC-012-114, SC-012-115
 */
const TARGET = 'a0000000-0000-4000-8000-000000000002';
const OTHER = 'a0000000-0000-4000-8000-000000000003';
const DAY = 86_400_000;
const NOW = '2027-03-01T00:00:00.000Z';
const ago = (days: number): string => new Date(Date.parse(NOW) - days * DAY).toISOString();

let counter = 0;
const request = (over: Partial<AbsenceTriggerRequest> & { createdDaysAgo: number; ttlDays?: number }): AbsenceTriggerRequest => {
  counter += 1;
  const { createdDaysAgo, ttlDays = 7, ...rest } = over;
  return { id: `b0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`, action: 'INVITE_CO_OWNER', status: 'EXPIRED', createdAt: ago(createdDaysAgo), expiresAt: ago(createdDaysAgo - ttlDays), approverSet: [TARGET], approvals: [], rejectedBy: null, staleReason: null, ...rest };
};
/** Dos solicitudes secuenciales: la primera nace hace `first` días y la segunda justo al vencer la primera. */
const sequential = (first = 30): AbsenceTriggerRequest[] => [request({ createdDaysAgo: first }), request({ createdDaysAgo: first - 7, action: 'TRANSFER_PRINCIPAL' })];
const evaluate = (requests: readonly AbsenceTriggerRequest[], targetLastActiveAt: string | null = null) => evaluateAbsenceTrigger({ targetUserId: TARGET, now: NOW, requests, targetLastActiveAt });

describe('T1627 [REQ-OWN12-009] disparador objetivo', () => {
  it('dos solicitudes secuenciales expiradas por TTL, con el target sin voto y sin actividad, cumplen y sellan los ids en orden cronológico', () => {
    const requests = sequential();
    const result = evaluate([...requests].reverse());
    expect(result).toEqual({ eligible: true, triggerRequestIds: requests.map((r) => r.id), oldestCreatedAt: requests[0]!.createdAt });
  });

  it('[SC-012-091] una sola solicitud expirada, o ninguna, no cumple', () => {
    expect(evaluate([request({ createdDaysAgo: 20 })])).toEqual({ eligible: false });
    expect(evaluate([])).toEqual({ eligible: false });
  });

  it('[H-09][EDGE-012-056] dos solicitudes SIMULTÁNEAS (la segunda nace antes de vencer la primera) no cuentan como dos', () => {
    expect(evaluate([request({ createdDaysAgo: 30 }), request({ createdDaysAgo: 28, action: 'CHANGE_PRINCIPAL' })])).toEqual({ eligible: false });
    // en el borde exacto (created_at = expires_at de la anterior) sí es secuencial
    expect(evaluate([request({ createdDaysAgo: 30 }), request({ createdDaysAgo: 23, action: 'CHANGE_PRINCIPAL' })]).eligible).toBe(true);
  });

  it('[H-09] DELETE_PET se ignora por completo: no cuenta, no rompe la secuencia y ni siquiera una DELETE_PET expirada suma a una crítica', () => {
    expect(evaluate([request({ createdDaysAgo: 30, action: 'DELETE_PET' }), request({ createdDaysAgo: 23 })])).toEqual({ eligible: false });
    const requests = sequential();
    expect(evaluate([...requests, request({ createdDaysAgo: 26, action: 'DELETE_PET' })]).eligible).toBe(true);
  });

  it('[H-09] CANCELLED, REJECTED y las expiradas por obsolescencia (STALE) no cuentan; una PENDING con expires_at <= now sí (se materializa antes de contar)', () => {
    const [a, b] = sequential();
    expect(evaluate([a!, { ...b!, status: 'CANCELLED' }])).toEqual({ eligible: false });
    expect(evaluate([a!, { ...b!, status: 'REJECTED' }])).toEqual({ eligible: false });
    expect(evaluate([a!, { ...b!, staleReason: 'ERR-OWN12-STALE' }])).toEqual({ eligible: false });
    expect(evaluate([a!, { ...b!, status: 'PENDING' }]).eligible).toBe(true);
    expect(evaluate([a!, { ...b!, status: 'PENDING', expiresAt: ago(-1) }])).toEqual({ eligible: false }); // aún vigente
  });

  it('el target debe figurar en el approver_set; sin él la solicitud no cuenta', () => {
    const [a, b] = sequential();
    expect(evaluate([a!, { ...b!, approverSet: [OTHER] }])).toEqual({ eligible: false });
  });

  it('[H-09] un rechazo del target, o un voto suyo en CUALQUIER solicitud de la ventana (también una DELETE_PET), descarta el disparador', () => {
    const [a, b] = sequential();
    expect(evaluate([a!, { ...b!, status: 'REJECTED', rejectedBy: TARGET }])).toEqual({ eligible: false });
    expect(evaluate([a!, { ...b!, approvals: [{ u: TARGET, at: ago(15) }] }])).toEqual({ eligible: false });
    expect(evaluate([a!, b!, request({ createdDaysAgo: 10, action: 'DELETE_PET', status: 'APPROVED', approvals: [{ u: TARGET, at: ago(9) }] })])).toEqual({ eligible: false });
    expect(evaluate([a!, b!, request({ createdDaysAgo: 10, action: 'DELETE_PET', status: 'REJECTED', rejectedBy: TARGET })])).toEqual({ eligible: false });
  });

  it('solo cuentan las solicitudes creadas en los últimos 60 días', () => {
    expect(evaluate(sequential(70))).toEqual({ eligible: false });
    expect(evaluate(sequential(60)).eligible).toBe(true);
    expect(evaluate([request({ createdDaysAgo: 61 }), request({ createdDaysAgo: 54 })])).toEqual({ eligible: false });
  });

  it('[P-5] sesión del target desde la creación de la solicitud más antigua descarta el disparador; sin actividad registrada cuenta como inactivo', () => {
    const requests = sequential(30);
    expect(evaluate(requests, ago(20)).eligible).toBe(false); // activo hace 20 días: > 14 días de inactividad pero DESPUÉS de la primera solicitud expirada
    expect(evaluate(requests, ago(1))).toEqual({ eligible: false });
    expect(evaluate(requests, ago(31)).eligible).toBe(true);
    expect(evaluate(requests, ago(30)).eligible).toBe(true); // en la creación misma: no es «desde» (<=)
    expect(evaluate(requests, null).eligible).toBe(true);
  });

  it('[H-09] piso de 14 días continuos aunque cambien los TTL: con 12 días de solicitudes, 13 días de inactividad no cumplen y 14 sí', () => {
    const shortTtl = [request({ createdDaysAgo: 12, ttlDays: 3 }), request({ createdDaysAgo: 9, ttlDays: 3, action: 'CHANGE_PRINCIPAL' })];
    expect(evaluate(shortTtl, ago(13))).toEqual({ eligible: false });
    expect(evaluate(shortTtl, ago(14)).eligible).toBe(true);
    expect(evaluate(shortTtl, ago(15)).eligible).toBe(true);
  });

  it('[P-5][H-09] precedencia: aplica la condición MÁS ESTRICTA de «desde la más antigua» y «14 días continuos»', () => {
    const longChain = sequential(40); // la más antigua hace 40 días: manda «desde la más antigua»
    expect(evaluate(longChain, ago(30)).eligible).toBe(false); // cumple 14 días pero no «desde la más antigua»
    expect(evaluate(longChain, ago(40)).eligible).toBe(true);
    const shortChain = [request({ createdDaysAgo: 10, ttlDays: 2 }), request({ createdDaysAgo: 8, ttlDays: 2, action: 'TRANSFER_PRINCIPAL' })]; // la más antigua hace 10 días: manda el piso de 14
    expect(evaluate(shortChain, ago(11)).eligible).toBe(false); // posterior al piso de 14 días aunque anterior a la más antigua
    expect(evaluate(shortChain, ago(14)).eligible).toBe(true);
  });
});

describe('T1627 [REQ-CHP12-004] SLA en días hábiles', () => {
  it('suma días hábiles saltando sábado y domingo (sin festivos)', () => {
    expect(addBusinessDays('2026-11-27T10:00:00.000Z', 1)).toBe('2026-11-30T10:00:00.000Z'); // viernes -> lunes
    expect(addBusinessDays('2026-11-26T10:00:00.000Z', 15)).toBe('2026-12-17T10:00:00.000Z'); // jueves + 15 hábiles
    expect(addBusinessDays('2026-11-26T10:00:00.000Z', 0)).toBe('2026-11-26T10:00:00.000Z');
  });
});
