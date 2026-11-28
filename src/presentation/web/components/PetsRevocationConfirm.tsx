/**
 * Confirmación previa de una acción que revoca enteros los enlaces `PETS` afectados (feature 012, annex §5.1, `D-1 = (a)`; T1696). Solo se monta cuando hay enlaces activos afectados.
 *
 * @implements REQ-VET12-007, D-1
 */
import { PETS_ACTION_REVOCATION_NOTICE } from '../pets-link-notice.ts';
import { Button } from './Field.tsx';

export function PetsRevocationConfirm({ id, confirmLabel, onConfirm, onCancel }: {
  readonly id: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <div role="alertdialog" aria-labelledby={`${id}-notice`} data-pets-revocation-notice className="grid gap-2 rounded-2xl border-2 border-danger bg-red-50 p-4">
      <p id={`${id}-notice`} className="text-sm font-semibold text-red-900">
        {PETS_ACTION_REVOCATION_NOTICE}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
