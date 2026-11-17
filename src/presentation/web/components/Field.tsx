/**
 * Campos de formulario accesibles: etiqueta asociada, error en `aria-describedby` y `aria-invalid`.
 *
 * @implements REQ-UI-004, REQ-UI-005
 */
import { useState, type ReactNode } from 'react';
import { FORM_ERROR_KEY, type FieldErrors } from '../validation.ts';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (name: string, value: string) => void;
  readonly errors: FieldErrors;
  readonly type?: string;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly step?: string;
  readonly inputMode?: 'numeric' | 'decimal';
  readonly placeholder?: string;
}

export function TextField({ id, label, name, value, onChange, errors, type = 'text', required = false, autoComplete, step, inputMode, placeholder }: FieldProps): JSX.Element {
  const error = errors[name];
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        required={required}
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(step === undefined ? {} : { step })}
        {...(inputMode === undefined ? {} : { inputMode })}
        {...(placeholder === undefined ? {} : { placeholder })}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(e) => onChange(name, e.target.value)}
        className="min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 py-3 text-text-primary placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Campo de contraseña con botón "Mostrar contraseña" (alterna `type`); el botón (nombre accesible visible
 * "Mostrar contraseña", estado en `aria-pressed`, sin `aria-label` para no duplicar el campo en `getByLabel`).
 *
 * @implements REQ-UI-005, REQ-UI-004
 */
export function PasswordField({ id, label, name, value, onChange, errors, required = false, autoComplete }: Omit<FieldProps, 'type' | 'step' | 'inputMode' | 'placeholder'>): JSX.Element {
  const [visible, setVisible] = useState(false);
  const error = errors[name];
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          required={required}
          {...(autoComplete === undefined ? {} : { autoComplete })}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          onChange={(e) => onChange(name, e.target.value)}
          className="min-h-12 w-0 min-w-[14rem] flex-1 basis-56 rounded-xl border border-border-strong bg-white px-3 py-3 text-text-primary placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
        <button
          type="button"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((v) => !v)}
          className="min-h-12 shrink-0 rounded-full border border-primary bg-white px-4 text-sm font-semibold text-primary hover:bg-meadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Mostrar contraseña
        </button>
      </div>
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onChange: (name: string, value: string) => void;
  readonly errors: FieldErrors;
  /** Ayuda fija bajo el selector, asociada con `aria-describedby`. */
  readonly help?: ReactNode;
}

export function SelectField({ id, label, name, value, options, onChange, errors, help }: SelectProps): JSX.Element {
  const error = errors[name];
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [help === undefined ? null : helpId, error === undefined ? null : errorId].filter((x) => x !== null).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
        onChange={(e) => onChange(name, e.target.value)}
        className="min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 py-3 text-text-primary placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {help === undefined ? null : (
        <div id={helpId} className="text-sm text-text-muted">
          {help}
        </div>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

/** Mensaje de error general del formulario (catálogo), anunciado con `role="alert"`. */
export function FormError({ errors, message }: { readonly errors?: FieldErrors; readonly message?: string | null }): JSX.Element | null {
  const text = message ?? errors?.[FORM_ERROR_KEY] ?? null;
  if (text === null || text === undefined) return null;
  return (
    <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
      {text}
    </p>
  );
}

export function Button({ children, type = 'button', onClick, variant = 'primary', disabled = false }: {
  readonly children: ReactNode;
  readonly type?: 'button' | 'submit';
  readonly onClick?: () => void;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly disabled?: boolean;
}): JSX.Element {
  // Botones píldora de 48 px de alto (ui_blueprint §1.4). Contraste: blanco/oliva 9.41:1, blanco/peligro 6.47:1, oliva/blanco 9.41:1.
  const styles = {
    primary: 'bg-primary text-white hover:bg-primary-hover',
    secondary: 'border border-primary bg-white text-primary hover:bg-meadow',
    danger: 'bg-danger text-white hover:bg-red-800',
  } as const;
  return (
    <button
      type={type}
      disabled={disabled}
      {...(onClick === undefined ? {} : { onClick })}
      className={`min-h-12 rounded-full px-5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
