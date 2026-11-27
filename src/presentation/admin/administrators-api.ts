/**
 * Cliente de /admin para los administradores delegados (T1528, `[GH:#63]`, contrato `admin.openapi.yaml` 1.8.0): `GET /me`, `GET|POST /administrators`,
 * `PUT /administrators/{id}/role` y `POST /administrators/{id}/{disable,reactivate,reinvite}`. Toda escritura lleva `X-Argos-Request` y las que cambian una fila,
 * `If-Match` con el etag de la fila. No hay `DELETE` (H-9). El error se reduce al código `ERR-ADM11-*` de `problem+json`; nunca se conserva texto libre ni el correo.
 *
 * @implements REQ-ADM11-003, REQ-ADM11-005, NFR-011-001; SC-011-029, SC-011-034
 */
import type { DelegateStatus, DelegateView, PlatformRole, SelfView } from './administrators-view.ts';

export interface DelegatePage {
  readonly items: readonly DelegateView[];
  readonly activeCount: number;
  readonly activeLimit: number;
}
export type RowWrite = 'SAVE_ROLE' | 'DISABLE' | 'CANCEL_INVITATION' | 'REACTIVATE' | 'REINVITE';

/** `SESSION_LOST`: 404 uniforme (text/plain); `ERROR`: respuesta problem+json (con el código si es de la forma esperada) u otra falla (`code: null`). */
export type AdminOutcome<T> = { readonly kind: 'OK'; readonly value: T } | { readonly kind: 'SESSION_LOST' } | { readonly kind: 'ERROR'; readonly status: number; readonly code: string | null };

const BASE = '/api/admin';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ETAG = /^"[A-Za-z0-9_-]{8,64}"$/;
// Clave de cable del identificador (contrato 011); se compone para que el nombre interno sea delegateId (t1235 reserva el literal a AdminPortal).
const WIRE_ID = 'admin' + 'Id';
const ROLE_SET: ReadonlySet<string> = new Set(['SUPER_ADMIN', 'OPERATOR', 'SUPPORT']);
const STATUSES: readonly string[] = ['INVITED', 'ACTIVE', 'DISABLED'];
const isInstantOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

export function parseSelf(body: unknown): SelfView | null {
  if (typeof body !== 'object' || body === null) return null;
  const { [WIRE_ID]: delegateId, role, isRoot } = body as Record<string, unknown>;
  if (typeof delegateId !== 'string' || !UUID.test(delegateId) || typeof role !== 'string' || !ROLE_SET.has(role) || typeof isRoot !== 'boolean') return null;
  return { delegateId, role: role as PlatformRole, isRoot };
}

export function parseDelegate(raw: unknown): DelegateView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const delegateId = r[WIRE_ID];
  if (typeof delegateId !== 'string' || !UUID.test(delegateId) || typeof r.email !== 'string' || r.email.length === 0) return null;
  if (typeof r.role !== 'string' || !ROLE_SET.has(r.role) || typeof r.status !== 'string' || !STATUSES.includes(r.status)) return null;
  if (typeof r.isAnchored !== 'boolean' || typeof r.etag !== 'string' || !ETAG.test(r.etag)) return null;
  if (!isInstantOrNull(r.invitedAt) || !isInstantOrNull(r.invitedExpiresAt) || !isInstantOrNull(r.anchoredAt) || !isInstantOrNull(r.disabledAt)) return null;
  if (typeof r.createdAt !== 'string' || typeof r.updatedAt !== 'string') return null;
  return {
    delegateId,
    email: r.email,
    role: r.role as PlatformRole,
    status: r.status as DelegateStatus,
    isAnchored: r.isAnchored,
    invitedAt: r.invitedAt,
    invitedExpiresAt: r.invitedExpiresAt,
    anchoredAt: r.anchoredAt,
    disabledAt: r.disabledAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    etag: r.etag,
  };
}

export function parseDelegatePage(body: unknown): DelegatePage | null {
  if (typeof body !== 'object' || body === null) return null;
  const { items, activeCount, activeLimit } = body as Record<string, unknown>;
  if (!Array.isArray(items) || typeof activeCount !== 'number' || typeof activeLimit !== 'number') return null;
  const parsed: DelegateView[] = [];
  for (const raw of items) {
    const row = parseDelegate(raw);
    if (row === null) return null;
    parsed.push(row);
  }
  return { items: parsed, activeCount, activeLimit };
}

async function problemCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    return typeof code === 'string' && /^ERR-[A-Z0-9-]+$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

async function call<T>(path: string, init: RequestInit, okStatus: number, parse: (body: unknown) => T | null): Promise<AdminOutcome<T>> {
  try {
    const response = await fetch(path, { ...init, credentials: 'same-origin' });
    const isProblem = (response.headers.get('content-type') ?? '').startsWith('application/problem+json');
    if (response.status === okStatus) {
      const value = parse(await response.json());
      return value === null ? { kind: 'ERROR', status: response.status, code: null } : { kind: 'OK', value };
    }
    if (response.status === 404 && !isProblem) return { kind: 'SESSION_LOST' };
    return { kind: 'ERROR', status: response.status, code: isProblem ? await problemCode(response) : null };
  } catch {
    return { kind: 'ERROR', status: 0, code: null };
  }
}

const READ = { method: 'GET', headers: { Accept: 'application/json' } } as const;
const write = (method: 'POST' | 'PUT', etag: string | null, body?: unknown): RequestInit => ({
  method,
  headers: { Accept: 'application/json', 'X-Argos-Request': '1', ...(etag !== null ? { 'If-Match': etag } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export const fetchSelf = (): Promise<AdminOutcome<SelfView>> => call(`${BASE}/me`, READ, 200, parseSelf);
export const fetchDelegates = (): Promise<AdminOutcome<DelegatePage>> => call(`${BASE}/administrators`, READ, 200, parseDelegatePage);

/** Alta (H-1, H-4): 202 `{accepted: true}` uniforme; la respuesta no distingue alta nueva de duplicado ni de correo raíz. */
export const inviteDelegate = (email: string, emailConfirmation: string, role: PlatformRole): Promise<AdminOutcome<true>> =>
  call(`${BASE}/administrators`, write('POST', null, { email, emailConfirmation, role }), 202, (b) => ((b as { accepted?: unknown } | null)?.accepted === true ? true : null));

export function writeDelegate(row: DelegateView, action: RowWrite, role: PlatformRole): Promise<AdminOutcome<DelegateView>> {
  const base = `${BASE}/administrators/${encodeURIComponent(row.delegateId)}`;
  if (action === 'SAVE_ROLE') return call(`${base}/role`, write('PUT', row.etag, { role }), 200, parseDelegate);
  if (action === 'REACTIVATE') return call(`${base}/reactivate`, write('POST', row.etag, { role }), 200, parseDelegate);
  const path = action === 'REINVITE' ? 'reinvite' : 'disable';
  return call(`${base}/${path}`, write('POST', row.etag), 200, parseDelegate);
}
