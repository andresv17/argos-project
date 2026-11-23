/**
 * Selección pura de sugerencias del autocompletado de colaboradores (feature 008, `[GH:#24]`): de los usernames candidatos por prefijo se descartan el
 * invitador, los miembros ACTIVE y las cuentas ya invitadas al hogar (comparación por `LOWER`, REQ-LOG-002) y se devuelven como máximo 5 en orden
 * alfabético sin distinguir mayúsculas. La exclusión no cambia la forma de la respuesta (INV-INV8-001).
 *
 * @implements REQ-INV8-001, REQ-INV8-004, INV-INV8-001, EDGE-008-046
 */

/** Tope de sugerencias del contrato (`InviteeSearchResult.items.maxItems`). */
export const INVITEE_SEARCH_MAX_RESULTS = 5;

export function selectInvitees(candidates: readonly string[], excludedUsernames: readonly string[], max: number = INVITEE_SEARCH_MAX_RESULTS): string[] {
  const excluded = new Set(excludedUsernames.map((name) => name.toLowerCase()));
  return [...candidates]
    .filter((name) => !excluded.has(name.toLowerCase()))
    .sort((a, b) => {
      const [x, y] = [a.toLowerCase(), b.toLowerCase()];
      return x < y ? -1 : x > y ? 1 : 0;
    })
    .slice(0, max);
}
