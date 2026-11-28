/**
 * Reglas de presentación de la co-propiedad (Feature 012, #22; H-K1 opción A, S-07). Presentación pura: el servidor sigue rechazando por su cuenta
 * (`ERR-OWN12-APPROVAL-PENDING` en Eliminar/Transferir directos y `ERR-OWN12-LAST-OWNER` al salir del último propietario).
 * @implements REQ-OWN12-004, REQ-OWN12-006, INV-OWN12-004
 */
import type { OwnershipView } from './co-ownership-api.ts';

/** Texto de la mitigación de descubribilidad de H-K1; el enlace es la última frase. */
export const MULTI_OWNER_NOTICE_TEXT = 'Con más de un propietario, eliminar o transferir necesita la aprobación de todos.';
export const MULTI_OWNER_LINK_TEXT = 'Ir a Propietarios';

/** Número de propietarios ACTIVE: el principal más los co-propietarios ACTIVE (las invitaciones pendientes no cuentan). */
export function activeOwnerCount(ownership: Pick<OwnershipView, 'coOwners'>): number {
  return 1 + ownership.coOwners.filter((r) => r.status === 'ACTIVE').length;
}

/** H-K1: con más de un propietario ACTIVE la ficha no ofrece Eliminar ni Transferir. Desconocido (`null`) conserva el comportamiento previo. */
export const hasMultipleActiveOwners = (count: number | null): boolean => count !== null && count > 1;

/** S-07: «Salir de esta mascota» solo existe con más de un propietario ACTIVE. */
export const canOfferLeave = (ownership: Pick<OwnershipView, 'coOwners'>): boolean => activeOwnerCount(ownership) > 1;
