import { describe, expect, it } from 'vitest';
import { catalogProblem, problemMessage } from '../../../src/presentation/web/api.ts';
import { FORM_ERROR_KEY, validateInput } from '../../../src/presentation/web/validation.ts';

/**
 * T284 — mensajes humanos de error (REQ-UI-005, REQ-UI2-006, INV-ARCH-003; hallazgo 6-A, D1 y D2): la capa de
 * presentación redacta por campo y nunca muestra el texto técnico del esquema formal. El código sigue siendo el del catálogo.
 */
const TECHNICAL = ['El payload incumple el esquema formal', 'propiedades no autorizadas', 'payload', 'esquema'];
const technicalIn = (text: string): string[] => TECHNICAL.filter((t) => text.toLowerCase().includes(t.toLowerCase()));

describe('mensajes humanos de error (T284)', () => {
  it('[REQ-UI-005][INV-ARCH-003] ningún campo con error de esquema muestra texto técnico, y cada mensaje nombra el campo en lenguaje llano', () => {
    const cases: ReadonlyArray<[string, Record<string, string>, string, RegExp]> = [
      ['usuario ausente', validateInput('RegisterUserInput', { displayName: 'Andrés', password: 'Secreto2026!', confirmPassword: 'Secreto2026!' }), 'username', /usuario/i],
      ['usuario con mayúsculas', validateInput('RegisterUserInput', { username: 'Andrés!', displayName: 'Andrés', password: 'Secreto2026!', confirmPassword: 'Secreto2026!' }), 'username', /usuario/i],
      ['contraseña ausente en el ingreso', validateInput('LoginInput', { username: 'andres' }), 'password', /contraseña/i],
      ['nombre de hogar ausente', validateInput('CreateHouseholdInput', {}), 'name', /nombre/i],
    ];
    const observed = cases.map(([label, errors, field, word]) => ({ label, technical: technicalIn(errors[field] ?? ''), namesField: word.test(errors[field] ?? '') }));
    expect(observed).toEqual(cases.map(([label]) => ({ label, technical: [], namesField: true })));
  });

  it('[REQ-UI-005] una propiedad no autorizada cae en el error general con una frase llana, sin el texto técnico del catálogo', () => {
    const message = validateInput('CreateHouseholdInput', { name: 'Casa', extra: 1 })[FORM_ERROR_KEY] ?? '';
    expect([message.length > 0, technicalIn(message)]).toEqual([true, []]);
  });

  it('[REQ-UI-005][ERR-SCHEMA-VALIDATION-FAILED] el mensaje que la pantalla muestra para ese código tampoco contiene el texto técnico', () => {
    expect(technicalIn(problemMessage(catalogProblem('ERR-SCHEMA-VALIDATION-FAILED', 'username')))).toEqual([]);
  });
});
