/**
 * Gestión de hogares: crear, invitar por `username`, ver miembros con su estado, aceptar o rechazar
 * invitaciones (con contador de pendientes), retirar miembros o cancelar invitaciones, abandonar y eliminar.
 * Las acciones visibles dependen de `myRole` de la API; la API aplica INV-HOUSE-002.
 *
 * @implements REQ-UI-006, REQ-UI-007, REQ-UI-004, REQ-UI2-005, REQ-HOUSE2-001, REQ-HOUSE2-002, ERR-HOUSE-OWNER-CANNOT-LEAVE
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, FormError, SelectField, TextField } from '../components/Field.tsx';
import { HomeScene } from '../components/HomeScene.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { useSession } from '../session.tsx';
import { ownerSceneVisible } from '../scene-view.ts';
import { useContractForm } from '../use-contract-form.ts';
import { useInvitations } from './AppShell.tsx';
import {
  canChangeRole,
  canDeleteHousehold,
  canTransferHousehold,
  HOUSEHOLD_ROLE_LABEL,
  invitationsLabel,
  MEMBER_ACTION_LABEL,
  MEMBERSHIP_LABEL,
  memberActions,
  ownerBadge,
  type HouseholdView,
  type HouseholdRole,
  type MemberAction,
  type Schemas,
} from '../view-model.ts';

type InvitationView = Schemas['InvitationView'];

const ASSIGNABLE_ROLES: readonly HouseholdRole[] = ['ADMIN', 'CAREGIVER', 'READER'];

const messageOf = (error: unknown): string => problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));

/** Aviso previo a transferir el hogar: el anterior propietario conserva ADMIN (INV-HOUSE2-001). */
export function transferHouseholdText(view: HouseholdView, targetUserId: string): string {
  const target = view.members.find((m) => m.membership.userId === targetUserId)?.membership.displayName ?? 'el miembro elegido';
  return `¿Transferir la propiedad del hogar ${view.household.name} a ${target}? Conservarás el rol de Administrador.`;
}

export function InvitationList({ invitations, onAccept, onDecline }: {
  readonly invitations: readonly InvitationView[];
  readonly onAccept: (householdId: string) => void;
  readonly onDecline: (householdId: string) => void;
}): JSX.Element {
  return (
    <section aria-labelledby="invitations-title" className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="invitations-title" className="text-lg font-semibold">
        Invitaciones <span className="text-sm font-normal text-text-muted">({invitationsLabel(invitations.length)})</span>
      </h2>
      {invitations.length === 0 ? (
        <p className="text-sm text-text-muted">No tienes invitaciones pendientes.</p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {invitations.map((inv) => (
            <li key={inv.household.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 break-words text-sm">
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

export function HouseholdCard({ view, myUserId, onMemberAction, onDelete, inviteForm, onChangeRole, onTransferOwnership, sceneSlot }: {
  readonly view: HouseholdView;
  readonly myUserId: string;
  readonly onMemberAction: (userId: string, action: MemberAction) => void;
  readonly onDelete: () => void;
  readonly inviteForm: JSX.Element | null;
  /** REQ-HOUSE2-002 CHANGE_ROLE: si falta, no se ofrece el selector. */
  readonly onChangeRole?: (userId: string, role: HouseholdRole) => void;
  /** REQ-HOUSE2-002 TRANSFER_OWNERSHIP: si falta, no se ofrece el botón. */
  readonly onTransferOwnership?: (userId: string) => void;
  /** Escena del hogar (feature 006, D6-04 = A): va en el encabezado de la tarjeta, antes de los miembros. */
  readonly sceneSlot?: JSX.Element;
}): JSX.Element {
  const titleId = `household-${view.household.id}-title`;
  return (
    <section aria-labelledby={titleId} data-household-id={view.household.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-lg font-semibold">
          {view.household.name}{' '}
          <span className="text-sm font-normal text-text-muted">
            · tu rol: {HOUSEHOLD_ROLE_LABEL[view.myRole]}
            {view.isHouseholdOwner ? ' (Propietario)' : ''}
          </span>
        </h3>
        {canDeleteHousehold(view) ? (
          <Button variant="danger" onClick={onDelete}>
            Eliminar hogar
          </Button>
        ) : null}
      </div>
      {sceneSlot ?? null}
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
                <span className="text-sm text-text-muted">@{member.membership.username}</span>
                <span data-member-role={member.membership.role} className="rounded-full border border-border-strong bg-white px-2 py-0.5 text-xs font-semibold text-slate-800">
                  {HOUSEHOLD_ROLE_LABEL[member.membership.role]}
                </span>
                <span data-membership-status={member.membership.status} className="rounded-full border border-border-strong bg-white px-2 py-0.5 text-xs font-semibold text-slate-800">
                  {MEMBERSHIP_LABEL[member.membership.status]}
                </span>
                {member.membership.isHouseholdOwner ? <span className="text-xs font-semibold text-slate-800">Propietario</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {onChangeRole !== undefined && canChangeRole(view, member, myUserId) ? (
                  <label className="flex items-center gap-1 text-sm text-slate-800">
                    <span>Rol de {member.membership.displayName}</span>
                    <select
                      aria-label={`Rol de ${member.membership.displayName}`}
                      value={member.membership.role}
                      onChange={(e) => onChangeRole(member.membership.userId, e.target.value as HouseholdRole)}
                      className="min-h-10 rounded-xl border border-border-strong bg-white px-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {HOUSEHOLD_ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {onTransferOwnership !== undefined && canTransferHousehold(view, member, myUserId) ? (
                  <Button variant="secondary" onClick={() => onTransferOwnership(member.membership.userId)}>
                    Transferir propiedad
                  </Button>
                ) : null}
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
    // [FIX B-1] roleOnJoin es obligatorio en InviteMemberInput; sin él la API responde 422 (ui_blueprint §3.4). Valor inicial READER.
    initial: { username: '', roleOnJoin: 'READER' },
    resetOnSuccess: true,
    send: async (body) => {
      await unwrap(api.POST('/households/{householdId}/invitations', { params: { ...CSRF_PARAMS, path: { householdId } }, body: body as Schemas['InviteMemberInput'] }));
      await onInvited();
    },
  });
  return (
    <form noValidate aria-label="Invitar miembro" onSubmit={(e) => void form.onSubmit(e)} className="flex flex-wrap items-end gap-3">
      <TextField id={`invite-${householdId}`} label="Invitar por usuario" name="username" required value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
      <SelectField
        id={`invite-${householdId}-roleOnJoin`}
        label="Rol al unirse"
        name="roleOnJoin"
        value={form.values.roleOnJoin ?? 'READER'}
        options={[
          { value: 'ADMIN', label: 'Administrador' },
          { value: 'CAREGIVER', label: 'Cuidador' },
          { value: 'READER', label: 'Lector' },
        ]}
        onChange={form.onChange}
        errors={form.errors}
      />
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
  const [loaded, setLoaded] = useState(false);
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<{ householdId: string; userId: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [h, i] = await Promise.all([unwrap(api.GET('/households')), unwrap(api.GET('/invitations'))]);
      setHouseholds(h);
      setLoaded(true);
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
      const created = await unwrap(api.POST('/households', { params: CSRF_PARAMS, body: body as Schemas['CreateHouseholdInput'] }));
      await load();
      setNotice(`Hogar «${created.household.name}» creado. Tu rol: ${HOUSEHOLD_ROLE_LABEL[created.myRole]}.`);
    },
  });

  const onMemberAction = (householdId: string) => (userId: string): void => {
    void run(() => unwrap(api.DELETE('/households/{householdId}/members/{userId}', { params: { ...CSRF_PARAMS, path: { householdId, userId } } })));
  };

  const onChangeRole = (householdId: string) => (userId: string, role: HouseholdRole): void => {
    setNotice(null);
    void run(() => unwrap(api.PATCH('/households/{householdId}/members/{userId}', { params: { ...CSRF_PARAMS, path: { householdId, userId } }, body: { role } })));
  };

  const confirmTransfer = (): void => {
    if (pendingTransfer === null) return;
    const { householdId, userId } = pendingTransfer;
    setPendingTransfer(null);
    setNotice(null);
    void run(async () => {
      await unwrap(api.POST('/households/{householdId}/ownership-transfer', { params: { ...CSRF_PARAMS, path: { householdId } }, body: { targetUserId: userId } }));
      setNotice('Propiedad del hogar transferida. Conservas el rol de Administrador.');
    });
  };

  return (
    <div className="grid min-w-0 gap-4">
      <h1 className="text-2xl font-bold">Hogares</h1>
      <FormError message={error} />
      {notice === null ? null : (
        <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </p>
      )}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 lg:col-span-1">
          <InvitationList
            invitations={invitations}
            onAccept={(householdId) => void run(() => unwrap(api.POST('/invitations/{householdId}/accept', { params: { ...CSRF_PARAMS, path: { householdId } } })))}
            onDecline={(householdId) => void run(() => unwrap(api.POST('/invitations/{householdId}/decline', { params: { ...CSRF_PARAMS, path: { householdId } } })))}
          />
          <form
            noValidate
            aria-label="Crear hogar"
            onSubmit={(e) => {
              setNotice(null);
              void createForm.onSubmit(e);
            }}
            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <TextField id="household-name" label="Nombre del nuevo hogar" name="name" required value={createForm.values.name ?? ''} onChange={createForm.onChange} errors={createForm.errors} />
            <div>
              <Button type="submit" disabled={createForm.busy}>
                Crear hogar
              </Button>
            </div>
            <FormError errors={createForm.errors} message={createForm.message} />
          </form>
        </div>
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
          {households.length === 0 ? <p className="text-sm font-semibold text-slate-800">Aún no perteneces a ningún hogar.</p> : null}
          {/* Sin hogares (N2-15 = B): la escena del propietario se gestiona aquí, con el retiro de consentimiento; se oculta sola si está vacía (SC-ESC6-109). */}
          {ownerSceneVisible(loaded, households.length) ? <HomeScene scope={{ kind: 'OWNER' }} idPrefix="escena-mine" headingLevel={2} /> : null}
          {households.map((view) => (
            <div key={view.household.id} className="grid gap-2">
              <HouseholdCard
                view={view}
                myUserId={user?.id ?? ''}
                onMemberAction={onMemberAction(view.household.id)}
                onDelete={() => setPendingDelete(view.household.id)}
                onChangeRole={onChangeRole(view.household.id)}
                onTransferOwnership={(userId) => setPendingTransfer({ householdId: view.household.id, userId })}
                inviteForm={view.isHouseholdOwner ? <InviteForm householdId={view.household.id} onInvited={load} /> : null}
                sceneSlot={<HomeScene scope={{ kind: 'HOUSEHOLD', householdId: view.household.id }} idPrefix={`escena-${view.household.id}`} headingLevel={4} />}
              />
              {pendingTransfer?.householdId === view.household.id ? (
                <div role="alertdialog" aria-labelledby={`transfer-${view.household.id}`} className="rounded-2xl border-2 border-slate-400 bg-white p-4">
                  <p id={`transfer-${view.household.id}`} className="text-sm text-slate-900">
                    {transferHouseholdText(view, pendingTransfer.userId)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="danger" onClick={confirmTransfer}>
                      Confirmar transferencia
                    </Button>
                    <Button variant="secondary" onClick={() => setPendingTransfer(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
              {pendingDelete === view.household.id ? (
                <div role="alertdialog" aria-labelledby={`delete-${view.household.id}`} className="rounded-2xl border-2 border-danger bg-red-50 p-4">
                  <p id={`delete-${view.household.id}`} className="text-sm text-red-900">
                    ¿Eliminar el hogar {view.household.name}? Las mascotas no se borran; dejan de compartirse.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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
      </div>
    </div>
  );
}
