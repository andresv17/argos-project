/**
 * T1026 (007, SC-007-016, REQ-FAL7-008): UI del opt-in `includeDeceasedAt`: casilla «Incluir la fecha de fallecimiento» desmarcada por defecto en «Compartir»,
 * la vista del resumen muestra la fecha solo si llega con el opt-in, y el formulario avisa al creador (sin revocar) cuando marca Fallecido.
 * @implements REQ-FAL7-008, SC-007-016
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PetForm } from '../../../src/presentation/web/components/PetForm.tsx';
import { ShareLinksView, type ShareLinksViewProps } from '../../../src/presentation/web/components/ShareLinks.tsx';
import { SharedSummaryDocument, type SharedSummaryViewModel } from '../../../src/presentation/web/components/SharedSummary.tsx';
import { DECEASED_LINKS_NOTICE, type PetProfile } from '../../../src/presentation/web/view-model.ts';
import { profile } from './presentation-fixtures.ts';

const noop = (): void => undefined;
const asyncNoop = async (): Promise<void> => undefined;

const shareView = (over: Partial<ShareLinksViewProps> = {}): string =>
  renderToStaticMarkup(
    h(ShareLinksView, {
      petName: 'Luna', household: null, now: '2026-11-18T12:00:00.000Z', scope: 'PET', expiresInDays: 7, includeMicrochip: false, includeClinicalFiles: false,
      busy: false, error: null, created: null, copyStatus: 'IDLE', list: { items: [], activeCount: 0, maxActiveLinks: 20 }, confirmRevokeId: null, notice: null,
      onScope: noop, onExpiry: noop, onMicrochip: noop, onClinicalFiles: noop, onCreate: noop, onCancel: noop, onCopy: noop, onDone: noop, onAskRevoke: noop,
      onConfirmRevoke: noop, onCancelRevoke: noop, onPreview: noop, ...over,
    } as ShareLinksViewProps),
  );

const view = (profileExtra: Record<string, unknown>, disclosureExtra: Record<string, unknown>): SharedSummaryViewModel =>
  ({
    summary: {
      summaryVersion: '1.0.0', generatedAt: '2026-11-18T14:32:00.000Z', scope: 'PET', dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED', automaticInterpretation: 'NONE',
      disclosure: { microchipIncluded: false, clinicalFilesIncluded: false, ...disclosureExtra },
      pets: [{
        profile: { name: 'Kiwi', species: 'CANINE', speciesOther: null, breed: 'Mestiza', sex: 'MALE', neutered: null, birthDate: '2020-05-01', birthDateIsEstimate: false, age: { years: 6, months: 1, totalDays: 2230 }, ...profileExtra },
        weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], symptoms: [], otherParameters: [], clinicalFiles: [],
      }],
    },
    fileLabels: [], validUntil: '2026-11-25T12:00:00.000Z',
  }) as unknown as SharedSummaryViewModel;
const doc = (v: SharedSummaryViewModel): string => renderToStaticMarkup(h(SharedSummaryDocument, { view: v, mode: 'PUBLIC', downloadHref: null, onPrint: noop }));

describe('T1026 casilla de la fecha de fallecimiento en «Compartir» (SC-007-016)', () => {
  it('[SC-007-016] la casilla existe y viene desmarcada por defecto; marcada refleja el estado', () => {
    expect(shareView()).toMatch(/<input[^>]*type="checkbox"[^>]*name="includeDeceasedAt"(?![^>]*checked)[^>]*>/);
    expect(shareView()).toContain('Incluir la fecha de fallecimiento');
    expect(shareView({ includeDeceasedAt: true })).toMatch(/name="includeDeceasedAt"[^>]*checked/);
  });
});

describe('T1026 vista del resumen con y sin opt-in (REQ-FAL7-008)', () => {
  it('[REQ-FAL7-008] fallecida sin opt-in: dice «Fallecido» sin fecha; con opt-in: «Fallecido el 10/06/2026» como fecha UTC legible', () => {
    const off = doc(view({ lifeStatus: 'DECEASED' }, {}));
    expect(off).toContain('Fallecido');
    expect(off).not.toContain('Fallecido el');
    const on = doc(view({ lifeStatus: 'DECEASED', deceasedAt: '2026-06-10' }, { deceasedAtIncluded: true }));
    expect(on).toMatch(/Fallecido el [^<]*2026/);
  });

  it('[REQ-FAL7-008] una mascota viva no muestra la fila «Estado»', () => {
    expect(doc(view({ lifeStatus: 'ALIVE' }, {}))).not.toContain('Fallecido');
  });
});

describe('T1026 aviso al creador al marcar Fallecido (SC-007-016)', () => {
  const form = (p: PetProfile | null): string => renderToStaticMarkup(h(PetForm, { profile: p, onSubmit: asyncNoop, onCancel: noop }));
  const deceased = { ...profile('p1', 'Kiwi'), lifeStatus: 'DECEASED', deceasedAt: '2026-06-10', version: 3 } as unknown as PetProfile;
  const alive = { ...profile('p1', 'Kiwi'), lifeStatus: 'ALIVE', deceasedAt: null, version: 3 } as unknown as PetProfile;

  it('[SC-007-016] con estado Fallecido el formulario de edicion avisa que los enlaces activos no se revocan', () => {
    expect(DECEASED_LINKS_NOTICE).toContain('no se revocan');
    expect(form(deceased)).toContain(DECEASED_LINKS_NOTICE);
  });

  it('[SC-007-016] una viva y una mascota nueva no llevan el aviso', () => {
    expect(form(alive)).not.toContain(DECEASED_LINKS_NOTICE);
    expect(form(null)).not.toContain(DECEASED_LINKS_NOTICE);
  });
});
