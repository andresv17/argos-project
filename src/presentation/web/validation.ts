/**
 * Validación en cliente derivada de los contratos: usa los validadores Ajv generados en `src/generated/`
 * y el mapa campo → código de `x-sdd-error`. Los mensajes salen del catálogo de errores (REQ-UI-005).
 * La API valida de nuevo; esta capa solo evita peticiones que el contrato ya rechaza.
 *
 * @implements REQ-UI-002, REQ-UI-005, REQ-UI-006, ERR-SCHEMA-VALIDATION-FAILED, ERR-AUTH-WEAK-PASSWORD, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE
 */
import { ERROR_CATALOG } from '../../generated/errors/error-codes.ts';
import { resolveFieldErrorCode } from '../../generated/errors/field-errors.ts';
import {
  validateCreateBodyMeasurementInput,
  validateCreateCustomParameterInput,
  validateCreateDewormingInput,
  validateCreateHouseholdInput,
  validateCreateMedicalVisitInput,
  validateCreatePetInput,
  validateCreateVaccinationInput,
  validateCreateWeightInput,
  validateInviteMemberInput,
  validateLoginInput,
  validateRegisterUserInput,
  validateUpdatePetInput,
  type ValidatorFunction,
} from '../../generated/schemas/validators.mjs';

const VALIDATORS = {
  RegisterUserInput: validateRegisterUserInput,
  LoginInput: validateLoginInput,
  CreatePetInput: validateCreatePetInput,
  UpdatePetInput: validateUpdatePetInput,
  CreateWeightInput: validateCreateWeightInput,
  CreateBodyMeasurementInput: validateCreateBodyMeasurementInput,
  CreateVaccinationInput: validateCreateVaccinationInput,
  CreateDewormingInput: validateCreateDewormingInput,
  CreateMedicalVisitInput: validateCreateMedicalVisitInput,
  CreateCustomParameterInput: validateCreateCustomParameterInput,
  CreateHouseholdInput: validateCreateHouseholdInput,
  InviteMemberInput: validateInviteMemberInput,
} as const satisfies Record<string, ValidatorFunction<unknown>>;

export type InputSchema = keyof typeof VALIDATORS;
export type FieldErrors = Readonly<Record<string, string>>;

/** Clave de formulario para errores que no apuntan a un campo (p. ej. propiedades no permitidas). */
export const FORM_ERROR_KEY = '_form';

/**
 * Errores por campo: `{}` si el input cumple el esquema. El primer error de cada campo gana; el código es el
 * de `x-sdd-error` del campo o ERR-SCHEMA-VALIDATION-FAILED.
 */
export function validateInput(schema: InputSchema, input: unknown): FieldErrors {
  const validate: ValidatorFunction<unknown> = VALIDATORS[schema];
  if (validate(input)) return {};
  const errors: Record<string, string> = {};
  for (const error of validate.errors ?? []) {
    const missing = error.keyword === 'required' ? String((error.params as { missingProperty?: unknown }).missingProperty) : null;
    const path = missing === null ? error.instancePath : `${error.instancePath}/${missing}`;
    const field = path.split('/').filter((s) => s !== '')[0] ?? FORM_ERROR_KEY;
    if (errors[field] !== undefined) continue;
    const code = resolveFieldErrorCode(schema, path) ?? 'ERR-SCHEMA-VALIDATION-FAILED';
    errors[field] = ERROR_CATALOG[code].detailTemplate;
  }
  return errors;
}

/**
 * Convierte los valores de texto de un formulario al tipo del contrato: vacío opcional → se omite,
 * numérico → `Number`. No interpreta reglas de negocio.
 */
export function formValues(raw: Readonly<Record<string, string>>, numeric: readonly string[] = []): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === '') continue;
    out[key] = numeric.includes(key) ? Number(value) : value;
  }
  return out;
}
