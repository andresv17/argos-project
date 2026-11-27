/**
 * Aviso previo del tope de hogares activos (feature 011, T1550; REQ-HOG11-004, INV-HOG11-001, MIF-011-09): usa la lista de hogares ya cargada, sin endpoint de conteo.
 * La interfaz solo avisa por comodidad; la guarda autoritativa es el servidor (409 ERR-HOG11-HOUSEHOLD-LIMIT-REACHED).
 *
 * @implements REQ-HOG11-004, INV-HOG11-001, SC-011-053, SC-011-054, SC-011-056, EDGE-011-008
 */

/** Espejo de `MAX_HOUSEHOLDS_PER_USER` (app-config.ts, INV-ARCH-006): la presentación no importa de infraestructura; una prueba verifica que ambos valores coincidan. */
export const HOUSEHOLD_LIMIT_MIRROR = 5;

/** Texto del aviso (sin cifra: el detalle del catálogo tampoco la escribe). */
export const HOUSEHOLD_LIMIT_NOTICE = 'Ya perteneces al máximo de hogares permitido. Sal de alguno de tus hogares antes de crear otro o de aceptar una invitación.';

/** ¿La lista cargada ya alcanza o supera el tope? Quien lo supera conserva sus hogares (EDGE-011-008): solo se le avisa. */
export const householdLimitReached = (loadedHouseholds: number): boolean => loadedHouseholds >= HOUSEHOLD_LIMIT_MIRROR;

export type LimitFocusAction = 'CREATE' | 'ACCEPT';
export type LimitFocusTarget = 'CREATE_NOTICE' | 'INVITATIONS_NOTICE' | 'INVITATIONS_HEADING';

/**
 * T1550 S-2 (WCAG 2.4.3): al alcanzar el tope por una acción propia, el botón activado queda deshabilitado y el foco caería en `body`. Devuelve dónde ponerlo: el aviso del formulario
 * tras crear; tras aceptar, el aviso de invitaciones si quedan invitaciones, o el encabezado de la sección si ya no hay. `null` si no hay transición al tope o no fue una acción propia.
 */
export function limitFocusTarget(wasReached: boolean, isReached: boolean, action: LimitFocusAction | null, invitationsLeft: number): LimitFocusTarget | null {
  if (wasReached || !isReached || action === null) return null;
  if (action === 'CREATE') return 'CREATE_NOTICE';
  return invitationsLeft > 0 ? 'INVITATIONS_NOTICE' : 'INVITATIONS_HEADING';
}
