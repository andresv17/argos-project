/**
 * T1249 (009, `[GH:#18]`) pantallas de estado de la solicitud en la SPA: «Tu solicitud está en revisión» (`PENDING`) y «Tu solicitud no fue aprobada.» (`REJECTED`),
 * textos aprobados D9-18; sin sesión ni acceso a mascotas/hogares/escena; aviso de purga automática a los 30 días, sin autoservicio.
 * La revisión visual (320/1024/1280 px, WCAG 2.1 AA) es de `/sati`.
 *
 * @implements REQ-APR9-001, REQ-APR9-002, NFR-009-001, EDGE-009-005, EDGE-009-006; SC-009-001, SC-009-002
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_STATUS_ROUTE, accountStatusOf, authOutcome } from '../../../src/presentation/web/account-status.ts';
import { AccountStatusPage } from '../../../src/presentation/web/pages/AccountStatusPage.tsx';
import { routeRedirect } from '../../../src/presentation/web/view-model.ts';

const screen = (status: 'PENDING' | 'REJECTED'): string => renderToStaticMarkup(h(MemoryRouter, null, h(AccountStatusPage, { status })));

describe('rutas y estado (T1249)', () => {
  it('[REQ-APR9-002] las rutas coinciden con las que el callback de Google ya usa y son públicas (sin sesión), con sesión vuelven a /', () => {
    expect(ACCOUNT_STATUS_ROUTE).toEqual({ PENDING: '/solicitud-en-revision', REJECTED: '/solicitud-no-aprobada' });
    for (const path of Object.values(ACCOUNT_STATUS_ROUTE)) {
      expect(routeRedirect(false, path)).toBeNull();
      expect(routeRedirect(true, path)).toBe('/');
    }
  });

  it('[REQ-APR9-002][EDGE-009-005] accountStatusOf reconoce solo { accountStatus: PENDING|REJECTED }; una SessionView o cualquier otra cosa es null', () => {
    expect(accountStatusOf({ accountStatus: 'PENDING' })).toBe('PENDING');
    expect(accountStatusOf({ accountStatus: 'REJECTED' })).toBe('REJECTED');
    expect(accountStatusOf({ accountStatus: 'ACTIVE' })).toBeNull();
    expect(accountStatusOf({ user: {}, idleExpiresAt: 'x', lastActivityAt: 'y' })).toBeNull();
    expect(accountStatusOf(null)).toBeNull();
    expect(accountStatusOf('PENDING')).toBeNull();
  });

  it('[SC-009-001] authOutcome: el estado nunca produce sesión; la SessionView sí', () => {
    expect(authOutcome({ accountStatus: 'PENDING' })).toEqual({ kind: 'ACCOUNT_STATUS', accountStatus: 'PENDING' });
    const session = { user: { id: 'u' }, idleExpiresAt: 'a', lastActivityAt: 'b' };
    expect(authOutcome(session)).toEqual({ kind: 'SESSION', session });
  });
});

describe('pantallas de estado (T1249, D9-18)', () => {
  it('[SC-009-002] PENDING muestra exactamente «Tu solicitud está en revisión» como encabezado enfocable', () => {
    const m = screen('PENDING');
    expect(m).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Tu solicitud está en revisión<\/h2>/);
    expect(m).not.toContain('no fue aprobada');
  });

  it('[REQ-APR9-002] REJECTED muestra exactamente «Tu solicitud no fue aprobada.»', () => {
    const m = screen('REJECTED');
    expect(m).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Tu solicitud no fue aprobada\.<\/h2>/);
    expect(m).not.toContain('está en revisión');
  });

  it('[REQ-APR9-002] ambas pantallas avisan de la purga a los 30 días, sin formulario ni botón de borrado ni enlace que borre', () => {
    for (const status of ['PENDING', 'REJECTED'] as const) {
      const m = screen(status);
      expect(m).toContain('30 días');
      expect(m).not.toMatch(/<form|<button|<input|<textarea/);
      expect(m).not.toMatch(/Eliminar|Borrar|Suprimir ahora/);
      // T1413 (010) añadió el pie legal al marco de acceso (/privacidad, /terminos) y T1431 (010) el enlace público /acerca-de: son los únicos enlaces nuevos (ninguno borra nada).
      expect([...m.matchAll(/<a [^>]*href="([^"]*)"/g)].map((x) => x[1])).toEqual(['/login', '/privacidad', '/terminos', '/acerca-de']);
    }
  });

  it('[NFR-009-001][SC-009-010] sin acceso a la app ni mención nueva del portal: ningún enlace a /, /cuenta, /households ni /admin; sin «Administrador»', () => {
    for (const status of ['PENDING', 'REJECTED'] as const) {
      const m = screen(status);
      expect(m).not.toMatch(/href="\/(?:households|cuenta|backup|mascotas|admin)/);
      expect(m).not.toMatch(/Administrador|administraci[oó]n|\/admin/i);
    }
  });

  it('[NFR-009-001] sin marco de aplicación (AppShell) ni consulta de mascotas, hogares o escena', () => {
    const page = readFileSync('src/presentation/web/pages/AccountStatusPage.tsx', 'utf8');
    expect(page).not.toMatch(/AppShell|useSession|\/pets|\/households|scene/);
  });
});

describe('integración con la sesión (T1249)', () => {
  const session = readFileSync('src/presentation/web/session.tsx', 'utf8');
  const auth = readFileSync('src/presentation/web/pages/AuthPages.tsx', 'utf8');
  const choose = readFileSync('src/presentation/web/pages/ChooseUsernamePage.tsx', 'utf8');
  const app = readFileSync('src/presentation/web/App.tsx', 'utf8');

  it('[SC-009-001] register, login y chooseGoogleUsername resuelven con authOutcome y solo SESSION marca AUTHENTICATED', () => {
    expect((session.match(/return settle\(/g) ?? []).length).toBe(3);
    expect(session).toContain('authOutcome<');
    expect(session).toMatch(/kind === 'ACCOUNT_STATUS'/);
  });

  it('[REQ-APR9-002] las tres pantallas navegan a la pantalla de estado y las rutas están montadas', () => {
    for (const text of [auth, choose]) expect(text).toContain('ACCOUNT_STATUS_ROUTE');
    expect(app).toContain('AccountStatusPage');
    expect(app).toContain('ACCOUNT_STATUS_ROUTE');
  });
});
