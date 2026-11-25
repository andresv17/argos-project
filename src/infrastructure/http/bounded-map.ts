/**
 * Tope duro de los mapas de los limitadores en memoria (feature 010, `H-T1418-02`, REQ-EDG10-003, SC-010-016): al escribir una clave se la mueve al final del orden de
 * inserción y, si el mapa supera el tope, se descarta la entrada MÁS ANTIGUA (no solo las expiradas). Así ninguna ráfaga de claves distintas hace crecer el mapa sin límite.
 *
 * @implements REQ-EDG10-003, SC-010-016
 */

export const DEFAULT_MAX_TRACKED = 10_000;

export function setBounded<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done === true) break;
    map.delete(oldest.value);
  }
}
