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
 * 012, Bloque E (T1696, ENM-005-E 0.2.2): con `householdPets` (los dos puntos de entrada de hogar, «Mascotas → [HOGAR] → Compartir» y «Hogares → [HOGAR] → Compartir») el panel ofrece «Todas» (enlace de hogar,
 * dinámico, como en 011) o «Solo algunas» (enlace `PETS`, estático, hasta 20) con el MISMO `PetSubsetSelector`; la ficha de la mascota no pasa `householdPets` y sigue creando enlaces `PET` sin selector
 * (REQ-PET11-001). La revocación de un `PETS` avisa antes de que afecta a TODAS sus mascotas (D-1 = (a)) y ofrece «Retirar mi mascota» como acción primaria; `EDGE-012-077` (sin canal de aviso a los
 * afectados por acciones de terceros) queda documentado, sin canal nuevo.
 *
 * @implements REQ-VET-001, REQ-VET-004, REQ-VET-005, SC-005-015, SC-005-019, SC-005-040, SC-005-046, SC-005-051, EDGE-005-22, REQ-HOG11-005, REQ-HOG11-006, EDGE-011-014, REQ-VET12-001, REQ-VET12-002, REQ-VET12-007, D12-19, EDGE-012-077
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Field.tsx';
import { PetSubsetSelector, type SubsetPet } from './PetSubsetSelector.tsx';
import { HOUSEHOLD_LINK_NOTICE } from '../role-help.ts';
import { createShareApi, NEUTRAL_SCOPE_LABEL, ShareApiError, type PetsShareLinkList, type PetsShareLinkView, type ShareApi, type ShareLinkList, type ShareLinkView, type ShareScopeName } from '../share-api.ts';
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
  /**
   * `REQ-HOG11-006` / `REQ-HOG11-005` (011, MIF-011-08): sin elección real de alcance no se pinta «¿Qué quieres compartir?» ni los radios. Con `household` y alcance
   * `HOUSEHOLD` se comparten todas las mascotas elegibles del hogar y se avisa del alcance dinámico (EDGE-011-014); si no, se muestra el nombre de la mascota.
   * 012 (T1702, `D12-19`): la restricción de 011 «el hogar no admite subconjunto» queda sin efecto (revocación parcial de `D11-06 = A`): con `householdPets` el hogar ofrece «Todas» o «Solo algunas».
   */
  readonly hideScopeChoice?: boolean;
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
  /** 012 (T1696): mascotas del hogar que se pueden elegir. SOLO los dos puntos de entrada de hogar la pasan; sin ella (la ficha) no hay selector y el alcance es la mascota. */
  readonly householdPets?: readonly SubsetPet[];
  /** Ids elegidos en el selector (modo «Solo algunas»). */
  readonly selectedPetIds?: readonly string[];
  readonly onPetIds?: (ids: string[]) => void;
  /** `true` = «Todas» (enlace de hogar dinámico); por omisión se muestra el selector. */
  readonly allPets?: boolean;
  readonly onAllPets?: (all: boolean) => void;
  /** Enlaces `PETS` del hogar visibles para quien consulta (`listHouseholdPetsShareLinks`). */
  readonly petsList?: PetsShareLinkList | null;
  /** Retira UNA mascota del enlace sin revocarlo para las demás. */
  readonly onWithdrawPet?: (shareLinkId: string, petId: string) => void;
}

const CARD = 'grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
/** EDGE-011-014 (lock F-05, D11-06 = A): texto aprobado por Neo para el enlace de hogar. */
export const HOUSEHOLD_SCOPE_DYNAMIC_NOTICE = 'Incluye todas las mascotas asignadas a este hogar mientras esté activo';
/** ENM-005-E (D12-19, T1702): aviso del enlace de subconjunto, estático. */
export const PETS_SCOPE_STATIC_NOTICE = 'El enlace incluye solo las mascotas que elijas. Las que añadas después al hogar no aparecerán.';
/** ENM-005-E §5.1 (D-1 = (a)): la revocación y la salida de una mascota del hogar afectan al enlace ENTERO. */
export const PETS_REVOCATION_WARNING = 'Revocar el enlace afecta a todas las mascotas que incluye, también a las de otras personas, y dejará de funcionar de inmediato. Si solo quieres dejar de compartir tu mascota, usa «Retirar mi mascota».';
export const PETS_LEAVE_HOUSEHOLD_WARNING = 'Si una mascota del enlace deja el hogar, o cambia su propietario principal, el enlace entero se revoca y las demás mascotas también dejan de verse.';
/** EDGE-012-077: sin canal de notificaciones; los afectados por acciones de terceros lo ven en la lista (30 días). */
export const PETS_THIRD_PARTY_NOTICE = 'Si otra persona retira una mascota o cambia sus datos de propiedad, el enlace puede quedar revocado sin aviso: míralo en esta lista.';
const LEGEND = 'text-sm font-semibold text-slate-900';
const CHOICE = 'flex min-h-11 items-center gap-2 text-sm text-slate-900';
const INPUT = 'h-5 w-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2';
const BADGE: Readonly<Record<ShareLinkView['status'], string>> = {
  ACTIVE: 'bg-pastel-mint text-primary',
  REVOKED: 'bg-slate-100 text-slate-700',
  EXPIRED: 'bg-pastel-cream text-amber-800',
};
const BADGE_ICON: Readonly<Record<ShareLinkView['status'], string>> = { ACTIVE: '●', REVOKED: '■', EXPIRED: '○' };

/** Rótulo del alcance con `switch` exhaustivo y caso neutro (ENM-005-E §8.3): un valor desconocido NUNCA se rotula como «Hogar compartido» ni como mascota. */
export function scopeText(link: Pick<ShareLinkView, 'scope'>, props: Pick<ShareLinksViewProps, 'petName'>): string {
  const scope: ShareScopeName = link.scope;
  switch (scope) {
    case 'PET':
      return props.petName;
    case 'HOUSEHOLD':
      return 'Hogar compartido';
    case 'PETS':
      return 'Varias mascotas del hogar';
    default:
      return NEUTRAL_SCOPE_LABEL;
  }
}

function PetsLinkRow({ link, props }: { readonly link: PetsShareLinkView; readonly props: ShareLinksViewProps }): JSX.Element {
  const confirming = props.confirmRevokeId === link.id;
  const names = new Map((props.householdPets ?? []).map((pet) => [pet.id, pet.name]));
  const mine = link.petIds.map((id) => ({ id, name: names.get(id) ?? 'Mascota' }));
  return (
    <li className="grid min-w-0 gap-2 rounded-xl border border-slate-200 p-3">
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm text-slate-900">
        <dt className="font-semibold">Alcance</dt>
        <dd className="min-w-0 break-words">{`${scopeText(link, props)}: ${mine.map((pet) => pet.name).join(', ')}`}</dd>
        <dt className="font-semibold">Creado</dt>
        <dd>{formatCalendarDate(link.createdAt)}</dd>
        <dt className="font-semibold">Vence</dt>
        <dd>{formatCalendarDate(link.expiresAt)}</dd>
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
          <p className="text-sm font-semibold text-red-900">{PETS_REVOCATION_WARNING}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={props.busy} onClick={() => props.onConfirmRevoke(link.id)}>
              Revocar enlace
            </Button>
            <Button variant="secondary" onClick={props.onCancelRevoke}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {mine.map((pet) => (
            <Button key={pet.id} disabled={props.busy} ariaLabel={`Retirar mi mascota ${pet.name} del enlace`} onClick={() => props.onWithdrawPet?.(link.id, pet.id)}>
              {mine.length === 1 ? 'Retirar mi mascota' : `Retirar a ${pet.name}`}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => props.onAskRevoke(link.id)}>
            Revocar enlace
          </Button>
        </div>
      )}
    </li>
  );
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

/** «Todas» (hogar dinámico, 011) o «Solo algunas» (`PETS` estático, 012) con el selector único (ENM-005-E, T1696). */
function SubsetChoice(props: ShareLinksViewProps & { readonly householdPets: readonly SubsetPet[] }): JSX.Element {
  const all = props.allPets === true;
  return (
    <div className="grid min-w-0 gap-2">
      <fieldset className="grid gap-1">
        <legend className={LEGEND}>¿Qué mascotas del hogar quieres compartir?</legend>
        <label className={CHOICE}>
          <input type="radio" name="petsMode" value="ALL" checked={all} onChange={() => props.onAllPets?.(true)} aria-describedby="share-household-dynamic" className={INPUT} />
          {`Todas las mascotas del hogar (${props.householdPets.length})`}
        </label>
        <label className={CHOICE}>
          <input type="radio" name="petsMode" value="SOME" checked={!all} onChange={() => props.onAllPets?.(false)} aria-describedby="share-household-dynamic" className={INPUT} />
          Solo algunas mascotas
        </label>
      </fieldset>
      {all ? (
        <p id="share-household-dynamic" className="text-sm text-text-muted">
          {HOUSEHOLD_SCOPE_DYNAMIC_NOTICE}
        </p>
      ) : (
        <>
          <PetSubsetSelector pets={props.householdPets} selectedIds={props.selectedPetIds ?? []} onChange={(ids) => props.onPetIds?.(ids)} />
          <p id="share-household-dynamic" className="text-sm text-text-muted">
            {`${PETS_SCOPE_STATIC_NOTICE} ${PETS_LEAVE_HOUSEHOLD_WARNING}`}
          </p>
        </>
      )}
    </div>
  );
}

export function ShareLinksView(props: ShareLinksViewProps): JSX.Element {
  const { petName, household, canCreateLinks = false, hideScopeChoice = false, now, scope, expiresInDays, includeMicrochip, includeClinicalFiles, includeDeceasedAt, busy, error, created, copyStatus, list, notice, householdPets, petsList } = props;
  // Subconjunto: solo con el hogar y la lista de sus mascotas (los dos puntos de entrada de hogar); la ficha no la pasa.
  const subset = household !== null && householdPets !== undefined && scope === 'HOUSEHOLD';
  const noneSelected = subset && props.allPets !== true && (props.selectedPetIds ?? []).length === 0;
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
          <input id="share-created-url" type="text" readOnly autoComplete="off" value={created.url} onFocus={(e) => e.currentTarget.select()} className="min-h-12 w-full min-w-0 rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota" />
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
          {hideScopeChoice ? (
            <div className="grid gap-1">
              {subset ? (
                <SubsetChoice {...props} householdPets={householdPets} />
              ) : scope === 'HOUSEHOLD' && household !== null ? (
                <>
                  <p className={LEGEND}>{`Se comparten todas las mascotas elegibles del hogar (${household.petCount})`}</p>
                  <p id="share-household-dynamic" className="text-sm text-text-muted">
                    {HOUSEHOLD_SCOPE_DYNAMIC_NOTICE}
                  </p>
                </>
              ) : (
                <p className={LEGEND}>{`Mascota: ${petName}`}</p>
              )}
            </div>
          ) : (
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
                {householdPets === undefined ? `Todo el hogar (${household.petCount} mascotas)` : 'Varias mascotas del hogar'}
              </label>
            )}
            {subset ? (
              <SubsetChoice {...props} householdPets={householdPets} />
            ) : scope === 'HOUSEHOLD' && household !== null ? (
              // EDGE-005-22 (B-4). Texto aprobado por /sati sin cambios (sati-B4-texto-005.md).
              <p id="share-household-dynamic" className="text-sm text-text-muted">
                El enlace sigue al hogar tal como esté: si añades o retiras mascotas del hogar, lo que ve el veterinario cambia.
              </p>
            ) : null}
          </fieldset>
          )}
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
            <Button type="submit" disabled={busy || noneSelected} {...(noneSelected ? { describedBy: 'share-pets-required' } : hideScopeChoice && scope === 'HOUSEHOLD' && household !== null ? { describedBy: 'share-household-dynamic' } : {})}>
              Crear enlace
            </Button>
            <Button variant="secondary" onClick={props.onCancel}>
              Cancelar
            </Button>
          </div>
          {noneSelected ? (
            <p id="share-pets-required" className="text-sm font-semibold text-red-900">
              Elige al menos una mascota para crear el enlace.
            </p>
          ) : null}
          <button type="button" onClick={props.onPreview} className="w-fit min-h-11 text-left text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
            Ver vista previa del resumen
          </button>
        </form>
      )}
      <h4 className="text-sm font-semibold text-slate-900">Enlaces compartidos</h4>
      {(list === null || list.items.length === 0) && (petsList === undefined || petsList === null || petsList.items.length === 0) ? (
        <p className="text-sm text-slate-800">Todavía no has compartido nada. Crea un enlace para que tu veterinario vea el resumen sin cuenta.</p>
      ) : (
        <>
          <p className="text-sm text-text-muted tabular-nums">{`${(petsList ?? list)?.activeCount ?? 0} de ${(petsList ?? list)?.maxActiveLinks ?? 20} enlaces activos`}</p>
          {petsList === undefined || petsList === null ? null : (
            // ENM-005-E §8.3: el número del tope cuenta los enlaces de hogar y de varias mascotas de todas las personas del hogar; esta lista solo muestra los tuyos.
            <p className="text-sm text-text-muted">Cuenta los enlaces de todo el hogar; aquí ves solo los que incluyen tus mascotas.</p>
          )}
          <ul className="grid min-w-0 gap-2">
            {(list?.items ?? []).map((link) => (
              <LinkRow key={link.id} link={link} props={props} />
            ))}
            {(petsList?.items ?? []).map((link) => (
              <PetsLinkRow key={link.id} link={link} props={props} />
            ))}
          </ul>
          {petsList === undefined || petsList === null ? null : <p className="text-sm text-text-muted">{PETS_THIRD_PARTY_NOTICE}</p>}
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
  /** Ver `ShareLinksViewProps.hideScopeChoice`: con `household` el panel crea siempre el enlace de hogar; sin él, el de la mascota. */
  readonly hideScopeChoice?: boolean;
  /**
   * 012 (T1696): mascotas del hogar para elegir un subconjunto. Solo los dos puntos de entrada de hogar (Mascotas → [HOGAR] y Hogares → [HOGAR]) la pasan; la ficha de «Mis mascotas» no, y sigue creando
   * enlaces `PET` sin selector (REQ-PET11-001, SC-012-055).
   */
  readonly householdPets?: readonly SubsetPet[] | undefined;
  readonly api?: ShareApi;
}

/** Contenedor con estado de S4. @implements REQ-VET-001, REQ-VET-005, SC-005-015, SC-005-019, SC-005-040, SC-005-046, SC-005-051 */
export function ShareLinksPanel({ petId, petName, household, canCreateLinks = false, hideScopeChoice = false, householdPets, api: apiProp }: ShareLinksPanelProps): JSX.Element {
  const api = useMemo(() => apiProp ?? createShareApi(), [apiProp]);
  const navigate = useNavigate();
  const defaultScope: ShareScopeName = hideScopeChoice && household !== null ? 'HOUSEHOLD' : 'PET';
  const [scope, setScope] = useState<ShareScopeName>(defaultScope);
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
  // 012 (T1696): «Todas» (enlace de hogar dinámico) por defecto; «Solo algunas» abre el selector, con todas las mascotas marcadas de entrada.
  const subsetEnabled = household !== null && householdPets !== undefined;
  const [allPets, setAllPets] = useState(true);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>(() => (householdPets ?? []).map((pet) => pet.id));
  const [petsList, setPetsList] = useState<PetsShareLinkList | null>(null);

  const ref = useCallback((s: ShareScopeName) => (s === 'HOUSEHOLD' && household !== null ? ({ scope: 'HOUSEHOLD', id: household.id } as const) : ({ scope: 'PET', id: petId } as const)), [household, petId]);
  const householdId = household?.id ?? null;
  const refresh = useCallback(
    async (s: ShareScopeName): Promise<void> => {
      try {
        const result = await api.list(ref(s));
        setList(result);
        if (result.serverNow !== null) setNow(result.serverNow);
        if (subsetEnabled && householdId !== null) setPetsList(await api.listPets(householdId));
      } catch (e) {
        setError(shareProblemMessage(e instanceof ShareApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED'));
      }
    },
    [api, ref, subsetEnabled, householdId],
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
      // 012 (ENM-005-E §3.5): «Todas» crea un enlace de hogar; «Solo algunas» (aunque coincida con todas) crea un `PETS` estático.
      const subsetSelected = scope === 'HOUSEHOLD' && subsetEnabled && !allPets && householdId !== null;
      const options = { expiresInDays, includeMicrochip, includeClinicalFiles, includeDeceasedAt };
      const outcome = subsetSelected ? await api.createPetsShareLink(householdId, { ...options, petIds: selectedPetIds }, idempotencyKey.current) : await api.create(ref(scope), options, idempotencyKey.current);
      idempotencyKey.current = null;
      if (outcome.kind === 'CREATED') {
        setCreated({ url: outcome.url, scopeLabel: scope === 'PET' ? petName : subsetSelected ? `${selectedPetIds.length} ${selectedPetIds.length === 1 ? 'mascota' : 'mascotas'} del hogar` : `Hogar compartido · ${household?.petCount ?? 0} mascotas`, expiresAt: outcome.link.expiresAt, includeMicrochip: outcome.link.includeMicrochip, includeClinicalFiles: outcome.link.includeClinicalFiles });
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

  const withdrawPet = async (shareLinkId: string, petIdToWithdraw: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.withdrawPet(shareLinkId, petIdToWithdraw);
      setNotice('Mascota retirada del enlace');
      await refresh(scope);
    } catch (e) {
      setError(shareProblemMessage(e instanceof ShareApiError ? e.code : 'ERR-INTERNAL-UNEXPECTED'));
      await refresh(scope); // 404 uniforme: el enlace ya cambió (retirada hecha, revocado o vencido); se muestra el estado vigente
    } finally {
      setBusy(false);
    }
  };

  const preview = (): void => {
    const query = `includeMicrochip=${String(includeMicrochip)}&includeClinicalFiles=${String(includeClinicalFiles)}${includeDeceasedAt ? '&includeDeceasedAt=true' : ''}`;
    // La vista previa del subconjunto lleva la lista candidata (mismas mascotas y orden que verá el veterinario, SC-012-065).
    const subsetQuery = scope === 'HOUSEHOLD' && subsetEnabled && !allPets ? `${selectedPetIds.map((id) => `petIds=${encodeURIComponent(id)}`).join('&')}&` : '';
    navigate(scope === 'HOUSEHOLD' && household !== null ? `/households/${household.id}/resumen?${subsetQuery}${query}` : `/mascotas/${petId}/resumen?${query}`);
  };

  return (
    <ShareLinksView
      petName={petName}
      household={household === null ? null : { petCount: household.petCount }}
      canCreateLinks={canCreateLinks}
      hideScopeChoice={hideScopeChoice}
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
        setScope(defaultScope);
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
      {...(subsetEnabled
        ? {
            householdPets,
            selectedPetIds,
            onPetIds: (ids: string[]) => {
              idempotencyKey.current = null;
              setSelectedPetIds(ids);
            },
            allPets,
            onAllPets: (all: boolean) => {
              idempotencyKey.current = null;
              setAllPets(all);
            },
            petsList,
            onWithdrawPet: (linkId: string, id: string) => void withdrawPet(linkId, id),
          }
        : {})}
    />
  );
}
