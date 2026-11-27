/** Casos de prueba de `semgrep --test` para argos-no-owner-compare-outside-can-act-on-pet.yml (no es código de la aplicación). */
interface PetRef {
  readonly ownerUserId: string;
}

export function mayEdit(pet: PetRef, userId: string): boolean {
  // ruleid: argos-no-owner-compare-outside-can-act-on-pet
  return pet.ownerUserId === userId;
}

export function isForeign(pet: PetRef, userId: string): boolean {
  // ruleid: argos-no-owner-compare-outside-can-act-on-pet
  return userId !== pet.ownerUserId;
}

export function samePrincipal(a: PetRef, b: PetRef, canActOnPet: (pet: PetRef) => boolean): boolean {
  // ok: argos-no-owner-compare-outside-can-act-on-pet
  return canActOnPet(a) && canActOnPet(b);
}
