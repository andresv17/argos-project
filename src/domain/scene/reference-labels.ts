/**
 * Etiqueta semántica CERRADA que acompaña a cada imagen de referencia en la llamada al proveedor (feature 006, enmienda 2026-11-24, defecto del prompt mixto, punto 1):
 * `IMG_1 (living room reference):`, `IMG_2 (previous scene):`, `IMG_3 (Pet 1 - dog):`. Solo se compone con enums del dominio (el tipo de ranura, el ordinal 1-based de la
 * mascota y la palabra de especie de un vocabulario fijo); NUNCA con nombres ni con texto libre (INV-ESC6-010, INV-ESC6-011). Pura (INV-ESC6-001).
 *
 * @implements REQ-ESC6-016, INV-ESC6-010, INV-ESC6-011, INV-ESC6-001, SC-ESC6-104
 */

import { speciesWord } from './pet-phrases.ts';

export type ReferenceSlotKind = { readonly kind: 'HOUSEHOLD' } | { readonly kind: 'SCENE' } | { readonly kind: 'PET'; readonly petOrdinal: number; readonly species: string };

/** Forma cerrada aceptada por el cableado: cualquier otra cadena se descarta y se usa `IMG_n:`. */
export const REFERENCE_LABEL_PATTERN = /^IMG_[1-9][0-9]{0,2} \((?:living room reference|previous scene|Pet [1-9][0-9]{0,2} - (?:dog|cat|rabbit|ferret|bird|reptile|small mammal|other|animal))\):$/;

export function referenceLabel(index: number, slot: ReferenceSlotKind): string {
  const ref = `IMG_${index}`;
  if (slot.kind === 'HOUSEHOLD') return `${ref} (living room reference):`;
  if (slot.kind === 'SCENE') return `${ref} (previous scene):`;
  return `${ref} (Pet ${slot.petOrdinal} - ${speciesWord(slot.species)}):`;
}
