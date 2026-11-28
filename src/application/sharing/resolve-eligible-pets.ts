/**
 * Elegibilidad por lote del subconjunto `PETS` (ENM-005-E 0.2.2, annex §3.3, REQ-VET12-003, INV-VET12-001/002): una SOLA consulta del puerto acotada a 20 ids devuelve las mascotas pedidas que están asignadas AHORA
 * al hogar y sobre las que el creador es propietario principal o co-propietario `ACTIVE` (ENM-005-A), ordenadas por `(name ASC, id ASC)` (REQ-PET-005); y si el creador tiene alguna elegible en TODO el hogar (insumo del
 * `403` independiente del cuerpo). Una mascota fallecida sigue elegible (EDGE-012-022). No hay oráculo: el llamador no distingue inexistente de ajena.
 *
 * @implements REQ-VET12-003, INV-VET12-001, INV-VET12-002, EDGE-012-022
 */
import type { RepositorySet } from '../ports/repositories.port.ts';
import type { PetsEligibility } from '../ports/share-link.port.ts';

export async function resolveEligiblePets(repositories: RepositorySet, input: { readonly userId: string; readonly householdId: string; readonly petIds: readonly string[] }): Promise<PetsEligibility> {
  return repositories.shareLinkPets.resolveEligible(input);
}
