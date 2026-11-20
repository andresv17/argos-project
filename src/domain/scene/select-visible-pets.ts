/**
 * Selección determinista de las mascotas visibles de la escena (REQ-ESC6-008, D6-11 = A). Orden total: antigüedad de la asignación al hogar ascendente
 * (`assignedAt`, UTC canónico: orden lexicográfico = cronológico, INV-SORT-001) y desempate por `id` ascendente; se muestran las primeras `N`. Pura: sin reloj ni
 * entropía (INV-ESC6-001, INV-ARCH-001); no muta la entrada.
 *
 * @implements REQ-ESC6-008, INV-ESC6-001, INV-ESC6-008, EDGE-ESC6-002, SC-ESC6-006, SC-ESC6-007
 */

export interface AssignedPetRef {
  readonly id: string;
  /** Instante de la asignación de la mascota al hogar (UTC canónico). */
  readonly assignedAt: string;
}

export interface VisiblePets<T extends AssignedPetRef> {
  /** Las primeras `N` en el orden de D6-11. */
  readonly visible: T[];
  /** `M`: todas las mascotas asignadas (para «Se muestran N de M mascotas»). */
  readonly total: number;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function selectVisiblePets<T extends AssignedPetRef>(pets: readonly T[], maxPets: number): VisiblePets<T> {
  if (!Number.isInteger(maxPets) || maxPets < 1) throw new RangeError('maxPets debe ser un entero >= 1');
  const ordered = [...pets].sort((a, b) => compare(a.assignedAt, b.assignedAt) || compare(a.id, b.id));
  return { visible: ordered.slice(0, maxPets), total: pets.length };
}
