/**
 * Tarjetas de mascota como `listbox` WAI-ARIA (foco itinerante, flechas, Inicio, Fin) con filtro por nombre y
 * especie. Cada tarjeta: especie, nombre, edad, dueño y contador de alertas OVERDUE/DUE_SOON. Escala con scroll.
 *
 * @implements REQ-UI-001, REQ-UI-004, REQ-UI-007
 */
import { useRef, type KeyboardEvent } from 'react';
import { OwnerBadge } from './OwnerBadge.tsx';
import { alertCounters, formatAge, formatKg, nextFocusIndex, SPECIES_LABEL, type PetCardView, type Species } from '../view-model.ts';

export function PetFilter({ q, species, onChange }: {
  readonly q: string;
  readonly species: Species | '';
  readonly onChange: (q: string, species: Species | '') => void;
}): JSX.Element {
  return (
    <form role="search" aria-label="Filtrar mascotas" className="flex flex-wrap gap-3" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col text-sm font-medium text-slate-800">
        Nombre
        <input
          type="search"
          value={q}
          maxLength={50}
          onChange={(e) => onChange(e.target.value, species)}
          className="rounded border border-slate-500 px-3 py-2 text-slate-900"
        />
      </label>
      <label className="flex flex-col text-sm font-medium text-slate-800">
        Especie
        <select
          value={species}
          onChange={(e) => onChange(q, e.target.value as Species | '')}
          className="rounded border border-slate-500 px-3 py-2 text-slate-900"
        >
          <option value="">Todas</option>
          <option value="DOG">{SPECIES_LABEL.DOG}</option>
          <option value="CAT">{SPECIES_LABEL.CAT}</option>
        </select>
      </label>
    </form>
  );
}

export function PetCardList({ cards, activePetId, onSelect }: {
  readonly cards: readonly PetCardView[];
  readonly activePetId: string | null;
  readonly onSelect: (petId: string) => void;
}): JSX.Element {
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  if (cards.length === 0) {
    return <p className="text-slate-700">No hay mascotas en este contexto.</p>;
  }
  const focusIndex = Math.max(0, cards.findIndex((c) => c.profile.id === activePetId));
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const card = cards[index];
      if (card !== undefined) onSelect(card.profile.id);
      return;
    }
    const next = nextFocusIndex(event.key, index, cards.length);
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    const card = cards[next];
    if (card !== undefined) onSelect(card.profile.id);
  };
  return (
    <ul role="listbox" aria-label="Mascotas" className="grid max-h-[32rem] grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-1">
      {cards.map((card, index) => {
        const selected = card.profile.id === activePetId;
        return (
          <li
            key={card.profile.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="option"
            aria-selected={selected}
            tabIndex={index === focusIndex ? 0 : -1}
            data-pet-id={card.profile.id}
            onClick={() => onSelect(card.profile.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`cursor-pointer rounded-lg border bg-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              selected ? 'border-blue-700 ring-1 ring-blue-700' : 'border-slate-300'
            }`}
          >
            <p className="text-base font-semibold text-slate-900">{card.profile.name}</p>
            <p className="text-sm text-slate-700">
              {SPECIES_LABEL[card.profile.species]} · {formatAge(card.computedAge)} · {formatKg(card.latestWeightKg)}
            </p>
            <p className="text-sm text-slate-700">Alertas: {alertCounters(card.alertsSummary)}</p>
            <OwnerBadge owner={card.owner} canEdit={card.canEdit} />
          </li>
        );
      })}
    </ul>
  );
}
