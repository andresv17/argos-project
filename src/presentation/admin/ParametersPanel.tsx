/**
 * Parámetros de la plataforma en /admin (T1269, `[GH:#20]`, subfase 5a). Lista las claves del catálogo con valor vigente, defecto, rango, fecha y autor (sin ids ni correo); solo son editables
 * el tope de fotos (con `If-Match`) y el interruptor de escenas (con confirmación en línea), más el reinicio de cuota (confirmación en línea). Las claves de la subfase 5b (`writable = false`)
 * se muestran de solo lectura y sin campo de edición. Mismo patrón WCAG que `RegistrationsPanel`: confirmación sin ventana modal, foco al bloque y de vuelta al botón de origen, Escape cancela.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-006, NFR-009-001; SC-009-017..021, SC-009-026
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BlocksEditor, ModelEditor, QuotaEditor, RegionEditor, type EditorMessage, type EditorScope } from './SceneParameterEditors.tsx';
import { fetchParameterCatalog, resetSceneQuota, updateParameter, type ImagesFit, type ParameterKey, type ParameterView } from './parameters-api.ts';
import {
  ALBUM_HEADING,
  BLOCKS_INTERNAL_NOTE,
  KEY_LABEL,
  LOAD_FAILED,
  NEVER_EDITED,
  PHOTO_LOWER_HINT,
  PHOTO_SAVED,
  PROPAGATION_NOTICE,
  READ_ONLY_NOTE,
  RESET_CONFLICT,
  RESET_DONE,
  RESET_FAILED,
  RESET_HINT,
  RESET_NONE,
  SAVE_FAILED,
  SAVE_INVALID,
  SAVE_PRECONDITION,
  SCENE_DISABLED_TEXT,
  SCENE_ENABLED_TEXT,
  SCENE_TOGGLE_HINT_OFF,
  SCENE_TOGGLE_HINT_ON,
  authorLabel,
  formatEditedAt,
  rangeText,
  validatePhotoCap,
} from './parameters-view.ts';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const BUTTON = `inline-flex min-h-12 w-full items-center justify-center rounded-full border px-5 text-sm font-semibold sm:w-auto ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} border-primary bg-primary text-white hover:bg-primary-hover`;
const OUTLINE = `${BUTTON} border-primary bg-white text-primary hover:bg-meadow`;
const DANGER_OUTLINE = `${BUTTON} border-danger bg-white text-danger hover:bg-red-50`;
const DANGER = `${BUTTON} border-danger bg-danger text-white hover:bg-red-800`;
const CARD = 'rounded-xl border border-slate-300 bg-white p-4';

type LoadState = 'loading' | 'ready' | 'error';
type Confirming = 'toggle' | 'reset' | null;
type Scope = 'album' | 'toggle' | 'reset' | EditorScope;
const ALBUM: ParameterKey = 'album.max_photos_per_pet';
const ENABLED: ParameterKey = 'scene.enabled';
const EDITORS_5B: readonly ParameterKey[] = ['scene.provider_model', 'scene.provider_location', 'scene.global_quota_max', 'scene.prompt.blocks'];

function Facts({ param, viewerId }: { readonly param: ParameterView; readonly viewerId: string | null }): JSX.Element {
  return (
    <dl className="mt-2 grid gap-1 text-sm text-text-muted">
      <div>
        <dt className="inline">Rango: </dt>
        <dd className="inline">{rangeText(param.constraints)}</dd>
      </div>
      {param.lastEditedAt === null && param.lastEditedBy === null ? (
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

export function ParametersPanel({ viewerId, onSessionLost: onSessionLostProp }: { readonly viewerId: string | null; readonly onSessionLost: () => void }): JSX.Element {
  const onSessionLostRef = useRef(onSessionLostProp);
  onSessionLostRef.current = onSessionLostProp;
  const onSessionLost = useCallback((): void => onSessionLostRef.current(), []);

  const [params, setParams] = useState<readonly ParameterView[]>([]);
  const [imagesFit, setImagesFit] = useState<readonly ImagesFit[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [draft, setDraft] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ readonly kind: 'ok' | 'error'; readonly scope: Scope; readonly text: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<'toggle' | 'reset' | null>(null);

  const load = useCallback(
    async (showLoading: boolean): Promise<void> => {
      if (showLoading) setState('loading');
      const result = await fetchParameterCatalog();
      if (result.kind === 'OK') {
        setParams(result.value.params);
        setImagesFit(result.value.imagesFit);
        setDraft(result.value.params.find((p) => p.key === ALBUM)?.value ?? '');
        setState('ready');
      } else if (result.kind === 'SESSION_LOST') onSessionLost();
      else setState('error');
    },
    [onSessionLost],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (confirming !== null) confirmRef.current?.focus();
    else if (restoreFocus.current !== null) {
      const target = restoreFocus.current === 'toggle' ? toggleRef.current : resetRef.current;
      restoreFocus.current = null;
      target?.focus();
    }
  }, [confirming]);

  const replace = (view: ParameterView): void => setParams((current) => current.map((p) => (p.key === view.key ? view : p)));

  const close = (): void => {
    if (busy || confirming === null) return;
    restoreFocus.current = confirming;
    setConfirming(null);
  };

  const failWrite = (scope: Scope, kind: 'PRECONDITION' | 'INVALID' | 'COST_CAP' | 'FAILED' | 'CONFLICT' | 'SESSION_LOST' | 'OK'): void => {
    if (kind === 'SESSION_LOST') onSessionLost();
    else if (kind === 'PRECONDITION') {
      setMessage({ kind: 'error', scope, text: SAVE_PRECONDITION });
      if (confirming === 'toggle') {
        restoreFocus.current = 'toggle';
        setConfirming(null);
      }
      void load(false);
    } else setMessage({ kind: 'error', scope, text: kind === 'INVALID' ? SAVE_INVALID : SAVE_FAILED });
  };

  const album = params.find((p) => p.key === ALBUM);
  const scene = params.find((p) => p.key === ENABLED);

  const saveAlbum = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy || album === undefined) return;
    const problem = validatePhotoCap(draft, album.constraints);
    setMessage(null);
    setFieldError(problem);
    if (problem !== null) {
      albumInputRef.current?.focus();
      return;
    }
    setBusy(true);
    const result = await updateParameter(ALBUM, draft, album.etag);
    setBusy(false);
    if (result.kind !== 'OK') {
      failWrite('album', result.kind);
      return;
    }
    replace(result.value);
    setDraft(result.value.value);
    setMessage({ kind: 'ok', scope: 'album', text: PHOTO_SAVED });
  };

  const toggleScene = async (): Promise<void> => {
    if (busy || scene === undefined) return;
    const next = scene.value === 'true' ? 'false' : 'true';
    setBusy(true);
    setMessage(null);
    const result = await updateParameter(ENABLED, next, scene.etag);
    setBusy(false);
    if (result.kind !== 'OK') {
      failWrite('toggle', result.kind);
      return;
    }
    replace(result.value);
    restoreFocus.current = 'toggle';
    setConfirming(null);
    setMessage({ kind: 'ok', scope: 'toggle', text: result.value.value === 'true' ? 'Escenas habilitadas.' : 'Escenas deshabilitadas.' });
  };

  const resetQuota = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await resetSceneQuota();
    setBusy(false);
    if (result.kind === 'SESSION_LOST') {
      onSessionLost();
      return;
    }
    if (result.kind !== 'OK') {
      setMessage({ kind: 'error', scope: 'reset', text: result.kind === 'CONFLICT' ? RESET_CONFLICT : RESET_FAILED });
      return;
    }
    restoreFocus.current = 'reset';
    setConfirming(null);
    setMessage({ kind: 'ok', scope: 'reset', text: result.value.accountsReset === 0 ? RESET_NONE : RESET_DONE });
  };

  /** Confirmación o error en línea, pegada a la tarjeta y al botón que la originó (a 320 px el borde superior del panel queda fuera de vista). */
  const inline = (scope: Scope): JSX.Element | null => {
    if (message === null || message.scope !== scope) return null;
    return message.kind === 'error' ? (
      <p role="alert" id={`msg-${scope}`} className="mt-3 text-sm font-medium text-danger">
        {message.text}
      </p>
    ) : (
      <p className="mt-3 text-sm font-medium text-text-primary">{message.text}</p>
    );
  };

  const enabled = scene?.value === 'true';
  // T1305: las claves de 5b con writable=true tienen su editor; si el servidor las marca de solo lectura se listan en «Otros parámetros» sin campos.
  const editable = (key: ParameterKey): ParameterView | undefined => params.find((p) => p.key === key && p.writable);
  const others = params.filter((p) => p.key !== ALBUM && p.key !== ENABLED && !(EDITORS_5B.includes(p.key) && p.writable));
  const editorProps = (param: ParameterView, scope: EditorScope) => ({
    param,
    viewerId,
    scope,
    feedback: inline(scope),
    feedbackId: message?.kind === 'error' && message.scope === scope ? `msg-${scope}` : null,
    notify: (target: EditorScope, next: EditorMessage | null): void => setMessage(next === null ? null : { ...next, scope: target }),
    onSaved: replace,
    onPrecondition: () => void load(false),
    onSessionLost,
  });
  const model = editable('scene.provider_model');
  const region = editable('scene.provider_location');
  const quota = editable('scene.global_quota_max');
  const blocks = editable('scene.prompt.blocks');

  return (
    <section aria-labelledby="parameters-heading" className="mt-6 max-w-3xl rounded-2xl border border-slate-300 bg-white p-5 sm:p-6" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <h2 id="parameters-heading" className="break-words text-lg font-semibold text-text-primary">
        Parámetros de la plataforma
      </h2>
      <p className="mt-1 text-sm text-text-muted">{PROPAGATION_NOTICE}.</p>

      <div role="status" className="sr-only">
        {message?.kind === 'ok' ? message.text : ''}
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3" aria-busy={state === 'loading' ? 'true' : undefined}>
        {state === 'loading' ? <p className="text-base text-text-primary">Cargando parámetros…</p> : null}
        {state === 'error' ? (
          <div role="alert" className="grid gap-3">
            <p className="text-sm font-medium text-danger">{LOAD_FAILED}</p>
            <button type="button" className={OUTLINE} onClick={() => void load(true)}>
              Reintentar
            </button>
          </div>
        ) : null}

        {state === 'ready' && album !== undefined ? (
          <div data-testid={`param-${ALBUM}`} className={CARD}>
            <h3 className="break-words text-base font-semibold text-text-primary">{ALBUM_HEADING}</h3>
            <p className="mt-1 text-sm text-text-primary">
              Valor vigente: {album.value} · Valor por defecto: {album.default}
            </p>
            <Facts param={album} viewerId={viewerId} />
            <form className="mt-3 grid gap-2" onSubmit={(e) => void saveAlbum(e)} noValidate>
              <label htmlFor="album-cap" className="text-sm font-semibold text-text-primary">
                {KEY_LABEL[ALBUM]}
              </label>
              <input
                id="album-cap"
                ref={albumInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft}
                aria-invalid={fieldError !== null ? 'true' : undefined}
                aria-describedby={fieldError !== null ? 'album-error album-hint' : 'album-hint'}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setFieldError(null);
                }}
                className={`min-h-12 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-text-primary sm:max-w-xs ${FOCUS_RING}`}
              />
              {fieldError !== null ? (
                <p role="alert" id="album-error" className="text-sm font-medium text-danger">
                  {fieldError}
                </p>
              ) : null}
              <p id="album-hint" className="text-sm text-text-muted">
                {rangeText(album.constraints)}. {PHOTO_LOWER_HINT}
              </p>
              <div>
                <button type="submit" aria-disabled={busy ? 'true' : undefined} className={`${PRIMARY} ${busy ? 'opacity-70' : ''}`}>
                  {busy ? 'Guardando…' : 'Guardar tope de fotos'}
                </button>
              </div>
            </form>
            {inline('album')}
          </div>
        ) : null}

        {state === 'ready' && scene !== undefined ? (
          <div data-testid={`param-${ENABLED}`} className={CARD}>
            <h3 className="break-words text-base font-semibold text-text-primary">{KEY_LABEL[ENABLED]}</h3>
            <p className="mt-1 text-base font-semibold text-text-primary">{enabled ? SCENE_ENABLED_TEXT : SCENE_DISABLED_TEXT}</p>
            <p className="mt-1 text-sm text-text-primary">Valor por defecto: {scene.default === 'true' ? SCENE_ENABLED_TEXT : SCENE_DISABLED_TEXT}</p>
            <Facts param={scene} viewerId={viewerId} />
            {confirming !== 'toggle' ? (
              <div className="mt-3">
                <button
                  ref={toggleRef}
                  type="button"
                  disabled={confirming !== null}
                  className={`${enabled ? DANGER_OUTLINE : PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
                  onClick={() => setConfirming('toggle')}
                >
                  {enabled ? 'Deshabilitar escenas' : 'Habilitar escenas'}
                </button>
              </div>
            ) : (
              <div ref={confirmRef} role="group" tabIndex={-1} aria-labelledby="confirm-toggle" className="mt-3 rounded-lg border border-slate-300 bg-cream p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p id="confirm-toggle" className="break-words text-base font-semibold text-text-primary">
                  {enabled ? '¿Deshabilitar la generación de escenas?' : '¿Habilitar la generación de escenas?'}
                </p>
                <p className="mt-1 text-sm text-text-primary">
                  {enabled ? SCENE_TOGGLE_HINT_OFF : SCENE_TOGGLE_HINT_ON} {PROPAGATION_NOTICE}.
                </p>
                <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                  <button type="button" aria-disabled={busy ? 'true' : undefined} className={`${enabled ? DANGER : PRIMARY} ${busy ? 'opacity-70' : ''}`} onClick={() => void toggleScene()}>
                    {busy ? 'Guardando…' : enabled ? 'Confirmar deshabilitar' : 'Confirmar habilitar'}
                  </button>
                  <button type="button" aria-disabled={busy ? 'true' : undefined} className={OUTLINE} onClick={close}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {inline('toggle')}
          </div>
        ) : null}

        {state === 'ready' ? (
          <div data-testid="scene-quota-reset" className={CARD}>
            <h3 className="break-words text-base font-semibold text-text-primary">Cuota de escenas</h3>
            <p className="mt-1 text-sm text-text-muted">{RESET_HINT}</p>
            {confirming !== 'reset' ? (
              <div className="mt-3">
                <button ref={resetRef} type="button" disabled={confirming !== null} className={`${OUTLINE} disabled:cursor-not-allowed disabled:opacity-60`} onClick={() => setConfirming('reset')}>
                  Reiniciar cuota de escenas
                </button>
              </div>
            ) : (
              <div ref={confirmRef} role="group" tabIndex={-1} aria-labelledby="confirm-reset" className="mt-3 rounded-lg border border-slate-300 bg-cream p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p id="confirm-reset" className="break-words text-base font-semibold text-text-primary">
                  ¿Reiniciar la cuota de escenas?
                </p>
                <p className="mt-1 text-sm text-text-primary">El contador de tus cuentas de administración vuelve a cero. No se puede deshacer.</p>
                <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                  <button type="button" aria-disabled={busy ? 'true' : undefined} className={`${DANGER} ${busy ? 'opacity-70' : ''}`} onClick={() => void resetQuota()}>
                    {busy ? 'Reiniciando…' : 'Confirmar reinicio'}
                  </button>
                  <button type="button" aria-disabled={busy ? 'true' : undefined} className={OUTLINE} onClick={close}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {inline('reset')}
          </div>
        ) : null}

        {state === 'ready' && model !== undefined ? <ModelEditor {...editorProps(model, 'model')} imagesFit={imagesFit} otherValue={region?.value} /> : null}
        {state === 'ready' && region !== undefined ? <RegionEditor {...editorProps(region, 'region')} imagesFit={imagesFit} otherValue={model?.value} /> : null}
        {state === 'ready' && quota !== undefined ? <QuotaEditor {...editorProps(quota, 'quota')} /> : null}
        {state === 'ready' && blocks !== undefined ? <BlocksEditor {...editorProps(blocks, 'blocks')} /> : null}

        {state === 'ready' && others.length > 0 ? (
          <div className={CARD}>
            <h3 className="text-base font-semibold text-text-primary">Otros parámetros</h3>
            <p className="mt-1 text-sm text-text-muted">{READ_ONLY_NOTE}</p>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-3">
              {others.map((param) => (
                <div key={param.key} data-testid={`param-${param.key}`} className="rounded-lg border border-slate-200 p-3">
                  <h4 className="break-words text-sm font-semibold text-text-primary">{KEY_LABEL[param.key]}</h4>
                  {param.valueType === 'JSON_BLOCKS' ? (
                    <p className="mt-1 text-sm text-text-muted">{BLOCKS_INTERNAL_NOTE}</p>
                  ) : (
                    <>
                      <p className="mt-1 break-words text-sm text-text-primary">
                        Valor vigente: {param.value} · Valor por defecto: {param.default}
                      </p>
                      <Facts param={param} viewerId={viewerId} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
