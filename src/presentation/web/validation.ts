/**
 * Validación en cliente derivada de los contratos: usa los validadores Ajv generados en `src/generated/`
 * y el mapa campo → código de `x-sdd-error`. Los mensajes salen del catálogo de errores (REQ-UI-005).
 * La API valida de nuevo; esta capa solo evita peticiones que el contrato ya rechaza. No hay esquemas escritos a mano:
 * todo validador sale de `scripts/compile-contracts.sh` (INV-ARCH-003).
 *
 * @implements INV-ARCH-003, REQ-FRM-001, REQ-UI-002, REQ-UI-005, REQ-UI-006, ERR-SCHEMA-VALIDATION-FAILED, ERR-AUTH-WEAK-PASSWORD, ERR-REC-WEIGHT-OUT-OF-RANGE, ERR-REC-MEASUREMENT-OUT-OF-RANGE
 */
import { ERROR_CATALOG } from '../../generated/errors/error-codes.ts';
import { resolveFieldErrorCode } from '../../generated/errors/field-errors.ts';
import { humanSchemaMessage } from './schema-messages.ts';
import {
  validateCreateCustomParameterInput,
  validateCreateDewormingInput,
  validateCreateHouseholdInput,
  validateCreateMedicalVisitInput,
  validateCreateVaccinationInput,
  validateCreateWeightInput,
  validateChangePasswordInput,
  validateDeleteAccountInput,
  validateUpdateProfileInput,
  validateInviteMemberInput,
  validateLoginInput,
  validateRegisterUserInput,
  type ValidatorFunction,
} from '../../generated/schemas/validators.mjs';
// El alta y la edición de mascota usan el contrato 3.1.0 (breedCode, microchip) mientras el resto de formularios sigue en la 002.
import { validateCreateBodyMeasurementInput, validateCreatePetInput, validateUpdatePetInput } from '../../generated/v31/schemas/validators.mjs';

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
  UpdateProfileInput: validateUpdateProfileInput,
  ChangePasswordInput: validateChangePasswordInput,
  DeleteAccountInput: validateDeleteAccountInput,
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
    // T293: el texto técnico del esquema formal nunca llega a la pantalla; el resto de códigos usa su texto del catálogo.
    errors[field] = code === 'ERR-SCHEMA-VALIDATION-FAILED' ? humanSchemaMessage(field === FORM_ERROR_KEY ? undefined : field) : ERROR_CATALOG[code].detailTemplate;
  }
  return errors;
}

/**
 * Convierte los valores de texto de un formulario al tipo del contrato: vacío opcional → se omite,
 * numérico → `Number`. No interpreta reglas de negocio.
 */
export type FormBody = Record<string, string | number | boolean>;

/** Campos de contraseña: nunca se recortan (un espacio puede formar parte de la contraseña) [REQ-FRM-001]. */
const PASSWORD_FIELDS: ReadonlySet<string> = new Set(['password', 'confirmPassword', 'currentPassword', 'newPassword']);

/**
 * `trim()` en el límite del formulario (REQ-FRM-001): todo texto se recorta antes de validar, salvo las contraseñas. El servidor
 * mantiene `NonEmptyTrimmedString` sin relajarlo; esto corrige en cliente el espacio final del autocorrector móvil.
 */
export function formValues(raw: Readonly<Record<string, string>>, numeric: readonly string[] = [], booleans: readonly string[] = []): FormBody {
  const out: FormBody = {};
  for (const [key, original] of Object.entries(raw)) {
    const value = PASSWORD_FIELDS.has(key) ? original : original.trim();
    if (value === '') continue;
    out[key] = booleans.includes(key) ? value === 'true' : numeric.includes(key) ? Number(value) : value;
  }
  return out;
}
