/**
 * Renovación proactiva de la URL firmada de un visor (SC-ALM-032, REQ-ARC-003): la pide, la publica y programa su renovación al 80 % del tiempo hasta
 * `expiresAt`; si la renovación falla reintenta una sola vez y, si vuelve a fallar, informa el error y no pide más.
 *
 * El módulo es puro: el reloj y el planificador llegan como puertos (`now`, `scheduler`). El planificador real vive en `browser-scheduler.ts` (tercer módulo
 * con temporizadores autorizado por Neo) y `MediaPanel` lo conecta por defecto.
 *
 * @implements REQ-ARC-003
 */
import type { MediaAccess } from './media-api.ts';

/** Planificador inyectable: `after` programa `run` dentro de `ms` milisegundos y devuelve la forma de cancelarlo. */
export interface Scheduler {
  after(run: () => void, ms: number): () => void;
}

/** Retardo de la renovación: el 80 % del tiempo entre la obtención de la URL y `expiresAt` (SC-ALM-032); nunca negativo. */
export function renewalDelayMs(obtainedAtMs: number, expiresAtMs: number): number {
  return Math.max(0, Math.floor((expiresAtMs - obtainedAtMs) * 0.8));
}

const RETRY_DELAY_MS = 2_000;

export interface AccessRenewerOptions {
  readonly fetchAccess: () => Promise<MediaAccess>;
  readonly onUrl: (access: MediaAccess) => void;
  readonly onError: (error: unknown) => void;
  readonly now: () => number;
  readonly scheduler: Scheduler;
}

export function createAccessRenewer({ fetchAccess, onUrl, onError, now, scheduler }: AccessRenewerOptions): { start(): Promise<void>; stop(): void } {
  let cancel: (() => void) | null = null;
  let stopped = false;
  async function obtain(retriesLeft: number): Promise<void> {
    if (stopped) return;
    try {
      const access = await fetchAccess();
      if (stopped) return;
      onUrl(access);
      cancel = scheduler.after(() => void obtain(1), renewalDelayMs(now(), Date.parse(access.expiresAt)));
    } catch (error) {
      if (stopped) return;
      if (retriesLeft > 0) cancel = scheduler.after(() => void obtain(retriesLeft - 1), RETRY_DELAY_MS);
      else onError(error);
    }
  }
  return {
    start: () => obtain(0),
    stop: () => {
      stopped = true;
      cancel?.();
      cancel = null;
    },
  };
}
