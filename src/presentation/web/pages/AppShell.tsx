/**
 * Marco de las pantallas autenticadas (T287, blueprint §3): un único marco con la cabecera dentro, navegación directa Mascotas,
 * Hogares, Respaldo y Perfil en `<nav aria-label="Principal">`, sin menú del avatar ni barra inferior (en < 768 px la navegación
 * va en el flujo superior, dentro del marco, para que el orden de foco coincida con el visual), contadores de hogares e
 * invitaciones, botón de cierre de sesión siempre visible y aviso previo de expiración de sesión (REQ-UI-005).
 *
 * @implements REQ-UI-004, REQ-UI-005, REQ-UI-006, REQ-UI2-001, REQ-UI2-008
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Button } from '../components/Field.tsx';
import { unwrap } from '../api.ts';
import { useIdleNotice, WARNING_LEAD_MINUTES } from '../idle-notice.ts';
import { BRAND_NAME } from '../brand.ts';
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
  // Estado activo: relleno Crema oscura con texto Bosque y línea de 2 px oliva que evita depender solo del color (WCAG 1.4.11).
  const link = ({ isActive }: { isActive: boolean }): string =>
    `relative flex min-h-12 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-sm sm:px-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
      isActive ? 'bg-accent font-semibold after:absolute after:inset-x-3 sm:after:inset-x-4 after:bottom-1.5 after:h-0.5 after:bg-primary' : 'font-medium underline-offset-4 hover:underline'
    }`;
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-4">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-full focus:bg-white focus:px-4 focus:py-3 focus:text-primary">
        Saltar al contenido
      </a>
      <p className="flex items-center font-display text-2xl font-extrabold tracking-tight text-primary">
        {/* Decisión de Neo (T1434): símbolo Tipi + texto «Tipi» en Tipi Display. */}
        <img src="/brand/tipi-simbolo.svg" alt="" aria-hidden="true" width={48} height={48} className="h-12 w-12" />
        <span className="ml-2">{BRAND_NAME.toLowerCase()}</span>
      </p>
      <nav aria-label="Principal" className="flex flex-wrap gap-1">
        <NavLink to="/" end className={link}>
          Mascotas
        </NavLink>
        <NavLink to="/households" className={link}>
          Hogares
          <span data-household-count={householdCount} className="rounded-full bg-primary px-2 text-xs font-bold tabular-nums text-cream">
            <span aria-hidden="true">{householdCount}</span>
            <span className="sr-only">{householdCount === 1 ? '1 hogar' : `${householdCount} hogares`}</span>
            <span className="ml-1 font-normal" aria-hidden="true">hogares</span>
          </span>
          <span data-pending-invitations={pendingInvitations} className="rounded-full bg-amber-300 px-2 text-xs font-bold tabular-nums text-slate-900">
            <span aria-hidden="true">{pendingInvitations}</span>
            <span className="sr-only">{invitationsLabel(pendingInvitations)}</span>
            <span className="ml-1 font-normal" aria-hidden="true">invitaciones</span>
          </span>
        </NavLink>
        <NavLink to="/backup" className={link}>
          Respaldo
        </NavLink>
        <NavLink to="/cuenta" className={link}>
          Perfil
        </NavLink>
        <NavLink to="/acerca-de" className={link}>
          Acerca de
        </NavLink>
      </nav>
      <div className="flex items-center gap-3">
        <span className="sr-only text-sm text-text-primary min-[480px]:not-sr-only">{displayName}</span>
        <Button variant="secondary" onClick={onLogout}>
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }): JSX.Element {
  const session = useSession();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [householdCount, setHouseholdCount] = useState(0);
  const idleWarning = useIdleNotice(session.idleExpiresAt, session.lastActivityAt);
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
      <div className="min-h-screen px-4 py-4 text-text-primary sm:px-6 sm:py-6">
        {/* Marco L1 único (blueprint §2.5): blur solo desde 640 px y con soporte; en móvil, blanco 90 % sin backdrop-filter. */}
        <div className="mx-auto max-w-7xl rounded-3xl border border-white/40 bg-white/90 p-4 shadow-glass sm:bg-white/70 sm:p-6 sm:supports-[backdrop-filter]:backdrop-blur-md">
          <ShellHeader displayName={session.user?.displayName ?? ''} pendingInvitations={count} householdCount={householdCount} onLogout={onLogout} />
          {idleWarning ? (
            <p role="status" className="mb-4 rounded-2xl border border-amber-700 bg-amber-100 px-4 py-3 text-sm text-amber-900">
              {`Tu sesión expira pronto por inactividad (en menos de ${WARNING_LEAD_MINUTES} minutos). Realiza cualquier acción para mantenerla abierta.`}
            </p>
          ) : null}
          <main id="main-content" tabIndex={-1} className="min-w-0 focus:outline-none">
            {children}
          </main>
        </div>
      </div>
    </InvitationsContext.Provider>
  );
}
