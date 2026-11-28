/**
 * Vista PÚBLICA `/e/:token` de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1676; REQ-QR12-004, REQ-QR12-009, INV-QR12-002): shell de la SPA, FUERA de la sesión (sin `/auth/me`, sin cookie).
 * Pide `GET /api/emergency/{token}` y muestra solo nombre, alergias críticas y teléfonos, como TEXTO plano (sin HTML ni enlazado automático; los teléfonos se muestran sin enlace `tel:`). Cualquier fallo
 * es la misma pantalla «no disponible» (404 uniforme); el 429, «Demasiados intentos». Sin menú, analítica, recursos de terceros ni metaetiquetas `og:`/`twitter:`; el título nunca lleva el token.
 *
 * @implements REQ-QR12-004, REQ-QR12-009, INV-QR12-002, SC-012-042
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EmergencyApiError, fetchEmergencyPublic, type EmergencyPublicView } from '../emergency-api.ts';
import { EMERGENCY_TEXTS, EMERGENCY_UI, publicHeading } from '../emergency-texts.ts';

export type EmergencyPublicState = { readonly kind: 'LOADING' } | { readonly kind: 'READY'; readonly view: EmergencyPublicView } | { readonly kind: 'NOT_FOUND' } | { readonly kind: 'RATE_LIMITED' } | { readonly kind: 'ERROR' };

export function EmergencyPublicDocument({ state }: { readonly state: EmergencyPublicState }): JSX.Element {
  if (state.kind === 'LOADING')
    return (
      <p role="status" className="p-4 text-slate-800">
        Cargando…
      </p>
    );
  if (state.kind === 'READY') {
    const { petName, criticalAllergies, contactPhones } = state.view;
    return (
      <main className="mx-auto grid max-w-xl gap-4 p-4 text-slate-900">
        <h1 className="text-2xl font-semibold">{publicHeading(petName)}</h1>
        <section aria-labelledby="pub-allergies" className="grid gap-2 rounded-2xl border border-slate-300 bg-white p-4">
          <h2 id="pub-allergies" className="text-lg font-semibold">
            {EMERGENCY_UI.publicAllergiesTitle}
          </h2>
          {criticalAllergies.length === 0 ? (
            <p>{EMERGENCY_TEXTS.publicNoAllergies}</p>
          ) : (
            <ul className="list-disc pl-5">
              {criticalAllergies.map((allergy, index) => (
                <li key={index}>{allergy}</li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="pub-phones" className="grid gap-2 rounded-2xl border border-slate-300 bg-white p-4">
          <h2 id="pub-phones" className="text-lg font-semibold">
            {EMERGENCY_UI.publicPhonesTitle}
          </h2>
          {contactPhones.length === 0 ? (
            <p>{EMERGENCY_UI.publicNoPhones}</p>
          ) : (
            <ul className="grid gap-1">
              {contactPhones.map((contact, index) => (
                <li key={index} className="text-xl font-semibold tabular-nums">
                  {contact.phone}
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-sm text-slate-800">{EMERGENCY_TEXTS.publicFooter}</p>
      </main>
    );
  }
  if (state.kind === 'ERROR')
    return (
      <p role="alert" className="p-4 text-slate-900">
        {EMERGENCY_UI.publicError}
      </p>
    );
  return (
    <main className="mx-auto grid max-w-xl gap-2 p-4 text-slate-900">
      <h1 id="emergency-unavailable-title" tabIndex={-1} className="text-xl font-semibold focus-visible:outline-none">
        {EMERGENCY_UI.publicUnavailableTitle}
      </h1>
      <p>{state.kind === 'RATE_LIMITED' ? EMERGENCY_UI.publicRateLimited : EMERGENCY_UI.publicUnavailable}</p>
    </main>
  );
}

export function EmergencyPublicPage({ fetcher }: { readonly fetcher?: typeof fetchEmergencyPublic }): JSX.Element {
  const { token = '' } = useParams();
  const [state, setState] = useState<EmergencyPublicState>({ kind: 'LOADING' });
  const load = useRef(fetcher ?? fetchEmergencyPublic);
  useEffect(() => {
    let active = true;
    load.current(token).then(
      (view) => active && setState({ kind: 'READY', view }),
      (e: unknown) => {
        if (!active) return;
        const status = e instanceof EmergencyApiError ? e.status : 0;
        setState({ kind: status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'ERROR' });
      },
    );
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    document.title = state.kind === 'READY' ? 'Ficha de emergencia' : state.kind === 'LOADING' ? 'Cargando…' : 'Ficha no disponible';
    if (state.kind === 'NOT_FOUND' || state.kind === 'RATE_LIMITED') document.getElementById('emergency-unavailable-title')?.focus();
  }, [state]);
  return (
    <div lang="es" className="min-h-screen bg-cream">
      <EmergencyPublicDocument state={state} />
    </div>
  );
}
