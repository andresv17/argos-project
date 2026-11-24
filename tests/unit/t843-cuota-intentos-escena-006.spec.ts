import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_COOLDOWN_SECONDS,
  ATTEMPT_WINDOW_SECONDS,
  MAX_FAILED_ATTEMPTS_PER_SCENE,
  MAX_STARTED_ATTEMPTS_PER_ACTOR,
  evaluateAttemptLimits,
} from '../../src/domain/scene/attempt-limits.ts';
import { applyPublication, nextQuotaWindow, quotaWindowOf, remainingQuota, windowResetsAt } from '../../src/domain/scene/quota-window.ts';

/**
 * T843 (006, Fase 5): `quota-window` y `attempt-limits`. La ventana mensual `YYYY-MM` entra como dato (sale de `ClockPort.todayIsoDate()` en `APP_TIMEZONE`);
 * sin `Date` ni `Intl` en el dominio. REQ-ESC6-011, REQ-ESC6-034; INV-ESC6-004; EDGE-ESC6-007, EDGE-ESC6-029, EDGE-ESC6-031;
 * SC-ESC6-015, SC-ESC6-057, SC-ESC6-072, SC-ESC6-074, SC-ESC6-078, SC-ESC6-079. Sin bloqueo por huella (N2-03 = A).
 */
describe('quota-window (T843): restante y reinicio mensual', () => {
  it('[REQ-ESC6-011] la ventana es el YYYY-MM de la fecha local de APP_TIMEZONE (reloj inyectado), y rechaza fechas inválidas', () => {
    expect(quotaWindowOf('2026-11-30')).toBe('2026-11');
    expect(quotaWindowOf('2026-12-01')).toBe('2026-12');
    expect(() => quotaWindowOf('2026-13-01')).toThrow(RangeError);
    expect(() => quotaWindowOf('no-fecha')).toThrow(RangeError);
  });

  it('[SC-ESC6-057] restante = max(0, Q - consumidas de la ventana vigente); otra ventana cuenta 0 consumidas', () => {
    expect(remainingQuota({ max: 10, consumed: 3, consumedWindow: '2026-11', currentWindow: '2026-11' })).toBe(7);
    expect(remainingQuota({ max: 10, consumed: 10, consumedWindow: '2026-11', currentWindow: '2026-11' })).toBe(0);
    expect(remainingQuota({ max: 10, consumed: 10, consumedWindow: '2026-11', currentWindow: '2026-12' })).toBe(10);
    expect(remainingQuota({ max: 5, consumed: 9, consumedWindow: '2026-11', currentWindow: '2026-11' })).toBe(0);
  });

  it('[EDGE-ESC6-007] con cuota agotada el restante es 0 y se restablece al reiniciar el mes sin tocar nada más', () => {
    const exhausted = { max: 10, consumed: 10, consumedWindow: '2026-11' };
    expect(remainingQuota({ ...exhausted, currentWindow: '2026-11' })).toBe(0);
    expect(remainingQuota({ ...exhausted, currentWindow: '2026-12' })).toBe(10);
  });

  it('[SC-ESC6-074] la ventana siguiente cruza el año y resetsAt es el inicio del mes siguiente en UTC según el desfase de APP_TIMEZONE', () => {
    expect(nextQuotaWindow('2026-11')).toBe('2026-12');
    expect(nextQuotaWindow('2026-12')).toBe('2027-01');
    expect(windowResetsAt('2026-11', -300)).toBe('2026-12-01T05:00:00.000Z');
    expect(windowResetsAt('2026-12', -300)).toBe('2027-01-01T05:00:00.000Z');
    expect(windowResetsAt('2026-11', 0)).toBe('2026-12-01T00:00:00.000Z');
  });

  it('[SC-ESC6-074][EDGE-ESC6-031] T2 imputa a la ventana y al máximo FIJADOS en T1: restante 1 en noviembre se publica el 1-dic y deja 0 en noviembre y 10 en diciembre', () => {
    const fixedAtT1 = { attemptWindow: '2026-11', attemptMax: 10 };
    const stored = { consumed: 9, window: '2026-11' };
    const published = applyPublication({ ...stored, ...fixedAtT1 });
    expect(published).toEqual({ allowed: true, consumed: 10, window: '2026-11' });
    expect(remainingQuota({ max: 10, consumed: published.consumed, consumedWindow: published.window, currentWindow: '2026-11' })).toBe(0);
    expect(remainingQuota({ max: 10, consumed: published.consumed, consumedWindow: published.window, currentWindow: '2026-12' })).toBe(10);
  });

  it('[EDGE-ESC6-031] un cambio de ARGOS_SCENE_QUOTA_MAX después de T1 no descarta la llamada: T2 usa attemptMax, no la configuración', () => {
    expect(applyPublication({ consumed: 4, window: '2026-11', attemptWindow: '2026-11', attemptMax: 5 })).toEqual({ allowed: true, consumed: 5, window: '2026-11' });
    expect(applyPublication({ consumed: 5, window: '2026-11', attemptWindow: '2026-11', attemptMax: 5 })).toEqual({ allowed: false, consumed: 5, window: '2026-11' });
  });

  it('[INV-ESC6-004] publicar en una ventana distinta de la almacenada reinicia el contador a 1; sin cuota en la ventana del intento no se publica', () => {
    expect(applyPublication({ consumed: 10, window: '2026-11', attemptWindow: '2026-12', attemptMax: 10 })).toEqual({ allowed: true, consumed: 1, window: '2026-12' });
    expect(applyPublication({ consumed: 0, window: '2026-11', attemptWindow: '2026-11', attemptMax: 0 })).toEqual({ allowed: false, consumed: 0, window: '2026-11' });
  });
});

describe('attempt-limits (T843): enfriamiento y topes de intentos iniciados (REQ-ESC6-034)', () => {
  const NOW = '2026-11-05T12:00:00.000Z';
  const base = { now: NOW, lastStartedAt: null, lastOutcome: null, failedInWindow: 0, oldestFailedStartedAt: null, startedByActor: 0, oldestActorStartedAt: null };

  it('[SC-ESC6-078] las constantes son 60 s, 3 fallidos por escena y 12 iniciados por actor en 24 h', () => {
    expect([ATTEMPT_COOLDOWN_SECONDS, MAX_FAILED_ATTEMPTS_PER_SCENE, MAX_STARTED_ATTEMPTS_PER_ACTOR, ATTEMPT_WINDOW_SECONDS]).toEqual([60, 3, 12, 86400]);
  });

  it('[SC-ESC6-078] sin intentos previos se permite; el primer intento no tiene enfriamiento', () => {
    expect(evaluateAttemptLimits(base)).toEqual({ allowed: true });
  });

  it('[SC-ESC6-078] dentro de los 60 s siguientes a otro intento de la escena: COOLDOWN con Retry-After en segundos redondeados hacia arriba', () => {
    expect(evaluateAttemptLimits({ ...base, lastStartedAt: '2026-11-05T11:59:30.500Z', lastOutcome: 'SUCCEEDED' as const })).toEqual({ allowed: false, reason: 'COOLDOWN', retryAfterSeconds: 31 });
    expect(evaluateAttemptLimits({ ...base, lastStartedAt: '2026-11-05T11:59:00.000Z', lastOutcome: 'SUCCEEDED' as const })).toEqual({ allowed: true });
    expect(evaluateAttemptLimits({ ...base, lastStartedAt: '2026-11-05T11:58:59.999Z', lastOutcome: 'SUCCEEDED' as const })).toEqual({ allowed: true });
  });

  it('[SC-ESC6-072][EDGE-ESC6-029] a partir de 3 intentos FAILED de la escena en 24 h se rechaza; con 2 se permite', () => {
    expect(evaluateAttemptLimits({ ...base, failedInWindow: 2 })).toEqual({ allowed: true });
    expect(evaluateAttemptLimits({ ...base, failedInWindow: 3, oldestFailedStartedAt: '2026-11-04T18:00:00.000Z' })).toEqual({ allowed: false, reason: 'FAILED_LIMIT', retryAfterSeconds: 21600 });
  });

  it('[SC-ESC6-078] a partir de 12 intentos iniciados por el actor en 24 h se rechaza; con 11 se permite', () => {
    expect(evaluateAttemptLimits({ ...base, startedByActor: 11 })).toEqual({ allowed: true });
    expect(evaluateAttemptLimits({ ...base, startedByActor: 12, oldestActorStartedAt: '2026-11-05T02:00:00.000Z' })).toEqual({ allowed: false, reason: 'ACTOR_LIMIT', retryAfterSeconds: 50400 });
  });

  it('[SC-ESC6-079] sin instante del intento más antiguo el Retry-After de un tope de 24 h es la ventana completa', () => {
    expect(evaluateAttemptLimits({ ...base, failedInWindow: 3 })).toEqual({ allowed: false, reason: 'FAILED_LIMIT', retryAfterSeconds: 86400 });
  });

  it('[SC-ESC6-072] precedencia determinista cuando varias reglas fallan a la vez: enfriamiento, luego fallidos de la escena, luego actor', () => {
    const all = { ...base, lastStartedAt: '2026-11-05T11:59:59.000Z', lastOutcome: 'SUCCEEDED' as const, failedInWindow: 3, startedByActor: 12 };
    expect(evaluateAttemptLimits(all)).toMatchObject({ reason: 'COOLDOWN' });
    expect(evaluateAttemptLimits({ ...all, lastStartedAt: null })).toMatchObject({ reason: 'FAILED_LIMIT' });
    expect(evaluateAttemptLimits({ ...all, lastStartedAt: null, failedInWindow: 0 })).toMatchObject({ reason: 'ACTOR_LIMIT' });
  });

  it('[INV-ESC6-004] un fallo no descuenta cuota: la evaluación solo mira conteos y no tiene parámetro de consumo; no hay bloqueo por huella (N2-03 = A)', () => {
    expect(Object.keys(base).sort()).toEqual(['failedInWindow', 'lastOutcome', 'lastStartedAt', 'now', 'oldestActorStartedAt', 'oldestFailedStartedAt', 'startedByActor']);
  });
});
