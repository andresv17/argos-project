/**
 * Estado de la solicitud de cuenta en la SPA (Feature 009, `[GH:#18]`, T1249). Desde T1246 el registro, el inicio de sesión (contraseña o Google) y la elección de usuario de Google
 * de una cuenta `PENDING` o `REJECTED` responden `{ accountStatus }` SIN `Set-Cookie`: la SPA no tiene sesión y solo muestra la pantalla de estado. Los textos son los aprobados en `D9-18`.
 *
 * @implements REQ-APR9-001, REQ-APR9-002, EDGE-009-005, EDGE-009-006, STATE-ACCT9-001
 */
export type PendingAccountStatus = 'PENDING' | 'REJECTED';

/** Rutas públicas de las pantallas de estado; el *callback* de Google (`PENDING_PATH`/`REJECTED_PATH` de la API) navega a las mismas. */
export const ACCOUNT_STATUS_ROUTE: Readonly<Record<PendingAccountStatus, string>> = {
  PENDING: '/solicitud-en-revision',
  REJECTED: '/solicitud-no-aprobada',
};

/** Textos aprobados por Neo (`D9-18`). */
export const ACCOUNT_STATUS_TITLE: Readonly<Record<PendingAccountStatus, string>> = {
  PENDING: 'Tu solicitud está en revisión',
  REJECTED: 'Tu solicitud no fue aprobada.',
};

/** `PENDING`/`REJECTED` si el cuerpo es el resultado de estado de la 009; `null` en cualquier otro caso (SessionView incluida). */
export function accountStatusOf(body: unknown): PendingAccountStatus | null {
  if (typeof body !== 'object' || body === null) return null;
  const status = (body as { accountStatus?: unknown }).accountStatus;
  return status === 'PENDING' || status === 'REJECTED' ? status : null;
}

export type AuthOutcome<S> = { readonly kind: 'ACCOUNT_STATUS'; readonly accountStatus: PendingAccountStatus } | { readonly kind: 'SESSION'; readonly session: S };

/** Distingue la respuesta de acceso: solo `SESSION` puede producir sesión en la SPA. */
export function authOutcome<S>(body: S | { readonly accountStatus: PendingAccountStatus }): AuthOutcome<S> {
  const accountStatus = accountStatusOf(body);
  return accountStatus === null ? { kind: 'SESSION', session: body as S } : { kind: 'ACCOUNT_STATUS', accountStatus };
}
