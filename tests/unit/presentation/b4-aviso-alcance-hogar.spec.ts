/**
 * B-4 [EDGE-005-22] el alcance «Todo el hogar» avisa de que es dinámico: las mascotas que se añadan o retiren del hogar cambian lo que ve el veterinario.
 * El aviso aparece solo con el alcance HOUSEHOLD elegido (no con PET, ni sin hogar). Texto aprobado por /sati sin cambios (sati-B4-texto-005.md).
 * Render estático.
 *
 * @implements EDGE-005-22, REQ-VET-002
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';

const noop = (): void => undefined;
const AVISO = /si añades o retiras mascotas del hogar/;

function props(over: Partial<ShareLinksViewProps>): ShareLinksViewProps {
  return {
    petName: 'Luna', household: { petCount: 3 }, now: '2026-11-18T12:00:00.000Z', scope: 'HOUSEHOLD', expiresInDays: 7, includeMicrochip: false, includeClinicalFiles: false,
    busy: false, error: null, created: null, copyStatus: 'IDLE', list: null, confirmRevokeId: null, notice: null,
    onScope: noop, onExpiry: noop, onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop, onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop,
    ...over,
  } as ShareLinksViewProps;
}
const render = (over: Partial<ShareLinksViewProps>): string => renderToStaticMarkup(h(ShareLinksView, props(over)));

describe('B-4 aviso de alcance dinámico del hogar (EDGE-005-22)', () => {
  it('[EDGE-005-22] con el alcance HOUSEHOLD el aviso está presente, junto a «Todo el hogar (N mascotas)» y asociado al radio por aria-describedby', () => {
    const markup = render({ scope: 'HOUSEHOLD' });
    expect(markup).toContain('Todo el hogar (3 mascotas)');
    expect(markup).toMatch(AVISO);
    expect(markup).toContain('id="share-household-dynamic"');
    expect(markup).toMatch(/<input[^>]*aria-describedby="share-household-dynamic"[^>]*value="HOUSEHOLD"/);
  });

  it('[EDGE-005-22] con el alcance PET no hay aviso, aunque exista la opción de hogar', () => {
    const markup = render({ scope: 'PET' });
    expect(markup).toContain('Todo el hogar (3 mascotas)');
    expect(markup).not.toMatch(AVISO);
    expect(markup).not.toContain('share-household-dynamic');
  });

  it('[EDGE-005-22] sin hogar no hay opción ni aviso', () => {
    const markup = render({ scope: 'PET', household: null });
    expect(markup).not.toContain('Todo el hogar');
    expect(markup).not.toMatch(AVISO);
  });
});
