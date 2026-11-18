/**
 * T740..T743 [US3] «Cancelar» en los 6 formularios de edición clínica (REQ-CAN-001, REQ-CAN-002; SC-005-012, SC-005-013, SC-005-014; D5-09 y EDGE-005-08):
 *  - `FormActions` compartido: «Guardar» (submit) y «Cancelar» (button, sin tabindex negativo, alcanzable por teclado) en ese orden;
 *  - «Cancelar» no pide confirmación (D5-09): su `onClick` es directamente `onCancel`, sin diálogo ni `window.confirm`;
 *  - mientras hay un guardado en curso «Cancelar» (y «Guardar») están deshabilitados y la función de cancelar no actúa (EDGE-005-08);
 *  - cada módulo (pesos, medidas, vacunas, desparasitaciones, consultas y parámetros) ofrece «Cancelar» en edición y no en el alta.
 * Presentación pura sin red: cancelar no llama a `send`/`onSubmit`, de modo que no hay petición de escritura. Render estático.
 */
import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FormActions, cancelForm } from '../../../src/presentation/web/components/FormActions.tsx';
import { RecordForm } from '../../../src/presentation/web/components/RecordForm.tsx';
import { RECORD_MODULES, type RecordModule } from '../../../src/presentation/web/records.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

/** Recorre el árbol devuelto por un componente sin hooks y junta los elementos cuyo contenido es `text`. */
function findByText(node: ReactNode, text: string): Array<ReactElement<{ onClick?: () => void; disabled?: boolean; type?: string; children?: ReactNode }>> {
  if (Array.isArray(node)) return node.flatMap((child) => findByText(child as ReactNode, text));
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  const own = props.children === text ? [node as ReactElement<{ onClick?: () => void; disabled?: boolean; type?: string; children?: ReactNode }>] : [];
  return [...own, ...findByText(props.children, text)];
}

describe('T740 FormActions: Cancelar junto a Guardar (REQ-CAN-001)', () => {
  it('[SC-005-012] muestra «Guardar» (submit) y «Cancelar» (button) en ese orden, ambos activos y sin tabindex negativo', () => {
    const markup = renderToStaticMarkup(h(FormActions, { busy: false, onCancel: noop }));
    expect([...markup.matchAll(/<button[^>]*type="(\w+)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]])).toEqual([
      ['submit', 'Guardar'],
      ['button', 'Cancelar'],
    ]);
    expect(markup).not.toContain('disabled');
    expect(markup).not.toContain('tabindex');
  });

  it('[SC-005-012] sin `onCancel` (formulario de alta) solo hay «Guardar»', () => {
    const markup = renderToStaticMarkup(h(FormActions, { busy: false }));
    expect([markup.includes('Guardar'), markup.includes('Cancelar')]).toEqual([true, false]);
  });

  it('[SC-005-014][REQ-CAN-002] con un guardado en curso «Guardar» y «Cancelar» están deshabilitados (EDGE-005-08)', () => {
    const markup = renderToStaticMarkup(h(FormActions, { busy: true, onCancel: noop }));
    expect([...markup.matchAll(/<button[^>]*?(disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1] === undefined ? 'activo' : 'deshabilitado', m[2]])).toEqual([
      ['deshabilitado', 'Guardar'],
      ['deshabilitado', 'Cancelar'],
    ]);
  });
});

describe('T740 cancelar no pide confirmación ni escribe (REQ-CAN-002, D5-09)', () => {
  it('[SC-005-013] el `onClick` de «Cancelar» es `onCancel` tal cual (sin diálogo intermedio) y no hay `confirm`', () => {
    const onCancel = vi.fn();
    const [cancel] = findByText(FormActions({ busy: false, onCancel }), 'Cancelar');
    expect([cancel?.props.onClick === onCancel, cancel?.props.type]).toEqual([true, undefined]);
    expect(renderToStaticMarkup(h(FormActions, { busy: false, onCancel }))).not.toMatch(/alertdialog|confirm|¿Descartar|Descartar cambios/);
  });

  it('[SC-005-013] `cancelForm` cierra el formulario una sola vez y no lo hace con un guardado en curso', () => {
    const onCancel = vi.fn();
    cancelForm(false, onCancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    const blocked = vi.fn();
    cancelForm(true, blocked);
    expect(blocked).not.toHaveBeenCalled();
  });
});

describe.each([
  ['T741', 'weights'],
  ['T741', 'measurements'],
  ['T742', 'vaccinations'],
  ['T742', 'dewormings'],
  ['T743', 'visits'],
  ['T743', 'customParameters'],
] as ReadonlyArray<readonly [string, RecordModule]>)('%s módulo %s', (_task, id) => {
  const spec = RECORD_MODULES.find((m) => m.id === id)!;
  const editing = renderToStaticMarkup(h(RecordForm, { spec: { ...spec, formTitle: 'Editar registro' }, onSubmit: asyncNoop, onCancel: noop }));
  const adding = renderToStaticMarkup(h(RecordForm, { spec, onSubmit: asyncNoop }));

  it(`[SC-005-012][REQ-CAN-001] el formulario de edición ofrece «Guardar» y «Cancelar» (button) y el de alta solo «Guardar»`, () => {
    expect([editing.includes('>Guardar</button>'), /<button[^>]*type="button"[^>]*>Cancelar<\/button>/.test(editing)]).toEqual([true, true]);
    expect([adding.includes('>Guardar</button>'), adding.includes('Cancelar')]).toEqual([true, false]);
  });
});
