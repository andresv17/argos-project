/**
 * Selector de contexto: "Mis mascotas" y cada hogar ACTIVE, como `tablist` WAI-ARIA con foco itinerante
 * (flechas, Inicio, Fin) y activación automática. Sin recarga de página.
 *
 * @implements REQ-UI-001, REQ-UI-004
 */
import { useRef, type KeyboardEvent } from 'react';
import { nextFocusIndex, type ContextOption } from '../view-model.ts';

export const PET_PANEL_ID = 'pet-panel';

export function ContextSelector({ options, activeId, onSelect }: {
  readonly options: readonly ContextOption[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextFocusIndex(event.key, index, options.length);
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    const option = options[next];
    if (option !== undefined) onSelect(option.id);
  };
  return (
    <div role="tablist" aria-label="Contexto de mascotas" className="flex gap-1 overflow-x-auto p-1">
      {options.map((option, index) => {
        const selected = option.id === activeId;
        return (
          <button
            key={option.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`context-tab-${option.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PET_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(option.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`relative min-h-12 shrink-0 whitespace-nowrap rounded-full px-4 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
              selected ? 'bg-accent font-semibold after:absolute after:inset-x-4 after:bottom-1.5 after:h-0.5 after:bg-primary' : 'font-medium hover:bg-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
