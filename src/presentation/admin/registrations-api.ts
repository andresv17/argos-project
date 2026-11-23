/**
 * Cliente del portal /admin para las solicitudes de registro (Feature 009, `[GH:#18]`, T1250). Habla solo con `/api/admin/*` (cookie propia `argos_admin_session`, `Path=/api/admin`):
 * `GET /pending-count`, `GET /registrations` (cursor opaco) y `POST /registrations/{id}/approve|reject` con `X-Argos-Request`. Cada respuesta se valida en forma antes de usarse
 * y no se conserva ni se pinta nada fuera de los campos del contrato (`registrationId`, `username`, `requestedAt`, `method`): jamás correo ni `sub` (NFR-009-004).
 *
 * @implements REQ-APR9-005, NFR-009-001; SC-009-006, SC-009-008
 */
export type RegistrationMethod = 'PASSWORD' | 'GOOGLE';
export type DecisionAction = 'approve' | 'reject';

export interface PendingCount {
  readonly pending: number;
  readonly warning: boolean;
}
export interface RegistrationItem {
  readonly registrationId: string;
  readonly username: string;
  readonly requestedAt: string;
  readonly method: RegistrationMethod;
}
export interface RegistrationPage {
  readonly items: readonly RegistrationItem[];
  readonly nextCursor: string | null;
}

/** `SESSION_LOST`: el 404 uniforme (sin sesión de administración o vencida); `NOT_FOUND`: la solicitud ya no se puede decidir; `FAILED`: red, 4xx/5xx u otra forma. */
export type Outcome<T> = { readonly kind: 'OK'; readonly value: T } | { readonly kind: 'SESSION_LOST' } | { readonly kind: 'NOT_FOUND' } | { readonly kind: 'FAILED' };

const BASE = '/api/admin';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePendingCount(body: unknown): PendingCount | null {
  if (typeof body !== 'object' || body === null) return null;
  const { pending, warning } = body as { pending?: unknown; warning?: unknown };
  if (typeof pending !== 'number' || !Number.isInteger(pending) || pending < 0 || typeof warning !== 'boolean') return null;
  return { pending, warning };
}

function parseItem(raw: unknown): RegistrationItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { registrationId, username, requestedAt, method } = raw as Record<string, unknown>;
  if (typeof registrationId !== 'string' || !UUID.test(registrationId)) return null;
  if (typeof username !== 'string' || username.length === 0) return null;
  if (typeof requestedAt !== 'string' || Number.isNaN(Date.parse(requestedAt))) return null;
  if (method !== 'PASSWORD' && method !== 'GOOGLE') return null;
  return { registrationId, username, requestedAt, method };
}

export function parseRegistrationPage(body: unknown): RegistrationPage | null {
  if (typeof body !== 'object' || body === null) return null;
  const { items, nextCursor } = body as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(items) || (nextCursor !== null && typeof nextCursor !== 'string')) return null;
  const parsed: RegistrationItem[] = [];
  for (const raw of items) {
    const item = parseItem(raw);
    if (item === null) return null;
    parsed.push(item);
  }
  return { items: parsed, nextCursor };
}

async function call<T>(path: string, init: RequestInit, parse: (body: unknown) => T | null): Promise<Outcome<T>> {
  try {
    const response = await fetch(path, { ...init, credentials: 'same-origin' });
    if (response.status === 200) {
      const value = parse(await response.json());
      return value === null ? { kind: 'FAILED' } : { kind: 'OK', value };
    }
    if (response.status === 404) {
      // Con sesión válida, el 404 de una decisión es problem+json (ERR-ADMIN-REGISTRATION-NOT-FOUND); el uniforme (text/plain) es sesión perdida.
      return (response.headers.get('content-type') ?? '').startsWith('application/problem+json') ? { kind: 'NOT_FOUND' } : { kind: 'SESSION_LOST' };
    }
    return { kind: 'FAILED' };
  } catch {
    return { kind: 'FAILED' };
  }
}

export const fetchPendingCount = (): Promise<Outcome<PendingCount>> => call(`${BASE}/pending-count`, { method: 'GET', headers: { Accept: 'application/json' } }, parsePendingCount);

export function fetchRegistrations(cursor: string | null): Promise<Outcome<RegistrationPage>> {
  const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return call(`${BASE}/registrations${query}`, { method: 'GET', headers: { Accept: 'application/json' } }, parseRegistrationPage);
}

export function decideRegistration(registrationId: string, action: DecisionAction): Promise<Outcome<true>> {
  return call(`${BASE}/registrations/${encodeURIComponent(registrationId)}/${action}`, { method: 'POST', headers: { Accept: 'application/json', 'X-Argos-Request': '1' } }, () => true as const);
}
