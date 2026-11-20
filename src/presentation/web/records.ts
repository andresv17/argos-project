/**
 * Los 6 módulos de registros de la ficha: pestaña, formulario de alta (campos y esquema del contrato) y llamada
 * tipada al cliente generado.
 *
 * @implements REQ-REG7-001, REQ-REG7-002, REQ-BOR-001, REQ-BOR-003, REQ-UI-002, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006
 */
import { CSRF_PARAMS, unwrap, type ApiClient } from './api.ts';
import type { InputSchema } from './validation.ts';
import type { PetPermissions, Schemas } from './view-model.ts';

export type RecordModule = 'weights' | 'measurements' | 'vaccinations' | 'dewormings' | 'visits' | 'customParameters';

export interface RecordFieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type: 'date' | 'number' | 'text' | 'select';
  readonly required: boolean;
  readonly step?: string;
  readonly inputMode?: 'numeric' | 'decimal';
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

const date = (name: string, label: string, required = true): RecordFieldSpec => ({ name, label, type: 'date', required });
const text = (name: string, label: string, required = true): RecordFieldSpec => ({ name, label, type: 'text', required });
const decimal = (name: string, label: string): RecordFieldSpec => ({ name, label, type: 'number', required: true, step: '0.01' });
/** Medidas en centímetros enteros (REQ-MDC-001): paso 1 y teclado numérico. */
const wholeCm = (name: string, label: string): RecordFieldSpec => ({ name, label, type: 'number', required: true, step: '1', inputMode: 'numeric' });

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
      wholeCm('neckCm', 'Cuello (cm)'),
      wholeCm('chestCm', 'Pecho (cm)'),
      wholeCm('backLengthCm', 'Largo de lomo (cm)'),
      wholeCm('waistCm', 'Cintura (cm)'),
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
      date('nextBoosterAt', 'Próximo refuerzo', false),
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
          { value: 'SYMPTOM', label: 'Síntoma' },
        ],
      },
      text('title', 'Título'),
      text('description', 'Descripción'),
      text('notes', 'Notas', false),
    ],
  },
];

/** Permiso de la matriz (REQ-RBAC-001) que habilita el formulario de alta de cada módulo; la validación real es del servidor. */
export const RECORD_WRITE_PERMISSION: Readonly<Record<RecordModule, keyof PetPermissions>> = {
  weights: 'writeWeightsAndMeasurements',
  measurements: 'writeWeightsAndMeasurements',
  vaccinations: 'writeHealthEvents',
  dewormings: 'writeHealthEvents',
  visits: 'writeAppointmentsAndParameters',
  customParameters: 'writeAppointmentsAndParameters',
};

/** Texto del resumen del bloque de alta de cada módulo (blueprint §4.5). */
export const RECORD_SUMMARY: Readonly<Record<RecordModule, string>> = {
  weights: 'Registrar peso',
  measurements: 'Registrar medidas',
  vaccinations: 'Registrar vacuna',
  dewormings: 'Registrar desparasitación',
  visits: 'Registrar consulta',
  customParameters: 'Registrar parámetro',
};

/**
 * Opción B de `[GH:#14]` (decidida por Neo, `D7-02`): solo estos cuatro módulos muestran el formulario descubierto, sin `<summary>` «Registrar …», mientras no hay registros.
 * Consultas y Parámetros quedan fuera (`M7-10`, `DEUDA-007-REG-CONSULTAS-PARAMETROS`).
 */
export const OPTION_B_MODULES: readonly RecordModule[] = ['weights', 'measurements', 'vaccinations', 'dewormings'];

/** El formulario de alta se muestra abierto por defecto: hay permiso de escritura y el módulo no tiene registros (REQ-REG7-002). Función pura, solo la Opción B. */
export const showsFormOpenByDefault = (_module: RecordModule, records: readonly unknown[], canWrite: boolean): boolean => canWrite && records.length === 0;

/** El módulo pinta `RecordForm` sin `<details>` ni `<summary>`: Opción B, abierto por defecto y sin registros (SC-007-017). */
export const showsBareForm = (module: RecordModule, records: readonly unknown[], canWrite: boolean): boolean =>
  OPTION_B_MODULES.includes(module) && showsFormOpenByDefault(module, records, canWrite);

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

/** Colección de la ruta `/pets/{petId}/records/{collection}/{recordId}` de cada módulo (RecordCollection del contrato). */
export const RECORD_COLLECTION: Readonly<Record<RecordModule, string>> = {
  weights: 'weights',
  measurements: 'measurements',
  vaccinations: 'vaccinations',
  dewormings: 'dewormings',
  visits: 'visits',
  customParameters: 'custom-parameters',
};

/**
 * Edición parcial de un registro vigente (REQ-BOR-003). El cuerpo declara la colección de la ruta; el servidor valida y audita.
 * `revision` es la que trajo el registro al leerlo y viaja como `If-Match: "<revision>"` (D-16 A, REQ-BOR-005): si otra persona lo cambió
 * antes, el servidor responde 409 ERR-REC-CONFLICT y no cambia nada.
 */
export async function updateRecord(api: ApiClient, module: RecordModule, petId: string, recordId: string, body: Readonly<Record<string, unknown>>, revision: number): Promise<void> {
  const collection = RECORD_COLLECTION[module];
  await unwrap(
    api.PATCH('/pets/{petId}/records/{collection}/{recordId}', {
      params: { ...CSRF_PARAMS, path: { petId, collection: collection as Schemas['RecordCollection'], recordId } },
      headers: { 'If-Match': `"${revision}"` },
      body: { ...body, collection } as Schemas['UpdateWeightInput'],
    }),
  );
}

/** Borrado físico de un registro vigente (REQ-BOR-001): 204, o 409 si está reemplazado (REQ-BOR-002). */
export async function deleteRecord(api: ApiClient, module: RecordModule, petId: string, recordId: string): Promise<void> {
  await unwrap(
    api.DELETE('/pets/{petId}/records/{collection}/{recordId}', {
      params: { ...CSRF_PARAMS, path: { petId, collection: RECORD_COLLECTION[module] as Schemas['RecordCollection'], recordId } },
    }),
  );
}
