/**
 * Pestaña «Modo Cuidador» de la ficha (Feature 012, Bloque C, #26; T1656; REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-005, REQ-CAR12-008). Tres bloques: (1) «Hoy» para todo el que puede ver
 * el cuidado: pendientes del día en hora de Bogotá, instrucciones, registrar y revertir, conflicto visible, advertencia de doble toma y aviso de límites; (2) «Rutinas» y (3) «Niveles de cuidadores»
 * solo para titulares (propietario principal y co-propietario ACTIVE). La interfaz usa `access/me` para mostrar u ocultar acciones, pero el servidor decide en cada escritura; los códigos de error se
 * traducen a texto sin repetir datos del servidor. `VIEW_ONLY` no se presenta como «solo lectura» general (EDGE-012-049).
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CareApiError,
  careProblemMessage,
  createCareApi,
  type CareApi,
  type CareKind,
  type CareOccurrenceView,
  type CareRoutineView,
  type CareTodayView,
  type CaregiverAccessView,
  type CaregiverLevel,
  type DoseUnit,
  type MyCareAccessView,
  type RoutineInput,
} from '../care-api.ts';
import {
  CARE_LIMITS_NOTICE,
  REVERT_FORBIDDEN_TEXT,
  TIMEZONE_INLINE,
  canOfferRevert,
  CARE_NO_REMINDERS_NOTICE,
  DOSE_DISCLAIMER,
  DOUBLE_DOSE_WARNING,
  KIND_LABEL,
  LEVEL_LABEL,
  STATE_LABEL,
  TIMEZONE_LABEL,
  UNIT_LABEL,
  WEEKDAYS,
  conflictText,
  doseText,
  groupByTime,
  levelDescription,
  parseTimes,
} from '../care-view.ts';
import { browserRenewal } from '../browser-scheduler.ts';
import { useSession } from '../session.tsx';
import type { FieldErrors } from '../validation.ts';
import { Button, CheckboxField, TextField } from './Field.tsx';

const messageOf = (error: unknown): string =>
  error instanceof CareApiError ? careProblemMessage(error.code, error.field, error.retryAfterSeconds) : careProblemMessage('ERR-INTERNAL-UNEXPECTED');

/** Campos del editor de rutinas que el servidor puede señalar (`field` del 422): el error llega al campo y el foco lo sigue. */
const ROUTINE_FIELD_ID: Readonly<Record<string, string>> = {
  title: 'care-title',
  doseAmount: 'care-dose',
  timesOfDay: 'care-times',
  startDate: 'care-start',
  endDate: 'care-end',
  confirmHighDose: 'care-confirm-dose',
};
/** Mueve el foco al elemento por id; en un campo de fecha (fieldset) entra en su primer segmento. */
const focusId = (id: string): void => {
  const element = document.getElementById(id);
  if (element === null) return;
  if (element instanceof HTMLFieldSetElement) element.querySelector('input')?.focus();
  else element.focus();
};
/** Campos del formulario de niveles que el servidor puede señalar. */
const ACCESS_FIELD_ID: Readonly<Record<string, string>> = { userId: 'care-target', level: 'care-level', careUntil: 'care-until' };
/** Nombre del campo del servidor para cada campo del formulario de rutina. */
const SERVER_FIELD: Readonly<Record<string, string>> = { times: 'timesOfDay' };
/** Error de un campo suelto (selector) enlazado con `aria-describedby`. */
function FieldNote({ id, text }: { readonly id: string; readonly text: string | undefined }): JSX.Element | null {
  return text === undefined ? null : <p id={`${id}-error`} className="text-sm text-red-800">{text}</p>;
}
const SELECT_CLASS = 'min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota';
const TEXTAREA_CLASS = 'min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota';

/** Regiones live persistentes (montadas vacías y luego llenadas): WCAG 4.1.3. */
function LiveRegions({ error, notice }: { readonly error: string | null; readonly notice: string | null }): JSX.Element {
  return (
    <>
      <div role="alert">{error === null ? null : <p className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}</div>
      <div role="status" aria-live="polite">{notice === null ? null : <p className="rounded-2xl border border-primary bg-meadow px-4 py-3 text-sm text-slate-900">{notice}</p>}</div>
    </>
  );
}

type Pending = { readonly key: string; readonly mode: 'skip' | 'revert' } | null;
/** Resultado de una acción: `ok`; `error` (el formulario sigue abierto con la nota); `closed` (la acción ya no aplica: el formulario se cierra). */
type ActionResult = 'ok' | 'error' | 'closed';

/** Un pendiente del día con sus acciones. */
function OccurrenceCard({ occ, access, busy, pending, onPending, onLog, onRevert, petId, errorText }: {
  readonly occ: CareOccurrenceView;
  readonly access: MyCareAccessView;
  readonly busy: boolean;
  readonly pending: Pending;
  readonly onPending: (next: Pending) => void;
  readonly onLog: (occ: CareOccurrenceView, status: 'DONE' | 'SKIPPED', note: string) => Promise<ActionResult>;
  readonly onRevert: (occ: CareOccurrenceView, reason: string) => Promise<ActionResult>;
  readonly petId: string;
  readonly errorText: string | null;
}): JSX.Element {
  const key = `${occ.routineId}|${occ.occurrenceTime}`;
  const [text, setText] = useState('');
  const open = pending !== null && pending.key === key ? pending.mode : null;
  const entry = occ.logEntry;
  const dose = doseText(occ.doseAmount, occ.doseUnit);
  const warnId = `care-warn-${petId}-${key.replace(/[^0-9a-zA-Z]/g, '')}`;
  const isMedication = occ.kind === 'MEDICATION';
  const canAct = access.canLogCare && entry === null;
  // La interfaz no ofrece lo que el servidor rechaza: el autor no titular solo deshace dentro de 10 minutos (care-log.ts `assertCanRevert`).
  const canRevert = canOfferRevert({ canLogCare: access.canLogCare, canManageRoutines: access.canManageRoutines, entry, nowMs: browserRenewal.now() });
  const labelId = `${warnId}-label`;
  const cardId = `${warnId}-card`;
  const skipId = `${warnId}-skip`;
  const revertId = `${warnId}-revert`;
  const textId = `${warnId}-text`;
  const isOpen = open === 'skip' ? canAct : open === 'revert' ? canRevert : false;
  // WCAG 2.4.3: al abrir un formulario el foco entra en su primer campo.
  useEffect(() => {
    if (open !== null) focusId(textId);
  }, [open, textId]);
  const settle = (result: ActionResult): void => {
    if (result !== 'error') focusId(cardId); // el disparador desaparece: el foco queda en la tarjeta, que es estable
  };
  return (
    <li id={cardId} tabIndex={-1} className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota" aria-labelledby={labelId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={labelId} className="text-base font-semibold text-slate-900">
          {`${KIND_LABEL[occ.kind]}: ${occ.title}`}
          {dose === null ? '' : ` · ${dose}`}
        </p>
        <p className="text-sm font-semibold text-slate-900">{`Estado: ${STATE_LABEL[occ.state]}`}</p>
      </div>
      {occ.instructions === null || occ.instructions === '' ? null : <p className="text-sm text-slate-800">{`Instrucciones: ${occ.instructions}`}</p>}
      {entry === null ? null : (
        <p className="text-sm text-slate-800">
          {`${entry.status === 'DONE' ? 'Hecho' : 'Omitido'}${entry.late ? ' con retraso' : ''}`}
          {entry.performedByDisplayName === null ? '' : ` por ${entry.performedByDisplayName}`}
          {entry.note === '' ? '' : `. Nota: ${entry.note}`}
        </p>
      )}
      {canAct ? (
        <div className="grid gap-2">
          {isMedication ? <p id={warnId} className="text-sm font-semibold text-slate-900">{DOUBLE_DOSE_WARNING}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} {...(isMedication ? { describedBy: warnId } : {})} ariaLabel={`Marcar como hecho: ${occ.title} de las ${occ.occurrenceTime}`} onClick={() => void onLog(occ, 'DONE', '').then(settle)}>
              Marcar como hecho
            </Button>
            <Button id={skipId} variant="secondary" disabled={busy} ariaLabel={`Omitir: ${occ.title} de las ${occ.occurrenceTime}`} onClick={() => { setText(''); onPending({ key, mode: 'skip' }); }}>
              Omitir
            </Button>
          </div>
        </div>
      ) : null}
      {canRevert ? (
        <div>
          <Button id={revertId} variant="secondary" disabled={busy} ariaLabel={`Deshacer el registro: ${occ.title} de las ${occ.occurrenceTime}`} onClick={() => { setText(''); onPending({ key, mode: 'revert' }); }}>
            Deshacer el registro
          </Button>
        </div>
      ) : null}
      {open === null || !isOpen ? null : (
        <form
          className="grid gap-2 rounded-xl border border-border-strong bg-white p-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void (open === 'skip' ? onLog(occ, 'SKIPPED', text.trim()) : onRevert(occ, text.trim())).then(settle);
          }}
        >
          <label htmlFor={textId} className="text-sm font-semibold text-slate-900">
            {open === 'skip'
              ? isMedication ? 'Nota (obligatoria al omitir una medicina)' : 'Nota (opcional)'
              : access.canManageRoutines ? 'Motivo (obligatorio pasados 10 minutos desde el registro)' : 'Motivo (opcional)'}
          </label>
          <textarea id={textId} value={text} maxLength={140} rows={2} onChange={(e) => setText(e.target.value)} className={TEXTAREA_CLASS} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{open === 'skip' ? 'Confirmar omisión' : 'Confirmar reversión'}</Button>
            <Button variant="secondary" onClick={() => { focusId(open === 'skip' ? skipId : revertId); onPending(null); }}>Cancelar</Button>
          </div>
        </form>
      )}
      {/* El error de la acción aparece junto a ella (WCAG 3.3.1, 4.1.3), no solo arriba fuera de pantalla a 320 px. */}
      <div role="alert">{errorText === null ? null : <p className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{errorText}</p>}</div>
    </li>
  );
}

/** «Hoy»: pendientes del día en hora de Bogotá. */
function TodaySection({ api, petId, access, refreshKey }: { readonly api: CareApi; readonly petId: string; readonly access: MyCareAccessView; readonly refreshKey: number }): JSX.Element {
  const [today, setToday] = useState<CareTodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [actionError, setActionError] = useState<{ readonly key: string; readonly text: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setToday(await api.today(petId));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [api, petId]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  /** Ante un error el formulario NO se cierra ni pierde la nota (M-3); solo se cierra si la acción ya no aplica: la ocurrencia ya fue registrada, o el servidor negó deshacer. */
  const run = async (key: string, work: () => Promise<string>, forbiddenText?: string): Promise<ActionResult> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setActionError(null);
    let result: ActionResult = 'ok';
    try {
      setNotice(await work());
      setPending(null);
    } catch (e) {
      // El conflicto de doble registro es visible: quién, a qué hora y en qué estado (REQ-CAR12-003).
      const conflict = e instanceof CareApiError && e.code === 'ERR-CAR12-ALREADY-LOGGED';
      const forbidden = e instanceof CareApiError && e.code === 'ERR-ACC-FORBIDDEN' && forbiddenText !== undefined;
      setActionError({ key, text: conflict ? conflictText(e.existing) : forbidden ? forbiddenText : messageOf(e) });
      result = conflict || forbidden ? 'closed' : 'error';
      if (result === 'closed') setPending(null);
    } finally {
      setBusy(false);
      await load();
    }
    return result;
  };

  const onLog = (occ: CareOccurrenceView, status: 'DONE' | 'SKIPPED', note: string): Promise<ActionResult> =>
    run(`${occ.routineId}|${occ.occurrenceTime}`, async () => {
      await api.logEntry(petId, { routineId: occ.routineId, occurrenceDate: occ.occurrenceDate, occurrenceTime: occ.occurrenceTime, status, ...(note === '' ? {} : { note }) });
      return status === 'DONE' ? 'Registrado como hecho.' : 'Registrado como omitido.';
    });
  const onRevert = (occ: CareOccurrenceView, reason: string): Promise<ActionResult> => {
    const id = occ.logEntry?.id;
    if (id === undefined) return Promise.resolve('error');
    return run(
      `${occ.routineId}|${occ.occurrenceTime}`,
      async () => {
        await api.revertEntry(petId, id, reason === '' ? undefined : reason);
        return 'Registro deshecho.';
      },
      REVERT_FORBIDDEN_TEXT,
    );
  };

  const description = levelDescription(access);
  return (
    <section aria-labelledby={`care-today-${petId}`} className="grid min-w-0 gap-3">
      <h3 id={`care-today-${petId}`} className="text-base font-semibold text-slate-900">Hoy</h3>
      <p className="text-sm text-slate-800">{`${TIMEZONE_LABEL}${today === null ? '' : ` · ${today.date}`}`}</p>
      <p className="text-sm text-slate-800">{`${CARE_LIMITS_NOTICE}. ${CARE_NO_REMINDERS_NOTICE}`}</p>
      {description === null ? null : <p className="text-sm text-slate-800">{description}</p>}
      <LiveRegions error={error} notice={notice} />
      {today === null ? (
        <p className="text-sm text-slate-700">Cargando pendientes…</p>
      ) : today.items.length === 0 ? (
        <p className="text-sm text-slate-700">No hay tareas de cuidado para hoy.</p>
      ) : (
        <div className="grid min-w-0 gap-3">
          {groupByTime(today.items).map((group) => (
            <div key={group.time} className="grid min-w-0 gap-2">
              <h4 className="text-sm font-semibold tabular-nums text-slate-900">{`${group.time} (${TIMEZONE_INLINE})`}</h4>
              <ul className="grid min-w-0 gap-2">
                {group.items.map((occ) => (
                  <OccurrenceCard key={`${occ.routineId}|${occ.occurrenceTime}`} occ={occ} access={access} busy={busy} pending={pending} onPending={setPending} onLog={onLog} onRevert={onRevert} petId={petId} errorText={actionError !== null && actionError.key === `${occ.routineId}|${occ.occurrenceTime}` ? actionError.text : null} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface RoutineForm {
  readonly kind: CareKind;
  readonly title: string;
  readonly instructions: string;
  readonly doseAmount: string;
  readonly doseUnit: DoseUnit;
  readonly times: string;
  readonly days: readonly number[];
  readonly startDate: string;
  readonly endDate: string;
  readonly ongoing: boolean;
}
const EMPTY_FORM: RoutineForm = { kind: 'MEAL', title: '', instructions: '', doseAmount: '', doseUnit: 'MG', times: '', days: [1, 2, 3, 4, 5, 6, 7], startDate: '', endDate: '', ongoing: true };
const formOf = (r: CareRoutineView): RoutineForm => ({
  kind: r.kind,
  title: r.title,
  instructions: r.instructions,
  doseAmount: r.doseAmount === null ? '' : String(r.doseAmount),
  doseUnit: r.doseUnit ?? 'MG',
  times: r.timesOfDay.join(', '),
  days: r.daysOfWeek,
  startDate: r.startDate,
  endDate: r.endDate ?? '',
  ongoing: r.ongoing,
});

/** Editor de rutinas (solo titulares): crear, editar (la dosis, la unidad o el horario crean versión nueva) y desactivar. */
function RoutinesSection({ api, petId, onChanged }: { readonly api: CareApi; readonly petId: string; readonly onChanged: () => void }): JSX.Element {
  const [routines, setRoutines] = useState<readonly CareRoutineView[] | null>(null);
  const [form, setForm] = useState<RoutineForm | null>(null);
  const [editing, setEditing] = useState<CareRoutineView | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState<CareRoutineView | null>(null);
  const [offError, setOffError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setRoutines(await api.listRoutines(petId));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [api, petId]);
  useEffect(() => {
    void load();
  }, [load]);

  // WCAG 2.4.3: al abrir el formulario el foco entra en su primer campo (el selector de tipo al crear, el nombre al editar).
  const formOpenKey = form === null ? null : editing === null ? 'new' : editing.id;
  useEffect(() => {
    if (formOpenKey !== null) focusId(formOpenKey === 'new' ? 'care-kind' : 'care-title');
  }, [formOpenKey]);
  // WCAG 3.3.1: ante un error de campo del servidor el foco va al campo afectado (la casilla de dosis alta aparece con el 422 y recibe el foco).
  useEffect(() => {
    const first = Object.keys(fieldErrors)[0];
    const id = first === undefined ? undefined : ROUTINE_FIELD_ID[first];
    if (id !== undefined) focusId(id);
  }, [fieldErrors]);
  useEffect(() => {
    if (confirmOff !== null) focusId(`care-off-${confirmOff.id}`);
  }, [confirmOff]);

  const close = (): void => {
    setFieldErrors({});
    setForm(null);
    setEditing(null);
    setNeedsConfirm(false);
    setConfirmed(false);
    headingRef.current?.focus();
  };
  const clearFieldError = (name: string): void =>
    setFieldErrors((current) => {
      if (!(name in current)) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  const set = <K extends keyof RoutineForm>(key: K, value: RoutineForm[K]): void => {
    clearFieldError(SERVER_FIELD[key] ?? key);
    setForm((f) => (f === null ? f : { ...f, [key]: value }));
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (form === null) return;
    const isMed = form.kind === 'MEDICATION';
    const input: RoutineInput = {
      ...(editing === null ? { kind: form.kind } : { expectedVersion: editing.version }),
      title: form.title.trim(),
      instructions: form.instructions.trim(),
      doseAmount: isMed && form.doseAmount.trim() !== '' ? Number(form.doseAmount.replace(',', '.')) : null,
      doseUnit: isMed ? form.doseUnit : null,
      timesOfDay: parseTimes(form.times),
      daysOfWeek: form.days,
      startDate: form.startDate,
      endDate: form.ongoing || form.endDate === '' ? null : form.endDate,
      ongoing: form.ongoing,
      ...(confirmed ? { confirmHighDose: true } : {}),
    };
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      if (editing === null) {
        await api.createRoutine(petId, input);
        setNotice('Rutina creada.');
      } else {
        const result = await api.updateRoutine(petId, editing.id, input);
        setNotice(result.versioned ? 'Rutina actualizada. El cambio rige desde ahora: las tomas anteriores conservan la dosis que tenían.' : 'Rutina actualizada.');
      }
      close();
      onChanged();
    } catch (e) {
      const field = e instanceof CareApiError && e.code === 'ERR-SCHEMA-VALIDATION-FAILED' ? e.field : null;
      if (field !== null && field in ROUTINE_FIELD_ID) {
        // El error llega al campo afectado (aria-invalid + aria-describedby) y el formulario conserva lo escrito.
        if (field === 'confirmHighDose') setNeedsConfirm(true);
        setFieldErrors({ [field]: messageOf(e) });
      } else {
        if (e instanceof CareApiError && e.code === 'ERR-CAR12-ROUTINE-STALE') close();
        setError(messageOf(e));
      }
    } finally {
      setBusy(false);
      await load();
    }
  };

  const deactivate = async (routine: CareRoutineView): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setOffError(null);
    try {
      await api.deactivateRoutine(petId, routine.id, routine.version);
      setNotice(`Rutina «${routine.title}» desactivada. Las tomas anteriores se conservan en el registro.`);
      setConfirmOff(null);
      headingRef.current?.focus(); // la fila desaparece con su botón: el foco queda en el encabezado de la sección
      onChanged();
    } catch (e) {
      // El error aparece dentro de la confirmación, junto al botón que falló, y la confirmación sigue abierta.
      setOffError(messageOf(e));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const errors: FieldErrors = fieldErrors;
  return (
    <section aria-labelledby={`care-routines-${petId}`} className="grid min-w-0 gap-3">
      <h3 id={`care-routines-${petId}`} ref={headingRef} tabIndex={-1} className="text-base font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota">Rutinas de cuidado</h3>
      <LiveRegions error={form === null ? error : null} notice={notice} />
      {routines === null ? (
        <p className="text-sm text-slate-700">Cargando rutinas…</p>
      ) : routines.length === 0 ? (
        <p className="text-sm text-slate-700">Todavía no hay rutinas. Crea la primera: una medicina, una comida o un paseo.</p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {routines.map((r) => (
            <li key={r.id} className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3">
              <p className="text-sm font-semibold text-slate-900">
                {`${KIND_LABEL[r.kind]}: ${r.title}`}
                {doseText(r.doseAmount, r.doseUnit) === null ? '' : ` · ${doseText(r.doseAmount, r.doseUnit)}`}
              </p>
              <p className="text-sm tabular-nums text-slate-800">{`${r.timesOfDay.join(', ')} (${TIMEZONE_INLINE}) · ${r.daysOfWeek.length === 7 ? 'todos los días' : r.daysOfWeek.map((d) => WEEKDAYS[d - 1]?.label.slice(0, 3)).join(', ')}`}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} ariaLabel={`Editar la rutina ${r.title}`} onClick={() => { setError(null); setNotice(null); setEditing(r); setForm(formOf(r)); setNeedsConfirm(false); setConfirmed(false); setFieldErrors({}); }}>
                  Editar
                </Button>
                <Button id={`care-off-btn-${r.id}`} variant="secondary" disabled={busy} ariaLabel={`Desactivar la rutina ${r.title}`} onClick={() => { setOffError(null); setConfirmOff(r); }}>
                  Desactivar
                </Button>
              </div>
              {confirmOff?.id === r.id ? (
                <div id={`care-off-${r.id}`} tabIndex={-1} role="group" aria-label={`Confirmar la desactivación de ${r.title}`} className="grid gap-2 rounded-xl border border-danger bg-red-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
                  <p className="text-sm text-red-900">{`¿Desactivar «${r.title}»? Dejará de aparecer en los pendientes; los registros anteriores se conservan.`}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" disabled={busy} onClick={() => void deactivate(r)}>Confirmar</Button>
                    <Button variant="secondary" onClick={() => { focusId(`care-off-btn-${r.id}`); setConfirmOff(null); setOffError(null); }}>Cancelar</Button>
                  </div>
                  <div role="alert">{offError === null ? null : <p className="text-sm font-semibold text-red-900">{offError}</p>}</div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {form === null ? (
        <div>
          <Button disabled={busy} onClick={() => { setError(null); setNotice(null); setEditing(null); setForm(EMPTY_FORM); setNeedsConfirm(false); setConfirmed(false); setFieldErrors({}); }}>Nueva rutina</Button>
        </div>
      ) : (
        <form className="grid min-w-0 gap-3 rounded-xl border border-border-strong p-3" onSubmit={(e) => void submit(e)} aria-label={editing === null ? 'Nueva rutina' : `Editar ${editing.title}`}>
          {editing === null ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="care-kind" className="text-sm font-medium text-slate-800">Tipo</label>
              <select id="care-kind" value={form.kind} onChange={(e) => set('kind', e.target.value as CareKind)} className={SELECT_CLASS}>
                {(Object.keys(KIND_LABEL) as CareKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
          ) : null}
          <TextField id="care-title" label="Nombre" name="title" value={form.title} onChange={(_n, v) => set('title', v)} errors={errors} required />
          <div className="flex flex-col gap-1">
            <label htmlFor="care-instructions" className="text-sm font-medium text-slate-800">Instrucciones (opcional)</label>
            <textarea id="care-instructions" value={form.instructions} maxLength={300} rows={3} onChange={(e) => set('instructions', e.target.value)} className={TEXTAREA_CLASS} />
          </div>
          {form.kind === 'MEDICATION' ? (
            <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3">
              <legend className="px-1 text-sm font-semibold text-slate-900">Dosis</legend>
              <p id="care-dose-disclaimer" className="text-sm font-semibold text-slate-900">{DOSE_DISCLAIMER}</p>
              <TextField id="care-dose" label="Cantidad" name="doseAmount" value={form.doseAmount} onChange={(_n, v) => set('doseAmount', v)} errors={errors} inputMode="decimal" required />
              <div className="flex flex-col gap-1">
                <label htmlFor="care-unit" className="text-sm font-medium text-slate-800">Unidad</label>
                <select id="care-unit" value={form.doseUnit} aria-describedby="care-dose-disclaimer" onChange={(e) => set('doseUnit', e.target.value as DoseUnit)} className={SELECT_CLASS}>
                  {(Object.keys(UNIT_LABEL) as DoseUnit[]).map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
              </div>
              {needsConfirm ? (
                <CheckboxField id="care-confirm-dose" label="Confirmo que esta dosis es la indicada por mi veterinario" name="confirmHighDose" checked={confirmed} onChange={(_n, v) => { clearFieldError('confirmHighDose'); setConfirmed(v); }} errors={errors} required />
              ) : null}
            </fieldset>
          ) : null}
          <TextField id="care-times" label="Horas (hora de Bogotá, separadas por coma: 08:00, 20:00)" name="timesOfDay" value={form.times} onChange={(_n, v) => set('times', v)} errors={errors} required />
          <fieldset className="grid min-w-0 gap-1">
            <legend className="text-sm font-medium text-slate-800">Días</legend>
            <div className="flex flex-wrap gap-x-4">
              {WEEKDAYS.map((d) => (
                <CheckboxField key={d.n} id={`care-day-${d.n}`} label={d.label} name={`day${d.n}`} checked={form.days.includes(d.n)} onChange={(_n, v) => set('days', v ? [...form.days, d.n].sort() : form.days.filter((x) => x !== d.n))} errors={errors} />
              ))}
            </div>
          </fieldset>
          <TextField id="care-start" label="Desde" name="startDate" type="date" value={form.startDate} onChange={(_n, v) => set('startDate', v)} errors={errors} required />
          <CheckboxField id="care-ongoing" label="Sin fecha de fin (continua)" name="ongoing" checked={form.ongoing} onChange={(_n, v) => set('ongoing', v)} errors={errors} />
          {form.ongoing ? null : <TextField id="care-end" label="Hasta" name="endDate" type="date" value={form.endDate} onChange={(_n, v) => set('endDate', v)} errors={errors} required={form.kind === 'MEDICATION'} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{editing === null ? 'Crear rutina' : 'Guardar cambios'}</Button>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
          </div>
          {/* El error de guardado aparece junto al botón que lo provocó (WCAG 3.3.1, 4.1.3). */}
          <div role="alert">{error === null ? null : <p className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}</div>
        </form>
      )}
    </section>
  );
}

interface Candidate {
  readonly userId: string;
  readonly username: string;
}

/** Niveles de cuidadores (solo titulares): conceder o cambiar el nivel por mascota y retirarlo. */
function AccessSection({ api, petId }: { readonly api: CareApi; readonly petId: string }): JSX.Element {
  const { api: client } = useSession();
  const [rows, setRows] = useState<readonly CaregiverAccessView[] | null>(null);
  const [candidates, setCandidates] = useState<readonly Candidate[]>([]);
  const [target, setTarget] = useState('');
  const [level, setLevel] = useState<CaregiverLevel>('VIEW_ONLY');
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setRows(await api.listAccess(petId));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [api, petId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Candidatos: cuidadores ACTIVE de los hogares del usuario donde la mascota está asignada (el servidor revalida el destino).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [households, assignments] = await Promise.all([client.GET('/households'), client.GET('/pets/{petId}/assignments', { params: { path: { petId } } })]);
        const assigned = new Set((assignments.data ?? []).map((a) => a.householdId));
        const found = new Map<string, Candidate>();
        for (const view of households.data ?? []) {
          if (!assigned.has(view.household.id)) continue;
          for (const m of view.members) if (m.membership.role === 'CAREGIVER' && m.membership.status === 'ACTIVE') found.set(m.membership.userId, { userId: m.membership.userId, username: m.membership.username });
        }
        if (alive) setCandidates([...found.values()].sort((a, b) => a.username.localeCompare(b.username)));
      } catch {
        // sin candidatos: la lista de niveles ya concedidos sigue funcionando
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, petId]);

  useEffect(() => {
    const first = Object.keys(fieldErrors)[0];
    const id = first === undefined ? undefined : ACCESS_FIELD_ID[first];
    if (id !== undefined) focusId(id);
  }, [fieldErrors]);

  /** `fromForm`: el error de un campo llega al campo y el resto aparece dentro del formulario; el de una fila (retirar) queda arriba, junto a la lista. */
  const run = async (work: () => Promise<string>, fromForm = false): Promise<void> => {
    setBusy(true);
    setError(null);
    setFormError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      setNotice(await work());
    } catch (e) {
      const field = fromForm && e instanceof CareApiError && e.code === 'ERR-SCHEMA-VALIDATION-FAILED' ? e.field : null;
      if (field !== null && field in ACCESS_FIELD_ID) setFieldErrors({ [field]: messageOf(e) });
      else if (fromForm) setFormError(messageOf(e));
      else setError(messageOf(e));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const existing = rows?.find((r) => r.userId === target);
  return (
    <section aria-labelledby={`care-access-${petId}`} className="grid min-w-0 gap-3">
      <h3 id={`care-access-${petId}`} className="text-base font-semibold text-slate-900">Niveles de los cuidadores</h3>
      <p className="text-sm text-slate-800">
        El nivel solo gobierna las rutinas y los registros de cuidado de esta mascota. No cambia lo que el cuidador puede hacer con pesos, medidas, eventos sanitarios, archivos y fotos. Sin nivel, el cuidador solo ve el cuidado.
      </p>
      <LiveRegions error={error} notice={notice} />
      {rows === null ? (
        <p className="text-sm text-slate-700">Cargando niveles…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-700">Ningún cuidador tiene un nivel concedido todavía.</p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {rows.map((r) => (
            <li key={r.userId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border-strong p-3">
              <p className="text-sm text-slate-900">
                <span className="font-semibold">{`@${r.username}`}</span>
                {` · ${LEVEL_LABEL[r.level]}${r.careUntil === null ? '' : ` hasta el ${r.careUntil} (inclusive)`}${r.expired ? ' · vencido' : ''}`}
              </p>
              <Button variant="secondary" disabled={busy} ariaLabel={`Retirar el nivel de @${r.username}`} onClick={() => void run(async () => { await api.removeAccess(petId, r.userId); return `Nivel de @${r.username} retirado.`; })}>
                Retirar nivel
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3"
        aria-label="Conceder o cambiar un nivel"
        onSubmit={(event) => {
          event.preventDefault();
          if (target === '') return;
          void run(async () => {
            await api.setAccess(petId, target, { level, careUntil: until === '' ? null : until, ...(existing === undefined ? {} : { expectedVersion: existing.version }) });
            return 'Nivel guardado. Rige desde la siguiente petición del cuidador.';
          }, true);
        }}
      >
        {candidates.length === 0 && rows?.length === 0 ? <p className="text-sm text-slate-700">Para dar un nivel, el cuidador debe ser miembro activo de un hogar con rol Cuidador y tener esta mascota asignada.</p> : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="care-target" className="text-sm font-medium text-slate-800">Cuidador</label>
          <select id="care-target" value={target} aria-invalid={fieldErrors['userId'] === undefined ? undefined : true} aria-describedby={fieldErrors['userId'] === undefined ? undefined : 'care-target-error'} onChange={(e) => { setTarget(e.target.value); setFieldErrors({}); }} className={SELECT_CLASS}>
            <option value="">Elige un cuidador</option>
            {[...candidates, ...(rows ?? []).filter((r) => !candidates.some((c) => c.userId === r.userId)).map((r) => ({ userId: r.userId, username: r.username }))].map((c) => (
              <option key={c.userId} value={c.userId}>{`@${c.username}`}</option>
            ))}
          </select>
          <FieldNote id="care-target" text={fieldErrors['userId']} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="care-level" className="text-sm font-medium text-slate-800">Nivel</label>
          <select id="care-level" value={level} aria-invalid={fieldErrors['level'] === undefined ? undefined : true} aria-describedby={fieldErrors['level'] === undefined ? undefined : 'care-level-error'} onChange={(e) => { setLevel(e.target.value as CaregiverLevel); setFieldErrors({}); }} className={SELECT_CLASS}>
            {(Object.keys(LEVEL_LABEL) as CaregiverLevel[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
          <FieldNote id="care-level" text={fieldErrors['level']} />
        </div>
        <TextField id="care-until" label="Vigente hasta (opcional, inclusive, hora de Bogotá)" name="careUntil" type="date" value={until} onChange={(_n, v) => { setUntil(v); setFieldErrors({}); }} errors={fieldErrors} />
        <div>
          <Button type="submit" disabled={busy || target === ''}>Guardar nivel</Button>
        </div>
        <div role="alert">{formError === null ? null : <p className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{formError}</p>}</div>
      </form>
    </section>
  );
}

/** Pestaña «Modo Cuidador» de una mascota. */
export function CarePanel({ petId, petName }: { readonly petId: string; readonly petName: string }): JSX.Element {
  const api = useRef(createCareApi()).current;
  const [access, setAccess] = useState<MyCareAccessView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .myAccess(petId)
      .then((view) => {
        if (alive) setAccess(view);
      })
      .catch((e: unknown) => {
        if (alive) setError(messageOf(e));
      });
    return () => {
      alive = false;
    };
  }, [api, petId]);

  return (
    <section aria-labelledby={`care-title-${petId}`} className="grid min-w-0 gap-5">
      <h2 id={`care-title-${petId}`} className="text-lg font-semibold text-slate-900">{`Modo Cuidador de ${petName}`}</h2>
      {error === null ? null : <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
      {access === null ? (
        error === null ? <p className="text-sm text-slate-700">Cargando…</p> : null
      ) : !access.canViewRoutines ? (
        <p className="text-sm text-slate-800">No tienes acceso al Modo Cuidador de esta mascota. Pídele al propietario que revise tu nivel.</p>
      ) : (
        <>
          <TodaySection api={api} petId={petId} access={access} refreshKey={refreshKey} />
          {access.canManageRoutines ? (
            <>
              <RoutinesSection api={api} petId={petId} onChanged={() => setRefreshKey((k) => k + 1)} />
              <AccessSection api={api} petId={petId} />
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
