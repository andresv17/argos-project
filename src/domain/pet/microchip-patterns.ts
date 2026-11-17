/**
 * Patrones triviales del microchip de ENTRADA (REQ-PET4-002, EDGE-020): 15 dígitos iguales y secuencias consecutivas ascendentes o
 * descendentes módulo 10 (`123456789012345`, `987654321098765`, `098765432109876`). Función pura: sin reloj, sin entorno, sin E/S.
 *
 * El patrón `MicrochipInput` del contrato 3.1.0 ya rechaza la mayoría, pero lista mal las descendentes que empiezan en 0, 1, 2 y 3
 * («09876543210-1-2-3-4», …), que nunca coinciden con 15 dígitos. Esta regla de dominio aplica la definición de la spec completa
 * (hallazgo H-K-004T556-1; el contrato lo corrige `/architect`, no se edita aquí). Solo valida la entrada: un microchip ya guardado no se
 * revalida.
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
