/**
 * Vista previa autenticada del resumen (S5b de `/sati`, T776, D5-15; REQ-SUM-004): el propietario o el ADMIN ve lo que verá el veterinario, con las casillas de la
 * pantalla «Compartir» (`includeMicrochip`, `includeClinicalFiles`). No crea ni muestra ningún token y no hay descarga de archivos desde aquí.
 *
 * @implements REQ-SUM-004, D5-15, SC-005-031, SC-005-045
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SharedSummaryDocument } from '../components/SharedSummary.tsx';
import { createShareApi, ShareApiError, type ShareApi, type SharedSummaryViewModel } from '../share-api.ts';
import { shareProblemMessage } from '../share-view.ts';

export function SummaryPreviewPage({ api }: { readonly api?: ShareApi }): JSX.Element {
  const { petId, householdId } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState<SharedSummaryViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const includeMicrochip = query.get('includeMicrochip') === 'true';
  const includeClinicalFiles = query.get('includeClinicalFiles') === 'true';

  useEffect(() => {
    const client = api ?? createShareApi();
    const ref = householdId !== undefined ? ({ scope: 'HOUSEHOLD', id: householdId } as const) : ({ scope: 'PET', id: petId ?? '' } as const);
    client.preview(ref, { includeMicrochip, includeClinicalFiles }).then(setView, (e: unknown) => setError(shareProblemMessage(e instanceof ShareApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED')));
  }, [api, petId, householdId, includeMicrochip, includeClinicalFiles]);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="print-hide">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Volver
        </button>
      </div>
      {error !== null ? (
        <p role="alert" className="text-sm text-red-900">
          {error}
        </p>
      ) : view === null ? (
        <p role="status" className="text-sm text-slate-800">
          Cargando…
        </p>
      ) : (
        <SharedSummaryDocument view={view} mode="PREVIEW" downloadHref={null} onPrint={() => window.print()} />
      )}
    </div>
  );
}
