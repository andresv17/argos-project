/**
 * Formulario de alta de un módulo de registros. Solo se monta si `canEdit` (REQ-UI-002).
 *
 * @implements REQ-UI-002, REQ-UI-004
 */
import { useState } from 'react';
import { Button, FormError, SelectField, TextField } from './Field.tsx';
import { initialRecordValues, type RecordModuleSpec } from '../records.ts';
import type { FormBody } from '../validation.ts';
import { useContractForm } from '../use-contract-form.ts';

export function RecordForm({ spec, onSubmit }: {
  readonly spec: RecordModuleSpec;
  readonly onSubmit: (body: FormBody) => Promise<void>;
}): JSX.Element {
  const [saved, setSaved] = useState(false);
  const form = useContractForm({
    schema: spec.schema,
    initial: initialRecordValues(spec),
    numeric: spec.numeric,
    resetOnSuccess: true,
    send: async (body) => {
      setSaved(false);
      await onSubmit(body);
      setSaved(true);
    },
  });
  return (
    <form noValidate aria-labelledby={`form-${spec.id}-title`} onSubmit={(e) => void form.onSubmit(e)} className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <h3 id={`form-${spec.id}-title`} className="text-base font-semibold sm:col-span-2">
        {spec.formTitle}
      </h3>
      {spec.fields.map((field) =>
        field.type === 'select' ? (
          <SelectField
            key={field.name}
            id={`${spec.id}-${field.name}`}
            label={field.label}
            name={field.name}
            value={form.values[field.name] ?? ''}
            options={field.options ?? []}
            onChange={form.onChange}
            errors={form.errors}
          />
        ) : (
          <TextField
            key={field.name}
            id={`${spec.id}-${field.name}`}
            label={field.label}
            name={field.name}
            type={field.type}
            required={field.required}
            {...(field.step === undefined ? {} : { step: field.step })}
            {...(field.inputMode === undefined ? {} : { inputMode: field.inputMode })}
            value={form.values[field.name] ?? ''}
            onChange={form.onChange}
            errors={form.errors}
          />
        ),
      )}
      <div className="sm:col-span-2">
        <FormError errors={form.errors} message={form.message} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={form.busy}>
          Guardar
        </Button>
        {saved ? (
          <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Registro guardado.
          </p>
        ) : null}
      </div>
    </form>
  );
}
