/**
 * Solicitudes de registro en /admin (T1250, `[GH:#18]`). Al entrar muestra el contador de cuentas PENDING (con aviso si el servidor dice que se superó el umbral, D9-25) y las solicitudes
 * paginadas por cursor, ordenadas por fecha de solicitud (el orden lo fija el servidor), con usuario, método y fecha. Aprobar y rechazar piden confirmación en línea (sin ventana modal:
 * el foco pasa al bloque de confirmación y vuelve al botón de origen al cancelar). Sin correo ni `sub`. No toca la UX de usuarios.
 *
 * @implements REQ-APR9-005, NFR-009-001; SC-009-006, SC-009-008
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decideRegistration,
  fetchPendingCount,
  fetchRegistrations,
  type DecisionAction,
  type PendingCount,
  type RegistrationItem,
} from './registrations-api.ts';
import {
  ACTION_LABEL,
  CONFIRM_HINT,
  CONFIRM_LABEL,
  DECISION_FAILED,
  DECISION_NOT_FOUND,
  LOAD_FAILED,
  METHOD_LABEL,
  WARNING_TEXT,
  confirmQuestion,
  decisionDone,
  formatRequestedAt,
  pendingCountText,
} from './registrations-view.ts';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const BUTTON = `inline-flex min-h-12 w-full items-center justify-center rounded-full border px-5 text-sm font-semibold sm:w-auto ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} border-primary bg-primary text-white hover:bg-primary-hover`;
const OUTLINE = `${BUTTON} border-primary bg-white text-primary hover:bg-meadow`;
const DANGER_OUTLINE = `${BUTTON} border-danger bg-white text-danger hover:bg-red-50`;
const DANGER = `${BUTTON} border-danger bg-danger text-white hover:bg-red-800`;

type ListState = 'loading' | 'ready' | 'error';
interface Confirming {
  readonly id: string;
  readonly action: DecisionAction;
}

export function RegistrationsPanel({ onSessionLost: onSessionLostProp }: { readonly onSessionLost: () => void }): JSX.Element {
  // Referencia estable: una función nueva en cada render del padre no debe volver a pedir los datos.
  const lostRef = useRef(onSessionLostProp);
  lostRef.current = onSessionLostProp;
  const onSessionLost = useCallback((): void => lostRef.current(), []);
  const [count, setCount] = useState<PendingCount | null>(null);
  const [countError, setCountError] = useState(false);
  const [items, setItems] = useState<readonly RegistrationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<ListState>('loading');
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<string | null>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());

  const loadCount = useCallback(async (): Promise<void> => {
    const result = await fetchPendingCount();
    if (result.kind === 'OK') {
      setCount(result.value);
      setCountError(false);
    } else if (result.kind === 'SESSION_LOST') onSessionLost();
    else setCountError(true);
  }, [onSessionLost]);

  const loadFirstPage = useCallback(async (): Promise<void> => {
    setListState('loading');
    const result = await fetchRegistrations(null);
    if (result.kind === 'OK') {
      setItems(result.value.items);
      setNextCursor(result.value.nextCursor);
      setListState('ready');
    } else if (result.kind === 'SESSION_LOST') onSessionLost();
    else setListState('error');
  }, [onSessionLost]);

  useEffect(() => {
    void loadCount();
    void loadFirstPage();
  }, [loadCount, loadFirstPage]);

  useEffect(() => {
    if (confirming !== null) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (confirming === null && restoreFocus.current !== null) {
      const key = restoreFocus.current;
      restoreFocus.current = null;
      actionButtons.current.get(key)?.focus();
    }
  }, [confirming]);

  const loadMore = async (): Promise<void> => {
    if (moreBusy || nextCursor === null) return;
    setMoreBusy(true);
    setMoreError(false);
    const result = await fetchRegistrations(nextCursor);
    setMoreBusy(false);
    if (result.kind === 'OK') {
      setItems((current) => {
        const seen = new Set(current.map((item) => item.registrationId));
        return [...current, ...result.value.items.filter((item) => !seen.has(item.registrationId))];
      });
      setNextCursor(result.value.nextCursor);
    } else if (result.kind === 'SESSION_LOST') onSessionLost();
    else setMoreError(true);
  };

  const cancel = (): void => {
    if (busy || confirming === null) return;
    restoreFocus.current = `${confirming.id}:${confirming.action}`;
    setConfirming(null);
  };

  const decide = async (item: RegistrationItem, action: DecisionAction): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await decideRegistration(item.registrationId, action);
    setBusy(false);
    if (result.kind === 'SESSION_LOST') {
      onSessionLost();
      return;
    }
    if (result.kind === 'FAILED') {
      setMessage({ kind: 'error', text: DECISION_FAILED });
      return;
    }
    setConfirming(null);
    setItems((current) => current.filter((candidate) => candidate.registrationId !== item.registrationId));
    setMessage(result.kind === 'OK' ? { kind: 'ok', text: decisionDone(action, item.username) } : { kind: 'error', text: DECISION_NOT_FOUND });
    void loadCount();
    headingRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') cancel();
  };

  return (
    <section aria-labelledby="registrations-heading" className="max-w-3xl rounded-2xl border border-slate-300 bg-white p-5 sm:p-6">
      <h2 id="registrations-heading" ref={headingRef} tabIndex={-1} className="break-words text-lg font-semibold text-text-primary focus:outline-none">
        Solicitudes de registro
      </h2>
      {countError ? (
        <p className="mt-2 text-base text-text-primary">No se pudo cargar el contador de pendientes.</p>
      ) : count === null ? (
        <p className="mt-2 text-base text-text-primary">Cargando contador…</p>
      ) : (
        <p data-testid="pending-count" className="mt-2 text-base font-semibold text-text-primary">
          {pendingCountText(count.pending)}
        </p>
      )}
      {count?.warning ? (
        <p data-testid="pending-warning" className="mt-2 rounded-lg border border-danger bg-red-50 px-3 py-2 text-sm font-medium text-danger">
          {WARNING_TEXT}
        </p>
      ) : null}

      <div role="status" className="sr-only">
        {message?.kind === 'ok' ? message.text : ''}
      </div>
      {message?.kind === 'error' ? (
        <div role="alert" className="mt-3 text-sm font-medium text-danger">
          {message.text}
        </div>
      ) : null}

      <div className="mt-4" aria-busy={listState === 'loading' ? 'true' : undefined} onKeyDown={onKeyDown}>
        {listState === 'loading' ? <p className="text-base text-text-primary">Cargando solicitudes…</p> : null}
        {listState === 'error' ? (
          <div role="alert" className="grid gap-3">
            <p className="text-sm font-medium text-danger">{LOAD_FAILED}</p>
            <button type="button" className={OUTLINE} onClick={() => void loadFirstPage()}>
              Reintentar
            </button>
          </div>
        ) : null}
        {listState === 'ready' && items.length === 0 ? <p className="text-base text-text-primary">No hay solicitudes por revisar.</p> : null}
        {listState === 'ready' && items.length > 0 ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label="Solicitudes por fecha de solicitud, de la más antigua a la más reciente">
            {items.map((item, index) => {
              const active = confirming !== null && confirming.id === item.registrationId ? confirming : null;
              return (
                <li key={item.registrationId} className="rounded-xl border border-slate-300 bg-white p-4">
                  <p className="break-words text-base font-semibold text-text-primary">{item.username}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Método: {METHOD_LABEL[item.method]} · Solicitada el <time dateTime={item.requestedAt}>{formatRequestedAt(item.requestedAt)}</time>
                  </p>
                  {active === null ? (
                    <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                      {(['approve', 'reject'] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          ref={(node) => {
                            const key = `${item.registrationId}:${action}`;
                            if (node === null) actionButtons.current.delete(key);
                            else actionButtons.current.set(key, node);
                          }}
                          aria-label={`${ACTION_LABEL[action]} solicitud de ${item.username}`}
                          disabled={confirming !== null}
                          className={`${action === 'approve' ? PRIMARY : DANGER_OUTLINE} disabled:cursor-not-allowed disabled:opacity-60`}
                          onClick={() => setConfirming({ id: item.registrationId, action })}
                        >
                          {ACTION_LABEL[action]}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div ref={confirmRef} role="group" tabIndex={-1} aria-labelledby={`confirm-${index}`} className="mt-3 rounded-lg border border-slate-300 bg-cream p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <p id={`confirm-${index}`} className="break-words text-base font-semibold text-text-primary">
                        {confirmQuestion(active.action, item.username)}
                      </p>
                      <p className="mt-1 text-sm text-text-primary">{CONFIRM_HINT[active.action]}</p>
                      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                        <button type="button" aria-disabled={busy ? 'true' : undefined} className={`${active.action === 'approve' ? PRIMARY : DANGER} ${busy ? 'opacity-70' : ''}`} onClick={() => void decide(item, active.action)}>
                          {busy ? 'Guardando…' : CONFIRM_LABEL[active.action]}
                        </button>
                        <button type="button" aria-disabled={busy ? 'true' : undefined} className={OUTLINE} onClick={cancel}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {listState === 'ready' && nextCursor !== null ? (
          <div className="mt-4">
            <button type="button" aria-disabled={moreBusy ? 'true' : undefined} className={OUTLINE} onClick={() => void loadMore()}>
              {moreBusy ? 'Cargando…' : 'Cargar más solicitudes'}
            </button>
            {moreError ? (
              <div role="alert" className="mt-2 text-sm font-medium text-danger">
                {LOAD_FAILED}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
