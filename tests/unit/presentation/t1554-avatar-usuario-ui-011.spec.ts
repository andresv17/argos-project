/**
 * T1554 [US8, Bloque I, #78] foto de perfil de usuario en la interfaz, PRUEBAS ROJAS (D11-13 = C: solo subida propia con `AvatarCropper`, fallback a iniciales;
 * sin descarga de `picture` de Google). Superficie que escribe T1556: `userAvatarImagePath` (view-model), `UserAvatar` (componente), `createUserAvatarApi`
 * (`user-avatar-api.ts`), `ShellHeader` con `avatarVersion` y `AccountPage` con el panel «Foto de perfil». Render estático (el recorte con canvas queda para T1557).
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, INV-PRF11-001, SC-011-057, SC-011-058, SC-011-059, EDGE-011-007
 */
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from '../../../src/presentation/web/components/UserAvatar.tsx';
import { ShellHeader } from '../../../src/presentation/web/pages/AppShell.tsx';
import { createUserAvatarApi, UserAvatarApiError } from '../../../src/presentation/web/user-avatar-api.ts';
import { petInitials, userAvatarImagePath } from '../../../src/presentation/web/view-model.ts';

const noop = (): void => undefined;
const SRC = (path: string): string => readFileSync(`src/presentation/web/${path}`, 'utf8');
const header = (props: Record<string, unknown>): string =>
  renderToStaticMarkup(h(MemoryRouter, { initialEntries: ['/'] }, h(ShellHeader, { displayName: 'Ana Rivas', pendingInvitations: 0, onLogout: noop, ...props } as never)));

describe('T1554 ruta y fallback a iniciales (REQ-PRF11-001, SC-011-058, EDGE-011-007)', () => {
  it('[REQ-PRF11-001] la imagen se pide a /api/account/avatar?v=<versión> de la misma origen, sin id de usuario; sin versión no hay ruta', () => {
    expect([userAvatarImagePath(3), userAvatarImagePath(null)]).toEqual(['/api/account/avatar?v=3', null]);
    expect(String(userAvatarImagePath(7))).not.toMatch(/userId|users\//);
  });

  it('[SC-011-057] con avatarVersion muestra la imagen del proxy con alt vacío y carga diferida, sin srcset ni URL externa', () => {
    const html = renderToStaticMarkup(h(UserAvatar, { displayName: 'Ana Rivas', avatarVersion: 2, size: 64 }));
    expect(html).toContain('<img src="/api/account/avatar?v=2"');
    expect(html).toContain('alt=""');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('srcSet');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain(`>${petInitials('Ana Rivas')}<`);
  });

  it('[SC-011-058][EDGE-011-007] sin foto muestra las iniciales sin <img> ni texto de error', () => {
    const html = renderToStaticMarkup(h(UserAvatar, { displayName: 'Ana Rivas', avatarVersion: null, size: 64 }));
    expect(html).not.toContain('<img');
    expect(html).toContain('>AR<');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/error|no se pudo|falló/i);
  });

  it('[SC-011-058][EDGE-011-007] el componente cae a iniciales cuando la carga falla (onError) y no declara error visible', () => {
    const source = SRC('components/UserAvatar.tsx');
    expect(source).toMatch(/onError/);
    expect(source).toMatch(/useState/);
    expect(source).not.toMatch(/picture|googleusercontent|avatarUrl/);
  });
});

describe('T1554 encabezado y /cuenta (REQ-PRF11-001, SC-011-057)', () => {
  it('[SC-011-057] el encabezado muestra la foto de la propia cuenta y, sin foto, las iniciales', () => {
    expect(header({ avatarVersion: 4 })).toContain('/api/account/avatar?v=4');
    const plain = header({ avatarVersion: null });
    expect(plain).not.toContain('/api/account/avatar');
    expect(plain).toContain('>AR<');
    expect(header({})).not.toContain('/api/account/avatar');
  });

  it('[SC-011-057][REQ-PRF11-001] /cuenta ofrece el panel «Foto de perfil» con el recortador existente, quitar y reemplazar; sin importar ni leer picture de Google', () => {
    const page = SRC('pages/AccountPage.tsx');
    expect(page).toContain('UserAvatar');
    expect(page).toContain('AvatarCropper');
    expect(page).toMatch(/Foto de perfil/);
    expect(page).toMatch(/Quitar/);
    expect(page).toMatch(/createUserAvatarApi|user-avatar-api/);
    expect(page).not.toMatch(/picture|googleusercontent/);
    expect(SRC('pages/AppShell.tsx')).toContain('UserAvatar');
  });

  it('[REQ-PRF11-002][SC-011-059] la vista pública del veterinario y las pantallas de hogar/miembros no importan el componente de foto de perfil', () => {
    for (const file of ['components/SharedSummary.tsx', 'pages/HouseholdsPage.tsx', 'components/PetAssignments.tsx']) expect(SRC(file), file).not.toMatch(/UserAvatar|account\/avatar/);
  });
});

describe('T1554 cliente HTTP de la foto de perfil (REQ-PRF11-001, INV-PRF11-001)', () => {
  function recorder(responses: Array<{ status: number; body?: unknown }>): { fetchImpl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const queue = [...responses];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = queue.shift() ?? { status: 200 };
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('[REQ-PRF11-001] put envía el recorte crudo con su Content-Type y X-Argos-Request, sin id de usuario, y devuelve la versión', async () => {
    const { fetchImpl, calls } = recorder([{ status: 200, body: { avatarVersion: 5 } }]);
    const blob = new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    expect(await createUserAvatarApi(fetchImpl).put(blob)).toEqual({ avatarVersion: 5 });
    expect(calls[0]!.url).toBe('/api/account/avatar');
    expect(calls[0]!.init.method).toBe('PUT');
    expect(calls[0]!.init.headers).toMatchObject({ 'X-Argos-Request': '1', 'Content-Type': 'image/jpeg' });
    expect(calls[0]!.init.body).toBe(blob);
  });

  it('[REQ-PRF11-001] remove usa DELETE /api/account/avatar y meta lee /api/account/avatar/meta', async () => {
    const { fetchImpl, calls } = recorder([{ status: 204 }, { status: 200, body: { avatarVersion: null } }]);
    const api = createUserAvatarApi(fetchImpl);
    await api.remove();
    expect(await api.meta()).toEqual({ avatarVersion: null });
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([['DELETE', '/api/account/avatar'], ['GET', '/api/account/avatar/meta']]);
  });

  it('[REQ-PRF11-001][SC-011-061] los errores 413, 415 y 422 de catálogo llegan como UserAvatarApiError con su código; un fallo de red es ERR-INTERNAL-UNEXPECTED sin romper el encabezado', async () => {
    for (const [status, code] of [[413, 'ERR-MEDIA-TOO-LARGE'], [415, 'ERR-MEDIA-TYPE-NOT-ALLOWED'], [422, 'ERR-PRF11-AVATAR-INVALID-IMAGE']] as const) {
      const { fetchImpl } = recorder([{ status, body: { code } }]);
      const error = await createUserAvatarApi(fetchImpl).put(new Blob([new Uint8Array(1)], { type: 'image/png' })).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UserAvatarApiError);
      expect(error).toMatchObject({ code, status });
    }
    const failing = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(await createUserAvatarApi(failing).meta().catch((e: unknown) => e)).toMatchObject({ code: 'ERR-INTERNAL-UNEXPECTED' });
  });
});
