/**
 * Casos de uso de la gestión de administradores delegados (feature 011, Bloque D, #63; REQ-ADM11-001, REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-007; STATE-ADM11-001;
 * contrato `admin.openapi.yaml` 1.8.0).
 * - Un ÚNICO servicio (`AdminDelegateService`) aplica toda transición que cambia a un delegado existente (cambio de rol, desactivar o cancelar la invitación, reactivar, re-invitar) y el alta,
 *   con el mismo orden: existencia -> autoafectación -> concesión (H-6) -> raíz protegida -> estado -> precondición (If-Match) -> tope -> guarda del último SUPER_ADMIN. Las reglas son puras
 *   (`domain/admin/delegate-rules.ts`); aquí se cargan los hechos bajo la transacción serializada (H-2a: `lockForGuard`, `SELECT ... FOR UPDATE` en PostgreSQL; `BEGIN IMMEDIATE` en SQLite).
 * - El rol del actor se lee de la base DENTRO de la transacción de escritura (EDGE-011-015); la capa HTTP ya lo comprobó antes de leer el cuerpo (H-7).
 * - Alta uniforme (H-4): el tope se evalúa ANTES de resolver el correo; un duplicado, el correo raíz o el de un usuario existente no se distinguen (202); no se consulta `users` ni se devuelve `adminId`.
 * - Auditoría con siete acciones cerradas: autor = `admin_id` actuante, objeto = `admin_id` del delegado; nunca el correo ni el `sub` (H-9). Los errores no repiten el correo.
 * - Sin «eliminar» (H-9): la baja es solo `DISABLED`.
 *
 * @implements REQ-ADM11-001, REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-007, STATE-ADM11-001, INV-ADM11-001, EDGE-011-001, EDGE-011-002, EDGE-011-009, EDGE-011-010, EDGE-011-011, EDGE-011-015
 */

import { sha256Hex } from '../../domain/audit/sha256.ts';
import { fromEpochMillis, toEpochMillis } from '../../domain/auth/utc-timestamp.ts';
import {
  checkGrant,
  checkLastSuperAdmin,
  checkPrecondition,
  checkRootProtection,
  checkSlot,
  checkTargetAccess,
  checkTransition,
  isRootEmail,
  normalizeDelegateEmail,
  removesSuperAdmin,
  toDelegate,
  type Delegate,
  type DelegateAction,
  type Verdict,
} from '../../domain/admin/delegate-rules.ts';
import { SUPER_ADMIN, type PlatformRole } from '../../domain/admin/platform-role.ts';
import {
  DomainError,
  validateAdminId,
  validateChangeAdminDelegateRoleInput,
  validateInviteAdminDelegateInput,
  validateReactivateAdminDelegateInput,
  type AdminDelegateView,
  type AdminDelegatePage,
} from '../../generated/v37/index.ts';
import type { AdminDelegateRecord } from '../ports/admin.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { resolveAdminAccess, type AdminAccess } from './admin-access.ts';
import { assertMatchesSchema, type ApplicationDeps } from './use-case-support.ts';

/** Cifras de `app-config.ts` (INV-ARCH-006) que la composición inyecta; esta capa no lee la configuración. */
export interface AdminDelegateLimits {
  readonly activeLimit: number;
  readonly invitationTtlHours: number;
  readonly rowLimit: number;
}

/** Acciones de auditoría de la 011 (lista cerrada del contrato; la columna `admin_audit_entries.action` no cambia, MIF-011-01). */
export const ADMIN_DELEGATE_AUDIT_ACTIONS = {
  invited: 'ADMIN_DELEGATE_INVITED',
  reinvited: 'ADMIN_DELEGATE_REINVITED',
  anchored: 'ADMIN_DELEGATE_ANCHORED',
  roleChanged: 'ADMIN_DELEGATE_ROLE_CHANGED',
  disabled: 'ADMIN_DELEGATE_DISABLED',
  invitationCancelled: 'ADMIN_DELEGATE_INVITATION_CANCELLED',
  reactivated: 'ADMIN_DELEGATE_REACTIVATED',
} as const;

const IF_MATCH = /^"[A-Za-z0-9_-]{8,64}"$/;
const HOUR_MS = 3_600_000;
const invalid = (field: string, detail: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);

function ensure(verdict: Verdict): void {
  if (!verdict.ok) throw new DomainError(verdict.code);
}

/** Etag opaco del estado vigente del delegado: cambia con cualquier escritura (rol, estado, ancla, fechas); sin el correo ni el `sub`. */
export function delegateEtag(row: AdminDelegateRecord): string {
  const digest = sha256Hex([row.adminId, row.role, row.status, row.providerSubject === null ? '-' : '+', row.invitedAt ?? '-', row.invitedExpiresAt ?? '-', row.anchoredAt ?? '-', row.disabledAt ?? '-', row.updatedAt].join('\n'));
  return `"${digest.slice(0, 32)}"`;
}

function viewOf(delegate: Delegate, row: AdminDelegateRecord): AdminDelegateView {
  return {
    adminId: delegate.adminId,
    email: delegate.email,
    role: delegate.role,
    status: delegate.status,
    isAnchored: delegate.providerSubject !== null,
    invitedAt: delegate.invitedAt,
    invitedExpiresAt: delegate.invitedExpiresAt,
    anchoredAt: delegate.anchoredAt,
    disabledAt: delegate.disabledAt,
    createdAt: delegate.createdAt,
    updatedAt: delegate.updatedAt,
    etag: delegateEtag(row),
  } as AdminDelegateView;
}

function interpreted(row: AdminDelegateRecord): AdminDelegateView {
  const delegate = toDelegate(row);
  // Una fila con rol o estado desconocido no se puede devolver con un tipo cerrado: falla cerrada.
  if (delegate === null) throw new DomainError('ERR-INTERNAL-UNEXPECTED');
  return viewOf(delegate, row);
}

function adminIdOf(value: unknown): string {
  if (typeof value !== 'string' || !validateAdminId(value)) throw invalid('adminId', 'adminId debe ser un UUID.');
  return value;
}

function ifMatchOf(value: unknown): string {
  if (typeof value !== 'string' || !IF_MATCH.test(value)) throw invalid('If-Match', 'If-Match debe ser el etag vigente del delegado.');
  return value;
}

/** Rol del actor releído de la base dentro de la transacción de escritura (EDGE-011-015); solo SUPER_ADMIN gestiona delegados. */
async function requireSuperAdmin(repositories: RepositorySet, rootEmails: readonly string[], adminId: string): Promise<AdminAccess> {
  const access = await resolveAdminAccess(repositories, rootEmails, adminId);
  if (access === null || access.role !== SUPER_ADMIN) throw new DomainError('ERR-ADM11-ROLE-NOT-AUTHORIZED');
  return access;
}

function rootEmailsOf(deps: ApplicationDeps): readonly string[] {
  if (deps.admin === undefined) throw new DomainError('ERR-INTERNAL-UNEXPECTED');
  return deps.admin.allowedEmails;
}

/** Instante `now + horas` con el reloj inyectado y aritmética pura sobre timestamps canónicos (sin leer el reloj del sistema, INV-ARCH-001). */
const afterHours = (now: string, hours: number): string => fromEpochMillis(toEpochMillis(now) + hours * HOUR_MS);

async function audit(deps: ApplicationDeps, repositories: RepositorySet, actorAdminId: string, action: string, objectRef: string, now: string): Promise<void> {
  await repositories.adminAudit.insert({ id: deps.ids.nextId(), adminId: actorAdminId, action, objectRef, occurredAt: now });
}

interface TransitionInput {
  readonly action: DelegateAction;
  readonly actorAdminId: string;
  readonly adminId: string;
  readonly ifMatch: string;
  /** Rol que se asigna (cambio de rol y reactivación); `null` en desactivar y re-invitar. */
  readonly requestedRole: PlatformRole | null;
}

/**
 * Servicio de dominio ÚNICO de las transiciones sobre un delegado existente y del alta (H-2a). Toda escritura de la tabla `admin_delegates` salvo el anclaje del primer acceso pasa por aquí,
 * dentro de la transacción serializada, con la guarda del último SUPER_ADMIN y los topes evaluados sobre los mismos hechos que la escritura.
 */
export class AdminDelegateService {
  constructor(
    private readonly deps: ApplicationDeps,
    private readonly limits: AdminDelegateLimits,
  ) {}

  /** Alta: devuelve siempre sin distinguir qué ocurrió (H-4); solo el tope y la concesión rechazan. */
  async invite(repositories: RepositorySet, actorAdminId: string, email: string, role: PlatformRole, now: string): Promise<void> {
    const rootEmails = rootEmailsOf(this.deps);
    const actor = await requireSuperAdmin(repositories, rootEmails, actorAdminId);
    await repositories.adminDelegates.lockForGuard();
    // El tope se evalúa ANTES de resolver el correo (DERIVADA (h)): no depende de él.
    ensure(checkSlot({ occupiedByOthers: await repositories.adminDelegates.countOccupied(now, null), totalRows: await repositories.adminDelegates.countRows(), ...this.limitFacts() }, true));
    ensure(checkGrant(actor, null, role));
    if (isRootEmail(email, rootEmails)) return;
    if ((await repositories.adminDelegates.findLiveByEmail(email)) !== null) return;
    const adminId = this.deps.ids.nextId();
    const created = await repositories.adminDelegates.insert({
      adminId,
      email,
      role,
      status: 'INVITED',
      provider: null,
      providerSubject: null,
      invitedAt: now,
      invitedExpiresAt: afterHours(now, this.limits.invitationTtlHours),
      anchoredAt: null,
      disabledAt: null,
      createdByAdminId: actor.adminId,
      createdAt: now,
      updatedAt: now,
    });
    if (created) await audit(this.deps, repositories, actor.adminId, ADMIN_DELEGATE_AUDIT_ACTIONS.invited, adminId, now);
  }

  async transition(repositories: RepositorySet, input: TransitionInput, now: string): Promise<AdminDelegateView> {
    const rootEmails = rootEmailsOf(this.deps);
    const actor = await requireSuperAdmin(repositories, rootEmails, input.actorAdminId);
    await repositories.adminDelegates.lockForGuard();
    const row = await repositories.adminDelegates.findById(input.adminId);
    if (row === null) throw new DomainError('ERR-ADM11-DELEGATE-NOT-FOUND');
    const target = toDelegate(row);
    // Una fila con rol o estado desconocido no admite ninguna transición.
    if (target === null) throw new DomainError('ERR-ADM11-INVALID-TRANSITION');
    ensure(checkTargetAccess(actor, target, input.requestedRole));
    ensure(checkRootProtection(input.action, target, rootEmails));
    ensure(checkTransition(input.action, target));
    ensure(checkPrecondition(input.ifMatch, delegateEtag(row)));
    const takesSlot = input.action === 'REACTIVATE' || input.action === 'REINVITE';
    if (takesSlot) {
      // Reactivar con el correo ya vivo en otra fila (EDGE-011-019) no es una transición válida (el índice único parcial lo rechazaría).
      const live = input.action === 'REACTIVATE' ? await repositories.adminDelegates.findLiveByEmail(target.email) : null;
      if (live !== null && live.adminId !== target.adminId) throw new DomainError('ERR-ADM11-INVALID-TRANSITION');
      ensure(checkSlot({ occupiedByOthers: await repositories.adminDelegates.countOccupied(now, target.adminId), totalRows: 0, ...this.limitFacts() }, false));
    }
    if (removesSuperAdmin(input.action, target, input.requestedRole)) {
      ensure(checkLastSuperAdmin(rootEmails, await repositories.adminDelegates.countActiveSuperAdmins(rootEmails, target.adminId)));
    }
    const next = this.nextRecord(input, row, target, now);
    if (!(await repositories.adminDelegates.replace(next, row))) {
      // `replace` devuelve `false` por dos causas: otra escritura cambió la fila (412) o el índice único parcial por correo vivo rechazó la escritura con la fila intacta (409, EDGE-011-019).
      const now2 = await repositories.adminDelegates.findById(input.adminId);
      const unchanged = now2 !== null && now2.status === row.status && now2.role === row.role && now2.updatedAt === row.updatedAt && now2.providerSubject === row.providerSubject;
      throw new DomainError(unchanged ? 'ERR-ADM11-INVALID-TRANSITION' : 'ERR-ADM11-PRECONDITION-FAILED');
    }
    // Desactivar un ACTIVE revoca de inmediato todas sus sesiones, en la misma transacción (REQ-ADM11-004).
    if (input.action === 'DISABLE' && target.status === 'ACTIVE') await repositories.adminSessions.deleteByAdminId(target.adminId);
    await audit(this.deps, repositories, actor.adminId, this.auditAction(input.action, target), target.adminId, now);
    return interpreted(next);
  }

  private limitFacts(): { readonly activeLimit: number; readonly rowLimit: number } {
    return { activeLimit: this.limits.activeLimit, rowLimit: this.limits.rowLimit };
  }

  private auditAction(action: DelegateAction, target: Delegate): string {
    switch (action) {
      case 'CHANGE_ROLE':
        return ADMIN_DELEGATE_AUDIT_ACTIONS.roleChanged;
      case 'DISABLE':
        return target.status === 'INVITED' ? ADMIN_DELEGATE_AUDIT_ACTIONS.invitationCancelled : ADMIN_DELEGATE_AUDIT_ACTIONS.disabled;
      case 'REACTIVATE':
        return ADMIN_DELEGATE_AUDIT_ACTIONS.reactivated;
      case 'REINVITE':
        return ADMIN_DELEGATE_AUDIT_ACTIONS.reinvited;
    }
  }

  private nextRecord(input: TransitionInput, row: AdminDelegateRecord, target: Delegate, now: string): AdminDelegateRecord {
    const role = input.requestedRole ?? target.role;
    switch (input.action) {
      case 'CHANGE_ROLE':
        return { ...row, role, updatedAt: now };
      case 'DISABLE':
        return { ...row, status: 'DISABLED', disabledAt: now, invitedExpiresAt: null, updatedAt: now };
      case 'REACTIVATE':
        return { ...row, role, status: 'ACTIVE', disabledAt: null, invitedExpiresAt: null, updatedAt: now };
      case 'REINVITE':
        return { ...row, status: 'INVITED', invitedAt: now, invitedExpiresAt: afterHours(now, this.limits.invitationTtlHours), disabledAt: null, updatedAt: now };
    }
  }
}

/** @implements REQ-ADM11-001, REQ-ADM11-005 */
export class ListAdminDelegatesUseCase {
  constructor(
    private readonly deps: ApplicationDeps,
    private readonly limits: AdminDelegateLimits,
  ) {}

  /** Todas las filas (a lo sumo `rowLimit`), incluidas `DISABLED` y las `INVITED` caducadas, y el conteo que consume el tope. Lectura: no audita. */
  async execute(input: { readonly actorAdminId: string }): Promise<AdminDelegatePage> {
    const now = this.deps.clock.nowIsoTimestamp();
    const rootEmails = rootEmailsOf(this.deps);
    return this.deps.uow.runInTransaction(async (repositories) => {
      // D-4 (defensa en profundidad): rol efectivo releído de la base; un SUPER_ADMIN delegado no ve a otros SUPER_ADMIN ni a la raíz.
      const actor = await requireSuperAdmin(repositories, rootEmails, input.actorAdminId);
      const rows = await repositories.adminDelegates.list(this.limits.rowLimit);
      const items: AdminDelegateView[] = [];
      for (const row of rows) {
        const delegate = toDelegate(row);
        // Una fila ilegible (rol o estado desconocidos) no tiene acceso y no se puede mostrar con un tipo cerrado.
        if (delegate === null) continue;
        if (!actor.isRoot && (delegate.role === SUPER_ADMIN || isRootEmail(delegate.email, rootEmails))) continue;
        items.push(viewOf(delegate, row));
      }
      return { items, activeCount: await repositories.adminDelegates.countOccupied(now, null), activeLimit: this.limits.activeLimit };
    });
  }
}

/** @implements REQ-ADM11-001, REQ-ADM11-005, REQ-ADM11-007, EDGE-011-001, EDGE-011-009, EDGE-011-010 */
export class InviteAdminDelegateUseCase {
  private readonly service: AdminDelegateService;
  constructor(
    private readonly deps: ApplicationDeps,
    limits: AdminDelegateLimits,
  ) {
    this.service = new AdminDelegateService(deps, limits);
  }

  /** `body` llega tal como lo envió el cliente. Orden: confirmación del correo (422) -> esquema (422) -> tope (409) -> concesión (403) -> efecto uniforme. */
  async execute(input: { readonly actorAdminId: string; readonly body: unknown }): Promise<void> {
    const normalized = normalizedInviteBody(input.body);
    const { email, role } = assertMatchesSchema<{ email: string; emailConfirmation: string; role: PlatformRole }>('InviteAdminDelegateInput', validateInviteAdminDelegateInput, normalized);
    const now = this.deps.clock.nowIsoTimestamp();
    await this.deps.uow.runInTransaction((repositories) => this.service.invite(repositories, input.actorAdminId, normalizeDelegateEmail(email), role, now));
  }
}

/** Normaliza los dos correos del cuerpo y exige que coincidan (H-1); el error no repite ninguno de los dos. */
function normalizedInviteBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  const { email, emailConfirmation, ...rest } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof emailConfirmation !== 'string') return body;
  const first = normalizeDelegateEmail(email);
  const second = normalizeDelegateEmail(emailConfirmation);
  if (first !== second) throw new DomainError('ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH', undefined, 'emailConfirmation');
  return { ...rest, email: first, emailConfirmation: second };
}

/** @implements REQ-ADM11-003, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-007, EDGE-011-002, EDGE-011-011, EDGE-011-015 */
export class ChangeAdminDelegateRoleUseCase {
  private readonly service: AdminDelegateService;
  constructor(
    private readonly deps: ApplicationDeps,
    limits: AdminDelegateLimits,
  ) {
    this.service = new AdminDelegateService(deps, limits);
  }

  async execute(input: { readonly actorAdminId: string; readonly adminId: unknown; readonly ifMatch: unknown; readonly body: unknown }): Promise<AdminDelegateView> {
    const adminId = adminIdOf(input.adminId);
    const ifMatch = ifMatchOf(input.ifMatch);
    const { role } = assertMatchesSchema<{ role: PlatformRole }>('ChangeAdminDelegateRoleInput', validateChangeAdminDelegateRoleInput, input.body);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction((repositories) => this.service.transition(repositories, { action: 'CHANGE_ROLE', actorAdminId: input.actorAdminId, adminId, ifMatch, requestedRole: role }, now));
  }
}

/** @implements REQ-ADM11-001, REQ-ADM11-004, REQ-ADM11-005, REQ-ADM11-007, EDGE-011-002, EDGE-011-011 */
export class DisableAdminDelegateUseCase {
  private readonly service: AdminDelegateService;
  constructor(
    private readonly deps: ApplicationDeps,
    limits: AdminDelegateLimits,
  ) {
    this.service = new AdminDelegateService(deps, limits);
  }

  /** `ACTIVE -> DISABLED` revoca sus sesiones; `INVITED -> DISABLED` cancela la invitación (DERIVADA (b)). */
  async execute(input: { readonly actorAdminId: string; readonly adminId: unknown; readonly ifMatch: unknown }): Promise<AdminDelegateView> {
    const adminId = adminIdOf(input.adminId);
    const ifMatch = ifMatchOf(input.ifMatch);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction((repositories) => this.service.transition(repositories, { action: 'DISABLE', actorAdminId: input.actorAdminId, adminId, ifMatch, requestedRole: null }, now));
  }
}

/** @implements REQ-ADM11-001, REQ-ADM11-005, REQ-ADM11-007, EDGE-011-009, EDGE-011-010 */
export class ReactivateAdminDelegateUseCase {
  private readonly service: AdminDelegateService;
  constructor(
    private readonly deps: ApplicationDeps,
    limits: AdminDelegateLimits,
  ) {
    this.service = new AdminDelegateService(deps, limits);
  }

  /** Rol explícito obligatorio (no se restaura el anterior); conserva `admin_id` y `sub` (D11-04 = A). */
  async execute(input: { readonly actorAdminId: string; readonly adminId: unknown; readonly ifMatch: unknown; readonly body: unknown }): Promise<AdminDelegateView> {
    const adminId = adminIdOf(input.adminId);
    const ifMatch = ifMatchOf(input.ifMatch);
    const { role } = assertMatchesSchema<{ role: PlatformRole }>('ReactivateAdminDelegateInput', validateReactivateAdminDelegateInput, input.body);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction((repositories) => this.service.transition(repositories, { action: 'REACTIVATE', actorAdminId: input.actorAdminId, adminId, ifMatch, requestedRole: role }, now));
  }
}

/** @implements REQ-ADM11-001, REQ-ADM11-005, REQ-ADM11-007, EDGE-011-009, EDGE-011-010 */
export class ReinviteAdminDelegateUseCase {
  private readonly service: AdminDelegateService;
  constructor(
    private readonly deps: ApplicationDeps,
    limits: AdminDelegateLimits,
  ) {
    this.service = new AdminDelegateService(deps, limits);
  }

  /** Renueva `invitedExpiresAt` a `ahora + TTL` con el MISMO `admin_id` y rol; única vía de recuperar una invitación caducada (DERIVADA (e)). */
  async execute(input: { readonly actorAdminId: string; readonly adminId: unknown; readonly ifMatch: unknown }): Promise<AdminDelegateView> {
    const adminId = adminIdOf(input.adminId);
    const ifMatch = ifMatchOf(input.ifMatch);
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction((repositories) => this.service.transition(repositories, { action: 'REINVITE', actorAdminId: input.actorAdminId, adminId, ifMatch, requestedRole: null }, now));
  }
}
