import { describe, expect, it } from 'vitest';
import {
  CO_OWNER_STATUSES,
  assertRoomForCoOwner,
  canApprove,
  chooseSuccessor,
  effectiveRequestStatus,
  evaluateOwnerRequest,
  initialRequestStatus,
  nextCoOwnerStatus,
  planLeave,
  requiresJointApproval,
  revalidateOwnerRequest,
  sealApproverSet,
  type CoOwnerEvent,
  type CoOwnerRow,
  type CoOwnerStatus,
  type OwnerRequestContext,
  type SealedOwnerRequest,
} from '../../src/domain/pet/co-ownership.ts';
import { MAX_CO_OWNERS_PER_PET } from '../../src/domain/platform/feature-012-limits.ts';

/**
 * T1614 (Feature 012, Bloque A, #22): pruebas ROJAS del dominio de co-propiedad `src/domain/pet/co-ownership.ts` (funciones puras, sin reloj ni I/O; `now` por parámetro).
 * Fallan hoy porque el módulo y `feature-012-limits.ts` no existen (T1616 los crea). La firma de las funciones es la API SUPUESTA por este archivo (el plan fija nombres, no firmas):
 * si T1616 necesita otra, se ajusta aquí con el mismo comportamiento. Los códigos `ERR-OWN12-*` se comparan como texto: el catálogo generado aún no los contiene (el compilador no acepta `--feature 012`).
 *
 * @implements REQ-OWN12-001, REQ-OWN12-003, REQ-OWN12-004, REQ-OWN12-006, INV-OWN12-001, INV-OWN12-002, INV-OWN12-003, INV-OWN12-007, STATE-COOWN12-001, STATE-OWNREQ12-001
 * Cubre SC-012-004..010, SC-012-071..075, SC-012-094, SC-012-103.
 */
const A = 'a0000000-0000-4000-8000-000000000001'; // principal
const B = 'a0000000-0000-4000-8000-000000000002';
const C = 'a0000000-0000-4000-8000-000000000003';
const D = 'a0000000-0000-4000-8000-000000000004';
const PET = 'b0000000-0000-4000-8000-0000000000c1';
const T0 = '2026-11-26T10:00:00.000Z';
const T_MID = '2026-11-29T10:00:00.000Z';
const T_EXP = '2026-12-03T10:00:00.000Z'; // expires_at sellado de las solicitudes de prueba
const T_AFTER = '2026-12-04T10:00:00.000Z';

// T1616: el dominio lanza el `DomainError` de la 012 (catálogo fusionado 004..012, `src/generated/v38`), clase distinta de la del catálogo raíz; se reconoce por forma, no por `instanceof`.
const isDomainError = (error: unknown): error is { code: string; status: number } => error instanceof Error && error.name === 'DomainError' && typeof (error as { code?: unknown }).code === 'string' && typeof (error as { status?: unknown }).status === 'number';
const codeOf = (action: () => unknown): [string, number] => {
  try {
    action();
  } catch (error) {
    if (isDomainError(error)) return [error.code, error.status];
    throw error;
  }
  throw new Error('no lanzó ningún DomainError');
};

const row = (id: string, userId: string | null, status: CoOwnerStatus, extra: Partial<CoOwnerRow> = {}): CoOwnerRow => ({
  id,
  petId: PET,
  userId,
  status,
  invitedByUserId: A,
  joinedAt: status === 'ACTIVE' || status === 'PROMOTED' ? '2026-01-01T00:00:00.000Z' : null,
  ...extra,
});

describe('T1614 [STATE-COOWN12-001] estados cerrados de co-propiedad', () => {
  it('el conjunto de estados es exactamente el de la máquina y nada fuera de él se acepta', () => {
    expect([...CO_OWNER_STATUSES].sort()).toEqual(['ACTIVE', 'CANCELLED', 'DECLINED', 'ENDED', 'EXPIRED', 'INVITED', 'LEFT', 'PROMOTED']);
  });

  const TABLE: ReadonlyArray<readonly [CoOwnerStatus | null, CoOwnerEvent, CoOwnerStatus]> = [
    [null, 'INVITE', 'INVITED'],
    ['INVITED', 'ACCEPT', 'ACTIVE'],
    ['INVITED', 'DECLINE', 'DECLINED'],
    ['INVITED', 'CANCEL', 'CANCELLED'],
    ['INVITED', 'EXPIRE', 'EXPIRED'],
    ['ACTIVE', 'LEAVE', 'LEFT'],
    ['ACTIVE', 'ERASE_ACCOUNT', 'LEFT'],
    ['ACTIVE', 'PROMOTE', 'PROMOTED'],
    ['ACTIVE', 'CHANGE_PRINCIPAL_EXECUTED', 'PROMOTED'],
    ['ACTIVE', 'END_CO_OWNERSHIP', 'ENDED'],
    [null, 'ADD_CO_OWNER', 'ACTIVE'],
    [null, 'DEMOTE_PRINCIPAL', 'ACTIVE'],
  ];
  it.each(TABLE)('%s --%s--> %s', (from, event, to) => {
    expect(nextCoOwnerStatus(from, event)).toBe(to);
  });

  it('cualquier otra combinación (estado × evento) es inválida (null) y los estados terminales no aceptan nada', () => {
    const events: CoOwnerEvent[] = ['INVITE', 'ACCEPT', 'DECLINE', 'CANCEL', 'EXPIRE', 'LEAVE', 'ERASE_ACCOUNT', 'PROMOTE', 'CHANGE_PRINCIPAL_EXECUTED', 'END_CO_OWNERSHIP', 'ADD_CO_OWNER', 'DEMOTE_PRINCIPAL'];
    const allowed = new Set(TABLE.map(([from, event]) => `${from}|${event}`));
    for (const from of [null, ...CO_OWNER_STATUSES]) {
      for (const event of events) {
        if (allowed.has(`${from}|${event}`)) continue;
        expect(nextCoOwnerStatus(from, event), `${from} + ${event}`).toBeNull();
      }
    }
  });
});

describe('T1614 [REQ-OWN12-003][SC-012-004] tope con pendientes incluidos', () => {
  it('MAX_CO_OWNERS_PER_PET es 3 (principal incluido)', () => {
    expect(MAX_CO_OWNERS_PER_PET).toBe(3);
  });

  it('con 0 o 1 plaza viva (ACTIVE o INVITED) todavía cabe otra persona', () => {
    expect(assertRoomForCoOwner([])).toBeUndefined();
    expect(assertRoomForCoOwner([row('r1', B, 'ACTIVE')])).toBeUndefined();
    expect(assertRoomForCoOwner([row('r1', B, 'INVITED')])).toBeUndefined();
  });

  it('con dos plazas vivas (principal + 2) se rechaza con ERR-OWN12-CO-OWNER-LIMIT 409, también si una es solo una invitación pendiente', () => {
    expect(codeOf(() => assertRoomForCoOwner([row('r1', B, 'ACTIVE'), row('r2', C, 'ACTIVE')]))).toEqual(['ERR-OWN12-CO-OWNER-LIMIT', 409]);
    expect(codeOf(() => assertRoomForCoOwner([row('r1', B, 'ACTIVE'), row('r2', C, 'INVITED')]))).toEqual(['ERR-OWN12-CO-OWNER-LIMIT', 409]);
    expect(codeOf(() => assertRoomForCoOwner([row('r1', B, 'INVITED'), row('r2', C, 'INVITED')]))).toEqual(['ERR-OWN12-CO-OWNER-LIMIT', 409]);
  });

  it('las filas terminales (DECLINED, CANCELLED, EXPIRED, LEFT, PROMOTED, ENDED) no ocupan plaza', () => {
    const terminals: CoOwnerStatus[] = ['DECLINED', 'CANCELLED', 'EXPIRED', 'LEFT', 'PROMOTED', 'ENDED'];
    const rows = terminals.map((status, index) => row(`t${index}`, D, status));
    expect(assertRoomForCoOwner([...rows, row('r1', B, 'ACTIVE')])).toBeUndefined();
  });
});

describe('T1614 [REQ-OWN12-004][INV-OWN12-001] quórum sellado', () => {
  const baseRequest = (over: Partial<SealedOwnerRequest> = {}): SealedOwnerRequest => ({
    id: 'q0000000-0000-4000-8000-000000000001',
    action: 'DELETE_PET',
    petId: PET,
    petVersion: 4,
    requesterUserId: A,
    targetUserId: null,
    approverSet: [B],
    approvals: [],
    status: 'PENDING',
    createdAt: T0,
    expiresAt: T_EXP,
    principalUserId: A,
    ...over,
  });
  const context = (over: Partial<OwnerRequestContext> = {}): OwnerRequestContext => ({
    petVersion: 4,
    principalUserId: A,
    currentOwners: [A, B],
    coOwnerRows: [row('r1', B, 'ACTIVE')],
    ...over,
  });

  it('sealApproverSet: todos los propietarios distintos del solicitante, sin duplicados y en orden estable; el solicitante nunca vota', () => {
    expect(sealApproverSet(A, [A, C, B, B])).toEqual([B, C]);
    expect(sealApproverSet(B, [A, B, C])).toEqual([A, C]);
  });

  it('con un único propietario no hay aprobadores: no se necesita aprobación (se ejecuta directo) y con conjunto vacío nunca se autoejecuta', () => {
    expect(requiresJointApproval(1)).toBe(false);
    expect(requiresJointApproval(2)).toBe(true);
    expect(requiresJointApproval(3)).toBe(true);
    expect(sealApproverSet(A, [A])).toEqual([]);
    expect(initialRequestStatus([])).toBe('EXPIRED');
    expect(initialRequestStatus([B])).toBe('PENDING');
  });

  it('canApprove: solo el aprobador del conjunto sellado, nunca el solicitante, un invitado ni un tercero, y solo mientras la solicitud sigue PENDING', () => {
    const request = baseRequest({ approverSet: [B, C] });
    expect(canApprove(request, B)).toBe(true);
    expect(canApprove(request, C)).toBe(true);
    expect(canApprove(request, A)).toBe(false);
    expect(canApprove(request, D)).toBe(false);
    expect(canApprove(baseRequest({ status: 'APPROVED' }), B)).toBe(false);
    expect(canApprove(baseRequest({ status: 'REJECTED' }), B)).toBe(false);
  });

  it('[SC-012-005] con dos propietarios, A solicita y la solicitud queda PENDING hasta que B aprueba: solo entonces se ejecuta', () => {
    const request = baseRequest();
    const done = evaluateOwnerRequest(request, { type: 'APPROVE', userId: B }, context(), T_MID);
    expect(done).toMatchObject({ status: 'APPROVED', execute: true, approvals: [{ u: B, at: T_MID }] });
  });

  it('con dos aprobadores, el primer voto deja PENDING sin ejecutar y el último ejecuta; el orden de los votos no importa', () => {
    const request = baseRequest({ approverSet: [B, C] });
    const ctx = context({ currentOwners: [A, B, C], coOwnerRows: [row('r1', B, 'ACTIVE'), row('r2', C, 'ACTIVE')] });
    const first = evaluateOwnerRequest(request, { type: 'APPROVE', userId: C }, ctx, T_MID);
    expect(first).toMatchObject({ status: 'PENDING', execute: false, approvals: [{ u: C, at: T_MID }] });
    const second = evaluateOwnerRequest({ ...request, approvals: first.approvals }, { type: 'APPROVE', userId: B }, ctx, T_MID);
    expect(second).toMatchObject({ status: 'APPROVED', execute: true });
    expect(second.approvals.map((a) => a.u).sort()).toEqual([B, C]);
  });

  it('[SC-012-006] un «no» explícito termina la solicitud en REJECTED sin ejecutar y deja rejectedBy', () => {
    const request = baseRequest({ approverSet: [B, C] });
    const ctx = context({ currentOwners: [A, B, C], coOwnerRows: [row('r1', B, 'ACTIVE'), row('r2', C, 'ACTIVE')] });
    expect(evaluateOwnerRequest(request, { type: 'REJECT', userId: C }, ctx, T_MID)).toMatchObject({ status: 'REJECTED', execute: false, rejectedBy: C });
  });

  it('[SC-012-006][SC-012-103] vencida sin respuesta queda EXPIRED (lectura perezosa) y no ejecuta nada; en la frontera exacta expires_at ya está vencida', () => {
    const request = baseRequest();
    expect(effectiveRequestStatus(request, T_MID)).toBe('PENDING');
    expect(effectiveRequestStatus(request, T_EXP)).toBe('EXPIRED');
    expect(effectiveRequestStatus(request, T_AFTER)).toBe('EXPIRED');
    expect(effectiveRequestStatus(baseRequest({ status: 'APPROVED' }), T_AFTER)).toBe('APPROVED');
  });

  it('[SC-012-103] el voto en la frontera exacta (now = expires_at) o después se rechaza con ERR-OWN12-APPROVAL-EXPIRED 409 y no ejecuta', () => {
    const request = baseRequest();
    expect(codeOf(() => evaluateOwnerRequest(request, { type: 'APPROVE', userId: B }, context(), T_EXP))).toEqual(['ERR-OWN12-APPROVAL-EXPIRED', 409]);
    expect(codeOf(() => evaluateOwnerRequest(request, { type: 'APPROVE', userId: B }, context(), T_AFTER))).toEqual(['ERR-OWN12-APPROVAL-EXPIRED', 409]);
    expect(evaluateOwnerRequest(request, { type: 'APPROVE', userId: B }, context(), '2026-12-03T09:59:59.999Z').status).toBe('APPROVED');
  });

  it('el solicitante no vota (403) y quien no es propietario recibe el 404 uniforme', () => {
    const request = baseRequest();
    expect(codeOf(() => evaluateOwnerRequest(request, { type: 'APPROVE', userId: A }, context(), T_MID))).toEqual(['ERR-ACC-FORBIDDEN', 403]);
    expect(codeOf(() => evaluateOwnerRequest(request, { type: 'APPROVE', userId: D }, context(), T_MID))).toEqual(['ERR-PET-NOT-FOUND', 404]);
  });

  it('[SC-012-073] si entra un nuevo co-propietario C antes de que B vote, la solicitud queda EXPIRED con ERR-OWN12-STALE y no ejecuta', () => {
    const ctx = context({ petVersion: 5, currentOwners: [A, B, C], coOwnerRows: [row('r1', B, 'ACTIVE'), row('r2', C, 'ACTIVE')] });
    expect(evaluateOwnerRequest(baseRequest(), { type: 'APPROVE', userId: B }, ctx, T_MID)).toMatchObject({ status: 'EXPIRED', execute: false, staleReason: 'ERR-OWN12-STALE' });
  });

  it('[SC-012-073] si B sale antes de votar, el conjunto de aprobadores quedaría vacío: la revalidación lo deja EXPIRED/STALE y NUNCA se autoejecuta; quien salió ya no puede votar (404)', () => {
    const ctx = context({ petVersion: 5, currentOwners: [A], coOwnerRows: [row('r1', B, 'LEFT')] });
    expect(revalidateOwnerRequest(baseRequest(), ctx, T_MID)).toEqual({ status: 'EXPIRED', execute: false, staleReason: 'ERR-OWN12-STALE' });
    expect(codeOf(() => evaluateOwnerRequest(baseRequest(), { type: 'APPROVE', userId: B }, ctx, T_MID))).toEqual(['ERR-PET-NOT-FOUND', 404]);
    expect(revalidateOwnerRequest(baseRequest(), context(), T_MID)).toEqual({ status: 'PENDING', execute: false });
  });

  it('[SC-012-010][SC-012-074] dos acciones críticas distintas aprobadas a la vez: la primera sube ownership_version y la segunda queda EXPIRED/STALE sin ejecutar', () => {
    const transfer = baseRequest({ id: 'q0000000-0000-4000-8000-000000000002', action: 'TRANSFER_PRINCIPAL', targetUserId: B, petVersion: 4, approverSet: [B] });
    const remove = baseRequest({ id: 'q0000000-0000-4000-8000-000000000003', action: 'DELETE_PET', petVersion: 4, approverSet: [B] });
    const first = evaluateOwnerRequest(transfer, { type: 'APPROVE', userId: B }, context({ petVersion: 4 }), T_MID);
    expect(first).toMatchObject({ status: 'APPROVED', execute: true });
    const second = evaluateOwnerRequest(remove, { type: 'APPROVE', userId: B }, context({ petVersion: 5 }), T_MID);
    expect(second).toMatchObject({ status: 'EXPIRED', execute: false, staleReason: 'ERR-OWN12-STALE' });
  });

  it('un cambio del principal entre la creación y el voto también deja la solicitud obsoleta', () => {
    const ctx = context({ principalUserId: B, currentOwners: [A, B] });
    expect(evaluateOwnerRequest(baseRequest(), { type: 'APPROVE', userId: B }, ctx, T_MID)).toMatchObject({ status: 'EXPIRED', execute: false, staleReason: 'ERR-OWN12-STALE' });
  });

  it('[REQ-OWN12-003][EDGE-012-035] INVITE_CO_OWNER aprobada con el tope ya alcanzado termina REJECTED con ERR-OWN12-CO-OWNER-LIMIT, nunca PENDING colgada', () => {
    const request = baseRequest({ action: 'INVITE_CO_OWNER', targetUserId: D, approverSet: [B] });
    const ctx = context({ coOwnerRows: [row('r1', B, 'ACTIVE'), row('r2', C, 'INVITED')], currentOwners: [A, B] });
    expect(evaluateOwnerRequest(request, { type: 'APPROVE', userId: B }, ctx, T_MID)).toMatchObject({ status: 'REJECTED', execute: false, errorCode: 'ERR-OWN12-CO-OWNER-LIMIT' });
  });

  it('los datos sellados son inmutables: evaluar un voto no modifica la solicitud original (action, target, pet_version, approver_set)', () => {
    const request = baseRequest({ action: 'TRANSFER_PRINCIPAL', targetUserId: B });
    const before = JSON.stringify(request);
    evaluateOwnerRequest(request, { type: 'APPROVE', userId: B }, context(), T_MID);
    expect(JSON.stringify(request)).toBe(before);
  });
});

describe('T1614 [REQ-OWN12-006][N2-R3] sucesión determinista del principal', () => {
  const rows = [
    row('r1', B, 'ACTIVE', { joinedAt: '2026-03-01T00:00:00.000Z' }),
    row('r2', C, 'ACTIVE', { joinedAt: '2026-02-01T00:00:00.000Z' }),
    row('r3', D, 'INVITED', { joinedAt: null }),
  ];

  it('[SC-012-071] sin designación hereda el ACTIVE de menor joined_at (la antigüedad se mide como co-propietario; un INVITED no cuenta)', () => {
    expect(chooseSuccessor({ leavingUserId: A, coOwners: rows })).toEqual({ successorUserId: C, successorRowId: 'r2', kind: 'AUTO', audit: 'PRINCIPAL_AUTO_PROMOTED' });
  });

  it('el empate de joined_at se rompe por user_id ascendente y no depende del orden de la lista', () => {
    const tied = [row('r1', C, 'ACTIVE', { joinedAt: '2026-02-01T00:00:00.000Z' }), row('r2', B, 'ACTIVE', { joinedAt: '2026-02-01T00:00:00.000Z' })];
    expect(chooseSuccessor({ leavingUserId: A, coOwners: tied })?.successorUserId).toBe(B);
    expect(chooseSuccessor({ leavingUserId: A, coOwners: [...tied].reverse() })?.successorUserId).toBe(B);
  });

  it('[SC-012-094] una designación válida (co-propietario ACTIVE distinto de quien sale) prevalece y se audita PRINCIPAL_SUCCESSOR_DESIGNATED', () => {
    expect(chooseSuccessor({ leavingUserId: A, coOwners: rows, designatedUserId: B })).toEqual({ successorUserId: B, successorRowId: 'r1', kind: 'DESIGNATED', audit: 'PRINCIPAL_SUCCESSOR_DESIGNATED' });
  });

  it('[SC-012-094] designación de inexistente, no miembro de esa mascota, uno mismo, INVITED o co-propietario cuya fila ya no está ACTIVE: se descarta y hereda el de menor joined_at', () => {
    const expired = [...rows, row('r4', 'a0000000-0000-4000-8000-000000000009', 'EXPIRED')];
    const none = chooseSuccessor({ leavingUserId: A, coOwners: expired });
    for (const designatedUserId of ['a0000000-0000-4000-8000-0000000000ff', 'a0000000-0000-4000-8000-0000000000ee', A, D, 'a0000000-0000-4000-8000-000000000009']) {
      const result = chooseSuccessor({ leavingUserId: A, coOwners: expired, designatedUserId });
      expect(result, designatedUserId).toEqual(none);
      expect(result?.audit).toBe('PRINCIPAL_AUTO_PROMOTED');
    }
  });

  it('la supresión de cuenta no admite designación: se ignora y hereda el de menor joined_at', () => {
    expect(chooseSuccessor({ leavingUserId: A, coOwners: rows, designatedUserId: B, accountDeletion: true })).toEqual({ successorUserId: C, successorRowId: 'r2', kind: 'AUTO', audit: 'PRINCIPAL_AUTO_PROMOTED' });
  });

  it('[SC-012-072] sin co-propietarios ACTIVE (solo INVITED, LEFT, etc.) no hay sucesor', () => {
    expect(chooseSuccessor({ leavingUserId: A, coOwners: [row('r1', B, 'INVITED'), row('r2', C, 'LEFT')] })).toBeNull();
    expect(chooseSuccessor({ leavingUserId: A, coOwners: [] })).toBeNull();
  });

  it('una fila ACTIVE con user_id nulo (cuenta ya suprimida) nunca es sucesora', () => {
    expect(chooseSuccessor({ leavingUserId: A, coOwners: [row('r1', null, 'ACTIVE', { joinedAt: '2026-01-01T00:00:00.000Z' }), row('r2', B, 'ACTIVE', { joinedAt: '2026-05-01T00:00:00.000Z' })] })?.successorUserId).toBe(B);
  });
});

describe('T1614 [REQ-OWN12-006][INV-OWN12-003][INV-OWN12-007] salida (LEAVE) sin aprobación y «último dueño»', () => {
  const leave = (over: Record<string, unknown> = {}) => planLeave({ petId: PET, principalUserId: A, leavingUserId: A, coOwners: [row('r1', B, 'ACTIVE', { joinedAt: '2026-03-01T00:00:00.000Z' }), row('r2', C, 'ACTIVE', { joinedAt: '2026-02-01T00:00:00.000Z' })], ...over });

  it('[SC-012-071] el principal con co-propietarios ACTIVE sale sin aprobación: el sucesor pasa a PROMOTED, ownership_version sube en 1 y la respuesta devuelve el principal resultante', () => {
    expect(leave()).toEqual({ outcome: 'PRINCIPAL_SUCCEEDED', resultingPrincipalUserId: C, successorRowId: 'r2', kind: 'AUTO', audit: 'PRINCIPAL_AUTO_PROMOTED', ownershipVersionIncrement: 1, cancelInvitedRowIds: [] });
  });

  it('[SC-012-094] designación válida: PRINCIPAL_SUCCESSOR_DESIGNATED y kind DESIGNATED', () => {
    expect(leave({ designatedUserId: B })).toMatchObject({ outcome: 'PRINCIPAL_SUCCEEDED', resultingPrincipalUserId: B, kind: 'DESIGNATED', audit: 'PRINCIPAL_SUCCESSOR_DESIGNATED' });
  });

  it('[SC-012-094] las cuatro designaciones inválidas devuelven una respuesta IDÉNTICA entre sí y a la salida sin designar; ninguna audita PRINCIPAL_SUCCESSOR_DESIGNATED ni revela el motivo', () => {
    const baseline = leave();
    for (const designatedUserId of ['a0000000-0000-4000-8000-0000000000ff', D, A, 'a0000000-0000-4000-8000-000000000009']) {
      const result = leave({ designatedUserId, coOwners: [row('r1', B, 'ACTIVE', { joinedAt: '2026-03-01T00:00:00.000Z' }), row('r2', C, 'ACTIVE', { joinedAt: '2026-02-01T00:00:00.000Z' }), row('r9', 'a0000000-0000-4000-8000-000000000009', 'EXPIRED')] });
      expect(result, designatedUserId).toEqual(baseline);
      expect(JSON.stringify(result)).not.toMatch(/DESIGNATED|invalid|inv[aá]lid|descart/i);
    }
  });

  it('las invitaciones INVITED que emitió el principal se cancelan en la misma operación (CANCELLED)', () => {
    const result = leave({ coOwners: [row('r1', B, 'ACTIVE'), row('r3', D, 'INVITED', { invitedByUserId: A })] });
    expect(result).toMatchObject({ outcome: 'PRINCIPAL_SUCCEEDED', cancelInvitedRowIds: ['r3'] });
  });

  it('[SC-012-008] un co-propietario ACTIVE sale (LEFT) sin aprobación: no hay sucesión, el principal no cambia, sube ownership_version y se cancelan sus invitaciones emitidas', () => {
    const result = planLeave({ petId: PET, principalUserId: A, leavingUserId: B, coOwners: [row('r1', B, 'ACTIVE'), row('r2', C, 'ACTIVE'), row('r3', D, 'INVITED', { invitedByUserId: B })] });
    expect(result).toEqual({ outcome: 'CO_OWNER_LEFT', leavingRowId: 'r1', resultingPrincipalUserId: A, ownershipVersionIncrement: 1, cancelInvitedRowIds: ['r3'] });
  });

  it('[SC-012-009] el último propietario no puede salir: ERR-OWN12-LAST-OWNER 409 (la mascota no queda sin propietario); con solo INVITED o LEFT también', () => {
    expect(codeOf(() => planLeave({ petId: PET, principalUserId: A, leavingUserId: A, coOwners: [] }))).toEqual(['ERR-OWN12-LAST-OWNER', 409]);
    expect(codeOf(() => planLeave({ petId: PET, principalUserId: A, leavingUserId: A, coOwners: [row('r1', B, 'INVITED'), row('r2', C, 'LEFT')] }))).toEqual(['ERR-OWN12-LAST-OWNER', 409]);
  });

  it('[SC-012-072] la supresión de cuenta del único propietario no se bloquea: aplica REQ-PET-004 (PET_DELETED) y cancela las invitaciones', () => {
    expect(planLeave({ petId: PET, principalUserId: A, leavingUserId: A, accountDeletion: true, coOwners: [row('r1', B, 'INVITED'), row('r2', C, 'LEFT')] })).toEqual({ outcome: 'PET_DELETED', cancelInvitedRowIds: ['r1'] });
  });

  it('la supresión de cuenta del principal con co-propietario ACTIVE hereda por antigüedad aunque se pase una designación', () => {
    expect(leave({ accountDeletion: true, designatedUserId: B })).toMatchObject({ outcome: 'PRINCIPAL_SUCCEEDED', resultingPrincipalUserId: C, kind: 'AUTO', audit: 'PRINCIPAL_AUTO_PROMOTED' });
  });

  it('una designación enviada por quien NO es principal se descarta sin error ni efecto', () => {
    const coOwners = [row('r1', B, 'ACTIVE'), row('r2', C, 'ACTIVE')];
    expect(planLeave({ petId: PET, principalUserId: A, leavingUserId: B, designatedUserId: C, coOwners })).toEqual(planLeave({ petId: PET, principalUserId: A, leavingUserId: B, coOwners }));
  });

  it('quien no es propietario (sin fila ACTIVE) recibe el 404 uniforme', () => {
    expect(codeOf(() => planLeave({ petId: PET, principalUserId: A, leavingUserId: D, coOwners: [row('r1', B, 'ACTIVE'), row('r3', D, 'INVITED')] }))).toEqual(['ERR-PET-NOT-FOUND', 404]);
  });

  it('[INV-OWN12-007] la salida nunca se bloquea por la inacción de otro: con un co-propietario ACTIVE el principal siempre sale', () => {
    expect(planLeave({ petId: PET, principalUserId: A, leavingUserId: A, coOwners: [row('r1', B, 'ACTIVE')] })).toMatchObject({ outcome: 'PRINCIPAL_SUCCEEDED', resultingPrincipalUserId: B });
  });
});
