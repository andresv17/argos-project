/**
 * Especies de la plataforma (Feature 002): las 8 aprobadas de INV-PET2-001 y su coherencia con `speciesOther`.
 * - `speciesOther` (1 a 60 caracteres) es obligatorio solo con `OTHER` y nulo en las demás especies.
 * - El filtro del listado (REQ-PET2-002) agrupa `CANINE` (Perros), `FELINE` (Gatos) y el resto en `OTHERS`.
 * No hay alertas automáticas de peso ni de edad para ninguna especie (INV-REC2-002, STATE-ALERT-001): este módulo
 * no decide nada clínico.
 *
 * @implements INV-PET2-001, REQ-PET2-001, REQ-PET2-002, ERR-SCHEMA-VALIDATION-FAILED, INV-ARCH-001
 */

import { DomainError, type Species } from '../../generated/index.ts';

/** Las 8 especies aprobadas, en el orden del contrato. */
export const SPECIES = ['CANINE', 'FELINE', 'RABBIT', 'FERRET', 'BIRD', 'REPTILE', 'SMALL_MAMMAL', 'OTHER'] as const satisfies readonly Species[];

/** Grupo del filtro de especie del listado (REQ-PET2-002). */
export type SpeciesFilterGroup = 'CANINE' | 'FELINE' | 'OTHERS';

/** Solo `OTHER` exige `speciesOther`. @implements INV-PET2-001 */
export function isOtherSpecies(species: string): boolean {
  return species === 'OTHER';
}

/** `CANINE` y `FELINE` tienen su filtro; las otras seis especies, incluida `OTHER`, van en `OTHERS`. @implements REQ-PET2-002 */
export function speciesFilterGroup(species: string): SpeciesFilterGroup {
  return species === 'CANINE' ? 'CANINE' : species === 'FELINE' ? 'FELINE' : 'OTHERS';
}

/**
 * INV-PET2-001: `speciesOther` es no nulo exactamente cuando `species` es `OTHER`. El esquema ya lo comprueba en el perfil
 * y en el alta; esta función protege el estado resultante de una edición y las rutas que no pasan por el esquema.
 * @implements INV-PET2-001, ERR-SCHEMA-VALIDATION-FAILED
 */
export function assertSpeciesConsistency(species: string, speciesOther: string | null | undefined): void {
  const present = speciesOther !== null && speciesOther !== undefined;
  if (isOtherSpecies(species) && !present) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'speciesOther es obligatorio cuando species es OTHER (INV-PET2-001).', 'speciesOther');
  }
  if (!isOtherSpecies(species) && present) {
    throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'speciesOther solo se admite cuando species es OTHER (INV-PET2-001).', 'speciesOther');
  }
}
