/**
 * Mapeo especie→grupo de dosis (D-B, aprobado por Neo 2026-11-27 y escrito en care-routine.schema.json 0.1.2): CANINE y FELINE a CANINE_FELINE; el resto de las especies, y toda especie
 * desconocida o no mapeada, a OTHER_SPECIES. Función pura, sin I/O.
 *
 * @implements REQ-CAR12-001, SC-012-088
 */
import type { CareSpeciesGroup } from './care-routine.ts';

/** Grupo de umbral de dosis de una especie de la plataforma; toda especie desconocida cae en `OTHER_SPECIES` (sin guarda numérica). */
export function speciesToDoseGroup(species: string): CareSpeciesGroup {
  return species === 'CANINE' || species === 'FELINE' ? 'CANINE_FELINE' : 'OTHER_SPECIES';
}
