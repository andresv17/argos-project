/**
 * Gestión de foco de los `alertdialog` de la escena (feature 006, corrección H-S2 de /sati; WCAG 2.4.3 y 4.1.2): al abrir, el foco entra al diálogo; al cerrar, vuelve
 * al disparador (o, si ya no existe, al encabezado del panel): nunca se pierde en `body`. La decisión es pura y se prueba sin DOM; el hook solo la aplica.
 */
import { useEffect, useRef } from 'react';

export interface FocusTarget {
  focus(): void;
}
export type DialogFocusTransition = 'ENTER' | 'RETURN' | 'NONE';

export function dialogFocusTransition(wasOpen: boolean, isOpen: boolean): DialogFocusTransition {
  if (!wasOpen && isOpen) return 'ENTER';
  if (wasOpen && !isOpen) return 'RETURN';
  return 'NONE';
}

export interface MaybeDisabledTarget extends FocusTarget {
  readonly disabled?: boolean;
}

/** Primer destino enfocable y habilitado (S-1, 2.4.3): un `button` disabled ignora `.focus()`, así que se salta; si no hay ninguno devuelve `null` (se usa el encabezado). */
export function firstEnabledTarget(candidates: ReadonlyArray<MaybeDisabledTarget>): FocusTarget | null {
  return candidates.find((c) => c.disabled !== true) ?? null;
}

/** S-2 (2.4.3): el foco pasa al botón «Ampliar» solo al terminar la carga de la miniatura (LOADING -> READY). */
export function shouldFocusAfterThumbLoad(prev: 'IDLE' | 'LOADING' | 'READY', next: 'IDLE' | 'LOADING' | 'READY'): boolean {
  return prev === 'LOADING' && next === 'READY';
}

export function applyDialogFocus(transition: DialogFocusTransition, targets: { readonly dialog: FocusTarget | null; readonly trigger: FocusTarget | null; readonly fallback: FocusTarget | null }): void {
  if (transition === 'ENTER') targets.dialog?.focus();
  else if (transition === 'RETURN') (targets.trigger ?? targets.fallback)?.focus();
}

/** `dialogRef` va en el diálogo (`tabIndex={-1}`), `triggerRef` en el contenedor del botón disparador y `fallbackRef` en el encabezado (`tabIndex={-1}`). */
export function useDialogFocus(open: boolean): { readonly dialogRef: React.RefObject<HTMLDivElement>; readonly triggerRef: React.RefObject<HTMLDivElement>; readonly fallbackRef: React.RefObject<HTMLHeadingElement> } {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    applyDialogFocus(dialogFocusTransition(wasOpen.current, open), {
      dialog: dialogRef.current,
      trigger: firstEnabledTarget(Array.from(triggerRef.current?.querySelectorAll('button') ?? [])),
      fallback: fallbackRef.current,
    });
    wasOpen.current = open;
  }, [open]);
  return { dialogRef, triggerRef, fallbackRef };
}
