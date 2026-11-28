/**
 * Reglas puras del subconjunto de un enlace `PETS` (ENM-005-E 0.2.2, feature 012, Bloque E): cardinalidad 1..20, repetidos y comparación de conjuntos para la idempotencia.
 * No hay normalización de UUID en el dominio: el esquema de entrada (`Uuid` de 001) ya solo acepta minúsculas (annex §3.3, MEDIA-N1).
 *
 * @implements REQ-VET12-001, REQ-VET12-003, INV-VET12-001, D12-21
 */
import { MAX_SHARE_LINK_PETS } from './share-link.ts';

/** 1 a `MAX_SHARE_LINK_PETS` mascotas (REQ-VET12-001). */
export const isValidPetCount = (count: number): boolean => Number.isInteger(count) && count >= 1 && count <= MAX_SHARE_LINK_PETS;

/** ¿Hay un id repetido? (el mismo texto en minúsculas dos veces; decisión `E-2`: error, no deduplicación silenciosa). */
export const hasRepeatedIds = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

/** Igualdad de conjuntos sin orden (`[A,B]` equivale a `[B,A]`, annex §3.6). */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return set.size === a.length && b.every((id) => set.has(id));
}
