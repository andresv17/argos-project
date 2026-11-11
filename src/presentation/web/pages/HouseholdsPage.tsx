/**
 * Gestión de hogares: crear, invitar por `username`, ver miembros con su estado, aceptar o rechazar
 * invitaciones (con contador de pendientes), retirar miembros o cancelar invitaciones, abandonar y eliminar.
 * Las acciones visibles dependen de `myRole` de la API; la API aplica INV-HOUSE-002.
 *
 * @implements REQ-UI-006, REQ-UI-007, REQ-UI-004, ERR-HOUSE-OWNER-CANNOT-LEAVE
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, FormError, TextField } from '../components/Field.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { useSession } from '../session.tsx';
import { useContractForm } from '../use-contract-form.ts';
import { useInvitations } from './AppShell.tsx';
import {
  canDeleteHousehold,
  invitationsLabel,
  MEMBER_ACTION_LABEL,
  MEMBERSHIP_LABEL,
  memberActions,
  ownerBadge,
  type HouseholdView,
  type MemberAction,
  type Schemas,
} from '../view-model.ts';

type InvitationView = Schemas['InvitationView'];

const messageOf = (error: unknown): string => problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));

export function InvitationList({ invitations, onAccept, onDecline }: {
  readonly invitations: readonly InvitationView[];
  readonly onAccept: (householdId: string) => void;
  readonly onDecline: (householdId: string) => void;
}): JSX.Element {
  return (
    <section aria-labelledby="invitations-title" className="grid gap-2 rounded border border-slate-300 bg-white p-4">
      <h2 id="invitations-title" className="text-lg font-semibold">
        Invitaciones <span className="text-sm font-normal text-slate-700">({invitationsLabel(invitations.length)})</span>
      </h2>
      {invitations.length === 0 ? (
        <p className="text-slate-700">No tienes invitaciones pendientes.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {invitations.map((inv) => (
            <li key={inv.household.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{inv.household.name}</strong> · invita {inv.invitedBy.displayName} (@{inv.invitedBy.username})
              </span>
              <span className="flex gap-2">
                <Button onClick={() => onAccept(inv.household.id)}>Aceptar</Button>
                <Button variant="secondary" onClick={() => onDecline(inv.household.id)}>
                  Rechazar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function HouseholdCard({ view, myUserId, onMemberAction, onDelete, inviteForm }: {
  readonly view: HouseholdView;
  readonly myUserId: string;
  readonly onMemberAction: (userId: string, action: MemberAction) => void;
  readonly onDelete: () => void;
  readonly inviteForm: JSX.Element | null;
}): JSX.Element {
  const titleId = `household-${view.household.id}-title`;
  return (
    <section aria-labelledby={titleId} data-household-id={view.household.id} className="grid gap-3 rounded border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          {view.household.name} <span className="text-sm font-normal text-slate-700">· tu rol: {view.isHouseholdOwner ? 'Propietario' : 'Miembro'}</span>
        </h3>
        {canDeleteHousehold(view) ? (
          <Button variant="danger" onClick={onDelete}>
            Eliminar hogar
          </Button>
        ) : null}
      </div>
      <ul aria-label={`Miembros de ${view.household.name}`} className="divide-y divide-slate-200">
        {view.members.map((member) => {
          const badge = ownerBadge({ userId: member.membership.userId, displayName: member.membership.displayName, colorToken: member.colorToken ?? null });
          return (
            <li key={member.membership.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex flex-wrap items-center gap-2">
                {badge.style === null ? (
                  <span>{member.membership.displayName}</span>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={badge.style}>
                    {member.membership.displayName}
                  </span>
                )}
                <span className="text-sm text-slate-700">@{member.membership.username}</span>
                <span data-membership-status={member.membership.status} className="rounded border border-slate-500 px-2 py-0.5 text-xs font-semibold text-slate-800">
                  {MEMBERSHIP_LABEL[member.membership.status]}
                </span>
                {member.membership.isHouseholdOwner ? <span className="text-xs font-semibold text-slate-800">Propietario</span> : null}
              </span>
              <span className="flex gap-2">
                {memberActions(view, member, myUserId).map((action) => (
                  <Button key={action} variant={action === 'LEAVE' ? 'secondary' : 'danger'} onClick={() => onMemberAction(member.membership.userId, action)}>
                    {MEMBER_ACTION_LABEL[action]}
                  </Button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      {inviteForm}
    </section>
  );
}

function InviteForm({ householdId, onInvited }: { readonly householdId: string; readonly onInvited: () => Promise<void> }): JSX.Element {
  const { api } = useSession();
  const form = useContractForm({
    schema: 'InviteMemberInput',
    initial: { username: '' },
    resetOnSuccess: true,
    send: async (body) => {
      await unwrap(api.POST('/households/{householdId}/invitations', { params: { ...CSRF_PARAMS, path: { householdId } }, body: body as Schemas['InviteMemberInput'] }));
      await onInvited();
    },
  });
  return (
    <form noValidate aria-label="Invitar miembro" onSubmit={(e) => void form.onSubmit(e)} className="flex flex-wrap items-end gap-2">
      <TextField id={`invite-${householdId}`} label="Invitar por usuario" name="username" required value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
      <Button type="submit" disabled={form.busy}>
        Invitar
      </Button>
      <div className="w-full">
        <FormError errors={form.errors} message={form.message} />
      </div>
    </form>
  );
}

export function HouseholdsPage(): JSX.Element {
  const { api, user } = useSession();
  const invitationsState = useInvitations();
  const [households, setHouseholds] = useState<HouseholdView[]>([]);
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [h, i] = await Promise.all([unwrap(api.GET('/households')), unwrap(api.GET('/invitations'))]);
      setHouseholds(h);
      setInvitations(i);
      invitationsState.refresh();
    } catch (e) {
      setError(messageOf(e));
    }
  }, [api, invitationsState]);

  useEffect(() => {
    void load();
  }, [api]);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const createForm = useContractForm({
    schema: 'CreateHouseholdInput',
    initial: { name: '' },
    resetOnSuccess: true,
    send: async (body) => {
      await unwrap(api.POST('/households', { params: CSRF_PARAMS, body: body as Schemas['CreateHouseholdInput'] }));
      await load();
    },
  });

  const onMemberAction = (householdId: string) => (userId: string): void => {
    void run(() => unwrap(api.DELETE('/households/{householdId}/members/{userId}', { params: { ...CSRF_PARAMS, path: { householdId, userId } } })));
  };

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-bold">Hogares</h1>
      <FormError message={error} />
      <InvitationList
        invitations={invitations}
        onAccept={(householdId) => void run(() => unwrap(api.POST('/invitations/{householdId}/accept', { params: { ...CSRF_PARAMS, path: { householdId } } })))}
        onDecline={(householdId) => void run(() => unwrap(api.POST('/invitations/{householdId}/decline', { params: { ...CSRF_PARAMS, path: { householdId } } })))}
      />
      <form noValidate aria-label="Crear hogar" onSubmit={(e) => void createForm.onSubmit(e)} className="flex flex-wrap items-end gap-2 rounded border border-slate-300 bg-white p-4">
        <TextField id="household-name" label="Nombre del nuevo hogar" name="name" required value={createForm.values.name ?? ''} onChange={createForm.onChange} errors={createForm.errors} />
        <Button type="submit" disabled={createForm.busy}>
          Crear hogar
        </Button>
        <div className="w-full">
          <FormError errors={createForm.errors} message={createForm.message} />
        </div>
      </form>
      {households.length === 0 ? <p className="text-slate-700">Aún no perteneces a ningún hogar.</p> : null}
      {households.map((view) => (
        <div key={view.household.id} className="grid gap-2">
          <HouseholdCard
            view={view}
            myUserId={user?.id ?? ''}
            onMemberAction={onMemberAction(view.household.id)}
            onDelete={() => setPendingDelete(view.household.id)}
            inviteForm={view.isHouseholdOwner ? <InviteForm householdId={view.household.id} onInvited={load} /> : null}
          />
          {pendingDelete === view.household.id ? (
            <div role="alertdialog" aria-labelledby={`delete-${view.household.id}`} className="rounded border border-red-700 bg-red-50 p-3">
              <p id={`delete-${view.household.id}`} className="text-sm text-red-900">
                ¿Eliminar el hogar {view.household.name}? Las mascotas no se borran; dejan de compartirse.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="danger"
                  onClick={() => {
                    setPendingDelete(null);
                    void run(() => unwrap(api.DELETE('/households/{householdId}', { params: { ...CSRF_PARAMS, path: { householdId: view.household.id } } })));
                  }}
                >
                  Confirmar eliminación
                </Button>
                <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
