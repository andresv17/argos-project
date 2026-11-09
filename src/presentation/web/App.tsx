/**
 * Raíz de la SPA: sesión, rutas y guardia. Las rutas protegidas redirigen a `/login` sin sesión, y las
 * públicas a `/` con sesión. Navegación sin recarga (react-router-dom).
 *
 * @implements REQ-UI-001, REQ-UI-005, REQ-UI-006, INV-ARCH-004
 */
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ApiClient } from './api.ts';
import { AppShell } from './pages/AppShell.tsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.tsx';
import { BackupPage } from './pages/BackupPage.tsx';
import { HouseholdsPage } from './pages/HouseholdsPage.tsx';
import { PetsPage } from './pages/PetsPage.tsx';
import { SessionProvider, useSession } from './session.tsx';
import { routeRedirect } from './view-model.ts';

export function Guard({ children }: { readonly children: ReactNode }): JSX.Element {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'LOADING') {
    return (
      <p role="status" className="p-4 text-slate-800">
        Cargando…
      </p>
    );
  }
  const redirect = routeRedirect(status === 'AUTHENTICATED', location.pathname);
  return redirect === null ? <>{children}</> : <Navigate to={redirect} replace />;
}

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Guard><LoginPage /></Guard>} />
      <Route path="/register" element={<Guard><RegisterPage /></Guard>} />
      <Route path="/" element={<Guard><AppShell><PetsPage /></AppShell></Guard>} />
      <Route path="/households" element={<Guard><AppShell><HouseholdsPage /></AppShell></Guard>} />
      <Route path="/backup" element={<Guard><AppShell><BackupPage /></AppShell></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App({ api }: { readonly api: ApiClient }): JSX.Element {
  return (
    <SessionProvider api={api}>
      <AppRoutes />
    </SessionProvider>
  );
}
