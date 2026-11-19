/**
 * Bloque «Escena del hogar» (feature 006, T875/T876; D6-04 = A, D6-05 = A): en el encabezado de la vista «Hogar» y, para el propietario sin hogar, en «Mis mascotas».
 * Imagen con texto alternativo, estado anunciado en una región `aria-live`, «cambios pendientes: P · generaciones restantes: R», «Se muestran N de M mascotas», aviso
 * «desactualizada», «Actualizar imagen del hogar» deshabilitado con motivo visible, «Regenerar escena desde cero» (secundaria, solo con imagen vigente: sin `imageTag` solo queda el botón inicial) y «Reintentar» tras un fallo. La imagen
 * se pide a la ruta propia del ámbito (302 firmada por el servidor): el DOM no guarda URL firmadas (NFR-ESC6-003). `SceneBlockView` es presentacional; `SceneBlock`
 * es el contenedor (lectura, sondeo cada 3 s mientras `generating`, `Idempotency-Key` nueva por clic).
 *
 * @implements REQ-ESC6-005, REQ-ESC6-007, REQ-ESC6-019, REQ-ESC6-021, NFR-ESC6-003, NFR-ESC6-004, SC-ESC6-014, SC-ESC6-015, SC-ESC6-029, SC-ESC6-030, SC-ESC6-108, SC-ESC6-109
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { browserScheduler } from '../browser-scheduler.ts';
import { createSceneApi, SceneApiError, type SceneAction, type SceneScope, type SceneViewData } from '../scene-api.ts';
import {
  createScenePoller,
  isOwnerSceneEmpty,
  SCENE_STALE_TEXT,
  sceneFailureText,
  sceneAltText,
  sceneImagePath,
  scenePendingText,
  scenePetsShownText,
  sceneProblemMessage,
  sceneRetryAfter,
  sceneStatusText,
  sceneUpdateState,
  sceneWaitText,
  scheduleCooldownRefresh,
} from '../scene-view.ts';
import { Button } from './Field.tsx';

export interface SceneBlockViewProps {
  /** Prefijo de los ids: evita ids repetidos si hay varios bloques en la página (WCAG 4.1.1). */
  readonly idPrefix: string;
  readonly scope: SceneScope;
  readonly view: SceneViewData | null;
  readonly status: 'LOADING' | 'READY' | 'ERROR';
  readonly error: string | null;
  readonly busy: boolean;
  readonly onUpdate: () => void;
  readonly onRegenerate: () => void;
  /** Se ejecuta si la imagen no carga (p. ej. 404 tras un retiro): el contenedor vuelve a leer el estado. */
  readonly onImageError?: () => void;
  /** Paneles de consentimiento, foto del hogar y retiro (T877, T878). */
  readonly children?: ReactNode;
  /** Nivel del título: 2 en «Mis mascotas»; 4 dentro de la tarjeta del hogar, que ya tiene su h3 (H-S1). */
  readonly headingLevel?: 2 | 4;
}

export function SceneBlockView({ idPrefix, scope, view, status, error, busy, onUpdate, onRegenerate, onImageError, children, headingLevel = 2 }: SceneBlockViewProps): JSX.Element {
  const titleId = `${idPrefix}-title`;
  const Title = `h${headingLevel}` as 'h2' | 'h4';
  const statusId = `${idPrefix}-status`;
  const reasonId = `${idPrefix}-reason`;
  const src = view === null ? null : sceneImagePath(scope, view.imageTag);
  const update = view === null ? null : sceneUpdateState(view);
  const generating = view?.status === 'generating';
  const wait = view === null || view.actions.blockedReason === 'ROLE' ? null : sceneRetryAfter(view);
  const waitText = wait === null ? null : sceneWaitText(wait);
  const petsShown = view === null ? null : scenePetsShownText(view.pets);
  return (
    <section aria-labelledby={titleId} className="grid min-w-0 max-w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Title id={titleId} className="text-lg font-semibold text-slate-900">
        Escena del hogar
      </Title>
      <div className={`grid min-w-0 gap-3 lg:items-start ${view === null || src === null ? '' : 'lg:grid-cols-[28rem_minmax(0,1fr)]'}`}>
        {view === null || src === null ? null : (
          <img src={src} alt={sceneAltText(view.pets.shown)} width={512} height={512} decoding="async" {...(generating ? { 'aria-busy': true } : {})} {...(onImageError === undefined ? {} : { onError: onImageError })} className={`aspect-square h-auto w-full max-w-full rounded-2xl border border-slate-200 bg-meadow object-contain sm:max-w-md ${generating ? 'opacity-70' : ''}`} style={{ imageRendering: 'pixelated' }} />
        )}
        <div className="grid min-w-0 gap-3">
          <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className="text-sm text-slate-900">
            {view === null ? (status === 'LOADING' ? 'Cargando la escena…' : null) : sceneStatusText(view)}
          </div>
          {error === null ? null : (
            <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </p>
          )}
          {view?.status === 'failed' ? (
            <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
              {sceneFailureText(view.lastError)}
            </p>
          ) : null}
          {view === null ? null : (
            <>
              {src === null ? (
                <p className="rounded-2xl border border-dashed border-slate-400 bg-meadow px-4 py-8 text-center text-sm text-slate-900">Aún no hay imagen del hogar.</p>
              ) : null}
              {view.stale ? (
                <p className="rounded-xl border border-amber-700 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{SCENE_STALE_TEXT}</p>
              ) : null}
              <p className="text-sm font-semibold text-slate-900">{scenePendingText(view)}</p>
              {petsShown === null ? null : <p className="text-sm text-slate-900">{petsShown}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy || generating || wait !== null || update?.disabled === true} {...(update?.reason == null ? {} : { describedBy: reasonId })} onClick={onUpdate}>
                  {view.status === 'failed' ? 'Reintentar' : 'Actualizar imagen del hogar'}
                </Button>
                {src === null ? null : (
                  <Button variant="secondary" disabled={busy || generating || wait !== null || !view.actions.canRegenerate} onClick={onRegenerate}>
                    Regenerar escena desde cero
                  </Button>
                )}
              </div>
              {update?.reason == null ? null : (
                <p id={reasonId} className="text-sm text-slate-800">
                  {update.reason}
                </p>
              )}
              {waitText === null || waitText === update?.reason ? null : <p className="text-sm font-semibold text-slate-900">{waitText}</p>}
            </>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Clave de idempotencia nueva por clic (UUID v4, EDGE-ESC6-016). */
const newKey = (): string => crypto.randomUUID();

/** Contenedor: lee la escena, sondea cada 3 s mientras `generating` y ejecuta «Actualizar» o «Regenerar» con una clave nueva por clic. */
export function SceneBlock({ scope, idPrefix, headingLevel, reloadToken, children }: { readonly scope: SceneScope; readonly idPrefix: string; readonly headingLevel?: 2 | 4; /** Al cambiar (p. ej. alta o asignación de una mascota) la escena se vuelve a leer una vez; el valor inicial no recarga (SC-ESC6-109). */ readonly reloadToken?: number; readonly children?: (view: SceneViewData | null, reload: () => Promise<void>) => ReactNode }): JSX.Element {
  const api = useMemo(() => createSceneApi(), []);
  const [view, setView] = useState<SceneViewData | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR'>('LOADING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scopeKey = scope.kind === 'HOUSEHOLD' ? scope.householdId : 'OWNER';
  const stable = useMemo<SceneScope>(() => (scopeKey === 'OWNER' ? { kind: 'OWNER' } : { kind: 'HOUSEHOLD', householdId: scopeKey }), [scopeKey]);
  const pollerRef = useRef<ReturnType<typeof createScenePoller> | null>(null);

  const fail = useCallback((e: unknown): void => {
    setError(e instanceof SceneApiError ? sceneProblemMessage(e.code, e.retryAfterSeconds) : sceneProblemMessage('ERR-INTERNAL-UNEXPECTED'));
  }, []);

  useEffect(() => {
    const poller = createScenePoller({
      fetchScene: () => api.get(stable, { passive: true }),
      onView: (next) => {
        setView(next);
        setStatus('READY');
      },
      onError: (e) => {
        fail(e);
        setStatus((s) => (s === 'LOADING' ? 'ERROR' : s));
      },
      scheduler: browserScheduler,
    });
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [api, stable, fail]);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const next = await api.get(stable);
      setView(next);
      setStatus('READY');
      setError(null);
      if (next.status === 'generating') pollerRef.current?.start();
    } catch (e) {
      fail(e);
    }
  }, [api, stable, fail]);

  // Espera de intentos (REQ-ESC6-034, SC-ESC6-115): una sola relectura a los `t + 1` s; el temporizador se cancela al desmontar o al llegar otra espera.
  const [wait, setWait] = useState<{ readonly seconds: number } | null>(null);
  useEffect(() => {
    const seconds = view === null || view.actions.blockedReason === 'ROLE' ? null : sceneRetryAfter(view);
    setWait(seconds === null ? null : { seconds });
  }, [view]);
  useEffect(() => {
    if (wait === null) return undefined;
    return scheduleCooldownRefresh({ seconds: wait.seconds, scheduler: browserScheduler, reload: () => void reload() });
  }, [wait, reload]);

  const lastToken = useRef(reloadToken);
  useEffect(() => {
    if (lastToken.current === reloadToken) return;
    lastToken.current = reloadToken;
    void reload();
  }, [reloadToken, reload]);

  const run = async (action: SceneAction): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.generate(stable, action, newKey());
      setView(next);
      if (next.status === 'generating') pollerRef.current?.start();
    } catch (e) {
      fail(e);
      if (e instanceof SceneApiError && e.code === 'ERR-RATE-LIMITED' && e.retryAfterSeconds !== undefined) setWait({ seconds: e.retryAfterSeconds });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  // `OWNER` sin mascotas, imagen ni consentimiento: no se pinta nada (ni mientras carga); el contenedor sigue montado para releer al cambiar la lista (SC-ESC6-109).
  if (stable.kind === 'OWNER' && (view === null ? status === 'LOADING' : isOwnerSceneEmpty(stable, view))) return <></>;
  return (
    <SceneBlockView idPrefix={idPrefix} scope={stable} view={view} status={status} error={error} busy={busy} onUpdate={() => void run('UPDATE')} onRegenerate={() => void run('REGENERATE')} onImageError={() => void reload()} {...(headingLevel === undefined ? {} : { headingLevel })}>
      {children?.(view, reload)}
    </SceneBlockView>
  );
}
