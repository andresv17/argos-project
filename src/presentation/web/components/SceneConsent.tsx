/**
 * Aviso previo y consentimiento de la escena (feature 006, T877): texto empaquetado (borrador hasta la firma de Neo), casilla de consentimiento por usuario,
 * «Consentir y continuar» / «Ahora no», reconsentimiento cuando la versión del aviso o el proveedor cambian y retiro con confirmación. `SceneConsentView` es
 * presentacional; `SceneConsent` es el contenedor (grant, revoke y relectura de la escena).
 *
 * @implements REQ-ESC6-021, REQ-ESC6-023, REQ-ESC6-025, REQ-ESC6-026, EDGE-ESC6-018, ERR-SCENE-NOTICE-OUTDATED, SC-ESC6-033, SC-ESC6-036, SC-ESC6-039
 */
import { useMemo, useState } from 'react';
import { createSceneApi, SceneApiError, type SceneViewData } from '../scene-api.ts';
import { consentBody, consentStep, NOTICE_DRAFT, NOTICE_DRAFT_LABEL, NOTICE_INTRO, NOTICE_SECTIONS, NOTICE_TITLE, type ConsentStep } from '../scene-notice.ts';
import { sceneProblemMessage } from '../scene-view.ts';
import { Button } from './Field.tsx';

export interface SceneConsentViewProps {
  readonly idPrefix: string;
  readonly step: ConsentStep;
  readonly accepted: boolean;
  readonly busy: boolean;
  readonly confirmRevoke: boolean;
  readonly error: string | null;
  readonly onAccept: (accepted: boolean) => void;
  readonly onGrant: () => void;
  readonly onDecline: () => void;
  readonly onAskRevoke: () => void;
  readonly onConfirmRevoke: () => void;
  readonly onCancelRevoke: () => void;
}

export function SceneConsentView({ idPrefix, step, accepted, busy, confirmRevoke, error, onAccept, onGrant, onDecline, onAskRevoke, onConfirmRevoke, onCancelRevoke }: SceneConsentViewProps): JSX.Element {
  const titleId = `${idPrefix}-consent-title`;
  const checkId = `${idPrefix}-consent-check`;
  const dialogId = `${idPrefix}-revoke-text`;
  return (
    <section aria-labelledby={titleId} className="grid min-w-0 max-w-full gap-3 rounded-2xl border border-slate-300 bg-white p-4">
      <h3 id={titleId} className="text-base font-semibold text-slate-900">
        {step === 'GRANTED' ? 'Consentimiento para la escena' : NOTICE_TITLE}
      </h3>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {step === 'GRANTED' ? (
        <>
          <p className="text-sm text-slate-900">Diste tu consentimiento para enviar la foto de tu hogar y los avatares de tus mascotas al servicio de inteligencia artificial. Puedes retirarlo cuando quieras.</p>
          {confirmRevoke ? (
            <div role="alertdialog" aria-labelledby={dialogId} className="rounded-2xl border-2 border-danger bg-red-50 p-4">
              <p id={dialogId} className="text-sm text-red-900">
                Se retirará tu consentimiento y se borrarán de inmediato la foto del hogar que subiste y las imágenes de la escena hechas con tus datos. El avatar de tus mascotas no se borra. El proveedor puede conservar los datos que ya recibió. Podrás consentir de nuevo cuando quieras.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="danger" disabled={busy} onClick={onConfirmRevoke}>
                  Sí, retirar y borrar
                </Button>
                <Button variant="secondary" onClick={onCancelRevoke}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button variant="secondary" disabled={busy} onClick={onAskRevoke}>
                Retirar consentimiento y borrar imágenes de la escena
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {NOTICE_DRAFT ? <p className="rounded-xl border border-amber-700 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{NOTICE_DRAFT_LABEL}</p> : null}
          {step === 'OUTDATED' ? (
            <p role="status" className="rounded-xl border border-slate-400 bg-meadow px-3 py-2 text-sm font-semibold text-slate-900">
              El aviso cambió desde la última vez. Actualiza la página para leer la versión vigente y vuelve a dar tu consentimiento.
            </p>
          ) : null}
          <p className="text-sm text-slate-900">{NOTICE_INTRO}</p>
          {NOTICE_SECTIONS.map((section) => (
            <div key={section.title} className="grid gap-1">
              <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm text-slate-900">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
          {step === 'ASK' ? (
            <>
              <div className="flex items-start gap-3">
                <input id={checkId} type="checkbox" checked={accepted} onChange={(e) => onAccept(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 rounded border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" />
                <label htmlFor={checkId} className="text-sm text-slate-900">
                  Entiendo y consiento el envío de la foto de mi hogar y de los avatares de las mascotas de las que eres Propietario Legal a Google Vertex AI para generar la imagen. Consiento solo por mis propios datos.
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy || !accepted} onClick={onGrant}>
                  Consentir y continuar
                </Button>
                <Button variant="secondary" onClick={onDecline}>
                  Ahora no
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Contenedor: pasa el consentimiento de la escena a `SceneConsentView`, concede o retira y relee la escena. Con «Ahora no» el aviso se oculta hasta recargar. */
export function SceneConsent({ idPrefix, view, reload }: { readonly idPrefix: string; readonly view: SceneViewData; readonly reload: () => Promise<void> }): JSX.Element | null {
  const api = useMemo(() => createSceneApi(), []);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = consentStep(view.consent);
  if (step !== 'GRANTED' && dismissed) {
    return (
      <p className="text-sm text-slate-900">
        La escena usa fotos de tu hogar y de tus mascotas solo si das tu consentimiento.{' '}
        <button type="button" onClick={() => setDismissed(false)} className="min-h-12 font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Leer el aviso
        </button>
      </p>
    );
  }
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof SceneApiError ? sceneProblemMessage(e.code, e.retryAfterSeconds) : sceneProblemMessage('ERR-INTERNAL-UNEXPECTED'));
      if (e instanceof SceneApiError && e.code === 'ERR-SCENE-NOTICE-OUTDATED') await reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <SceneConsentView
      idPrefix={idPrefix}
      step={step}
      accepted={accepted}
      busy={busy}
      confirmRevoke={confirmRevoke}
      error={error}
      onAccept={setAccepted}
      onGrant={() => void run(async () => api.grantConsent(consentBody()))}
      onDecline={() => setDismissed(true)}
      onAskRevoke={() => setConfirmRevoke(true)}
      onConfirmRevoke={() =>
        void run(async () => {
          await api.revokeConsent();
          setConfirmRevoke(false);
          setAccepted(false);
        })
      }
      onCancelRevoke={() => setConfirmRevoke(false)}
    />
  );
}
