/**
 * T557 [US3] patrones triviales del microchip de entrada (REQ-PET4-002, EDGE-020, SC-CAT-029): función pura de dominio.
 * Cubre las 10 secuencias ascendentes, las 10 descendentes y los 10 rellenos módulo 10, y comprueba que un microchip ordinario no se toca.
 */
import { describe, expect, it } from 'vitest';
import { isTrivialMicrochip } from '../../src/domain/pet/microchip-patterns.ts';

const sequence = (start: number, step: number): string => Array.from({ length: 15 }, (_, i) => String((((start + i * step) % 10) + 10) % 10)).join('');
const starts = Array.from({ length: 10 }, (_, n) => n);

describe('isTrivialMicrochip (src/domain/pet/microchip-patterns.ts)', () => {
  it('[REQ-PET4-002] rechaza los 10 rellenos, las 10 ascendentes y las 10 descendentes módulo 10 (incluidas las 4 descendentes que el patrón del contrato no lista)', () => {
    expect(starts.map((n) => isTrivialMicrochip(sequence(n, 0)))).toEqual(starts.map(() => true));
    expect(starts.map((n) => isTrivialMicrochip(sequence(n, 1)))).toEqual(starts.map(() => true));
    expect(starts.map((n) => isTrivialMicrochip(sequence(n, -1)))).toEqual(starts.map(() => true));
    expect([sequence(1, 1), sequence(9, -1), sequence(0, -1), sequence(3, -1), sequence(0, 0)]).toEqual(['123456789012345', '987654321098765', '098765432109876', '321098765432109', '000000000000000']);
  });

  it('[REQ-PET4-002] no marca como trivial un microchip ordinario, uno casi consecutivo ni valores que no son de 15 dígitos', () => {
    for (const value of ['981020000000001', '123456789012346', '123456789012344', '112345678901234', '000000000000001', '987654321098766', '985112345678901']) {
      expect(isTrivialMicrochip(value), value).toBe(false);
    }
    for (const value of ['', '12345678901234', '1234567890123456', '12345678901234a', ' 123456789012345']) expect(isTrivialMicrochip(value), value).toBe(false);
  });
});
