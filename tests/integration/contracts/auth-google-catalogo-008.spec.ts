import { describe, expect, it } from 'vitest';
import errorCatalog from '../../../specs/002-plataforma-v21/contracts/errors/error-catalog.json';
import { DomainError, ERROR_CATALOG } from '../../../src/generated/index.ts';

/**
 * Feature 008, catálogo de la 002 3.2.0: los dos errores del acceso con Google (REQ-AUTH2-002, REQ-AUTH2-003).
 * Solo valida el catálogo y su ProblemDetails; el flujo de Google se implementa en los bloques A y B.
 */
interface Entry { status: number; type: string; title: string; detailTemplate: string; requirementRef: string; invariantRef: string }
const entries = errorCatalog.errors as unknown as Record<string, Entry>;

describe('catálogo de errores de Google SSO (008)', () => {
  it('ERR-AUTH-GOOGLE-FAILED: 400 con detalle fijo que no revela la causa ni datos del correo, sub o tokens (REQ-AUTH2-002)', () => {
    const entry = entries['ERR-AUTH-GOOGLE-FAILED']!;
    expect(entry.status).toBe(400);
    expect(entry.type).toBe('urn:argos:error:ERR-AUTH-GOOGLE-FAILED');
    expect(entry.requirementRef).toBe('REQ-AUTH2-002');
    expect(entry.invariantRef).toBe('INV-AUTH-006');
    expect(entry.detailTemplate).toBe('No se pudo completar el acceso con Google. Vuelve a intentarlo desde la pantalla de acceso.');
    expect(ERROR_CATALOG['ERR-AUTH-GOOGLE-FAILED']).toMatchObject({ status: 400, title: entry.title, detailTemplate: entry.detailTemplate });
    const problem = new DomainError('ERR-AUTH-GOOGLE-FAILED').toProblemDetails('/api/auth/google/callback');
    expect(problem.status).toBe(400);
    expect(problem.type).toBe('urn:argos:error:ERR-AUTH-GOOGLE-FAILED');
    expect(problem.detail).toBe(entry.detailTemplate);
  });

  it('ERR-AUTH-GOOGLE-LINK-CONFLICT: 409 con un único detalle para cuenta ya vinculada o sub ajeno (REQ-AUTH2-003)', () => {
    const entry = entries['ERR-AUTH-GOOGLE-LINK-CONFLICT']!;
    expect(entry.status).toBe(409);
    expect(entry.type).toBe('urn:argos:error:ERR-AUTH-GOOGLE-LINK-CONFLICT');
    expect(entry.requirementRef).toBe('REQ-AUTH2-003');
    expect(entry.invariantRef).toBe('INV-AUTH-006');
    expect(entry.detailTemplate).toBe('No se pudo vincular esa cuenta de Google a tu cuenta.');
    expect(ERROR_CATALOG['ERR-AUTH-GOOGLE-LINK-CONFLICT']).toMatchObject({ status: 409, title: entry.title, detailTemplate: entry.detailTemplate });
    const problem = new DomainError('ERR-AUTH-GOOGLE-LINK-CONFLICT').toProblemDetails('/api/auth/google/link');
    expect(problem.status).toBe(409);
    expect(problem.type).toBe('urn:argos:error:ERR-AUTH-GOOGLE-LINK-CONFLICT');
    expect(problem.detail).toBe(entry.detailTemplate);
  });
});
