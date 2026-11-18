/**
 * Repositorios de la escena (feature 006, ADR-006-07), parte del `UnitOfWork` existente. Aquí solo la forma mínima de los puertos (T827); T834 los amplía con
 * compare-and-set, claim, contadores y arrastre de cuota. Todo es `Promise` (INV-ARCH-005).
 *
 * Orden de candados en toda transacción de la 006 (ADR-006-07, INV-ESC6-003, INV-ESC6-012): propietario -> mascota -> hogar -> escena. El caso de uso toma los
 * suyos primero; el repositorio de escena toma el de la escena al final.
 *
 * @implements INV-ESC6-003, INV-ESC6-012, REQ-ESC6-012, INV-ARCH-005
 */

export const SCENE_LOCK_ORDER = ['OWNER', 'PET', 'HOUSEHOLD', 'SCENE'] as const;
export type SceneLockLevel = (typeof SCENE_LOCK_ORDER)[number];

/** Fila lógica de `home_scenes` (data-model.md §2.1): hogar o, sin hogar, propietario. */
export interface SceneRecord {
  readonly id: string;
  readonly householdId: string | null;
  readonly ownerUserId: string | null;
}

/** Fila lógica de `scene_consents` (data-model.md §2.7). */
export interface SceneConsentRecord {
  readonly userId: string;
  readonly revokedAt: string | null;
}

export interface SceneRepository {
  findById(sceneId: string): Promise<SceneRecord | null>;
}

export interface SceneConsentRepository {
  findByUserId(userId: string): Promise<SceneConsentRecord | null>;
}
