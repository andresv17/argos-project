/**
 * Aviso de perfil para cuentas nacidas con Google (Feature 008, [GH:#16]; decisión 1 de Neo, DEUDA-008-GOOGLE-ACCOUNT-DELETE; REQ-ACC-002).
 * T1220 (009, REQ-DEL9-002, SC-009-046): el aviso de soporte se retiró; los casos 1 y 3 verifican su sustitución por la eliminación con Google.
 * Una cuenta sin contraseña (`authMethods.password === false`) no puede pedir una contraseña que no existe: la pantalla Perfil explica en lenguaje llano que la cuenta se creó con
 * Google y que el borrado de cuenta se gestiona por soporte, y no ofrece el cambio de contraseña ni la eliminación con contraseña. Render estático.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AccountPage } from '../../../src/presentation/web/pages/AccountPage.tsx';
import { SessionContext, type SessionState, type UserSelfProfile } from '../../../src/presentation/web/session.tsx';

const noop = async (): Promise<void> => undefined;
const noopAuth = async (): Promise<null> => null;
const user = (authMethods: UserSelfProfile['authMethods']): UserSelfProfile =>
  ({
    id: 'a0000000-0000-4000-8000-000000000001',
    username: 'ana.google',
    displayName: 'Ana',
    createdAt: '2026-11-01T00:00:00.000Z',
    email: 'ana@example.test',
    preferredLanguage: 'es',
    timezone: 'America/Bogota',
    ...(authMethods === undefined ? {} : { authMethods }),
  }) as UserSelfProfile;
const render = (profile: UserSelfProfile): string => {
  const state = { status: 'AUTHENTICATED', user: profile, idleExpiresAt: null, lastActivityAt: null, api: {} as never, setUser: () => undefined, dropSession: () => undefined, register: noopAuth, login: noopAuth, chooseGoogleUsername: noopAuth, logout: noop } as SessionState;
  return renderToStaticMarkup(h(MemoryRouter, null, h(SessionContext.Provider, { value: state }, h(AccountPage))));
};

describe('aviso de perfil de cuentas sin contraseña (decisión 1 de Neo)', () => {
  it('[GH:#16][REQ-DEL9-002][SC-009-046] sin contraseña: el aviso temporal (soporte) lo sustituye la eliminación con Google (T1220); sigue sin pedir contraseña', () => {
    const markup = render(user({ password: false, google: true }));
    expect(markup).not.toContain('data-account-no-password');
    expect(markup).not.toContain('soporte');
    expect(markup).toContain('Tu cuenta se creó con Google');
    expect(markup).not.toContain('Contraseña actual');
    expect(markup).not.toContain('Cambiar contraseña');
    expect(markup).toContain('data-account-delete-google');
    expect(markup).toContain('Datos de perfil');
  });

  it('[GH:#16][REQ-ACC-002] con contraseña: no hay aviso y se conservan el cambio de contraseña y la eliminación con contraseña actual', () => {
    for (const methods of [{ password: true, google: false }, { password: true, google: true }, undefined]) {
      const markup = render(user(methods));
      expect(markup).not.toContain('data-account-no-password');
      expect(markup).not.toContain('Tu cuenta se creó con Google');
      expect(markup).toContain('Cambiar contraseña');
      expect(markup).toContain('Contraseña actual');
      expect(markup).toContain('Eliminar mi cuenta');
    }
  });

  it('[GH:#16][REQ-DEL9-002] el texto de la zona de eliminación sigue siendo llano: sin jerga técnica ni promesas legales o plazos', () => {
    const markup = render(user({ password: false, google: true }));
    const zone = /<[^>]*data-account-delete-google[^>]*>([\s\S]*?)<\/section>/.exec(markup)?.[1] ?? '';
    expect(zone.length).toBeGreaterThan(40);
    expect(zone.replace(/<[^>]*>/g, ' ')).not.toMatch(/centinela|hash|OAuth|OIDC|token|Ley|1581|plazo|días|horas|garant/i);
  });
});
