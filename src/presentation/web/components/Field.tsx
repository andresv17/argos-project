/**
 * Campos de formulario accesibles: etiqueta asociada, error en `aria-describedby` y `aria-invalid`.
 *
 * @implements REQ-UI-004, REQ-UI-005
 */
import type { ReactNode } from 'react';
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
}

export function TextField({ id, label, name, value, onChange, errors, type = 'text', required = false, autoComplete, step }: FieldProps): JSX.Element {
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
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full rounded border border-slate-500 px-3 py-2 text-slate-900"
      />
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
}

export function SelectField({ id, label, name, value, options, onChange, errors }: SelectProps): JSX.Element {
  const error = errors[name];
  const errorId = `${id}-error`;
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
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full rounded border border-slate-500 px-3 py-2 text-slate-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
    <p role="alert" className="rounded border border-red-700 bg-red-50 px-3 py-2 text-sm text-red-900">
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
  const styles = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800',
    secondary: 'border border-slate-600 bg-white text-slate-900 hover:bg-slate-100',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  } as const;
  return (
    <button
      type={type}
      disabled={disabled}
      {...(onClick === undefined ? {} : { onClick })}
      className={`rounded px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
