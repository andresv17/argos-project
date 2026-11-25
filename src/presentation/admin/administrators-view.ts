/**
 * Reglas puras y textos del panel de administradores delegados de /admin (T1528, `[GH:#63]`). La interfaz oculta lo no autorizado como comodidad: el servidor decide siempre
 * (registro central de roles por ruta, REQ-ADM11-003); `AdminSelfView` solo alimenta estas funciones. Los mensajes de error salen de los códigos `ERR-ADM11-*` del catálogo 1.1.0
 * (plantilla `detailTemplate`), nunca de texto libre del servidor y nunca con el correo (H-9). Sin operación de borrado (H-9): la baja es `DISABLED`.
 *
 * @implements REQ-ADM11-002, REQ-ADM11-003, REQ-ADM11-005, NFR-011-001; SC-011-025, SC-011-029, SC-011-031, SC-011-034
 */
export type PlatformRole = 'SUPER_ADMIN' | 'OPERATOR' | 'SUPPORT';
export type DelegateStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface SelfView {
  readonly delegateId: string;
  readonly role: PlatformRole;
  readonly isRoot: boolean;
}
export interface DelegateView {
  readonly delegateId: string;
  readonly email: string;
  readonly role: PlatformRole;
  readonly status: DelegateStatus;
  readonly isAnchored: boolean;
  readonly invitedAt: string | null;
  readonly invitedExpiresAt: string | null;
  readonly anchoredAt: string | null;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly etag: string;
}

/** Espejo de `ADMIN_DELEGATE_ROW_LIMIT` (app-config.ts, INV-ARCH-006): la presentación no importa de infraestructura; el servidor nunca devuelve más filas. */
export const ROW_LIMIT = 100;

export const ROLE_LABEL: Readonly<Record<PlatformRole, string>> = { SUPER_ADMIN: 'Super-administrador', OPERATOR: 'Operador', SUPPORT: 'Soporte' };
export const STATUS_LABEL: Readonly<Record<DelegateStatus, string>> = { INVITED: 'Invitado', ACTIVE: 'Activo', DISABLED: 'Desactivado' };
export const EXPIRED_LABEL = 'Invitación caducada';

export type RowAction = 'SAVE_ROLE' | 'DISABLE' | 'CANCEL_INVITATION' | 'REACTIVATE' | 'REINVITE';
export const ACTION_LABEL: Readonly<Record<RowAction, string>> = {
  SAVE_ROLE: 'Cambiar rol',
  DISABLE: 'Desactivar',
  CANCEL_INVITATION: 'Cancelar invitación',
  REACTIVATE: 'Reactivar',
  REINVITE: 'Reinvitar',
};
export const CONFIRM_LABEL: Readonly<Record<'DISABLE' | 'CANCEL_INVITATION', string>> = { DISABLE: 'Confirmar desactivación', CANCEL_INVITATION: 'Confirmar cancelación' };
export const CONFIRM_QUESTION: Readonly<Record<'DISABLE' | 'CANCEL_INVITATION', string>> = {
  DISABLE: '¿Desactivar a este administrador? Perderá el acceso en su siguiente petición.',
  CANCEL_INVITATION: '¿Cancelar esta invitación? La persona no podrá entrar con ella.',
};
export const ACTION_DONE: Readonly<Record<RowAction, string>> = {
  SAVE_ROLE: 'Rol actualizado.',
  DISABLE: 'Administrador desactivado.',
  CANCEL_INVITATION: 'Invitación cancelada.',
  REACTIVATE: 'Administrador reactivado.',
  REINVITE: 'Invitación renovada por 72 horas.',
};

/** Respuesta uniforme del alta (H-4): idéntica para correo nuevo, repetido, de la raíz o de un usuario; no dice si se creó algo. */
export const INVITE_ACCEPTED = 'Solicitud recibida. Si la persona puede ser invitada, verás su invitación en la lista y tendrá 72 horas para entrar con Google.';
export const LOAD_FAILED = 'No se pudo cargar la lista de administradores. Inténtalo de nuevo.';
export const GENERIC_FAILED = 'No se pudo completar la operación. Inténtalo de nuevo.';
export const LIMIT_NOTICE = 'La lista alcanzó su límite de filas. Ya no caben más administradores delegados.';

/** Textos del catálogo `error-catalog.json` 1.1.0 (`detailTemplate`); las claves son exactamente los códigos ERR-ADM11-*. */
export const ADMIN_ERROR_TEXT: Readonly<Record<string, string>> = {
  'ERR-ADM11-ROLE-NOT-AUTHORIZED': 'Tu rol de administración no autoriza esta operación. Si lo necesitas, pide a un super-administrador que revise tu rol.',
  'ERR-ADM11-GRANT-FORBIDDEN': 'Esta operación sobre roles de super-administrador solo la puede hacer el administrador raíz.',
  'ERR-ADM11-SELF-MODIFICATION-FORBIDDEN': 'No puedes cambiar tu propio rol ni tu propio estado. Pide a otro administrador autorizado que lo haga.',
  'ERR-ADM11-DELEGATE-LIMIT-REACHED': 'Se alcanzó el límite de administradores delegados. Desactiva a alguien o espera a que caduque una invitación antes de añadir otro.',
  'ERR-ADM11-LAST-SUPER-ADMIN': 'Esta operación dejaría la plataforma sin super-administrador. Debe quedar al menos uno.',
  'ERR-ADM11-ROOT-PROTECTED': 'Las cuentas del administrador raíz no se pueden degradar, desactivar ni revocar desde la interfaz.',
  'ERR-ADM11-INVALID-TRANSITION': 'Esa operación no es válida para el estado actual del administrador delegado.',
  'ERR-ADM11-DELEGATE-NOT-FOUND': 'No se encontró el administrador delegado indicado.',
  'ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH': 'Los dos correos no coinciden. Escríbelos de nuevo.',
  'ERR-ADM11-PRECONDITION-FAILED': 'El administrador delegado cambió desde que lo cargaste. Vuelve a cargar la lista e inténtalo de nuevo.',
};

/** Mensaje para un código de error; un código ausente o fuera del catálogo da el genérico (jamás texto del servidor ni correo). */
export function errorMessage(code: string | null): string {
  return code !== null && Object.hasOwn(ADMIN_ERROR_TEXT, code) ? (ADMIN_ERROR_TEXT[code] as string) : GENERIC_FAILED;
}

/** Solo un `SUPER_ADMIN` (raíz o delegado) ve el panel de delegados; sin rol conocido, se oculta (falla cerrada). */
export const canSeeAdministrators = (self: SelfView | null): boolean => self !== null && self.role === 'SUPER_ADMIN';
/** `SUPPORT` solo ve solicitudes de registro (matriz del anexo); rol aún desconocido no oculta (el servidor decide). */
export const canSeeParameters = (self: SelfView | null): boolean => self === null || self.role !== 'SUPPORT';

/** Un `SUPER_ADMIN` delegado no ve a otros `SUPER_ADMIN` (H-6); sí ve su propia fila. La raíz ve todas. */
export function visibleRows(self: SelfView, items: readonly DelegateView[]): readonly DelegateView[] {
  return items.filter((row) => self.isRoot || row.role !== 'SUPER_ADMIN' || row.delegateId === self.delegateId);
}

/** Roles que el actor puede asignar: la raíz los tres; un delegado solo `OPERATOR` y `SUPPORT` (H-6). */
export function assignableRoles(self: SelfView): readonly PlatformRole[] {
  return self.isRoot ? ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT'] : ['OPERATOR', 'SUPPORT'];
}

export function isExpired(row: DelegateView, nowMs: number): boolean {
  return row.status === 'INVITED' && row.invitedExpiresAt !== null && Date.parse(row.invitedExpiresAt) <= nowMs;
}

/** Acciones que la interfaz ofrece en una fila. Sin acciones sobre uno mismo ni, para un delegado, sobre un `SUPER_ADMIN`. Nunca existe «eliminar» (H-9). */
export function rowActions(self: SelfView, row: DelegateView, nowMs: number): readonly RowAction[] {
  if (row.delegateId === self.delegateId) return [];
  if (row.role === 'SUPER_ADMIN' && !self.isRoot) return [];
  if (row.status === 'ACTIVE') return ['SAVE_ROLE', 'DISABLE'];
  if (row.status === 'INVITED') return isExpired(row, nowMs) ? ['SAVE_ROLE', 'REINVITE', 'CANCEL_INVITATION'] : ['SAVE_ROLE', 'CANCEL_INVITATION'];
  return row.isAnchored ? ['REACTIVATE'] : ['REINVITE'];
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
export const formatInstant = (iso: string): string => DATE_FORMAT.format(new Date(iso));

export function statusDetail(row: DelegateView, nowMs: number): string {
  if (row.status === 'INVITED') return isExpired(row, nowMs) ? `${EXPIRED_LABEL} el ${formatInstant(row.invitedExpiresAt as string)}` : `Vence el ${formatInstant(row.invitedExpiresAt as string)}`;
  if (row.status === 'DISABLED' && row.disabledAt !== null) return `Desactivado el ${formatInstant(row.disabledAt)}`;
  if (row.status === 'ACTIVE' && row.anchoredAt !== null) return `Activo desde el ${formatInstant(row.anchoredAt)}`;
  return '';
}

/** Selector del botón por fila que abrió la confirmación en línea, para devolverle el foco al cancelar (WCAG 2.4.3). */
export const triggerSelector = (delegateId: string, action: string): string => `button[data-action="${action}"][data-row-id="${delegateId}"]`;
/** Nombre accesible por fila: empieza con el texto visible (WCAG 2.5.3) y añade el correo ya visible (WCAG 2.4.6). */
export const rowActionLabel = (action: RowAction, row: { readonly email: string }): string => `${ACTION_LABEL[action]}: ${row.email}`;
export const rowRoleLabel = (row: { readonly email: string }): string => `Rol de ${row.email}`;
/** El error visible es el de correos distintos y los campos siguen sin coincidir (WCAG 3.3.1). */
export const isEmailMismatch = (form: { readonly email: string; readonly emailConfirmation: string }, message: { readonly kind: string; readonly text: string } | null): boolean =>
  message !== null && message.kind === 'error' && message.text === errorMessage('ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH') && form.email.trim().toLowerCase() !== form.emailConfirmation.trim().toLowerCase();
