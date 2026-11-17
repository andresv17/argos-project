/**
 * Patrones triviales del microchip de ENTRADA (REQ-PET4-002, EDGE-020): 15 dígitos iguales y secuencias consecutivas ascendentes o
 * descendentes módulo 10 (`123456789012345`, `987654321098765`, `098765432109876`). Función pura: sin reloj, sin entorno, sin E/S.
 *
 * El patrón `MicrochipInput` del contrato 3.1.0 enumera las 20 secuencias consecutivas módulo 10 (10 ascendentes y 10 descendentes; corregido en
 * af2aa3b, H-K-004T556-1, que sustituyó las cuatro descendentes defectuosas que empiezan en 0, 1, 2 y 3) y los 15 dígitos iguales mediante
 * referencia hacia atrás. Esta regla de dominio es defensa en profundidad: aplica la misma definición de REQ-PET4-002 a la entrada que no pasa por
 * el esquema y se mantiene idéntica a él. Solo valida la entrada: un microchip ya guardado no se revalida.
 *
 * @implements REQ-PET4-002, EDGE-020
 */

const MICROCHIP_LENGTH = 15;

/** true si `microchipId` (15 dígitos) es relleno o una secuencia consecutiva módulo 10 (paso +1 o -1 entre dígitos contiguos). */
export function isTrivialMicrochip(microchipId: string): boolean {
  if (!/^\d{15}$/.test(microchipId) || microchipId.length !== MICROCHIP_LENGTH) return false;
  const digits = [...microchipId].map(Number);
  const stepsFromPrevious = digits.slice(1).map((digit, index) => (digit - digits[index]! + 10) % 10);
  return stepsFromPrevious.every((step) => step === 0) || stepsFromPrevious.every((step) => step === 1) || stepsFromPrevious.every((step) => step === 9);
}
