/**
 * Página PÚBLICA `/shared/{token}` (S5 y S7 de `/sati`, T775; REQ-SUM-004, REQ-VET-006, REQ-VET-007): la SPA sin datos pide `GET /api/shared/{token}/summary` SIN cookie
 * y muestra el resumen de solo lectura; cualquier fallo (inexistente, vencido, revocado, creador sin autoridad) es la MISMA pantalla «Este enlace no está disponible», y el
 * 429, «Demasiados intentos». No hay sesión, menú, enlaces salientes, analítica ni peticiones periódicas: si el enlace vence con la página abierta, la vista ya cargada sigue
 * visible y un refresco recibe el 404 (EDGE-005-07). El título nunca lleva el token ni el nombre de un archivo.
 *
 * @implements REQ-SUM-004, REQ-VET-006, REQ-VET-007, EDGE-005-07, SC-005-031, SC-005-035
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SharedSummaryDocument, SharedUnavailable } from '../components/SharedSummary.tsx';
import { createShareApi, ShareApiError, type ShareApi, type SharedSummaryViewModel } from '../share-api.ts';

type State = { readonly kind: 'LOADING' } | { readonly kind: 'READY'; readonly view: SharedSummaryViewModel } | { readonly kind: 'NOT_FOUND' } | { readonly kind: 'RATE_LIMITED' } | { readonly kind: 'ERROR' };

export function SharedPage({ api }: { readonly api?: ShareApi }): JSX.Element {
  const { token = '' } = useParams();
  const [state, setState] = useState<State>({ kind: 'LOADING' });
  const client = useRef(api ?? createShareApi());

  useEffect(() => {
    let active = true;
    client.current.getShared(token).then(
      (view) => active && setState({ kind: 'READY', view }),
      (e: unknown) => {
        if (!active) return;
        const status = e instanceof ShareApiError ? e.status : 0;
        setState({ kind: status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'ERROR' });
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    document.title = state.kind === 'READY' ? 'Resumen clínico compartido' : state.kind === 'LOADING' ? 'Cargando…' : 'Enlace no disponible';
    if (state.kind === 'NOT_FOUND' || state.kind === 'RATE_LIMITED') document.getElementById('shared-unavailable-title')?.focus();
  }, [state]);

  return (
    <div lang="es" className="min-h-screen bg-cream">
      {state.kind === 'LOADING' ? (
        <p role="status" className="p-4 text-slate-800">
          Cargando…
        </p>
      ) : state.kind === 'READY' ? (
        <SharedSummaryDocument view={state.view} mode="PUBLIC" downloadHref={(fileId) => `/api/shared/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`} onPrint={() => window.print()} />
      ) : state.kind === 'ERROR' ? (
        <p role="alert" className="p-4 text-slate-900">
          No se pudo cargar el resumen. Recarga la página; si el problema sigue, pide un enlace nuevo.
        </p>
      ) : (
        <SharedUnavailable reason={state.kind} />
      )}
    </div>
  );
}
