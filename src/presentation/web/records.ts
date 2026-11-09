/**
 * Los 6 módulos de registros de la ficha: pestaña, formulario de alta (campos y esquema del contrato) y llamada
 * tipada al cliente generado.
 *
 * @implements REQ-UI-002, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006
 */
import { CSRF_PARAMS, unwrap, type ApiClient } from './api.ts';
import type { InputSchema } from './validation.ts';
import type { Schemas } from './view-model.ts';

export type RecordModule = 'weights' | 'measurements' | 'vaccinations' | 'dewormings' | 'visits' | 'customParameters';

export interface RecordFieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type: 'date' | 'number' | 'text' | 'select';
  readonly required: boolean;
  readonly step?: string;
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
}

export interface RecordModuleSpec {
  readonly id: RecordModule;
  readonly tabLabel: string;
  readonly formTitle: string;
  readonly schema: InputSchema;
  readonly numeric: readonly string[];
  readonly fields: readonly RecordFieldSpec[];
}

const date = (name: string, label: string): RecordFieldSpec => ({ name, label, type: 'date', required: true });
const text = (name: string, label: string, required = true): RecordFieldSpec => ({ name, label, type: 'text', required });
const decimal = (name: string, label: string): RecordFieldSpec => ({ name, label, type: 'number', required: true, step: '0.01' });

export const RECORD_MODULES: readonly RecordModuleSpec[] = [
  {
    id: 'weights',
    tabLabel: 'Peso',
    formTitle: 'Registrar peso',
    schema: 'CreateWeightInput',
    numeric: ['weightKg'],
    fields: [date('recordedAt', 'Fecha'), decimal('weightKg', 'Peso (kg)'), text('notes', 'Notas', false)],
  },
  {
    id: 'measurements',
    tabLabel: 'Medidas',
    formTitle: 'Registrar medidas',
    schema: 'CreateBodyMeasurementInput',
    numeric: ['neckCm', 'chestCm', 'backLengthCm', 'waistCm'],
    fields: [
      date('recordedAt', 'Fecha'),
      decimal('neckCm', 'Cuello (cm)'),
      decimal('chestCm', 'Pecho (cm)'),
      decimal('backLengthCm', 'Largo de lomo (cm)'),
      decimal('waistCm', 'Cintura (cm)'),
      text('notes', 'Notas', false),
    ],
  },
  {
    id: 'vaccinations',
    tabLabel: 'Vacunas',
    formTitle: 'Registrar vacuna',
    schema: 'CreateVaccinationInput',
    numeric: [],
    fields: [
      text('vaccineName', 'Vacuna'),
      date('appliedAt', 'Fecha de aplicación'),
      date('nextBoosterAt', 'Próximo refuerzo'),
      text('batchOrClinic', 'Lote o clínica', false),
      text('notes', 'Notas', false),
    ],
  },
  {
    id: 'dewormings',
    tabLabel: 'Desparasitación',
    formTitle: 'Registrar desparasitación',
    schema: 'CreateDewormingInput',
    numeric: [],
    fields: [
      text('productBrand', 'Producto'),
      {
        name: 'dewormingType',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: [
          { value: 'INTERNAL', label: 'Interna' },
          { value: 'EXTERNAL', label: 'Externa' },
        ],
      },
      date('appliedAt', 'Fecha de aplicación'),
      date('nextSuggestedDoseAt', 'Próxima dosis'),
      text('notes', 'Notas', false),
    ],
  },
  {
    id: 'visits',
    tabLabel: 'Consultas',
    formTitle: 'Registrar consulta',
    schema: 'CreateMedicalVisitInput',
    numeric: [],
    fields: [
      date('visitDate', 'Fecha de la consulta'),
      text('reason', 'Motivo'),
      text('diagnosis', 'Diagnóstico'),
      text('treatment', 'Tratamiento'),
      text('clinicOrVet', 'Clínica o veterinario'),
      text('observations', 'Observaciones', false),
    ],
  },
  {
    id: 'customParameters',
    tabLabel: 'Parámetros',
    formTitle: 'Registrar parámetro',
    schema: 'CreateCustomParameterInput',
    numeric: [],
    fields: [
      date('recordedAt', 'Fecha'),
      {
        name: 'category',
        label: 'Categoría',
        type: 'select',
        required: true,
        options: [
          { value: 'DIET_CHANGE', label: 'Cambio de dieta' },
          { value: 'ALLERGY', label: 'Alergia' },
          { value: 'SURGERY', label: 'Cirugía' },
          { value: 'BEHAVIOR', label: 'Comportamiento' },
          { value: 'OTHER', label: 'Otro' },
        ],
      },
      text('title', 'Título'),
      text('description', 'Descripción'),
      text('notes', 'Notas', false),
    ],
  },
];

/** Valores iniciales del formulario: vacío, o la primera opción en los selectores. */
export function initialRecordValues(spec: RecordModuleSpec): Record<string, string> {
  return Object.fromEntries(spec.fields.map((f) => [f.name, f.options?.[0]?.value ?? '']));
}

/** Alta de un registro con el cliente generado. `body` ya validado contra `spec.schema`. */
export async function addRecord(api: ApiClient, module: RecordModule, petId: string, body: Readonly<Record<string, unknown>>): Promise<void> {
  const params = { ...CSRF_PARAMS, path: { petId } };
  switch (module) {
    case 'weights':
      await unwrap(api.POST('/pets/{petId}/records/weights', { params, body: body as Schemas['CreateWeightInput'] }));
      return;
    case 'measurements':
      await unwrap(api.POST('/pets/{petId}/records/measurements', { params, body: body as Schemas['CreateBodyMeasurementInput'] }));
      return;
    case 'vaccinations':
      await unwrap(api.POST('/pets/{petId}/records/vaccinations', { params, body: body as Schemas['CreateVaccinationInput'] }));
      return;
    case 'dewormings':
      await unwrap(api.POST('/pets/{petId}/records/dewormings', { params, body: body as Schemas['CreateDewormingInput'] }));
      return;
    case 'visits':
      await unwrap(api.POST('/pets/{petId}/records/visits', { params, body: body as Schemas['CreateMedicalVisitInput'] }));
      return;
    case 'customParameters':
      await unwrap(api.POST('/pets/{petId}/records/custom-parameters', { params, body: body as Schemas['CreateCustomParameterInput'] }));
      return;
  }
}
