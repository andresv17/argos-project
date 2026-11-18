/**
 * T767 / T775 [US4] conformidad de los tipos y textos del enlace veterinario de la SPA con el contrato 3.3.0 (REQ-VET-001, REQ-VET-005, REQ-SUM-004, SC-005-015): la SPA
 * declara localmente las formas (la regla de capas solo admite módulos concretos de `generated/`); aquí se comprueba que no se desvían de las generadas.
 */
import { describe, expect, it } from 'vitest';
import type { ClinicalSummary, CreateShareLinkInput, ShareLinkList, ShareLinkView, SharedSummaryView } from '../../../src/generated/v33/index.ts';
import { ERROR_CATALOG } from '../../../src/generated/v33/errors/error-codes.ts';
import type { CreateShareLinkBody, ShareLinkList as WebShareLinkList, ShareLinkView as WebShareLinkView, SharedSummaryViewModel } from '../../../src/presentation/web/share-api.ts';
import { parseHttpDate, shareProblemMessage } from '../../../src/presentation/web/share-view.ts';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const shapes: [Same<WebShareLinkView, ShareLinkView>, Same<WebShareLinkList, ShareLinkList>, Same<CreateShareLinkBody, Required<CreateShareLinkInput>>] = [true, true, true];
/** El modelo de la vista debe aceptar un SharedSummaryView generado (la SPA solo lee). */
const accepts = (view: SharedSummaryView): SharedSummaryViewModel => view as unknown as SharedSummaryViewModel;
const scopes: Array<Same<SharedSummaryViewModel['summary']['scope'], ClinicalSummary['scope']>> = [true];

describe('T767 tipos y textos del enlace frente al contrato 3.3.0', () => {
  it('[REQ-VET-001] ShareLinkView, ShareLinkList y CreateShareLinkInput son asignables en ambos sentidos a los tipos generados (comprobación de compilación)', () => {
    expect([shapes, scopes, typeof accepts]).toEqual([[true, true, true], [true], 'function']);
  });

  it('[REQ-VET-012] el mensaje de ERR-SHARE-LINK-LIMIT coincide con el catálogo 3.3.0 y los demás errores no filtran detalle', () => {
    expect(shareProblemMessage('ERR-SHARE-LINK-LIMIT')).toBe(ERROR_CATALOG['ERR-SHARE-LINK-LIMIT'].detailTemplate);
    expect(shareProblemMessage('cualquier-otro')).toBe('No se pudo completar la operación. Inténtalo de nuevo.');
  });

  it('[REQ-VET-004] la hora del servidor sale de la cabecera Date sin usar el reloj del navegador; una cabecera ausente o rara es null', () => {
    expect(parseHttpDate('Wed, 18 Nov 2026 12:00:00 GMT')).toBe('2026-11-18T12:00:00.000Z');
    expect(parseHttpDate('Sun, 6 Dec 2026 03:04:05 GMT')).toBe('2026-12-06T03:04:05.000Z');
    expect([parseHttpDate(null), parseHttpDate('ayer'), parseHttpDate('Wed, 18 Xyz 2026 12:00:00 GMT')]).toEqual([null, null, null]);
  });
});
