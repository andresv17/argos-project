/**
 * Marco de las pantallas autenticadas: cabecera con navegación, contador de invitaciones pendientes y botón
 * de cierre de sesión siempre visible (REQ-UI-005). Layout adaptable desde 320 px.
 *
 * @implements REQ-UI-004, REQ-UI-005, REQ-UI-006
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Button } from '../components/Field.tsx';
import { unwrap } from '../api.ts';
import { useSession } from '../session.tsx';
import { invitationsLabel } from '../view-model.ts';

interface InvitationsState {
  readonly count: number;
  refresh(): void;
}

const InvitationsContext = createContext<InvitationsState>({ count: 0, refresh: () => undefined });

export function useInvitations(): InvitationsState {
  return useContext(InvitationsContext);
}

export function ShellHeader({ displayName, pendingInvitations, onLogout }: {
  readonly displayName: string;
  readonly pendingInvitations: number;
  readonly onLogout: () => void;
}): JSX.Element {
  const link = ({ isActive }: { isActive: boolean }): string =>
    `rounded px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${isActive ? 'bg-white text-slate-900' : 'text-white underline-offset-4 hover:underline'}`;
  return (
    <header className="bg-slate-900 text-white">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-slate-900">
        Saltar al contenido
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-lg font-bold">Argos</p>
        <nav aria-label="Principal" className="flex flex-wrap gap-1">
          <NavLink to="/" end className={link}>
            Mascotas
          </NavLink>
          <NavLink to="/households" className={link}>
            Hogares{' '}
            <span data-pending-invitations={pendingInvitations} className="ml-1 rounded-full bg-amber-300 px-2 text-xs font-bold text-slate-900">
              <span aria-hidden="true">{pendingInvitations}</span>
              <span className="sr-only">{invitationsLabel(pendingInvitations)}</span>
            </span>
          </NavLink>
          <NavLink to="/backup" className={link}>
            Respaldo
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm">{displayName}</span>
          <Button variant="secondary" onClick={onLogout}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    unwrap(session.api.GET('/invitations'))
      .then((list) => setCount(list.length))
      .catch(() => setCount(0));
  }, [session.api]);
  useEffect(refresh, [refresh]);
  const onLogout = (): void => {
    void session.logout().then(() => navigate('/login', { replace: true }));
  };
  return (
    <InvitationsContext.Provider value={{ count, refresh }}>
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <ShellHeader displayName={session.user?.displayName ?? ''} pendingInvitations={count} onLogout={onLogout} />
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl p-4">
          {children}
        </main>
      </div>
    </InvitationsContext.Provider>
  );
}
