/**
 * H-T591-1 [US4] cliente de la renovación pasiva (SC-ALM-036, SC-ALM-032, INV-AUTH2-002): la primera apertura del visor cuenta como actividad; la renovación
 * proactiva (temporizador al 80 % de expiresAt) envía `X-Argos-Renewal: 1` y NO llama a `notifyActivity()`. Con un planificador y un reloj falsos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onActivity } from '../../../src/presentation/web/activity.ts';
import { createAccessRenewer } from '../../../src/presentation/web/access-renewer.ts';
import { createMediaApi } from '../../../src/presentation/web/media-api.ts';

const OK = (now: number) => ({ url: 'https://b.storage.googleapis.com/x', expiresAt: new Date(now + 300_000).toISOString(), mime: 'image/png' });

function world() {
  let now = Date.parse('2026-11-17T10:00:00.000Z');
  const queue: Array<{ at: number; run: () => void; live: boolean }> = [];
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
    requests.push({ url, headers: init.headers });
    return new Response(JSON.stringify(OK(now)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const scheduler = {
    after(run: () => void, ms: number) {
      const entry = { at: now + ms, run, live: true };
      queue.push(entry);
      return () => void (entry.live = false);
    },
  };
  const advance = async (ms: number): Promise<void> => {
    const target = now + ms;
    for (;;) {
      const next = queue.filter((e) => e.live && e.at <= target).sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      next.live = false;
      now = next.at;
      next.run();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    now = target;
  };
  return { now: () => now, scheduler, fetchImpl, requests, advance };
}

let stopActivity: (() => void) | undefined;
afterEach(() => stopActivity?.());

describe('H-T591-1 cliente: renovación pasiva del visor', () => {
  it('[SC-ALM-036] access sin opción no envía X-Argos-Renewal y notifica la actividad; con renewal: true la envía con el valor exacto 1 y NO notifica', async () => {
    const w = world();
    let activity = 0;
    stopActivity = onActivity(() => (activity += 1));
    const api = createMediaApi(w.fetchImpl);
    await api.access('p1', 'm1');
    expect([Object.keys(w.requests[0]!.headers).sort(), activity]).toEqual([['X-Argos-Request'], 1]);
    await api.access('p1', 'm1', { renewal: true });
    expect([w.requests[1]!.headers['X-Argos-Renewal'], w.requests[1]!.headers['X-Argos-Request'], activity]).toEqual(['1', '1', 1]);
  });

  it('[SC-ALM-036] los demás métodos nunca envían X-Argos-Renewal', async () => {
    const w = world();
    const api = createMediaApi(w.fetchImpl);
    await api.list('p1', 'FILE', 1);
    await api.remove('p1', 'm1').catch(() => undefined);
    expect(w.requests.filter((r) => 'X-Argos-Renewal' in r.headers)).toEqual([]);
  });

  it('[SC-ALM-036][SC-ALM-032] el renovador pide la primera URL sin renewal y las renovaciones al 80 % con renewal; solo la primera cuenta como actividad', async () => {
    const w = world();
    let activity = 0;
    stopActivity = onActivity(() => (activity += 1));
    const api = createMediaApi(w.fetchImpl);
    const renewer = createAccessRenewer({ fetchAccess: (renewal) => api.access('p1', 'm1', { renewal }), onUrl: () => undefined, onError: () => undefined, now: w.now, scheduler: w.scheduler });
    await renewer.start();
    await w.advance(240_000);
    await w.advance(240_000);
    expect(w.requests.map((r) => r.headers['X-Argos-Renewal'] ?? null)).toEqual([null, '1', '1']);
    expect(activity).toBe(1);
    renewer.stop();
  });

  it('[INV-AUTH2-002] durante 30 min de renovaciones pasivas no hay actividad nueva: el aviso de inactividad no se reinicia', async () => {
    const w = world();
    const stamps: number[] = [];
    stopActivity = onActivity(() => stamps.push(w.now()));
    const api = createMediaApi(w.fetchImpl);
    const renewer = createAccessRenewer({ fetchAccess: (renewal) => api.access('p1', 'm1', { renewal }), onUrl: () => undefined, onError: () => undefined, now: w.now, scheduler: w.scheduler });
    const t0 = w.now();
    await renewer.start();
    await w.advance(30 * 60_000);
    expect(w.requests.length).toBeGreaterThanOrEqual(8);
    expect(stamps).toEqual([t0]);
    expect(w.now() - stamps[stamps.length - 1]!).toBe(30 * 60_000);
    renewer.stop();
  });

  it('[SC-ALM-032] el reintento tras un fallo de la renovación sigue siendo pasivo (renewal true) y la primera petición va sin renewal', async () => {
    const w = world();
    const flags: boolean[] = [];
    let n = 0;
    const fetchAccess = vi.fn(async (renewal: boolean) => {
      flags.push(renewal);
      n += 1;
      if (n === 2) throw new Error('red');
      return OK(w.now()) as never;
    });
    const renewer = createAccessRenewer({ fetchAccess, onUrl: () => undefined, onError: () => undefined, now: w.now, scheduler: w.scheduler });
    await renewer.start();
    await w.advance(240_000);
    await w.advance(2_000);
    expect(flags).toEqual([false, true, true]);
    renewer.stop();
  });
});
