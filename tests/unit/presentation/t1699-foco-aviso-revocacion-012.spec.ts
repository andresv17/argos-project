/**
 * T1699 (Feature 012; `/keymaker`; MEDIA de `/sati`): accesibilidad del aviso de revocación (alertdialog): el foco entra al contenedor al abrir, `Escape` cancela y al cerrar el foco vuelve al disparador.
 * Sin jsdom: lógica pura con dobles de foco + render estático + lectura de fuente del cableado.
 *
 * @implements REQ-VET12-007, D-1
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PetsRevocationConfirm } from '../../../src/presentation/web/components/PetsRevocationConfirm.tsx';
import { attachDialogFocus, handleDialogKey } from '../../../src/presentation/web/alert-dialog-focus.ts';

describe('T1699 foco del aviso de revocación', () => {
  it('[a11y] el contenedor es enfocable (tabIndex=-1) y sigue siendo alertdialog', () => {
    const markup = renderToStaticMarkup(h(PetsRevocationConfirm, { id: 'x', confirmLabel: 'Salir', onConfirm: () => undefined, onCancel: () => undefined }));
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain('tabindex="-1"');
  });

  it('[a11y] al montar el foco va al contenedor y no al disparador', () => {
    const container = { focus: vi.fn() };
    const opener = { focus: vi.fn(), isConnected: true };
    attachDialogFocus(container, opener);
    expect(container.focus).toHaveBeenCalledTimes(1);
    expect(opener.focus).not.toHaveBeenCalled();
  });

  it('[a11y] al cerrar el foco vuelve al disparador que abrió el aviso', () => {
    const container = { focus: vi.fn() };
    const opener = { focus: vi.fn(), isConnected: true };
    const restore = attachDialogFocus(container, opener);
    restore();
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });

  it('[a11y] si el disparador ya no está en el documento no se intenta enfocarlo; sin disparador ni contenedor no falla', () => {
    const opener = { focus: vi.fn(), isConnected: false };
    attachDialogFocus({ focus: vi.fn() }, opener)();
    expect(opener.focus).not.toHaveBeenCalled();
    expect(attachDialogFocus(null, null)()).toBeUndefined();
  });

  it('[a11y] Escape cancela y es consumida; otras teclas no cancelan', () => {
    const onCancel = vi.fn();
    expect(handleDialogKey('Enter', onCancel)).toBe(false);
    expect(handleDialogKey('Tab', onCancel)).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(handleDialogKey('Escape', onCancel)).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('[a11y] el componente cablea el foco, Escape y el retorno de foco', () => {
    const source = readFileSync('src/presentation/web/components/PetsRevocationConfirm.tsx', 'utf8');
    expect(source).toContain('attachDialogFocus(container.current, document.activeElement');
    expect(source).toContain('handleDialogKey(event.key, onCancel)');
    expect(source).toContain('ref={container}');
  });
});
