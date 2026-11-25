/**
 * T1528 (011, Bloque D, [GH:#63]): panel de administradores delegados en /admin. Render estático de `AdministratorsView` (patrón de t1512/t1506), reglas puras de
 * `administrators-view.ts` y cliente `administrators-api.ts` con `fetch` simulado. La interfaz oculta lo no autorizado; el servidor decide (REQ-ADM11-003).
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdministratorsView, type AdministratorsViewProps } from '../../../src/presentation/admin/AdministratorsPanel.tsx';
import { fetchDelegates, inviteDelegate, writeDelegate } from '../../../src/presentation/admin/administrators-api.ts';
import {
  ADMIN_ERROR_TEXT,
  GENERIC_FAILED,
  INVITE_ACCEPTED,
  ROW_LIMIT,
  canSeeAdministrators,
  canSeeParameters,
  errorMessage,
  isEmailMismatch,
  rowActionLabel,
  triggerSelector,
  rowActions,
  visibleRows,
  type DelegateView,
  type SelfView,
} from '../../../src/presentation/admin/administrators-view.ts';

const NOW = Date.parse('2026-11-25T12:00:00.000Z');
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ROOT: SelfView = { delegateId: id(900), role: 'SUPER_ADMIN', isRoot: true };
const DELEGATED: SelfView = { delegateId: id(901), role: 'SUPER_ADMIN', isRoot: false };
const row = (n: number, over: Partial<DelegateView> = {}): DelegateView => ({
  delegateId: id(n),
  email: `persona${n}@example.com`,
  role: 'SUPPORT',
  status: 'ACTIVE',
  isAnchored: true,
  invitedAt: null,
  invitedExpiresAt: null,
  anchoredAt: '2026-11-20T10:00:00.000Z',
  disabledAt: null,
  createdAt: '2026-11-19T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  etag: `"etag-${String(n).padStart(8, '0')}"`,
  ...over,
});
const noop = (): void => undefined;
const props = (self: SelfView, items: readonly DelegateView[], over: Partial<AdministratorsViewProps> = {}): AdministratorsViewProps => ({
  self,
  items,
  activeCount: 2,
  activeLimit: 20,
  nowMs: NOW,
  listState: 'ready',
  message: null,
  busy: false,
  confirming: null,
  form: { email: '', emailConfirmation: '', role: 'SUPPORT' },
  roleDraft: {},
  onForm: noop,
  onInvite: noop,
  onDraft: noop,
  onAction: noop,
  onConfirm: noop,
  onCancel: noop,
  onRetry: noop,
  ...over,
});
const render = (self: SelfView, items: readonly DelegateView[], over: Partial<AdministratorsViewProps> = {}): string => renderToStaticMarkup(h(AdministratorsView, props(self, items, over)));
const sources = (): string => ['AdministratorsPanel.tsx', 'administrators-api.ts', 'administrators-view.ts'].map((f) => readFileSync(`src/presentation/admin/${f}`, 'utf8')).join('\n');

const problem = (status: number, code: string): Response => new Response(JSON.stringify({ code, status }), { status, headers: { 'content-type': 'application/problem+json' } });
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const wireRow = (n: number): Record<string, unknown> => ({ ...row(n) });

afterEach(() => vi.unstubAllGlobals());

describe('T1528 alta con confirmación de correo (REQ-ADM11-001, H-1)', () => {
  it('[SC-011-022][REQ-ADM11-001] el formulario pide correo, repetir el correo y rol, con etiquetas asociadas', () => {
    const html = render(ROOT, []);
    for (const field of ['adm-email', 'adm-email-confirm', 'adm-role']) expect(html).toMatch(new RegExp(`<label for="${field}"`));
    expect(html).toContain('Repite el correo');
    expect(html).toMatch(/<button type="submit"[^>]*>Invitar</);
  });
  it('[SC-011-029][REQ-ADM11-005] el cliente envía correo, confirmación y rol con X-Argos-Request y sin If-Match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(202, { accepted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const outcome = await inviteDelegate('a@example.com', 'a@example.com', 'OPERATOR');
    expect(outcome).toEqual({ kind: 'OK', value: true });
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect([path, init.method, init.headers['X-Argos-Request'], init.headers['If-Match']]).toEqual(['/api/admin/administrators', 'POST', '1', undefined]);
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@example.com', emailConfirmation: 'a@example.com', role: 'OPERATOR' });
  });
  it('[SC-011-029][REQ-ADM11-001] la confirmación distinta se rechaza con el mensaje del código del catálogo y sin eco del correo', () => {
    const text = errorMessage('ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH');
    expect(text).toBe('Los dos correos no coinciden. Escríbelos de nuevo.');
    const html = render(ROOT, [], { message: { kind: 'error', text }, form: { email: 'x@example.com', emailConfirmation: 'y@example.com', role: 'SUPPORT' } });
    expect(html).toMatch(/role="alert"[^>]*>Los dos correos no coinciden/);
    expect(html.match(/x@example\.com/g)).toHaveLength(1); // solo el valor del campo, jamás el mensaje
  });
});

describe('T1528 respuesta 202 uniforme (H-4, INV-ADM9-002)', () => {
  it('[SC-011-029][REQ-ADM11-005] alta nueva, duplicado, raíz o usuario existente: mismo resultado y mismo texto, sin revelar la existencia', async () => {
    const outcomes = [];
    for (const email of ['nuevo@example.com', 'duplicado@example.com', 'raiz@example.com']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(202, { accepted: true })));
      outcomes.push(await inviteDelegate(email, email, 'SUPPORT'));
    }
    expect(new Set(outcomes.map((o) => JSON.stringify(o))).size).toBe(1);
    expect(INVITE_ACCEPTED).not.toMatch(/ya existe|duplicad|ra[ií]z|usuario existente|@/i);
    expect(render(ROOT, [], { message: { kind: 'ok', text: INVITE_ACCEPTED } })).toContain(INVITE_ACCEPTED);
  });
});

describe('T1528 visibilidad por rol (REQ-ADM11-003, H-6)', () => {
  const rows = [row(1, { role: 'OPERATOR' }), row(2, { role: 'SUPER_ADMIN' }), row(3, { role: 'SUPPORT', status: 'INVITED', isAnchored: false, anchoredAt: null, invitedAt: '2026-11-24T10:00:00.000Z', invitedExpiresAt: '2026-11-27T10:00:00.000Z' })];
  it('[SC-011-031][REQ-ADM11-005] un SUPER_ADMIN delegado no ve a otro SUPER_ADMIN y no lo puede tocar', () => {
    expect(visibleRows(DELEGATED, rows).map((r) => r.delegateId)).toEqual([id(1), id(3)]);
    expect(rowActions(DELEGATED, rows[1] as DelegateView, NOW)).toEqual([]);
    const html = render(DELEGATED, rows);
    expect(html).not.toContain('persona2@example.com');
    expect(html).toContain('persona1@example.com');
    expect(html).not.toMatch(/<option value="SUPER_ADMIN"/);
  });
  it('[SC-011-025][REQ-ADM11-005] nadie se autoafecta: la fila propia no ofrece acciones', () => {
    expect(rowActions(DELEGATED, row(901, { role: 'SUPER_ADMIN' }), NOW)).toEqual([]);
  });
  it('[SC-011-031][REQ-ADM11-005] la raíz ve las filas SUPER_ADMIN, las gestiona y puede asignar SUPER_ADMIN', () => {
    expect(visibleRows(ROOT, rows)).toHaveLength(3);
    expect(rowActions(ROOT, rows[1] as DelegateView, NOW)).toEqual(['SAVE_ROLE', 'DISABLE']);
    const html = render(ROOT, rows);
    expect(html).toContain('persona2@example.com');
    expect(html).toMatch(/<option value="SUPER_ADMIN"/);
    expect(html).toContain('administrador raíz');
  });
  it('[SC-011-021][REQ-ADM11-003] OPERATOR y SUPPORT no ven el panel de delegados; SUPPORT tampoco parámetros ni Acerca de', () => {
    for (const role of ['OPERATOR', 'SUPPORT'] as const) {
      const self: SelfView = { delegateId: id(800), role, isRoot: false };
      expect(canSeeAdministrators(self)).toBe(false);
      expect(render(self, rows)).toBe('');
    }
    expect(canSeeAdministrators(null)).toBe(false);
    expect(canSeeParameters({ delegateId: id(800), role: 'SUPPORT', isRoot: false })).toBe(false);
    expect(canSeeParameters({ delegateId: id(800), role: 'OPERATOR', isRoot: false })).toBe(true);
  });
  it('[SC-011-022][REQ-ADM11-001] acciones por estado: invitado vigente, caducado, activo y desactivado', () => {
    const invited = { status: 'INVITED' as const, isAnchored: false, anchoredAt: null, invitedAt: '2026-11-24T10:00:00.000Z' };
    expect(rowActions(ROOT, row(5, { ...invited, invitedExpiresAt: '2026-11-27T10:00:00.000Z' }), NOW)).toEqual(['SAVE_ROLE', 'CANCEL_INVITATION']);
    expect(rowActions(ROOT, row(5, { ...invited, invitedExpiresAt: '2026-11-25T11:00:00.000Z' }), NOW)).toEqual(['SAVE_ROLE', 'REINVITE', 'CANCEL_INVITATION']);
    expect(rowActions(ROOT, row(6), NOW)).toEqual(['SAVE_ROLE', 'DISABLE']);
    expect(rowActions(ROOT, row(7, { status: 'DISABLED', disabledAt: '2026-11-21T10:00:00.000Z' }), NOW)).toEqual(['REACTIVATE']);
    expect(rowActions(ROOT, row(8, { status: 'DISABLED', isAnchored: false, anchoredAt: null, disabledAt: '2026-11-21T10:00:00.000Z' }), NOW)).toEqual(['REINVITE']);
    expect(render(ROOT, [row(5, { ...invited, invitedExpiresAt: '2026-11-25T11:00:00.000Z' })])).toContain('Invitación caducada');
  });
  it('[SC-011-022][REQ-ADM11-001] el estado INVITED, ACTIVE o DISABLED es visible en cada fila', () => {
    const html = render(ROOT, [row(1), row(2, { status: 'DISABLED', disabledAt: '2026-11-21T10:00:00.000Z' }), row(3, { status: 'INVITED', isAnchored: false, anchoredAt: null, invitedAt: '2026-11-24T10:00:00.000Z', invitedExpiresAt: '2026-11-27T10:00:00.000Z' })]);
    expect([...html.matchAll(/data-testid="row-status">([^<]+)</g)].map((m) => m[1])).toEqual(['Activo', 'Desactivado', 'Invitado']);
  });
});

describe('T1528 If-Match y 412 (REQ-ADM11-005, SC-011-026)', () => {
  it('[SC-011-024][REQ-ADM11-004] cada escritura sobre una fila envía If-Match con el etag de la fila, X-Argos-Request y la ruta del contrato', async () => {
    const target = row(4);
    const calls: Array<[string, string, string | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((path: string, init: RequestInit & { headers: Record<string, string> }) => {
        calls.push([path, init.method as string, init.headers['If-Match']]);
        expect(init.headers['X-Argos-Request']).toBe('1');
        return Promise.resolve(json(200, wireRow(4)));
      }),
    );
    for (const action of ['SAVE_ROLE', 'DISABLE', 'CANCEL_INVITATION', 'REACTIVATE', 'REINVITE'] as const) await writeDelegate(target, action, 'OPERATOR');
    expect(calls).toEqual([
      [`/api/admin/administrators/${id(4)}/role`, 'PUT', target.etag],
      [`/api/admin/administrators/${id(4)}/disable`, 'POST', target.etag],
      [`/api/admin/administrators/${id(4)}/disable`, 'POST', target.etag],
      [`/api/admin/administrators/${id(4)}/reactivate`, 'POST', target.etag],
      [`/api/admin/administrators/${id(4)}/reinvite`, 'POST', target.etag],
    ]);
  });
  it('[SC-011-026][REQ-ADM11-005] un 412 se reporta con su código y el mensaje de recarga; el panel refresca la lista en ese caso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(412, 'ERR-ADM11-PRECONDITION-FAILED')));
    const outcome = await writeDelegate(row(4), 'DISABLE', 'SUPPORT');
    expect(outcome).toEqual({ kind: 'ERROR', status: 412, code: 'ERR-ADM11-PRECONDITION-FAILED' });
    expect(errorMessage('ERR-ADM11-PRECONDITION-FAILED')).toContain('Vuelve a cargar la lista');
    const panel = readFileSync('src/presentation/admin/AdministratorsPanel.tsx', 'utf8');
    expect(panel).toMatch(/status === 412[^\n]*\n?[^\n]*await load\(true\)/);
  });
  it('[SC-011-024][REQ-ADM11-004] el 404 uniforme (text/plain) es sesión perdida; el 404 problem+json es delegado inexistente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })));
    expect(await fetchDelegates()).toEqual({ kind: 'SESSION_LOST' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem(404, 'ERR-ADM11-DELEGATE-NOT-FOUND')));
    expect(await writeDelegate(row(4), 'DISABLE', 'SUPPORT')).toEqual({ kind: 'ERROR', status: 404, code: 'ERR-ADM11-DELEGATE-NOT-FOUND' });
  });
});

describe('T1528 sin borrado y sin correo en errores (H-9)', () => {
  it('[SC-011-034][REQ-ADM11-007] no hay botón ni ruta de borrado: solo desactivar', () => {
    const html = render(ROOT, [row(1), row(2, { status: 'DISABLED', disabledAt: '2026-11-21T10:00:00.000Z' }), row(3, { status: 'INVITED', isAnchored: false, anchoredAt: null, invitedAt: '2026-11-24T10:00:00.000Z', invitedExpiresAt: '2026-11-27T10:00:00.000Z' })]);
    expect(html).not.toMatch(/Eliminar|Borrar|Quitar|Suprimir/i);
    expect(html).toContain('Desactivar');
    expect(sources()).not.toMatch(/method: 'DELETE'|Eliminar|Borrar/);
  });
  it('[SC-011-034][REQ-ADM11-007] los mensajes salen de los códigos ERR-ADM11-* del catálogo 1.1.0 y un código desconocido da el genérico', () => {
    const catalog = JSON.parse(readFileSync('specs/011-pulido-portal-hogares-admin/contracts/errors/error-catalog.json', 'utf8')) as { errors: Record<string, { detailTemplate: string }> };
    const codes = Object.keys(catalog.errors).filter((c) => c.startsWith('ERR-ADM11-'));
    expect(Object.keys(ADMIN_ERROR_TEXT).sort()).toEqual(codes.sort());
    for (const code of codes) expect(errorMessage(code)).toBe(catalog.errors[code]?.detailTemplate);
    expect(errorMessage('ERR-OTRO-CODIGO')).toBe(GENERIC_FAILED);
    expect(errorMessage(null)).toBe(GENERIC_FAILED);
  });
  it('[SC-011-034][REQ-ADM11-007] el cliente descarta el texto libre del servidor: solo conserva un código con forma ERR-*', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'ERR-ADM11-GRANT-FORBIDDEN', detail: 'persona@example.com no puede' }), { status: 403, headers: { 'content-type': 'application/problem+json' } })));
    const outcome = await writeDelegate(row(4), 'SAVE_ROLE', 'OPERATOR');
    expect(JSON.stringify(outcome)).not.toContain('persona@example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'x@example.com' }), { status: 403, headers: { 'content-type': 'application/problem+json' } })));
    expect(await writeDelegate(row(4), 'SAVE_ROLE', 'OPERATOR')).toEqual({ kind: 'ERROR', status: 403, code: null });
  });
});

describe('T1528 límite de filas y accesibilidad (NFR-011-001)', () => {
  it('[SC-011-028][REQ-ADM11-005] con ROW_LIMIT filas aparece el aviso de límite; con menos, no', () => {
    expect(ROW_LIMIT).toBe(100);
    const many = Array.from({ length: ROW_LIMIT }, (_, i) => row(i + 1));
    expect(render(ROOT, many)).toContain('data-testid="row-limit"');
    expect(render(ROOT, many.slice(0, 5))).not.toContain('data-testid="row-limit"');
  });
  it('[NFR-011-001][REQ-ADM11-002] WCAG: encabezados ordenados h2→h3, controles de 48 px, foco visible y etiquetas asociadas', () => {
    const html = render(ROOT, [row(1)]);
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('<h3'));
    expect(html).not.toContain('<h1');
    expect(html).toMatch(/<h2 id="administrators-heading"[^>]*tabindex="-1"/);
    const buttons = [...html.matchAll(/<button\b[^>]*class="([^"]+)"/g)].map((m) => m[1] as string);
    expect(buttons.length).toBeGreaterThan(1);
    for (const cls of buttons) expect(cls).toMatch(/min-h-12/);
    for (const cls of buttons) expect(cls).toMatch(/focus-visible:ring-2/);
    expect(html).toMatch(/<label for="adm-role-00000000-0000-4000-8000-000000000001"/);
    expect(html).toMatch(/<ul[^>]*aria-label="Administradores delegados"/);
  });
  it('[NFR-011-001][REQ-ADM11-002] desactivar y cancelar piden confirmación en línea con foco al grupo y sin ventana modal', () => {
    const html = render(ROOT, [row(1)], { confirming: { id: id(1), action: 'DISABLE' } });
    expect(html).toMatch(/role="group"[^>]*tabindex="-1"/);
    expect(html).toContain('Confirmar desactivación');
    expect(html).not.toMatch(/role="dialog"|aria-modal/);
  });
  it('[REQ-ADM11-003][REQ-ADM11-002] el portal monta el panel en /admin y oculta parámetros y Acerca de a SUPPORT', () => {
    const portal = readFileSync('src/presentation/admin/AdminPortal.tsx', 'utf8');
    expect(portal).toContain('<AdministratorsPanel');
    expect(portal).toMatch(/canSeeParameters\(self\) \? <ParametersPanel/);
    expect(portal).toMatch(/canSeeParameters\(self\) \? <AboutPanel/);
  });
});

describe('T1528 correcciones WCAG de Sati (OBS-1..4)', () => {
  it('[OBS-1][WCAG 1.4.11] el borde de los campos del panel es slate-500 (>=3:1), no slate-400', () => {
    const html = render(ROOT, [row(1)]);
    const fields = [...html.matchAll(/<(?:input|select)\b[^>]*class="([^"]+)"/g)].map((m) => m[1] as string);
    expect(fields.length).toBeGreaterThanOrEqual(4);
    for (const cls of fields) {
      expect(cls).toContain('border-slate-500');
      expect(cls).not.toContain('border-slate-400');
    }
  });
  it('[OBS-2][WCAG 2.4.3] al cancelar la confirmación el foco vuelve al botón disparador de su fila', () => {
    const html = render(ROOT, [row(1)]);
    expect(html).toContain(`data-row-id="${id(1)}"`);
    expect(triggerSelector(id(1), 'DISABLE')).toBe(`button[data-action="DISABLE"][data-row-id="${id(1)}"]`);
    const src = readFileSync('src/presentation/admin/AdministratorsPanel.tsx', 'utf8');
    expect(src).toContain('triggerRef.current = { id: row.delegateId, action }');
    expect(src).toMatch(/querySelector<HTMLElement>\(triggerSelector\([^)]*\)\)\?\.focus\(\)/);
    expect(src).toMatch(/onCancel=\{\(\) => \{[^}]*setRestoreFocus/);
  });
  it('[OBS-3][WCAG 2.4.6/4.1.2] botones y select de rol por fila llevan aria-label con el correo de la fila', () => {
    const html = render(ROOT, [row(1), row(2)]);
    expect(html).toContain('aria-label="Desactivar: persona1@example.com"');
    expect(html).toContain('aria-label="Desactivar: persona2@example.com"');
    expect(html).toContain('aria-label="Rol de persona1@example.com"');
    expect(rowActionLabel('DISABLE', row(3))).toBe('Desactivar: persona3@example.com');
    const confirming = render(ROOT, [row(1)], { confirming: { id: id(1), action: 'DISABLE' } });
    expect(confirming).toContain('aria-label="Cancelar: persona1@example.com"');
  });
  it('[OBS-4][WCAG 3.3.1] correos distintos marcan la repetición con aria-invalid y la asocian al alert', () => {
    const text = errorMessage('ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH');
    const form = { email: 'a@example.com', emailConfirmation: 'b@example.com', role: 'SUPPORT' as const };
    const html = render(ROOT, [], { form, message: { kind: 'error', text } });
    expect(html).toMatch(/<input id="adm-email-confirm"[^>]*aria-invalid="true"[^>]*aria-describedby="admin-error"/);
    expect(html).toMatch(/<div id="admin-error" role="alert"/);
    const clean = render(ROOT, [], { form: { ...form, emailConfirmation: 'a@example.com' } });
    expect(clean).not.toContain('aria-invalid');
    expect(isEmailMismatch(form, null)).toBe(false);
  });
});
