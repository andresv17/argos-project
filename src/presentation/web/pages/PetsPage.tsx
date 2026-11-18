/**
 * Pantalla principal: selector de contexto, filtro, tarjetas y ficha de la mascota activa. Todos los datos
 * llegan de la API; la página solo orquesta peticiones y estado de pantalla.
 *
 * @implements REQ-UI-001, REQ-UI-002, REQ-UI-007, REQ-PET-004, REQ-CLI5-001
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '../use-debounced-value.ts';
import { ContextSelector, PET_PANEL_ID } from '../components/ContextSelector.tsx';
import { Button, FormError } from '../components/Field.tsx';
import { DeletePetDialog, PetDashboard } from '../components/PetDashboard.tsx';
import { PetCardList, PetFilter } from '../components/PetCards.tsx';
import { PetTransferPanel } from '../components/TransferOwnership.tsx';
import { PetForm, type PetFormBody } from '../components/PetForm.tsx';
import { AvatarEditor } from '../components/AvatarCropper.tsx';
import { ClinicalFilesPanel } from '../components/ClinicalFilesPanel.tsx';
import { Link } from 'react-router-dom';
import { ApiProblem, CSRF_PARAMS, RECORD_CONFLICT_CODE, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { addRecord, deleteRecord, updateRecord, type RecordModule } from '../records.ts';
import type { FormBody } from '../validation.ts';
import { useSession } from '../session.tsx';
import {
  contextOptions,
  MINE_CONTEXT_ID,
  type ContextOption,
  type PetCardView,
  type PetDashboardView,
  type PetFilterValue,
  avatarVersionOf,
  type Schemas,
} from '../view-model.ts';

type Mode = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'TRANSFER';

const messageOf = (error: unknown): string => problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));

export function PetsPage(): JSX.Element {
  const { api } = useSession();
  const [options, setOptions] = useState<ContextOption[]>(contextOptions([]));
  const [contextId, setContextId] = useState(MINE_CONTEXT_ID);
  const [q, setQ] = useState('');
  const [species, setSpecies] = useState<PetFilterValue | ''>('');
  const searchText = useDebouncedValue(q);
  const [cards, setCards] = useState<PetCardView[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<PetDashboardView | null>(null);
  const [activeTab, setActiveTab] = useState<RecordModule>('weights');
  const [mode, setMode] = useState<Mode>('VIEW');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cardsRequest = useRef(0);
  const dashboardRequest = useRef(0);

  useEffect(() => {
    unwrap(api.GET('/households'))
      .then((households) => setOptions(contextOptions(households)))
      .catch((e: unknown) => setError(messageOf(e)));
  }, [api]);

  const loadCards = useCallback(async (): Promise<void> => {
    const ticket = ++cardsRequest.current;
    const context = options.find((o) => o.id === contextId)?.context ?? { kind: 'MINE' as const };
    try {
      const query: { q?: string; filter?: PetFilterValue } = {};
      if (searchText.trim() !== '') query.q = searchText.trim();
      if (species !== '') query.filter = species;
      const next: PetCardView[] =
        context.kind === 'MINE'
          ? await unwrap(api.GET('/pets', { params: { query } }))
          : (await unwrap(api.GET('/households/{householdId}/pets', { params: { path: { householdId: context.householdId }, query } }))).pets;
      if (ticket !== cardsRequest.current) return;
      setCards(next);
      setActivePetId((current) => (current !== null && next.some((c) => c.profile.id === current) ? current : (next[0]?.profile.id ?? null)));
    } catch (e) {
      if (ticket === cardsRequest.current) setError(messageOf(e));
    }
  }, [api, options, contextId, searchText, species]);

  const loadDashboard = useCallback(async (): Promise<void> => {
    const ticket = ++dashboardRequest.current;
    if (activePetId === null) {
      setDashboard(null);
      return;
    }
    try {
      const view = await unwrap(api.GET('/pets/{petId}/dashboard', { params: { path: { petId: activePetId } } }));
      if (ticket === dashboardRequest.current) setDashboard(view);
    } catch (e) {
      if (ticket === dashboardRequest.current) setError(messageOf(e));
    }
  }, [api, activePetId]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);
  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const refreshAll = async (): Promise<void> => {
    await loadCards();
    await loadDashboard();
  };

  const onSelectContext = (id: string): void => {
    setContextId(id);
    setMode('VIEW');
    setError(null);
  };

  const createPet = async (body: PetFormBody): Promise<void> => {
    const pet = await unwrap(api.POST('/pets', { params: CSRF_PARAMS, body: body as unknown as Schemas['CreatePetInput'] }));
    setMode('VIEW');
    setContextId(MINE_CONTEXT_ID);
    setActivePetId(pet.id);
    await loadCards();
  };

  const editPet = async (body: PetFormBody): Promise<void> => {
    if (activePetId === null) return;
    await unwrap(api.PATCH('/pets/{petId}', { params: { ...CSRF_PARAMS, path: { petId: activePetId } }, body: body as Schemas['UpdatePetInput'] }));
    setMode('VIEW');
    await refreshAll();
  };

  const deletePet = async (): Promise<void> => {
    if (activePetId === null) return;
    try {
      await unwrap(api.DELETE('/pets/{petId}', { params: { ...CSRF_PARAMS, path: { petId: activePetId } } }));
      setMode('VIEW');
      setActivePetId(null);
      await loadCards();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const onAddRecord = async (module: RecordModule, body: FormBody): Promise<void> => {
    if (activePetId === null) return;
    await addRecord(api, module, activePetId, body);
    await refreshAll();
  };

  const onEditRecord = async (module: RecordModule, recordId: string, body: FormBody, revision: number): Promise<void> => {
    if (activePetId === null) return;
    try {
      await updateRecord(api, module, activePetId, recordId, body, revision);
    } catch (e) {
      // REQ-BOR-005: ante un 409 de revisión se recarga la ficha para que la persona vea lo que cambió y reintente con la revisión vigente.
      if (e instanceof ApiProblem && e.problem.code === RECORD_CONFLICT_CODE) await refreshAll();
      throw e;
    }
    await refreshAll();
  };

  const onDeleteRecord = async (module: RecordModule, recordId: string): Promise<void> => {
    if (activePetId === null) return;
    await deleteRecord(api, module, activePetId, recordId);
    await refreshAll();
  };

  const isMine = contextId === MINE_CONTEXT_ID;
  const filtered = q.trim() !== '' || species !== '';
  const emptyHint = filtered ? undefined : isMine ? 'Usa «Nueva mascota» para añadir la primera.' : 'Quien sea dueño puede asignar mascotas al hogar desde Editar.';
  const householdChoices = options.flatMap((o) => (o.context.kind === 'HOUSEHOLD' ? [{ id: o.context.householdId, name: o.label }] : []));
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <h1 className="sr-only">Mascotas</h1>
      <ContextSelector options={options} activeId={contextId} onSelect={onSelectContext} />
      <div id={PET_PANEL_ID} role="tabpanel" aria-labelledby={`context-tab-${contextId}`} className="grid min-w-0 grid-cols-1 gap-4">
        <PetFilter
          q={q}
          species={species}
          onChange={(nextQ, nextSpecies) => {
            setQ(nextQ);
            setSpecies(nextSpecies);
          }}
        />
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[156px_minmax(0,1fr)]">
          <section aria-label="Mascotas del contexto" className="flex min-w-0 flex-col gap-3">
            <PetCardList
              cards={cards}
              activePetId={activePetId}
              {...(emptyHint === undefined ? {} : { emptyHint })}
              onSelect={(id) => {
                setActivePetId(id);
                setMode('VIEW');
              }}
            />
            {isMine ? (
              <div>
                <Button onClick={() => setMode('CREATE')}>Nueva mascota</Button>
              </div>
            ) : null}
          </section>
          <section aria-label="Ficha de la mascota" className="grid min-w-0 grid-cols-1 content-start gap-3">
            <FormError message={error} />
            {notice === null ? null : (
              <p role="status" className="rounded-2xl border border-emerald-700 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {notice}
              </p>
            )}
            {mode === 'CREATE' ? (
              <PetForm profile={null} households={householdChoices} onSubmit={createPet} onCancel={() => setMode('VIEW')} />
            ) : dashboard === null ? (
              <p className="text-sm font-semibold text-slate-800">Selecciona una mascota para ver su ficha.</p>
            ) : (
              <PetDashboard
                key={`dashboard-${dashboard.profile.id}`}
                dashboard={dashboard}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onAddRecord={onAddRecord}
                onEditRecord={onEditRecord}
                onDeleteRecord={onDeleteRecord}
                onEdit={() => setMode('EDIT')}
                onDelete={() => setMode('DELETE')}
                onTransfer={() => {
                  setNotice(null);
                  setMode('TRANSFER');
                }}
                {...(mode === 'EDIT' && dashboard.permissions.editPetBasics
                  ? {
                      editSlot: (
                        <>
                          <PetForm
                            key={`edit-${dashboard.profile.id}`}
                            profile={dashboard.profile}
                            canAssign={dashboard.permissions.assignPetToHouseholds}
                            onSubmit={editPet}
                            onCancel={() => setMode('VIEW')}
                          />
                          <AvatarEditor
                            key={`avatar-${dashboard.profile.id}`}
                            petId={dashboard.profile.id}
                            petName={dashboard.profile.name}
                            avatarVersion={avatarVersionOf(dashboard.profile)}
                            onChanged={refreshAll}
                          />
                        </>
                      ),
                    }
                  : {})}
                mediaSlot={
                  <>
                    <ClinicalFilesPanel
                      key={`media-${dashboard.profile.id}`}
                      petId={dashboard.profile.id}
                      canUpload={dashboard.permissions.writeHealthEvents}
                      canDelete={dashboard.permissions.deleteHealthEvents}
                    />
                    <Link
                      to={`/mascotas/${dashboard.profile.id}/album`}
                      className="text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      Ver el álbum de fotos
                    </Link>
                  </>
                }
                {...(mode === 'TRANSFER' && dashboard.permissions.transferPetOwnership
                  ? {
                      transferSlot: (
                        <PetTransferPanel
                          key={`transfer-${dashboard.profile.id}`}
                          petId={dashboard.profile.id}
                          petName={dashboard.profile.name}
                          ownerUserId={dashboard.profile.ownerUserId}
                          onTransferred={async (text) => {
                            setMode('VIEW');
                            setNotice(text);
                            await refreshAll();
                          }}
                          onCancel={() => setMode('VIEW')}
                        />
                      ),
                    }
                  : {})}
                {...(mode === 'DELETE' && dashboard.permissions.deletePet
                  ? { deleteSlot: <DeletePetDialog petName={dashboard.profile.name} onConfirm={() => void deletePet()} onCancel={() => setMode('VIEW')} /> }
                  : {})}
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
