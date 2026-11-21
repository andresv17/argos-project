/**
 * «Compartir con mi veterinario» (S4 de `/sati`, T767; REQ-VET-001, REQ-VET-004, REQ-VET-005, SC-005-015, SC-005-019, SC-005-040, SC-005-046): crear un enlace de solo
 * lectura (alcance mascota u hogar, caducidad 1/7/30 días con 7 por defecto, casillas de microchip y archivos clínicos DESMARCADAS por defecto, D5-14 y D5-21), copiar la
 * URL una sola vez, listar los enlaces (solo metadatos, con `activeCount`) y revocar con confirmación en línea (D5-22). Es una sección, no un modal (320 px frágil).
 * Solo se pinta para el propietario legal y el ADMIN (D5-10); el servidor vuelve a comprobarlo. La URL con el token vive únicamente en el estado de React hasta pulsar
 * «Listo»: no se guarda en el almacenamiento del navegador, ni en el historial, ni en el título. Cada casilla es una decisión nueva (no se recuerda entre sesiones).
 *
 * `ShareLinksView` es presentacional; `ShareLinksPanel` es el contenedor con estado y peticiones. La clave `Idempotency-Key` se genera una vez por intento de
 * creación y se reutiliza en cada reintento hasta que la creación tiene éxito o cambia el formulario (EDGE-005-16/17).
 *
 * @implements REQ-VET-001, REQ-VET-004, REQ-VET-005, SC-005-015, SC-005-019, SC-005-040, SC-005-046, SC-005-051, EDGE-005-22
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Field.tsx';
import { HOUSEHOLD_LINK_NOTICE } from '../role-help.ts';
import { createShareApi, ShareApiError, type ShareApi, type ShareLinkList, type ShareLinkView, type ShareScopeName } from '../share-api.ts';
import { expiryText, formatCalendarDate, shareProblemMessage, STATUS_LABEL } from '../share-view.ts';

const EXPIRY_CHOICES = [
  { days: 1, label: '1 día' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
] as const;

/** Referencia estable: enfoca el título «Enlace creado» solo al montarse el resultado (WCAG 4.1.3; el formulario enfocado se desmonta). */
const focusOnMount = (el: HTMLElement | null): void => el?.focus();

export interface CreatedLinkView {
  readonly url: string;
  readonly scopeLabel: string;
  readonly expiresAt: string;
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  readonly includeDeceasedAt?: boolean;
}

export interface ShareLinksViewProps {
  readonly petName: string;
  /** Alcance hogar: solo si la mascota está en un hogar donde el usuario es propietario o ADMIN y posee mascotas; `petCount` = las que se compartirían. */
  readonly household: { readonly petCount: number } | null;
  /** Quien puede crear enlaces (propietario legal o ADMIN, REQ-VET-001): solo a él se le muestra el aviso de hogar (REQ-ROL8-002, EDGE-008-049). Por omisión `false`. */
  readonly canCreateLinks?: boolean;
  /** Instante actual del servidor para el texto «Vence el…» (la presentación no lee el reloj). */
  readonly now: string;
  readonly scope: ShareScopeName;
  readonly expiresInDays: 1 | 7 | 30;
  readonly includeMicrochip: boolean;
  readonly includeClinicalFiles: boolean;
  /** Opt-in de la fecha de fallecimiento (007, T1026); desmarcada por defecto. */
  readonly includeDeceasedAt?: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly created: CreatedLinkView | null;
  readonly copyStatus: 'IDLE' | 'COPIED' | 'FAILED';
  readonly list: ShareLinkList | null;
  readonly confirmRevokeId: string | null;
  readonly notice: string | null;
  readonly onScope: (scope: ShareScopeName) => void;
  readonly onExpiry: (days: 1 | 7 | 30) => void;
  readonly onMicrochip: (checked: boolean) => void;
  readonly onClinicalFiles: (checked: boolean) => void;
  readonly onDeceasedAt?: (checked: boolean) => void;
  readonly onCreate: () => void;
  readonly onCancel: () => void;
  readonly onCopy: () => void;
  readonly onDone: () => void;
  readonly onAskRevoke: (id: string) => void;
  readonly onConfirmRevoke: (id: string) => void;
  readonly onCancelRevoke: () => void;
  readonly onPreview: () => void;
}

const CARD = 'grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
const LEGEND = 'text-sm font-semibold text-slate-900';
const CHOICE = 'flex min-h-11 items-center gap-2 text-sm text-slate-900';
const INPUT = 'h-5 w-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
const BADGE: Readonly<Record<ShareLinkView['status'], string>> = {
  ACTIVE: 'bg-pastel-mint text-primary',
  REVOKED: 'bg-slate-100 text-slate-700',
  EXPIRED: 'bg-pastel-cream text-amber-800',
};
const BADGE_ICON: Readonly<Record<ShareLinkView['status'], string>> = { ACTIVE: '●', REVOKED: '■', EXPIRED: '○' };

function scopeText(link: ShareLinkView, props: ShareLinksViewProps): string {
  return link.scope === 'PET' ? props.petName : `Hogar compartido · ${props.household?.petCount ?? 0} mascotas`;
}

function LinkRow({ link, props }: { readonly link: ShareLinkView; readonly props: ShareLinksViewProps }): JSX.Element {
  const confirming = props.confirmRevokeId === link.id;
  return (
    <li className="grid min-w-0 gap-2 rounded-xl border border-slate-200 p-3">
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm text-slate-900">
        <dt className="font-semibold">Alcance</dt>
        <dd className="min-w-0 break-words">{scopeText(link, props)}</dd>
        <dt className="font-semibold">Creado</dt>
        <dd>{formatCalendarDate(link.createdAt)}</dd>
        <dt className="font-semibold">Vence</dt>
        <dd>{formatCalendarDate(link.expiresAt)}</dd>
        <dt className="font-semibold">Datos</dt>
        <dd>{`Microchip: ${link.includeMicrochip ? 'Incluido' : 'No incluido'} · Archivos clínicos: ${link.includeClinicalFiles ? 'Incluidos' : 'No incluidos'}`}</dd>
        <dt className="font-semibold">Estado</dt>
        <dd>
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${BADGE[link.status]}`}>
            <span aria-hidden="true">{BADGE_ICON[link.status]}</span>
            {STATUS_LABEL[link.status]}
          </span>
        </dd>
      </dl>
      {link.status !== 'ACTIVE' ? null : confirming ? (
        <div className="grid gap-2 rounded-xl border border-danger bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">¿Revocar este enlace? Dejará de funcionar de inmediato.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={props.busy} onClick={() => props.onConfirmRevoke(link.id)}>
              Revocar
            </Button>
            <Button variant="secondary" onClick={props.onCancelRevoke}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => props.onAskRevoke(link.id)}>
            Revocar
          </Button>
        </div>
      )}
    </li>
  );
}

export function ShareLinksView(props: ShareLinksViewProps): JSX.Element {
  const { petName, household, canCreateLinks = false, now, scope, expiresInDays, includeMicrochip, includeClinicalFiles, includeDeceasedAt, busy, error, created, copyStatus, list, notice } = props;
  return (
    <section aria-labelledby="share-links-title" className={CARD}>
      <h3 id="share-links-title" className="text-base font-semibold text-slate-900">
        Compartir con mi veterinario
      </h3>
      {error === null ? null : (
        <p role="alert" className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {notice === null ? null : (
        <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </p>
      )}
      {created !== null ? (
        <div role="status" className="grid min-w-0 gap-2 rounded-xl border border-primary bg-meadow p-3">
          <h4 id="share-created-title" ref={focusOnMount} tabIndex={-1} className="text-sm font-semibold text-slate-900">
            Enlace creado
          </h4>
          <label htmlFor="share-created-url" className="sr-only">
            Enlace para tu veterinario
          </label>
          <input id="share-created-url" type="text" readOnly autoComplete="off" value={created.url} onFocus={(e) => e.currentTarget.select()} className="min-h-12 w-full min-w-0 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={props.onCopy}>Copiar enlace</Button>
            <p role="status" className="text-sm text-slate-900">
              {copyStatus === 'COPIED' ? 'Enlace copiado' : copyStatus === 'FAILED' ? 'No se pudo copiar. Selecciona el texto y cópialo.' : ''}
            </p>
          </div>
          <p className="text-sm font-semibold text-red-900">Este enlace no se vuelve a mostrar. Cópialo ahora.</p>
          <p className="text-sm text-slate-900">
            {`Alcance: ${created.scopeLabel} · ${expiryLabelFrom(created.expiresAt)} · Microchip: ${created.includeMicrochip ? 'incluido' : 'no incluido'} · Archivos clínicos: ${created.includeClinicalFiles ? 'incluidos' : 'no incluidos'}`}
          </p>
          <div>
            <Button variant="secondary" onClick={props.onDone}>
              Listo
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid min-w-0 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            props.onCreate();
          }}
        >
          <fieldset className="grid gap-1" {...(canCreateLinks ? { 'aria-describedby': 'share-household-hint' } : {})}>
            <legend className={LEGEND}>¿Qué quieres compartir?</legend>
            {canCreateLinks ? (
              // REQ-ROL8-002 (#25, D8-13): aviso aprobado por Neo; solo quien puede crear enlaces lo ve y no promete mascotas ajenas (EDGE-008-049).
              <p id="share-household-hint" data-share-household-hint className="text-sm text-text-muted">
                {HOUSEHOLD_LINK_NOTICE}
              </p>
            ) : null}
            <label className={CHOICE}>
              <input type="radio" name="scope" value="PET" checked={scope === 'PET'} onChange={() => props.onScope('PET')} className={INPUT} />
              {`Solo esta mascota (${petName})`}
            </label>
            {household === null ? null : (
              <label className={CHOICE}>
                <input type="radio" name="scope" value="HOUSEHOLD" checked={scope === 'HOUSEHOLD'} onChange={() => props.onScope('HOUSEHOLD')} aria-describedby={scope === 'HOUSEHOLD' ? 'share-household-dynamic' : undefined} className={INPUT} />
                {`Todo el hogar (${household.petCount} mascotas)`}
              </label>
            )}
            {scope === 'HOUSEHOLD' && household !== null ? (
              // EDGE-005-22 (B-4). Texto aprobado por /sati sin cambios (sati-B4-texto-005.md).
              <p id="share-household-dynamic" className="text-sm text-text-muted">
                El enlace sigue al hogar tal como esté: si añades o retiras mascotas del hogar, lo que ve el veterinario cambia.
              </p>
            ) : null}
          </fieldset>
          <fieldset className="grid gap-1">
            <legend className={LEGEND}>¿Cuánto tiempo estará disponible?</legend>
            {EXPIRY_CHOICES.map((choice) => (
              <label key={choice.days} className={CHOICE}>
                <input type="radio" name="expiresInDays" value={String(choice.days)} checked={expiresInDays === choice.days} onChange={() => props.onExpiry(choice.days)} className={INPUT} />
                {choice.label}
              </label>
            ))}
            {now === '' ? null : <p className="text-sm text-text-muted">{expiryText(now, expiresInDays)}</p>}
          </fieldset>
          <div className="grid gap-1">
            <label className={CHOICE}>
              <input type="checkbox" name="includeMicrochip" checked={includeMicrochip} onChange={(e) => props.onMicrochip(e.target.checked)} aria-describedby="share-microchip-help" className={INPUT} />
              Incluir el número de microchip
            </label>
            <p id="share-microchip-help" className="text-sm text-text-muted">
              Si no la marcas, el resumen no muestra el microchip.
            </p>
            <label className={CHOICE}>
              <input type="checkbox" name="includeClinicalFiles" checked={includeClinicalFiles} onChange={(e) => props.onClinicalFiles(e.target.checked)} aria-describedby="share-files-help" className={INPUT} />
              Incluir archivos clínicos
            </label>
            <p id="share-files-help" className="text-sm text-text-muted">
              Si no la marcas, el veterinario no ve ni descarga tus archivos clínicos.
            </p>
            <label className={CHOICE}>
              <input type="checkbox" name="includeDeceasedAt" checked={includeDeceasedAt ?? false} onChange={(e) => props.onDeceasedAt?.(e.target.checked)} aria-describedby="share-deceased-help" className={INPUT} />
              Incluir la fecha de fallecimiento
            </label>
            <p id="share-deceased-help" className="text-sm text-text-muted">
              Solo aplica a mascotas fallecidas. Si no la marcas, el resumen indica que la mascota falleció pero no la fecha.
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-900">Quien tenga el enlace puede ver el resumen sin iniciar sesión, hasta que venza o lo revoques.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Crear enlace
            </Button>
            <Button variant="secondary" onClick={props.onCancel}>
              Cancelar
            </Button>
          </div>
          <button type="button" onClick={props.onPreview} className="w-fit min-h-11 text-left text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Ver vista previa del resumen
          </button>
        </form>
      )}
      <h4 className="text-sm font-semibold text-slate-900">Enlaces compartidos</h4>
      {list === null || list.items.length === 0 ? (
        <p className="text-sm text-slate-800">Todavía no has compartido nada. Crea un enlace para que tu veterinario vea el resumen sin cuenta.</p>
      ) : (
        <>
          <p className="text-sm text-text-muted tabular-nums">{`${list.activeCount} de ${list.maxActiveLinks} enlaces activos`}</p>
          <ul className="grid min-w-0 gap-2">
            {list.items.map((link) => (
              <LinkRow key={link.id} link={link} props={props} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** «Vence el 25 nov 2026» a partir del instante de caducidad devuelto por la API. */
const expiryLabelFrom = (expiresAt: string): string => `Vence el ${formatCalendarDate(expiresAt)}`;

export interface ShareLinksPanelProps {
  readonly petId: string;
  readonly petName: string;
  /** Hogar compartible desde la ficha (el contexto activo es un hogar donde el usuario es propietario o ADMIN) con las mascotas propias que entrarían. */
  readonly household: { readonly id: string; readonly petCount: number } | null;
  /** Quien puede crear enlaces (propietario legal o ADMIN): habilita el aviso de hogar (REQ-ROL8-002). */
  readonly canCreateLinks?: boolean;
  readonly api?: ShareApi;
}

/** Contenedor con estado de S4. @implements REQ-VET-001, REQ-VET-005, SC-005-015, SC-005-019, SC-005-040, SC-005-046, SC-005-051 */
export function ShareLinksPanel({ petId, petName, household, canCreateLinks = false, api = createShareApi() }: ShareLinksPanelProps): JSX.Element {
  const navigate = useNavigate();
  const [scope, setScope] = useState<ShareScopeName>('PET');
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [includeMicrochip, setIncludeMicrochip] = useState(false);
  const [includeClinicalFiles, setIncludeClinicalFiles] = useState(false);
  const [includeDeceasedAt, setIncludeDeceasedAt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLinkView | null>(null);
  const [copyStatus, setCopyStatus] = useState<'IDLE' | 'COPIED' | 'FAILED'>('IDLE');
  const [list, setList] = useState<ShareLinkList | null>(null);
  /** «Ahora» del servidor (cabecera `Date` de la lista): la presentación no lee el reloj del navegador. */
  const [now, setNow] = useState('');
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const ref = useCallback((s: ShareScopeName) => (s === 'HOUSEHOLD' && household !== null ? ({ scope: 'HOUSEHOLD', id: household.id } as const) : ({ scope: 'PET', id: petId } as const)), [household, petId]);
  const refresh = useCallback(
    async (s: ShareScopeName): Promise<void> => {
      try {
        const result = await api.list(ref(s));
        setList(result);
        if (result.serverNow !== null) setNow(result.serverNow);
      } catch (e) {
        setError(shareProblemMessage(e instanceof ShareApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED'));
      }
    },
    [api, ref],
  );
  useEffect(() => {
    void refresh(scope);
  }, [refresh, scope]);

  // Cambiar cualquier opción es otro intento de creación: la clave de idempotencia anterior no se reutiliza.
  const changed = <T,>(setter: (value: T) => void) => (value: T) => {
    idempotencyKey.current = null;
    setter(value);
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    // nosemgrep: tests.security.sast-rules.argos-no-entropy-outside-adapters — la SPA genera Idempotency-Key de cliente en el navegador (INV-ARCH-004 prohíbe importar infrastructure/ en web/).
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const outcome = await api.create(ref(scope), { expiresInDays, includeMicrochip, includeClinicalFiles, includeDeceasedAt }, idempotencyKey.current);
      idempotencyKey.current = null;
      if (outcome.kind === 'CREATED') {
        setCreated({ url: outcome.url, scopeLabel: scope === 'PET' ? petName : `Hogar compartido · ${household?.petCount ?? 0} mascotas`, expiresAt: outcome.link.expiresAt, includeMicrochip: outcome.link.includeMicrochip, includeClinicalFiles: outcome.link.includeClinicalFiles });
        setCopyStatus('IDLE');
      } else {
        setNotice('Ese enlace ya se había creado; su dirección no se puede volver a mostrar. Revócalo y crea otro si la perdiste.');
      }
      await refresh(scope);
    } catch (e) {
      setError(shareProblemMessage(e instanceof ShareApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    if (created === null) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopyStatus('COPIED');
    } catch {
      setCopyStatus('FAILED');
    }
  };

  const revoke = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.revoke(id);
      setConfirmRevokeId(null);
      setNotice('Enlace revocado');
      await refresh(scope);
    } catch (e) {
      setError(shareProblemMessage(e instanceof ShareApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED'));
    } finally {
      setBusy(false);
    }
  };

  const preview = (): void => {
    const query = `includeMicrochip=${String(includeMicrochip)}&includeClinicalFiles=${String(includeClinicalFiles)}${includeDeceasedAt ? '&includeDeceasedAt=true' : ''}`;
    navigate(scope === 'HOUSEHOLD' && household !== null ? `/households/${household.id}/resumen?${query}` : `/mascotas/${petId}/resumen?${query}`);
  };

  return (
    <ShareLinksView
      petName={petName}
      household={household === null ? null : { petCount: household.petCount }}
      canCreateLinks={canCreateLinks}
      now={now}
      scope={scope}
      expiresInDays={expiresInDays}
      includeMicrochip={includeMicrochip}
      includeClinicalFiles={includeClinicalFiles}
      includeDeceasedAt={includeDeceasedAt}
      busy={busy}
      error={error}
      created={created}
      copyStatus={copyStatus}
      list={list}
      confirmRevokeId={confirmRevokeId}
      notice={notice}
      onScope={changed(setScope)}
      onExpiry={changed(setExpiresInDays)}
      onMicrochip={changed(setIncludeMicrochip)}
      onClinicalFiles={changed(setIncludeClinicalFiles)}
      onDeceasedAt={changed(setIncludeDeceasedAt)}
      onCreate={() => void create()}
      onCancel={() => {
        idempotencyKey.current = null;
        setExpiresInDays(7);
        setIncludeMicrochip(false);
        setIncludeClinicalFiles(false);
        setIncludeDeceasedAt(false);
        setScope('PET');
        setError(null);
      }}
      onCopy={() => void copy()}
      onDone={() => {
        setCreated(null);
        setCopyStatus('IDLE');
      }}
      onAskRevoke={setConfirmRevokeId}
      onConfirmRevoke={(id) => void revoke(id)}
      onCancelRevoke={() => setConfirmRevokeId(null)}
      onPreview={preview}
    />
  );
}
