/**
 * Mensajes humanos de error de esquema (T293, REQ-UI-005, REQ-UI2-006, INV-ARCH-003; decisiones D1 y D2 del hallazgo 6-A).
 * Solo presentación: el código del error sigue siendo el del catálogo; aquí solo se redacta el texto visible para
 * `ERR-SCHEMA-VALIDATION-FAILED`, de modo que ningún campo muestre «El payload incumple el esquema formal…».
 *
 * @implements REQ-UI-005, REQ-UI2-006, INV-ARCH-003, ERR-SCHEMA-VALIDATION-FAILED
 */

/** Sintagma nominal en lenguaje llano de cada campo de los formularios (nombre del campo del contrato → texto). */
const FIELD_PHRASE: Readonly<Record<string, string>> = {
  username: 'el usuario',
  displayName: 'el nombre visible',
  email: 'el correo',
  password: 'la contraseña',
  confirmPassword: 'la confirmación de la contraseña',
  currentPassword: 'la contraseña actual',
  newPassword: 'la contraseña nueva',
  confirmationPhrase: 'la frase de confirmación',
  name: 'el nombre',
  species: 'la especie',
  breed: 'la raza',
  birthDate: 'la fecha de nacimiento',
  sex: 'el sexo',
  avatarUrl: 'la URL del avatar',
  baseHouseholdId: 'el hogar base',
  roleOnJoin: 'el rol al unirse',
  preferredLanguage: 'el idioma',
  timezone: 'la zona horaria',
  recordedAt: 'la fecha',
  weightKg: 'el peso',
  neckCm: 'la medida del cuello',
  chestCm: 'la medida del pecho',
  backLengthCm: 'el largo del lomo',
  waistCm: 'la medida de la cintura',
  notes: 'las notas',
  vaccineName: 'el nombre de la vacuna',
  appliedAt: 'la fecha de aplicación',
  nextBoosterAt: 'la fecha del próximo refuerzo',
  batchOrClinic: 'el lote o la clínica',
  productBrand: 'el producto',
  dewormingType: 'el tipo de desparasitación',
  nextSuggestedDoseAt: 'la fecha de la próxima dosis',
  visitDate: 'la fecha de la consulta',
  reason: 'el motivo',
  diagnosis: 'el diagnóstico',
  treatment: 'el tratamiento',
  clinicOrVet: 'la clínica o el veterinario',
  observations: 'las observaciones',
  category: 'la categoría',
  title: 'el título',
  description: 'la descripción',
};

/** Frase para un error general del formulario (por ejemplo, un dato que el formulario no admite). */
export const GENERAL_SCHEMA_MESSAGE = 'Revisa los datos: hay un dato que este formulario no admite.';

/** Mensaje llano para un campo con error de esquema; sin campo conocido, la frase general. */
export function humanSchemaMessage(field?: string): string {
  if (field === undefined) return GENERAL_SCHEMA_MESSAGE;
  const phrase = FIELD_PHRASE[field];
  return phrase === undefined ? GENERAL_SCHEMA_MESSAGE : `Revisa ${phrase}: falta o no tiene un formato válido.`;
}
