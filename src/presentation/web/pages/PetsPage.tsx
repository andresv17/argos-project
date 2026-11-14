/**
 * Pantalla principal: selector de contexto, filtro, tarjetas y ficha de la mascota activa. Todos los datos
 * llegan de la API; la página solo orquesta peticiones y estado de pantalla.
 *
 * @implements REQ-UI-001, REQ-UI-002, REQ-UI-007, REQ-PET-004
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ContextSelector, PET_PANEL_ID } from '../components/ContextSelector.tsx';
import { Button, FormError } from '../components/Field.tsx';
import { DeletePetDialog, PetDashboard } from '../components/PetDashboard.tsx';
import { PetCardList, PetFilter } from '../components/PetCards.tsx';
import { PetForm } from '../components/PetForm.tsx';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { addRecord, type RecordModule } from '../records.ts';
import { useSession } from '../session.tsx';
import {
  contextOptions,
  MINE_CONTEXT_ID,
  type ContextOption,
  type PetCardView,
  type PetDashboardView,
  type Schemas,
  type Species,
} from '../view-model.ts';

type Mode = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE';

const messageOf = (error: unknown): string => problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));

export function PetsPage(): JSX.Element {
  const { api } = useSession();
  const [options, setOptions] = useState<ContextOption[]>(contextOptions([]));
  const [contextId, setContextId] = useState(MINE_CONTEXT_ID);
  const [q, setQ] = useState('');
  const [species, setSpecies] = useState<Species | ''>('');
  const [cards, setCards] = useState<PetCardView[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<PetDashboardView | null>(null);
  const [activeTab, setActiveTab] = useState<RecordModule>('weights');
  const [mode, setMode] = useState<Mode>('VIEW');
  const [error, setError] = useState<string | null>(null);
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
      const query: { q?: string; species?: Species } = {};
      if (q.trim() !== '') query.q = q.trim();
      if (species !== '') query.species = species;
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
  }, [api, options, contextId, q, species]);

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

  const createPet = async (body: Record<string, string | number>): Promise<void> => {
    const pet = await unwrap(api.POST('/pets', { params: CSRF_PARAMS, body: body as unknown as Schemas['CreatePetInput'] }));
    setMode('VIEW');
    setContextId(MINE_CONTEXT_ID);
    setActivePetId(pet.id);
    await loadCards();
  };

  const editPet = async (body: Record<string, string | number>): Promise<void> => {
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

  const onAddRecord = async (module: RecordModule, body: Record<string, string | number>): Promise<void> => {
    if (activePetId === null) return;
    await addRecord(api, module, activePetId, body);
    await refreshAll();
  };

  const activeOption = options.find((o) => o.id === contextId);
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="sr-only">Mascotas</h1>
      <ContextSelector options={options} activeId={contextId} onSelect={onSelectContext} />
      <div id={PET_PANEL_ID} role="tabpanel" aria-labelledby={`context-tab-${contextId}`} className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label={`Mascotas de ${activeOption?.label ?? 'Mis mascotas'}`} className="grid grid-cols-1 content-start gap-3">
          <PetFilter
            q={q}
            species={species}
            onChange={(nextQ, nextSpecies) => {
              setQ(nextQ);
              setSpecies(nextSpecies);
            }}
          />
          {contextId === MINE_CONTEXT_ID ? (
            <div>
              <Button onClick={() => setMode('CREATE')}>Nueva mascota</Button>
            </div>
          ) : null}
          <PetCardList cards={cards} activePetId={activePetId} onSelect={(id) => {
            setActivePetId(id);
            setMode('VIEW');
          }} />
        </section>
        <section aria-label="Ficha de la mascota" className="grid grid-cols-1 content-start gap-3">
          <FormError message={error} />
          {mode === 'CREATE' ? (
            <PetForm profile={null} households={options.flatMap((o) => (o.context.kind === 'HOUSEHOLD' ? [{ id: o.context.householdId, name: o.label }] : []))} onSubmit={createPet} onCancel={() => setMode('VIEW')} />
          ) : null}
          {mode === 'EDIT' && dashboard !== null && dashboard.permissions.editPetBasics ? (
            <PetForm
              key={`edit-${dashboard.profile.id}`}
              profile={dashboard.profile}
              canAssign={dashboard.permissions.assignPetToHouseholds}
              onSubmit={editPet}
              onCancel={() => setMode('VIEW')}
            />
          ) : null}
          {mode === 'DELETE' && dashboard !== null && dashboard.permissions.editPetBasics ? (
            <DeletePetDialog petName={dashboard.profile.name} onConfirm={() => void deletePet()} onCancel={() => setMode('VIEW')} />
          ) : null}
          {dashboard === null ? (
            <p className="text-slate-700">Selecciona una mascota para ver su ficha.</p>
          ) : (
            <PetDashboard
              key={`dashboard-${dashboard.profile.id}`}
              dashboard={dashboard}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onAddRecord={onAddRecord}
              onEdit={() => setMode('EDIT')}
              onDelete={() => setMode('DELETE')}
            />
          )}
        </section>
      </div>
    </div>
  );
}
