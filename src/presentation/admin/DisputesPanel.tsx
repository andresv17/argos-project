/**
 * Cola de disputas de microchip en /admin (Feature 012, Bloque B, T1636; REQ-CHP12-004, REQ-CHP12-008, REQ-CHP12-009, INV-CHP12-006, EDGE-012-043). Lista la cola con SLA y fase de decisión, abre un
 * expediente SEUDONIMIZADO (alias, evidencia sin contenido, actores por alias), permite leer cada evidencia (lectura auditada, requisito previo del segundo administrador), prorrogar la congelación
 * una vez y registrar la decisión: `resolve` pide un step-up de un solo uso y, si cambia titularidad, queda «a la espera de confirmación» de un SEGUNDO administrador distinto (control dual). Una
 * fila donde el administrador es parte se muestra «recusada» y no abre expediente. Sin chip completo, correo ni identidad de las partes.
 *
 * @implements REQ-CHP12-004, REQ-CHP12-008, REQ-CHP12-009, INV-CHP12-004, INV-CHP12-006, EDGE-012-043
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelExecution,
  closeMoot,
  confirmDispute,
  extendFreeze,
  fetchDispute,
  fetchQueue,
  readEvidence,
  resolveDispute,
  type DisputeFile,
  type DisputeKind,
  type MootReason,
  type Outcome,
  type QueueItem,
  type Resolution,
} from './disputes-api.ts';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';
const BUTTON = `inline-flex min-h-12 items-center justify-center rounded-full border px-5 text-sm font-semibold ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} border-primary bg-primary text-cream hover:bg-primary-hover`;
const OUTLINE = `${BUTTON} border-primary bg-white text-primary hover:bg-meadow`;

export const KIND_LABEL: Readonly<Record<DisputeKind, string>> = {
  CHIP_APPROPRIATION: 'Apropiación de microchip',
  CO_OWNER_ABSENT_OR_BLOCKING: 'Copropietario ausente o bloqueante',
  PRINCIPAL_ABSENT: 'Propietario principal ausente',
};
export const PHASE_LABEL = { NONE: 'Sin decisión registrada', AWAITING_CONFIRMATION: 'Decisión registrada, a la espera de confirmación', SCHEDULED_EXECUTION: 'Ejecución programada (ventana de 72 h)' } as const;
const RESOLUTION_LABEL: Readonly<Record<Resolution, string>> = {
  REJECT: 'Rechazar (sin cambios)',
  ADD_CO_OWNER: 'Agregar al reclamante como copropietario',
  REQUEST_CHANGE_PRINCIPAL: 'Cambiar el propietario principal',
  END_CO_OWNERSHIP: 'Terminar la copropiedad del ausente',
};
const MOOT_LABEL: Readonly<Record<MootReason, string>> = { PET_GONE: 'La mascota ya no existe', REQUESTER_NOT_ACTIVE: 'El reclamante ya no está activo', TARGET_LEFT: 'El copropietario salió', TARGET_NOT_ACTIVE: 'El copropietario ya no está activo', TRIGGER_LOST: 'Se perdió el desencadenante' };

/** Resolución permitida por tipo (espejo de la validación del servidor; el servidor decide). */
export function resolutionsFor(kind: DisputeKind): readonly Resolution[] {
  if (kind === 'CHIP_APPROPRIATION') return ['REJECT', 'ADD_CO_OWNER', 'REQUEST_CHANGE_PRINCIPAL'];
  if (kind === 'PRINCIPAL_ABSENT') return ['REJECT', 'REQUEST_CHANGE_PRINCIPAL'];
  return ['REJECT', 'END_CO_OWNERSHIP'];
}

const ROLE_LABEL: Readonly<Record<string, string>> = { SUPER_ADMIN: 'superadministrador', OPERATOR: 'operador', SUPPORT: 'soporte', OWNER: 'propietario', PRINCIPAL: 'propietario principal', CO_OWNER: 'copropietario', REQUESTER: 'reclamante', CLAIMANT: 'reclamante' };
const roleText = (role: string): string => ROLE_LABEL[role] ?? role;

/** Fecha legible en español (p. ej. «1 dic 2026, 14:30»); si no se puede interpretar, devuelve el texto recibido. */
const readableDate = (iso: string, withTime: boolean): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

const fail = (outcome: Outcome<unknown>): string => {
  switch (outcome.kind) {
    case 'FORBIDDEN':
      return outcome.code === 'ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT' ? 'No puedes intervenir en este caso: eres parte del caso, o ya registraste la decisión y la confirmación debe hacerla otra persona administradora.' : 'Operación no permitida. Si es la decisión o la confirmación, vuelve a intentarlo; confirmar exige haber leído antes la evidencia.';
    case 'STALE':
      return 'El caso cambió mientras decidías. Recarga la cola.';
    case 'INVALID':
      return 'Revisa los datos: el motivo es obligatorio (hasta 500 caracteres).';
    default:
      return 'No pudimos completar la acción. Inténtalo de nuevo.';
  }
};

export function DisputesPanel({ onSessionLost }: { readonly onSessionLost: () => void }): JSX.Element {
  const [items, setItems] = useState<readonly QueueItem[] | null>(null);
  const [file, setFile] = useState<DisputeFile | null>(null);
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<Resolution>('REJECT');
  const [moot, setMoot] = useState<MootReason>('PET_GONE');
  const [message, setMessage] = useState<{ readonly text: string; readonly isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const reasonInvalid = message?.isError === true && message.text.startsWith('Revisa los datos');
  const heading = useRef<HTMLHeadingElement>(null);
  const lost = useRef(onSessionLost);
  lost.current = onSessionLost;

  /** Traduce el resultado: sesión perdida cierra la sesión; otro fallo muestra un texto; OK devuelve el valor. */
  const unwrap = useCallback(<T,>(outcome: Outcome<T>): T | null => {
    if (outcome.kind === 'OK') return outcome.value;
    if (outcome.kind === 'SESSION_LOST') lost.current();
    else setMessage({ text: fail(outcome), isError: true });
    return null;
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    const page = unwrap(await fetchQueue());
    setItems(page === null ? [] : page.items);
  }, [unwrap]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (work: () => Promise<Outcome<DisputeFile>>, done: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const next = unwrap(await work());
    setBusy(false);
    if (next === null) return;
    setFile(next);
    setReason('');
    setMessage({ text: done, isError: false });
    await reload();
  };

  const open = async (id: string): Promise<void> => {
    setMessage(null);
    const opened = unwrap(await fetchDispute(id));
    if (opened === null) return;
    setFile(opened);
    setResolution(resolutionsFor(opened.kind)[1] ?? 'REJECT');
    setTimeout(() => heading.current?.focus(), 0);
  };

  const read = async (evidenceId: string): Promise<void> => {
    if (file === null) return;
    const result = unwrap(await readEvidence(file.disputeId, evidenceId));
    if (result === null) return;
    window.open(result.url, '_blank', 'noopener,noreferrer');
    const refreshed = unwrap(await fetchDispute(file.disputeId));
    if (refreshed !== null) setFile(refreshed);
  };

  return (
    <section aria-labelledby="disputes-title" className="mt-8 max-w-3xl">
      <h2 id="disputes-title" className="text-xl font-semibold text-slate-900">
        Disputas de microchip
      </h2>
      {message === null ? null : message.isError ? (
        <p role="alert" className="mt-2 rounded-xl border-2 border-danger px-3 py-2 text-sm font-semibold text-danger">
          {`Error: ${message.text}`}
        </p>
      ) : (
        <p role="status" className="mt-2 text-sm font-medium text-slate-900">
          {message.text}
        </p>
      )}
      {items === null ? <p className="mt-2 text-sm">Cargando…</p> : null}
      {items !== null && items.length === 0 ? <p className="mt-2 text-sm">No hay disputas abiertas.</p> : null}
      <ul className="mt-3 grid gap-2">
        {(items ?? []).map((item) => (
          <li key={item.disputeId} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm">
            <p className="font-semibold">
              {KIND_LABEL[item.kind]}
              {item.chipLast4 === undefined ? '' : ` · microchip terminado en ${item.chipLast4}`}
            </p>
            <p>{`${PHASE_LABEL[item.decisionPhase]} · plazo ${readableDate(item.slaDueAt, false)}${item.slaOverdue ? ' (vencido)' : ''}`}</p>
            {item.iAmParty === true ? (
              <p className="font-semibold text-danger">Recusada: eres parte de este caso.</p>
            ) : (
              <button type="button" aria-label={`Abrir expediente: ${KIND_LABEL[item.kind]}${item.chipLast4 === undefined ? '' : `, microchip terminado en ${item.chipLast4}`}`} className={`${OUTLINE} mt-2`} onClick={() => void open(item.disputeId)}>
                Abrir expediente
              </button>
            )}
          </li>
        ))}
      </ul>
      {file === null ? null : (
        <div className="mt-4 rounded-2xl border-2 border-primary bg-white p-4 text-sm">
          <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold">
            {`Expediente · ${KIND_LABEL[file.kind]}`}
          </h3>
          <p>{`${PHASE_LABEL[file.decisionPhase]}${file.resolution === undefined ? '' : ` · decisión: ${RESOLUTION_LABEL[file.resolution]}`}`}</p>
          {file.executesAfter === undefined ? null : <p>{`Se ejecutará después del ${readableDate(file.executesAfter, true)}.`}</p>}
          <p>{`Partes: ${file.parties.map((p) => p.alias).join(' y ')} (seudonimizadas).`}</p>
          <p>{file.actors.length === 0 ? 'Sin decisiones registradas.' : `Actores: ${file.actors.map((a) => `${a.alias} (${roleText(a.role)})`).join(', ')}.`}</p>
          <h4 className="mt-2 font-semibold">Evidencia</h4>
          <ul className="grid gap-1">
            {file.evidence.map((ev, index) => (
              <li key={ev.evidenceId} className="flex flex-wrap items-center gap-2">
                <span>{`Archivo ${index + 1} · ${ev.contentType} · ${Math.ceil(ev.bytes / 1024)} KB · ${ev.readByMe === true ? 'leído por ti' : 'sin leer'}`}</span>
                <button type="button" aria-label={`Leer archivo ${index + 1}`} className={OUTLINE} onClick={() => void read(ev.evidenceId)}>
                  Leer
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex flex-col gap-1 font-semibold">
            Motivo (obligatorio, hasta 500 caracteres)
            <textarea value={reason} maxLength={500} aria-invalid={reasonInvalid ? true : undefined} aria-describedby={reasonInvalid ? 'dispute-reason-help dispute-reason-privacy dispute-reason-error' : 'dispute-reason-help dispute-reason-privacy'} onChange={(e) => setReason(e.target.value)} className="min-h-20 rounded-xl border border-border-strong px-3 py-2 font-normal" />
          </label>
          <p id="dispute-reason-privacy" className="text-sm">
            No incluyas datos personales de terceros en el motivo.
          </p>
          <p id="dispute-reason-help" className="text-sm">
            {reason.trim() === '' ? 'Escribe el motivo para habilitar «Registrar decisión», «Prorrogar la congelación», «Confirmar la decisión» y «Cancelar la ejecución programada».' : 'Motivo listo.'}
          </p>
          {reasonInvalid ? (
            <p id="dispute-reason-error" className="text-sm font-semibold text-danger">
              Error: el motivo es obligatorio (hasta 500 caracteres).
            </p>
          ) : null}
          {file.decisionPhase === 'NONE' ? (
            <div className="mt-3 grid gap-2">
              <label className="flex flex-col gap-1 font-semibold">
                Decisión
                <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)} className="min-h-12 rounded-xl border border-border-strong px-3">
                  {resolutionsFor(file.kind).map((r) => (
                    <option key={r} value={r}>
                      {RESOLUTION_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs">Al registrar se pide una reverificación de un solo uso. Si cambia la titularidad, un segundo administrador distinto debe confirmarla.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || reason.trim() === ''} aria-describedby="dispute-reason-help" className={PRIMARY} onClick={() => void act(() => resolveDispute(file.disputeId, resolution, reason), 'Decisión registrada.')}>
                  Registrar decisión
                </button>
                <button type="button" disabled={busy || reason.trim() === '' || file.freezeExtensionGranted === true} aria-describedby={file.freezeExtensionGranted === true ? 'dispute-extend-help' : 'dispute-reason-help'} className={OUTLINE} onClick={() => void act(() => extendFreeze(file.disputeId, reason), 'Congelación prorrogada.')}>
                  Prorrogar la congelación (una vez)
                </button>
              </div>
              {file.freezeExtensionGranted === true ? (
                <p id="dispute-extend-help" className="text-sm">
                  La congelación ya se prorrogó una vez; no se puede prorrogar de nuevo.
                </p>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 font-semibold">
                  Motivo de cierre sin efecto
                  <select value={moot} onChange={(e) => setMoot(e.target.value as MootReason)} className="min-h-12 rounded-xl border border-border-strong px-3 font-normal">
                    {(file.kind === 'CHIP_APPROPRIATION' ? (['PET_GONE', 'REQUESTER_NOT_ACTIVE'] as const) : (['TARGET_LEFT', 'TARGET_NOT_ACTIVE', 'REQUESTER_NOT_ACTIVE', 'TRIGGER_LOST', 'PET_GONE'] as const)).map((m) => (
                      <option key={m} value={m}>
                        {MOOT_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={busy} className={OUTLINE} onClick={() => void act(() => closeMoot(file.disputeId, moot), 'Caso cerrado sin efecto.')}>
                  Cerrar sin efecto
                </button>
              </div>
            </div>
          ) : null}
          {file.decisionPhase === 'AWAITING_CONFIRMATION' ? (
            <div className="mt-3 grid gap-2">
              <p className="font-semibold">Solo un segundo administrador distinto del resolutor puede confirmar, y debe haber leído antes toda la evidencia.</p>
              <button type="button" disabled={busy || reason.trim() === ''} aria-describedby="dispute-reason-help" className={PRIMARY} onClick={() => void act(() => confirmDispute(file.disputeId, reason), 'Decisión confirmada y ejecutada.')}>
                Confirmar la decisión
              </button>
            </div>
          ) : null}
          {file.decisionPhase === 'SCHEDULED_EXECUTION' ? (
            <div className="mt-3">
              <button type="button" disabled={busy || reason.trim() === ''} aria-describedby="dispute-reason-help" className={OUTLINE} onClick={() => void act(() => cancelExecution(file.disputeId, reason), 'Ejecución cancelada.')}>
                Cancelar la ejecución programada
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
