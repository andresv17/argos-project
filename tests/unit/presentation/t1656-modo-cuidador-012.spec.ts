/**
 * T1656 (Feature 012, Bloque C, #26): cliente HTTP y presentación del Modo Cuidador (REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-008, EDGE-012-049). Cliente con `fetch` simulado (CSRF, rutas,
 * conflicto 409 con autor, 429 con Retry-After), textos puros (advertencia de doble toma, aviso de límites, VIEW_ONLY sin «solo lectura general») y render estático de la pestaña; el recorrido real
 * en dos navegadores es la prueba manual T1657.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CareApiError, careProblemMessage, createCareApi, type MyCareAccessView } from '../../../src/presentation/web/care-api.ts';
import { CARE_LIMITS_NOTICE, CARE_UNDO_MINUTES, REVERT_FORBIDDEN_TEXT, TIMEZONE_INLINE, canOfferRevert, DOSE_DISCLAIMER, DOUBLE_DOSE_WARNING, bogotaTimeOf, conflictText, groupByTime, levelDescription, parseTimes } from '../../../src/presentation/web/care-view.ts';
import { CarePanel } from '../../../src/presentation/web/components/CarePanel.tsx';
import { PetDashboard } from '../../../src/presentation/web/components/PetDashboard.tsx';
import { dashboardAs } from './rebanada6-fixtures.ts';

const PET = '44444444-4444-4444-8444-444444444401';
interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function fakeFetch(status: number, body: unknown, calls: Call[] = [], headers: Record<string, string> = {}): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers } });
  }) as unknown as typeof fetch;
}
const ACCESS: MyCareAccessView = { petId: PET, caregiver: true, level: 'VIEW_ONLY', defaultedToViewOnly: true, careUntil: null, canViewRoutines: true, canLogCare: false, canManageRoutines: false, clinicalPermissionsUnchanged: true };

describe('T1656 cliente del Modo Cuidador', () => {
  it('[REQ-CAR12-003] registrar envía POST con CSRF y distingue 201 de 200; revertir envía el motivo; las rutas son las del OpenAPI', async () => {
    const calls: Call[] = [];
    const entry = { id: 'e1', status: 'DONE' };
    const created = await createCareApi(fakeFetch(201, entry, calls)).logEntry(PET, { routineId: 'r1', occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status: 'DONE' });
    const retried = await createCareApi(fakeFetch(200, entry)).logEntry(PET, { routineId: 'r1', occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status: 'DONE' });
    expect([created.created, retried.created]).toEqual([true, false]);
    const headers = new Headers(calls[0]?.init.headers);
    expect([calls[0]?.url, calls[0]?.init.method, headers.get('x-argos-request')]).toEqual([`/api/pets/${PET}/care/log`, 'POST', '1']);
    const more: Call[] = [];
    const api = createCareApi(fakeFetch(200, { items: [] }, more));
    await api.revertEntry(PET, 'e1', 'me equivoqué');
    await api.today(PET);
    await api.listAccess(PET);
    await api.removeAccess(PET, 'u2');
    expect(more.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      `POST /api/pets/${PET}/care/log/e1/revert`,
      `GET /api/pets/${PET}/care/today`,
      `GET /api/pets/${PET}/care/access`,
      `DELETE /api/pets/${PET}/care/access/u2`,
    ]);
    expect(more[0]?.init.body).toBe('{"reason":"me equivoqué"}');
  });

  it('[REQ-CAR12-003] el 409 trae el autor, la hora y el estado; el texto los muestra en hora de Bogotá', async () => {
    const existing = { performedByDisplayName: 'María', performedAt: '2026-11-26T13:30:00.000Z', status: 'DONE' };
    const error = await createCareApi(fakeFetch(409, { code: 'ERR-CAR12-ALREADY-LOGGED', existing })).logEntry(PET, { routineId: 'r1', occurrenceDate: '2026-11-26', occurrenceTime: '08:00', status: 'DONE' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CareApiError);
    expect((error as CareApiError).existing).toEqual(existing);
    expect(conflictText((error as CareApiError).existing)).toBe('Ya la registró María a las 08:30 (hora de Bogotá) como hecha. Revisa el registro antes de darla de nuevo.');
    expect(bogotaTimeOf('2026-11-26T13:30:00.000Z')).toBe('08:30');
  });

  it('[R-3] el 429 conserva Retry-After y el texto dice cuánto esperar; el 409 de rutina no repite datos de la fila', async () => {
    const limited = await createCareApi(fakeFetch(429, { code: 'ERR-RATE-LIMITED' }, [], { 'retry-after': '1800' })).today(PET).catch((e: unknown) => e);
    expect([(limited as CareApiError).code, (limited as CareApiError).retryAfterSeconds]).toEqual(['ERR-RATE-LIMITED', 1800]);
    expect(careProblemMessage('ERR-RATE-LIMITED', null, 1800)).toContain('30 min');
    expect(careProblemMessage('ERR-CAR12-ROUTINE-STALE')).toContain('revisa la dosis y el horario');
    expect(careProblemMessage('ERR-SCHEMA-VALIDATION-FAILED', 'confirmHighDose')).toContain('Confírmala');
    expect(careProblemMessage('ERR-ALGO-NUEVO')).toBe('No pudimos completar la acción. Inténtalo de nuevo.');
  });
});

describe('T1656 textos y reglas de presentación', () => {
  it('[REQ-CAR12-008][EDGE-012-049] avisos literales del contrato; VIEW_ONLY no se presenta como «solo lectura» general y conserva lo clínico', () => {
    expect(CARE_LIMITS_NOTICE).toBe('Las instrucciones las define el propietario; ante dudas consulta al veterinario');
    expect(DOUBLE_DOSE_WARNING).toBe('Registrar la toma no la impide: verifica en el registro antes de darla');
    expect(DOSE_DISCLAIMER).toContain('no calcula ni verifica dosis, ni interacciones');
    expect(DOSE_DISCLAIMER).toContain('Sigue siempre la indicación de tu veterinario.');
    const viewOnly = levelDescription(ACCESS) ?? '';
    expect(viewOnly).toContain('pesos, medidas, eventos sanitarios, archivos y fotos no cambian');
    expect(viewOnly.toLowerCase()).not.toContain('solo lectura');
    expect(levelDescription({ ...ACCESS, level: 'BASIC_LOG', defaultedToViewOnly: false, canLogCare: true })).toContain('ver y registrar el cuidado');
    expect(levelDescription({ ...ACCESS, caregiver: false })).toBeNull();
  });

  it('agrupa por hora y lee horas sueltas', () => {
    const occ = (time: string) => ({ routineId: time, kind: 'MEAL' as const, title: 'x', doseAmount: null, doseUnit: null, instructions: null, occurrenceDate: '2026-11-26', occurrenceTime: time, state: 'PENDING' as const, logEntry: null });
    expect(groupByTime([occ('08:00'), occ('08:00'), occ('20:00')]).map((g) => [g.time, g.items.length])).toEqual([['08:00', 2], ['20:00', 1]]);
    expect(parseTimes('8:00, 20:30;21:00')).toEqual(['08:00', '20:30', '21:00']);
  });
});

describe('T1656 pestaña «Modo Cuidador»', () => {
  const noop = (): void => undefined;
  const asyncNoop = async (): Promise<void> => undefined;
  const render = (withCare: boolean): string =>
    renderToStaticMarkup(h(PetDashboard, { dashboard: dashboardAs('OWNER'), activeTab: 'weights', onTabChange: noop, onAddRecord: asyncNoop, onEdit: noop, onDelete: noop, onTransfer: noop, ...(withCare ? { careSlot: h('div', null, 'panel') } : {}) }));

  it('la pestaña solo existe con careSlot', () => {
    expect(render(true)).toContain('Modo Cuidador');
    expect(render(false)).not.toContain('Modo Cuidador');
  });

  it('el panel nace en estado de carga con su título accesible', () => {
    const markup = renderToStaticMarkup(h(CarePanel, { petId: PET, petName: 'Argos' }));
    expect(markup).toContain(`aria-labelledby="care-title-${PET}"`);
    expect(markup).toContain('Modo Cuidador de Argos');
    expect(markup).toContain('Cargando');
  });
});

describe('T1658 reglas de presentación corregidas', () => {
  const NOW = Date.parse('2026-11-26T15:00:00.000Z');
  const entry = (minutesAgo: number, performedByMe = true) => ({ performedByMe, performedAt: new Date(NOW - minutesAgo * 60_000).toISOString(), revertedAt: null });
  const input = (over: Partial<Parameters<typeof canOfferRevert>[0]>) => ({ canLogCare: true, canManageRoutines: false, entry: entry(1), nowMs: NOW, ...over });

  it('[H-1 kid] «Deshacer» se ofrece al autor no titular solo dentro de 10 minutos, igual que el servidor; el titular siempre y un ajeno nunca', () => {
    expect(CARE_UNDO_MINUTES).toBe(10);
    expect(canOfferRevert(input({}))).toBe(true);
    expect(canOfferRevert(input({ entry: entry(10) }))).toBe(true);
    expect(canOfferRevert(input({ entry: entry(10.5) }))).toBe(false);
    expect(canOfferRevert(input({ entry: entry(30, false) }))).toBe(false);
    expect(canOfferRevert(input({ entry: entry(1, false) }))).toBe(false);
    expect(canOfferRevert(input({ canManageRoutines: true, entry: entry(300, false) }))).toBe(true);
    expect(canOfferRevert(input({ canLogCare: false }))).toBe(false);
    expect(canOfferRevert(input({ entry: { ...entry(1), revertedAt: '2026-11-26T14:59:00.000Z' } }))).toBe(false);
    expect(canOfferRevert(input({ entry: null }))).toBe(false);
  });

  it('[H-1 kid] el 403 de reversión explica la ventana de 10 minutos y no le pide al cuidador que revise su nivel', () => {
    expect(REVERT_FORBIDDEN_TEXT).toContain('10 minutos');
    expect(REVERT_FORBIDDEN_TEXT.toLowerCase()).not.toContain('nivel');
  });

  it('[B-1 sati] «Bogotá» conserva su mayúscula dentro de la frase', () => {
    expect(TIMEZONE_INLINE).toBe('hora de Bogotá');
  });
});
