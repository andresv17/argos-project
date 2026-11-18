/**
 * Rótulo de un archivo clínico en la vista del veterinario (feature 005, D5-06, EDGE-005-27, INV-005-009): el nombre original es texto del cuidador SIN
 * verificar. Se quitan controles y marcas bidireccionales o de ancho cero, se colapsan los espacios y se recorta a 120 puntos de código; si queda vacío,
 * el rótulo fijo es «Archivo». El escape HTML NO se hace aquí: la vista lo muestra siempre como texto (nunca HTML interpretado).
 *
 * @implements REQ-VET-009, INV-005-009, SC-005-035, EDGE-005-27
 */

export const FILE_LABEL_MAX_CODE_POINTS = 120;
export const FALLBACK_FILE_LABEL = 'Archivo';

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu;

export function fileLabel(originalName: string): string {
  const clean = originalName.replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
  const clipped = [...clean].slice(0, FILE_LABEL_MAX_CODE_POINTS).join('').trim();
  return clipped === '' ? FALLBACK_FILE_LABEL : clipped;
}
