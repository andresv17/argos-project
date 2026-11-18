/**
 * Renovación proactiva de la URL firmada de un visor (SC-ALM-032, REQ-ARC-003): la pide, la publica y programa su renovación al 80 % del tiempo hasta
 * `expiresAt`; si la renovación falla reintenta una sola vez y, si vuelve a fallar, informa el error y no pide más.
 *
 * El módulo es puro: el reloj y el planificador llegan como puertos (`now`, `scheduler`). El planificador real vive en `browser-scheduler.ts` (tercer módulo
 * con temporizadores autorizado por Neo) y `MediaPanel` lo conecta por defecto.
 *
 * La primera petición cuenta como actividad; las renovaciones del temporizador son pasivas (`fetchAccess(true)`, SC-ALM-036).
 *
 * @implements REQ-ARC-003, SC-ALM-036
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
  /** `renewal` es true en las peticiones del temporizador (renovación pasiva, SC-ALM-036) y false en la primera. */
  readonly fetchAccess: (renewal: boolean) => Promise<MediaAccess>;
  readonly onUrl: (access: MediaAccess) => void;
  readonly onError: (error: unknown) => void;
  readonly now: () => number;
  readonly scheduler: Scheduler;
}

export function createAccessRenewer({ fetchAccess, onUrl, onError, now, scheduler }: AccessRenewerOptions): { start(): Promise<void>; stop(): void } {
  let cancel: (() => void) | null = null;
  let stopped = false;
  async function obtain(retriesLeft: number, renewal: boolean): Promise<void> {
    if (stopped) return;
    try {
      const access = await fetchAccess(renewal);
      if (stopped) return;
      onUrl(access);
      cancel = scheduler.after(() => void obtain(1, true), renewalDelayMs(now(), Date.parse(access.expiresAt)));
    } catch (error) {
      if (stopped) return;
      if (retriesLeft > 0) cancel = scheduler.after(() => void obtain(retriesLeft - 1, renewal), RETRY_DELAY_MS);
      else onError(error);
    }
  }
  return {
    start: () => obtain(0, false),
    stop: () => {
      stopped = true;
      cancel?.();
      cancel = null;
    },
  };
}
