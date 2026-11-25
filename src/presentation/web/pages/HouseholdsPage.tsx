/**
 * Gestión de hogares: crear, invitar por `username`, ver miembros con su estado, aceptar o rechazar
 * invitaciones (con contador de pendientes), retirar miembros o cancelar invitaciones, abandonar y eliminar.
 * Las acciones visibles dependen de `myRole` de la API; la API aplica INV-HOUSE-002.
 *
 * @implements REQ-UI-006, REQ-UI-007, REQ-UI-004, REQ-UI2-005, REQ-HOUSE2-001, REQ-HOUSE2-002, ERR-HOUSE-OWNER-CANNOT-LEAVE, REQ-HOG11-001, REQ-HOG11-002, REQ-HOG11-005
 *
 * Feature 011 (#64, D11-05 = A): página única con la lista de hogares y el detalle del hogar elegido con pestañas internas Resumen, Miembros, Mascotas, Compartir, Álbum
 * y Escena. Reutiliza los componentes y endpoints existentes (sin ruta ni contrato nuevos, D11-06 = A).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, FormError, SelectField, TextField } from '../components/Field.tsx';
import { InviteeCombobox } from '../components/InviteeCombobox.tsx';
import { HomeScene } from '../components/HomeScene.tsx';
import { ShareLinksPanel } from '../components/ShareLinks.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { useSession } from '../session.tsx';
import { roleHelpText } from '../role-help.ts';
import { ownerSceneVisible } from '../scene-view.ts';
import { useContractForm } from '../use-contract-form.ts';
import type { FieldErrors } from '../validation.ts';
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
  nextFocusIndex,
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
              {roleHelpText(member.membership.role) === null ? null : (
                // REQ-ROL8-001 (#25): frase de lo que el rol puede y no puede hacer, asociada al rol y al selector por aria-describedby.
                <p id={`member-${member.membership.membershipId}-role-help`} data-role-help={member.membership.role} className="w-full text-sm text-text-muted">
                  {roleHelpText(member.membership.role)}
                </p>
              )}
              <span className="flex flex-wrap items-center gap-2">
                {onChangeRole !== undefined && canChangeRole(view, member, myUserId) ? (
                  <label className="flex items-center gap-1 text-sm text-slate-800">
                    <span>Rol de {member.membership.displayName}</span>
                    <select
                      aria-label={`Rol de ${member.membership.displayName}`}
                      {...(roleHelpText(member.membership.role) === null ? {} : { 'aria-describedby': `member-${member.membership.membershipId}-role-help` })}
                      value={member.membership.role}
                      onChange={(e) => onChangeRole(member.membership.userId, e.target.value as HouseholdRole)}
                      className="min-h-11 rounded-xl border border-border-strong bg-white px-2 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota"
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

/** Selector «Rol al unirse» con la frase de ayuda del rol elegido asociada por `aria-describedby` (REQ-ROL8-001, #25); el Administrador no tiene frase aprobada (D8-13). */
export function RoleOnJoinSelect({ householdId, value, onChange, errors }: {
  readonly householdId: string;
  readonly value: string;
  readonly onChange: (name: string, value: string) => void;
  readonly errors: FieldErrors;
}): JSX.Element {
  const help = roleHelpText(value as HouseholdRole);
  return (
    <SelectField
      id={`invite-${householdId}-roleOnJoin`}
      label="Rol al unirse"
      name="roleOnJoin"
      value={value}
      options={[
        { value: 'ADMIN', label: 'Administrador' },
        { value: 'CAREGIVER', label: 'Cuidador' },
        { value: 'READER', label: 'Lector' },
      ]}
      onChange={onChange}
      errors={errors}
      {...(help === null ? {} : { help: <span data-role-help={value}>{help}</span> })}
    />
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
      <InviteeCombobox id={`invite-${householdId}`} householdId={householdId} label="Invitar por usuario" name="username" value={form.values.username ?? ''} onChange={form.onChange} errors={form.errors} />
      <RoleOnJoinSelect householdId={householdId} value={form.values.roleOnJoin ?? 'READER'} onChange={form.onChange} errors={form.errors} />
      <Button type="submit" disabled={form.busy}>
        Invitar
      </Button>
      <div className="w-full">
        <FormError errors={form.errors} message={form.message} />
      </div>
    </form>
  );
}

type PetRow = { readonly profile: { readonly id: string; readonly name: string; readonly ownerUserId: string } };

export const HOUSEHOLD_TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'miembros', label: 'Miembros' },
  { key: 'mascotas', label: 'Mascotas' },
  { key: 'compartir', label: 'Compartir' },
  { key: 'album', label: 'Álbum' },
  { key: 'escena', label: 'Escena' },
] as const;
export type HouseholdTabKey = (typeof HOUSEHOLD_TABS)[number]['key'];
/** Pestaña inicial: «Miembros» conserva lo que la pantalla de hogares ya mostraba primero (REQ-HOG11-002); el orden de las pestañas sigue la spec. */
const DEFAULT_TAB: HouseholdTabKey = 'miembros';

const tabId = (householdId: string, key: string): string => `household-${householdId}-tab-${key}`;
const panelId = (householdId: string): string => `household-${householdId}-panel`;

/** Pestañas internas del detalle del hogar: `tablist` WAI-ARIA con foco itinerante (flechas, Inicio, Fin) y activación automática, como `ContextSelector`. */
export function HouseholdTabs({ householdId, active, onSelect }: { readonly householdId: string; readonly active: HouseholdTabKey; readonly onSelect: (key: HouseholdTabKey) => void }): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextFocusIndex(event.key, index, HOUSEHOLD_TABS.length);
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    const tab = HOUSEHOLD_TABS[next];
    if (tab !== undefined) onSelect(tab.key);
  };
  return (
    <div role="tablist" aria-label="Secciones del hogar" className="flex gap-1 overflow-x-auto p-1">
      {HOUSEHOLD_TABS.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={tabId(householdId, tab.key)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(householdId)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`relative min-h-12 shrink-0 whitespace-nowrap rounded-full px-4 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
              selected ? 'bg-accent font-semibold after:absolute after:inset-x-4 after:bottom-1.5 after:h-0.5 after:bg-primary' : 'font-medium hover:bg-white'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Mascotas asignadas al hogar (endpoint existente de 004/005); `null` mientras carga. */
function useHouseholdPets(householdId: string): { readonly pets: readonly PetRow[] | null; readonly failed: boolean } {
  const { api } = useSession();
  const [pets, setPets] = useState<readonly PetRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setPets(null);
    setFailed(false);
    unwrap(api.GET('/households/{householdId}/pets', { params: { path: { householdId }, query: {} } }))
      .then((result) => {
        if (alive) setPets(result.pets);
      })
      .catch(() => {
        if (alive) {
          setPets([]);
          setFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [api, householdId]);
  return { pets, failed };
}

const PANEL = 'grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

function HouseholdDetail(props: {
  readonly view: HouseholdView;
  readonly tab: HouseholdTabKey;
  readonly onTab: (key: HouseholdTabKey) => void;
  readonly myUserId: string;
  readonly children: JSX.Element | null;
}): JSX.Element {
  const { pets, failed } = useHouseholdPets(props.view.household.id);
  return <HouseholdDetailView {...props} pets={pets} failed={failed} />;
}

/** Vista pura del detalle (exportada para pruebas de presentación; sin cambios en la lógica de permisos). */
export function HouseholdDetailView({ view, tab, onTab, myUserId, pets, failed, children }: {
  readonly view: HouseholdView;
  readonly tab: HouseholdTabKey;
  readonly onTab: (key: HouseholdTabKey) => void;
  readonly myUserId: string;
  readonly pets: readonly PetRow[] | null;
  readonly failed: boolean;
  readonly children: JSX.Element | null;
}): JSX.Element {
  const id = view.household.id;
  const mine = pets === null ? [] : pets.filter((p) => p.profile.ownerUserId === myUserId);
  const activeMembers = view.members.filter((m) => m.membership.status === 'ACTIVE').length;
  const canShare = view.isHouseholdOwner || view.myRole === 'ADMIN';
  const label = HOUSEHOLD_TABS.find((t) => t.key === tab)?.label ?? '';
  return (
    <section aria-labelledby={`household-${id}-title`} data-household-id={id} className="grid min-w-0 gap-3">
      <h2 id={`household-${id}-title`} className="text-xl font-semibold">
        {view.household.name}
      </h2>
      <HouseholdTabs householdId={id} active={tab} onSelect={onTab} />
      <div role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id, tab)} tabIndex={0} className="grid min-w-0 gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
        <h3 className="sr-only">{label}</h3>
        {tab === 'resumen' ? (
          <div className={PANEL}>
            <p className="text-sm">
              Tu rol: {HOUSEHOLD_ROLE_LABEL[view.myRole]}
              {view.isHouseholdOwner ? ' (Propietario)' : ''}
            </p>
            <p className="text-sm">{activeMembers === 1 ? '1 miembro activo' : `${activeMembers} miembros activos`}</p>
            <p className="text-sm">{pets === null ? 'Cargando mascotas…' : pets.length === 1 ? '1 mascota asignada' : `${pets.length} mascotas asignadas`}</p>
          </div>
        ) : null}
        {tab === 'miembros' ? children : null}
        {tab === 'mascotas' || tab === 'album' ? (
          <div className={PANEL}>
            {pets === null ? (
              <p role="status" className="text-sm text-slate-800">Cargando mascotas…</p>
            ) : failed ? (
              <p role="alert" className="text-sm font-semibold text-red-900">No pudimos cargar las mascotas del hogar. Recarga la página para intentarlo de nuevo.</p>
            ) : pets.length === 0 ? (
              <p className="text-sm text-slate-800">Este hogar aún no tiene mascotas asignadas. Quien sea dueño puede asignarlas desde «Editar» en la ficha de la mascota.</p>
            ) : (
              <ul aria-label={tab === 'album' ? `Álbumes de ${view.household.name}` : `Mascotas de ${view.household.name}`} className="divide-y divide-slate-200">
                {pets.map((pet) => (
                  <li key={pet.profile.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>{pet.profile.name}</span>
                    {tab === 'album' ? (
                      <Link to={`/mascotas/${pet.profile.id}/album`} className="min-h-11 content-center font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
                        {`Ver el álbum de ${pet.profile.name}`}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {tab === 'compartir' ? (
          canShare && pets !== null && mine.length > 0 ? (
            <ShareLinksPanel hideScopeChoice petId="" petName={view.household.name} household={{ id, petCount: mine.length }} canCreateLinks />
          ) : (
            <p className={`${PANEL} text-sm text-slate-800`}>
              {pets === null
                ? 'Cargando…'
                : !canShare
                  ? 'Solo el propietario o un Administrador del hogar puede crear enlaces para el veterinario.'
                  : 'Para compartir con tu veterinario, asigna al hogar al menos una mascota tuya.'}
            </p>
          )
        ) : null}
        {tab === 'escena' ? <HomeScene scope={{ kind: 'HOUSEHOLD', householdId: id }} idPrefix={`escena-${view.household.id}`} headingLevel={4} /> : null}
      </div>
    </section>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<HouseholdTabKey>(DEFAULT_TAB);

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

  const current = households.find((h) => h.household.id === selectedId) ?? households[0];
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
          {households.length > 1 ? (
            <nav aria-label="Mis hogares">
              <ul className="flex flex-wrap gap-2">
                {households.map((h) => (
                  <li key={h.household.id}>
                    <button
                      type="button"
                      aria-current={h.household.id === current?.household.id ? 'true' : undefined}
                      onClick={() => {
                        setSelectedId(h.household.id);
                        setTab(DEFAULT_TAB);
                      }}
                      className={`min-h-12 rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota ${h.household.id === current?.household.id ? 'border-primary bg-accent font-semibold text-primary' : 'border-border-strong bg-white text-text-primary'}`}
                    >
                      {h.household.name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {current === undefined ? null : (
            <div key={current.household.id} className="grid gap-2">
              <HouseholdDetail view={current} tab={tab} onTab={setTab} myUserId={user?.id ?? ''}>
                <HouseholdCard
                  view={current}
                  myUserId={user?.id ?? ''}
                  onMemberAction={onMemberAction(current.household.id)}
                  onDelete={() => setPendingDelete(current.household.id)}
                  onChangeRole={onChangeRole(current.household.id)}
                  onTransferOwnership={(userId) => setPendingTransfer({ householdId: current.household.id, userId })}
                  inviteForm={current.isHouseholdOwner ? <InviteForm householdId={current.household.id} onInvited={load} /> : null}
                />
              </HouseholdDetail>
              {pendingTransfer?.householdId === current.household.id ? (
                <div role="alertdialog" aria-labelledby={`transfer-${current.household.id}`} className="rounded-2xl border-2 border-slate-400 bg-white p-4">
                  <p id={`transfer-${current.household.id}`} className="text-sm text-slate-900">
                    {transferHouseholdText(current, pendingTransfer.userId)}
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
              {pendingDelete === current.household.id ? (
                <div role="alertdialog" aria-labelledby={`delete-${current.household.id}`} className="rounded-2xl border-2 border-danger bg-red-50 p-4">
                  <p id={`delete-${current.household.id}`} className="text-sm text-red-900">
                    ¿Eliminar el hogar {current.household.name}? Las mascotas no se borran; dejan de compartirse.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      onClick={() => {
                        setPendingDelete(null);
                        void run(() => unwrap(api.DELETE('/households/{householdId}', { params: { ...CSRF_PARAMS, path: { householdId: current.household.id } } })));
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
          )}
        </div>
      </div>
    </div>
  );
}
