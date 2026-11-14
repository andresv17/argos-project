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
  readonly householdCount: number;
  refresh(): void;
}

const InvitationsContext = createContext<InvitationsState>({ count: 0, householdCount: 0, refresh: () => undefined });

export function useInvitations(): InvitationsState {
  return useContext(InvitationsContext);
}

export function ShellHeader({ displayName, pendingInvitations, householdCount = 0, onLogout }: {
  readonly displayName: string;
  readonly pendingInvitations: number;
  readonly householdCount?: number;
  readonly onLogout: () => void;
}): JSX.Element {
  const link = ({ isActive }: { isActive: boolean }): string =>
    `flex min-h-12 items-center rounded-full px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary ${isActive ? 'bg-accent text-primary' : 'text-white underline-offset-4 hover:underline'}`;
  return (
    <header className="bg-primary text-white">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-full focus:bg-white focus:px-4 focus:py-3 focus:text-primary">
        Saltar al contenido
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="text-lg font-bold tracking-tight">Argos</p>
        <nav aria-label="Principal" className="flex flex-wrap gap-1">
          <NavLink to="/" end className={link}>
            Mascotas
          </NavLink>
          <NavLink to="/households" className={link}>
            Hogares{' '}
            <span data-household-count={householdCount} className="ml-1 rounded-full bg-white px-2 text-xs font-bold text-primary">
              <span aria-hidden="true">{householdCount}</span>
              <span className="sr-only">{householdCount === 1 ? '1 hogar' : `${householdCount} hogares`}</span>
              <span className="ml-1 font-normal" aria-hidden="true">hogares</span>
            </span>
            <span data-pending-invitations={pendingInvitations} className="ml-1 rounded-full bg-amber-300 px-2 text-xs font-bold text-slate-900">
              <span aria-hidden="true">{pendingInvitations}</span>
              <span className="sr-only">{invitationsLabel(pendingInvitations)}</span>
              <span className="ml-1 font-normal" aria-hidden="true">invitaciones</span>
            </span>
          </NavLink>
          <NavLink to="/backup" className={link}>
            Respaldo
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <span className="sr-only text-sm min-[480px]:not-sr-only">{displayName}</span>
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
  const [householdCount, setHouseholdCount] = useState(0);
  const refresh = useCallback(() => {
    unwrap(session.api.GET('/invitations'))
      .then((list) => setCount(list.length))
      .catch(() => setCount(0));
    unwrap(session.api.GET('/households'))
      .then((list) => setHouseholdCount(list.length))
      .catch(() => setHouseholdCount(0));
  }, [session.api]);
  useEffect(refresh, [refresh]);
  const onLogout = (): void => {
    void session.logout().then(() => navigate('/login', { replace: true }));
  };
  return (
    <InvitationsContext.Provider value={{ count, householdCount, refresh }}>
      <div className="min-h-screen text-text-primary">
        <ShellHeader displayName={session.user?.displayName ?? ''} pendingInvitations={count} householdCount={householdCount} onLogout={onLogout} />
        {/* Marco L1 de blur (ui_blueprint §1.4/§1.5): blur solo desde 640 px y con soporte; en móvil blanco 90 % sin blur. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-4 mt-4 mb-6 max-w-7xl rounded-3xl border border-white/40 bg-white/90 p-4 shadow-glass sm:mx-6 sm:p-6 lg:mx-auto sm:supports-[backdrop-filter]:bg-white/70 sm:supports-[backdrop-filter]:backdrop-blur-md"
        >
          {children}
        </main>
      </div>
    </InvitationsContext.Provider>
  );
}
