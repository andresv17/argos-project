/**
 * Gestión de foco de un diálogo modal ligero (feature 012, T1699; MEDIA de `/sati`): al abrirse el foco entra al contenedor, `Escape` cancela y al cerrarse el foco vuelve a quien lo abrió.
 * Lógica sin dependencia de React ni de DOM real (se prueba con dobles mínimos).
 *
 * @implements REQ-VET12-007, D-1
 */
export interface FocusableLike {
  focus(): void;
  readonly isConnected?: boolean;
}

/** Enfoca el contenedor y devuelve la función que restituye el foco al disparador que estaba activo al abrir. */
export function attachDialogFocus(container: FocusableLike | null, opener: FocusableLike | null): () => void {
  container?.focus();
  return () => {
    if (opener !== null && opener.isConnected !== false) opener.focus();
  };
}

/** `Escape` cancela el diálogo; cualquier otra tecla se ignora. Devuelve si la tecla fue consumida. */
export function handleDialogKey(key: string, onCancel: () => void): boolean {
  if (key !== 'Escape') return false;
  onCancel();
  return true;
}
