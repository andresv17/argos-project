/**
 * Máquina cerrada del estado de aprobación de una cuenta (Feature 009, T1246; STATE-ACCT9-001, ADR-009-09; MIF-03: un solo archivo, sin dependencias).
 * Estados: `PENDING` (nace así toda cuenta nueva), `ACTIVE` (único con sesión) y `REJECTED`. Solo existen dos transiciones, ambas desde `PENDING` y ambas por decisión
 * del administrador: `APPROVE` -> `ACTIVE` y `REJECT` -> `REJECTED`. `ACTIVE` y `REJECTED` son terminales; `REJECTED` no vuelve a `PENDING` ni a `ACTIVE`: el reintento solo
 * existe tras la purga de 30 días, que libera el identificador (REQ-APR9-004). Sin reloj, sin entorno, sin E/S (INV-ARCH-001).
 *
 * @implements STATE-ACCT9-001, REQ-APR9-001, REQ-APR9-002, REQ-APR9-003, REQ-APR9-004, EDGE-009-005, EDGE-009-038, INV-ARCH-001
 */

export const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type AccountStatusEvent = 'APPROVE' | 'REJECT';

/** Estado inicial de toda cuenta creada por el código (las filas previas a 009 son `ACTIVE` por el valor por defecto de la columna). */
export const INITIAL_ACCOUNT_STATUS: AccountStatus = 'PENDING';

const NEXT: Readonly<Record<AccountStatus, Readonly<Partial<Record<AccountStatusEvent, AccountStatus>>>>> = {
  PENDING: { APPROVE: 'ACTIVE', REJECT: 'REJECTED' },
  ACTIVE: {},
  REJECTED: {},
};

/** Estado siguiente de `from` ante `event`, o `null` si la transición no existe. */
export function nextAccountStatus(from: AccountStatus, event: AccountStatusEvent): AccountStatus | null {
  return NEXT[from][event] ?? null;
}

/** `true` solo para `PENDING -> ACTIVE` y `PENDING -> REJECTED`. */
export function canTransitionAccountStatus(from: AccountStatus, to: AccountStatus): boolean {
  return (Object.values(NEXT[from]) as AccountStatus[]).includes(to);
}

/** Estado válido a partir de un valor leído de almacenamiento, o `null` si no es uno de los tres. */
export function parseAccountStatus(value: unknown): AccountStatus | null {
  return ACCOUNT_STATUSES.find((status) => status === value) ?? null;
}

/** La cuenta puede tener sesión y servir datos solo si está `ACTIVE`; ausente se trata como `ACTIVE` (cuenta previa a 009). */
export function isAccountActive(status: AccountStatus | undefined): boolean {
  return status === undefined || status === 'ACTIVE';
}
