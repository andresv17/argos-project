/**
 * T1220 (009, deuda #17, `[GH:#17]`) UI del perfil: la cuenta sin contraseña elimina su cuenta con la prueba de titularidad (reautenticación con Google, D9-17 = A) y el aviso temporal
 * de T1122 desaparece. El 409 `ERR-ACCOUNT-DELETE-HOUSEHOLDS-ACTIVE` lista los hogares bloqueantes (D9-24 = A). Render estático y lógica pura con `fetch` simulado; el recorrido en
 * navegador es el E2E T1221 y la revisión visual (320/1024/1280 px) es de `/sati`.
 * REQ-DEL9-001, REQ-DEL9-002, INV-DEL9-001; EDGE-009-031, EDGE-009-032, EDGE-009-049; SC-009-046.
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createRawTransport } from '../../../src/presentation/web/api.ts';
import { onActivity } from '../../../src/presentation/web/activity.ts';
import {
  DELETION_REAUTH_REQUIRED_CODE,
  DeletionApiError,
  HOUSEHOLDS_ACTIVE_CODE,
  createAccountDeletionApi,
  deletionFeedback,
} from '../../../src/presentation/web/account-deletion-google.ts';
import { AccountPage, DeleteGoogleView, type DeleteGoogleViewProps } from '../../../src/presentation/web/pages/AccountPage.tsx';
import { SessionContext, type SessionState, type UserSelfProfile } from '../../../src/presentation/web/session.tsx';

const catalog = JSON.parse(readFileSync('specs/009-aprobacion-admin-correo/contracts/errors/error-catalog.json', 'utf8')) as { errors?: Record<string, { detailTemplate: string }> } & Record<string, unknown>;
const entries = (catalog.errors ?? catalog) as Record<string, { detailTemplate: string }>;
const contractText = (code: string): string => entries[code]!.detailTemplate;

const noop = async (): Promise<void> => undefined;
const user = (authMethods: UserSelfProfile['authMethods']): UserSelfProfile =>
  ({ id: 'a0000000-0000-4000-8000-000000000001', username: 'ana.google', displayName: 'Ana', createdAt: '2026-11-01T00:00:00.000Z', email: 'ana@example.test', preferredLanguage: 'es', timezone: 'America/Bogota', ...(authMethods === undefined ? {} : { authMethods }) }) as UserSelfProfile;
const page = (profile: UserSelfProfile): string => {
  const state = { status: 'AUTHENTICATED', user: profile, idleExpiresAt: null, lastActivityAt: null, api: {} as never, setUser: () => undefined, dropSession: () => undefined, register: noop, login: noop, chooseGoogleUsername: noop, logout: noop } as SessionState;
  return renderToStaticMarkup(h(MemoryRouter, null, h(SessionContext.Provider, { value: state }, h(AccountPage))));
};
const SECTION = /<section[^>]*data-account-delete-google[^>]*>[\s\S]*?<\/section>/;
const block = (markup: string): string => SECTION.exec(markup)?.[0] ?? '';

const baseProps: DeleteGoogleViewProps = {
  phrase: '',
  errors: {},
  message: null,
  households: [],
  backupReady: false,
  backupError: null,
  reauthMessage: null,
  busy: false,
  reauthBusy: false,
  onChange: () => undefined,
  onReauth: () => undefined,
  onDownload: () => undefined,
  onSubmit: () => undefined,
};
const view = (props: Partial<DeleteGoogleViewProps> = {}): string => renderToStaticMarkup(h(DeleteGoogleView, { ...baseProps, ...props }));

describe('perfil de una cuenta sin contraseña (REQ-DEL9-002, SC-009-046)', () => {
  it('[REQ-DEL9-002][SC-009-046] el aviso temporal de T1122 ya no aparece: ni la nota, ni la remisión a soporte', () => {
    const markup = page(user({ password: false, google: true }));
    expect(markup).not.toContain('data-account-no-password');
    expect(markup).not.toContain('soporte');
    expect(markup).not.toContain('no se hace desde esta pantalla');
    expect(markup).not.toMatch(/role="note"/);
  });

  it('[REQ-DEL9-001][REQ-DEL9-002] ofrece la eliminación con Google: sin contraseña, sin cambio de contraseña y con la frase literal', () => {
    const markup = page(user({ password: false, google: true }));
    const zone = block(markup);
    expect(zone).not.toBe('');
    expect(zone).toContain('Eliminar mi cuenta');
    expect(zone).toContain('Confirmar con Google');
    expect(zone).toContain('Escribe ELIMINAR MI CUENTA');
    expect(markup).not.toContain('Contraseña actual');
    expect(markup).not.toContain('Cambiar contraseña');
    expect(zone).not.toContain('type="password"');
    expect(zone).toContain('Tu cuenta se creó con Google');
  });

  it('[EDGE-009-032] con contraseña (con o sin Google) la zona de peligro por contraseña no cambia y no aparece la vía Google', () => {
    for (const methods of [{ password: true, google: false }, { password: true, google: true }, undefined]) {
      const markup = page(user(methods));
      expect(markup).not.toContain('data-account-delete-google');
      expect(markup).toContain('Zona de peligro: eliminar la cuenta');
      expect(markup).toContain('Contraseña actual');
      expect(markup).toContain('Eliminar mi cuenta');
    }
  });
});

describe('vista de la eliminación con Google (accesibilidad)', () => {
  it('[REQ-DEL9-001][INV-DEL9-001] tres pasos: confirmar con Google, descargar el respaldo y escribir la frase; el envío exige el respaldo', () => {
    const markup = view();
    expect(markup).toContain('aria-labelledby="delete-google-title"');
    expect(markup).toContain('Paso 1');
    expect(markup).toContain('Paso 2');
    expect(markup).toContain('Paso 3');
    expect(markup).toContain('Confirmar con Google');
    expect(markup).toContain('Descargar respaldo');
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[^<]*Eliminar mi cuenta/);
    expect(view({ backupReady: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Eliminar mi cuenta/);
  });

  it('[REQ-DEL9-001] controles de 48 px (min-h-12) y campo de la frase con etiqueta asociada', () => {
    const markup = view();
    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) expect(b, b).toContain('min-h-12');
    expect(markup).toContain('for="delete-google-confirmationPhrase"');
    expect(markup).toContain('id="delete-google-confirmationPhrase"');
  });

  it('[REQ-DEL9-001] la ayuda de cada acción se asocia con aria-describedby a un texto existente', () => {
    const markup = view();
    const refs = [...markup.matchAll(/aria-describedby="([^"]+)"/g)].flatMap((m) => m[1]!.split(' '));
    expect(refs.length).toBeGreaterThan(0);
    for (const id of refs) expect(markup, id).toContain(`id="${id}"`);
  });

  it('[REQ-DEL9-001] el error de la frase se asocia al campo (aria-invalid + aria-describedby)', () => {
    const markup = view({ errors: { confirmationPhrase: 'Escribe la frase exacta.' } });
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toMatch(/id="delete-google-confirmationPhrase"[^>]*aria-describedby="delete-google-confirmationPhrase-error"|aria-describedby="delete-google-confirmationPhrase-error"[^>]*id="delete-google-confirmationPhrase"/);
    expect(markup).toContain('id="delete-google-confirmationPhrase-error"');
  });

  it('[EDGE-009-031] el mensaje de reautenticación se anuncia con role="alert" y el botón de Google queda a mano', () => {
    const markup = view({ reauthMessage: contractText(DELETION_REAUTH_REQUIRED_CODE) });
    expect(markup).toMatch(/<p[^>]*role="alert"[^>]*>[^<]*volver a confirmar tu identidad con Google/);
    expect(markup).toContain('Confirmar con Google');
  });

  it('[EDGE-009-049][D9-24] el 409 lista cada hogar bloqueante con miembros y mascotas compartidas, en una lista semántica y sin perder el formulario', () => {
    const markup = view({
      message: contractText(HOUSEHOLDS_ACTIVE_CODE),
      backupReady: true,
      households: [
        { householdId: 'b0000000-0000-4000-8000-000000000001', name: 'Casa Norte', activeMembers: 2, sharedPets: 3 },
        { householdId: 'b0000000-0000-4000-8000-000000000002', name: 'Finca', activeMembers: 1, sharedPets: 0 },
      ],
    });
    expect(markup).toContain('data-delete-households');
    expect(markup).toMatch(/<ul[^>]*>[\s\S]*Casa Norte[\s\S]*Finca[\s\S]*<\/ul>/);
    expect((markup.match(/<li\b/g) ?? []).length).toBe(2);
    expect(markup).toContain('2 miembros activos');
    expect(markup).toContain('1 miembro activo');
    expect(markup).toContain('3 mascotas compartidas');
    expect(markup).toContain('0 mascotas compartidas');
    expect(markup).not.toContain('b0000000-0000-4000-8000-000000000001');
    expect(markup).toContain('id="delete-google-confirmationPhrase"');
    expect(markup).toContain(contractText(HOUSEHOLDS_ACTIVE_CODE));
  });

  it('[REQ-DEL9-001] sin hogares bloqueantes no se pinta la lista', () => {
    expect(view()).not.toContain('data-delete-households');
  });
});

describe('cliente de la eliminación con Google (contrato admin.openapi.yaml)', () => {
  const problem = (status: number, body: Record<string, unknown>): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } });

  it('[REQ-DEL9-001] el inicio es POST sin cuerpo con X-Argos-Request y devuelve solo la URL de Google', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createAccountDeletionApi(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=x' }), { status: 200 });
    });
    await expect(api.startReauth()).resolves.toBe('https://accounts.google.com/o/oauth2/v2/auth?state=x');
    expect(calls[0]!.url).toBe('/api/account/deletion/reauth');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>)['X-Argos-Request']).toBe('1');
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it('[INV-DEL9-001] una URL que no sea de Google se rechaza antes de navegar', async () => {
    const api = createAccountDeletionApi(async () => new Response(JSON.stringify({ authorizationUrl: 'https://evil.example/x' }), { status: 200 }));
    await expect(api.startReauth()).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
  });

  it('[REQ-DEL9-001] el borrado envía solo la frase y el token de respaldo, sin contraseña ni prueba', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createAccountDeletionApi(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    });
    await api.deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA', backupConfirmationToken: 'T'.repeat(43) });
    expect(calls[0]!.url).toBe('/api/account/deletion/google');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ confirmationPhrase: 'ELIMINAR MI CUENTA', backupConfirmationToken: 'T'.repeat(43) });
    expect(String(calls[0]!.init.body)).not.toMatch(/password|sub|proof/i);
  });

  it('[EDGE-009-049] el 409 conserva la lista de hogares del contrato y descarta campos desconocidos', async () => {
    const api = createAccountDeletionApi(async () =>
      problem(409, {
        code: HOUSEHOLDS_ACTIVE_CODE,
        households: [{ householdId: 'b0000000-0000-4000-8000-000000000001', name: 'Casa Norte', activeMembers: 2, sharedPets: 3, extra: 'x' }, { nombre: 'mal' }],
      }),
    );
    const error = await api.deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeletionApiError);
    expect((error as DeletionApiError).status).toBe(409);
    expect((error as DeletionApiError).households).toEqual([{ householdId: 'b0000000-0000-4000-8000-000000000001', name: 'Casa Norte', activeMembers: 2, sharedPets: 3 }]);
  });

  it('[EDGE-009-031] un fallo de red o un cuerpo ilegible se informa como inesperado, sin eco del servidor', async () => {
    const down = createAccountDeletionApi(async () => {
      throw new Error('boom');
    });
    await expect(down.deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA' })).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED', status: 0 });
    const junk = createAccountDeletionApi(async () => new Response('<html>', { status: 500 }));
    await expect(junk.deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA' })).rejects.toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED', status: 500 });
  });
});

describe('actividad de sesión del cliente de eliminación (ORA-T1223-01, INV-AUTH2-002)', () => {
  const watch = (): { count: () => number; stop: () => void } => {
    let n = 0;
    const stop = onActivity(() => {
      n += 1;
    });
    return { count: () => n, stop };
  };

  it('[INV-AUTH2-002] iniciar la verificación y borrar la cuenta cuentan como actividad de sesión (una por respuesta correcta)', async () => {
    const spy = watch();
    const api = createAccountDeletionApi(async (url) =>
      String(url).endsWith('/reauth') ? new Response(JSON.stringify({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=x' }), { status: 200 }) : new Response(null, { status: 204 }),
    );
    await api.startReauth();
    expect(spy.count()).toBe(1);
    await api.deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA' });
    expect(spy.count()).toBe(2);
    spy.stop();
  });

  it('[INV-AUTH2-002] una respuesta con error o un fallo de red no cuentan como actividad', async () => {
    const spy = watch();
    const refused = createAccountDeletionApi(async () => new Response(JSON.stringify({ code: HOUSEHOLDS_ACTIVE_CODE }), { status: 409 }));
    await refused.deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA' }).catch(() => undefined);
    const down = createAccountDeletionApi(async () => {
      throw new Error('boom');
    });
    await down.startReauth().catch(() => undefined);
    expect(spy.count()).toBe(0);
    spy.stop();
  });
});

describe('transporte por defecto de api.ts (ORA-T1223-01)', () => {
  it('[INV-AUTH-007] conserva la cabecera CSRF, el cuerpo JSON y deja legible el cuerpo del error para el catálogo', async () => {
    const seen: Request[] = [];
    vi.stubGlobal('fetch', async (request: Request) => {
      seen.push(request.clone());
      return new Response(JSON.stringify({ code: DELETION_REAUTH_REQUIRED_CODE }), { status: 403, headers: { 'content-type': 'application/problem+json' } });
    });
    try {
      const error = await createAccountDeletionApi(createRawTransport('http://argos.test')).deleteAccount({ confirmationPhrase: 'ELIMINAR MI CUENTA' }).catch((e: unknown) => e);
      expect(error).toMatchObject({ code: DELETION_REAUTH_REQUIRED_CODE, status: 403 });
      expect(seen[0]!.url).toBe('http://argos.test/api/account/deletion/google');
      expect(seen[0]!.headers.get('x-argos-request')).toBe('1');
      expect(await seen[0]!.text()).toBe('{"confirmationPhrase":"ELIMINAR MI CUENTA"}');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('mensajes del borrado con Google (texto literal del contrato 009)', () => {
  it('[EDGE-009-031] la reautenticación requerida usa el texto del catálogo 009 y señala que hay que confirmar con Google', () => {
    const feedback = deletionFeedback(new DeletionApiError(DELETION_REAUTH_REQUIRED_CODE, 403));
    expect(feedback.reauthMessage).toBe(contractText(DELETION_REAUTH_REQUIRED_CODE));
    expect(feedback.message).toBeNull();
    expect(feedback.households).toEqual([]);
  });

  it('[EDGE-009-049] los hogares activos usan el texto del catálogo 009 y llevan la lista', () => {
    const households = [{ householdId: 'b0000000-0000-4000-8000-000000000001', name: 'Casa Norte', activeMembers: 2, sharedPets: 3 }];
    const feedback = deletionFeedback(new DeletionApiError(HOUSEHOLDS_ACTIVE_CODE, 409, households));
    expect(feedback.message).toBe(contractText(HOUSEHOLDS_ACTIVE_CODE));
    expect(feedback.households).toEqual(households);
    expect(feedback.reauthMessage).toBeNull();
  });

  it('[REQ-DEL9-001] otro código del catálogo vigente muestra su texto y uno desconocido cae en el inesperado', () => {
    expect(deletionFeedback(new DeletionApiError('ERR-ACCOUNT-CONFIRMATION-MISMATCH', 409)).message).toMatch(/respaldo/i);
    const unknown = deletionFeedback(new DeletionApiError('ERR-NO-EXISTE', 500));
    expect(unknown.message).toBe(deletionFeedback(new DeletionApiError('ERR-INTERNAL-UNEXPECTED', 500)).message);
    expect(unknown.message).not.toContain('NO-EXISTE');
  });
});
