/**
 * T581 [US4] planificador real del navegador para la renovación al 80 % de `expiresAt` (SC-ALM-032, REQ-ARC-003): `browser-scheduler.ts` es el TERCER módulo
 * de presentación con temporizadores autorizado por Neo; solo envuelve setTimeout/clearTimeout y Date.now, y `MediaPanel` lo usa por defecto.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserRenewal, browserScheduler } from '../../../src/presentation/web/browser-scheduler.ts';
import { createAccessRenewer } from '../../../src/presentation/web/access-renewer.ts';

describe('browser-scheduler (T581, SC-ALM-032)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('[SC-ALM-032] after ejecuta la función tras ms milisegundos exactos y no antes', () => {
    const run = vi.fn();
    browserScheduler.after(run, 5_000);
    vi.advanceTimersByTime(4_999);
    expect(run).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('[SC-ALM-032] la función devuelta cancela la ejecución programada', () => {
    const run = vi.fn();
    const cancel = browserScheduler.after(run, 5_000);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(0);
  });

  it('[SC-ALM-032] browserRenewal.now es el reloj real (Date.now)', () => {
    vi.setSystemTime(new Date('2026-11-17T10:00:00.000Z'));
    expect(browserRenewal.now()).toBe(Date.parse('2026-11-17T10:00:00.000Z'));
  });

  it('[SC-ALM-032] con el renovador: pide la URL nueva al 80 % de un permiso de 300 s y stop cancela', async () => {
    vi.setSystemTime(new Date('2026-11-17T10:00:00.000Z'));
    const fetchAccess = vi.fn(async () => ({ url: 'https://b.storage.googleapis.com/x', expiresAt: new Date(browserRenewal.now() + 300_000).toISOString(), mime: 'image/png' as const }));
    const renewer = createAccessRenewer({ fetchAccess, onUrl: () => undefined, onError: () => undefined, ...browserRenewal });
    await renewer.start();
    await vi.advanceTimersByTimeAsync(239_999);
    expect(fetchAccess).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchAccess).toHaveBeenCalledTimes(2);
    renewer.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchAccess).toHaveBeenCalledTimes(2);
  });

  it('[REQ-UI-002] MediaPanel usa browserRenewal por defecto y ya no declara el planificador nulo', () => {
    const panel = readFileSync('src/presentation/web/components/MediaPanel.tsx', 'utf8');
    expect([panel.includes("from '../browser-scheduler.ts'"), panel.includes('NO_RENEWAL')]).toEqual([true, false]);
  });

  it('[REQ-UI-002] el módulo no hace peticiones ni toca la API (solo reloj y temporizador)', () => {
    const code = readFileSync('src/presentation/web/browser-scheduler.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(/\bfetch\b|\bapi\b|unwrap|\.(?:GET|POST|PUT|PATCH|DELETE)\(/.test(code)).toBe(false);
  });
});
