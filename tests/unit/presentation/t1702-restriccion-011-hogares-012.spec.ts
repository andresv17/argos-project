/**
 * T1702 (Feature 012, Bloque E, #81; `/keymaker`; ENM-005-E 0.2.2, `D12-19`): la restricción de la UI de Hogares de 011 («el hogar no admite subconjunto», `D11-06 = A`, `REQ-HOG11-005/006`, `EDGE-011-014`) queda sin
 * efecto por la revocación parcial ratificada por Neo; `/morpheus` la retira SIN editar los contratos de 011 (el aviso de alcance dinámico de 011 se conserva para «Todas»). Sin jsdom.
 *
 * @implements REQ-VET12-002, D12-19, ENM-005-E
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';

const noop = (): void => undefined;
const PETS = [
  { id: '11111111-1111-4111-8111-111111111101', name: 'Argos' },
  { id: '11111111-1111-4111-8111-111111111102', name: 'Kira' },
] as const;
const render = (extra: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(
    h(ShareLinksView as never, {
      petName: 'Casa Vallejo', household: { petCount: 2 }, canCreateLinks: true, hideScopeChoice: true, householdPets: PETS, selectedPetIds: [PETS[0].id], onPetIds: noop, allPets: true, onAllPets: noop, now: '2026-11-18T12:00:00.000Z', scope: 'HOUSEHOLD', expiresInDays: 7,
      includeMicrochip: false, includeClinicalFiles: false, busy: false, error: null, created: null, copyStatus: 'IDLE', list: { items: [], activeCount: 0, maxActiveLinks: 20 }, confirmRevokeId: null, notice: null, onScope: noop, onExpiry: noop,
      onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop, onAskRevoke: noop, onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop, ...extra,
    } as unknown as ShareLinksViewProps as never),
  );

describe('T1702 la restricción de 011 en Hogares («sin subconjunto») queda sin efecto (D12-19; contratos de 011 intactos)', () => {
  it('[D12-19] HouseholdsPage pasa la lista de mascotas propias al MISMO panel y ShareLinks.tsx ya no declara que el hogar no admite subconjunto', () => {
    const page = readFileSync('src/presentation/web/pages/HouseholdsPage.tsx', 'utf8');
    expect(page).toMatch(/<ShareLinksPanel[^>]*householdPets=/);
    const panel = readFileSync('src/presentation/web/components/ShareLinks.tsx', 'utf8');
    expect(panel).not.toMatch(/todas las mascotas elegibles del hogar \(sin subconjunto\)/);
    expect(panel).toContain('D12-19');
  });

  it('[D12-19] el aviso de alcance dinámico de 011 se conserva para «Todas» y el hogar ofrece además «Solo algunas»', () => {
    const markup = render({ allPets: true });
    expect(markup).toContain('Incluye todas las mascotas asignadas a este hogar mientras esté activo');
    expect(markup).toContain('Solo algunas mascotas');
  });
});
