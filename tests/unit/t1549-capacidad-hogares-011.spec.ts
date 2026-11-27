import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as appConfig from '../../src/infrastructure/config/app-config.ts';
import * as policies from '../../src/domain/households/household-policies.ts';
import { ERROR_CATALOG } from '../../src/generated/v37/errors/error-codes.ts';

/**
 * T1549 (011, Bloque H, #74; PRUEBAS ROJAS hasta T1550; `/keymaker`): regla pura y constante del tope de hogares activos por persona.
 * La constante vive solo en `app-config.ts` (INV-ARCH-006) y la regla de dominio recibe el máximo inyectado (sin leer config ni entorno).
 * Se accede por espacio de nombres para que la ausencia de la implementación falle en tiempo de ejecución y no al compilar.
 *
 * @implements REQ-HOG11-004, INV-HOG11-001, SC-011-053, SC-011-054, SC-011-055, SC-011-056, ERR-HOG11-HOUSEHOLD-LIMIT-REACHED
 */
const CODE = 'ERR-HOG11-HOUSEHOLD-LIMIT-REACHED';
type Assert = (activeCount: number, max: number) => unknown;
const assertCapacity = (): Assert => {
  const fn = (policies as Record<string, unknown>)['assertHouseholdCapacity'];
  if (typeof fn !== 'function') throw new Error('assertHouseholdCapacity no existe en household-policies.ts (T1550 pendiente)');
  return fn as Assert;
};
const codeOf = (run: () => unknown): string => {
  try {
    run();
    return 'OK';
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : `THROW:${String(error)}`;
  }
};

describe('T1549 constante MAX_HOUSEHOLDS_PER_USER (REQ-HOG11-004, D11-12 = B+C; SC-011-053)', () => {
  it('[REQ-HOG11-004][SC-011-053] la constante exportada de app-config.ts vale 5 (decisión de Neo)', () => {
    expect((appConfig as Record<string, unknown>)['MAX_HOUSEHOLDS_PER_USER']).toBe(5);
  });

  it('[REQ-HOG11-004][INV-HOG11-001] el catálogo 011 define ERR-HOG11-HOUSEHOLD-LIMIT-REACHED con HTTP 409 y sin el número en el detalle', () => {
    const entry = (ERROR_CATALOG as Record<string, { status: number; invariantRef: string; detailTemplate: string }>)[CODE];
    expect(entry?.status).toBe(409);
    expect(entry?.invariantRef).toBe('INV-HOG11-001');
    expect(entry?.detailTemplate).not.toMatch(/\d/);
  });
});

describe('T1549 regla pura assertHouseholdCapacity(activeCount, max) (INV-HOG11-001; SC-011-053..056)', () => {
  it('[INV-HOG11-001][SC-011-053] con 4 de 5 permite (no lanza) y con 0 también', () => {
    expect(codeOf(() => assertCapacity()(4, 5))).toBe('OK');
    expect(codeOf(() => assertCapacity()(0, 5))).toBe('OK');
  });

  it('[INV-HOG11-001][SC-011-053][EDGE-011-008] con 5 de 5 rechaza y quien ya supera el máximo (7, 12) también rechaza: el error es determinista', () => {
    for (const count of [5, 6, 7, 12]) expect(codeOf(() => assertCapacity()(count, 5))).toBe(CODE);
  });

  it('[INV-HOG11-001][REQ-HOG11-004] el máximo es inyectado: con max = 2 permite 1 y rechaza 2; no lee la constante de configuración', () => {
    expect(codeOf(() => assertCapacity()(1, 2))).toBe('OK');
    expect(codeOf(() => assertCapacity()(2, 2))).toBe(CODE);
  });

  it('[INV-HOG11-001][SC-011-053] el error es DomainError con status 409 y el mismo código en cada llamada (determinista)', () => {
    const grab = () => {
      try {
        assertCapacity()(5, 5);
      } catch (error) {
        return error as { code?: string; status?: number };
      }
      return null;
    };
    const first = grab();
    expect([first?.code, first?.status]).toEqual([CODE, 409]);
    expect(grab()).toEqual(first);
  });

  it('[INV-HOG11-001][REQ-HOG11-004] dominio puro: household-policies.ts no importa app-config ni lee process.env (el máximo se inyecta)', () => {
    const source = readFileSync('src/domain/households/household-policies.ts', 'utf8');
    expect(source).not.toMatch(/app-config/);
    expect(source).not.toMatch(/process\.env/);
  });
});
