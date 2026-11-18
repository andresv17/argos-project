/**
 * Formulario de alta de un módulo de registros. Solo se monta si `canEdit` (REQ-UI-002). En «Parámetros», la categoría «Síntoma» añade
 * el tipo, la intensidad con su ayuda fija y la leyenda veterinaria (REQ-SIN-001, REQ-SIN-003); todo es presentación y el servidor valida.
 *
 * @implements REQ-UI-002, REQ-UI-004, REQ-SIN-001, REQ-SIN-003, INV-SIN-002, REQ-CAN-001
 */
import { useState } from 'react';
import { FormError, SelectField, TextField } from './Field.tsx';
import { FormActions, cancelForm } from './FormActions.tsx';
import { SymptomLegend } from './SymptomLegend.tsx';
import { initialRecordValues, type RecordModuleSpec } from '../records.ts';
import {
  NO_VOMIT_NOTICE,
  SEVERITY_LABEL,
  SYMPTOM_DESCRIPTION_PLACEHOLDER,
  SYMPTOM_FOOTER,
  SYMPTOM_LEVEL_HELP,
  SYMPTOM_SEVERITIES,
  SYMPTOM_TYPE_LABEL,
  hidesVomit,
  isSymptomType,
  symptomTypeOptions,
  syncSymptomTitle,
} from '../symptoms.ts';
import type { FormBody } from '../validation.ts';
import { useContractForm } from '../use-contract-form.ts';
import type { Species } from '../view-model.ts';

/** Valores de un síntoma al elegir la categoría: primer tipo ofrecido para la especie, intensidad «Leve» y `title` con el rótulo del tipo. */
function symptomDefaults(species: Species, given: Readonly<Record<string, string>>): Record<string, string> {
  const type = given['symptomType'] ?? symptomTypeOptions(species)[0]!.value;
  const title = given['title'] ?? (isSymptomType(type) ? SYMPTOM_TYPE_LABEL[type] : '');
  return {
    symptomType: type,
    severity: given['severity'] ?? SYMPTOM_SEVERITIES[0]!,
    title,
  };
}

/** Al salir de la categoría «Síntoma», tipo e intensidad se vacían para que no viajen en el cuerpo. */
const NO_SYMPTOM_FIELDS: Readonly<Record<string, string>> = {
  symptomType: '',
  severity: '',
};

export function RecordForm({ spec, onSubmit, onCancel, species = 'CANINE', initial: given = {} }: {
  readonly spec: RecordModuleSpec;
  readonly onSubmit: (body: FormBody) => Promise<void>;
  /** Solo en edición: cierra el formulario sin guardar ni pedir confirmación (REQ-CAN-001, D5-09). */
  readonly onCancel?: () => void;
  /** Especie de la mascota: decide si «Vómito» se ofrece en el tipo de síntoma (D-17 A). */
  readonly species?: Species;
  /** Valores iniciales que reemplazan a los de la primera opción de cada selector. */
  readonly initial?: Readonly<Record<string, string>>;
}): JSX.Element {
  const [saved, setSaved] = useState(false);
  const isParameters = spec.id === 'customParameters';
  const initial = {
    ...initialRecordValues(spec),
    ...(isParameters && given['category'] === 'SYMPTOM' ? symptomDefaults(species, given) : {}),
    ...given,
  };
  const form = useContractForm({
    schema: spec.schema,
    initial,
    numeric: spec.numeric,
    resetOnSuccess: true,
    send: async (body) => {
      setSaved(false);
      await onSubmit(body);
      setSaved(true);
    },
  });
  const isSymptom = isParameters && form.values['category'] === 'SYMPTOM';
  const typeValue = form.values['symptomType'] ?? '';
  const type = isSymptomType(typeValue) ? typeValue : null;

  /** La categoría «Síntoma» precarga tipo, intensidad y título; salir de ella los vacía para que no viajen en el cuerpo. */
  const change = (name: string, value: string): void => {
    form.onChange(name, value);
    if (!isParameters) return;
    if (name === 'category') {
      const typed = form.values['title'] ?? '';
      const defaults = value === 'SYMPTOM' ? symptomDefaults(species, typed === '' ? {} : { title: typed }) : NO_SYMPTOM_FIELDS;
      for (const [key, next] of Object.entries(defaults)) form.onChange(key, next);
    }
    if (name === 'symptomType' && isSymptomType(value) && type !== null) form.onChange('title', syncSymptomTitle(type, value, form.values['title'] ?? ''));
  };

  return (
    <form noValidate aria-labelledby={`form-${spec.id}-title`} onSubmit={(e) => void form.onSubmit(e)} className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <h3 id={`form-${spec.id}-title`} className="text-base font-semibold sm:col-span-2">
        {spec.formTitle}
      </h3>
      {spec.fields.map((field) => [
        field.type === 'select' ? (
          <SelectField
            key={field.name}
            id={`${spec.id}-${field.name}`}
            label={field.label}
            name={field.name}
            value={form.values[field.name] ?? ''}
            options={field.options ?? []}
            onChange={change}
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
            {...(isSymptom && field.name === 'description' ? { placeholder: SYMPTOM_DESCRIPTION_PLACEHOLDER } : {})}
            value={form.values[field.name] ?? ''}
            onChange={change}
            errors={form.errors}
          />
        ),
        isSymptom && field.name === 'category' ? (
          <div key="symptom-fields" className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            {hidesVomit(species) ? <p className="text-sm text-text-muted sm:col-span-2">{NO_VOMIT_NOTICE}</p> : null}
            <SelectField
              id={`${spec.id}-symptomType`}
              label="Tipo"
              name="symptomType"
              value={typeValue}
              options={symptomTypeOptions(species)}
              onChange={change}
              errors={form.errors}
            />
            <SelectField
              id={`${spec.id}-severity`}
              label="Intensidad"
              name="severity"
              value={form.values['severity'] ?? ''}
              options={SYMPTOM_SEVERITIES.map((level) => ({ value: level, label: SEVERITY_LABEL[level] }))}
              onChange={change}
              errors={form.errors}
              help={
                <>
                  {type === null ? null : (
                    <ul className="grid gap-0.5">
                      {SYMPTOM_SEVERITIES.map((level) => (
                        <li key={level}>{`${SEVERITY_LABEL[level]}: ${SYMPTOM_LEVEL_HELP[type][level]}`}</li>
                      ))}
                    </ul>
                  )}
                  <p>{SYMPTOM_FOOTER}</p>
                </>
              }
            />
          </div>
        ) : null,
      ])}
      {isSymptom ? (
        <div className="sm:col-span-2">
          <SymptomLegend />
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <FormError errors={form.errors} message={form.message} />
      </div>
      <FormActions busy={form.busy} {...(onCancel === undefined ? {} : { onCancel: () => cancelForm(form.busy, onCancel) })}>
        {saved ? (
          <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Registro guardado.
          </p>
        ) : null}
      </FormActions>
    </form>
  );
}
