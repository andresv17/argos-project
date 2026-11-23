/**
 * T1250 (009, `[GH:#18]`) cliente y textos de las solicitudes de registro de /admin: validación de forma de las respuestas, llamadas exactas a `/api/admin/*` (con `X-Argos-Request`
 * solo en las decisiones), distinción del 404 uniforme (sesión perdida) y del 404 problem+json (solicitud no disponible), y textos sin umbral ni «lista». La UI en navegador es el E2E de T1250.
 *
 * @implements REQ-APR9-005, NFR-009-001, EDGE-009-008, EDGE-009-039; SC-009-006, SC-009-008
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationsPanel } from '../../../src/presentation/admin/RegistrationsPanel.tsx';
import { decideRegistration, fetchPendingCount, fetchRegistrations, parsePendingCount, parseRegistrationPage } from '../../../src/presentation/admin/registrations-api.ts';
import { CONFIRM_HINT, METHOD_LABEL, WARNING_TEXT, confirmQuestion, decisionDone, formatRequestedAt, pendingCountText } from '../../../src/presentation/admin/registrations-view.ts';

const ID = '00000000-0000-4000-8000-000000000001';
const ITEM = { registrationId: ID, username: 'ana_perez', requestedAt: '2026-11-01T15:00:00.000Z', method: 'PASSWORD' };

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('validación de forma (T1250)', () => {
  it('[REQ-APR9-005] el contador acepta solo { pending: entero ≥ 0, warning: boolean }', () => {
    expect(parsePendingCount({ pending: 3, warning: false })).toEqual({ pending: 3, warning: false });
    for (const bad of [null, 'x', {}, { pending: -1, warning: false }, { pending: 1.5, warning: false }, { pending: '3', warning: false }, { pending: 3 }, { pending: 3, warning: 'no' }]) {
      expect(parsePendingCount(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('[REQ-APR9-005][NFR-009-004] la página conserva solo registrationId, username, requestedAt y method; un correo o sub extra no pasa a la UI', () => {
    const page = parseRegistrationPage({ items: [{ ...ITEM, email: 'x@y.z', sub: 's' }], nextCursor: 'abc_-1' });
    expect(page).toEqual({ items: [ITEM], nextCursor: 'abc_-1' });
    expect(JSON.stringify(page)).not.toMatch(/email|sub|@/);
    expect(parseRegistrationPage({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
  });

  it('[REQ-APR9-005] una página con un elemento mal formado se rechaza completa', () => {
    for (const bad of [
      { items: [{ ...ITEM, method: 'EMAIL' }], nextCursor: null },
      { items: [{ ...ITEM, registrationId: 'no-uuid' }], nextCursor: null },
      { items: [{ ...ITEM, username: '' }], nextCursor: null },
      { items: [{ ...ITEM, requestedAt: 'ayer' }], nextCursor: null },
      { items: [ITEM], nextCursor: 5 },
      { items: 'x', nextCursor: null },
      null,
    ]) {
      expect(parseRegistrationPage(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('cliente /api/admin (T1250)', () => {
  it('[REQ-APR9-005] el contador se pide por GET a /api/admin/pending-count con la cookie del mismo origen', async () => {
    const spy = stubFetch(json({ pending: 2, warning: true }));
    expect(await fetchPendingCount()).toEqual({ kind: 'OK', value: { pending: 2, warning: true } });
    const [path, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/admin/pending-count');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
  });

  it('[REQ-APR9-005] la lista pide el cursor opaco codificado y la primera página sin cursor', async () => {
    const spy = stubFetch(json({ items: [ITEM], nextCursor: null }));
    await fetchRegistrations(null);
    await fetchRegistrations('a_b-9');
    expect(spy.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['/api/admin/registrations', '/api/admin/registrations?cursor=a_b-9']);
  });

  it('[REQ-APR9-005][REQ-ADM9-005] la decisión es POST con X-Argos-Request a approve|reject del id', async () => {
    const spy = stubFetch(json({ registrationId: ID, accountStatus: 'ACTIVE', decidedAt: '2026-11-23T12:00:00Z' }));
    expect(await decideRegistration(ID, 'approve')).toEqual({ kind: 'OK', value: true });
    await decideRegistration(ID, 'reject');
    const calls = spy.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map((c) => c[0])).toEqual([`/api/admin/registrations/${ID}/approve`, `/api/admin/registrations/${ID}/reject`]);
    for (const [, init] of calls) {
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['X-Argos-Request']).toBe('1');
    }
  });

  it('[EDGE-009-008][EDGE-009-039] 404 uniforme (text/plain) = sesión perdida; 404 problem+json = solicitud no disponible; otros estados y fallos de red = FAILED', async () => {
    stubFetch(new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    expect(await decideRegistration(ID, 'approve')).toEqual({ kind: 'SESSION_LOST' });
    expect(await fetchRegistrations(null)).toEqual({ kind: 'SESSION_LOST' });
    stubFetch(new Response('{}', { status: 404, headers: { 'content-type': 'application/problem+json' } }));
    expect(await decideRegistration(ID, 'reject')).toEqual({ kind: 'NOT_FOUND' });
    stubFetch(new Response('{}', { status: 500 }));
    expect(await fetchPendingCount()).toEqual({ kind: 'FAILED' });
    stubFetch(json({ pending: 'x' }));
    expect(await fetchPendingCount()).toEqual({ kind: 'FAILED' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('red'); }));
    expect(await fetchRegistrations(null)).toEqual({ kind: 'FAILED' });
  });
});

describe('textos y formato (T1250)', () => {
  it('[SC-009-008] contador en singular, plural y vacío', () => {
    expect(pendingCountText(0)).toBe('No hay solicitudes pendientes.');
    expect(pendingCountText(1)).toBe('1 solicitud pendiente');
    expect(pendingCountText(51)).toBe('51 solicitudes pendientes');
  });

  it('[SC-009-008][D9-25] el aviso no muestra el umbral numérico', () => {
    expect(WARNING_TEXT).not.toMatch(/\d/);
  });

  it('[REQ-APR9-005] método legible, fecha en America/Bogota y confirmaciones que nombran a la persona y avisan los 30 días del rechazo', () => {
    expect(METHOD_LABEL).toEqual({ PASSWORD: 'Usuario y contraseña', GOOGLE: 'Google' });
    expect(formatRequestedAt('2026-11-01T03:30:00.000Z')).toMatch(/31 de oct de 2026/);
    expect(confirmQuestion('approve', 'ana')).toBe('¿Aprobar la solicitud de ana?');
    expect(confirmQuestion('reject', 'ana')).toBe('¿Rechazar la solicitud de ana?');
    expect(CONFIRM_HINT.reject).toContain('30 días');
    expect(decisionDone('approve', 'ana')).toBe('Solicitud de ana aprobada.');
    expect(decisionDone('reject', 'ana')).toBe('Solicitud de ana rechazada.');
  });

  it('[NFR-009-001] el panel inicial (antes de datos) es una sección con encabezado enfocable y estado de carga, sin acciones', () => {
    const markup = renderToStaticMarkup(h(RegistrationsPanel, { onSessionLost: () => undefined }));
    expect(markup).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Solicitudes de registro<\/h2>/);
    expect(markup).toContain('Cargando solicitudes');
    expect(markup).not.toMatch(/<button/);
    expect(markup).not.toMatch(/\blista\b|@/i);
  });
});
