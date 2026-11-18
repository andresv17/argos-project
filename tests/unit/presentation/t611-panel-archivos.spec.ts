/**
 * T611 [US4] panel de archivos de la mascota (REQ-ARC-001, REQ-ARC-002, REQ-ARC-003, INV-ARC-004; SC-ALM-032): cliente HTTP sobre el contrato 004
 * (fetch propio: el cliente tipado de la SPA es el de la 002 y no declara las rutas de medios; los tipos salen del OpenAPI 3.1.0 generado),
 * `accept` de fotos, mensaje del 415, renovación proactiva de la URL al 80 % de `expiresAt` con reloj simulado y un reintento, «Abrir o descargar» y
 * permisos. Render estático y lógica pura; la prueba en una ventana móvil real (Chromium/WebKit) queda para el E2E y se declara.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createMediaApi, MediaApiError } from '../../../src/presentation/web/media-api.ts';
import { createAccessRenewer, renewalDelayMs } from '../../../src/presentation/web/access-renewer.ts';
import { ALLOWED_TYPES_MESSAGE, FILE_ACCEPT, mediaProblemMessage, PHOTO_ACCEPT } from '../../../src/presentation/web/media-view.ts';
import { MediaPanelView, type MediaPanelViewProps } from '../../../src/presentation/web/components/MediaPanel.tsx';

const PET = '44444444-4444-4444-8444-444444444401';
const MEDIA = '55555555-5555-4555-8555-555555555501';
const ITEM = { id: MEDIA, petId: PET, kind: 'FILE', mime: 'application/pdf', sizeBytes: 2048, originalName: 'carnet.pdf', createdAt: '2026-11-17T10:00:00.000Z' } as const;
const PHOTO = { ...ITEM, id: '55555555-5555-4555-8555-555555555502', kind: 'PHOTO', mime: 'image/png', originalName: 'luna.png' } as const;

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const isProblem = status >= 400;
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': isProblem ? 'application/problem+json' : 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('T611 cliente de medios sobre el contrato 004', () => {
  it('[REQ-ARC-001] sube el cuerpo crudo con kind en la query, el nombre con encodeURIComponent y la cabecera CSRF', async () => {
    const calls: Call[] = [];
    const api = createMediaApi(fakeFetch(201, ITEM, calls));
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    const item = await api.upload(PET, 'FILE', blob, 'carnet de Luna ñ.pdf');
    const headers = new Headers(calls[0]?.init.headers);
    expect([calls[0]?.url, calls[0]?.init.method, calls[0]?.init.body, headers.get('x-argos-request'), headers.get('x-argos-filename'), headers.get('content-type'), item.id]).toEqual([
      `/api/pets/${PET}/media?kind=FILE`,
      'POST',
      blob,
      '1',
      encodeURIComponent('carnet de Luna ñ.pdf'),
      'application/octet-stream',
      MEDIA,
    ]);
  });

  it('[REQ-ALB-001][REQ-ARC-003] lista con kind y page, pide acceso y borra con DELETE (204)', async () => {
    const calls: Call[] = [];
    await createMediaApi(fakeFetch(200, { items: [], page: 2, pageSize: 24, total: 30 }, calls)).list(PET, 'PHOTO', 2);
    await createMediaApi(fakeFetch(200, { url: 'https://b.storage.googleapis.com/x', expiresAt: '2026-11-17T10:05:00.000Z', mime: 'image/png' }, calls)).access(PET, MEDIA);
    await createMediaApi(fakeFetch(204, null, calls)).remove(PET, MEDIA);
    expect(calls.map((c) => [c.init.method ?? 'GET', c.url])).toEqual([
      ['GET', `/api/pets/${PET}/media?kind=PHOTO&page=2`],
      ['GET', `/api/pets/${PET}/media/${MEDIA}/access`],
      ['DELETE', `/api/pets/${PET}/media/${MEDIA}`],
    ]);
    expect(new Headers(calls[2]?.init.headers).get('x-argos-request')).toBe('1');
  });

  it('[REQ-AVA-001] sube el avatar con PUT y el tipo de la imagen, y lo quita con DELETE', async () => {
    const calls: Call[] = [];
    const blob = new Blob(['x'], { type: 'image/webp' });
    const result = await createMediaApi(fakeFetch(200, { avatarVersion: 3 }, calls)).putAvatar(PET, blob);
    await createMediaApi(fakeFetch(204, null, calls)).deleteAvatar(PET);
    expect([result, calls.map((c) => [c.init.method, c.url]), new Headers(calls[0]?.init.headers).get('content-type')]).toEqual([
      { avatarVersion: 3 },
      [['PUT', `/api/pets/${PET}/avatar`], ['DELETE', `/api/pets/${PET}/avatar`]],
      'image/webp',
    ]);
  });

  it('[REQ-ARC-001] un error del servidor se convierte en MediaApiError con su código; un fallo de red es ERR-INTERNAL-UNEXPECTED', async () => {
    const problem = { type: 'urn:argos:error:ERR-MEDIA-TYPE-NOT-ALLOWED', code: 'ERR-MEDIA-TYPE-NOT-ALLOWED', title: 't', status: 415, detail: 'd', invariantRef: 'INV-ARC-001' };
    const rejected = await createMediaApi(fakeFetch(415, problem)).upload(PET, 'FILE', new Blob(['x']), 'a.bin').catch((e: unknown) => e);
    const offline = await createMediaApi((async () => Promise.reject(new TypeError('red'))) as unknown as typeof fetch).list(PET, undefined, 1).catch((e: unknown) => e);
    expect([rejected instanceof MediaApiError, (rejected as MediaApiError).code, (rejected as MediaApiError).status, (offline as MediaApiError).code]).toEqual([true, 'ERR-MEDIA-TYPE-NOT-ALLOWED', 415, 'ERR-INTERNAL-UNEXPECTED']);
  });
});

describe('T611 textos y tipos aceptados', () => {
  it('[SC-ALM-032] el selector de fotos declara accept="image/jpeg,image/png,image/webp" y el de archivos añade el PDF', () => {
    expect([PHOTO_ACCEPT, FILE_ACCEPT]).toEqual(['image/jpeg,image/png,image/webp', 'image/jpeg,image/png,image/webp,application/pdf']);
  });

  it('[SC-ALM-032] el 415 muestra la lista de tipos permitidos; los demás errores usan el texto del catálogo', () => {
    expect(mediaProblemMessage('ERR-MEDIA-TYPE-NOT-ALLOWED')).toBe(ALLOWED_TYPES_MESSAGE);
    expect(ALLOWED_TYPES_MESSAGE).toContain('JPEG, PNG, WebP y PDF');
    expect(mediaProblemMessage('ERR-MEDIA-TOO-LARGE')).toContain('10');
    expect(mediaProblemMessage('ERR-NO-EXISTE')).toBe(mediaProblemMessage(undefined));
  });
});

describe('T611 renovación proactiva de la URL firmada (SC-ALM-032)', () => {
  /** Planificador y reloj simulados: `advance` ejecuta, en orden, lo programado hasta el instante pedido. */
  function clock(start = Date.parse('2026-11-17T10:00:00.000Z')) {
    let now = start;
    const queue: Array<{ at: number; run: () => void; live: boolean }> = [];
    return {
      now: () => now,
      scheduler: {
        after(run: () => void, ms: number) {
          const entry = { at: now + ms, run, live: true };
          queue.push(entry);
          return () => void (entry.live = false);
        },
      },
      async advance(ms: number): Promise<void> {
        const target = now + ms;
        for (;;) {
          const next = queue.filter((e) => e.live && e.at <= target).sort((x, y) => x.at - y.at)[0];
          if (next === undefined) break;
          next.live = false;
          now = next.at;
          next.run();
          await Promise.resolve();
          await Promise.resolve();
        }
        now = target;
      },
    };
  }
  const lease = (now: () => number, seconds: number) => ({ url: `https://b.storage.googleapis.com/x?e=${seconds}`, expiresAt: new Date(now() + seconds * 1000).toISOString(), mime: 'image/png' as const });

  it('[SC-ALM-032] el retardo es el 80 % del tiempo hasta expiresAt (300 s → 240 s) y nunca negativo', () => {
    expect([renewalDelayMs(0, 300_000), renewalDelayMs(1000, 1000), renewalDelayMs(5000, 1000)]).toEqual([240_000, 0, 0]);
  });

  it('[SC-ALM-032] pide una URL nueva exactamente al 80 % de expiresAt y publica la nueva', async () => {
    const time = clock();
    const urls: string[] = [];
    const fetchAccess = vi.fn(async () => lease(time.now, 300));
    const renewer = createAccessRenewer({ fetchAccess, onUrl: (a) => urls.push(a.url), onError: () => undefined, now: time.now, scheduler: time.scheduler });
    await renewer.start();
    await time.advance(239_999);
    expect(fetchAccess).toHaveBeenCalledTimes(1);
    await time.advance(1);
    expect([fetchAccess.mock.calls.length, urls.length]).toEqual([2, 2]);
    renewer.stop();
  });

  it('[SC-ALM-032] si la renovación falla reintenta una sola vez; si vuelve a fallar informa el error y deja de pedir', async () => {
    const time = clock();
    const errors: unknown[] = [];
    let calls = 0;
    const fetchAccess = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return lease(time.now, 100);
      throw new Error('caída');
    });
    const renewer = createAccessRenewer({ fetchAccess, onUrl: () => undefined, onError: (e) => errors.push(e), now: time.now, scheduler: time.scheduler });
    await renewer.start();
    await time.advance(80_000);
    expect(fetchAccess).toHaveBeenCalledTimes(2);
    await time.advance(5_000);
    expect([fetchAccess.mock.calls.length, errors.length]).toEqual([3, 1]);
    await time.advance(600_000);
    expect(fetchAccess).toHaveBeenCalledTimes(3);
  });

  it('[SC-ALM-032] stop cancela la renovación pendiente (al cerrar el visor)', async () => {
    const time = clock();
    const fetchAccess = vi.fn(async () => lease(time.now, 300));
    const renewer = createAccessRenewer({ fetchAccess, onUrl: () => undefined, onError: () => undefined, now: time.now, scheduler: time.scheduler });
    await renewer.start();
    renewer.stop();
    await time.advance(600_000);
    expect(fetchAccess).toHaveBeenCalledTimes(1);
  });
});

const noop = (): void => undefined;
function view(overrides: Partial<MediaPanelViewProps> = {}): string {
  const props: MediaPanelViewProps = {
    items: [ITEM, PHOTO],
    total: 2,
    page: 1,
    kindFilter: '',
    uploadKind: 'FILE',
    canUpload: true,
    canDelete: true,
    uploading: false,
    chosenName: null,
    error: null,
    viewer: null,
    confirmDeleteId: null,
    onKindFilter: noop,
    onUploadKind: noop,
    onChoose: noop,
    onUpload: noop,
    onView: noop,
    onCloseViewer: noop,
    onAskDelete: noop,
    onConfirmDelete: noop,
    onCancelDelete: noop,
    onPage: noop,
    ...overrides,
  };
  return renderToStaticMarkup(h(MediaPanelView, props));
}

describe('T611 panel de archivos (render)', () => {
  it('[SC-ALM-032] el selector de fotos usa accept de fotos y el de archivos incluye el PDF; el botón de subida se deshabilita en vuelo', () => {
    const file = view({ chosenName: 'a.pdf' });
    const photo = view({ uploadKind: 'PHOTO', chosenName: 'a.png' });
    const busy = view({ chosenName: 'a.pdf', uploading: true });
    expect(file).toContain(`accept="${FILE_ACCEPT}"`);
    expect(photo).toContain(`accept="${PHOTO_ACCEPT}"`);
    expect(photo).not.toContain('application/pdf');
    expect(file).toMatch(/<button[^>]*>Subir<\/button>/);
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*>Subiendo…<\/button>/);
    expect(view({ chosenName: null })).toMatch(/<button[^>]*disabled=""[^>]*>Subir<\/button>/);
  });

  it('[REQ-ARC-002] el Lector ve la lista y el visor pero no subir ni borrar; quien puede borrar ve «Borrar»', () => {
    const reader = view({ canUpload: false, canDelete: false });
    const admin = view();
    expect([reader.includes('type="file"'), reader.includes('Borrar'), reader.includes('carnet.pdf')]).toEqual([false, false, true]);
    expect([admin.includes('type="file"'), admin.includes('Borrar')]).toEqual([true, true]);
  });

  it('[REQ-ARC-001] el error del 415 se muestra con la lista de tipos permitidos en un aviso accesible', () => {
    const markup = view({ error: ALLOWED_TYPES_MESSAGE });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('JPEG, PNG, WebP y PDF');
  });

  it('[REQ-ARC-003][INV-ARC-004] el visor muestra la imagen con la URL firmada y el PDF en un marco con «Abrir o descargar»', () => {
    const url = 'https://b.storage.googleapis.com/x?sig=1';
    const image = view({ viewer: { item: PHOTO, url, status: 'READY' } });
    const pdf = view({ viewer: { item: ITEM, url, status: 'READY' } });
    expect(image).toContain(`<img src="${url.replace(/&/g, '&amp;')}"`);
    expect(image).toContain('alt="luna.png"');
    expect(pdf).toContain('<iframe');
    expect(pdf).toContain('>Abrir o descargar</a>');
    expect(pdf).toContain('rel="noopener noreferrer"');
  });

  it('[REQ-ARC-003] mientras se pide la URL el visor muestra «Preparando…» y sin la URL no hay imagen ni marco', () => {
    const loading = view({ viewer: { item: PHOTO, url: null, status: 'LOADING' } });
    expect([loading.includes('Preparando'), loading.includes('<iframe'), loading.includes('<img src=')]).toEqual([true, false, false]);
  });

  it('[REQ-GCS-004] el borrado pide confirmación explícita con el nombre del archivo antes de ejecutarse', () => {
    const asking = view({ confirmDeleteId: MEDIA });
    expect(asking).toContain('¿Borrar «carnet.pdf»?');
    expect(asking).toContain('>Sí, borrar</button>');
    expect(asking).toContain('>Cancelar</button>');
  });

  it('[REQ-ALB-001] con más de 24 elementos ofrece paginación; vacío muestra «Sin archivos»', () => {
    expect(view({ total: 50 })).toContain('Página 1 de 3');
    expect(view({ items: [], total: 0 })).toContain('Sin archivos');
  });
});

describe('T611 integración en la ficha (REQ-ARC-002)', () => {
  it('[REQ-ARC-003] la ficha de la mascota muestra el panel de archivos en su ranura y no en modo edición', async () => {
    const { PetDashboard } = await import('../../../src/presentation/web/components/PetDashboard.tsx');
    const { dashboard } = await import('./presentation-fixtures.ts');
    const base = { dashboard: dashboard('OWNER'), activeTab: 'weights' as const, onTabChange: noop, onAddRecord: async () => undefined, onEdit: noop, onDelete: noop };
    const slot = h('p', null, 'RANURA-ARCHIVOS');
    const normal = renderToStaticMarkup(h(PetDashboard, { ...base, mediaSlot: slot }));
    const editing = renderToStaticMarkup(h(PetDashboard, { ...base, mediaSlot: slot, editSlot: h('p', null, 'FORM') }));
    expect([normal.includes('RANURA-ARCHIVOS'), editing.includes('RANURA-ARCHIVOS'), editing.includes('FORM')]).toEqual([true, false, true]);
  });
});
