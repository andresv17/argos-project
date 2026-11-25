/**
 * Límite de tasa de las rutas de Google (feature 008, REQ-SSO8-005, SC-008-061): ventana deslizante en memoria de la instancia con el reloj inyectado (INV-ARCH-001),
 * un cubo por ruta y una clave por IP efectiva (o por usuario en la vinculación). El intento rechazado no prolonga la ventana; la respuesta es el `ERR-RATE-LIMITED`
 * (429) uniforme del catálogo, sin revelar nada del flujo.
 *
 * @implements REQ-EDG10-001, REQ-EDG10-003, SC-010-016, REQ-SSO8-005, ERR-RATE-LIMITED, INV-ARCH-001
 */

import { DomainError } from '../../generated/index.ts';
import { DEFAULT_MAX_TRACKED, setBounded } from './bounded-map.ts';
import { GOOGLE_AUTH_LIMITS } from '../config/google-auth-config.ts';

export type GoogleRateBucket = keyof typeof GOOGLE_AUTH_LIMITS;

export class GoogleRateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly now: () => number, private readonly limits: typeof GOOGLE_AUTH_LIMITS = GOOGLE_AUTH_LIMITS, private readonly maxTracked: number = DEFAULT_MAX_TRACKED) {}

  consume(bucket: GoogleRateBucket, key: string): void {
    const limit = this.limits[bucket];
    const windowMs = limit.windowMinutes * 60_000;
    const now = this.now();
    if (this.events.size > this.maxTracked) this.sweep(now);
    const id = `${bucket}:${key}`;
    const live = (this.events.get(id) ?? []).filter((at) => at > now - windowMs);
    if (live.length >= limit.maxPerWindow) {
      setBounded(this.events, id, live, this.maxTracked);
      throw new DomainError('ERR-RATE-LIMITED');
    }
    setBounded(this.events, id, [...live, now], this.maxTracked);
  }

  private sweep(now: number): void {
    for (const [id, times] of this.events) {
      const limit = this.limits[id.slice(0, id.indexOf(':')) as GoogleRateBucket];
      if (times.every((at) => at <= now - limit.windowMinutes * 60_000)) this.events.delete(id);
    }
  }
}
