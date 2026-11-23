/**
 * T1122 (008, `[GH:#16]`) pruebas de presentación del acceso con Google: botón «Continuar con Google» en la pantalla de acceso, pantalla «Elige tu usuario» (`/elige-usuario`),
 * errores neutros (catálogo, sin código crudo), ruta de retorno y reglas de accesibilidad verificables en el marcado. Render estático; el recorrido en navegador real es el E2E T1123 y la
 * revisión visual (320/1024/1280 px) es de `/sati`. REQ-SSO8-003, REQ-SSO8-004, NFR-008-002, EDGE-008-006; SC-008-002.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG } from '../../../src/generated/errors/error-codes.ts';
import { ApiProblem, catalogProblem } from '../../../src/presentation/web/api.ts';
import {
  CHOOSE_USERNAME_ROUTE,
  GOOGLE_START_PATH,
  chooseUsernameFeedback,
  submitGoogleUsername,
} from '../../../src/presentation/web/google-login.ts';
import { ChooseUsernameView } from '../../../src/presentation/web/pages/ChooseUsernamePage.tsx';
import { LoginPage, RegisterPage } from '../../../src/presentation/web/pages/AuthPages.tsx';
import { SessionContext, type SessionState } from '../../../src/presentation/web/session.tsx';
import { routeRedirect } from '../../../src/presentation/web/view-model.ts';

const noop = async (): Promise<void> => undefined;
const state = { status: 'ANONYMOUS', user: null, idleExpiresAt: null, lastActivityAt: null, api: {} as never, setUser: () => undefined, dropSession: () => undefined, register: noop, login: noop, logout: noop, chooseGoogleUsername: noop } as SessionState;
const inSession = (page: () => JSX.Element): string => renderToStaticMarkup(h(MemoryRouter, null, h(SessionContext.Provider, { value: state }, h(page))));
const view = (props: { message?: string | null; restart?: boolean; errors?: Record<string, string>; busy?: boolean } = {}): string =>
  renderToStaticMarkup(
    h(MemoryRouter, null, h(ChooseUsernameView, { values: { username: '' }, errors: props.errors ?? {}, message: props.message ?? null, restart: props.restart ?? false, busy: props.busy ?? false, onChange: () => undefined, onSubmit: () => undefined })),
  );
const msg = (code: keyof typeof ERROR_CATALOG): string => ERROR_CATALOG[code].detailTemplate;

describe('pantalla de acceso con Google (T1122, SC-008-002)', () => {
  it('[REQ-SSO8-003][NFR-008-002] el inicio de sesión y el registro ofrecen «Continuar con Google» que navega a la operación startGoogleLogin, con área táctil de 48 px', () => {
    for (const page of [LoginPage, RegisterPage]) {
      const markup = inSession(page);
      const link = /<a [^>]*>Continuar con Google<\/a>/.exec(markup)?.[0] ?? '';
      expect(link, page.name).toContain(`href="${GOOGLE_START_PATH}"`);
      expect(link).toContain('min-h-12');
      expect(link).not.toMatch(/target=|rel="external"/);
    }
    expect(GOOGLE_START_PATH).toBe('/api/auth/google/start');
  });

  it('[REQ-SSO8-003] el formulario de contraseña sigue intacto junto al botón de Google', () => {
    const markup = inSession(LoginPage);
    expect(markup).toContain('id="login-username"');
    expect(markup).toContain('id="login-password"');
    expect(markup).toContain('Entrar');
  });
});

describe('pantalla «Elige tu usuario» (T1122, REQ-SSO8-003)', () => {
  it('[REQ-SSO8-003][NFR-008-002] ruta provisional /elige-usuario; encabezado enfocable, etiqueta asociada al campo, autocompletado de usuario y botón de 48 px', () => {
    expect(CHOOSE_USERNAME_ROUTE).toBe('/elige-usuario');
    const markup = view();
    expect(markup).toMatch(/<h2[^>]*id="choose-username-title"[^>]*tabindex="-1"[^>]*>Elige tu usuario<\/h2>|<h2[^>]*tabindex="-1"[^>]*id="choose-username-title"[^>]*>Elige tu usuario<\/h2>/);
    expect(markup).toMatch(/<label for="choose-username"[^>]*>[^<]*Usuario/);
    const input = /<input[^>]*id="choose-username"[^>]*>/.exec(markup)?.[0] ?? '';
    expect(input).toContain('name="username"');
    expect(input).toMatch(/autocomplete="username"/i);
    expect(input).toContain('required');
    expect(markup).toMatch(/<form[^>]*aria-labelledby="choose-username-title"/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*class="[^"]*min-h-12[^"]*"[^>]*>Continuar<\/button>/);
  });

  it('[REQ-SSO8-003] sin flujo activo la pantalla es la misma: no revela correo, sub ni estado del flujo y ofrece volver al acceso', () => {
    const markup = view();
    expect(markup).not.toMatch(/@|\bsub\b|Google ya|correo de Google|expir|caduc/i);
    expect(markup).toMatch(/<a [^>]*href="\/login"[^>]*>Volver al acceso<\/a>/);
  });

  it('[REQ-SSO8-003][NFR-008-002] un fallo del flujo se muestra con el mensaje neutro del catálogo, anunciado con role=alert, sin código ni estado HTTP', () => {
    const feedback = chooseUsernameFeedback(catalogProblem('ERR-AUTH-GOOGLE-FAILED'));
    expect(feedback).toEqual({ errors: {}, message: msg('ERR-AUTH-GOOGLE-FAILED'), restart: true });
    const markup = view({ message: feedback.message, restart: feedback.restart });
    expect(markup).toMatch(/<p role="alert"[^>]*>No se pudo completar el acceso con Google\. Vuelve a intentarlo desde la pantalla de acceso\.<\/p>/);
    expect(markup).not.toMatch(/ERR-|\b400\b|problem|urn:argos|INV-/i);
  });

  it('[REQ-SSO8-003] usuario ocupado o inválido: el mensaje va bajo el campo (aria-describedby, aria-invalid) y no se pide reiniciar; cualquier otro fallo es el error genérico del catálogo', () => {
    expect(chooseUsernameFeedback({ ...catalogProblem('ERR-AUTH-USERNAME-TAKEN'), field: 'username' })).toEqual({ errors: { username: msg('ERR-AUTH-USERNAME-TAKEN') }, message: null, restart: false });
    expect(chooseUsernameFeedback(catalogProblem('ERR-RATE-LIMITED'))).toMatchObject({ message: msg('ERR-RATE-LIMITED'), restart: false });
    expect(chooseUsernameFeedback(catalogProblem('ERR-INTERNAL-UNEXPECTED'))).toMatchObject({ message: msg('ERR-INTERNAL-UNEXPECTED'), restart: false });
    const markup = view({ errors: { username: msg('ERR-AUTH-USERNAME-TAKEN') } });
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="choose-username-error"');
    expect(markup).toContain('id="choose-username-error"');
  });

  it('[REQ-SSO8-003] mientras se envía, el botón queda deshabilitado', () => {
    expect(view({ busy: true })).toMatch(/<button[^>]*\sdisabled=""[^>]*>Continuar<\/button>/);
    expect(view()).not.toMatch(/<button[^>]*\sdisabled=/);
  });
});

describe('envío, ruta de retorno y almacenamiento (T1122)', () => {
  it('[REQ-SSO8-003][INV-AUTH-007] chooseGoogleUsername envía POST /auth/google/username con la cabecera anti-CSRF y solo el username', async () => {
    const calls: Array<{ path: string; init: { params?: unknown; body?: unknown } }> = [];
    const session = { user: { id: 'u1' }, idleExpiresAt: 'a', lastActivityAt: 'b' };
    const api = {
      POST: async (path: string, init: { params?: unknown; body?: unknown }) => {
        calls.push({ path, init });
        return { data: session, response: { ok: true } as Response };
      },
    } as never;
    await expect(submitGoogleUsername(api, { username: 'Ana.Google' })).resolves.toEqual(session);
    expect(calls).toEqual([{ path: '/auth/google/username', init: { params: { header: { 'X-Argos-Request': '1' } }, body: { username: 'Ana.Google' } } }]);
  });

  it('[REQ-SSO8-003][EDGE-008-006] un 400 del flujo se convierte en ApiProblem del catálogo (nunca el cuerpo crudo)', async () => {
    const api = { POST: async () => ({ error: { code: 'ERR-AUTH-GOOGLE-FAILED', detail: 'texto crudo del servidor' }, response: { ok: false } as Response }) } as never;
    const failure = await submitGoogleUsername(api, { username: 'ana' }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiProblem);
    expect(chooseUsernameFeedback((failure as ApiProblem).problem).message).toBe(msg('ERR-AUTH-GOOGLE-FAILED'));
  });

  it('[REQ-SSO8-004][EDGE-008-006] /elige-usuario es pública sin sesión y, con sesión, vuelve a / (la ruta de retorno del callback)', () => {
    expect(routeRedirect(false, CHOOSE_USERNAME_ROUTE)).toBeNull();
    expect(routeRedirect(true, CHOOSE_USERNAME_ROUTE)).toBe('/');
  });

  it('[REQ-SSO8-004][NFR-008-002] ni la pantalla ni el módulo usan localStorage, sessionStorage ni cookies desde el cliente', () => {
    for (const file of ['src/presentation/web/google-login.ts', 'src/presentation/web/pages/ChooseUsernamePage.tsx']) {
      expect(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), file).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    }
  });
});
