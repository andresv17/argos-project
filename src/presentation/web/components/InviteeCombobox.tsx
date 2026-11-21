/**
 * Combobox accesible para invitar por `username` (feature 008, `[GH:#24]`, T1191): rol `combobox` con lista `listbox`, teclado (flechas, Enter elige, Escape cierra),
 * anuncio de resultados en una región `status`, espera de 300 ms sin teclear y descarte de respuestas obsoletas (EDGE-008-047). Solo sugiere: se puede escribir un
 * `username` completo sin elegir (la invitación sigue siendo uniforme, REQ-HOUSE2-001). Objetivos de 44 px. Sin coincidencias muestra el mensaje neutro de D8-11.
 *
 * @implements REQ-INV8-001, REQ-INV8-005, NFR-008-002, EDGE-008-047
 */
import { useEffect, useReducer, useRef } from 'react';
import { ApiProblem, unwrap } from '../api.ts';
import {
  INITIAL_INVITEE_STATE,
  canSearchInvitees,
  inviteeAnnouncement,
  inviteeOptionId,
  inviteeReducer,
  INVITEE_EMPTY_MESSAGE,
  type InviteeState,
} from '../invitee-search.ts';
import { useSession } from '../session.tsx';
import { useDebouncedValue } from '../use-debounced-value.ts';
import type { FieldErrors } from '../validation.ts';

/** Marcado del combobox para un estado dado (presentacional: lo ejercen las pruebas con `renderToStaticMarkup`). */
export function InviteeComboboxView({ id, label, name, errors, state, onType, onKey, onPick, onBlur, required = true }: {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly errors: FieldErrors;
  readonly state: InviteeState;
  readonly onType: (value: string) => void;
  readonly onKey: (key: string) => boolean;
  readonly onPick: (index: number) => void;
  readonly onBlur?: () => void;
  readonly required?: boolean;
}): JSX.Element {
  const error = errors[name];
  const listId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const errorId = `${id}-error`;
  const showList = state.open && state.status === 'ready' && state.items.length > 0;
  const showEmpty = state.open && state.status === 'ready' && state.items.length === 0;
  const describedBy = [statusId, error === undefined ? null : errorId].filter((v) => v !== null).join(' ');
  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required={required}
        value={state.query}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-describedby={describedBy}
        {...(showList && state.activeIndex >= 0 ? { 'aria-activedescendant': inviteeOptionId(id, state.activeIndex) } : {})}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(e) => onType(e.target.value)}
        onKeyDown={(e) => {
          if (onKey(e.key)) e.preventDefault();
        }}
        {...(onBlur === undefined ? {} : { onBlur })}
        className="min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 py-3 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Usuarios disponibles"
        hidden={!showList}
        className="absolute left-0 top-full z-10 mt-1 w-full min-w-48 rounded-xl border border-border-strong bg-white p-1 shadow-md"
      >
        {showList
          ? state.items.map((username, index) => (
              <li
                key={username}
                id={inviteeOptionId(id, index)}
                role="option"
                aria-selected={index === state.activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault(); // evita que el campo pierda el foco antes del clic
                  onPick(index);
                }}
                className={`flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-text-primary ${index === state.activeIndex ? 'bg-meadow font-semibold' : ''}`}
              >
                {username}
              </li>
            ))
          : null}
      </ul>
      {showEmpty ? <p className="text-sm text-text-muted">{INVITEE_EMPTY_MESSAGE}</p> : null}
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {showEmpty ? '' : inviteeAnnouncement(state)}
      </p>
      {state.open && (state.status === 'rate-limited' || state.status === 'failed') ? <p className="text-sm text-red-800">{inviteeAnnouncement(state)}</p> : null}
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

/** Combobox conectado a la API: consulta `GET /households/{householdId}/invitees` con el prefijo ya esperado 300 ms. */
export function InviteeCombobox({ id, householdId, label, name, value, onChange, errors }: {
  readonly id: string;
  readonly householdId: string;
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (name: string, value: string) => void;
  readonly errors: FieldErrors;
}): JSX.Element {
  const { api } = useSession();
  const [state, dispatch] = useReducer(inviteeReducer, { ...INITIAL_INVITEE_STATE, query: value });
  const debounced = useDebouncedValue(state.query);
  const chosen = useRef<string | null>(null); // la sugerencia elegida no vuelve a lanzar una búsqueda

  // El formulario manda cuando se reinicia (tras invitar): se sincroniza el campo sin lanzar una búsqueda.
  useEffect(() => {
    if (value !== state.query) dispatch({ type: 'TYPE', query: value });
  }, [value]);

  useEffect(() => {
    if (!canSearchInvitees(debounced) || debounced !== state.query || debounced === chosen.current) return;
    const requestId = state.latest;
    dispatch({ type: 'REQUEST', requestId });
    unwrap(api.GET('/households/{householdId}/invitees', { params: { path: { householdId }, query: { q: debounced.trim() } } }))
      .then((result) => dispatch({ type: 'RESULTS', requestId, items: result.items.map((item) => item.username) }))
      .catch((failure: unknown) => dispatch({ type: 'FAILED', requestId, rateLimited: failure instanceof ApiProblem && failure.problem.code === 'ERR-RATE-LIMITED' }));
  }, [debounced]);

  const pick = (index: number): void => {
    const username = state.items[index];
    if (username === undefined) return;
    chosen.current = username;
    onChange(name, username);
    dispatch({ type: 'PICK' });
  };

  return (
    <InviteeComboboxView
      id={id}
      label={label}
      name={name}
      errors={errors}
      state={state}
      onType={(next) => {
        chosen.current = null;
        onChange(name, next);
        dispatch({ type: 'TYPE', query: next });
      }}
      onKey={(key) => {
        if (key === 'Enter' && state.open && state.activeIndex >= 0) {
          const username = state.items[state.activeIndex]!;
          chosen.current = username;
          onChange(name, username);
          dispatch({ type: 'PICK' });
          return true; // Enter elige la sugerencia en lugar de enviar el formulario
        }
        if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Escape') {
          dispatch({ type: 'KEY', key });
          return key !== 'Escape' || state.open;
        }
        return false;
      }}
      onPick={pick}
      onBlur={() => dispatch({ type: 'CLOSE' })}
    />
  );
}
