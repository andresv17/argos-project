/**
 * Cliente del token OAuth2 del metadata server de Cloud Run (feature 006, Fase 14, T946; D6-22; REQ-ESC6-031, NFR-ESC6-001): `fetch` nativo inyectable, mismo patrón que
 * `CloudTasksSceneDispatcher`. El token se cachea en un campo `#` (privado de ES) solo hasta su vencimiento ANTICIPADO (`expires_in` menos un margen), nunca más allá de su
 * vigencia, y jamás se registra ni se copia en un mensaje. Sin SDK, sin la librería de autenticación de Google, sin entorno y sin registros.
 *
 * @implements REQ-ESC6-031, NFR-ESC6-001
 */

/** URL constante del metadata server (no sale de configuración ni de entrada de usuario). */
export const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
/** Margen de vencimiento anticipado: se renueva 60 s antes de que caduque. */
export const TOKEN_EARLY_EXPIRY_MS = 60_000;
/** Cota superior de la caché aunque el servidor declare más vida. */
const TOKEN_CACHE_CEILING_MS = 55 * 60 * 1000;
const TOKEN_PATTERN = /^[\x21-\x7e]{1,4096}$/;

export interface MetadataTokenClientOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

export interface MetadataTokenClient {
  /** Lanza un error SIN datos si el metadata server no entrega un token válido. */
  getAccessToken(signal?: AbortSignal): Promise<string>;
}

export function createMetadataTokenClient(options: MetadataTokenClientOptions = {}): MetadataTokenClient {
  const now = options.now ?? ((): number => Date.now());
  let cached: { readonly token: string; readonly until: number } | null = null;
  // Promesa en vuelo (H-F14-T1): generaciones concurrentes con caché fría comparten UNA petición; se descarta al terminar (éxito o fallo) para que un fallo no quede memoizado.
  let inFlight: Promise<string> | null = null;

  const fetchToken = async (signal?: AbortSignal): Promise<string> => {
    const doFetch = options.fetch ?? globalThis.fetch;
    const response = await doFetch(METADATA_TOKEN_URL, { method: 'GET', headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', ...(signal === undefined ? {} : { signal }) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('token de metadatos no disponible');
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // H-F14-T2: error literal; ni el cuerpo ni el mensaje del parser se repiten.
      throw new Error('token de metadatos no disponible');
    }
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const token = record['access_token'];
    const expiresIn = record['expires_in'];
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw new Error('token de metadatos no disponible');
    const lifetimeMs = typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0 ? Math.min(expiresIn * 1000, TOKEN_CACHE_CEILING_MS) : 0;
    const usableMs = lifetimeMs - TOKEN_EARLY_EXPIRY_MS;
    cached = usableMs > 0 ? { token, until: now() + usableMs } : null;
    return token;
  };

  return {
    async getAccessToken(signal?: AbortSignal): Promise<string> {
      if (cached !== null && cached.until > now()) return cached.token;
      if (inFlight === null) {
        const pending = fetchToken(signal).finally(() => {
          if (inFlight === pending) inFlight = null;
        });
        inFlight = pending;
      }
      return inFlight;
    },
  };
}
