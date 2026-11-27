/**
 * Decisión del modo de generación y asignación de ranuras `IMG_n` (REQ-ESC6-006, REQ-ESC6-007, REQ-ESC6-009, REQ-ESC6-010; D6-08 = A). El servidor decide el modo,
 * no el cliente. Precedencia: `REGENERATE` > ausencia de imagen vigente > cambio de la foto del hogar (`FROM_SCRATCH`) > incrementales (con más de un tipo entre
 * ADD, REMOVE y REPLACE: `INCREMENTAL_MIXED`). Ranuras: `IMG_1` = escena previa (incremental) o foto del hogar (desde cero, si existe); luego las mascotas con
 * foto de las que se dibujan (`RENDER`, `ADD`, `REPLACE`) en el orden de selección y, a continuación, las `KEEP` con foto vigente de los modos incrementales (N2-16 B, D6-20). Función pura (INV-ESC6-001): sin reloj, entropía ni E/S.
 *
 * @implements REQ-ESC6-006, REQ-ESC6-007, REQ-ESC6-009, REQ-ESC6-010, INV-ESC6-001, EDGE-ESC6-008, EDGE-ESC6-010, SC-ESC6-056
 */

import { canonicalJson } from '../audit/canonical-json.ts';
import type { AssetRef, PetAction, SceneMode } from '../../generated/v34/schemas/types.ts';
import { countPendingChanges, type InputsSnapshot, type SnapshotPet } from './inputs-snapshot.ts';

export type SceneRequestAction = 'UPDATE' | 'REGENERATE';

export interface DecideModeInput {
  /** Entradas de la última generación publicada (`null` si nunca hubo imagen). */
  readonly last: InputsSnapshot | null;
  /** Entradas visibles actuales. */
  readonly now: InputsSnapshot;
  /** Existe imagen vigente. */
  readonly hasImage: boolean;
  readonly action: SceneRequestAction;
}

export interface PetPlan {
  readonly petId: string;
  readonly action: PetAction;
  /** Ranura de la foto de referencia o `null` (sin foto o no se envía). */
  readonly ref: AssetRef | null;
}

export interface ChangeCounts {
  readonly household: number;
  readonly added: number;
  readonly removed: number;
  readonly replaced: number;
  readonly total: number;
}

export interface ModePlan {
  readonly mode: SceneMode;
  /** Mascotas visibles en su orden y, al final, las retiradas (`REMOVE`) de los modos incrementales. */
  readonly pets: readonly PetPlan[];
  readonly currentSceneRef: AssetRef | null;
  readonly householdRef: AssetRef | null;
  /** Total de imágenes de referencia que el worker debe resolver. */
  readonly slotCount: number;
  readonly counts: ChangeCounts;
}

const slot = (n: number): AssetRef => `IMG_${n}`;

function classify(last: InputsSnapshot, now: InputsSnapshot): { added: SnapshotPet[]; removed: SnapshotPet[]; replaced: Set<string> } {
  const before = new Map(last.pets.map((p) => [p.id, p]));
  const current = new Set(now.pets.map((p) => p.id));
  const added = now.pets.filter((p) => !before.has(p.id));
  const removed = last.pets.filter((p) => !current.has(p.id));
  const replaced = new Set(now.pets.filter((p) => before.has(p.id) && canonicalJson(before.get(p.id)) !== canonicalJson(p)).map((p) => p.id));
  return { added, removed, replaced };
}

export function decideMode(input: DecideModeInput): ModePlan | null {
  const { last, now, hasImage, action } = input;
  const base = last ?? { v: 2 as const, household: null, pets: [] };
  const { added, removed, replaced } = classify(base, now);
  const householdChanged = base.household !== now.household;
  const counts: ChangeCounts = {
    household: householdChanged ? 1 : 0,
    added: added.length,
    removed: removed.length,
    replaced: replaced.size,
    total: countPendingChanges(last, now),
  };

  const scratch = action === 'REGENERATE' || !hasImage || householdChanged;
  if (!scratch && counts.total === 0) return null;

  let mode: SceneMode;
  if (action === 'REGENERATE') mode = 'REGENERATE';
  else if (scratch) mode = 'FROM_SCRATCH';
  else {
    const kinds = [counts.added, counts.removed, counts.replaced].filter((n) => n > 0).length;
    mode = kinds > 1 ? 'INCREMENTAL_MIXED' : counts.added > 0 ? 'INCREMENTAL_ADD' : counts.removed > 0 ? 'INCREMENTAL_REMOVE' : 'INCREMENTAL_REPLACE';
  }

  let next = 1;
  const currentSceneRef = scratch ? null : slot(next++);
  const householdRef = scratch && now.household !== null ? slot(next++) : null;
  const addedIds = new Set(added.map((p) => p.id));
  const actionOf = (id: string): PetAction => (scratch ? 'RENDER' : addedIds.has(id) ? 'ADD' : replaced.has(id) ? 'REPLACE' : 'KEEP');
  // N2-16 (B): primero las ranuras de las mascotas que se dibujan (RENDER, ADD, REPLACE) y después las de las KEEP con foto vigente (D6-20), de modo que ante el tope
  // de bytes las KEEP se descartan antes (la escena previa, IMG_1, nunca). Dentro de cada grupo, orden de selección.
  const refs = new Map<string, AssetRef>();
  for (const p of now.pets) if (actionOf(p.id) !== 'KEEP' && p.photo !== null) refs.set(p.id, slot(next++));
  if (mode !== 'INCREMENTAL_REMOVE') for (const p of now.pets) if (actionOf(p.id) === 'KEEP' && p.photo !== null) refs.set(p.id, slot(next++));
  const pets: PetPlan[] = now.pets.map((p) => ({ petId: p.id, action: actionOf(p.id), ref: refs.get(p.id) ?? null }));
  if (!scratch) for (const p of removed) pets.push({ petId: p.id, action: 'REMOVE', ref: null });

  return { mode, pets, currentSceneRef, householdRef, slotCount: next - 1, counts };
}
