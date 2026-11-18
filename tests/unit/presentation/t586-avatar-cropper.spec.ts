/**
 * T586 [US5] `AvatarCropper` (REQ-AVA-002, SC-ALM-019): vista previa con máscara circular, controles de teclado accesibles, texto del respaldo JPEG y
 * acciones de la persona con permiso de edición. Render estático; el flujo con `canvas` real en Chromium/WebKit queda pendiente (E2E) y se declara.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvatarCropperView, AvatarEditor, type AvatarCropperViewProps } from '../../../src/presentation/web/components/AvatarCropper.tsx';

const noop = (): void => undefined;
function view(overrides: Partial<AvatarCropperViewProps> = {}): string {
  const props: AvatarCropperViewProps = {
    hasAvatar: false,
    hasImage: false,
    busy: false,
    error: null,
    previewSize: 256,
    onChoose: noop,
    onKeyDown: noop,
    onConfirm: noop,
    onCancel: noop,
    onRemove: noop,
    onPointerDown: noop,
    onPointerMove: noop,
    onPointerUp: noop,
    canvasRef: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(AvatarCropperView, props));
}

describe('T586 AvatarCropper', () => {
  it('[REQ-AVA-002] el selector acepta solo JPEG, PNG y WebP y sin imagen no hay vista previa ni «Usar esta foto»', () => {
    const markup = view();
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).not.toContain('<canvas');
    expect(markup).not.toContain('Usar esta foto');
  });

  it('[SC-ALM-019] con una imagen la vista previa es un canvas de 256 px con máscara circular, enfocable y con instrucciones de teclado', () => {
    const markup = view({ hasImage: true });
    expect(markup).toMatch(/<canvas[^>]*width="256"[^>]*height="256"/);
    expect(markup).toContain('rounded-full');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('Flechas para mover');
    expect(markup).toContain('+ y - para acercar');
    expect(markup).toContain('>Usar esta foto</button>');
  });

  it('[REQ-AVA-002] ocupado deshabilita las acciones; «Quitar foto» solo aparece con avatar cargado', () => {
    expect(view({ hasImage: true, busy: true })).toMatch(/<button[^>]*disabled=""[^>]*>Guardando…<\/button>/);
    expect(view({ hasAvatar: true })).toContain('>Quitar foto</button>');
    expect(view({ hasAvatar: false })).not.toContain('Quitar foto');
  });

  it('[REQ-AVA-002] un error se anuncia con role="alert"', () => {
    expect(view({ error: 'No se pudo preparar la foto.' })).toContain('role="alert"');
  });

  it('[REQ-AVA-003] el editor de avatar sin sesión arranca cerrado y no pide nada (render inicial sin imagen)', () => {
    const markup = renderToStaticMarkup(h(AvatarEditor, { petId: '44444444-4444-4444-8444-444444444401', petName: 'Luna', avatarVersion: null, onChanged: async () => undefined }));
    expect(markup).toContain('Foto de perfil');
    expect(markup).not.toContain('<canvas');
  });
});
