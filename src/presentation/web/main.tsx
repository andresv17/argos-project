/**
 * Punto de entrada de la SPA (`index.html` → `src/presentation/web/main.tsx`).
 *
 * @implements REQ-UI-004, INV-ARCH-004
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { createWebApi } from './api.ts';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Falta el elemento #root en index.html');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App api={createWebApi()} />
    </BrowserRouter>
  </StrictMode>,
);
