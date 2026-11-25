/**
 * Estado de un formulario validado contra el contrato antes de enviarse a la API.
 * Errores de cliente y de la API con textos del catálogo (REQ-UI-005).
 *
 * @implements REQ-UI-005, REQ-UI-002
 */
import { useState, type FormEvent } from 'react';
import { ApiProblem, catalogProblem, problemMessage, type ProblemDetails } from './api.ts';
import { formValues, validateInput, type FieldErrors, type FormBody, type InputSchema } from './validation.ts';

export interface ContractForm {
  readonly values: Readonly<Record<string, string>>;
  readonly errors: FieldErrors;
  readonly message: string | null;
  readonly busy: boolean;
  onChange(name: string, value: string): void;
  onSubmit(event: FormEvent): Promise<void>;
}

/**
 * Reparto de un error de la API entre el campo y el banner inferior: si el error apunta a un campo del formulario se pinta SOLO bajo ese campo; el banner (`message`) se
 * reserva para los errores globales sin campo (o con un campo que el formulario no muestra).
 */
export function problemFeedback(problem: ProblemDetails, knownFields: readonly string[]): { readonly errors: FieldErrors; readonly message: string | null } {
  const text = problemMessage(problem);
  if (typeof problem.field !== 'string') return { errors: {}, message: text };
  return { errors: { [problem.field]: text }, message: knownFields.includes(problem.field) ? null : text };
}

export function useContractForm(options: {
  readonly schema: InputSchema;
  readonly initial: Readonly<Record<string, string>>;
  readonly numeric?: readonly string[];
  readonly booleans?: readonly string[];
  readonly resetOnSuccess?: boolean;
  /** Errores de controles que no pertenecen al esquema del contrato (p. ej. la casilla 18+ de 010); vacío = sin error. */
  readonly extraErrors?: () => FieldErrors;
  readonly send: (body: FormBody) => Promise<void>;
}): ContractForm {
  const { schema, initial, numeric = [], booleans = [], resetOnSuccess = false, extraErrors, send } = options;
  const [values, setValues] = useState<Readonly<Record<string, string>>>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onChange = (name: string, value: string): void => setValues((v) => ({ ...v, [name]: value }));

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const body = formValues(values, numeric, booleans);
    const clientErrors = { ...validateInput(schema, body), ...(extraErrors?.() ?? {}) };
    setErrors(clientErrors);
    setMessage(null);
    if (Object.keys(clientErrors).length > 0) return;
    setBusy(true);
    try {
      await send(body);
      if (resetOnSuccess) setValues(initial);
    } catch (error) {
      const problem = error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED');
      const feedback = problemFeedback(problem, Object.keys(values));
      if (typeof problem.field === 'string') setErrors(feedback.errors);
      setMessage(feedback.message);
    } finally {
      setBusy(false);
    }
  };

  return { values, errors, message, busy, onChange, onSubmit };
}
