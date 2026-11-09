import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG } from '../../../src/generated/errors/error-codes.ts';
import { FORM_ERROR_KEY, formValues, validateInput } from '../../../src/presentation/web/validation.ts';

const msg = (code: keyof typeof ERROR_CATALOG): string => ERROR_CATALOG[code].detailTemplate;

describe('TASK-112: validación en cliente derivada de los contratos', () => {
  it('[REQ-UI-005][ERR-AUTH-WEAK-PASSWORD] el registro con contraseña débil muestra el mensaje del catálogo en el campo', () => {
    expect(validateInput('RegisterUserInput', { username: 'andres', displayName: 'Andrés', password: 'corta' })).toEqual({ password: msg('ERR-AUTH-WEAK-PASSWORD') });
  });

  it('[REQ-UI-005][ERR-SCHEMA-VALIDATION-FAILED] un campo obligatorio ausente o con formato inválido usa ERR-SCHEMA-VALIDATION-FAILED', () => {
    expect([
      validateInput('RegisterUserInput', { displayName: 'Andrés', password: 'secreto123' }),
      validateInput('RegisterUserInput', { username: 'Andrés!', displayName: 'Andrés', password: 'secreto123' }),
      validateInput('LoginInput', { username: 'andres' }),
    ]).toEqual([{ username: msg('ERR-SCHEMA-VALIDATION-FAILED') }, { username: msg('ERR-SCHEMA-VALIDATION-FAILED') }, { password: msg('ERR-SCHEMA-VALIDATION-FAILED') }]);
  });

  it('[REQ-UI-005] un input válido no produce errores', () => {
    expect([
      validateInput('RegisterUserInput', { username: 'andres', displayName: 'Andrés', password: 'secreto123' }),
      validateInput('LoginInput', { username: 'andres', password: 'x' }),
      validateInput('CreateHouseholdInput', { name: 'Casa' }),
      validateInput('InviteMemberInput', { username: 'maria' }),
    ]).toEqual([{}, {}, {}, {}]);
  });

  it('[REQ-UI-002][ERR-REC-WEIGHT-OUT-OF-RANGE][ERR-REC-MEASUREMENT-OUT-OF-RANGE] los rangos de peso y medidas usan su código x-sdd-error', () => {
    expect([
      validateInput('CreateWeightInput', { recordedAt: '2026-01-10', weightKg: 200 }),
      validateInput('CreateWeightInput', { recordedAt: '2026-01-10', weightKg: 32.851 }),
      validateInput('CreateBodyMeasurementInput', { recordedAt: '2026-01-10', neckCm: 0.5, chestCm: 50, backLengthCm: 50, waistCm: 50 }),
    ]).toEqual([{ weightKg: msg('ERR-REC-WEIGHT-OUT-OF-RANGE') }, { weightKg: msg('ERR-REC-WEIGHT-OUT-OF-RANGE') }, { neckCm: msg('ERR-REC-MEASUREMENT-OUT-OF-RANGE') }]);
  });

  it('[REQ-UI-002] los formularios de los 6 módulos validan contra su esquema de alta', () => {
    expect([
      validateInput('CreateVaccinationInput', { vaccineName: 'Rabia', appliedAt: '2026-01-01', nextBoosterAt: '2027-01-01' }),
      validateInput('CreateDewormingInput', { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-01-01', nextSuggestedDoseAt: '2026-04-01' }),
      validateInput('CreateMedicalVisitInput', { visitDate: '2026-01-01', reason: 'Control', diagnosis: 'Sano', treatment: 'Ninguno', clinicOrVet: 'Vet' }),
      validateInput('CreateCustomParameterInput', { recordedAt: '2026-01-01', category: 'OTHER', title: 'T', description: 'D' }),
      Object.keys(validateInput('CreateDewormingInput', { productBrand: 'Drontal', dewormingType: 'ORAL', appliedAt: '2026-01-01', nextSuggestedDoseAt: '2026-04-01' })),
    ]).toEqual([{}, {}, {}, {}, ['dewormingType']]);
  });

  it('[REQ-UI-005] una propiedad no autorizada cae en el error general del formulario', () => {
    expect(validateInput('CreateHouseholdInput', { name: 'Casa', extra: 1 })).toEqual({ [FORM_ERROR_KEY]: msg('ERR-SCHEMA-VALIDATION-FAILED') });
  });

  it('[REQ-UI-002] los valores de formulario omiten los vacíos y convierten solo los campos numéricos', () => {
    expect(formValues({ recordedAt: '2026-01-10', weightKg: '32.85', notes: '' }, ['weightKg'])).toEqual({ recordedAt: '2026-01-10', weightKg: 32.85 });
  });
});
