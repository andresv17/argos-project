/**
 * T1556 correcciones de /sati (H-1, H-2, H-3, O-1, O-3): el recortador monta siempre la región de estado, describe la vista previa, es fluida a 320 px y devuelve el foco; /cuenta dice si hay foto.
 *
 * @implements REQ-PRF11-001, SC-011-057
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AvatarCropperView, type AvatarCropperViewProps } from '../../../src/presentation/web/components/AvatarCropper.tsx';

const noop = (): void => undefined;
const props = (over: Partial<AvatarCropperViewProps>): AvatarCropperViewProps => ({
  hasAvatar: true, hasImage: true, busy: false, error: null, previewSize: 256, onChoose: noop, onKeyDown: noop, onConfirm: noop, onCancel: noop, onRemove: noop,
  onPointerDown: noop, onPointerMove: noop, onPointerUp: noop, canvasRef: noop, ...over,
});

describe('[REQ-PRF11-001] accesibilidad del recortador de la foto de perfil', () => {
  it('[H-2] la región role=status existe aun sin imagen ni mensaje y anuncia el estado', () => {
    expect(renderToStaticMarkup(createElement(AvatarCropperView, props({ hasImage: false })))).toMatch(/<p role="status" class="sr-only"><\/p>/);
    expect(renderToStaticMarkup(createElement(AvatarCropperView, props({ status: 'Foto quitada' })))).toContain('role="status" class="sr-only">Foto quitada<');
  });
  it('[H-3][O-1] vista previa fluida, descrita por las instrucciones y con botones de zoom', () => {
    const html = renderToStaticMarkup(createElement(AvatarCropperView, props({ onZoom: noop })));
    expect(html).toContain('max-width:100%');
    expect(html).toContain('aria-describedby="avatar-crop-help"');
    expect(html).toContain('id="avatar-crop-help"');
    expect(html).toMatch(/Acercar/);
    expect(html).toMatch(/Alejar/);
  });
  it('[H-1][O-3] el editor restaura el foco y /cuenta indica si hay foto', () => {
    const core = readFileSync('src/presentation/web/components/AvatarCropper.tsx', 'utf8');
    expect(core).toMatch(/getElementById\('avatar-file'\)/);
    expect(core).toMatch(/setRestoreFocus\(true\)/);
    const account = readFileSync('src/presentation/web/pages/AccountPage.tsx', 'utf8');
    expect(account).toMatch(/Sin foto: se muestran tus iniciales/);
    expect(account).toMatch(/id="avatar-title" tabIndex=\{-1\}/);
  });
  it('[H-3 1.4.10] el panel de foto no impone su ancho mínimo al grid (min-w-0 y minmax(0,1fr))', () => {
    const account = readFileSync('src/presentation/web/pages/AccountPage.tsx', 'utf8');
    expect(account).toMatch(/aria-labelledby="avatar-title" className=\{`\$\{CARD\} min-w-0 grid-cols-\[minmax\(0,1fr\)\]`\}/);
    expect(account).toMatch(/mx-auto grid max-w-3xl grid-cols-\[minmax\(0,1fr\)\]/);
    expect(renderToStaticMarkup(createElement(AvatarCropperView, props({})))).toContain('grid min-w-0 grid-cols-[minmax(0,1fr)]');
  });
  it('[O-5] el input de archivo se limpia al leer y al cancelar, para poder elegir el mismo archivo', () => {
    const core = readFileSync('src/presentation/web/components/AvatarCropper.tsx', 'utf8');
    expect(core).toMatch(/e\.target\.value = ''/);
    expect(core).toMatch(/input\.value = ''/);
    expect(core.indexOf("e.target.value = ''")).toBeLessThan(core.indexOf('props.onChoose(file)'));
  });
});
