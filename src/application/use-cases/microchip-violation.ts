/**
 * Clasificación de la violación de la restricción única global del microchip (REQ-PET4-001, INV-PET4-001).
 * ESQUELETO de T552 (rojo): las pruebas compilan y fallan; la implementación llega con T554.
 *
 * @implements REQ-PET4-001, INV-PET4-001
 */

export function isMicrochipGlobalViolation(_error: unknown): boolean {
  return false;
}

export async function mapMicrochipViolation<T>(work: () => Promise<T>): Promise<T> {
  return work();
}
