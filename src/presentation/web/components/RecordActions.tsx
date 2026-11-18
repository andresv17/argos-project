/**
 * Acciones de un registro vigente de la ficha: «Editar» (formulario con los valores actuales) y «Eliminar» (diálogo de confirmación).
 * Solo se montan para registros vigentes y con el permiso de la matriz; el servidor decide (403, 409 de SUPERSEDED) y su texto se muestra.
 *
 * @implements REQ-BOR-001, REQ-BOR-002, REQ-BOR-003, REQ-RBAC-001, REQ-CAN-001, REQ-CAN-002, SC-005-012, SC-005-013, SC-005-014
 */
import { useId, useState } from 'react';
import { Button, FormError } from './Field.tsx';
import { RecordForm } from './RecordForm.tsx';
import { canDeleteRecord, canEditRecord, recordActionMessage, recordInitialValues, recordLabel } from '../record-actions.ts';
import { RECORD_MODULES, type RecordModule } from '../records.ts';
import type { FormBody } from '../validation.ts';
import type { PetPermissions, Species } from '../view-model.ts';

/** Confirmación de un solo paso: el borrado es físico y definitivo (D-11 A). */
export function DeleteRecordDialog({ label, onConfirm, onCancel }: {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const id = useId();
  return (
    <div role="alertdialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} className="mt-2 rounded-2xl border-2 border-danger bg-red-50 p-4">
      <h4 id={`${id}-title`} className="font-semibold text-red-900">
        Eliminar {label}
      </h4>
      <p id={`${id}-desc`} className="text-sm text-red-900">
        Se eliminará de forma definitiva. No se puede deshacer; exporta un respaldo antes si lo necesitas.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" onClick={onConfirm}>
          Eliminar definitivamente
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** Revisión del registro (solo lectura, D-16 A); los registros sin ella valen 0. */
const revisionOfRecord = (record: Readonly<Record<string, unknown>>): number => (typeof record['revision'] === 'number' ? record['revision'] : 0);

export function RecordActions({ module, record, species, permissions, onEdit, onDelete }: {
  readonly module: RecordModule;
  readonly record: Readonly<Record<string, unknown>>;
  readonly species: Species;
  readonly permissions: PetPermissions;
  /** `revision` es la del registro leído: viaja como If-Match (D-16 A). */
  readonly onEdit?: (module: RecordModule, recordId: string, body: FormBody, revision: number) => Promise<void>;
  readonly onDelete?: (module: RecordModule, recordId: string) => Promise<void>;
}): JSX.Element | null {
  const [mode, setMode] = useState<'none' | 'editing' | 'deleting'>('none');
  const [error, setError] = useState<string | null>(null);
  const mayEdit = onEdit !== undefined && canEditRecord(module, permissions);
  const mayDelete = onDelete !== undefined && canDeleteRecord(module, permissions);
  if (!mayEdit && !mayDelete) return null;
  const label = recordLabel(module, record);
  const recordId = String(record['id']);
  const spec = RECORD_MODULES.find((m) => m.id === module)!;

  const run = async (action: () => Promise<void>): Promise<void> => {
    setError(null);
    try {
      await action();
      setMode('none');
    } catch (e) {
      setError(recordActionMessage(e));
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {mayEdit ? (
          <Button variant="secondary" ariaLabel={`Editar ${label}`} onClick={() => { setError(null); setMode(mode === 'editing' ? 'none' : 'editing'); }}>
            Editar
          </Button>
        ) : null}
        {mayDelete ? (
          <Button variant="secondary" ariaLabel={`Eliminar ${label}`} onClick={() => { setError(null); setMode('deleting'); }}>
            Eliminar
          </Button>
        ) : null}
      </div>
      {mode === 'editing' && onEdit !== undefined ? (
        <RecordForm spec={{ ...spec, formTitle: `Editar ${label}` }} species={species} initial={recordInitialValues(module, record)} onSubmit={(body) => onEdit(module, recordId, body, revisionOfRecord(record)).then(() => setMode('none'))} onCancel={() => { setError(null); setMode('none'); }} />
      ) : null}
      {mode === 'deleting' && onDelete !== undefined ? <DeleteRecordDialog label={label} onConfirm={() => void run(() => onDelete(module, recordId))} onCancel={() => setMode('none')} /> : null}
      <FormError message={error} />
    </div>
  );
}
