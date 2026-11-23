/**
 * Punto de entrada del portal de administración (`admin.html` → este archivo). Bundle propio: no importa la app de usuarios, su sesión ni React Router.
 *
 * @implements REQ-ADM9-001, NFR-009-001
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPortal } from './AdminPortal.tsx';
import './styles.css';

const root = document.getElementById('admin-root');
if (root === null) throw new Error('Falta el elemento #admin-root en admin.html');

createRoot(root).render(
  <StrictMode>
    <AdminPortal />
  </StrictMode>,
);
