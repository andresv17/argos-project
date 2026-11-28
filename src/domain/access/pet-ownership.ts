/**
 * Primitiva de propiedad sobre una mascota: el ÚNICO lugar (junto con `can-act-on-pet.ts`, que la consume) donde se compara `ownerUserId` con un usuario (REQ-OWN12-010, INV-ACC2-002; regla
 * Semgrep `argos-no-owner-compare-outside-can-act-on-pet`). Funciones puras, sin I/O. Quien necesite saber si alguien es propietario NO compara `ownerUserId`: llama a estas funciones o a `canActOnPet`.
 *
 * @implements REQ-OWN12-010, INV-ACC2-002, REQ-OWN12-005
 */

/** Fila de co-propiedad mínima que necesita la decisión. */
export interface CoOwnerStatusRef {
  readonly userId: string | null;
  readonly status: string;
}

/** ¿Es el propietario PRINCIPAL (`pets.owner_user_id`, ancla de compatibilidad: respaldo, enlaces `PET` anteriores)? */
export function isPrincipalOfPet(userId: string, pet: { readonly ownerUserId: string }): boolean {
  return pet.ownerUserId === userId;
}

/** ¿Es el principal o un co-propietario `ACTIVE`? Un `user_id` nulo (cuenta suprimida) y cualquier otro estado no otorgan nada. */
export function isOwnerOfPet(userId: string, pet: { readonly ownerUserId: string; readonly coOwners: readonly CoOwnerStatusRef[] }): boolean {
  return isPrincipalOfPet(userId, pet) || pet.coOwners.some((row) => row.userId === userId && row.status === 'ACTIVE');
}
