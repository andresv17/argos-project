/**
 * Portal /admin (T1235, diseño de /sati: `.specify/memory/audits/sati-009-T1235-admin-ui.md`). Una sola ruta, dos vistas según `GET /api/admin/session`:
 * pantalla de acceso con Google (sin sesión, sesión vencida o rechazado: idéntica, EDGE-009-008) y shell autenticado con «Cerrar sesión».
 * El shell muestra las solicitudes de registro (T1250: contador, solicitudes paginadas, aprobar/rechazar), el editor de parámetros (T1269) y el aviso de caducidad a los 25 min (LCK-25); sin enlaces a la app de usuarios; no pinta identificadores ni correo.
 *
 * @implements REQ-ADM9-001, REQ-APR9-005, NFR-009-001, EDGE-009-008, INV-ADM9-001
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ParametersPanel } from './ParametersPanel.tsx';
import { RegistrationsPanel } from './RegistrationsPanel.tsx';
import { SessionExpiryNotice } from './SessionExpiryNotice.tsx';

const SESSION_PATH = '/api/admin/session';
const GOOGLE_START_PATH = '/api/admin/auth/google/start';

type View = 'checking' | 'anonymous' | 'authenticated';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';

interface SessionInfo {
  readonly viewerId: string | null;
  readonly expiresAt: string | null;
}

/** `null` = sin sesión. `viewerId` y `expiresAt` solo alimentan el editor de parámetros (autor «Tú») y el aviso de caducidad; nunca se pintan. */
async function readSession(): Promise<SessionInfo | null> {
  try {
    const response = await fetch(SESSION_PATH, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (response.status !== 200) return null;
    const body = (await response.json()) as { authenticated?: unknown; adminId?: unknown; expiresAt?: unknown };
    if (body.authenticated !== true) return null;
    return { viewerId: typeof body.adminId === 'string' ? body.adminId : null, expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null };
  } catch {
    return null;
  }
}

function SkipLink(): JSX.Element {
  return (
    <a
      href="#main-content"
      className={`sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary ${FOCUS_RING}`}
    >
      Saltar al contenido
    </a>
  );
}

function AccessScreen({ headingRef }: { readonly headingRef: React.RefObject<HTMLHeadingElement> }): JSX.Element {
  return (
    <div className="min-h-screen bg-cream">
      <SkipLink />
      <main id="main-content" className="mx-auto max-w-md px-4 py-8 sm:pt-16 lg:pt-24">
        <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-primary focus:outline-none">
            Argos
          </h1>
          <p className="text-sm text-text-muted">Administración</p>
          <p className="mt-4 text-base text-text-primary">Este acceso es solo para el equipo administrador. Entra con la cuenta de Google autorizada.</p>
          <a
            href={GOOGLE_START_PATH}
            className={`mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover ${FOCUS_RING}`}
          >
            Entrar con Google
          </a>
          <p className="mt-4 text-sm text-text-muted">Si tu sesión terminó, vuelve a entrar con Google.</p>
        </section>
      </main>
    </div>
  );
}

function Shell(props: {
  readonly signingOut: boolean;
  readonly error: boolean;
  readonly onSignOut: () => void;
  readonly onSessionLost: () => void;
  readonly session: SessionInfo;
  readonly buttonRef: React.RefObject<HTMLButtonElement>;
}): JSX.Element {
  const { signingOut, error, onSignOut, onSessionLost, session, buttonRef } = props;
  return (
    <div className="min-h-screen bg-cream">
      <SkipLink />
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:justify-between sm:px-6">
          <p className="font-semibold text-primary">Argos · Administración</p>
          <button
            ref={buttonRef}
            type="button"
            aria-disabled={signingOut ? 'true' : undefined}
            onClick={onSignOut}
            className={`inline-flex min-h-12 w-full items-center justify-center rounded-full border border-primary bg-white px-5 text-sm font-semibold text-primary hover:bg-meadow sm:w-auto ${signingOut ? 'opacity-70' : ''} ${FOCUS_RING}`}
          >
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 break-words text-2xl font-bold text-text-primary">Administración</h1>
        <SessionExpiryNotice expiresAt={session.expiresAt} />
        <RegistrationsPanel onSessionLost={onSessionLost} />
        <ParametersPanel viewerId={session.viewerId} onSessionLost={onSessionLost} />
        <p className="mt-4 max-w-3xl text-sm text-text-muted">Tu sesión dura 30 minutos como máximo y se cierra sola tras 10 minutos sin actividad.</p>
        {error ? (
          <div role="alert" className="mt-4 max-w-3xl text-sm font-medium text-danger">
            No se pudo cerrar la sesión. Inténtalo de nuevo.
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function AdminPortal(): JSX.Element {
  const [view, setView] = useState<View>('checking');
  const [session, setSession] = useState<SessionInfo>({ viewerId: null, expiresAt: null });
  const [signingOut, setSigningOut] = useState(false);
  const [closeError, setCloseError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusHeadingNext = useRef(false);
  const focusButtonNext = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const info = await readSession();
    if (info !== null) setSession((current) => (current.viewerId === info.viewerId && current.expiresAt === info.expiresAt ? current : info));
    setView(info !== null ? 'authenticated' : 'anonymous');
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => {
    if (view === 'anonymous' && focusHeadingNext.current) {
      focusHeadingNext.current = false;
      headingRef.current?.focus();
    }
  }, [view]);

  useEffect(() => {
    if (!signingOut && closeError && focusButtonNext.current) {
      focusButtonNext.current = false;
      buttonRef.current?.focus();
    }
  }, [signingOut, closeError]);

  const signOut = async (): Promise<void> => {
    if (signingOut) return;
    setSigningOut(true);
    setCloseError(false);
    let closed = false;
    try {
      const response = await fetch(SESSION_PATH, { method: 'DELETE', credentials: 'same-origin', headers: { 'X-Argos-Request': '1' } });
      closed = response.status === 204 || response.status === 404;
    } catch {
      closed = false;
    }
    setSigningOut(false);
    if (closed) {
      focusHeadingNext.current = true;
      setAnnouncement('Sesión cerrada.');
      setView('anonymous');
    } else {
      focusButtonNext.current = true;
      setCloseError(true);
    }
  };

  return (
    <>
      <div role="status" className="sr-only">
        {view === 'checking' ? 'Comprobando sesión…' : announcement}
      </div>
      {view === 'checking' ? <main aria-busy="true" className="min-h-screen bg-cream" /> : null}
      {view === 'anonymous' ? <AccessScreen headingRef={headingRef} /> : null}
      {view === 'authenticated' ? <Shell signingOut={signingOut} error={closeError} onSignOut={() => void signOut()} onSessionLost={() => void refresh()} session={session} buttonRef={buttonRef} /> : null}
    </>
  );
}
