/**
 * Acciones de edición y borrado de un registro vigente (REQ-BOR-001, REQ-BOR-002, REQ-BOR-003): qué permiso las habilita, el rótulo
 * accesible, los valores iniciales del formulario de edición y el mensaje de un error de la API (409 de SUPERSEDED incluido).
 * Es presentación: la autorización, la inmutabilidad de los reemplazados y la auditoría las decide el servidor.
 *
 * @implements REQ-BOR-001, REQ-BOR-002, REQ-BOR-003, REQ-RBAC-001
 */
import { ApiProblem, catalogProblem, problemMessage } from './api.ts';
import { RECORD_MODULES, RECORD_WRITE_PERMISSION, type RecordModule } from './records.ts';
import type { PetPermissions } from './view-model.ts';

/** Permiso de la matriz que habilita borrar cada módulo: eventos de salud frente al resto (REQ-RBAC-001). */
export const RECORD_DELETE_PERMISSION: Readonly<Record<RecordModule, keyof PetPermissions>> = {
  weights: 'deleteOtherRecords',
  measurements: 'deleteOtherRecords',
  vaccinations: 'deleteHealthEvents',
  dewormings: 'deleteHealthEvents',
  visits: 'deleteOtherRecords',
  customParameters: 'deleteOtherRecords',
};

export const canEditRecord = (module: RecordModule, permissions: PetPermissions): boolean => permissions[RECORD_WRITE_PERMISSION[module]];
export const canDeleteRecord = (module: RecordModule, permissions: PetPermissions): boolean => permissions[RECORD_DELETE_PERMISSION[module]];

/** Campos del síntoma que el formulario de edición conserva: solo se copian, nunca deciden nada (INV-SIN-002). */
const SYMPTOM_FIELDS = ['symptomType', 'severity'] as const;

type Fields = Readonly<Record<string, unknown>>;
const text = (value: unknown): string => String(value ?? '');

/** Rótulo del registro para el lector de pantalla: «vacuna Rabia del 2026-10-01». */
export function recordLabel(module: RecordModule, record: Fields): string {
  switch (module) {
    case 'weights':
      return `peso del ${text(record['recordedAt'])}`;
    case 'measurements':
      return `medidas del ${text(record['recordedAt'])}`;
    case 'vaccinations':
      return `vacuna ${text(record['vaccineName'])} del ${text(record['appliedAt'])}`;
    case 'dewormings':
      return `desparasitación ${text(record['productBrand'])} del ${text(record['appliedAt'])}`;
    case 'visits':
      return `consulta del ${text(record['visitDate'])}`;
    case 'customParameters':
      return `parámetro ${text(record['title'])} del ${text(record['recordedAt'])}`;
  }
}

/** Valores del formulario de edición: los campos del módulo como texto; el nulo queda vacío; tipo e intensidad del síntoma si existen. */
export function recordInitialValues(module: RecordModule, record: Fields): Record<string, string> {
  const spec = RECORD_MODULES.find((m) => m.id === module)!;
  const values = Object.fromEntries(spec.fields.map((f) => [f.name, text(record[f.name])]));
  const extras = module === 'customParameters' ? SYMPTOM_FIELDS : [];
  for (const extra of extras) {
    if (record[extra] !== null && record[extra] !== undefined) values[extra] = text(record[extra]);
  }
  return values;
}

/** Texto para el usuario de un error de edición o borrado: el del catálogo (409 de SUPERSEDED, 403, ...) o el error inesperado. */
export function recordActionMessage(error: unknown): string {
  return problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));
}
