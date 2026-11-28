/**
 * Panel «Ficha QR de emergencia» de la ficha de la mascota (Feature 012, Bloque D, #32; T1676; REQ-QR12-003, REQ-QR12-005, REQ-QR12-006, REQ-QR12-010): activar con aviso y consentimiento por
 * mascota (texto del contrato), descarga INMEDIATA del SVG, el PNG (generado en el cliente) y la hoja A6 porque el token se muestra UNA sola vez, regenerar, desactivar y aviso de apagado automático.
 * El SVG solo se usa como `Blob`/`<img src=blob:>` con `download`; nunca como HTML. La guarda, la normalización y el consentimiento son del servidor; aquí solo se presentan y se envían.
 *
 * @implements REQ-QR12-003, REQ-QR12-005, REQ-QR12-006, REQ-QR12-009, REQ-QR12-010, INV-QR12-003
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Field.tsx';
import {
  EmergencyApiError,
  createEmergencyApi,
  emergencyProblemMessage,
  type EmergencyActivationResult,
  type EmergencyApi,
  type EmergencyCardOwnerView,
} from '../emergency-api.ts';
import { EMERGENCY_NOTICE_VERSION, EMERGENCY_TEXTS, EMERGENCY_UI, phoneOptInLabel } from '../emergency-texts.ts';
import { autoOffNotice, downloadBlobAs, isSafeQrSvg, otherOwnerNotice, qrFileName, svgBlob, svgDataUri, svgToPngBlob } from '../emergency-view.ts';

const CARD = 'grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

/** Hoja imprimible A6 (REQ-QR12-005): nombre, leyenda del contrato y QR de 60 mm de lado (el mínimo del contrato es 30 mm). Solo existe en papel (`.qr-a6`, `@media print`). */
export function EmergencyPrintSheet({ petName, qrSrc }: { readonly petName: string; readonly qrSrc: string }): JSX.Element {
  return (
    <div className="qr-a6" data-testid="qr-a6" lang="es">
      <h2 className="qr-a6__name">{petName}</h2>
      <img className="qr-a6__code" src={qrSrc} alt="Código QR de la ficha de emergencia" />
      <p className="qr-a6__caption">{EMERGENCY_TEXTS.printSheetCaption}</p>
    </div>
  );
}

/** Hoja A6 montada directamente bajo `document.body` (hermana de la app, sin ancestros que la recorten); sin `document` (render estático) queda en línea. */
export function EmergencyPrintPortal({ petName, qrSrc }: { readonly petName: string; readonly qrSrc: string }): JSX.Element {
  const sheet = <EmergencyPrintSheet petName={petName} qrSrc={qrSrc} />;
  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body);
}

export interface EmergencyCardViewProps {
  readonly petName: string;
  readonly status: EmergencyCardOwnerView | null;
  readonly hasPhone: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly issued: { readonly result: EmergencyActivationResult; readonly pngFailed: boolean } | null;
  readonly consent: boolean;
  readonly showMyPhone: boolean;
  readonly formOpen: boolean;
  readonly confirmDeactivate: boolean;
  readonly onConsent: (value: boolean) => void;
  readonly onShowMyPhone: (value: boolean) => void;
  readonly onOpenForm: () => void;
  readonly onSubmitForm: () => void;
  readonly onCancelForm: () => void;
  readonly onDownloadSvg: () => void;
  readonly onDownloadPng: () => void;
  readonly onPrint: () => void;
  readonly onDismissIssued: () => void;
  readonly onAskDeactivate: () => void;
  readonly onConfirmDeactivate: () => void;
  readonly onCancelDeactivate: () => void;
  readonly onReconfirmPhone: () => void;
  readonly onRemovePhone: () => void;
}

export function EmergencyCardView(p: EmergencyCardViewProps): JSX.Element {
  const status = p.status;
  const on = status?.status === 'ON';
  const autoOff = status === null || on ? null : autoOffNotice(status.statusReason);
  const other = status === null ? null : otherOwnerNotice(status);
  return (
    <section aria-labelledby="qr-title" className={CARD}>
      <h2 id="qr-title" className="text-lg font-semibold">
        {EMERGENCY_UI.qrTitle}
      </h2>
      {p.error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {p.error}
        </p>
      )}
      {p.issued !== null ? (
        <div role="status" className="grid gap-3 rounded-2xl border border-emerald-700 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">{EMERGENCY_UI.qrShownOnce}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={p.onDownloadSvg}>{EMERGENCY_UI.qrDownloadSvg}</Button>
            <Button onClick={p.onDownloadPng}>{EMERGENCY_UI.qrDownloadPng}</Button>
            <Button onClick={p.onPrint}>{EMERGENCY_UI.qrPrint}</Button>
            <Button variant="secondary" onClick={p.onDismissIssued}>
              Ya guardé el código
            </Button>
          </div>
          {p.issued.pngFailed ? <p>No se pudo generar el PNG en este navegador. Descarga el SVG o imprime la hoja.</p> : null}
        </div>
      ) : null}
      {autoOff === null ? null : (
        <div role="status" className="rounded-2xl border border-amber-700 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">{EMERGENCY_UI.qrAutoOffTitle}</p>
          <p>{autoOff}</p>
        </div>
      )}
      {other === null ? null : (
        <p role="status" className="text-sm text-slate-800">
          {other}
        </p>
      )}
      {status === null ? (
        <p role="status" className="text-sm text-slate-800">
          Cargando…
        </p>
      ) : (
        <p className="text-sm text-slate-800">{on ? EMERGENCY_UI.qrOn : EMERGENCY_UI.qrOff}</p>
      )}
      {status !== null && on ? (
        <ul className="grid gap-1 text-sm text-text-muted">
          <li>{`Alergias críticas visibles: ${status.criticalAllergiesCount}`}</li>
          <li>{`Teléfonos visibles: ${status.visiblePhonesCount}`}</li>
          <li>{status.myPhoneVisible ? 'Tu teléfono se muestra en esta ficha.' : 'Tu teléfono no se muestra en esta ficha.'}</li>
        </ul>
      ) : null}
      {status !== null && status.myPhoneReconfirmRequired ? (
        <div role="status" className="grid gap-2 rounded-2xl border border-amber-700 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>{EMERGENCY_UI.qrReconfirm}</p>
          <div>
            <Button variant="secondary" disabled={p.busy} onClick={p.onReconfirmPhone}>
              {EMERGENCY_UI.qrReconfirmAction}
            </Button>
          </div>
        </div>
      ) : null}
      {status !== null && on && status.myPhoneVisible ? (
        <div>
          <Button variant="secondary" disabled={p.busy} onClick={p.onRemovePhone}>
            {EMERGENCY_UI.qrRemovePhone}
          </Button>
        </div>
      ) : null}
      {p.formOpen ? (
        <form
          noValidate
          aria-label="Activar ficha QR"
          onSubmit={(event) => {
            event.preventDefault();
            p.onSubmitForm();
          }}
          className="grid gap-3"
        >
          <p className="max-w-prose text-sm text-slate-900">{EMERGENCY_TEXTS.activationNotice}</p>
          {p.hasPhone ? (
            <label htmlFor="qr-show-phone" className="flex min-h-12 items-center gap-3 text-sm font-medium text-slate-800">
              <input id="qr-show-phone" type="checkbox" checked={p.showMyPhone} onChange={(e) => p.onShowMyPhone(e.target.checked)} />
              {phoneOptInLabel(p.petName)}
            </label>
          ) : (
            <p className="text-sm text-text-muted">{EMERGENCY_UI.qrNoPhoneYet}</p>
          )}
          <label htmlFor="qr-consent" className="flex min-h-12 items-center gap-3 text-sm font-medium text-slate-800">
            <input id="qr-consent" type="checkbox" checked={p.consent} onChange={(e) => p.onConsent(e.target.checked)} />
            {EMERGENCY_UI.qrConsent}
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={p.busy || !p.consent}>
              {on ? EMERGENCY_UI.qrRegenerate : EMERGENCY_UI.qrActivate}
            </Button>
            <Button variant="secondary" onClick={p.onCancelForm}>
              {EMERGENCY_UI.qrCancel}
            </Button>
          </div>
        </form>
      ) : status === null || p.issued !== null ? null : (
        <div className="flex flex-wrap gap-3">
          <Button disabled={p.busy} onClick={p.onOpenForm}>
            {on ? EMERGENCY_UI.qrRegenerate : EMERGENCY_UI.qrActivate}
          </Button>
          {on ? (
            <Button variant="danger" disabled={p.busy} onClick={p.onAskDeactivate}>
              {EMERGENCY_UI.qrDeactivate}
            </Button>
          ) : null}
        </div>
      )}
      {p.confirmDeactivate ? (
        <div role="alertdialog" aria-label="Confirmar desactivación" className="grid gap-2 rounded-2xl border border-danger bg-red-50 p-4 text-sm text-red-900">
          <p>El código actual dejará de funcionar de inmediato.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" disabled={p.busy} onClick={p.onConfirmDeactivate}>
              {EMERGENCY_UI.qrConfirmDeactivate}
            </Button>
            <Button variant="secondary" onClick={p.onCancelDeactivate}>
              {EMERGENCY_UI.qrCancel}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Contenedor con estado: pide el estado, envía las acciones y conserva el token solo en memoria mientras se muestra. */
export function EmergencyCardPanel({ petId, petName, hasPhone, onChanged, api }: { readonly petId: string; readonly petName: string; readonly hasPhone: boolean; readonly onChanged?: () => void; readonly api?: EmergencyApi }): JSX.Element {
  const client = useMemo(() => api ?? createEmergencyApi(), [api]);
  const [status, setStatus] = useState<EmergencyCardOwnerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ result: EmergencyActivationResult; pngFailed: boolean } | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [showMyPhone, setShowMyPhone] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const fail = useCallback((e: unknown) => setError(emergencyProblemMessage(e instanceof EmergencyApiError ? e : new EmergencyApiError('ERR-INTERNAL-UNEXPECTED', 0))), []);
  const refresh = useCallback(async () => {
    try {
      setStatus(await client.getStatus(petId));
    } catch (e) {
      fail(e);
    }
  }, [client, petId, fail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearIssued = useCallback(() => {
    setQrSrc(null);
    setIssued(null);
  }, []);
  useEffect(() => clearIssued, [clearIssued]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const submitForm = (): Promise<void> =>
    run(async () => {
      const body = { consentAccepted: consent, noticeVersion: EMERGENCY_NOTICE_VERSION, ...(hasPhone ? { showMyPhone } : {}) };
      const result = status?.status === 'ON' ? await client.regenerate(petId, body) : await client.activate(petId, body);
      if (!isSafeQrSvg(result.qrSvg)) throw new EmergencyApiError('ERR-INTERNAL-UNEXPECTED', 0);
      clearIssued();
      setQrSrc(svgDataUri(result.qrSvg));
      setIssued({ result, pngFailed: false });
      setFormOpen(false);
      setConsent(false);
      setShowMyPhone(false);
      await refresh();
      onChanged?.();
    });

  const downloadPng = async (): Promise<void> => {
    if (issued === null) return;
    const blob = await svgToPngBlob(issued.result.qrSvg);
    if (blob === null) setIssued({ ...issued, pngFailed: true });
    else downloadBlobAs(blob, qrFileName('png'));
  };
  const print = (): void => {
    document.body.classList.add('printing-qr');
    const done = (): void => {
      document.body.classList.remove('printing-qr');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <>
      <EmergencyCardView
        petName={petName}
        status={status}
        hasPhone={hasPhone}
        busy={busy}
        error={error}
        issued={issued}
        consent={consent}
        showMyPhone={showMyPhone}
        formOpen={formOpen}
        confirmDeactivate={confirmDeactivate}
        onConsent={setConsent}
        onShowMyPhone={setShowMyPhone}
        onOpenForm={() => setFormOpen(true)}
        onSubmitForm={() => void submitForm()}
        onCancelForm={() => {
          setFormOpen(false);
          setConsent(false);
        }}
        onDownloadSvg={() => issued !== null && downloadBlobAs(svgBlob(issued.result.qrSvg), qrFileName('svg'))}
        onDownloadPng={() => void downloadPng()}
        onPrint={print}
        onDismissIssued={clearIssued}
        onAskDeactivate={() => setConfirmDeactivate(true)}
        onConfirmDeactivate={() =>
          void run(async () => {
            await client.deactivate(petId);
            setConfirmDeactivate(false);
            clearIssued();
            await refresh();
            onChanged?.();
          })
        }
        onCancelDeactivate={() => setConfirmDeactivate(false)}
        onReconfirmPhone={() =>
          void run(async () => {
            setStatus(await client.setPhoneConsent(petId, { visible: true, noticeVersion: EMERGENCY_NOTICE_VERSION }));
          })
        }
        onRemovePhone={() =>
          void run(async () => {
            setStatus(await client.setPhoneConsent(petId, { visible: false }));
          })
        }
      />
      {qrSrc !== null ? <EmergencyPrintPortal petName={petName} qrSrc={qrSrc} /> : null}
    </>
  );
}
