/**
 * Formulario de alta de un módulo de registros. Solo se monta si `canEdit` (REQ-UI-002).
 *
 * @implements REQ-UI-002, REQ-UI-004
 */
import { Button, FormError, SelectField, TextField } from './Field.tsx';
import { initialRecordValues, type RecordModuleSpec } from '../records.ts';
import { useContractForm } from '../use-contract-form.ts';

export function RecordForm({ spec, onSubmit }: {
  readonly spec: RecordModuleSpec;
  readonly onSubmit: (body: Record<string, string | number>) => Promise<void>;
}): JSX.Element {
  const form = useContractForm({ schema: spec.schema, initial: initialRecordValues(spec), numeric: spec.numeric, resetOnSuccess: true, send: onSubmit });
  return (
    <form noValidate aria-labelledby={`form-${spec.id}-title`} onSubmit={(e) => void form.onSubmit(e)} className="mt-4 grid gap-3 rounded border border-slate-300 bg-white p-4 sm:grid-cols-2">
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
            value={form.values[field.name] ?? ''}
            onChange={form.onChange}
            errors={form.errors}
          />
        ),
      )}
      <div className="sm:col-span-2">
        <FormError errors={form.errors} message={form.message} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={form.busy}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
