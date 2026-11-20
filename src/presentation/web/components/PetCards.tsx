/**
 * Directorio de mascotas: filtros por texto y por los cinco valores del contrato (Todos, Perros, Gatos, Otros y Con
 * alertas sanitarias) y riel de opciones `listbox` WAI-ARIA con foco itinerante (flechas, Inicio, Fin, Enter, Espacio).
 * El riel es un contenedor `flex` con scroll (Opción A de Neo, blueprint §4.8): horizontal bajo `lg`, vertical desde `lg`.
 * Cada opción lleva los datos de la tarjeta del contrato y nunca los calcula.
 *
 * @implements REQ-FAL7-003, REQ-FAL7-007, REQ-UI-001, REQ-UI-004, REQ-UI-007, REQ-UI2-002, REQ-UI2-003, REQ-PET2-002
 */
import { useRef, type KeyboardEvent } from 'react';
import { OwnerBadge } from './OwnerBadge.tsx';
import { PetAvatar } from './PetAvatar.tsx';
import {
  alertsLine,
  alertTone,
  formatAge,
  formatKg,
  isReadOnly,
  nextFocusIndex,
  PET_FILTER_OPTIONS,
  SPECIES_LABEL,
  type AlertTone,
  type PetCardView,
  type PetFilterValue,
  avatarVersionOf,
  deceasedBadgeText,
  livedText,
} from '../view-model.ts';

const FIELD_CLASS =
  'min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 py-3 text-text-primary placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

export function PetFilter({ q, species, onChange }: {
  readonly q: string;
  /** Valor del filtro del contrato; vacío equivale a «Todos». */
  readonly species: PetFilterValue | '';
  readonly onChange: (q: string, species: PetFilterValue | '') => void;
}): JSX.Element {
  return (
    <form role="search" aria-label="Filtrar mascotas" className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800">
        Buscar mascota
        <input
          type="search"
          placeholder="Escribe un nombre"
          aria-label="Buscar mascota por nombre"
          value={q}
          maxLength={50}
          onChange={(e) => onChange(e.target.value, species)}
          className={FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800">
        Filtrar por especie
        <select value={species === '' ? 'ALL' : species} onChange={(e) => onChange(q, e.target.value === 'ALL' ? '' : (e.target.value as PetFilterValue))} className={FIELD_CLASS}>
          {PET_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

const TONE_CLASS: Readonly<Record<AlertTone, string>> = {
  DANGER: 'bg-red-100 text-red-900',
  WARNING: 'bg-amber-100 text-amber-900',
  NEUTRAL: 'bg-slate-100 text-slate-800',
};

export function PetCardList({ cards, activePetId, onSelect, emptyHint }: {
  readonly cards: readonly PetCardView[];
  readonly activePetId: string | null;
  readonly onSelect: (petId: string) => void;
  /** Segunda línea del estado vacío (depende del contexto); sin ella solo se muestra la primera. */
  readonly emptyHint?: string;
}): JSX.Element {
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  if (cards.length === 0) {
    return (
      <div className="text-sm text-slate-800">
        <p className="font-semibold">No hay mascotas en este contexto.</p>
        {emptyHint === undefined ? null : <p className="text-text-muted">{emptyHint}</p>}
      </div>
    );
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
    <ul
      role="listbox"
      aria-label="Mascotas"
      className="flex snap-x gap-3 overflow-x-auto p-1 lg:max-h-[36rem] lg:snap-none lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
    >
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
            className={`flex min-h-12 w-[148px] shrink-0 cursor-pointer snap-start flex-col items-center gap-1 rounded-2xl p-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:w-full ${
              selected ? 'border-2 border-primary bg-accent-soft' : 'border-2 border-transparent bg-white hover:bg-meadow'
            }`}
          >
            <PetAvatar name={card.profile.name} petId={card.profile.id} avatarVersion={avatarVersionOf(card.profile)} colorToken={card.owner.colorToken} size={64} />
            <span className="w-full truncate text-sm font-semibold text-text-primary">{card.profile.name}</span>
            <span className="text-xs tabular-nums text-text-muted">{`${SPECIES_LABEL[card.profile.species]} · ${livedText(card.profile, card.computedAge) ?? formatAge(card.computedAge)}`}</span>
            <span className="text-xs tabular-nums text-text-muted">{formatKg(card.latestWeightKg)}</span>
            {deceasedBadgeText(card.profile) === null ? (
              <span className={`rounded-[10px] px-2 text-xs font-bold ${TONE_CLASS[alertTone(card.alertsSummary)]}`}>{alertsLine(card.alertsSummary)}</span>
            ) : (
              <span className="whitespace-nowrap rounded-[10px] border border-slate-500 bg-slate-100 px-2 text-xs font-bold text-slate-900">{deceasedBadgeText(card.profile)}</span>
            )}
            <OwnerBadge owner={card.owner} readOnly={isReadOnly(card.permissions)} />
          </li>
        );
      })}
    </ul>
  );
}
