/**
 * PENDIENTE APROBACIÓN NEO (mapeo especie→grupo de dosis).
 * El contrato (care-routine.schema.json 0.1.2) define los grupos `CANINE_FELINE` y `OTHER_SPECIES` pero NO la tabla especie→grupo. Este mapeo es la PROPUESTA del oráculo
 * (acta oracle-012-BlocC-dominio-revalidacion-c439f73, sección 3): CANINE y FELINE a CANINE_FELINE; el resto de las 8 especies a OTHER_SPECIES. Hasta que Neo lo apruebe
 * (y el Architect lo escriba en el contrato) es un valor de trabajo. Función pura, sin I/O.
 *
 * @implements REQ-CAR12-001, SC-012-088
 */
import type { CareSpeciesGroup } from './care-routine.ts';

/** Grupo de umbral de dosis de una especie de la plataforma; toda especie desconocida cae en `OTHER_SPECIES` (sin guarda numérica). */
export function speciesToDoseGroup(species: string): CareSpeciesGroup {
  return species === 'CANINE' || species === 'FELINE' ? 'CANINE_FELINE' : 'OTHER_SPECIES';
}
