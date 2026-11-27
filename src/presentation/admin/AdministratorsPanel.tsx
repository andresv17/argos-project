/**
 * Administradores delegados en /admin (T1528, `[GH:#63]`). Solo `SUPER_ADMIN` (raíz o delegado) lo ve; un delegado no ve ni toca a otros `SUPER_ADMIN` y solo la raíz concede o retira
 * `SUPER_ADMIN` (H-6). Alta con correo + confirmación del correo + rol (H-1) y respuesta uniforme (H-4: no dice si el correo ya existe ni si es raíz). Por fila: cambiar rol, desactivar,
 * reactivar, reinvitar (si caducó) y cancelar invitación, cada escritura con `If-Match` (412: se refresca la lista y se avisa). Sin borrado (H-9), sin correo en mensajes de error,
 * mensajes desde los códigos `ERR-ADM11-*`. La interfaz oculta lo no autorizado como comodidad; el servidor decide (REQ-ADM11-003). Confirmación en línea sin ventana modal (patrón de `RegistrationsPanel`).
 *
 * @implements REQ-ADM11-001, REQ-ADM11-002, REQ-ADM11-003, REQ-ADM11-005, REQ-ADM11-007, REQ-ADM11-008, NFR-011-001; SC-011-021..034
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDelegates, inviteDelegate, writeDelegate } from './administrators-api.ts';
import { systemClock, type Clock } from './admin-clock.ts';
import {
  ACTION_DONE,
  ACTION_LABEL,
  CONFIRM_LABEL,
  CONFIRM_QUESTION,
  INVITE_ACCEPTED,
  LIMIT_NOTICE,
  LOAD_FAILED,
  ROLE_LABEL,
  ROW_LIMIT,
  STATUS_LABEL,
  assignableRoles,
  canSeeAdministrators,
  errorMessage,
  isEmailMismatch,
  rowActionLabel,
  rowRoleLabel,
  triggerSelector,
  rowActions,
  statusDetail,
  visibleRows,
  type DelegateView,
  type PlatformRole,
  type RowAction,
  type SelfView,
} from './administrators-view.ts';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';
const BUTTON = `inline-flex min-h-12 min-w-12 w-full items-center justify-center rounded-full border px-5 text-sm font-semibold sm:w-auto ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} border-primary bg-primary text-cream hover:bg-primary-hover`;
const OUTLINE = `${BUTTON} border-primary bg-white text-primary hover:bg-meadow`;
const DANGER_OUTLINE = `${BUTTON} border-danger bg-white text-danger hover:bg-red-50`;
const DANGER = `${BUTTON} border-danger bg-danger text-white hover:bg-red-800`;
const FIELD = `min-h-12 w-full rounded-lg border border-slate-500 bg-white px-3 text-base text-text-primary ${FOCUS_RING}`;

export interface InviteForm {
  readonly email: string;
  readonly emailConfirmation: string;
  readonly role: PlatformRole;
}
export interface PanelMessage {
  readonly kind: 'ok' | 'error';
  readonly text: string;
}
export interface Confirming {
  readonly id: string;
  readonly action: 'DISABLE' | 'CANCEL_INVITATION';
}
export interface AdministratorsViewProps {
  readonly self: SelfView;
  readonly items: readonly DelegateView[];
  readonly activeCount: number;
  readonly activeLimit: number;
  readonly nowMs: number;
  readonly listState: 'loading' | 'ready' | 'error';
  readonly message: PanelMessage | null;
  readonly busy: boolean;
  readonly confirming: Confirming | null;
  readonly form: InviteForm;
  readonly roleDraft: Readonly<Record<string, PlatformRole>>;
  readonly onForm: (next: InviteForm) => void;
  readonly onInvite: () => void;
  readonly onDraft: (delegateId: string, role: PlatformRole) => void;
  readonly onAction: (row: DelegateView, action: RowAction) => void;
  readonly onConfirm: (row: DelegateView) => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly headingRef?: React.RefObject<HTMLHeadingElement>;
  readonly confirmRef?: React.RefObject<HTMLDivElement>;
}

function RoleSelect(props: { readonly id: string; readonly label: string; readonly ariaLabel?: string; readonly value: PlatformRole; readonly roles: readonly PlatformRole[]; readonly onChange: (role: PlatformRole) => void }): JSX.Element {
  const { id, label, ariaLabel, value, roles, onChange } = props;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <select id={id} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value as PlatformRole)} className={FIELD}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Vista pura (sin efectos): recibe todo por props, de modo que se puede renderizar de forma estática en las pruebas. */
export function AdministratorsView(props: AdministratorsViewProps): JSX.Element | null {
  const { self, items, activeCount, activeLimit, nowMs, listState, message, busy, confirming, form, roleDraft } = props;
  if (!canSeeAdministrators(self)) return null;
  const roles = assignableRoles(self);
  const rows = visibleRows(self, items);
  const limitReached = items.length >= ROW_LIMIT;
  const mismatch = isEmailMismatch(form, message);
  return (
    <section aria-labelledby="administrators-heading" className="mt-6 max-w-3xl rounded-2xl border border-slate-300 bg-white p-5 sm:p-6">
      <h2 id="administrators-heading" ref={props.headingRef} tabIndex={-1} className="break-words text-lg font-semibold text-text-primary focus:outline-none">
        Administradores
      </h2>
      <p className="mt-2 text-base text-text-primary">
        {self.isRoot ? 'Eres el administrador raíz: puedes conceder y retirar el rol de super-administrador.' : 'Puedes gestionar a operadores y a personal de soporte.'}
      </p>
      <p data-testid="active-count" className="mt-1 text-sm text-text-muted">
        Cupos en uso: {activeCount} de {activeLimit}
      </p>

      <form
        aria-labelledby="invite-heading"
        className="mt-5 grid gap-4 rounded-xl border border-slate-300 bg-cream p-4"
        onSubmit={(event) => {
          event.preventDefault();
          props.onInvite();
        }}
      >
        <h3 id="invite-heading" className="text-base font-semibold text-text-primary">
          Invitar a un administrador
        </h3>
        <div className="grid gap-1">
          <label htmlFor="adm-email" className="text-sm font-medium text-text-primary">
            Correo de Google
          </label>
          <input id="adm-email" name="email" type="email" autoComplete="off" required value={form.email} onChange={(event) => props.onForm({ ...form, email: event.target.value })} className={FIELD} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="adm-email-confirm" className="text-sm font-medium text-text-primary">
            Repite el correo
          </label>
          <input
            id="adm-email-confirm"
            name="emailConfirmation"
            type="email"
            autoComplete="off"
            required
            aria-invalid={mismatch ? 'true' : undefined}
            aria-describedby={mismatch ? 'admin-error' : undefined}
            value={form.emailConfirmation}
            onChange={(event) => props.onForm({ ...form, emailConfirmation: event.target.value })}
            className={FIELD}
          />
        </div>
        <RoleSelect id="adm-role" label="Rol" value={form.role} roles={roles} onChange={(role) => props.onForm({ ...form, role })} />
        <p className="text-sm text-text-primary">No se envía correo: la persona entra por /admin con Google y tiene 72 horas para hacerlo.</p>
        <div>
          <button type="submit" aria-disabled={busy || limitReached ? 'true' : undefined} className={`${PRIMARY} ${busy || limitReached ? 'opacity-70' : ''}`}>
            {busy ? 'Enviando…' : 'Invitar'}
          </button>
        </div>
      </form>

      <div role="status" className="sr-only">
        {message?.kind === 'ok' ? message.text : ''}
      </div>
      {message?.kind === 'error' ? (
        <div id="admin-error" role="alert" data-testid="admin-error" className="mt-3 text-sm font-medium text-danger">
          {message.text}
        </div>
      ) : null}
      {message?.kind === 'ok' ? (
        <p data-testid="admin-ok" className="mt-3 text-sm font-medium text-text-primary">
          {message.text}
        </p>
      ) : null}
      {limitReached ? (
        <p data-testid="row-limit" role="note" className="mt-3 rounded-lg border border-danger bg-red-50 px-3 py-2 text-sm font-medium text-danger">
          {LIMIT_NOTICE}
        </p>
      ) : null}

      <div className="mt-5" aria-busy={listState === 'loading' ? 'true' : undefined}>
        {listState === 'loading' ? <p className="text-base text-text-primary">Cargando administradores…</p> : null}
        {listState === 'error' ? (
          <div role="alert" className="grid gap-3">
            <p className="text-sm font-medium text-danger">{LOAD_FAILED}</p>
            <button type="button" className={OUTLINE} onClick={props.onRetry}>
              Reintentar
            </button>
          </div>
        ) : null}
        {listState === 'ready' && rows.length === 0 ? <p className="text-base text-text-primary">Aún no hay administradores delegados.</p> : null}
        {listState === 'ready' && rows.length > 0 ? (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label="Administradores delegados">
            {rows.map((row) => {
              const actions = rowActions(self, row, nowMs);
              const active = confirming !== null && confirming.id === row.delegateId ? confirming : null;
              const draft = roleDraft[row.delegateId] ?? row.role;
              const rowRoles = roles.includes(row.role) ? roles : [row.role, ...roles];
              const needsRole = actions.includes('SAVE_ROLE') || actions.includes('REACTIVATE');
              return (
                <li key={row.delegateId} data-testid="admin-row" className="rounded-xl border border-slate-300 bg-white p-4">
                  <p className="break-words text-base font-semibold text-text-primary">{row.email}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    <span data-testid="row-status">{STATUS_LABEL[row.status]}</span> · {ROLE_LABEL[row.role]}
                    {row.delegateId === self.delegateId ? ' · Tú' : ''}
                  </p>
                  {statusDetail(row, nowMs) !== '' ? <p className="mt-1 text-sm text-text-muted">{statusDetail(row, nowMs)}</p> : null}
                  {active !== null ? (
                    <div ref={props.confirmRef} role="group" tabIndex={-1} aria-labelledby={`adm-confirm-${row.delegateId}`} className={`mt-3 rounded-lg border border-slate-300 bg-cream p-3 ${FOCUS_RING}`}>
                      <p id={`adm-confirm-${row.delegateId}`} className="text-base font-semibold text-text-primary">
                        {CONFIRM_QUESTION[active.action]}
                      </p>
                      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                        <button type="button" aria-disabled={busy ? 'true' : undefined} className={`${DANGER} ${busy ? 'opacity-70' : ''}`} onClick={() => props.onConfirm(row)}>
                          {busy ? 'Guardando…' : CONFIRM_LABEL[active.action]}
                        </button>
                        <button type="button" aria-label={`Cancelar: ${row.email}`} aria-disabled={busy ? 'true' : undefined} className={OUTLINE} onClick={props.onCancel}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : actions.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {needsRole ? <RoleSelect id={`adm-role-${row.delegateId}`} label={row.status === 'DISABLED' ? 'Rol al reactivar' : 'Rol'} ariaLabel={rowRoleLabel(row)} value={draft} roles={rowRoles} onChange={(role) => props.onDraft(row.delegateId, role)} /> : null}
                      <div className="grid gap-2 sm:flex sm:flex-wrap">
                        {actions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            data-action={action}
                            data-row-id={row.delegateId}
                            aria-label={rowActionLabel(action, row)}
                            aria-disabled={busy ? 'true' : undefined}
                            className={`${action === 'DISABLE' || action === 'CANCEL_INVITATION' ? DANGER_OUTLINE : action === 'SAVE_ROLE' ? OUTLINE : PRIMARY} ${busy ? 'opacity-70' : ''}`}
                            onClick={() => props.onAction(row, action)}
                          >
                            {ACTION_LABEL[action]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function AdministratorsPanel({ self, onSessionLost: onSessionLostProp, clock = systemClock }: { readonly self: SelfView | null; readonly onSessionLost: () => void; readonly clock?: Clock }): JSX.Element | null {
  const lostRef = useRef(onSessionLostProp);
  lostRef.current = onSessionLostProp;
  const onSessionLost = useCallback((): void => lostRef.current(), []);
  const visible = canSeeAdministrators(self);
  const [items, setItems] = useState<readonly DelegateView[]>([]);
  const [counts, setCounts] = useState({ activeCount: 0, activeLimit: 20 });
  const [nowMs, setNowMs] = useState(() => clock());
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [form, setForm] = useState<InviteForm>({ email: '', emailConfirmation: '', role: 'SUPPORT' });
  const [roleDraft, setRoleDraft] = useState<Readonly<Record<string, PlatformRole>>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  /** Disparador de la confirmación en línea (el botón original se desmonta al abrirla, así que se recuerda su fila y acción y se re-localiza al cancelar). */
  const triggerRef = useRef<{ readonly id: string; readonly action: string } | null>(null);
  const [restoreFocus, setRestoreFocus] = useState(0);

  const load = useCallback(
    async (quiet: boolean): Promise<void> => {
      if (!quiet) setListState('loading');
      const result = await fetchDelegates();
      if (result.kind === 'OK') {
        setItems(result.value.items);
        setCounts({ activeCount: result.value.activeCount, activeLimit: result.value.activeLimit });
        setNowMs(clock());
        setRoleDraft({});
        setListState('ready');
      } else if (result.kind === 'SESSION_LOST') onSessionLost();
      else if (!quiet) setListState('error');
    },
    [onSessionLost, clock],
  );

  useEffect(() => {
    if (visible) void load(false);
  }, [visible, load]);

  useEffect(() => {
    if (confirming !== null) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (restoreFocus === 0 || confirming !== null) return;
    const trigger = triggerRef.current;
    if (trigger !== null) document.querySelector<HTMLElement>(triggerSelector(trigger.id, trigger.action))?.focus();
  }, [restoreFocus, confirming]);

  if (self === null || !visible) return null;

  const failure = async (code: string | null, status: number): Promise<void> => {
    setMessage({ kind: 'error', text: errorMessage(status === 412 ? 'ERR-ADM11-PRECONDITION-FAILED' : code) });
    // 412 o fila desaparecida: se refresca la lista (etag nuevo) para que el siguiente intento use el estado vigente.
    if (status === 412 || code === 'ERR-ADM11-PRECONDITION-FAILED' || code === 'ERR-ADM11-DELEGATE-NOT-FOUND') await load(true);
    headingRef.current?.focus();
  };

  const run = async (row: DelegateView, action: RowAction): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await writeDelegate(row, action, roleDraft[row.delegateId] ?? row.role);
    setBusy(false);
    setConfirming(null);
    if (result.kind === 'SESSION_LOST') return onSessionLost();
    if (result.kind === 'ERROR') return failure(result.code, result.status);
    setMessage({ kind: 'ok', text: ACTION_DONE[action] });
    await load(true);
    headingRef.current?.focus();
  };

  const invite = async (): Promise<void> => {
    if (busy) return;
    setMessage(null);
    if (form.email.trim().toLowerCase() !== form.emailConfirmation.trim().toLowerCase()) {
      setMessage({ kind: 'error', text: errorMessage('ERR-ADM11-EMAIL-CONFIRMATION-MISMATCH') });
      return;
    }
    setBusy(true);
    const result = await inviteDelegate(form.email.trim(), form.emailConfirmation.trim(), form.role);
    setBusy(false);
    if (result.kind === 'SESSION_LOST') return onSessionLost();
    if (result.kind === 'ERROR') return failure(result.code, result.status);
    setForm({ email: '', emailConfirmation: '', role: form.role });
    setMessage({ kind: 'ok', text: INVITE_ACCEPTED });
    await load(true);
  };

  return (
    <AdministratorsView
      self={self}
      items={items}
      activeCount={counts.activeCount}
      activeLimit={counts.activeLimit}
      nowMs={nowMs}
      listState={listState}
      message={message}
      busy={busy}
      confirming={confirming}
      form={form}
      roleDraft={roleDraft}
      onForm={setForm}
      onInvite={() => void invite()}
      onDraft={(delegateId, role) => setRoleDraft((current) => ({ ...current, [delegateId]: role }))}
      onAction={(row, action) => (action === 'DISABLE' || action === 'CANCEL_INVITATION' ? (triggerRef.current = { id: row.delegateId, action }, setConfirming({ id: row.delegateId, action })) : void run(row, action))}
      onConfirm={(row) => void run(row, confirming?.action ?? 'DISABLE')}
      onCancel={() => {
        setConfirming(null);
        setRestoreFocus((n) => n + 1);
      }}
      onRetry={() => void load(false)}
      headingRef={headingRef}
      confirmRef={confirmRef}
    />
  );
}
