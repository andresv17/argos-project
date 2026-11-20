/**
 * Campo de fecha por segmentos (feature 007, `[GH:#11]`, ADR-007-01): tres campos numéricos `Día`, `Mes` y `Año` dentro de un `fieldset` con leyenda visible. El foco avanza
 * y retrocede según las reglas puras de `date-segments.ts` (REQ-FEC7-002, REQ-FEC7-003); el valor que sale al formulario sigue siendo ISO `YYYY-MM-DD` o cadena vacía
 * (REQ-FEC7-001), de modo que los esquemas y los contratos no cambian. No calcula «hoy» ni valida el calendario: valida el esquema (EDGE-007-001, EDGE-007-022).
 *
 * @implements REQ-FEC7-001, REQ-FEC7-002, REQ-FEC7-003, REQ-FEC7-004, REQ-FEC7-005
 */
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
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
const SEGMENT_WIDTH: Readonly<Record<SegmentName, string>> = { day: 'grow-[2] max-w-16', month: 'grow-[2] max-w-16', year: 'grow-[3] max-w-24' };

const initialSegments = (value: string): DateSegments => parseDateText(value)?.segments ?? EMPTY_SEGMENTS;

export function DateField({ id, label, name, value, onChange, errors, required = false }: DateFieldProps): JSX.Element {
  const error = errors[name];
  const errorId = `${id}-error`;
  const [segments, setSegments] = useState<DateSegments>(() => initialSegments(value));
  const refs = useRef<Record<SegmentName, HTMLInputElement | null>>({ day: null, month: null, year: null });
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

  return (
    <fieldset id={id} className="flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium text-slate-800">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </legend>
      <div className="flex min-w-0 gap-2">
        {SEGMENT_ORDER.map((segment) => (
          <input
            key={segment}
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
            className={`min-h-12 min-w-0 basis-0 ${SEGMENT_WIDTH[segment]} rounded-xl border border-border-strong bg-white px-2 py-3 text-center tabular-nums text-text-primary placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`}
          />
        ))}
      </div>
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </fieldset>
  );
}
