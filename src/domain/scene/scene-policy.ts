/**
 * Política de acceso a la escena (REQ-ESC6-020; D6-10 = B; ADR-006-08). Acciones de alcance HOGAR, decididas con el rol del usuario en el hogar; NO amplían
 * `PetAction` ni `RBAC_MATRIX` ni los 9 `PetPermissions` de 002 (precedente: `CREATE_SHARE_LINK`). «ADMIN» es el rol de hogar de 002, no un administrador de
 * plataforma. Subir, reemplazar o borrar la foto del hogar y pulsar «Actualizar» o «Regenerar» exigen propietario del hogar o `ADMIN` (sin hogar explícito, el
 * propietario de la escena, que el caso de uso expresa como `OWNER`); ver exige ser miembro ACTIVE (cualquier rol). Sin rol (`null`) no hay acceso y el caso de uso
 * responde 404 sin revelar la existencia (INV-ESC6-007). Pura (INV-ESC6-001).
 *
 * @implements REQ-ESC6-020, INV-ESC6-007, INV-ESC6-001, SC-ESC6-026, SC-ESC6-049, SC-ESC6-089
 */

/** Rol del usuario en el hogar de la escena; `OWNER` también para el propietario de una escena sin hogar; `null` = sin membresía ACTIVE. */
export type SceneRole = 'OWNER' | 'ADMIN' | 'CAREGIVER' | 'READER' | null;

/** Pulsar «Actualizar imagen del hogar» o «Regenerar escena desde cero». */
export const canGenerateScene = (role: SceneRole): boolean => role === 'OWNER' || role === 'ADMIN';

/** Subir, reemplazar o borrar la foto del hogar (el propietario también borra la subida por un ADMIN). */
export const canManageHouseholdPhoto = (role: SceneRole): boolean => role === 'OWNER' || role === 'ADMIN';

/** Ver la escena y su estado: todo miembro ACTIVE. */
export const canReadScene = (role: SceneRole): boolean => role === 'OWNER' || role === 'ADMIN' || role === 'CAREGIVER' || role === 'READER';
