/**
 * Diálogo «Este microchip ya está registrado» (Feature 012, Bloque B, T1636; REQ-CHP12-001, REQ-CHP12-003, REQ-CHP12-004, INV-CHP12-003): aparece tras el 409 `ERR-CHP12-MICROCHIP-REGISTERED` del alta
 * o la edición y ofrece tres salidas: (1) corregir el número (error de tipeo), (2) solicitar co-propiedad y (3) «es mía» (disputa con evidencia). El texto NUNCA dice quién tiene el chip ni si hay mascota
 * viva: tras enviar solo confirma que la solicitud se RECIBIÓ (el 202 es idéntico exista o no la fila). El foco entra al encabezado al abrir (WCAG 2.4.3).
 *
 * @implements REQ-CHP12-001, REQ-CHP12-003, REQ-CHP12-004, INV-CHP12-003
 */
import { useEffect, useRef, useState } from 'react';
import { chipProblemMessage, EVIDENCE_ACCEPT, MAX_EVIDENCE_FILES, type ChipApi } from '../chip-api.ts';
import { Button } from './Field.tsx';

type Step = 'CHOOSE' | 'CLAIM' | 'DISPUTE' | 'SENT';

export function ChipRegisteredDialog({ chip, api, onCorrect, onClose }: {
  readonly chip: string;
  readonly api: ChipApi;
  /** Cierra el diálogo y devuelve el foco al campo del microchip. */
  readonly onCorrect: () => void;
  readonly onClose: () => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>('CHOOSE');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setStep('SENT');
    } catch (e) {
      setError(chipProblemMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alertdialog" aria-modal="false" aria-labelledby="chip-registered-title" aria-describedby="chip-registered-desc" className="rounded-2xl border-2 border-amber-700 bg-amber-50 p-4">
      <h3 id="chip-registered-title" ref={heading} tabIndex={-1} className="font-semibold text-amber-950">
        {step === 'SENT' ? 'Recibimos tu solicitud' : 'Este microchip ya está registrado'}
      </h3>
      {step === 'CHOOSE' ? (
        <>
          <p id="chip-registered-desc" className="text-sm text-amber-950">
            Ese número no se puede usar en este registro. Por privacidad no podemos decirte nada más sobre él. Elige qué quieres hacer:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onCorrect}>
              Corregir el número (me equivoqué al escribirlo)
            </Button>
            <Button variant="secondary" onClick={() => setStep('CLAIM')}>
              Solicitar co-propiedad
            </Button>
            <Button variant="secondary" onClick={() => setStep('DISPUTE')}>
              Es mía: abrir una disputa
            </Button>
          </div>
        </>
      ) : null}
      {step === 'CLAIM' ? (
        <div className="mt-2 grid gap-2">
          <p id="chip-registered-desc" className="text-sm text-amber-950">
            Si la mascota existe, sus propietarios recibirán tu solicitud y decidirán. No recibirás acceso a nada hasta que la aprueben.
          </p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-900">
            Mensaje para los propietarios (opcional, hasta 280 caracteres)
            <textarea value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} className="min-h-20 rounded-xl border border-border-strong bg-white px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run(() => api.claim(chip, message))}>
              {busy ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
            <Button variant="secondary" onClick={() => setStep('CHOOSE')}>
              Volver
            </Button>
          </div>
        </div>
      ) : null}
      {step === 'DISPUTE' ? (
        <div className="mt-2 grid gap-2">
          <p id="chip-registered-desc" className="text-sm text-amber-950">
            Adjunta evidencia documental de que la mascota es tuya (por ejemplo, el carné o el registro veterinario): de 1 a {MAX_EVIDENCE_FILES} archivos PDF, JPG, PNG o WebP. Un equipo de administración la revisará; los propietarios actuales no ven tu evidencia ni tu identidad.
          </p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-900">
            Evidencia
            <input type="file" multiple accept={EVIDENCE_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_EVIDENCE_FILES))} className="rounded-xl border border-border-strong bg-white px-3 py-2" />
          </label>
          <p className="text-xs text-slate-700">{files.length === 0 ? 'Sin archivos elegidos.' : `${files.length} archivo(s) elegido(s).`}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || files.length === 0} onClick={() => void run(() => api.openDispute(chip, files))}>
              {busy ? 'Enviando…' : 'Abrir la disputa'}
            </Button>
            <Button variant="secondary" onClick={() => setStep('CHOOSE')}>
              Volver
            </Button>
          </div>
        </div>
      ) : null}
      {step === 'SENT' ? (
        <div className="mt-2 grid gap-2">
          <p id="chip-registered-desc" className="text-sm text-amber-950">
            Recibimos tu solicitud. Puedes seguir su estado en «Mis solicitudes de microchip». Si procede, te avisaremos del resultado.
          </p>
          <div>
            <Button variant="secondary" onClick={onClose}>
              Entendido
            </Button>
          </div>
        </div>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-900">
          {error}
        </p>
      )}
      {step === 'CHOOSE' ? (
        <div className="mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const STATUS_TEXT: Readonly<Record<string, string>> = { PENDING: 'En espera de los propietarios', UNDER_REVIEW: 'En revisión por administración', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', EXPIRED: 'Vencida', RESOLVED: 'Cerrada' };
const OUTCOME_TEXT: Readonly<Record<string, string>> = { RESOLVED_APPROVED: 'Resuelta a tu favor', RESOLVED_REJECTED: 'Resuelta sin cambios', EXPIRED: 'Venció sin resolución' };

/** «Mis solicitudes de microchip»: estado de las reclamaciones y disputas PROPIAS (solo `chipLast4`; el desenlace de una disputa es solo cerrado, sin identidades). */
export function MyChipRequests({ api }: { readonly api: ChipApi }): JSX.Element | null {
  const [items, setItems] = useState<Awaited<ReturnType<ChipApi['listMine']>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.listMine().then(
      (rows) => alive && setItems(rows),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  if (failed || items === null || items.length === 0) return null;
  return (
    <section aria-labelledby="my-chip-requests-title" className="rounded-2xl border border-border-strong bg-white p-4">
      <h3 id="my-chip-requests-title" className="font-semibold text-slate-900">
        Mis solicitudes de microchip
      </h3>
      <ul className="mt-2 grid gap-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-300 px-3 py-2">
            <span className="font-semibold">{item.action === 'CHIP_DISPUTE' ? 'Disputa' : 'Co-propiedad'}</span>
            {` · microchip terminado en ${item.chipLast4} · `}
            {item.outcome !== null ? OUTCOME_TEXT[item.outcome] : (STATUS_TEXT[item.status] ?? item.status)}
          </li>
        ))}
      </ul>
    </section>
  );
}
