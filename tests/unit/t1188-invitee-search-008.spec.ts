import { describe, expect, it } from 'vitest';
import { INVITEE_SEARCH_MAX_RESULTS, selectInvitees } from '../../src/domain/households/invitee-search.ts';
import { InviteeSearchRateLimiter } from '../../src/infrastructure/http/invitee-search-rate-limit.ts';
import { DomainError } from '../../src/generated/index.ts';

/**
 * T1188 / T1190 (008, bloque J, `[GH:#24]`) piezas puras del autocompletado de colaboradores: selección con exclusiones y tope de 5, y límite de tasa por usuario y por IP.
 * REQ-INV8-001, REQ-INV8-003, REQ-INV8-004, INV-INV8-001, EDGE-008-044, EDGE-008-046; SC-008-048, SC-008-050, SC-008-051.
 */
describe('selección de sugerencias (T1190)', () => {
  it('[REQ-INV8-004][EDGE-008-046][SC-008-050] excluye al invitador, a miembros e invitados sin distinguir mayúsculas y conserva el orden alfabético', () => {
    expect(selectInvitees(['Luna', 'luisa', 'LUCAS', 'lucia.r', 'lupe'], ['LUCIA.R', 'lupe'])).toEqual(['LUCAS', 'luisa', 'Luna']);
  });

  it('[REQ-INV8-001][SC-008-049] devuelve como máximo 5 y la lista vacía cuando todo está excluido o no hay candidatos', () => {
    const many = ['u7', 'u3', 'u1', 'u6', 'u2', 'u5', 'u4'];
    expect([INVITEE_SEARCH_MAX_RESULTS, selectInvitees(many, [])]).toEqual([5, ['u1', 'u2', 'u3', 'u4', 'u5']]);
    expect([selectInvitees([], []), selectInvitees(['ana'], ['ANA'])]).toEqual([[], []]);
  });
});

describe('límite de tasa del autocompletado (T1190)', () => {
  const limits = { maxPerWindow: 3, windowMinutes: 1 };
  const code = (run: () => void): string => {
    try {
      run();
      return 'OK';
    } catch (error) {
      if (error instanceof DomainError) return error.code;
      throw error;
    }
  };

  it('[REQ-INV8-003][SC-008-051] el cuarto intento del mismo usuario en la ventana da ERR-RATE-LIMITED, otro usuario con otra IP no se ve afectado y la ventana se libera', () => {
    let now = 1_000_000;
    const limiter = new InviteeSearchRateLimiter(() => now, limits);
    const results = [1, 2, 3, 4].map(() => code(() => limiter.consume('u1', '10.0.0.1')));
    expect(results).toEqual(['OK', 'OK', 'OK', 'ERR-RATE-LIMITED']);
    expect(code(() => limiter.consume('u2', '10.0.0.2'))).toBe('OK');
    now += 61_000;
    expect(code(() => limiter.consume('u1', '10.0.0.1'))).toBe('OK');
  });

  it('[REQ-INV8-003][SC-008-051] la IP efectiva también se limita aunque cambie el usuario, y un rechazo no prolonga la ventana', () => {
    let now = 5_000_000;
    const limiter = new InviteeSearchRateLimiter(() => now, limits);
    expect(['a', 'b', 'c'].map((u) => code(() => limiter.consume(u, '192.0.2.9')))).toEqual(['OK', 'OK', 'OK']);
    expect(code(() => limiter.consume('d', '192.0.2.9'))).toBe('ERR-RATE-LIMITED');
    now += 30_000;
    expect(code(() => limiter.consume('e', '192.0.2.9'))).toBe('ERR-RATE-LIMITED'); // sigue dentro de la ventana original
    now += 31_000; // 61 s desde los primeros eventos: el rechazo anterior no los extendió
    expect(code(() => limiter.consume('f', '192.0.2.9'))).toBe('OK');
  });
});
