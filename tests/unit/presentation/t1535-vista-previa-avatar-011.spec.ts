/**
 * T1535 [US5, Bloque E, #31] la vista previa autenticada del informe (`SummaryPreviewPage`, D5-15) pinta el avatar de la mascota por el proxy de la misma origen
 * `/api/pets/{petId}/avatar` (no por la ruta publica con token): antes no pasaba `avatarHref` a `SharedSummaryDocument` y la vista previa salia sin foto.
 * La vista previa no lleva `petIds`, por lo que la de un hogar no pinta imagen (limite documentado).
 *
 * @implements REQ-SUM-004, REQ-VET11-002, D5-15
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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

  it('[D5-15] SummaryPreviewPage pasa avatarHref a SharedSummaryDocument solo en el alcance de una mascota', () => {
    expect(PAGE).toContain('avatarHref={() => (householdId === undefined ? previewAvatarPath(petId) : null)}');
  });
});
