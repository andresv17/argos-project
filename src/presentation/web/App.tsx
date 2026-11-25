/**
 * Raíz de la SPA: sesión, rutas y guardia. Las rutas protegidas redirigen a `/login` sin sesión, y las
 * públicas a `/` con sesión. Navegación sin recarga (react-router-dom).
 *
 * @implements REQ-UI-001, REQ-UI-005, REQ-UI-006, REQ-UI2-001, REQ-UI2-004, REQ-SSO8-003, REQ-LEG10-001, INV-ARCH-004
 */
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ApiClient } from './api.ts';
import { ACCOUNT_STATUS_ROUTE } from './account-status.ts';
import { AccountStatusPage } from './pages/AccountStatusPage.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import { AlbumPage } from './pages/AlbumPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { AppShell } from './pages/AppShell.tsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.tsx';
import { ChooseUsernamePage } from './pages/ChooseUsernamePage.tsx';
import { BackupPage } from './pages/BackupPage.tsx';
import { HouseholdsPage } from './pages/HouseholdsPage.tsx';
import { PetsPage } from './pages/PetsPage.tsx';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage.tsx';
import { SharedPage } from './pages/SharedPage.tsx';
import { SummaryPreviewPage } from './pages/SummaryPreviewPage.tsx';
import { TermsPage } from './pages/TermsPage.tsx';
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
      <Route path="/elige-usuario" element={<Guard><ChooseUsernamePage /></Guard>} />
      <Route path={ACCOUNT_STATUS_ROUTE.PENDING} element={<Guard><AccountStatusPage status="PENDING" /></Guard>} />
      <Route path={ACCOUNT_STATUS_ROUTE.REJECTED} element={<Guard><AccountStatusPage status="REJECTED" /></Guard>} />
      <Route path="/" element={<Guard><AppShell><PetsPage /></AppShell></Guard>} />
      <Route path="/mascotas/:petId/album" element={<Guard><AppShell><AlbumPage /></AppShell></Guard>} />
      <Route path="/mascotas/:petId/resumen" element={<Guard><AppShell><SummaryPreviewPage /></AppShell></Guard>} />
      <Route path="/households/:householdId/resumen" element={<Guard><AppShell><SummaryPreviewPage /></AppShell></Guard>} />
      <Route path="/households" element={<Guard><AppShell><HouseholdsPage /></AppShell></Guard>} />
      <Route path="/backup" element={<Guard><AppShell><BackupPage /></AppShell></Guard>} />
      <Route path="/cuenta" element={<Guard><AppShell><AccountPage /></AppShell></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App({ api }: { readonly api: ApiClient }): JSX.Element {
  // La página pública `/shared/{token}` va FUERA de la sesión: no consulta `/auth/me`, no lee ni envía la cookie (REQ-VET-006, INV-005-002). Igual `/privacidad`, `/terminos` (T1413) y `/acerca-de` (T1431), EDGE-010-004.
  return (
    <Routes>
      <Route path="/shared/:token" element={<SharedPage />} />
      <Route path="/privacidad" element={<PrivacyPolicyPage />} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route path="/acerca-de" element={<AboutPage />} />
      <Route
        path="*"
        element={
          <SessionProvider api={api}>
            <AppRoutes />
          </SessionProvider>
        }
      />
    </Routes>
  );
}
