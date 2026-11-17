/**
 * T611 [US4] conformidad de los tipos y textos de medios de la SPA con el contrato 3.1.0 (REQ-ARC-001, REQ-ARC-003, REQ-ALB-001, REQ-AVA-001): la SPA declara
 * localmente las formas y los textos (la regla de capas solo admite módulos concretos de `generated/`); aquí se comprueba que no se desvían de los generados.
 */
import { describe, expect, it } from 'vitest';
import type { components } from '../../../src/generated/v31/api/openapi-types.ts';
import { ERROR_CATALOG } from '../../../src/generated/v31/errors/error-codes.ts';
import type { AvatarVersionResult, MediaAccess, MediaItem, MediaPage } from '../../../src/presentation/web/media-api.ts';
import { ALLOWED_TYPES_MESSAGE, MEDIA_MESSAGES } from '../../../src/presentation/web/media-view.ts';

type Schemas = components['schemas'];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameShapes: [Same<MediaItem, Schemas['MediaItem']>, Same<MediaAccess, Schemas['MediaAccess']>, Same<AvatarVersionResult, Schemas['AvatarVersionResult']>, Same<MediaPage['pageSize'], 24>] = [true, true, true, true];

describe('T611 tipos y textos de medios frente al contrato 3.1.0', () => {
  it('[REQ-ALB-001] MediaItem, MediaAccess y AvatarVersionResult son asignables en ambos sentidos a los tipos generados (comprobación de compilación)', () => {
    expect(sameShapes).toEqual([true, true, true, true]);
  });

  it('[REQ-ARC-001] los textos de ERR-MEDIA-* coinciden con el catálogo 3.1.0, salvo el 413 (nombra el máximo de 10 MB) y el 415 (lista los tipos)', () => {
    for (const [code, text] of Object.entries(MEDIA_MESSAGES)) {
      if (code === 'ERR-MEDIA-TOO-LARGE' || code === 'ERR-MEDIA-TYPE-NOT-ALLOWED') continue;
      expect([code, text]).toEqual([code, ERROR_CATALOG[code as keyof typeof ERROR_CATALOG].detailTemplate]);
    }
    expect(Object.keys(MEDIA_MESSAGES).sort()).toEqual(Object.keys(ERROR_CATALOG).filter((code) => code.startsWith('ERR-MEDIA-')).sort());
    expect(ALLOWED_TYPES_MESSAGE).toContain('JPEG, PNG, WebP y PDF');
  });
});
