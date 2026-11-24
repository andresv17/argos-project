/**
 * `PlatformParameterPort` con caché en memoria por instancia y TTL <= 60 s (D5-07, PN-04, EDGE-005-12).
 * El reloj es el `ClockPort` inyectado. El aviso se emite al leer de la base, no en cada acierto de caché.
 * Un fallo del repositorio se propaga y no se cachea.
 * @implements REQ-PRM-002, D5-07
 */
import { SCENE_ENABLED_KEY, interpretSceneEnabled } from '../../domain/platform/admin-parameter-catalog.ts';
import { PARAMETER_CACHE_TTL_MS, interpretParameter, type KnownParameterKey } from '../../domain/platform/platform-parameters.ts';
import type { ClockPort } from '../ports/clock.port.ts';
import type { ParameterWarning, PlatformParameterPort, PlatformParameterRepositoryPort } from '../ports/platform-parameter.port.ts';

export interface CachedPlatformParameterOptions {
  readonly repository: PlatformParameterRepositoryPort;
  readonly clock: ClockPort;
  readonly warn: (warning: ParameterWarning) => void;
  /** Por defecto 60 000 ms; no puede superar 60 000 (D5-07). */
  readonly ttlMs?: number;
}

export function createCachedPlatformParameterPort(options: CachedPlatformParameterOptions): PlatformParameterPort {
  const ttlMs = options.ttlMs ?? PARAMETER_CACHE_TTL_MS;
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > PARAMETER_CACHE_TTL_MS) {
    throw new Error(`El TTL de la caché de parámetros debe ser un entero entre 1 y ${PARAMETER_CACHE_TTL_MS} ms (D5-07)`);
  }
  const cache = new Map<KnownParameterKey, { readonly value: number; readonly expiresAtMs: number }>();
  let sceneEnabled: { readonly value: boolean; readonly expiresAtMs: number } | null = null;
  return {
    async isSceneEnabled() {
      const nowMs = Date.parse(options.clock.nowIsoTimestamp());
      if (sceneEnabled !== null && nowMs < sceneEnabled.expiresAtMs) return sceneEnabled.value;
      // `scene.enabled` no esta en `KnownParameterKey` (005 no cambia de forma): no emite aviso; una fila ilegible rige como habilitado.
      const { enabled } = interpretSceneEnabled(await options.repository.findValue(SCENE_ENABLED_KEY));
      sceneEnabled = { value: enabled, expiresAtMs: nowMs + ttlMs };
      return enabled;
    },
    async getInt(key) {
      const nowMs = Date.parse(options.clock.nowIsoTimestamp());
      const hit = cache.get(key);
      if (hit !== undefined && nowMs < hit.expiresAtMs) return hit.value;
      const { value, warning } = interpretParameter(key, await options.repository.findValue(key));
      if (warning !== null) options.warn({ key, reason: warning });
      cache.set(key, { value, expiresAtMs: nowMs + ttlMs });
      return value;
    },
  };
}
