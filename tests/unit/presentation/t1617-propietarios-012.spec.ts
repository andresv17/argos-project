/**
 * T1617 (Feature 012, Bloque A, #22): cliente HTTP de co-propiedad de la SPA y panel «Propietarios» (REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004). Cliente con `fetch` simulado (cabecera CSRF,
 * rutas del OpenAPI de la 012, 404 sin distinguir terceros) y render estático del panel y de la bandeja; el recorrido en dos navegadores es la prueba manual T1618.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoOwnershipApiError, createCoOwnershipApi, ownershipProblemMessage } from '../../../src/presentation/web/co-ownership-api.ts';
import { OwnersPanel, OwnershipInbox } from '../../../src/presentation/web/components/CoOwners.tsx';

const PET = '44444444-4444-4444-8444-444444444401';
interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('T1617 cliente de co-propiedad', () => {
  it('[REQ-OWN12-002] invitar envía POST con el username y la cabecera CSRF; el 202 no devuelve nada que distinga la cuenta', async () => {
    const calls: Call[] = [];
    await createCoOwnershipApi(fakeFetch(202, { status: 'RECEIVED' }, calls)).invite(PET, 'bob');
    const headers = new Headers(calls[0]?.init.headers);
    expect([calls[0]?.url, calls[0]?.init.method, calls[0]?.init.body, headers.get('x-argos-request'), headers.get('content-type')]).toEqual([`/api/pets/${PET}/co-owners`, 'POST', '{"username":"bob"}', '1', 'application/json']);
  });

  it('[REQ-OWN12-004] solicitar, aprobar, rechazar y cancelar usan las rutas de owner-requests', async () => {
    const calls: Call[] = [];
    const api = createCoOwnershipApi(fakeFetch(200, { id: 'r1' }, calls));
    await api.createRequest(PET, { action: 'DELETE_PET' });
    await api.approve('r1');
    await api.reject('r1');
    await api.listRequests();
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([`POST /api/pets/${PET}/owner-requests`, 'POST /api/owner-requests/r1/approve', 'POST /api/owner-requests/r1/reject', 'GET /api/owner-requests']);
  });

  it('[INV-OWN12-004] un 404 y un 429 llegan con su código y su texto; un fallo de red es genérico', async () => {
    const notFound = await createCoOwnershipApi(fakeFetch(404, { code: 'ERR-PET-NOT-FOUND' })).getOwnership(PET).catch((e: unknown) => e);
    expect(notFound).toBeInstanceOf(CoOwnershipApiError);
    expect([(notFound as CoOwnershipApiError).code, (notFound as CoOwnershipApiError).status]).toEqual(['ERR-PET-NOT-FOUND', 404]);
    const network = await createCoOwnershipApi((async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch)
      .listInvitations()
      .catch((e: unknown) => e);
    expect((network as CoOwnershipApiError).code).toBe('ERR-INTERNAL-UNEXPECTED');
    expect(ownershipProblemMessage('ERR-RATE-LIMITED')).toContain('muchos intentos');
    expect(ownershipProblemMessage('ERR-OWN12-LAST-OWNER')).toContain('único propietario');
    expect(ownershipProblemMessage('ERR-ALGO-NUEVO')).toBe('No pudimos completar la acción. Inténtalo de nuevo.');
  });
});

describe('T1617 panel «Propietarios» y bandeja', () => {
  it('[REQ-OWN12-002] el panel nace en estado de carga con su título accesible; la bandeja vacía no pinta nada', () => {
    const panel = renderToStaticMarkup(h(OwnersPanel, { petId: PET, petName: 'Argos', currentUserId: 'u1' }));
    expect(panel).toContain('aria-labelledby="owners-title"');
    expect(panel).toContain('Propietarios de Argos');
    expect(panel).toContain('Cargando propietarios');
    // Solo queda la región live vacía y oculta (WCAG 4.1.3): sin sección ni encabezado visibles.
    expect(renderToStaticMarkup(h(OwnershipInbox, {}))).toBe('<div role="status" aria-live="polite" class="sr-only"></div>');
  });
});

/**
 * Accesibilidad (sati T1619, oracle): el repositorio no incluye testing-library ni DOM simulado, y no se añaden dependencias; el cableado del foco y de los estilos se verifica
 * sobre el render estático (regiones live) y sobre el código fuente del componente. El recorrido real con teclado queda en la prueba manual T1618.
 */
describe('T1617 accesibilidad del panel y de la bandeja (WCAG 2.4.3, 1.4.11, 4.1.3)', () => {
  const src = readFileSync(new URL('../../../src/presentation/web/components/CoOwners.tsx', import.meta.url), 'utf8');
  const occurrences = (needle: string): number => src.split(needle).length - 1;

  it('[REQ-OWN12-002] el panel monta las regiones role=alert y role=status desde el primer render', () => {
    const panel = renderToStaticMarkup(h(OwnersPanel, { petId: PET, petName: 'Argos', currentUserId: 'u1' }));
    expect(panel).toContain('<div role="alert"></div>');
    expect(panel).toContain('<div role="status" aria-live="polite"></div>');
  });

  it('[REQ-OWN12-002] input, tarjetas y bandeja usan border-border-strong; no queda border-border sin sufijo en el componente', () => {
    expect(src).toMatch(/id="owners-invite"[\s\S]*?border-border-strong/);
    expect(occurrences('rounded-xl border border-border-strong')).toBeGreaterThanOrEqual(4);
    expect(src).not.toMatch(/border-border(?!-strong)/);
  });

  it('[REQ-OWN12-002] el botón Enviar invitación y el input apuntan a owners-invite-help, que existe', () => {
    expect(src).toContain('aria-describedby="owners-invite-help"');
    expect(src).toContain('describedBy="owners-invite-help"');
    expect(src).toContain('id="owners-invite-help"');
  });

  it('[REQ-OWN12-004] el foco pasa al encabezado tras aceptar, rechazar o resolver solicitudes (run de la bandeja) y tras cancelar la invitación', () => {
    // La bandeja enfoca su encabezado en la rama de éxito de run(); aceptar, rechazar, aprobar, rechazar y cancelar solicitud pasan todos por run().
    expect(src).toMatch(/await refresh\(\);\s*\/\/[^\n]*\n\s*inboxHeadingRef\.current\?\.focus\(\)/);
    for (const label of ['Invitación aceptada.', 'Invitación rechazada.', 'Solicitud aprobada.', 'Solicitud rechazada.', 'Solicitud cancelada.']) expect(src).toContain(label);
    // Cancelar una invitación enviada pasa el encabezado del panel como destino.
    expect(src).toMatch(/cancelInvitation\(petId, row\.id\)[^\n]*headingRef\.current\?\.focus\(\)/);
  });

  it('[REQ-OWN12-006] al pulsar Salir el foco va al grupo de confirmación y al cancelarla vuelve al encabezado', () => {
    expect(src).toContain('(confirmLeave ? confirmRef.current : headingRef.current)?.focus()');
    expect(src).toMatch(/ref=\{confirmRef\} tabIndex=\{-1\} role="group" aria-label="Confirmar la salida"/);
  });

  it('[REQ-OWN12-004] la bandeja vacía tras una acción no desmonta el encabezado: el foco no cae a body', () => {
    expect(src).toContain('if (empty && !acted) return live;');
    expect(src).toMatch(/setActed\(true\)/);
    expect(src).toContain('No tienes invitaciones ni solicitudes pendientes.');
  });
});
