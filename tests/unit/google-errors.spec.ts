import { describe, expect, it } from 'vitest';
import { googleFailed, googleLinkConflict } from '../../src/application/use-cases/google-errors.ts';

describe('fábricas de errores de Google SSO (008)', () => {
  it('ERR-AUTH-GOOGLE-FAILED: la fábrica produce 400 con el detalle fijo del catálogo', () => {
    const error = googleFailed();
    expect(error.status).toBe(400);
    expect(error.code).toBe('ERR-AUTH-GOOGLE-FAILED');
    expect(error.toProblemDetails('/api/auth/google/callback').detail).toBe(
      'No se pudo completar el acceso con Google. Vuelve a intentarlo desde la pantalla de acceso.',
    );
  });

  it('ERR-AUTH-GOOGLE-LINK-CONFLICT: la fábrica produce 409 con el detalle fijo del catálogo', () => {
    const error = googleLinkConflict();
    expect(error.status).toBe(409);
    expect(error.code).toBe('ERR-AUTH-GOOGLE-LINK-CONFLICT');
    expect(error.toProblemDetails('/api/auth/google/link').detail).toBe('No se pudo vincular esa cuenta de Google a tu cuenta.');
  });
});
