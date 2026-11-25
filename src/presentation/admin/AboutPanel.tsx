/**
 * «Acerca de» en /admin (feature 010, T1431; REQ-ACE10-002, EDGE-010-006, EDGE-010-011, D10-07). Sube o reemplaza la foto (`If-Match` con el etag que se muestra), edita el texto Markdown
 * (tope de 20 000 caracteres en el campo, con contador) con vista previa sanitizada, y ante un 412 muestra el estado de conflicto con un botón de recarga. Sin enlaces a la app de usuarios.
 *
 * @implements REQ-ACE10-002, EDGE-010-006, EDGE-010-011, D10-07
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AboutMarkdownView } from './about-markdown-view.tsx';
import { ABOUT_ALT_MAX_CHARS, ABOUT_BODY_MAX_CHARS, fetchAdminAbout, saveAboutPhoto, saveAboutText, type AboutOutcome, type AdminAbout } from './about-api.ts';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';
const BUTTON = `inline-flex min-h-12 w-full items-center justify-center rounded-full border px-5 text-sm font-semibold sm:w-auto ${FOCUS_RING}`;
const PRIMARY = `${BUTTON} border-primary bg-primary text-cream hover:bg-primary-hover`;
const OUTLINE = `${BUTTON} border-primary bg-white text-primary hover:bg-meadow`;
const FIELD = `w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-base text-text-primary ${FOCUS_RING}`;

export const LINK_RING = '[&_a]:rounded-sm [&_a:focus]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-terracota [&_a:focus-visible]:ring-offset-2';

/**
 * Aviso (no bloquea) cuando hay foto publicada y el texto alternativo está vacío: REQ-ACE10-001 pide `alt` accesible en la página pública, pero el contrato admite `photoAlt` vacío
 * (imagen decorativa), así que el panel avisa en lugar de impedir guardar. Sin foto no hay nada que describir.
 */
export function altWarning(photoUrl: string | null, alt: string): string | null {
  return photoUrl !== null && alt.trim() === '' ? 'La foto no tiene texto alternativo: las personas que usan lector de pantalla no sabrán qué muestra. Descríbela en pocas palabras.' : null;
}

/** Bloque de conflicto 412: alerta anunciada, con foco programático y botón que recarga la versión vigente. */
export function ConflictNotice({ onReload, innerRef }: { readonly onReload: () => void; readonly innerRef?: React.Ref<HTMLDivElement> }): JSX.Element {
  return (
    <div ref={innerRef} tabIndex={-1} role="alert" className={`rounded-xl border border-danger bg-red-50 p-4 text-sm text-text-primary ${FOCUS_RING}`}>
      <p className="font-semibold">Otra persona guardó cambios mientras editabas (versión desactualizada).</p>
      <p className="mt-1">Recarga para ver la versión vigente; los cambios de este formulario no se guardaron.</p>
      <button type="button" onClick={onReload} className={`${OUTLINE} mt-3`}>
        Recargar la versión vigente
      </button>
    </div>
  );
}

/** Campo del texto (tope 20 000 en el propio campo) con su contador. */
export function BodyEditor({ body, onChange }: { readonly body: string; readonly onChange: (value: string) => void }): JSX.Element {
  return (
    <>
      <textarea id="about-body" rows={12} maxLength={ABOUT_BODY_MAX_CHARS} value={body} onChange={(event) => onChange(event.target.value)} aria-describedby="about-count" className={FIELD} />
      <p id="about-count" className="text-sm text-text-muted">
        {body.length} de {ABOUT_BODY_MAX_CHARS} caracteres. El HTML, las imágenes y los enlaces no seguros se eliminan al guardar.
      </p>
    </>
  );
}

type LoadState = 'loading' | 'ready' | 'error';
type Notice = { readonly kind: 'ok' | 'error'; readonly text: string } | null;

const FAILURE: Record<'INVALID' | 'TOO_LARGE' | 'STORAGE' | 'FAILED', string> = {
  INVALID: 'El servidor rechazó el contenido: revisa el tamaño del texto o que la foto sea JPEG, PNG o WebP.',
  TOO_LARGE: 'El archivo o el texto es demasiado grande.',
  STORAGE: 'El almacenamiento no respondió. No se cambió nada; inténtalo de nuevo.',
  FAILED: 'No se pudo guardar. Inténtalo de nuevo.',
};

export function AboutPanel({ onSessionLost }: { readonly onSessionLost: () => void }): JSX.Element {
  const lostRef = useRef(onSessionLost);
  lostRef.current = onSessionLost;
  const [load, setLoad] = useState<LoadState>('loading');
  const [saved, setSaved] = useState<AdminAbout | null>(null);
  const [body, setBody] = useState('');
  const [alt, setAlt] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoad('loading');
    const result = await fetchAdminAbout();
    if (result.kind === 'OK') {
      setSaved(result.value);
      setBody(result.value.bodyMarkdown);
      setAlt(result.value.photoAlt);
      setConflict(false);
      setLoad('ready');
    } else if (result.kind === 'SESSION_LOST') lostRef.current();
    else setLoad('error');
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (conflict) conflictRef.current?.focus();
  }, [conflict]);

  /** `adoptText`: el texto guardado reemplaza el borrador (guardar texto); con la foto, el borrador del texto se conserva y solo cambian foto, versión y etag. */
  const finish = (result: AboutOutcome<AdminAbout>, okText: string, adoptText: boolean): void => {
    setBusy(false);
    if (result.kind === 'OK') {
      setSaved(result.value);
      if (adoptText) {
        setBody(result.value.bodyMarkdown);
        setAlt(result.value.photoAlt);
      }
      setConflict(false);
      setNotice({ kind: 'ok', text: okText });
    } else if (result.kind === 'SESSION_LOST') lostRef.current();
    else if (result.kind === 'PRECONDITION') {
      setConflict(true);
      setNotice(null);
    } else setNotice({ kind: 'error', text: FAILURE[result.kind] });
  };

  const onSave = async (): Promise<void> => {
    if (saved === null || busy) return;
    setBusy(true);
    setNotice(null);
    finish(await saveAboutText({ bodyMarkdown: body, photoAlt: alt }, saved.etag), 'Texto guardado.', true);
  };

  const onPhoto = async (file: File | undefined): Promise<void> => {
    if (saved === null || busy || file === undefined) return;
    setBusy(true);
    setNotice(null);
    finish(await saveAboutPhoto(file, saved.etag), 'Foto guardada.', false);
    if (fileRef.current !== null) fileRef.current.value = '';
  };

  const altHint = altWarning(saved?.photoUrl ?? null, alt);
  return (
    <section aria-labelledby="about-heading" className="mt-6 max-w-3xl rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="about-heading" className="text-xl font-bold text-text-primary">
        Acerca de
      </h2>
      <p className="mt-1 text-sm text-text-muted">Texto y foto de la página pública /acerca-de.</p>
      {load === 'loading' ? (
        <p role="status" className="mt-4 text-sm text-text-muted">
          Cargando…
        </p>
      ) : null}
      {load === 'error' ? (
        <div role="alert" className="mt-4 text-sm font-medium text-danger">
          No se pudo cargar esta sección.{' '}
          <button type="button" onClick={() => void reload()} className={`underline ${FOCUS_RING}`}>
            Reintentar
          </button>
        </div>
      ) : null}
      {load === 'ready' && saved !== null ? (
        <div className="mt-4 grid gap-5 [&>*]:min-w-0">
          {conflict ? (
            <ConflictNotice innerRef={conflictRef} onReload={() => void reload()} />
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-base font-semibold text-text-primary">Foto</h3>
            {saved.photoUrl !== null ? (
              <img src={`${saved.photoUrl}`} alt={saved.photoAlt === '' ? 'Foto actual de Acerca de' : saved.photoAlt} className="h-auto max-h-64 w-full max-w-md rounded-xl object-cover" />
            ) : (
              <p className="text-sm text-text-muted">Aún no hay foto.</p>
            )}
            <label htmlFor="about-photo" className="text-sm font-medium text-text-primary">
              {saved.photoUrl === null ? 'Subir foto (JPEG, PNG o WebP)' : 'Reemplazar foto (JPEG, PNG o WebP)'}
            </label>
            <input
              id="about-photo"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => void onPhoto(event.target.files?.[0])}
              className={`block w-full text-sm text-text-primary ${FOCUS_RING}`}
            />
            <p className="text-sm text-text-muted">Se publica sin metadatos (ubicación, cámara). Se guarda con la versión {saved.version}.</p>
          </div>

          <div className="grid gap-2">
            <label htmlFor="about-alt" className="text-sm font-medium text-text-primary">
              Texto alternativo de la foto
            </label>
            <input
              id="about-alt"
              type="text"
              maxLength={ABOUT_ALT_MAX_CHARS}
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              aria-describedby={altHint === null ? undefined : 'about-alt-hint'}
              className={FIELD}
            />
            {altHint !== null ? (
              <p id="about-alt-hint" className="text-sm font-medium text-text-primary">
                Aviso: {altHint}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="about-body" className="text-sm font-medium text-text-primary">
                Texto (Markdown básico)
              </label>
              <button type="button" aria-pressed={preview} onClick={() => setPreview((value) => !value)} className={OUTLINE}>
                {preview ? 'Volver al editor' : 'Vista previa'}
              </button>
            </div>
            {preview ? (
              <div
                aria-label="Vista previa del texto"
                role="region"
                data-about-preview
                className={`grid min-h-40 min-w-0 gap-3 rounded-xl border border-slate-300 bg-cream p-4 text-base leading-relaxed [overflow-wrap:anywhere] [&>*]:min-w-0 ${LINK_RING} [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6`}
              >
                <AboutMarkdownView source={body} headingOffset={1} />
              </div>
            ) : (
              <BodyEditor body={body} onChange={setBody} />
            )}
          </div>

          <div>
            <button type="button" onClick={() => void onSave()} aria-disabled={busy ? 'true' : undefined} className={`${PRIMARY} ${busy ? 'opacity-70' : ''}`}>
              {busy ? 'Guardando…' : 'Guardar texto'}
            </button>
          </div>
          <div role="status" className={notice?.kind === 'ok' ? 'text-sm font-medium text-primary' : 'sr-only'}>
            {notice?.kind === 'ok' ? notice.text : ''}
          </div>
          {notice?.kind === 'error' ? (
            <div role="alert" className="text-sm font-medium text-danger">
              {notice.text}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
