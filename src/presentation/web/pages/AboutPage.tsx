/**
 * Página pública «Acerca de» (`/acerca-de`, feature 010, T1431; REQ-ACE10-001, D10-07, EDGE-010-004). Va FUERA de la sesión: no consulta el estado de la sesión, no envía credenciales y no redirige
 * a login con una cookie caducada. La lectura de `GET /api/about` es un efecto del cliente. Foto responsiva con `alt` accesible, estado vacío y Markdown renderizado sin inyectar HTML.
 *
 * @implements REQ-ACE10-001, REQ-ACE10-002, EDGE-010-004, D10-07, SC-010-027
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { renderAboutMarkdown } from '../about-markdown.ts';
import { BRAND_NAME } from '../brand.ts';

interface PublicAbout {
  readonly bodyMarkdown: string;
  readonly photoUrl: string | null;
  readonly photoAlt: string;
}
type State = { readonly kind: 'loading' } | { readonly kind: 'error' } | { readonly kind: 'ready'; readonly about: PublicAbout };

const PHOTO_URL = /^\/api\/about\/photo(\?v=[0-9]+)?$/;
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';

export function parsePublicAbout(body: unknown): PublicAbout | null {
  if (typeof body !== 'object' || body === null) return null;
  const { bodyMarkdown, photoUrl, photoAlt } = body as Record<string, unknown>;
  if (typeof bodyMarkdown !== 'string' || typeof photoAlt !== 'string') return null;
  if (photoUrl !== null && (typeof photoUrl !== 'string' || !PHOTO_URL.test(photoUrl))) return null;
  return { bodyMarkdown, photoUrl, photoAlt };
}

export function AboutPage(): JSX.Element {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    fetch('/api/about', { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const about = response.status === 200 ? parsePublicAbout(await response.json()) : null;
        if (active) setState(about === null ? { kind: 'error' } : { kind: 'ready', about });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  const about = state.kind === 'ready' ? state.about : null;
  const empty = about !== null && about.bodyMarkdown.trim() === '' && about.photoUrl === null;
  return (
    <div lang="es" className="min-h-screen bg-cream px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/40 bg-white/90 p-6 shadow-glass sm:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md">
        <header className="mb-4">
          <Link to="/login" className={`inline-block ${FOCUS}`}>
            <img src="/brand/tipi-logo-horizontal.svg" alt={BRAND_NAME} width={266} height={150} className="h-12 w-auto max-w-full" />
          </Link>
        </header>
        <main id="main-content" className="break-words text-text-primary">
          <p className="mb-4 text-sm">
            <Link to="/login" className={`font-semibold text-primary underline ${FOCUS}`}>
              Volver a Tipi
            </Link>
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary">Acerca de Tipi</h1>
          {state.kind === 'loading' ? (
            <p role="status" className="mt-4 text-base text-text-muted">
              Leyendo la información…
            </p>
          ) : null}
          {state.kind === 'error' ? (
            <p role="alert" className="mt-4 text-base text-danger">
              No se pudo cargar esta página. Inténtalo de nuevo más tarde.
            </p>
          ) : null}
          {empty ? <p className="mt-4 text-base text-text-muted">Aún no hay información publicada. Vuelve pronto.</p> : null}
          {about !== null && !empty ? (
            <div className="mt-4 grid gap-4 [&>*]:min-w-0">
              {about.photoUrl !== null ? (
                <img src={about.photoUrl} alt={about.photoAlt} className="h-auto max-h-[28rem] w-full rounded-2xl object-cover" />
              ) : null}
              <div className="about-text grid min-w-0 gap-3 text-base leading-relaxed [overflow-wrap:anywhere] [&>*]:min-w-0 [&_a]:rounded-sm [&_a]:focus:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-terracota [&_a]:focus-visible:ring-offset-2 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: renderAboutMarkdown(about.bodyMarkdown, 1) }} />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
