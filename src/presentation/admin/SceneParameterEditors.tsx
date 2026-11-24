/**
 * Editores de la subfase 5b en /admin (T1305, `[GH:#20]`): modelo y región de imagen (listas cerradas), tope mensual de escenas (máximo derivado leído del servidor) y los seis bloques
 * del texto base. Cada tarjeta guarda su clave con `If-Match`; la regla de coste la aplica el servidor (422 sin cifras). Sin cifras de coste en pantalla. Mismo patrón WCAG que el editor de 5a:
 * etiquetas, errores asociados con `aria-describedby`, foco al campo inválido y objetivos de 48 px.
 *
 * @implements REQ-CFG9-002, REQ-CFG9-004, REQ-CFG9-005, REQ-CFG9-006, NFR-009-001; SC-009-022..025, SC-009-051
 */
import { useEffect, useRef, useState } from 'react';
import { updateParameter, type ImagesFit, type ParameterKey, type ParameterView } from './parameters-api.ts';
import {
  BLOCKS_BROKEN,
  BLOCKS_HEADING,
  BLOCKS_HINT,
  BLOCKS_PHOTOREF_HINT,
  BLOCKS_PHOTOREF_PRESERVATION_HINT,
  BLOCKS_SAVED,
  BLOCK_LABEL,
  BLOCK_NAMES,
  DEPRECATED_MODEL,
  KEY_LABEL,
  MODEL_DEPRECATION,
  MODEL_SAVED,
  PROPAGATION_NOTICE,
  QUOTA_HEADING,
  QUOTA_HINT,
  QUOTA_SAVED,
  REGION_NOTICE,
  SAVE_COST_CAP,
  SAVE_FAILED,
  SAVE_INVALID,
  SAVE_PRECONDITION,
  DRIVER_HEADING,
  DRIVER_LABEL,
  DRIVER_NOTICE,
  DRIVER_SAVED,
  SELECTABLE_DRIVERS,
  SELECTABLE_MODELS,
  SELECTABLE_MODELS_GEMINI_API,
  authorLabel,
  blockProblem,
  formatEditedAt,
  NEVER_EDITED,
  parseBlocks,
  rangeText,
  selectableOptions,
  serializeBlocks,
  validateQuota,
  type BlockName,
} from './parameters-view.ts';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const PRIMARY = `inline-flex min-h-12 w-full items-center justify-center rounded-full border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover sm:w-auto ${FOCUS_RING}`;
const CARD = 'rounded-xl border border-slate-300 bg-white p-4';
const CONTROL = `min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-text-primary ${FOCUS_RING}`;
// WebKit ignora min-height en el select nativo: sin apariencia nativa, altura fija en px y flecha propia (NFR-009-001, >= 44 px).
const SELECT_CONTROL = `${CONTROL} h-12 min-h-[48px] appearance-none bg-no-repeat py-2 pr-10`;
const SELECT_ARROW = {
  backgroundImage: 'linear-gradient(45deg, transparent 50%, #334155 50%), linear-gradient(135deg, #334155 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 1.25rem) center, calc(100% - 0.9rem) center',
  backgroundSize: '0.4rem 0.4rem, 0.4rem 0.4rem',
  backgroundRepeat: 'no-repeat',
} as const;

export type EditorScope = 'model' | 'driver' | 'quota' | 'blocks';
export interface EditorMessage {
  readonly kind: 'ok' | 'error';
  readonly text: string;
}
export interface EditorProps {
  readonly param: ParameterView;
  readonly viewerId: string | null;
  readonly scope: EditorScope;
  /** Mensaje en línea ya pintado por el panel (confirmación o error de esta tarjeta) y el id de su alerta si es un error. */
  readonly feedback: JSX.Element | null;
  readonly feedbackId: string | null;
  readonly notify: (scope: EditorScope, message: EditorMessage | null) => void;
  readonly onSaved: (view: ParameterView) => void;
  readonly onPrecondition: () => void;
  readonly onSessionLost: () => void;
  /** Imagenes que aun caben por par (contrato 1.5.0); vacio = no se muestra ninguna cifra. */
  readonly imagesFit?: readonly ImagesFit[];
}

const fitText = (n: number): string => `Imágenes que aún caben: ${n}`;

function Facts({ param, viewerId }: { readonly param: ParameterView; readonly viewerId: string | null }): JSX.Element {
  const never = param.lastEditedAt === null && param.lastEditedBy === null;
  return (
    <dl className="mt-2 grid gap-1 text-sm text-text-muted">
      {never ? (
        <div>
          <dt className="inline">Última edición: </dt>
          <dd className="inline">{NEVER_EDITED}</dd>
        </div>
      ) : (
        <>
          <div>
            <dt className="inline">Última edición: </dt>
            <dd className="inline">{formatEditedAt(param.lastEditedAt)}</dd>
          </div>
          <div>
            <dt className="inline">Editado por: </dt>
            <dd className="inline">{authorLabel(param.lastEditedBy, viewerId)}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

/** Guarda una clave y traduce el resultado a mensajes en línea; devuelve `true` si se guardó. */
function useSave(props: EditorProps, okText: string, invalidText: string): { readonly busy: boolean; readonly save: (value: string) => Promise<boolean> } {
  const [busy, setBusy] = useState(false);
  const { param, scope, notify, onSaved, onPrecondition, onSessionLost } = props;
  const save = async (value: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    notify(scope, null);
    const result = await updateParameter(param.key as ParameterKey, value, param.etag);
    setBusy(false);
    if (result.kind === 'OK') {
      onSaved(result.value);
      notify(scope, { kind: 'ok', text: okText });
      return true;
    }
    if (result.kind === 'SESSION_LOST') onSessionLost();
    else if (result.kind === 'PRECONDITION') {
      notify(scope, { kind: 'error', text: SAVE_PRECONDITION });
      onPrecondition();
    } else notify(scope, { kind: 'error', text: result.kind === 'COST_CAP' ? SAVE_COST_CAP : result.kind === 'INVALID' ? invalidText : SAVE_FAILED });
    return false;
  };
  return { busy, save };
}

function SelectEditor(props: EditorProps & { readonly heading: string; readonly selectable: readonly string[]; readonly id: string; readonly notes: readonly JSX.Element[]; readonly okText: string; readonly submitLabel: string; readonly optionText: (v: string) => string; readonly fitFor: (v: string) => number | null }): JSX.Element {
  const { param, viewerId, heading, selectable, id, notes, okText, submitLabel, optionText, fitFor, feedback, feedbackId } = props;
  const options = selectableOptions(param.constraints, selectable);
  const inList = options.includes(param.value);
  const [draft, setDraft] = useState(inList ? param.value : (options[0] ?? ''));
  const { busy, save } = useSave(props, okText, SAVE_INVALID);
  useEffect(() => setDraft(options.includes(param.value) ? param.value : (options[0] ?? '')), [param.value, param.etag]); // eslint-disable-line react-hooks/exhaustive-deps
  const describedBy = [`${id}-hint`, feedbackId].filter((v) => v !== null).join(' ');
  return (
    <div data-testid={`param-${param.key}`} className={CARD}>
      <h3 className="break-words text-base font-semibold text-text-primary">{heading}</h3>
      <p className="mt-1 break-words text-sm text-text-primary">Valor vigente: {param.value}{inList ? '' : ' (no seleccionable)'}</p>
      <Facts param={param} viewerId={viewerId} />
      <form
        className="mt-3 grid gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (draft !== '' && draft !== param.value) void save(draft);
        }}
      >
        <label htmlFor={id} className="text-sm font-semibold text-text-primary">
          {KEY_LABEL[param.key]}
        </label>
        <select id={id} value={draft} aria-describedby={describedBy} aria-invalid={feedbackId !== null ? 'true' : undefined} onChange={(e) => setDraft(e.target.value)} className={`${SELECT_CONTROL} sm:max-w-xs`} style={SELECT_ARROW}>
          {options.map((o) => (
            <option key={o} value={o}>
              {`${optionText(o)}${fitFor(o) === null ? '' : ` · ${fitText(fitFor(o)!)}`}`}
            </option>
          ))}
        </select>
        {fitFor(draft) === null ? null : (
          <p data-testid="images-fit" className="text-sm font-medium text-text-primary">
            {fitText(fitFor(draft)!)}
          </p>
        )}
        <div id={`${id}-hint`} className="grid gap-1 text-sm text-text-muted">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
          <p>{PROPAGATION_NOTICE}.</p>
        </div>
        <div>
          <button type="submit" aria-disabled={busy ? 'true' : undefined} className={`${PRIMARY} ${busy ? 'opacity-70' : ''}`}>
            {busy ? 'Guardando…' : submitLabel}
          </button>
        </div>
      </form>
      {feedback}
    </div>
  );
}

export function DriverEditor(props: EditorProps): JSX.Element {
  return (
    <SelectEditor
      {...props}
      id="scene-driver"
      heading={DRIVER_HEADING}
      selectable={SELECTABLE_DRIVERS}
      okText={DRIVER_SAVED}
      submitLabel="Guardar proveedor"
      optionText={(v) => DRIVER_LABEL[v] ?? v}
      fitFor={() => null}
      notes={[<>{DRIVER_NOTICE}</>]}
    />
  );
}

export function ModelEditor(props: EditorProps & { readonly driver?: string | undefined }): JSX.Element {
  return (
    <SelectEditor
      {...props}
      id="scene-model"
      heading="Modelo de imagen"
      selectable={props.driver === 'gemini-api' ? SELECTABLE_MODELS_GEMINI_API : SELECTABLE_MODELS}
      okText={MODEL_SAVED}
      submitLabel="Guardar modelo"
      optionText={(v) => (v === DEPRECATED_MODEL ? `${v} (se retira el 15 de marzo de 2027)` : v)}
      fitFor={(v) => props.imagesFit?.find((f) => f.model === v)?.imagesFit ?? null}
      notes={[<>{MODEL_DEPRECATION}</>, <>{REGION_NOTICE}</>, <>Solo se pueden elegir los modelos de esta lista.</>]}
    />
  );
}

export function QuotaEditor(props: EditorProps): JSX.Element {
  const { param, viewerId, feedback, feedbackId } = props;
  const [draft, setDraft] = useState(param.value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, save } = useSave(props, QUOTA_SAVED, SAVE_INVALID);
  useEffect(() => {
    setDraft(param.value);
    setError(null);
  }, [param.value, param.etag]);
  const describedBy = [error !== null ? 'quota-error' : null, 'quota-hint', feedbackId].filter((v) => v !== null).join(' ');
  return (
    <div data-testid={`param-${param.key}`} className={CARD}>
      <h3 className="break-words text-base font-semibold text-text-primary">{QUOTA_HEADING}</h3>
      <p className="mt-1 text-sm text-text-primary">
        Valor vigente: {param.value} · Valor por defecto: {param.default}
      </p>
      <Facts param={param} viewerId={viewerId} />
      <form
        className="mt-3 grid gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          const problem = validateQuota(draft, param.constraints);
          props.notify('quota', null);
          setError(problem);
          if (problem !== null) {
            inputRef.current?.focus();
            return;
          }
          void save(draft);
        }}
      >
        <label htmlFor="scene-quota" className="text-sm font-semibold text-text-primary">
          {KEY_LABEL[param.key]}
        </label>
        <input
          id="scene-quota"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft}
          aria-invalid={error !== null || feedbackId !== null ? 'true' : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          className={`${CONTROL} sm:max-w-xs`}
        />
        {error !== null ? (
          <p role="alert" id="quota-error" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <p id="quota-hint" className="text-sm text-text-muted">
          {rangeText(param.constraints)}. {QUOTA_HINT} {PROPAGATION_NOTICE}.
        </p>
        <div>
          <button type="submit" aria-disabled={busy ? 'true' : undefined} className={`${PRIMARY} ${busy ? 'opacity-70' : ''}`}>
            {busy ? 'Guardando…' : 'Guardar tope mensual'}
          </button>
        </div>
      </form>
      {feedback}
    </div>
  );
}

export function BlocksEditor(props: EditorProps): JSX.Element {
  const { param, viewerId, feedback, feedbackId } = props;
  const max = param.constraints.maxBlockLength ?? 1000;
  const current = parseBlocks(param.value);
  const [draft, setDraft] = useState<Readonly<Record<BlockName, string>> | null>(current);
  const [errors, setErrors] = useState<Readonly<Partial<Record<BlockName, string>>>>({});
  const refs = useRef<Partial<Record<BlockName, HTMLTextAreaElement | null>>>({});
  const { busy, save } = useSave(props, BLOCKS_SAVED, `El servidor no aceptó el texto base. Revisa que ningún bloque esté vacío ni pase de ${max} caracteres y que ${'{photoRef}'} solo esté en «Hogar con foto».`);
  useEffect(() => {
    setDraft(parseBlocks(param.value));
    setErrors({});
  }, [param.value, param.etag]);

  if (draft === null) {
    return (
      <div data-testid={`param-${param.key}`} className={CARD}>
        <h3 className="break-words text-base font-semibold text-text-primary">{BLOCKS_HEADING}</h3>
        <p role="alert" className="mt-1 text-sm font-medium text-danger">
          {BLOCKS_BROKEN}
        </p>
      </div>
    );
  }
  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (busy) return;
    props.notify('blocks', null);
    const found: Partial<Record<BlockName, string>> = {};
    for (const name of BLOCK_NAMES) {
      const problem = blockProblem(name, draft[name], max);
      if (problem !== null) found[name] = problem;
    }
    setErrors(found);
    const first = BLOCK_NAMES.find((n) => found[n] !== undefined);
    if (first !== undefined) {
      refs.current[first]?.focus();
      return;
    }
    void save(serializeBlocks(draft));
  };
  return (
    <div data-testid={`param-${param.key}`} className={CARD}>
      <h3 className="break-words text-base font-semibold text-text-primary">{BLOCKS_HEADING}</h3>
      <Facts param={param} viewerId={viewerId} />
      <p id="blocks-hint" className="mt-2 text-sm text-text-muted">
        {BLOCKS_HINT} {PROPAGATION_NOTICE}.
      </p>
      <form className="mt-3 grid gap-4" noValidate onSubmit={submit} aria-describedby={['blocks-hint', feedbackId].filter((v) => v !== null).join(' ')}>
        {BLOCK_NAMES.map((name) => {
          const text = draft[name];
          const over = text.length > max;
          const error = errors[name];
          const id = `block-${name}`;
          const describedBy = [error !== undefined ? `${id}-error` : null, `${id}-count`, name === 'HOUSEHOLD_WITH_PHOTO' || name === 'PRESERVATION_BLOCK' ? `${id}-ref` : null].filter((v) => v !== null).join(' ');
          return (
            <div key={name} className="grid gap-2">
              <label htmlFor={id} className="text-sm font-semibold text-text-primary">
                {BLOCK_LABEL[name]}
              </label>
              <textarea
                id={id}
                ref={(el) => {
                  refs.current[name] = el;
                }}
                rows={5}
                value={text}
                aria-invalid={error !== undefined ? 'true' : undefined}
                aria-describedby={describedBy}
                onChange={(e) => {
                  setDraft({ ...draft, [name]: e.target.value });
                  setErrors({ ...errors, [name]: undefined });
                }}
                className={`${CONTROL} min-h-32 py-2 leading-relaxed`}
              />
              <p id={`${id}-count`} className={`text-sm ${over ? 'font-medium text-danger' : 'text-text-muted'}`}>
                {text.length} de {max} caracteres
              </p>
              {name === 'HOUSEHOLD_WITH_PHOTO' || name === 'PRESERVATION_BLOCK' ? (
                <p id={`${id}-ref`} className="text-sm text-text-muted">
                  {name === 'HOUSEHOLD_WITH_PHOTO' ? BLOCKS_PHOTOREF_HINT : BLOCKS_PHOTOREF_PRESERVATION_HINT}
                </p>
              ) : null}
              {error !== undefined ? (
                <p role="alert" id={`${id}-error`} className="text-sm font-medium text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
        <div>
          <button type="submit" aria-disabled={busy ? 'true' : undefined} className={`${PRIMARY} ${busy ? 'opacity-70' : ''}`}>
            {busy ? 'Guardando…' : 'Guardar texto base'}
          </button>
        </div>
      </form>
      {feedback}
    </div>
  );
}
