/**
 * T415 (pruebas primero) — cierre ordenado ante SIGTERM (REQ-CLD-006): <= 7 s, estrictamente menor que la gracia de
 * 10 s de Cloud Run. Se usa un cierre simulado; nunca se envía una señal real al proceso de la suite.
 * @implements REQ-CLD-006, INV-ARCH-005, H-LOCK-003
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { CLOUD_RUN_GRACE_MS, SHUTDOWN_TIMEOUT_MS, installShutdownHandlers, shutdownGracefully } from '../../src/infrastructure/http/graceful-shutdown.ts';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('plazo de cierre', () => {
  it('es 7 s y estrictamente menor que la gracia de 10 s de Cloud Run', () => {
    expect(SHUTDOWN_TIMEOUT_MS).toBe(7_000);
    expect(CLOUD_RUN_GRACE_MS).toBe(10_000);
    expect(SHUTDOWN_TIMEOUT_MS).toBeLessThan(CLOUD_RUN_GRACE_MS);
  });
});

describe('shutdownGracefully', () => {
  it('cierra primero el servidor y después el pool, y el tiempo medido queda por debajo de 7 s', async () => {
    const order: string[] = [];
    const started = performance.now();
    const result = await shutdownGracefully({
      closeServer: async () => { order.push('servidor:inicio'); await delay(60); order.push('servidor:fin'); },
      closePool: async () => { order.push('pool:inicio'); await delay(20); order.push('pool:fin'); },
    });
    const elapsed = performance.now() - started;
    expect(order).toEqual(['servidor:inicio', 'servidor:fin', 'pool:inicio', 'pool:fin']);
    expect(result.timedOut).toBe(false);
    expect(result.failed).toBe(false);
    expect(elapsed).toBeLessThan(SHUTDOWN_TIMEOUT_MS);
    expect(result.durationMs).toBeLessThan(SHUTDOWN_TIMEOUT_MS);
  });

  it('sin pool (SQLite) solo cierra el servidor', async () => {
    let closed = 0;
    const result = await shutdownGracefully({ closeServer: async () => { closed += 1; } });
    expect(closed).toBe(1);
    expect(result).toMatchObject({ timedOut: false, failed: false });
  });

  it('espera la transacción en curso: el cierre del servidor no termina antes que ella', async () => {
    let transactionDone = false;
    const result = await shutdownGracefully({
      closeServer: async () => { await delay(80); transactionDone = true; },
      closePool: async () => { expect(transactionDone).toBe(true); },
    });
    expect(result.failed).toBe(false);
  });

  it('si el cierre excede el plazo devuelve timedOut sin esperar al cierre colgado', async () => {
    const started = performance.now();
    const result = await shutdownGracefully({ closeServer: () => new Promise<void>(() => undefined), timeoutMs: 80 });
    expect(result.timedOut).toBe(true);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('si el servidor falla al cerrar igualmente intenta cerrar el pool y marca failed', async () => {
    let poolClosed = false;
    const result = await shutdownGracefully({
      closeServer: async () => { throw new Error('boom'); },
      closePool: async () => { poolClosed = true; },
    });
    expect(poolClosed).toBe(true);
    expect(result.failed).toBe(true);
  });
});

describe('installShutdownHandlers', () => {
  it('SIGTERM dispara el cierre una sola vez y sale con 0 al terminar bien', async () => {
    const fakeProcess = new EventEmitter();
    const exits: number[] = [];
    let closes = 0;
    installShutdownHandlers({ target: fakeProcess, closeServer: async () => { closes += 1; await delay(10); }, exit: (code) => { exits.push(code); } });
    fakeProcess.emit('SIGTERM');
    fakeProcess.emit('SIGTERM');
    await delay(100);
    expect(closes).toBe(1);
    expect(exits).toEqual([0]);
  });

  it('SIGINT también cierra; un cierre que falla sale con 1', async () => {
    const fakeProcess = new EventEmitter();
    const exits: number[] = [];
    installShutdownHandlers({ target: fakeProcess, closeServer: async () => { throw new Error('boom'); }, exit: (code) => { exits.push(code); } });
    fakeProcess.emit('SIGINT');
    await delay(50);
    expect(exits).toEqual([1]);
  });

  it('un cierre que excede el plazo sale con 1 sin esperar', async () => {
    const fakeProcess = new EventEmitter();
    const exits: number[] = [];
    installShutdownHandlers({ target: fakeProcess, closeServer: () => new Promise<void>(() => undefined), timeoutMs: 40, exit: (code) => { exits.push(code); } });
    fakeProcess.emit('SIGTERM');
    await delay(200);
    expect(exits).toEqual([1]);
  });
});
