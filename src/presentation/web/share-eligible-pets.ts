/**
 * Mascotas elegibles para el subconjunto de un enlace `PETS` (feature 012, annex §3.2, §4 y §5.3, MEDIA-1 de `/oracle`): con el mismo criterio que el servidor, quien crea puede elegir las que
 * posee como titular principal y las que co-posee como co-propietario `ACTIVE`; el servidor sigue siendo la autoridad (`422` uniforme si algo no es elegible).
 *
 * @implements REQ-VET12-002, INV-VET12-001
 */
import type { CoOwnershipApi } from './co-ownership-api.ts';

export interface SubsetCandidate {
  readonly profile: { readonly id: string; readonly name: string; readonly ownerUserId: string };
}

/**
 * Ids, entre `petIds`, de las mascotas que `userId` co-posee como `ACTIVE`. `known` (las propias como principal) no se consultan. Un fallo o un `404` de una mascota la deja fuera (no se
 * puede probar autoridad): nunca se elige a ciegas.
 */
export async function loadCoOwnedPetIds(api: Pick<CoOwnershipApi, 'getOwnership'>, userId: string, petIds: readonly string[], known: ReadonlySet<string> = new Set()): Promise<ReadonlySet<string>> {
  const todo = petIds.filter((id) => !known.has(id));
  const settled = await Promise.allSettled(todo.map((id) => api.getOwnership(id)));
  const ids = new Set<string>();
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const id = todo[index];
    if (id !== undefined && result.value.principal.userId !== userId && result.value.coOwners.some((row) => row.userId === userId && row.status === 'ACTIVE')) ids.add(id);
  });
  return ids;
}

/** Principales propias + co-poseídas, en el orden de la lista, solo `{ id, name }`. */
export function eligibleSharePets(pets: readonly SubsetCandidate[], userId: string, coOwned: ReadonlySet<string>): { id: string; name: string }[] {
  return pets.filter((p) => p.profile.ownerUserId === userId || coOwned.has(p.profile.id)).map((p) => ({ id: p.profile.id, name: p.profile.name }));
}
