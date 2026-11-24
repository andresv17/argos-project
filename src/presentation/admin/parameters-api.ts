/**
 * Cliente del portal /admin para el editor de parámetros (Feature 009, `[GH:#20]`, T1269, subfase 5a). Habla solo con `/api/admin/parameters`: `GET` (catálogo de claves), `PUT /{key}` con
 * `If-Match` (etag tal cual lo devolvió el servidor) y `X-Argos-Request`, y `POST /scene-quota/reset`. Cada respuesta se valida en forma y solo se conservan los campos del contrato.
 * El autor llega como id opaco del administrador: la vista lo traduce a texto y nunca lo pinta.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-006, NFR-009-001; SC-009-017, SC-009-018, SC-009-026
 */
export const PARAMETER_KEYS = ['album.max_photos_per_pet', 'scene.enabled', 'scene.global_quota_max', 'scene.provider_model', 'scene.prompt.blocks'] as const;
export type ParameterKey = (typeof PARAMETER_KEYS)[number];
export type ParameterValueType = 'INTEGER' | 'BOOLEAN' | 'STRING' | 'JSON_BLOCKS';

export interface ParameterConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly allowed?: readonly string[];
  readonly maxBlockLength?: number;
}
export interface ParameterView {
  readonly key: ParameterKey;
  readonly valueType: ParameterValueType;
  readonly value: string;
  readonly default: string;
  readonly source: 'DATABASE' | 'DEFAULT';
  readonly constraints: ParameterConstraints;
  readonly writable: boolean;
  readonly lastEditedAt: string | null;
  readonly lastEditedBy: string | null;
  readonly etag: string;
}
export interface QuotaResetResult {
  readonly accountsReset: number;
  readonly resetAt: string;
}

/** `SESSION_LOST`: 404 uniforme; `PRECONDITION`: 412 (edición concurrente); `INVALID`: 422; `COST_CAP`: 422 `ERR-ADMIN-SCENE-COST-CAP-EXCEEDED` (T1305, sin cifras); `CONFLICT`: 409 del reinicio; `FAILED`: red, 5xx u otra forma. */
export type ParamOutcome<T> =
  | { readonly kind: 'OK'; readonly value: T }
  | { readonly kind: 'SESSION_LOST' }
  | { readonly kind: 'PRECONDITION' }
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'COST_CAP' }
  | { readonly kind: 'CONFLICT' }
  | { readonly kind: 'FAILED' };

const BASE = '/api/admin/parameters';
const ETAG = /^"[A-Za-z0-9_-]{8,64}"$/;
const TYPES: readonly string[] = ['INTEGER', 'BOOLEAN', 'STRING', 'JSON_BLOCKS'];

function parseConstraints(raw: unknown): ParameterConstraints | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { min, max, allowed, maxBlockLength } = raw as Record<string, unknown>;
  const out: { min?: number; max?: number; allowed?: readonly string[]; maxBlockLength?: number } = {};
  for (const [name, value] of [['min', min], ['max', max], ['maxBlockLength', maxBlockLength]] as const) {
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    out[name] = value;
  }
  if (allowed !== undefined) {
    if (!Array.isArray(allowed) || !allowed.every((v): v is string => typeof v === 'string')) return null;
    out.allowed = allowed;
  }
  return out;
}

export function parseParameterView(raw: unknown): ParameterView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== 'string' || !(PARAMETER_KEYS as readonly string[]).includes(r.key)) return null;
  if (typeof r.valueType !== 'string' || !TYPES.includes(r.valueType)) return null;
  if (typeof r.value !== 'string' || typeof r.default !== 'string') return null;
  if (r.source !== 'DATABASE' && r.source !== 'DEFAULT') return null;
  if (typeof r.writable !== 'boolean') return null;
  if (r.lastEditedAt !== null && (typeof r.lastEditedAt !== 'string' || Number.isNaN(Date.parse(r.lastEditedAt)))) return null;
  if (r.lastEditedBy !== null && typeof r.lastEditedBy !== 'string') return null;
  if (typeof r.etag !== 'string' || !ETAG.test(r.etag)) return null;
  const constraints = parseConstraints(r.constraints);
  if (constraints === null) return null;
  return {
    key: r.key as ParameterKey,
    valueType: r.valueType as ParameterValueType,
    value: r.value,
    default: r.default,
    source: r.source,
    constraints,
    writable: r.writable,
    lastEditedAt: r.lastEditedAt,
    lastEditedBy: r.lastEditedBy,
    etag: r.etag,
  };
}

export function parseParameterCatalog(body: unknown): readonly ParameterView[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const { items } = body as { items?: unknown };
  if (!Array.isArray(items) || items.length !== PARAMETER_KEYS.length) return null;
  const parsed: ParameterView[] = [];
  for (const raw of items) {
    const view = parseParameterView(raw);
    if (view === null) return null;
    parsed.push(view);
  }
  return parsed;
}

/** Imagenes que aun caben por par seleccionable (contrato 1.5.0, solo lectura, sin dinero). */
export interface ImagesFit {
  readonly model: string;
  readonly location: string;
  readonly imagesFit: number;
}

/** Tolerante: ausente o mal formado = lista vacia (falla cerrado: no se muestra ninguna cifra, el panel sigue funcionando). */
export function parseSceneImagesFit(body: unknown): readonly ImagesFit[] {
  if (typeof body !== 'object' || body === null) return [];
  const raw = (body as { sceneImagesFit?: unknown }).sceneImagesFit;
  if (!Array.isArray(raw) || raw.length > 2) return [];
  const out: ImagesFit[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return [];
    const { model, location, imagesFit } = entry as Record<string, unknown>;
    if (typeof model !== 'string' || typeof location !== 'string' || typeof imagesFit !== 'number' || !Number.isInteger(imagesFit) || imagesFit < 0 || imagesFit > 111) return [];
    out.push({ model, location, imagesFit });
  }
  return out;
}

export interface ParameterCatalog {
  readonly params: readonly ParameterView[];
  readonly imagesFit: readonly ImagesFit[];
}

function parseCatalogWithFit(body: unknown): ParameterCatalog | null {
  const params = parseParameterCatalog(body);
  return params === null ? null : { params, imagesFit: parseSceneImagesFit(body) };
}

function parseQuotaReset(body: unknown): QuotaResetResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const { accountsReset, resetAt } = body as Record<string, unknown>;
  if (typeof accountsReset !== 'number' || !Number.isInteger(accountsReset) || accountsReset < 0) return null;
  if (typeof resetAt !== 'string' || Number.isNaN(Date.parse(resetAt))) return null;
  return { accountsReset, resetAt };
}

async function call<T>(path: string, init: RequestInit, parse: (body: unknown) => T | null): Promise<ParamOutcome<T>> {
  try {
    const response = await fetch(path, { ...init, credentials: 'same-origin' });
    if (response.status === 200) {
      const value = parse(await response.json());
      return value === null ? { kind: 'FAILED' } : { kind: 'OK', value };
    }
    if (response.status === 404) return { kind: 'SESSION_LOST' };
    if (response.status === 412) return { kind: 'PRECONDITION' };
    if (response.status === 422) {
      const code = await response.json().then((b: unknown) => (typeof b === 'object' && b !== null ? (b as { code?: unknown }).code : undefined), () => undefined);
      return { kind: code === 'ERR-ADMIN-SCENE-COST-CAP-EXCEEDED' ? 'COST_CAP' : 'INVALID' };
    }
    if (response.status === 409) return { kind: 'CONFLICT' };
    return { kind: 'FAILED' };
  } catch {
    return { kind: 'FAILED' };
  }
}

export const fetchParameters = (): Promise<ParamOutcome<readonly ParameterView[]>> => call(BASE, { method: 'GET', headers: { Accept: 'application/json' } }, parseParameterCatalog);

export const fetchParameterCatalog = (): Promise<ParamOutcome<ParameterCatalog>> => call(BASE, { method: 'GET', headers: { Accept: 'application/json' } }, parseCatalogWithFit);

export function updateParameter(key: ParameterKey, value: string, etag: string): Promise<ParamOutcome<ParameterView>> {
  return call(
    `${BASE}/${encodeURIComponent(key)}`,
    { method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag, 'X-Argos-Request': '1' }, body: JSON.stringify({ value }) },
    parseParameterView,
  );
}

export const resetSceneQuota = (): Promise<ParamOutcome<QuotaResetResult>> =>
  call(`${BASE}/scene-quota/reset`, { method: 'POST', headers: { Accept: 'application/json', 'X-Argos-Request': '1' } }, parseQuotaReset);
