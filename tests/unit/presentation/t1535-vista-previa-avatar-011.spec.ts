/**
 * T1535 [US5, Bloque E, #31] la vista previa autenticada del informe (`SummaryPreviewPage`, D5-15) pinta el avatar de la mascota por el proxy de la misma origen
 * `/api/pets/{petId}/avatar` (no por la ruta publica con token): antes no pasaba `avatarHref` a `SharedSummaryDocument` y la vista previa salia sin foto.
 * La vista previa lleva `petIds` (TECHDEBT-011-PREVIEW-AVATAR-HOGAR): la de un hogar pinta el avatar de cada mascota por orden.
 *
 * @implements REQ-SUM-004, REQ-VET11-002, D5-15
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharedSummaryDocument, type SharedSummaryViewModel } from '../../../src/presentation/web/components/SharedSummary.tsx';
import { previewAvatarPath } from '../../../src/presentation/web/share-api.ts';

const PET = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaa01';
const PAGE = readFileSync('src/presentation/web/pages/SummaryPreviewPage.tsx', 'utf8');

describe('T1535 vista previa del informe con avatar (D5-15, REQ-VET11-002)', () => {
  it('[D5-15] la ruta es el proxy autenticado /api/pets/{petId}/avatar, sin token publico', () => {
    expect(previewAvatarPath(PET)).toBe(`/api/pets/${PET}/avatar`);
    expect(previewAvatarPath(PET)).not.toContain('/shared/');
  });

  it('[D5-15] sin id de mascota (alcance de hogar) no hay imagen', () => {
    expect(previewAvatarPath(undefined)).toBeNull();
    expect(previewAvatarPath('')).toBeNull();
  });

  it('[D5-15] SummaryPreviewPage deriva avatarHref de view.petIds[i] con respaldo al petId de la ruta solo en el alcance de una mascota', () => {
    expect(PAGE).toContain('avatarHref={(i) => previewAvatarPath(view.petIds?.[i] ?? (householdId === undefined ? petId : undefined))}');
  });

  it('[TECHDEBT-011-PREVIEW-AVATAR-HOGAR] la vista previa de hogar pinta el avatar de cada mascota con petIds[i] alineado con summary.pets por orden', () => {
    const PET_B = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaa02';
    const pet = (name: string) => ({ profile: { name, species: 'CANINE', speciesOther: null, breed: 'Mestizo', sex: 'MALE', neutered: null, birthDate: '2022-05-10', birthDateIsEstimate: false, age: { years: 4, months: 6, totalDays: 1650 } }, weights: [], bodyMeasurements: [], vaccinations: [], dewormings: [], medicalVisits: [], symptoms: [], otherParameters: [], clinicalFiles: [] });
    const view = { summary: { summaryVersion: '1.0.0', generatedAt: '2026-11-18T14:32:00.000Z', scope: 'HOUSEHOLD', dataProvenance: 'CAREGIVER_REPORTED_NOT_VERIFIED', automaticInterpretation: 'NONE', disclosure: { microchipIncluded: false, clinicalFilesIncluded: false }, pets: [pet('Argos'), pet('Luna')] }, fileLabels: [], validUntil: null, petIds: [PET, PET_B] } as unknown as SharedSummaryViewModel;
    const householdId = 'house-1';
    const petRouteId: string | undefined = undefined;
    const markup = renderToStaticMarkup(h(SharedSummaryDocument, { view, mode: 'PREVIEW', downloadHref: null, onPrint: () => undefined, avatarHref: (i: number) => previewAvatarPath(view.petIds?.[i] ?? (householdId === undefined ? petRouteId : undefined)) } as never));
    expect(markup).toContain(`/api/pets/${PET}/avatar`);
    expect(markup).toContain(`/api/pets/${PET_B}/avatar`);
    expect(markup.indexOf(`/api/pets/${PET}/avatar`)).toBeLessThan(markup.indexOf(`/api/pets/${PET_B}/avatar`));
    expect(markup).not.toContain('/shared/');
  });

  it('[TECHDEBT-011-PREVIEW-AVATAR-HOGAR] sin petIds la vista previa de hogar no pinta imagen y la de una mascota usa el id de la ruta', () => {
    expect(PAGE).toContain('view.petIds?.[i] ?? (householdId === undefined ? petId : undefined)');
    expect(previewAvatarPath(undefined)).toBeNull();
  });
});
