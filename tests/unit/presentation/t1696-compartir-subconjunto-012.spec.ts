/**
 * T1696 (Feature 012, Bloque E, #81; `/keymaker`; ENM-005-E 0.2.2): comportamiento del panel de compartir con el subconjunto (`D12-19`), el aviso previo de la revocación entera (`D-1 = (a)`),
 * «Retirar mi mascota» como acción primaria, la tolerancia a un `scope` desconocido (annex §8.3). Sin jsdom.
 *
 * @implements REQ-VET12-002, REQ-VET12-007, D12-19, D-1, EDGE-012-077, ENM-005-E
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PETS_LEAVE_HOUSEHOLD_WARNING, PETS_REVOCATION_WARNING, PETS_SCOPE_STATIC_NOTICE, PETS_THIRD_PARTY_NOTICE, ShareLinksView, scopeText, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { summaryHeading } from '../../../src/presentation/web/components/SharedSummary.tsx';
import { base, NEUTRAL_SCOPE_LABEL, type PetsShareLinkView } from '../../../src/presentation/web/share-api.ts';

const noop = (): void => undefined;
const PETS = [
  { id: '11111111-1111-4111-8111-111111111101', name: 'Argos' },
  { id: '11111111-1111-4111-8111-111111111102', name: 'Kira' },
] as const;
const LINK: PetsShareLinkView = {
  id: '22222222-2222-4222-8222-222222222201',
  scope: 'PETS',
  status: 'ACTIVE',
  createdAt: '2026-11-18T12:00:00.000Z',
  expiresAt: '2026-11-25T12:00:00.000Z',
  revokedAt: null,
  includeMicrochip: false,
  includeClinicalFiles: false,
  petIds: [PETS[0].id, PETS[1].id],
  petCount: 2,
  createdByMe: true,
};
function props(extra: Record<string, unknown> = {}): ShareLinksViewProps {
  return {
    petName: 'Casa Vallejo',
    household: { petCount: 2 },
    canCreateLinks: true,
    hideScopeChoice: true,
    householdPets: PETS,
    selectedPetIds: [PETS[0].id],
    onPetIds: noop,
    allPets: false,
    onAllPets: noop,
    now: '2026-11-18T12:00:00.000Z',
    scope: 'HOUSEHOLD',
    expiresInDays: 7,
    includeMicrochip: false,
    includeClinicalFiles: false,
    busy: false,
    error: null,
    created: null,
    copyStatus: 'IDLE',
    list: { items: [], activeCount: 1, maxActiveLinks: 20 },
    petsList: { items: [LINK], activeCount: 1, maxActiveLinks: 20 },
    confirmRevokeId: null,
    notice: null,
    onScope: noop,
    onExpiry: noop,
    onMicrochip: noop,
    onClinicalFiles: noop,
    onCreate: noop,
    onCancel: noop,
    onCopy: noop,
    onDone: noop,
    onAskRevoke: noop,
    onConfirmRevoke: noop,
    onCancelRevoke: noop,
    onPreview: noop,
    onWithdrawPet: noop,
    ...extra,
  } as unknown as ShareLinksViewProps;
}
const render = (extra: Record<string, unknown> = {}): string => renderToStaticMarkup(h(ShareLinksView as never, props(extra) as never));

describe('T1696 «Todas» (hogar dinámico) frente a «Solo algunas» (PETS estático) (D12-19, annex §3.5)', () => {
  it('[D12-19] en el hogar se ofrecen las dos opciones; «Todas» muestra el aviso dinámico de 011 y NO el selector, «Solo algunas» el selector y el aviso estático con la salida de una mascota', () => {
    const all = render({ allPets: true });
    expect(all).toContain('name="petsMode"');
    expect(all).toContain('Incluye todas las mascotas asignadas a este hogar mientras esté activo');
    expect(all).not.toContain('data-pet-subset');
    const some = render({ allPets: false });
    expect(some).toContain('data-pet-subset');
    expect(some).toContain(PETS_SCOPE_STATIC_NOTICE);
    expect(some).toContain(PETS_LEAVE_HOUSEHOLD_WARNING);
  });

  it('[REQ-VET12-002] con el selector vacío el botón «Crear enlace» está deshabilitado y el motivo es un texto visible asociado (aria-describedby)', () => {
    const markup = render({ selectedPetIds: [] });
    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-describedby="share-pets-required"[^>]*>\s*Crear enlace/);
    expect(markup).toContain('id="share-pets-required"');
  });

  it('[REQ-PET11-001] sin householdPets (la ficha) no hay «Solo algunas» ni selector: el alcance sigue siendo PET o el aviso dinámico de 011', () => {
    const ficha = renderToStaticMarkup(h(ShareLinksView as never, props({ householdPets: undefined, petsList: undefined, household: null, scope: 'PET', petName: 'Argos' }) as never));
    expect(ficha).not.toContain('petsMode');
    expect(ficha).not.toContain('data-pet-subset');
  });
});

describe('T1696 aviso previo de la revocación entera y «Retirar mi mascota» primario (D-1 = (a), annex §5.1/§5.2, EDGE-012-077)', () => {
  it('[REQ-VET12-007] un PETS activo ofrece «Retirar a …» como acción primaria y «Revocar enlace» como secundaria; la lista explica que el número activo cuenta todo el hogar y avisa de EDGE-012-077', () => {
    const markup = render();
    expect(markup).toContain('Retirar a Argos');
    expect(markup).toContain('Retirar a Kira');
    expect(markup).toContain('Revocar enlace');
    expect(markup.indexOf('Retirar a Argos')).toBeLessThan(markup.indexOf('Revocar enlace'));
    expect(markup).toContain('Cuenta los enlaces de todo el hogar');
    expect(markup).toContain(PETS_THIRD_PARTY_NOTICE);
  });

  it('[D-1 = (a)] al pedir revocar, ANTES de confirmar, se avisa de que afecta a TODAS las mascotas del enlace y se ofrece «Retirar mi mascota» como alternativa', () => {
    const markup = render({ confirmRevokeId: LINK.id });
    expect(markup).toContain(PETS_REVOCATION_WARNING);
    expect(PETS_REVOCATION_WARNING).toMatch(/todas las mascotas/i);
    expect(PETS_REVOCATION_WARNING).toContain('Retirar mi mascota');
    expect(markup).toContain('Revocar enlace');
  });

  it('[REQ-VET12-007] con UNA sola mascota visible el botón primario dice «Retirar mi mascota»', () => {
    const markup = render({ petsList: { items: [{ ...LINK, petIds: [PETS[0].id], petCount: 1 }], activeCount: 1, maxActiveLinks: 20 } });
    expect(markup).toContain('Retirar mi mascota');
  });
});

describe('T1696 el cliente tolera un scope desconocido (annex §8.3, MEDIA-1): rótulo neutro, jamás «Hogar compartido» ni mascota única', () => {
  it('[§8.3] scopeText, summaryHeading y base tienen caso neutro', () => {
    expect(scopeText({ scope: 'FUTURE' as never }, { petName: 'Luna' })).toBe(NEUTRAL_SCOPE_LABEL);
    expect(scopeText({ scope: 'HOUSEHOLD' }, { petName: 'Luna' })).toBe('Hogar compartido');
    expect(scopeText({ scope: 'PET' }, { petName: 'Luna' })).toBe('Luna');
    expect(scopeText({ scope: 'PETS' }, { petName: 'Luna' })).not.toBe('Hogar compartido');
    const pets = [{ profile: { name: 'Argos' } }, { profile: { name: 'Kira' } }];
    expect(summaryHeading('FUTURE' as never, pets).title).not.toContain('Hogar compartido');
    expect(summaryHeading('FUTURE' as never, pets).title).toContain(NEUTRAL_SCOPE_LABEL);
    expect(summaryHeading('PETS', pets).title).toBe('Resumen clínico · 2 mascotas');
    expect(summaryHeading('PET', pets).multi).toBe(false);
    expect(base({ scope: 'FUTURE', id: 'x' } as never)).toBe('');
    expect(base({ scope: 'PETS', id: 'h', petIds: [] })).toBe('/households/h');
  });

  it('[§8.3] las fuentes usan switch exhaustivo con comprobación never y rama por defecto neutra', () => {
    for (const file of ['src/presentation/web/share-api.ts', 'src/presentation/web/components/ShareLinks.tsx', 'src/presentation/web/components/SharedSummary.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/default:/);
    }
    expect(readFileSync('src/presentation/web/share-api.ts', 'utf8')).toContain('value: never');
  });
});
