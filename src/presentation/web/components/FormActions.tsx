/**
 * Acciones de un formulario de registro clínico: «Guardar» y, en edición, «Cancelar» (REQ-CAN-001, REQ-CAN-002).
 * «Cancelar» es comportamiento de cliente (ADR-005-05): cierra el formulario y descarta su estado sin petición de escritura y sin
 * confirmación, aunque haya cambios (D5-09). Con un guardado en curso ambos botones se deshabilitan: el guardado manda (EDGE-005-08).
 *
 * @implements REQ-CAN-001, REQ-CAN-002
 */
import type { ReactNode } from 'react';
import { Button } from './Field.tsx';

/** Cierra el formulario salvo que haya un guardado en curso; nunca envía nada. */
export function cancelForm(busy: boolean, onCancel: () => void): void {
  if (!busy) onCancel();
}

export function FormActions({ busy, onCancel, children }: {
  readonly busy: boolean;
  /** Solo los formularios de edición lo pasan; sin él no hay «Cancelar» (el alta vive dentro de un `details`). */
  readonly onCancel?: () => void;
  /** Aviso posterior a los botones (p. ej. «Registro guardado.»). */
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
      <Button type="submit" disabled={busy}>
        Guardar
      </Button>
      {onCancel === undefined ? null : (
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      )}
      {children}
    </div>
  );
}
