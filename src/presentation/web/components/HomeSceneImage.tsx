/**
 * Imagen vigente del hogar en «Mascotas» (feature 006, T919; D6-19, SC-ESC6-110/111): solo visualización. Sin botones, enlaces, campos ni textos de estado,
 * cuota o consentimiento (enmienda 008, T1172/[GH:#55], REQ-UX8-003: único texto permitido, el rótulo «Mi hogar», PROVISIONAL hasta D8-09); no pinta nada con 0 hogares, contexto «Mis mascotas», `imageTag = null` o error de lectura. La gestión vive solo en «Hogar».
 * La imagen se pide a la ruta propia del hogar (302 firmada por el servidor) y el DOM no guarda URL firmadas (NFR-ESC6-003).
 *
 * @implements REQ-IA11-001, REQ-IA11-002, INV-IA11-001, REQ-UX8-003, REQ-ESC6-019, REQ-ESC6-032, NFR-ESC6-003, SC-ESC6-110, SC-ESC6-111
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createSceneApi } from '../scene-api.ts';
import { createLatestOnly, loadHomeSceneImage, SCENE_AI_LABEL, sceneAltText, sceneImagePath, type HomeSceneImageData } from '../scene-view.ts';

/** Presentacional: `null` si no hay hogar, vista o etiqueta de imagen. */
export function HomeSceneImageView({ householdId, view }: { readonly householdId: string | null; readonly view: HomeSceneImageData | null }): JSX.Element | null {
  const [broken, setBroken] = useState(false);
  const aiLabelId = useId();
  const src = householdId === null || view === null ? null : sceneImagePath({ kind: 'HOUSEHOLD', householdId }, view.imageTag);
  if (view === null || src === null || broken) return null;
  return (
    <figure className="m-0 min-w-0 max-w-full">
      <img src={src} alt={sceneAltText(view.shown)} aria-describedby={aiLabelId} width={512} height={512} decoding="async" onError={() => setBroken(true)} className="aspect-square h-auto w-full max-w-full rounded-2xl border border-slate-200 bg-meadow object-contain sm:max-w-md" style={{ imageRendering: 'pixelated' }} />
      <figcaption className="mt-2 text-sm text-slate-900">
        <span className="block font-semibold">Mi hogar</span>
        <span id={aiLabelId} className="mt-1 block text-slate-900">{SCENE_AI_LABEL}</span>
      </figcaption>
    </figure>
  );
}

/** Contenedor: 1 lectura de la escena por cambio de contexto (`householdId`), con descarte de lecturas antiguas; `null` no pide nada. */
export function HomeSceneImage({ householdId }: { readonly householdId: string | null }): JSX.Element | null {
  const api = useMemo(() => createSceneApi(), []);
  const latest = useRef(createLatestOnly());
  const [loaded, setLoaded] = useState<{ readonly householdId: string; readonly data: HomeSceneImageData } | null>(null);
  useEffect(() => {
    const guard = latest.current;
    guard.cancel();
    setLoaded(null);
    if (householdId === null) return undefined;
    guard.run(loadHomeSceneImage((scope) => api.get(scope, { passive: true }), householdId), (data) => setLoaded(data === null ? null : { householdId, data }));
    return () => guard.cancel();
  }, [api, householdId]);
  return <HomeSceneImageView householdId={loaded === null ? null : loaded.householdId} view={loaded === null ? null : loaded.data} key={householdId ?? 'ninguno'} />;
}
