import { describe, expect, it } from 'vitest';
import { DomainError, ERROR_CATALOG, FIELD_ERROR_CODES, validateGoogleChooseUsernameWithAdultDeclarationInput, validateRegisterUserWithAdultDeclarationInput } from '../../../src/generated/v36/index.ts';

/**
 * T1423 (Feature 010, Bloque D, #75; Nivel 2 pre-autorizada por Neo): el contrato compilado de la 010 (`bash scripts/compile-contracts.sh --feature 010` -> `src/generated/v36/`)
 * declara `adultDeclaration` en los dos cuerpos de registro y el código `ERR-MEN10-ADULT-DECLARATION-REQUIRED` (422). REQ-MEN10-001, REQ-MEN10-003, INV-MEN10-001.
 * La validación en servidor y la persistencia las implementa T1424 (pruebas en `t1422-declaracion-mayoria-010`).
 */
const REGISTER = { username: 'Persona.Uno', displayName: 'Persona', password: 'Clave2026x!', confirmPassword: 'Clave2026x!' };

describe('T1423 [REQ-MEN10-001][INV-MEN10-001] el catálogo compilado de la 010', () => {
  it('declara ERR-MEN10-ADULT-DECLARATION-REQUIRED con 422, el detalle uniforme y la trazabilidad de la declaración', () => {
    expect(ERROR_CATALOG['ERR-MEN10-ADULT-DECLARATION-REQUIRED']).toMatchObject({
      status: 422,
      title: 'Declaracion de mayoria de edad requerida',
      invariantRef: 'INV-MEN10-001',
      requirementRef: 'REQ-MEN10-001',
      detailTemplate: 'Para crear la cuenta debes declarar que eres mayor de edad.',
    });
  });

  it('el DomainError del catálogo v36 lleva el 422 y no menciona usuario ni correo', () => {
    const error = new DomainError('ERR-MEN10-ADULT-DECLARATION-REQUIRED', undefined, 'adultDeclaration');
    expect([error.code, error.status, error.field]).toEqual(['ERR-MEN10-ADULT-DECLARATION-REQUIRED', 422, 'adultDeclaration']);
    expect(error.message).not.toMatch(/usuario|correo|existe|ocupad/i);
  });

  it('conserva los códigos heredados (la 010 no los redefine)', () => {
    for (const code of ['ERR-AUTH-USERNAME-TAKEN', 'ERR-ACCOUNT-REGISTRATION-RATE-LIMITED', 'ERR-SCHEMA-VALIDATION-FAILED', 'ERR-AUTH-CSRF-REJECTED'] as const) expect(ERROR_CATALOG[code].status).toBeGreaterThanOrEqual(400);
  });
});

describe('T1423 [REQ-MEN10-001][REQ-MEN10-003] los cuerpos de registro compilados', () => {
  it('RegisterUserWithAdultDeclarationInput acepta adultDeclaration: true (con o sin correo) y exige el campo', () => {
    expect(validateRegisterUserWithAdultDeclarationInput({ ...REGISTER, adultDeclaration: true })).toBe(true);
    expect(validateRegisterUserWithAdultDeclarationInput({ ...REGISTER, email: 'persona@example.test', adultDeclaration: true })).toBe(true);
    expect(validateRegisterUserWithAdultDeclarationInput(REGISTER)).toBe(false);
  });

  it('solo el booleano true cumple: false, null, "true", 1 y "" no pasan', () => {
    for (const value of [false, null, 'true', 1, '']) expect(validateRegisterUserWithAdultDeclarationInput({ ...REGISTER, adultDeclaration: value }), String(value)).toBe(false);
  });

  it('el cuerpo es cerrado: no admite fecha de nacimiento, edad ni documento', () => {
    for (const extra of [{ birthDate: '1990-01-01' }, { age: 30 }, { document: '123' }, { adultNoticeVersion: '1.0.0' }]) {
      expect(validateRegisterUserWithAdultDeclarationInput({ ...REGISTER, adultDeclaration: true, ...extra }), JSON.stringify(extra)).toBe(false);
    }
  });

  it('GoogleChooseUsernameWithAdultDeclarationInput exige username y adultDeclaration: true y no admite correo, rol ni estado', () => {
    expect(validateGoogleChooseUsernameWithAdultDeclarationInput({ username: 'nueva.persona', adultDeclaration: true })).toBe(true);
    expect(validateGoogleChooseUsernameWithAdultDeclarationInput({ username: 'nueva.persona' })).toBe(false);
    expect(validateGoogleChooseUsernameWithAdultDeclarationInput({ username: 'nueva.persona', adultDeclaration: false })).toBe(false);
    for (const extra of [{ email: 'a@b.co' }, { role: 'PLATFORM_ADMIN' }, { accountStatus: 'ACTIVE' }, { birthDate: '1990-01-01' }]) {
      expect(validateGoogleChooseUsernameWithAdultDeclarationInput({ username: 'nueva.persona', adultDeclaration: true, ...extra }), JSON.stringify(extra)).toBe(false);
    }
  });

  it('el campo adultDeclaration de ambos cuerpos se anota con ERR-MEN10-ADULT-DECLARATION-REQUIRED en el mapa de errores por campo', () => {
    expect(FIELD_ERROR_CODES['RegisterUserWithAdultDeclarationInput']?.['adultDeclaration']).toBe('ERR-MEN10-ADULT-DECLARATION-REQUIRED');
    expect(FIELD_ERROR_CODES['GoogleChooseUsernameWithAdultDeclarationInput']?.['adultDeclaration']).toBe('ERR-MEN10-ADULT-DECLARATION-REQUIRED');
  });
});
