/**
 * T1131 (008, `[GH:#17]`) pruebas de presentación de «Vincular Google» en el perfil: formulario con la contraseña actual, estado «Google vinculado» derivado de `authMethods`
 * y mensajes neutros del catálogo sin error crudo. Render estático y lógica pura; el recorrido en navegador es el E2E T1132 y la revisión visual (320/1024/1280 px) es de `/sati`.
 * Respeta lo aprobado en T1122: controles de 48 px, tarjeta neutra sin decoración y foco al campo con error (H-T1122-S1).
 * REQ-VIN8-001, REQ-VIN8-002, NFR-008-002; SC-008-009, SC-008-010.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG } from '../../../src/generated/errors/error-codes.ts';
import { ApiProblem, catalogProblem } from '../../../src/presentation/web/api.ts';
import { GOOGLE_LINK_FIELD, googleLinkFeedback, startGoogleLink } from '../../../src/presentation/web/google-login.ts';
import { AccountPage, GoogleLinkView } from '../../../src/presentation/web/pages/AccountPage.tsx';
import { SessionContext, type SessionState, type UserSelfProfile } from '../../../src/presentation/web/session.tsx';

const noop = async (): Promise<void> => undefined;
const user = (authMethods: UserSelfProfile['authMethods']): UserSelfProfile =>
  ({ id: 'a0000000-0000-4000-8000-000000000001', username: 'ana', displayName: 'Ana', createdAt: '2026-11-01T00:00:00.000Z', email: 'ana@example.test', preferredLanguage: 'es', timezone: 'America/Bogota', ...(authMethods === undefined ? {} : { authMethods }) }) as UserSelfProfile;
const page = (profile: UserSelfProfile): string => {
  const state = { status: 'AUTHENTICATED', user: profile, idleExpiresAt: null, lastActivityAt: null, api: {} as never, setUser: () => undefined, dropSession: () => undefined, register: noop, login: noop, chooseGoogleUsername: noop, logout: noop } as SessionState;
  return renderToStaticMarkup(h(MemoryRouter, null, h(SessionContext.Provider, { value: state }, h(AccountPage))));
};
const view = (props: { errors?: Record<string, string>; message?: string | null; busy?: boolean } = {}): string =>
  renderToStaticMarkup(h(GoogleLinkView, { values: { currentPassword: '' }, errors: props.errors ?? {}, message: props.message ?? null, busy: props.busy ?? false, onChange: () => undefined, onSubmit: () => undefined }));
const section = (markup: string): string => /<section[^>]*data-google-link[^>]*>[\s\S]*?<\/section>/.exec(markup)?.[0] ?? '';
const msg = (code: keyof typeof ERROR_CATALOG): string => ERROR_CATALOG[code].detailTemplate;

describe('estado de la vinculación según authMethods (REQ-VIN8-002, SC-008-010)', () => {
  it('[REQ-VIN8-002][SC-008-010] con contraseña y sin Google: ofrece «Vincular Google» con la contraseña actual propia, sin estado vinculado', () => {
    const block = section(page(user({ password: true, google: false })));
    expect(block).toContain('Vincular Google');
    expect(block).toContain('id="google-link-currentPassword"');
    expect(block).toContain('Contraseña actual');
    expect(block).toContain('autoComplete="current-password"');
    expect(block).not.toContain('Google vinculado');
  });

  it('[REQ-VIN8-002] una respuesta sin authMethods se trata como cuenta con contraseña y sin Google', () => {
    expect(section(page(user(undefined)))).toContain('Vincular Google');
  });

  it('[REQ-VIN8-002][SC-008-010] con Google vinculado: muestra «Google vinculado» como estado y ya no pide contraseña ni ofrece vincular', () => {
    for (const methods of [{ password: true, google: true }, { password: false, google: true }]) {
      const block = section(page(user(methods)));
      expect(block, JSON.stringify(methods)).toContain('Google vinculado');
      expect(block).not.toMatch(/role="status"/);
      expect(block).toContain('aria-labelledby="google-linked-title"');
      expect(block).not.toContain('google-link-currentPassword');
      expect(block).not.toMatch(/<button[^>]*>[^<]*Vincular Google/);
    }
  });

  it('[REQ-VIN8-002] una cuenta sin contraseña y sin Google (no existe en 008) no recibe el flujo: exige contraseña actual', () => {
    expect(section(page(user({ password: false, google: false })))).toBe('');
  });
});

describe('formulario «Vincular Google» (NFR-008-002, T1122)', () => {
  it('[NFR-008-002] controles de 48 px, etiqueta asociada y botón secundario sin icono ni decoración', () => {
    const markup = view();
    expect(markup).toMatch(/<form[^>]*aria-label="Vincular Google"/);
    expect(markup).toMatch(/<label[^>]*for="google-link-currentPassword"/);
    expect(markup).toMatch(/<input[^>]*id="google-link-currentPassword"[^>]*min-h-12|<input[^>]*min-h-12[^>]*id="google-link-currentPassword"/);
    const button = /<button[^>]*type="submit"[^>]*>Vincular Google<\/button>/.exec(markup)?.[0] ?? '';
    expect(button).toContain('min-h-12');
    expect(button).toContain('border-primary');
    expect(markup).not.toMatch(/<svg|<img/);
  });

  it('[REQ-VIN8-002][NFR-008-002] el texto explica en lenguaje llano que se pide la contraseña actual y que las demás sesiones se cierran, sin jerga', () => {
    const text = view();
    expect(text).toContain('contraseña actual');
    expect(text).toContain('demás sesiones');
    expect(text).not.toMatch(/OAuth|OIDC|sub\b|token|hash|centinela|state|nonce/i);
  });

  it('[NFR-008-002][H-T1122-S1] el error de contraseña sale bajo el campo con aria-invalid y aria-describedby, sin banner', () => {
    const markup = view({ errors: { [GOOGLE_LINK_FIELD]: msg('ERR-AUTH-INVALID-CREDENTIALS') } });
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="google-link-currentPassword-error"');
    expect(markup).toContain(msg('ERR-AUTH-INVALID-CREDENTIALS'));
    expect(markup).not.toContain('role="alert"');
  });

  it('[REQ-VIN8-001] el mensaje global va en el banner role=alert y nunca expone código, tipo ni cuerpo crudo', () => {
    const markup = view({ message: msg('ERR-AUTH-GOOGLE-LINK-CONFLICT') });
    expect(markup).toMatch(/<p[^>]*role="alert"[^>]*>No se pudo vincular esa cuenta de Google a tu cuenta\.<\/p>/);
    expect(markup).not.toMatch(/ERR-|urn:argos|problem\+json|\{"/);
  });

  it('[NFR-008-002] ocupado: el botón queda deshabilitado', () => {
    expect(/<button[^>]*type="submit"[^>]*>Vincular Google<\/button>/.exec(view({ busy: true }))?.[0]).toContain('disabled');
  });
});

describe('lógica de la vinculación (REQ-VIN8-001, REQ-VIN8-002)', () => {
  it('[REQ-VIN8-002] startGoogleLink envía POST /auth/google/link con la cabecera anti-CSRF y solo la contraseña actual; devuelve la URL de autorización', async () => {
    const calls: Array<{ path: string; init: { params: unknown; body: unknown } }> = [];
    const api = {
      POST: async (path: string, init: { params: unknown; body: unknown }) => {
        calls.push({ path, init });
        return { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }, response: new Response(null, { status: 200 }) };
      },
    } as never;
    const view = await startGoogleLink(api, { currentPassword: 'Clave-actual-1!' });
    expect(view).toEqual({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/auth/google/link');
    expect(calls[0]?.init.body).toEqual({ currentPassword: 'Clave-actual-1!' });
    expect(JSON.stringify(calls[0]?.init.params)).toContain('X-Argos-Request');
  });

  it('[REQ-VIN8-002][SC-008-011] contraseña incorrecta: el error va bajo el campo (con foco) y sin mensaje global', () => {
    const feedback = googleLinkFeedback(catalogProblem('ERR-AUTH-INVALID-CREDENTIALS'));
    expect(feedback).toEqual({ errors: { [GOOGLE_LINK_FIELD]: 'La contraseña actual no es correcta.' }, message: null, focusField: true });
  });

  it('[H-T1131-S1] el texto de contraseña incorrecta es llano: sin la nota de desarrollador del catálogo, «pérdida de sesión», ERR- ni urn:argos', () => {
    const text = googleLinkFeedback(catalogProblem('ERR-AUTH-INVALID-CREDENTIALS')).errors[GOOGLE_LINK_FIELD] ?? '';
    expect(text).not.toContain(msg('ERR-AUTH-INVALID-CREDENTIALS'));
    expect(text).not.toContain('pérdida de sesión');
    expect(text).not.toContain('ERR-');
    expect(text).not.toContain('urn:argos');
  });

  it('[REQ-VIN8-001] conflicto, demasiados intentos, límite y fallo inesperado: mensaje neutro del catálogo, sin campo ni foco, aunque el servidor envíe texto propio', () => {
    for (const code of ['ERR-AUTH-GOOGLE-LINK-CONFLICT', 'ERR-AUTH-TOO-MANY-ATTEMPTS', 'ERR-RATE-LIMITED', 'ERR-AUTH-UNAUTHENTICATED', 'ERR-INTERNAL-UNEXPECTED'] as const) {
      const raw = { ...catalogProblem(code), detail: 'JSON crudo {"sub":"123"} correo@x.test' };
      const feedback = googleLinkFeedback(raw);
      expect(feedback, code).toEqual({ errors: {}, message: msg(code), focusField: false });
    }
    expect(googleLinkFeedback(new ApiProblem(catalogProblem('ERR-INTERNAL-UNEXPECTED')).problem).message).toBe(msg('ERR-INTERNAL-UNEXPECTED'));
  });
});
