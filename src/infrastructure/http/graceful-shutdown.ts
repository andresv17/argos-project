/**
 * Cierre ordenado ante `SIGTERM` (REQ-CLD-006, INV-ARCH-005, H-LOCK-003): el servidor deja de aceptar conexiones y espera
 * las peticiones en curso; después se cierra el pool (si existe). El plazo total es de 7 s, estrictamente menor que el
 * periodo de gracia de 10 s de Cloud Run, que tras él envía `SIGKILL`.
 *
 * @implements REQ-CLD-006, INV-ARCH-005
 */

/** Periodo de gracia de Cloud Run tras `SIGTERM` (verificar en T402). */
export const CLOUD_RUN_GRACE_MS = 10_000;
/** Plazo máximo del cierre propio: deja 3 s de margen antes de `SIGKILL`. */
export const SHUTDOWN_TIMEOUT_MS = 7_000;

export interface ShutdownOptions {
  /** Deja de aceptar conexiones y espera las peticiones en curso (p. ej. `app.close()`). */
  readonly closeServer: () => Promise<void>;
  /** Cierra el pool de PostgreSQL; ausente con SQLite (su cierre va en el `onClose` de la app). */
  readonly closePool?: (() => Promise<void>) | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface ShutdownResult {
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly failed: boolean;
}

/** @implements REQ-CLD-006 */
export async function shutdownGracefully({ closeServer, closePool, timeoutMs = SHUTDOWN_TIMEOUT_MS }: ShutdownOptions): Promise<ShutdownResult> {
  const started = performance.now();
  let failed = false;
  const work = (async () => {
    try {
      await closeServer();
    } catch {
      failed = true;
    }
    try {
      if (closePool !== undefined) await closePool();
    } catch {
      failed = true;
    }
  })();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const winner = await Promise.race([work.then(() => 'done' as const), deadline]);
  clearTimeout(timer);
  return { durationMs: performance.now() - started, timedOut: winner === 'timeout', failed };
}

export interface ShutdownHandlerOptions extends ShutdownOptions {
  /** Emisor de señales (`process`); las pruebas pasan uno simulado. */
  readonly target: { on(signal: string, listener: () => void): unknown };
  readonly exit: (code: number) => void;
  readonly log?: { info(message: string): void; warn(message: string): void } | undefined;
}

/**
 * Registra `SIGTERM` y `SIGINT`: ejecuta el cierre una sola vez y sale con 0 (limpio) o 1 (fallo o plazo agotado).
 * @implements REQ-CLD-006
 */
export function installShutdownHandlers({ target, exit, log, ...options }: ShutdownHandlerOptions): void {
  let started = false;
  const handler = () => {
    if (started) return;
    started = true;
    log?.info('señal de cierre recibida');
    void shutdownGracefully(options).then((result) => {
      if (result.timedOut || result.failed) log?.warn(result.timedOut ? 'cierre excedió el plazo' : 'cierre con errores');
      else log?.info('cierre ordenado completado');
      exit(result.timedOut || result.failed ? 1 : 0);
    });
  };
  target.on('SIGTERM', handler);
  target.on('SIGINT', handler);
}
