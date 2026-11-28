/**
 * Selector del SUBCONJUNTO de mascotas de un enlace `PETS` (feature 012, Bloque E, T1696; ENM-005-E 0.2.2, REQ-VET12-002, NFR-012-001, SC-012-054, SC-012-064): UN solo componente que
 * usan por igual «Mascotas → [HOGAR] → Compartir» y «Hogares → [HOGAR] → Compartir» (`ShareLinks.tsx` es su único importador; la ficha de la mascota no lo tiene).
 * - Accesibilidad: `fieldset` con `legend`, una casilla NATIVA por mascota con su `label` envolvente (nombre accesible = el de la mascota; solo teclado, sin roles falsos) y una región
 *   `role="status"` `aria-live="polite"` que anuncia «N de M mascotas elegidas» al cambiar la selección.
 * - Tope `max` (20, `MAX_SHARE_LINK_PETS`): con el tope alcanzado las casillas sin marcar quedan deshabilitadas y se avisa; las marcadas siguen operativas para poder quitarlas.
 * - 320 px: columna única que encoge (`min-w-0`, `break-words`), objetivos táctiles de al menos 44 px (`min-h-11`) y foco visible.
 *
 * @implements REQ-VET12-002, REQ-VET12-001, NFR-012-001, SC-012-054, SC-012-064
 */
export const MAX_SHARE_PETS = 20;

export interface SubsetPet {
  readonly id: string;
  readonly name: string;
}

export interface PetSubsetSelectorProps {
  readonly pets: readonly SubsetPet[];
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: string[]) => void;
  /** Tope de mascotas del enlace (20 por defecto). */
  readonly max?: number;
  /** Prefijo de los `id` del DOM (único por instancia). */
  readonly idPrefix?: string;
}

const LEGEND = 'text-sm font-semibold text-slate-900';
const ROW = 'flex min-h-11 min-w-0 items-center gap-2 text-sm text-slate-900';
const INPUT = 'h-5 w-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2 disabled:opacity-60';

export function PetSubsetSelector({ pets, selectedIds, onChange, max = MAX_SHARE_PETS, idPrefix = 'share-pets' }: PetSubsetSelectorProps): JSX.Element {
  const selected = new Set(selectedIds);
  const count = pets.filter((pet) => selected.has(pet.id)).length;
  const atCap = count >= max;
  const toggle = (id: string, checked: boolean): void => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(pets.filter((pet) => next.has(pet.id)).map((pet) => pet.id)); // conserva el orden del hogar
  };
  return (
    <fieldset data-pet-subset className="grid min-w-0 gap-1" aria-describedby={`${idPrefix}-count`}>
      <legend className={LEGEND}>Mascotas que incluirá el enlace</legend>
      <ul className="grid min-w-0 gap-1">
        {pets.map((pet) => {
          const checked = selected.has(pet.id);
          return (
            <li key={pet.id} className="min-w-0">
              <label className={ROW}>
                <input type="checkbox" name="petIds" value={pet.id} checked={checked} disabled={!checked && atCap} onChange={(e) => toggle(pet.id, e.target.checked)} className={INPUT} />
                <span className="min-w-0 break-words">{pet.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p id={`${idPrefix}-count`} role="status" aria-live="polite" className="text-sm font-semibold tabular-nums text-slate-900">{`${count} de ${pets.length} mascotas elegidas`}</p>
      {atCap && pets.length > max ? <p className="text-sm text-text-muted">{`Un enlace admite como máximo ${max} mascotas.`}</p> : null}
    </fieldset>
  );
}
