/**
 * Casos de uso de la aprobacion de registros desde el portal de administracion (Feature 009, Fase 4, #18; T1247; REQ-APR9-003, REQ-APR9-005; STATE-ACCT9-001).
 * - Decision atomica `PENDING -> ACTIVE | REJECTED`: UN `UPDATE ... WHERE account_status = 'PENDING'` (`registrations.decide`) con el numero de filas afectadas como veredicto. No hay lectura previa
 *   que decida: con dos administradores a la vez (o contra la purga) gana exactamente uno y el otro recibe `ERR-ADMIN-REGISTRATION-NOT-FOUND`, que no distingue inexistente, purgada, ya
 *   decidida ni de mas de 30 dias (EDGE-009-002, EDGE-009-003, EDGE-009-039). El estado destino sale de la maquina cerrada (`nextAccountStatus`).
 * - Al RECHAZAR se revocan todas las sesiones de la cuenta en la misma transaccion (defensa en profundidad: una `PENDING` no tiene sesiones, EDGE-009-038).
 * - Auditoria propia (`admin_audit_entries`): solo id de administrador, accion y marca de tiempo; nunca correo, `sub`, username ni identificador de la cuenta (NFR-009-004). Una decision perdida no audita.
 * - Lista paginada por cursor opaco (orden fijo `requestedAt` ascendente y `registrationId`) y contador, ambos sobre las `PENDING` de menos de 30 dias; son lecturas (no auditan).
 * La sesion de administracion la resuelve quien llama (`AuthenticateAdminUseCase`); aqui solo llega el `adminId` ya autenticado.
 *
 * @implements REQ-APR9-003, REQ-APR9-005, REQ-ADM9-004, EDGE-009-002, EDGE-009-003, EDGE-009-039, EDGE-009-040, NFR-009-004, STATE-ACCT9-001, ERR-ADMIN-REGISTRATION-NOT-FOUND, INV-ARCH-001, INV-ARCH-002
 */

import type { PendingRegistrationPosition, RegistrationMethod } from '../ports/admin.port.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { nextAccountStatus, type AccountStatusEvent } from '../../domain/account/account-status.ts';
import { DomainError } from '../../generated/v35/index.ts';
import { ADMIN_AUDIT_ACTIONS } from './admin-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

/** Ventana de la solicitud pendiente (REQ-APR9-007): mas antigua que esto ya no se lista ni se decide. */
const PENDING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const invalid = (field: string, detail: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);

/** Corte de 30 dias contado hacia atras desde el instante del reloj: una `PENDING` creada despues de este instante sigue vigente. */
const windowStart = (now: string): string => addMillis(now, -PENDING_WINDOW_MS);

export interface RegistrationView {
  readonly registrationId: string;
  readonly username: string;
  readonly requestedAt: string;
  readonly method: RegistrationMethod;
}
export interface RegistrationPage {
  readonly items: readonly RegistrationView[];
  readonly nextCursor: string | null;
}
export interface RegistrationDecisionView {
  readonly registrationId: string;
  readonly accountStatus: 'ACTIVE' | 'REJECTED';
  readonly decidedAt: string;
}

const encodeCursor = (position: PendingRegistrationPosition): string => Buffer.from(`${position.requestedAt}|${position.registrationId}`, 'utf8').toString('base64url');

function decodeCursor(cursor: string): PendingRegistrationPosition {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const [requestedAt, registrationId, ...rest] = decoded.split('|');
  if (rest.length > 0 || requestedAt === undefined || registrationId === undefined || !ISO_INSTANT.test(requestedAt) || !UUID.test(registrationId) || encodeCursor({ requestedAt, registrationId }) !== cursor) {
    throw invalid('cursor', 'El cursor de paginacion no es valido.');
  }
  return { requestedAt, registrationId };
}

/** @implements REQ-APR9-005, EDGE-009-039 */
export class ListPendingRegistrationsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `limit` y `cursor` llegan tal como los envio el cliente (cadenas o ausentes); un valor fuera del contrato es `ERR-SCHEMA-VALIDATION-FAILED`. */
  async execute(input: { readonly limit?: unknown; readonly cursor?: unknown }): Promise<RegistrationPage> {
    const limit = parseLimit(input.limit);
    const after = input.cursor === undefined ? null : decodeCursor(parseCursor(input.cursor));
    const createdAfter = windowStart(this.deps.clock.nowIsoTimestamp());
    const rows = await this.deps.uow.runInTransaction((repositories) => repositories.registrations.listPending(createdAfter, limit + 1, after));
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const items = page.map(({ registrationId, username, requestedAt, method }) => ({ registrationId, username, requestedAt, method }));
    return { items, nextCursor: rows.length > limit && last !== undefined ? encodeCursor({ requestedAt: last.requestedAt, registrationId: last.registrationId }) : null };
  }
}

function parseLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) throw invalid('limit', 'limit debe ser un entero entre 1 y 50.');
  const limit = Number(value);
  if (limit < 1 || limit > MAX_PAGE_SIZE) throw invalid('limit', 'limit debe ser un entero entre 1 y 50.');
  return limit;
}

function parseCursor(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid('cursor', 'El cursor de paginacion no es valido.');
  return value;
}

/** @implements REQ-APR9-005, EDGE-009-040 */
export class CountPendingRegistrationsUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Cuantas solicitudes `PENDING` siguen vigentes (menos de 30 dias): el mismo universo que la lista, para que el contador y la lista coincidan. */
  async execute(): Promise<number> {
    const createdAfter = windowStart(this.deps.clock.nowIsoTimestamp());
    return this.deps.uow.runInTransaction((repositories) => repositories.registrations.countPending(createdAfter));
  }
}

/** @implements REQ-APR9-003, REQ-APR9-005, REQ-ADM9-004, EDGE-009-002, EDGE-009-003, EDGE-009-039 */
export class DecideRegistrationUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(input: { readonly adminId: string; readonly registrationId: string; readonly event: AccountStatusEvent }): Promise<RegistrationDecisionView> {
    if (!UUID.test(input.registrationId)) throw invalid('registrationId', 'registrationId debe ser un identificador valido.');
    const target = nextAccountStatus('PENDING', input.event);
    if (target !== 'ACTIVE' && target !== 'REJECTED') throw new DomainError('ERR-INTERNAL-UNEXPECTED');
    const now = this.deps.clock.nowIsoTimestamp();
    const createdAfter = windowStart(now);
    const decided = await this.deps.uow.runInTransaction(async (repositories) => {
      if (!(await repositories.registrations.decide(input.registrationId, target, input.adminId, now, createdAfter))) return false;
      // Un rechazo revoca todas las sesiones de la cuenta (no hay sesion que conservar: la cadena vacia no coincide con ningun hash).
      if (target === 'REJECTED') await repositories.sessions.revokeOthersByTokenHash(input.registrationId, '', now);
      const action = target === 'ACTIVE' ? ADMIN_AUDIT_ACTIONS.registrationApprove : ADMIN_AUDIT_ACTIONS.registrationReject;
      await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: input.adminId, action, objectRef: null, occurredAt: now });
      return true;
    });
    if (!decided) throw new DomainError('ERR-ADMIN-REGISTRATION-NOT-FOUND');
    return { registrationId: input.registrationId, accountStatus: target, decidedAt: now };
  }
}
