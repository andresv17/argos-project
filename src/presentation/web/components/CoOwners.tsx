/**
 * Panel «Propietarios» de la ficha y bandeja de invitaciones y solicitudes (Feature 012, Bloque A, #22; T1617; REQ-OWN12-002, REQ-OWN12-004, REQ-OWN12-006).
 * La ficha muestra al propietario principal y a los co-propietarios (ACTIVE e INVITED), permite invitar por `username` (respuesta uniforme: nunca revela si la cuenta existe), salir, pedir
 * acciones críticas (eliminar la mascota o cambiar de principal) y reconocer el aviso «Ahora eres propietario principal». La bandeja lista las invitaciones recibidas y las solicitudes propias o
 * por decidir. La decisión la toma la API (404 uniforme a terceros); la UI solo ofrece lo que la API permite y traduce sus códigos a texto.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CoOwnershipApiError,
  createCoOwnershipApi,
  ownershipProblemMessage,
  type CoOwnerInvitationView,
  type CoOwnershipApi,
  type OwnerRequestActionName,
  type OwnerRequestItem,
  type OwnershipView,
} from '../co-ownership-api.ts';
import { canOfferLeave } from '../co-ownership-gating.ts';
import { Button } from './Field.tsx';

const messageOf = (error: unknown): string => ownershipProblemMessage(error instanceof CoOwnershipApiError ? error.code : 'ERR-INTERNAL-UNEXPECTED');

const ACTION_LABEL: Readonly<Record<OwnerRequestActionName, string>> = {
  DELETE_PET: 'Eliminar la mascota',
  TRANSFER_PRINCIPAL: 'Transferir la propiedad principal',
  CHANGE_PRINCIPAL: 'Cambiar al propietario principal',
  INVITE_CO_OWNER: 'Invitar a un co-propietario',
  CLAIM_CO_OWNERSHIP: 'Reclamar la co-propiedad',
  CHIP_DISPUTE: 'Disputa de microchip',
};
const STATUS_LABEL: Readonly<Record<string, string>> = {
  PENDING: 'Esperando aprobación',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  UNDER_REVIEW: 'En revisión',
  RESOLVED: 'Resuelta',
};
/** Región live persistente (montada vacía y luego llenada): WCAG 4.1.3. */
function LiveRegions({ error, notice }: { readonly error: string | null; readonly notice: string | null }): JSX.Element {
  return (
    <>
      <div role="alert">
        {error === null ? null : <p className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
      </div>
      <div role="status" aria-live="polite">
        {notice === null ? null : <p className="rounded-2xl border border-primary bg-meadow px-4 py-3 text-sm text-slate-900">{notice}</p>}
      </div>
    </>
  );
}
const dateOf = (iso: string): string => iso.slice(0, 10);

/** Propietarios de la mascota con su estado (texto, no solo color). */
function OwnersList({ ownership }: { readonly ownership: OwnershipView }): JSX.Element {
  return (
    <ul className="grid min-w-0 gap-2" aria-label="Propietarios">
      <li className="rounded-xl border border-border-strong p-3 text-sm text-slate-900">
        <span className="font-semibold">@{ownership.principal.username}</span> · Propietario principal
      </li>
      {ownership.coOwners.map((row) => (
        <li key={row.id} className="rounded-xl border border-border-strong p-3 text-sm text-slate-900">
          <span className="font-semibold">@{row.username}</span> · {row.status === 'INVITED' ? `Invitación pendiente (vence ${dateOf(row.expiresAt)})` : 'Co-propietario'}
        </li>
      ))}
    </ul>
  );
}

/** @implements REQ-OWN12-002, REQ-OWN12-004, REQ-OWN12-006, INV-OWN12-004 */
export function OwnersPanel({ petId, petName, currentUserId, onChanged, onOwnershipLoaded, api = createCoOwnershipApi() }: {
  readonly petId: string;
  readonly petName: string;
  readonly currentUserId: string;
  /** La salida o la eliminación aprobada cambian lo que el usuario ve: la página recarga su lista. */
  readonly onChanged?: () => void;
  /** H-K1: avisa a la ficha del número de propietarios ACTIVE tras cada lectura, para ocultar Eliminar/Transferir. */
  readonly onOwnershipLoaded?: (view: OwnershipView) => void;
  readonly api?: CoOwnershipApi;
}): JSX.Element {
  const [ownership, setOwnership] = useState<OwnershipView | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  // La función de aviso cambia en cada render de la ficha: se lee por referencia para no relanzar la consulta.
  const loadedRef = useRef(onOwnershipLoaded);
  loadedRef.current = onOwnershipLoaded;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmDeleteRef = useRef<HTMLDivElement>(null);
  const deleteMounted = useRef(false);
  const leaveMounted = useRef(false);
  // WCAG 2.4.3: al abrir o cerrar la confirmación de salida el botón pulsado se desmonta; el foco pasa a un elemento estable.
  useEffect(() => {
    if (!leaveMounted.current) {
      leaveMounted.current = true;
      return;
    }
    (confirmLeave ? confirmRef.current : headingRef.current)?.focus();
  }, [confirmLeave]);
  // S-08: igual para la confirmación de «Pedir eliminar la mascota»: foco al grupo al abrir y al encabezado al cerrar.
  useEffect(() => {
    if (!deleteMounted.current) {
      deleteMounted.current = true;
      return;
    }
    (confirmDelete ? confirmDeleteRef.current : headingRef.current)?.focus();
  }, [confirmDelete]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const view = await api.getOwnership(petId);
      setOwnership(view);
      loadedRef.current?.(view);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [api, petId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (work: () => Promise<string | null>, after?: () => void): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      await refresh();
      after?.();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const isPrincipal = ownership?.principal.userId === currentUserId;
  const coOwnersActive = ownership?.coOwners.filter((r) => r.status === 'ACTIVE') ?? [];
  const slotsUsed = 1 + (ownership?.coOwners.length ?? 0);

  return (
    <section aria-labelledby="owners-title" className="grid min-w-0 gap-4">
      <h3 id="owners-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
        Propietarios de {petName}
      </h3>
      <LiveRegions error={error} notice={notice} />
      {ownership === null ? (
        <p className="text-sm text-slate-700">Cargando propietarios…</p>
      ) : (
        <>
          {ownership.promotionNotice.pending ? (
            <div className="grid gap-2 rounded-xl border border-primary bg-meadow p-3">
              <p className="text-sm font-semibold text-slate-900">Ahora eres propietario principal de {petName}.</p>
              <div>
                <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await api.ackPromotion(petId); return null; })}>
                  Entendido
                </Button>
              </div>
            </div>
          ) : null}
          <OwnersList ownership={ownership} />
          <form
            className="grid min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const typed = username.trim();
              if (typed === '') return;
              void run(async () => {
                await api.invite(petId, typed);
                setUsername('');
                // Respuesta uniforme: no se confirma que la cuenta exista (INV-OWN12-004).
                return 'Si ese nombre de usuario puede recibir la invitación, le llegará. La invitación vence a los 7 días.';
              });
            }}
          >
            <label htmlFor="owners-invite" className="text-sm font-semibold text-slate-900">
              Invitar a otro propietario por su nombre de usuario
            </label>
            <input
              id="owners-invite"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              maxLength={32}
              aria-describedby="owners-invite-help"
              className="min-h-12 rounded-xl border border-border-strong bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota"
            />
            <p id="owners-invite-help" className="text-sm text-slate-700">{`Una mascota admite hasta 3 propietarios, contando las invitaciones pendientes (hoy: ${slotsUsed}). Con más de un propietario, las acciones críticas necesitan la aprobación de todos.`}</p>
            <div>
              <Button type="submit" describedBy="owners-invite-help" disabled={busy || username.trim() === '' || slotsUsed >= 3}>
                Enviar invitación
              </Button>
            </div>
          </form>
          {ownership.coOwners.some((r) => r.status === 'INVITED') ? (
            <div className="grid gap-2">
              {ownership.coOwners
                .filter((r) => r.status === 'INVITED')
                .map((row) => (
                  <Button key={row.id} variant="secondary" disabled={busy} ariaLabel={`Cancelar la invitación a @${row.username}`} onClick={() => void run(async () => { await api.cancelInvitation(petId, row.id); return 'Invitación cancelada.'; }, () => headingRef.current?.focus())}>
                    {`Cancelar invitación a @${row.username}`}
                  </Button>
                ))}
            </div>
          ) : null}
          {coOwnersActive.length > 0 ? (
            <div className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3">
              <p className="text-sm font-semibold text-slate-900">Acciones que necesitan la aprobación de los demás propietarios</p>
              <div className="flex flex-wrap gap-2">
                {confirmDelete ? null : (
                  <Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    Pedir eliminar la mascota
                  </Button>
                )}
                {isPrincipal
                  ? coOwnersActive.map((row) => (
                      <Button key={row.id} variant="secondary" disabled={busy} ariaLabel={`Pedir que @${row.username} sea el propietario principal`} onClick={() => void run(async () => { await api.createRequest(petId, { action: 'CHANGE_PRINCIPAL', targetUserId: row.userId }); return `Pediste que @${row.username} sea el propietario principal.`; })}>
                        {`Pasar el principal a @${row.username}`}
                      </Button>
                    ))
                  : null}
              </div>
              {confirmDelete ? (
                <div ref={confirmDeleteRef} tabIndex={-1} role="group" aria-labelledby="owners-delete-title" aria-describedby="owners-delete-desc" onKeyDown={(event) => { if (event.key === 'Escape') setConfirmDelete(false); }} className="grid gap-2 rounded-xl border border-danger bg-red-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
                  <p id="owners-delete-title" className="text-sm font-semibold text-red-900">{`¿Pedir eliminar a ${petName}?`}</p>
                  <p id="owners-delete-desc" className="text-sm text-red-900">Se enviará una solicitud a los demás propietarios. La mascota solo se elimina si todos la aprueban antes de 7 días; mientras tanto no cambia nada.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" disabled={busy} describedBy="owners-delete-desc" onClick={() => void run(async () => { await api.createRequest(petId, { action: 'DELETE_PET' }); return 'Pediste eliminar la mascota. Los demás propietarios deben aprobarlo (vence en 7 días).'; }, () => setConfirmDelete(false))}>
                      Confirmar
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {canOfferLeave(ownership) ? (
          <div className="grid gap-2">
            {confirmLeave ? (
              <div ref={confirmRef} tabIndex={-1} role="group" aria-label="Confirmar la salida" className="grid gap-2 rounded-xl border border-danger bg-red-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
                <p className="text-sm font-semibold text-red-900">
                  {isPrincipal ? 'Vas a salir como propietario principal: el principal pasa al co-propietario más antiguo.' : 'Vas a dejar de ser propietario de esta mascota.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" disabled={busy} onClick={() => void run(async () => { await api.leave(petId); return null; }, () => onChanged?.())}>
                    Sí, salir
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
                    No salir
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
                  Salir de esta mascota
                </Button>
              </div>
            )}
          </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RequestRow({ item, busy, onApprove, onReject, onCancel }: { readonly item: OwnerRequestItem; readonly busy: boolean; readonly onApprove: () => void; readonly onReject: () => void; readonly onCancel: () => void }): JSX.Element {
  const mine = item.role === 'REQUESTER';
  return (
    <li className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3">
      <p className="min-w-0 break-words text-sm text-slate-900">
        <span className="font-semibold">{ACTION_LABEL[item.action]}</span>
        {item.petName === undefined || item.petName === null ? '' : ` · ${item.petName}`}
        {item.requesterUsername === undefined || item.requesterUsername === null ? '' : ` · pedida por @${item.requesterUsername}`}
        {item.targetUsername === undefined || item.targetUsername === null ? '' : ` · para @${item.targetUsername}`}
      </p>
      <p className="text-sm text-slate-700">{`${STATUS_LABEL[item.status] ?? item.status} · vence ${dateOf(item.expiresAt)}`}</p>
      {item.approvers === undefined || item.approvers.length === 0 ? null : (
        <p className="text-sm text-slate-700">{item.approvers.map((a) => `@${a.username}: ${a.vote === 'APPROVED' ? 'aprobó' : a.vote === 'REJECTED' ? 'rechazó' : 'pendiente'}`).join(' · ')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {item.canVote ? (
          <>
            <Button disabled={busy} onClick={onApprove}>Aprobar</Button>
            <Button variant="danger" disabled={busy} onClick={onReject}>Rechazar</Button>
          </>
        ) : null}
        {mine && item.status === 'PENDING' ? (
          <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar mi solicitud</Button>
        ) : null}
      </div>
    </li>
  );
}

/** Bandeja de invitaciones recibidas y de solicitudes propias o por decidir; no se pinta si no hay nada. @implements REQ-OWN12-002, REQ-OWN12-004, INV-OWN12-004 */
export function OwnershipInbox({ onChanged, api = createCoOwnershipApi() }: { readonly onChanged?: () => void; readonly api?: CoOwnershipApi }): JSX.Element | null {
  const [invitations, setInvitations] = useState<CoOwnerInvitationView[] | null>(null);
  const [requests, setRequests] = useState<OwnerRequestItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<string | null>(null);
  const inboxHeadingRef = useRef<HTMLHeadingElement>(null);
  // Tras una acción la sección sigue montada aunque quede vacía: el encabezado es el destino estable del foco (WCAG 2.4.3).
  const [acted, setActed] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [inv, req] = await Promise.all([api.listInvitations(), api.listRequests()]);
      setInvitations(inv);
      setRequests(req.filter((r) => r.status === 'PENDING' || r.status === 'UNDER_REVIEW'));
    } catch (e) {
      setError(messageOf(e));
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (work: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setAnnounce(null);
    setActed(true);
    try {
      await work();
      await refresh();
      // El botón pulsado desaparece con su fila: el foco pasa al encabezado de la bandeja (WCAG 2.4.3) y la región live lo anuncia (4.1.3).
      inboxHeadingRef.current?.focus();
      setAnnounce(done);
      onChanged?.();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const empty = error === null && (invitations?.length ?? 0) === 0 && (requests?.length ?? 0) === 0;
  const live = (
    <div role="status" aria-live="polite" className="sr-only">
      {announce}
    </div>
  );
  if (empty && !acted) return live;
  return (
    <>
    {live}
    <section aria-labelledby="ownership-inbox-title" className="grid min-w-0 gap-3 rounded-2xl border border-border-strong bg-white p-4">
      <h2 id="ownership-inbox-title" ref={inboxHeadingRef} tabIndex={-1} className="text-base font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
        Invitaciones y solicitudes de propiedad
      </h2>
      <div role="alert">{error === null ? null : <p className="rounded-2xl border border-danger bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}</div>
      {empty ? <p className="text-sm text-slate-700">No tienes invitaciones ni solicitudes pendientes.</p> : null}
      {(invitations?.length ?? 0) > 0 ? (
        <ul className="grid min-w-0 gap-2" aria-label="Invitaciones recibidas">
          {invitations!.map((inv) => (
            <li key={inv.coOwnerId} className="grid min-w-0 gap-2 rounded-xl border border-border-strong p-3">
              <p className="min-w-0 break-words text-sm text-slate-900">{`@${inv.invitedByUsername} te invita a ser propietario de ${inv.petName} (vence ${dateOf(inv.expiresAt)}).`}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} ariaLabel={`Aceptar la invitación para ${inv.petName}`} onClick={() => void run(() => api.acceptInvitation(inv.coOwnerId), 'Invitación aceptada.')}>Aceptar</Button>
                <Button variant="secondary" disabled={busy} ariaLabel={`Rechazar la invitación para ${inv.petName}`} onClick={() => void run(() => api.declineInvitation(inv.coOwnerId), 'Invitación rechazada.')}>Rechazar</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {(requests?.length ?? 0) > 0 ? (
        <ul className="grid min-w-0 gap-2" aria-label="Solicitudes de propiedad">
          {requests!.map((item) => (
            <RequestRow
              key={item.id}
              item={item}
              busy={busy}
              onApprove={() => void run(async () => { await api.approve(item.id); }, 'Solicitud aprobada.')}
              onReject={() => void run(async () => { await api.reject(item.id); }, 'Solicitud rechazada.')}
              onCancel={() => void run(() => api.cancelRequest(item.id), 'Solicitud cancelada.')}
            />
          ))}
        </ul>
      ) : null}
    </section>
    </>
  );
}
