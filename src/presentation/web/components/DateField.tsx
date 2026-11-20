/**
 * Campo de fecha por segmentos (feature 007, `[GH:#11]`, ADR-007-01): UN único campo con borde con los segmentos `Día`, `Mes` y `Año` (sin borde, separados por «/») dentro de un
 * `fieldset` con leyenda visible, y un botón de calendario conectado a un `<input type="date">` oculto (`showPicker()` con respaldo seguro). El foco avanza
 * y retrocede según las reglas puras de `date-segments.ts` (REQ-FEC7-002, REQ-FEC7-003); el valor que sale al formulario sigue siendo ISO `YYYY-MM-DD` o cadena vacía
 * (REQ-FEC7-001), de modo que los esquemas y los contratos no cambian. No calcula «hoy» ni valida el calendario: valida el esquema (EDGE-007-001, EDGE-007-022).
 *
 * @implements REQ-FEC7-001, REQ-FEC7-002, REQ-FEC7-003, REQ-FEC7-004, REQ-FEC7-005
 */
import { Fragment, useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import { applySegmentEdit, EMPTY_SEGMENTS, parseDateText, SEGMENT_LENGTH, SEGMENT_ORDER, type DateSegments, type SegmentName } from '../date-segments.ts';
import type { FieldErrors } from '../validation.ts';

interface DateFieldProps {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  /** ISO `YYYY-MM-DD` o cadena vacía. */
  readonly value: string;
  readonly onChange: (name: string, value: string) => void;
  readonly errors: FieldErrors;
  readonly required?: boolean;
}

const SEGMENT_LABEL: Readonly<Record<SegmentName, string>> = { day: 'Día', month: 'Mes', year: 'Año' };
const SEGMENT_PLACEHOLDER: Readonly<Record<SegmentName, string>> = { day: 'DD', month: 'MM', year: 'AAAA' };
const SEGMENT_WIDTH: Readonly<Record<SegmentName, string>> = { day: 'w-9', month: 'w-9', year: 'w-14' };

/** Abre el calendario nativo: `showPicker()` si existe; si falta o lanza (p. ej. sin gesto del usuario), `focus()` y `click()` de respaldo, sin romper el campo. */
export function openNativePicker(picker: HTMLInputElement | null): void {
  if (picker === null) return;
  try {
    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }
  } catch {
    // se sigue con el respaldo
  }
  try {
    picker.focus();
    picker.click();
  } catch {
    // sin selector nativo disponible: el campo sigue siendo utilizable por teclado
  }
}

const initialSegments = (value: string): DateSegments => parseDateText(value)?.segments ?? EMPTY_SEGMENTS;

export function DateField({ id, label, name, value, onChange, errors, required = false }: DateFieldProps): JSX.Element {
  const error = errors[name];
  const errorId = `${id}-error`;
  const [segments, setSegments] = useState<DateSegments>(() => initialSegments(value));
  const refs = useRef<Record<SegmentName, HTMLInputElement | null>>({ day: null, month: null, year: null });
  const pickerRef = useRef<HTMLInputElement | null>(null);
  /** Último valor ISO emitido o recibido: distingue el eco de nuestro propio cambio de un cambio externo (p. ej. el formulario se reinicia tras guardar). */
  const lastIso = useRef(value);
  /** `true` si el `mousedown` en curso llevó el foco al segmento: su `mouseup` no debe colapsar la selección que hizo `onFocus` (si no, escribir sobre un segmento lleno no reemplaza nada). */
  const focusingClick = useRef(false);

  useEffect(() => {
    if (value === lastIso.current) return;
    lastIso.current = value;
    const parsed = parseDateText(value);
    if (parsed !== null) setSegments(parsed.segments);
  }, [value]);

  /** `caretAtEnd`: al retroceder (Backspace) el cursor queda tras el último dígito; al avanzar o pegar, `onFocus` selecciona el contenido para que escribir lo reemplace. */
  const commit = (next: DateSegments, iso: string, focus: SegmentName | null, caretAtEnd = false): void => {
    setSegments(next);
    if (iso !== lastIso.current) {
      lastIso.current = iso;
      onChange(name, iso);
    }
    const target = focus === null ? null : refs.current[focus];
    if (target != null) {
      target.focus();
      if (caretAtEnd) target.setSelectionRange(target.value.length, target.value.length);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>, segment: SegmentName): void => {
    const inputType = (event.nativeEvent as { inputType?: string }).inputType ?? '';
    const result = applySegmentEdit(segments, segment, { kind: 'input', value: event.target.value, deleting: inputType.startsWith('delete') });
    commit(result.segments, result.iso, result.focus);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, segment: SegmentName): void => {
    if (event.key !== 'Backspace') return;
    const result = applySegmentEdit(segments, segment, { kind: 'backspace' });
    if (!result.consumed) return;
    event.preventDefault();
    commit(result.segments, result.iso, result.focus, true);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData('text');
    const parsed = text.trim() === '' ? null : parseDateText(text);
    if (parsed === null) return;
    event.preventDefault();
    commit(parsed.segments, parsed.iso, 'year');
  };

  /** Una fecha elegida en el calendario actualiza los tres segmentos y emite el ISO. */
  const handlePick = (event: ChangeEvent<HTMLInputElement>): void => {
    const parsed = parseDateText(event.target.value);
    if (parsed !== null) commit(parsed.segments, parsed.iso, null);
  };

  return (
    <fieldset id={id} className="flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium text-slate-800">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </legend>
      <div
        className={`relative flex min-h-12 min-w-0 items-center rounded-xl border bg-white pl-3 pr-1 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${error === undefined ? 'border-border-strong' : 'border-danger'}`}
      >
        {SEGMENT_ORDER.map((segment, index) => (
          <Fragment key={segment}>
            {index === 0 ? null : (
              <span aria-hidden="true" className="px-0.5 text-text-muted">
                /
              </span>
            )}
            <input
              ref={(el) => {
                refs.current[segment] = el;
              }}
              name={`${name}-${segment}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={SEGMENT_LENGTH[segment]}
              placeholder={SEGMENT_PLACEHOLDER[segment]}
              aria-label={SEGMENT_LABEL[segment]}
              {...(required ? { 'aria-required': true } : {})}
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby={error === undefined ? undefined : errorId}
              value={segments[segment]}
              onMouseDown={(e) => {
                focusingClick.current = document.activeElement !== e.currentTarget;
              }}
              onMouseUp={(e) => {
                if (!focusingClick.current) return;
                focusingClick.current = false;
                e.preventDefault();
              }}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => handleChange(e, segment)}
              onKeyDown={(e) => handleKeyDown(e, segment)}
              onPaste={handlePaste}
              className={`min-h-12 min-w-0 ${SEGMENT_WIDTH[segment]} border-0 bg-transparent px-1 py-3 text-center tabular-nums text-text-primary placeholder:text-slate-500 focus-visible:outline-none`}
            />
          </Fragment>
        ))}
        <button
          type="button"
          aria-label="Abrir calendario"
          onClick={() => openNativePicker(pickerRef.current)}
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
        <input
          ref={pickerRef}
          type="date"
          name={`${name}-picker`}
          tabIndex={-1}
          aria-hidden="true"
          value={parseDateText(value)?.iso === value ? value : ''}
          onChange={handlePick}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </div>
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </fieldset>
  );
}
