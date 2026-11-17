/**
 * Clasificación de la violación de la restricción única global del microchip (REQ-PET4-001, INV-PET4-001).
 * El microchip es único en todo el sistema (`pets_microchip_global`): un duplicado, propio o de otro propietario, lo detecta SOLO la base al
 * guardar (una sola ruta de código, sin consulta previa por propietario) y el caso de uso lo mapea al mismo error uniforme.
 * - Postgres: `code = 23505` Y `constraint = pets_microchip_global` (nombre exacto).
 * - SQLite: `code = SQLITE_CONSTRAINT_UNIQUE` Y mensaje exacto `UNIQUE constraint failed: pets.microchip_id` (el índice antiguo por propietario
 *   decía `pets.owner_user_id, pets.microchip_id`).
 * Cualquier otra violación (CHECK, NOT NULL, otro índice, clave primaria) NO es un duplicado y se relanza tal cual. El objeto de error del
 * driver (`detail`, `constraint`, parámetros) nunca se copia al error de dominio, que no lleva `cause`, el microchip ni identificadores.
 *
 * @implements REQ-PET4-001, INV-PET4-001, ERR-PET-MICROCHIP-DUPLICATE
 */
// El catálogo 3.1.0 cambia el detalle («Este microchip ya está registrado en ARGOS…») y el invariante (INV-PET4-001): clase 3.1.0 del mismo contrato.
import { DomainError } from '../../generated/v31/index.ts';

const MICROCHIP_CONSTRAINT = 'pets_microchip_global';
const SQLITE_MICROCHIP_MESSAGE = 'UNIQUE constraint failed: pets.microchip_id';

export function isMicrochipGlobalViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint, message } = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (code === '23505') return constraint === MICROCHIP_CONSTRAINT;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return message === SQLITE_MICROCHIP_MESSAGE;
  return false;
}

/** Ejecuta el guardado y mapea SOLO la violación de `pets_microchip_global` a ERR-PET-MICROCHIP-DUPLICATE (409, campo `microchipId`). */
export async function mapMicrochipViolation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMicrochipGlobalViolation(error)) throw new DomainError('ERR-PET-MICROCHIP-DUPLICATE', undefined, 'microchipId');
    throw error;
  }
}
