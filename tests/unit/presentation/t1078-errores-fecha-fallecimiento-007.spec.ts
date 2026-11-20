/**
 * T1078 (007, ajuste 2 tras la prueba manual de Neo): el rechazo de un registro con fecha posterior al fallecimiento (REQ-FAL7-005) conserva su mensaje humano en lugar del
 * genérico «Revisa la fecha…», los errores técnicos crudos de JSON Schema siguen filtrados, y el error por campo no se repite en el banner inferior.
 * REQ-FAL7-005, REQ-UI-005, ERR-SCHEMA-VALIDATION-FAILED.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalogProblem, problemMessage, type ProblemDetails } from '../../../src/presentation/web/api.ts';
import { FormError } from '../../../src/presentation/web/components/Field.tsx';
import { businessRuleMessage, humanSchemaMessage } from '../../../src/presentation/web/schema-messages.ts';
import { problemFeedback } from '../../../src/presentation/web/use-contract-form.ts';

const SERVER_DETAIL = 'La mascota está registrada como fallecida: el registro no puede tener una fecha posterior (REQ-FAL7-005).';
const withDetail = (detail: string, field?: string): ProblemDetails => ({ ...catalogProblem('ERR-SCHEMA-VALIDATION-FAILED', field), detail });

describe('T1078 mensaje de regla de negocio bajo ERR-SCHEMA-VALIDATION-FAILED (REQ-FAL7-005)', () => {
  it('[REQ-FAL7-005] conserva el mensaje de fecha posterior al fallecimiento, sin la referencia al requisito', () => {
    const shown = problemMessage(withDetail(SERVER_DETAIL, 'recordedAt'));
    expect(shown).toBe('La mascota está registrada como fallecida: el registro no puede tener una fecha posterior.');
    expect(shown).not.toBe(humanSchemaMessage('recordedAt'));
    expect(shown).not.toContain('falta o no tiene un formato válido');
  });

  it('[REQ-FAL7-005] el aviso de registros posteriores al marcar el fallecimiento no muestra identificadores internos', () => {
    const detail = 'Hay registros con fecha posterior al fallecimiento; corrígelos antes (REQ-FAL7-005): weights:0b1c2d3e-0000-4000-8000-000000000001, vaccinations:abc-123.';
    expect(businessRuleMessage(detail)).toBe('Hay registros con fecha posterior al fallecimiento; corrígelos antes.');
  });

  it('[REQ-UI-005] los errores técnicos crudos de JSON Schema NO se muestran: caen en el texto llano por campo', () => {
    const raw = ['CreateWeightInput: recordedAt must match format "date".', 'CreateWeightInput: weightKg must be number (REQ-REC-001).', 'El payload incumple el esquema formal del contrato.', '/recordedAt must be string'];
    for (const detail of raw) {
      expect([detail, problemMessage(withDetail(detail, 'recordedAt'))]).toEqual([detail, humanSchemaMessage('recordedAt')]);
    }
  });

  it('[REQ-UI-005] sin detalle de regla (catálogo tal cual) se conserva el comportamiento anterior y sin campo cae en la frase general', () => {
    expect(problemMessage(catalogProblem('ERR-SCHEMA-VALIDATION-FAILED', 'weightKg'))).toBe(humanSchemaMessage('weightKg'));
    expect(problemMessage(catalogProblem('ERR-SCHEMA-VALIDATION-FAILED'))).toBe(humanSchemaMessage());
    expect(businessRuleMessage(undefined)).toBeUndefined();
  });
});

describe('T1078 sin duplicar el error: campo o banner, no ambos', () => {
  const fields = ['recordedAt', 'weightKg', 'notes'];

  it('[REQ-FAL7-005] un error con campo conocido se pinta bajo el campo y el banner queda vacío', () => {
    const feedback = problemFeedback(withDetail(SERVER_DETAIL, 'recordedAt'), fields);
    expect(feedback.errors).toEqual({ recordedAt: 'La mascota está registrada como fallecida: el registro no puede tener una fecha posterior.' });
    expect(feedback.message).toBeNull();
  });

  it('[REQ-UI-005] un error global sin campo va solo al banner', () => {
    const feedback = problemFeedback(catalogProblem('ERR-INTERNAL-UNEXPECTED'), fields);
    expect(feedback.errors).toEqual({});
    expect(feedback.message).toBe(problemMessage(catalogProblem('ERR-INTERNAL-UNEXPECTED')));
  });

  it('[REQ-UI-005] un error con un campo que el formulario no muestra no se pierde: va al banner', () => {
    const feedback = problemFeedback(withDetail(SERVER_DETAIL, 'otroCampo'), fields);
    expect(feedback.message).toBe('La mascota está registrada como fallecida: el registro no puede tener una fecha posterior.');
  });

  it('[REQ-UI-005] FormError no pinta nada sin mensaje global, aunque haya errores por campo', () => {
    expect(renderToStaticMarkup(h(FormError, { errors: { recordedAt: 'x' }, message: null }))).toBe('');
  });
});
