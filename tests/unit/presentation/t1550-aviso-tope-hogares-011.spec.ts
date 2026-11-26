import { describe, expect, it } from 'vitest';
import { MAX_HOUSEHOLDS_PER_USER } from '../../../src/infrastructure/config/app-config.ts';
import { HOUSEHOLD_LIMIT_MIRROR, HOUSEHOLD_LIMIT_NOTICE, householdLimitReached } from '../../../src/presentation/web/household-limit.ts';

/**
 * T1550 (011, Bloque H, #74): aviso previo del tope en la interfaz con la lista ya cargada (MIF-011-09); el servidor sigue siendo la guarda.
 * @implements REQ-HOG11-004, INV-HOG11-001, SC-011-053, SC-011-054, SC-011-056, EDGE-011-008
 */
describe('T1550 aviso del tope de hogares en la interfaz', () => {
  it('[REQ-HOG11-004][INV-HOG11-001] el espejo de la interfaz coincide con la constante única de app-config.ts', () => {
    expect(HOUSEHOLD_LIMIT_MIRROR).toBe(MAX_HOUSEHOLDS_PER_USER);
  });

  it('[SC-011-053][SC-011-054] con 4 hogares cargados no avisa y con 5 sí', () => {
    expect([householdLimitReached(0), householdLimitReached(4), householdLimitReached(5)]).toEqual([false, false, true]);
  });

  it('[EDGE-011-008] quien ya supera el tope también recibe el aviso (conserva sus hogares)', () => {
    expect([householdLimitReached(6), householdLimitReached(12)]).toEqual([true, true]);
  });

  it('[INV-HOG11-001] el texto del aviso no escribe la cifra', () => {
    expect(HOUSEHOLD_LIMIT_NOTICE).not.toMatch(/\d/);
  });
});
