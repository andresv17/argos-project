/**
 * Aviso previo de la revocación entera de un enlace `PETS` (feature 012, ENM-005-E 0.2.2, annex §5.1 y §9(q), condición de `D-1 = (a)` de Neo): antes de desasignar una mascota, salir del hogar,
 * ceder el principal (o salir de la co-propiedad) o degradar un rol, la SPA consulta los enlaces `PETS` visibles para el actor y, si alguno sigue ACTIVE, pide confirmación. Sin enlaces
 * afectados no se avisa. El aviso llega solo al actor (los terceros no reciben nada, EDGE-012-077). Lógica pura: sin React ni red.
 *
 * @implements REQ-VET12-007, PN-08, D-1, EDGE-012-077
 */

/** Texto neutro del aviso previo: la revocación es del enlace ENTERO (PN-08, `D-1 = (a)`). */
export const PETS_ACTION_REVOCATION_NOTICE =
  'Esta acción revoca entero el enlace para el veterinario que incluya las mascotas afectadas: dejará de funcionar de inmediato para todas las mascotas que contiene, también las de otras personas. Para volver a compartirlas tendrás que crear un enlace nuevo.';

/** `true` si algún enlace de la lista sigue ACTIVE (los REVOKED y EXPIRED no se vuelven a tocar, annex §5.1). */
export function hasActivePetsLinks(items: readonly { readonly status: string }[]): boolean {
  return items.some((item) => item.status === 'ACTIVE');
}

/** Solo una degradación (el rol nuevo deja de ser ADMIN) puede revocar los enlaces del miembro (annex §5.1, fila 3); conservar ADMIN no avisa. */
export function roleChangeCanRevokePetsLinks(newRole: string): boolean {
  return newRole !== 'ADMIN';
}

/**
 * Ejecuta `proceed` directamente si no hay enlaces `PETS` activos afectados; si los hay, NO lo ejecuta y llama a `ask(confirmar)`, de modo que la acción solo corre al confirmar.
 * Si la consulta falla (p. ej. un rol sin enlaces, o red), la acción no se bloquea: salir o desasignar nunca queda atrapado por el aviso.
 */
export async function guardPetsRevocation(
  lookup: () => Promise<readonly { readonly status: string }[]>,
  proceed: () => void,
  ask: (confirm: () => void) => void,
): Promise<void> {
  let affected = false;
  try {
    affected = hasActivePetsLinks(await lookup());
  } catch {
    affected = false;
  }
  if (affected) ask(proceed);
  else proceed();
}
