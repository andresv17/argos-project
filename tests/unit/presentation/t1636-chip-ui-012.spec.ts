/**
 * T1636 (Feature 012, Bloque B, #23): interfaz del diálogo «Este microchip ya está registrado» (3 salidas), «Mis solicitudes de microchip» y cola de disputas de /admin con step-up y control dual.
 * Cliente con `fetch` simulado y render estático; el recorrido en navegadores reales es la prueba manual T1637.
 * @implements REQ-CHP12-001, REQ-CHP12-003, REQ-CHP12-004, REQ-CHP12-009, INV-CHP12-003, INV-CHP12-006
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProblem, MICROCHIP_REGISTERED_CODE, isMicrochipRegistered, problemMessage, toProblem } from '../../../src/presentation/web/api.ts';
import { ChipApiError, chipProblemMessage, createChipApi } from '../../../src/presentation/web/chip-api.ts';
import { ChipRegisteredDialog } from '../../../src/presentation/web/components/ChipRegisteredDialog.tsx';
import { DisputesPanel, resolutionsFor } from '../../../src/presentation/admin/DisputesPanel.tsx';
import { confirmDispute, resolveDispute } from '../../../src/presentation/admin/disputes-api.ts';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function fakeFetch(responses: Array<{ status: number; body?: unknown }>, calls: Call[]): typeof fetch {
  let index = 0;
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status, headers: { 'content-type': next.status >= 400 ? 'application/problem+json' : 'application/json' } });
  }) as unknown as typeof fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe('T1636 cliente de reclamación y disputa', () => {
  it('[REQ-CHP12-003] la reclamación envía POST JSON con CSRF y sin mensaje vacío; el 202 no devuelve nada que distinga el chip', async () => {
    const calls: Call[] = [];
    await createChipApi(fakeFetch([{ status: 202, body: { status: 'RECEIVED' } }], calls)).claim('985112345678901', '  ');
    expect(calls[0]!.url).toBe('/api/chip-claims');
    expect((calls[0]!.init.headers as Record<string, string>)['X-Argos-Request']).toBe('1');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ microchipId: '985112345678901' });
  });

  it('[REQ-CHP12-004] la disputa viaja como multipart con un campo microchipId y una parte evidence por archivo; el Content-Type lo fija el navegador', async () => {
    const calls: Call[] = [];
    const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.png', { type: 'image/png' })];
    await createChipApi(fakeFetch([{ status: 202, body: { status: 'RECEIVED' } }], calls)).openDispute('985112345678901', files);
    const form = calls[0]!.init.body as FormData;
    expect([form.get('microchipId'), form.getAll('evidence').length]).toEqual(['985112345678901', 2]);
    expect(Object.keys(calls[0]!.init.headers as Record<string, string>)).toEqual(['X-Argos-Request']);
  });

  it('[REQ-CHP12-005] 429, 409 y 503 dan textos propios; lo desconocido cae al genérico sin detalle del servidor', async () => {
    const api = createChipApi(fakeFetch([{ status: 409, body: { code: 'ERR-CHP12-CLAIM-COOLDOWN' } }], []));
    const error = await api.claim('985112345678901').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChipApiError);
    expect(chipProblemMessage(error)).toContain('rechazada hace poco');
    expect(chipProblemMessage(new ChipApiError('ERR-RATE-LIMITED', 429))).toContain('muchos intentos');
    expect(chipProblemMessage(new ChipApiError('ERR-X', 500))).toBe('No pudimos completar la acción. Inténtalo de nuevo.');
  });

  it('[REQ-CHP12-001] el cliente tipado de la SPA conserva el código del 409 «microchip registrado» (no lo convierte en error inesperado)', () => {
    const problem = toProblem({ code: MICROCHIP_REGISTERED_CODE, status: 409, title: 'x', detail: 'x', type: 'x' });
    expect(problem.code).toBe(MICROCHIP_REGISTERED_CODE);
    expect(isMicrochipRegistered(new ApiProblem(problem))).toBe(true);
    expect(problemMessage(problem)).not.toContain('contacta');
  });
});

describe('T1636 diálogo «Este microchip ya está registrado»', () => {
  it('[REQ-CHP12-001][INV-CHP12-003] ofrece las tres salidas y no dice quién tiene el chip ni si la mascota existe', () => {
    const html = renderToStaticMarkup(h(ChipRegisteredDialog, { chip: '985112345678901', api: createChipApi(fakeFetch([{ status: 202 }], [])), onCorrect: () => undefined, onClose: () => undefined }));
    expect(html).toContain('Este microchip ya está registrado');
    expect(html).toContain('Corregir el número');
    expect(html).toContain('Solicitar co-propiedad');
    expect(html).toContain('Es mía: abrir una disputa');
    expect(html).not.toContain('985112345678901');
    expect(html).not.toMatch(/ya existe una mascota|pertenece a/);
  });
});

describe('T1636 cola de disputas de /admin', () => {
  it('[REQ-CHP12-009] resolve y confirm piden SIEMPRE un step-up de un solo uso antes y lo envían en la decisión', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', fakeFetch([{ status: 201, body: { grantId: 'grant_00000001', expiresAt: 'x' } }, { status: 200, body: { disputeId: 'd' } }], calls));
    await resolveDispute('11111111-1111-4111-8111-111111111111', 'ADD_CO_OWNER', 'Documentos verificados');
    expect(calls.map((c) => c.url)).toEqual(['/api/admin/disputes/11111111-1111-4111-8111-111111111111/step-up', '/api/admin/disputes/11111111-1111-4111-8111-111111111111/resolve']);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ disputeId: '11111111-1111-4111-8111-111111111111', action: 'resolve' });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ resolution: 'ADD_CO_OWNER', reason: 'Documentos verificados', stepUpGrantId: 'grant_00000001' });
    calls.length = 0;
    vi.stubGlobal('fetch', fakeFetch([{ status: 403 }], calls));
    expect((await confirmDispute('11111111-1111-4111-8111-111111111111', 'ok')).kind).toBe('FORBIDDEN');
    expect(calls).toHaveLength(1); // sin step-up no se llega a confirm
  });

  it('[REQ-CHP12-004] las decisiones ofrecidas dependen del tipo (END_CO_OWNERSHIP solo ausencia de co-propietario) y el panel monta con la cola vacía', () => {
    expect(resolutionsFor('CHIP_APPROPRIATION')).toEqual(['REJECT', 'ADD_CO_OWNER', 'REQUEST_CHANGE_PRINCIPAL']);
    expect(resolutionsFor('CO_OWNER_ABSENT_OR_BLOCKING')).toEqual(['REJECT', 'END_CO_OWNERSHIP']);
    expect(resolutionsFor('PRINCIPAL_ABSENT')).toEqual(['REJECT', 'REQUEST_CHANGE_PRINCIPAL']);
    expect(renderToStaticMarkup(h(DisputesPanel, { onSessionLost: () => undefined }))).toContain('Disputas de microchip');
  });
});
