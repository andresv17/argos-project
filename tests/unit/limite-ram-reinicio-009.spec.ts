import { describe, expect, it } from 'vitest';
import { SceneRateLimiter, SceneRouteRateLimitedError } from '../../src/infrastructure/http/scene-rate-limit.ts';

/**
 * Limite RAM (009, D9-31): el quinto limite (GENERATE 6/hora en RAM por usuario) tambien se reinicia con «Reiniciar cuota» de /admin: `clearUser(userId)` descarta todos los contadores del
 * usuario y no toca a otros.
 * @implements REQ-CFG9-006, REQ-ESC6-034
 */
const fill = (limiter: SceneRateLimiter, userId: string): void => {
  for (let n = 0; n < 6; n += 1) limiter.consume('GENERATE', userId);
};
const blocked = (limiter: SceneRateLimiter, userId: string, scope: 'GENERATE' | 'PHOTO' = 'GENERATE'): boolean => {
  try {
    limiter.consume(scope, userId);
    return false;
  } catch (error) {
    if (error instanceof SceneRouteRateLimitedError) return true;
    throw error;
  }
};

describe('Limite RAM SceneRateLimiter.clearUser', () => {
  it('agotado el cupo GENERATE el usuario queda bloqueado; tras clearUser puede generar de nuevo', () => {
    const limiter = new SceneRateLimiter(() => 1_000);
    fill(limiter, 'admin');
    expect(blocked(limiter, 'admin')).toBe(true);
    limiter.clearUser('admin');
    expect(blocked(limiter, 'admin')).toBe(false);
  });

  it('otro usuario no se ve afectado: conserva su contador', () => {
    const limiter = new SceneRateLimiter(() => 1_000);
    fill(limiter, 'admin');
    fill(limiter, 'otro');
    limiter.clearUser('admin');
    expect(blocked(limiter, 'otro')).toBe(true);
    expect(blocked(limiter, 'admin')).toBe(false);
  });

  it('limpia tambien PHOTO y CONSENT del usuario y no confunde ids con prefijo comun', () => {
    const limiter = new SceneRateLimiter(() => 1_000);
    for (let n = 0; n < 10; n += 1) limiter.consume('PHOTO', 'u1');
    for (let n = 0; n < 10; n += 1) limiter.consume('PHOTO', 'u1:x');
    limiter.clearUser('u1');
    expect(blocked(limiter, 'u1', 'PHOTO')).toBe(false);
    expect(blocked(limiter, 'u1:x', 'PHOTO')).toBe(true);
  });
});
