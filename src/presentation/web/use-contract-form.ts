/**
 * Estado de un formulario validado contra el contrato antes de enviarse a la API.
 * Errores de cliente y de la API con textos del catálogo (REQ-UI-005).
 *
 * @implements REQ-UI-005, REQ-UI-002
 */
import { useState, type FormEvent } from 'react';
import { ApiProblem, catalogProblem, problemMessage } from './api.ts';
import { formValues, validateInput, type FieldErrors, type InputSchema } from './validation.ts';

export interface ContractForm {
  readonly values: Readonly<Record<string, string>>;
  readonly errors: FieldErrors;
  readonly message: string | null;
  readonly busy: boolean;
  onChange(name: string, value: string): void;
  onSubmit(event: FormEvent): Promise<void>;
}

export function useContractForm(options: {
  readonly schema: InputSchema;
  readonly initial: Readonly<Record<string, string>>;
  readonly numeric?: readonly string[];
  readonly resetOnSuccess?: boolean;
  readonly send: (body: Record<string, string | number>) => Promise<void>;
}): ContractForm {
  const { schema, initial, numeric = [], resetOnSuccess = false, send } = options;
  const [values, setValues] = useState<Readonly<Record<string, string>>>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onChange = (name: string, value: string): void => setValues((v) => ({ ...v, [name]: value }));

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const body = formValues(values, numeric);
    const clientErrors = validateInput(schema, body);
    setErrors(clientErrors);
    setMessage(null);
    if (Object.keys(clientErrors).length > 0) return;
    setBusy(true);
    try {
      await send(body);
      if (resetOnSuccess) setValues(initial);
    } catch (error) {
      const problem = error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED');
      const text = problemMessage(problem);
      if (typeof problem.field === 'string') setErrors({ [problem.field]: text });
      setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  return { values, errors, message, busy, onChange, onSubmit };
}
