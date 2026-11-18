/**
 * T528 [US1] SC-CAT-005 (REQ-FRM-001): el formulario aplica `trim()` a todo campo de texto antes de validar (salvo contraseñas) y
 * el servidor sigue rechazando un espacio final (`NonEmptyTrimmedString`, INV-REC-006).
 */
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../src/generated/index.ts';
import { RegisterPetUseCase } from '../../../src/application/use-cases/pet-use-cases.ts';
import { formValues, validateInput } from '../../../src/presentation/web/validation.ts';
import { ANDRES, createHarness } from '../../fixtures/application-harness.ts';

const RAW = { name: 'Rocky ', species: 'CANINE', breed: ' Golden ', birthDate: '2024-06-01', sex: 'MALE', microchipId: ' 985112345678901 ' };

describe('T528 trim() en el límite del formulario (REQ-FRM-001)', () => {
  it('SC-CAT-005: sin trim un espacio final falla el contrato; con formValues el cuerpo sale recortado y se acepta', () => {
    expect(Object.keys(validateInput('CreatePetInput', { ...RAW })).sort()).toEqual(['breed', 'microchipId', 'name']);
    const body = formValues(RAW);
    expect(body).toEqual({ name: 'Rocky', species: 'CANINE', breed: 'Golden', birthDate: '2024-06-01', sex: 'MALE', microchipId: '985112345678901' });
    expect(validateInput('CreatePetInput', body)).toEqual({});
  });

  it('REQ-FRM-001: recorta speciesOther, avatarUrl y los textos clínicos y de cuenta', () => {
    expect(formValues({ speciesOther: ' Erizo ', avatarUrl: ' https://img.example/a.png ', notes: ' con comida ', title: ' Alergia ', displayName: ' Andrés ', name: ' Casa ' })).toEqual({
      speciesOther: 'Erizo',
      avatarUrl: 'https://img.example/a.png',
      notes: 'con comida',
      title: 'Alergia',
      displayName: 'Andrés',
      name: 'Casa',
    });
  });

  it('REQ-FRM-001: las contraseñas NO se recortan (un espacio puede ser parte de la contraseña)', () => {
    const raw = { password: ' Clave 2026x! ', confirmPassword: ' Clave 2026x! ', currentPassword: ' vieja ', newPassword: ' nueva ' };
    expect(formValues(raw)).toEqual(raw);
  });

  it('REQ-FRM-001: un campo que queda vacío tras el recorte se omite como cualquier vacío y el obligatorio falla en cliente', () => {
    const body = formValues({ ...RAW, name: '   ' });
    expect('name' in body).toBe(false);
    expect(Object.keys(validateInput('CreatePetInput', body))).toEqual(['name']);
  });

  it('REQ-FRM-001: el recorte ocurre antes de convertir los numéricos', () => {
    expect(formValues({ weightKg: ' 32.85 ' }, ['weightKg'])).toEqual({ weightKg: 32.85 });
  });

  it('SC-CAT-005: una petición directa con espacio final sigue rechazada por el servidor (ERR-SCHEMA-VALIDATION-FAILED)', async () => {
    const { deps } = createHarness();
    const error = await new RegisterPetUseCase(deps).execute(ANDRES, { ...RAW, microchipId: undefined }).then(() => null, (e: unknown) => e);
    expect(error instanceof DomainError ? `${error.code}@${String(error.field)}` : String(error)).toBe('ERR-SCHEMA-VALIDATION-FAILED@name');
  });
});
