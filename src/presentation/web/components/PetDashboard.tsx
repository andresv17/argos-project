/**
 * Ficha de la mascota activa (REQ-PET-003, blueprint §4.3 a §4.7): hero, tarjeta oliva de alertas, edad y peso, y
 * pestañas por módulo (`tablist` WAI-ARIA). Renderiza solo los datos del `PetDashboardView`; los formularios, la edición y
 * la eliminación aparecen únicamente si la matriz `permissions` de la API los permite (REQ-UI2-006, REQ-RBAC-001).
 * Regla D2: el `open` del bloque de alta es estado local, fijado una sola vez al mostrar el módulo por primera vez
 * (abierto si no hay registros) y que solo cambia el usuario; guardar nunca lo cierra.
 *
 * @implements REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-UI-007, REQ-UI2-003, REQ-UI2-006, REQ-BOR-001, REQ-BOR-002, REQ-BOR-003, STATE-ALERT-001
 */
import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertBadge } from './AlertBadge.tsx';
import { Button } from './Field.tsx';
import { OwnerBadge } from './OwnerBadge.tsx';
import { PetAvatar } from './PetAvatar.tsx';
import { RecordActions } from './RecordActions.tsx';
import { RecordForm } from './RecordForm.tsx';
import { SymptomLegend } from './SymptomLegend.tsx';
import { symptomSummary, type SymptomSeverity, type SymptomType } from '../symptoms.ts';
import { WeightChart, WeightTable } from './WeightChart.tsx';
import type { FormBody } from '../validation.ts';
import { RECORD_MODULES, RECORD_SUMMARY, RECORD_WRITE_PERMISSION, type RecordModule } from '../records.ts';
import { formatAge, formatKg, isDeleteConfirmed, isReadOnly, nextFocusIndex, SEX_LABEL, SPECIES_LABEL, type CustomParameterView, type PetDashboardView } from '../view-model.ts';

const CATEGORY_LABEL = Object.fromEntries(
  (RECORD_MODULES.find((m) => m.id === 'customParameters')?.fields.find((f) => f.name === 'category')?.options ?? []).map((o) => [o.value, o.label]),
);
const DEWORMING_LABEL: Readonly<Record<'INTERNAL' | 'EXTERNAL', string>> = { INTERNAL: 'Interna', EXTERNAL: 'Externa' };
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white';

/** Tipo e intensidad de un síntoma como texto neutro: mismo estilo con cualquier intensidad (INV-SIN-002). */
function SymptomSummary({ record }: { readonly record: { readonly category: string; readonly symptomType?: SymptomType | null; readonly severity?: SymptomSeverity | null } }): JSX.Element | null {
  const summary = symptomSummary(record);
  return summary === null ? null : <p className="text-sm text-text-muted">{summary}</p>;
}

function Empty({ canWrite }: { readonly canWrite: boolean }): JSX.Element {
  return (
    <div className="text-sm text-slate-800">
      <p className="font-semibold">Sin registros.</p>
      {canWrite ? <p className="text-text-muted">Registra el primero con el formulario de arriba.</p> : null}
    </div>
  );
}

function ItemList({ children }: { readonly children: ReactNode }): JSX.Element {
  return <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">{children}</ul>;
}

/** Acciones de edición y borrado de un registro vigente; los reemplazados (SUPERSEDED) se listan sin ellas (REQ-BOR-002). */
type ActionsFor = (module: RecordModule, record: object) => ReactNode;

type Vaccination = PetDashboardView['vaccinations'][number];
type Deworming = PetDashboardView['dewormings'][number];

function VaccinationItems({ items, actions }: { readonly items: readonly Vaccination[]; readonly actions?: ActionsFor }): JSX.Element {
  return (
    <ItemList>
      {items.map(({ record, alert }) => (
        <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="text-sm tabular-nums">
            <strong>{record.vaccineName}</strong> · aplicada {record.appliedAt}{record.nextBoosterAt === null ? '' : ` · refuerzo ${record.nextBoosterAt}`}
          </span>
          <AlertBadge alert={alert} />
          {actions?.('vaccinations', record)}
        </li>
      ))}
    </ItemList>
  );
}

function DewormingItems({ items, actions }: { readonly items: readonly Deworming[]; readonly actions?: ActionsFor }): JSX.Element {
  return (
    <ItemList>
      {items.map(({ record, alert }) => (
        <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="text-sm tabular-nums">
            <strong>{record.productBrand}</strong> ({DEWORMING_LABEL[record.dewormingType]}) · aplicada {record.appliedAt} · próxima {record.nextSuggestedDoseAt}
          </span>
          <AlertBadge alert={alert} />
          {actions?.('dewormings', record)}
        </li>
      ))}
    </ItemList>
  );
}

/** Acordeón de registros reemplazados (solo lectura): el semáforo dice «Reemplazada por registro posterior». */
function Superseded({ children, count }: { readonly children: ReactNode; readonly count: number }): JSX.Element | null {
  if (count === 0) return null;
  return (
    <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
      <summary className={`min-h-12 cursor-pointer rounded-full px-2 py-3 text-sm font-semibold text-primary ${RING}`}>{`Registros anteriores (${count})`}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function ModuleContent({ module, dashboard, canWrite, actions }: { readonly module: RecordModule; readonly dashboard: PetDashboardView; readonly canWrite: boolean; readonly actions?: ActionsFor }): JSX.Element {
  switch (module) {
    case 'weights':
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WeightChart entries={dashboard.weights} />
          {dashboard.weights.length === 0 ? null : <WeightTable entries={dashboard.weights} {...(actions === undefined ? {} : { actionsFor: (entry) => actions('weights', entry.record) })} />}
        </div>
      );
    case 'measurements':
      return dashboard.bodyMeasurements.length === 0 ? (
        <Empty canWrite={canWrite} />
      ) : (
        <div role="region" aria-label="Medidas corporales (desplazable)" tabIndex={0} className={`overflow-x-auto rounded-xl ${RING}`}>
          <table className="min-w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Medidas corporales</caption>
            <thead>
              <tr className="border-b border-slate-400">
                <th scope="col" className="px-2 py-1 font-semibold">Fecha</th>
                <th scope="col" className="px-2 py-1 font-semibold">Cuello</th>
                <th scope="col" className="px-2 py-1 font-semibold">Pecho</th>
                <th scope="col" className="px-2 py-1 font-semibold">Lomo</th>
                <th scope="col" className="px-2 py-1 font-semibold">Cintura</th>
                {actions === undefined ? null : <th scope="col" className="px-2 py-1 font-semibold">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {dashboard.bodyMeasurements.map((m) => (
                <tr key={m.id} className="border-b border-slate-200">
                  <td className="px-2 py-1">{m.recordedAt}</td>
                  <td className="whitespace-nowrap px-2 py-1">{m.neckCm.toFixed(2)} cm</td>
                  <td className="whitespace-nowrap px-2 py-1">{m.chestCm.toFixed(2)} cm</td>
                  <td className="whitespace-nowrap px-2 py-1">{m.backLengthCm.toFixed(2)} cm</td>
                  <td className="whitespace-nowrap px-2 py-1">{m.waistCm.toFixed(2)} cm</td>
                  {actions === undefined ? null : <td className="px-2 py-1">{actions('measurements', m)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'vaccinations':
      return (
        <>
          {dashboard.vaccinations.length === 0 ? <Empty canWrite={canWrite} /> : <VaccinationItems items={dashboard.vaccinations} {...(actions === undefined ? {} : { actions })} />}
          <Superseded count={dashboard.supersededVaccinations.length}>
            <VaccinationItems items={dashboard.supersededVaccinations} />
          </Superseded>
        </>
      );
    case 'dewormings':
      return (
        <>
          {dashboard.dewormings.length === 0 ? <Empty canWrite={canWrite} /> : <DewormingItems items={dashboard.dewormings} {...(actions === undefined ? {} : { actions })} />}
          <Superseded count={dashboard.supersededDewormings.length}>
            <DewormingItems items={dashboard.supersededDewormings} />
          </Superseded>
        </>
      );
    case 'visits':
      return dashboard.medicalVisits.length === 0 ? (
        <Empty canWrite={canWrite} />
      ) : (
        <ItemList>
          {dashboard.medicalVisits.map((v) => (
            <li key={v.id} className="p-3">
              <p className="text-sm tabular-nums">
                <strong>{v.visitDate}</strong> · {v.reason} · {v.clinicOrVet}
              </p>
              <p className="text-sm text-text-muted">
                Diagnóstico: {v.diagnosis}. Tratamiento: {v.treatment}.
              </p>
              {actions?.('visits', v)}
            </li>
          ))}
        </ItemList>
      );
    case 'customParameters': {
      const parameters = dashboard.customParameters as readonly CustomParameterView[];
      return parameters.length === 0 ? (
        <Empty canWrite={canWrite} />
      ) : (
        <>
          <ItemList>
            {parameters.map((c) => (
              <li key={c.id} className="p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-pastel-mint px-2 text-xs font-semibold text-emerald-900">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <strong>{c.title}</strong>
                  <span className="tabular-nums text-text-muted">{c.recordedAt}</span>
                </p>
                <SymptomSummary record={c} />
                <p className="text-sm text-text-muted">{c.description}</p>
                {actions?.('customParameters', c)}
              </li>
            ))}
          </ItemList>
          {parameters.some((c) => c.category === 'SYMPTOM') ? <SymptomLegend /> : null}
        </>
      );
    }
  }
}

export function DeletePetDialog({ petName, onConfirm, onCancel }: {
  readonly petName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  return (
    <div role="alertdialog" aria-modal="false" aria-labelledby="delete-pet-title" aria-describedby="delete-pet-desc" className="rounded-2xl border-2 border-danger bg-red-50 p-4">
      <h3 id="delete-pet-title" className="font-semibold text-red-900">
        Eliminar a {petName}
      </h3>
      <p id="delete-pet-desc" className="text-sm text-red-900">
        Se eliminarán la mascota y todos sus registros. No se puede deshacer; exporta un respaldo antes. Escribe el nombre para confirmar.
      </p>
      <label className="mt-2 flex flex-col gap-1 text-sm font-semibold text-slate-900">
        Nombre de la mascota
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className="min-h-12 rounded-xl border border-border-strong bg-white px-3 py-3" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="danger" disabled={!isDeleteConfirmed(typed, petName)} onClick={onConfirm}>
          Eliminar definitivamente
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function AlertIcon({ kind }: { readonly kind: 'overdue' | 'soon' | 'ok' }): JSX.Element {
  const paths = {
    overdue: <path d="M12 4 3 20h18L12 4Zm0 6v5m0 3v.01" />,
    soon: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    ok: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  } as const;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {paths[kind]}
    </svg>
  );
}

/** Tarjeta oliva (decisión D3): recuento completo de `alertsSummary`; «Registrar peso» abre el formulario existente de Peso. */
function AlertsCard({ dashboard, canRegisterWeight, onRegisterWeight }: {
  readonly dashboard: PetDashboardView;
  readonly canRegisterWeight: boolean;
  readonly onRegisterWeight: () => void;
}): JSX.Element {
  const summary = dashboard.alertsSummary;
  return (
    <section aria-labelledby="alerts-title" className="col-span-2 grid content-start gap-2 rounded-2xl bg-primary p-5 text-white shadow-sm lg:col-span-5 lg:row-span-2">
      <h3 id="alerts-title" className="text-lg font-semibold">
        Alertas sanitarias
      </h3>
      <p className="text-2xl font-bold tabular-nums">{`${summary.totalActiveAlerts} alertas activas`}</p>
      <ul className="grid gap-1 text-sm">
        <li className="flex items-center gap-2">
          <AlertIcon kind="overdue" />
          <span className="tabular-nums">{`${summary.overdueCount} vencidas`}</span>
        </li>
        <li className="flex items-center gap-2">
          <AlertIcon kind="soon" />
          <span className="tabular-nums">{`${summary.dueSoonCount} próximas`}</span>
        </li>
        <li className="flex items-center gap-2">
          <AlertIcon kind="ok" />
          <span className="tabular-nums">{`${summary.upToDateCount} al día`}</span>
        </li>
      </ul>
      {summary.totalActiveAlerts === 0 ? <p className="text-sm">Todo al día</p> : null}
      <p className="text-sm">{`Dueño: ${dashboard.owner.displayName}`}</p>
      {canRegisterWeight ? (
        <div>
          <button
            type="button"
            onClick={onRegisterWeight}
            className="min-h-12 rounded-full bg-white px-5 text-sm font-semibold text-primary hover:bg-meadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            Registrar peso
          </button>
        </div>
      ) : null}
    </section>
  );
}

const STAT_CARD = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';

export function PetDashboard({ dashboard, activeTab, onTabChange, onAddRecord, onEditRecord, onDeleteRecord, onEdit, onDelete, onTransfer, editSlot, deleteSlot, transferSlot }: {
  readonly dashboard: PetDashboardView;
  readonly activeTab: RecordModule;
  readonly onTabChange: (tab: RecordModule) => void;
  readonly onAddRecord: (module: RecordModule, body: FormBody) => Promise<void>;
  /** Edición de un registro vigente (REQ-BOR-003); sin ella la ficha no ofrece «Editar» en los registros. */
  readonly onEditRecord?: (module: RecordModule, recordId: string, body: FormBody, revision: number) => Promise<void>;
  /** Borrado físico de un registro vigente (REQ-BOR-001); sin ella la ficha no ofrece «Eliminar» en los registros. */
  readonly onDeleteRecord?: (module: RecordModule, recordId: string) => Promise<void>;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  /** REQ-OWN-001: abre el panel de transferencia; el botón solo existe si lo pasa la página y `transferPetOwnership` es cierto. */
  readonly onTransfer?: () => void;
  /** Modo EDIT: formulario que sustituye al hero y al bento mientras dura. */
  readonly editSlot?: ReactNode;
  /** Modo DELETE: diálogo en línea bajo el hero. */
  readonly deleteSlot?: ReactNode;
  /** Modo TRANSFER: panel en línea bajo el hero. */
  readonly transferSlot?: ReactNode;
}): JSX.Element {
  const { profile, permissions } = dashboard;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const frozenOpen = useRef<Partial<Record<RecordModule, boolean>>>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [focusRequest, requestFocus] = useReducer((n: number) => n + 1, 0);
  const activeIndex = Math.max(0, RECORD_MODULES.findIndex((m) => m.id === activeTab));
  const activeSpec = RECORD_MODULES[activeIndex] ?? RECORD_MODULES[0]!;
  const canWrite = permissions[RECORD_WRITE_PERMISSION[activeSpec.id]];
  const recordCount = {
    weights: dashboard.weights.length,
    measurements: dashboard.bodyMeasurements.length,
    vaccinations: dashboard.vaccinations.length,
    dewormings: dashboard.dewormings.length,
    visits: dashboard.medicalVisits.length,
    customParameters: dashboard.customParameters.length,
  }[activeSpec.id];
  // D2: se fija al montar el panel del módulo (abierto si está vacío) y no se recalcula; solo lo cambia el usuario.
  frozenOpen.current[activeSpec.id] ??= recordCount === 0;
  const formOpen = frozenOpen.current[activeSpec.id] === true;

  useEffect(() => {
    if (focusRequest > 0) document.getElementById('weights-recordedAt')?.focus();
  }, [focusRequest]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextFocusIndex(event.key, index, RECORD_MODULES.length);
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    const spec = RECORD_MODULES[next];
    if (spec !== undefined) onTabChange(spec.id);
  };
  const registerWeight = (): void => {
    frozenOpen.current.weights = true;
    onTabChange('weights');
    rerender();
    requestFocus();
  };
  const readOnly = isReadOnly(permissions);
  const recordActions: ActionsFor | undefined =
    onEditRecord === undefined && onDeleteRecord === undefined
      ? undefined
      : (module, record) => (
          <RecordActions
            key={(record as { id: string }).id}
            module={module}
            record={record as Readonly<Record<string, unknown>>}
            species={profile.species}
            permissions={permissions}
            {...(onEditRecord === undefined ? {} : { onEdit: onEditRecord })}
            {...(onDeleteRecord === undefined ? {} : { onDelete: onDeleteRecord })}
          />
        );

  return (
    <article {...(editSlot === undefined ? { 'aria-labelledby': 'pet-title' } : {})} data-pet-id={profile.id} className="grid min-w-0 grid-cols-1 gap-4">
      {editSlot ?? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
            <section className="col-span-2 flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-7">
              <div className="grid min-w-0 gap-2">
                <h2 id="pet-title" className="break-words text-4xl font-bold lg:text-5xl">
                  {profile.name}
                </h2>
                <p className="text-sm text-text-muted">
                  {SPECIES_LABEL[profile.species]} · {profile.breed} · {SEX_LABEL[profile.sex]} · nació {profile.birthDate}
                </p>
                <OwnerBadge owner={dashboard.owner} readOnly={readOnly} />
                {permissions.editPetBasics || permissions.deletePet || (permissions.transferPetOwnership && onTransfer !== undefined) ? (
                  <div className="flex flex-wrap gap-2">
                    {permissions.editPetBasics ? (
                      <Button variant="secondary" onClick={onEdit}>
                        Editar
                      </Button>
                    ) : null}
                    {permissions.transferPetOwnership && onTransfer !== undefined ? (
                      <Button variant="secondary" onClick={onTransfer}>
                        Transferir propiedad
                      </Button>
                    ) : null}
                    {permissions.deletePet ? (
                      <Button variant="danger" onClick={onDelete}>
                        Eliminar
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0">
                <PetAvatar name={profile.name} avatarUrl={profile.avatarUrl} colorToken={dashboard.owner.colorToken} size={96} />
              </div>
            </section>
            <AlertsCard dashboard={dashboard} canRegisterWeight={permissions.writeWeightsAndMeasurements} onRegisterWeight={registerWeight} />
            <section aria-label="Edad" className={`${STAT_CARD} col-span-1 lg:col-span-3`}>
              <p className="text-sm text-text-muted">Edad</p>
              <p className="text-2xl font-bold tabular-nums">{formatAge(dashboard.computedAge)}</p>
            </section>
            <section aria-label="Último peso" className={`${STAT_CARD} col-span-1 lg:col-span-4`}>
              <p className="text-sm text-text-muted">Último peso</p>
              <p className="text-2xl font-bold tabular-nums">{formatKg(latestWeight(dashboard))}</p>
            </section>
          </div>
          {deleteSlot}
          {transferSlot}
        </>
      )}
      <div role="tablist" aria-label="Módulos de la ficha" className="flex gap-1 overflow-x-auto p-1">
        {RECORD_MODULES.map((spec, index) => {
          const selected = spec.id === activeSpec.id;
          return (
            <button
              key={spec.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={`module-tab-${spec.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`module-panel-${spec.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(spec.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={`relative min-h-12 shrink-0 whitespace-nowrap rounded-full px-4 text-sm text-primary ${RING} ${
                selected ? 'bg-accent font-semibold after:absolute after:inset-x-4 after:bottom-1.5 after:h-0.5 after:bg-primary' : 'font-medium hover:bg-white'
              }`}
            >
              {spec.tabLabel}
            </button>
          );
        })}
      </div>
      <section id={`module-panel-${activeSpec.id}`} role="tabpanel" aria-labelledby={`module-tab-${activeSpec.id}`} tabIndex={0} className={`grid min-w-0 gap-3 rounded-2xl ${RING}`}>
        {canWrite ? (
          <details
            open={formOpen}
            onToggle={(e) => {
              const open = (e.currentTarget as HTMLDetailsElement).open;
              if (frozenOpen.current[activeSpec.id] !== open) {
                frozenOpen.current[activeSpec.id] = open;
                rerender();
              }
            }}
          >
            <summary className={`inline-flex min-h-12 cursor-pointer items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover ${RING}`}>{RECORD_SUMMARY[activeSpec.id]}</summary>
            <RecordForm key={`${profile.id}-${activeSpec.id}`} spec={activeSpec} species={profile.species} onSubmit={(body) => onAddRecord(activeSpec.id, body)} />
          </details>
        ) : null}
        <ModuleContent module={activeSpec.id} dashboard={dashboard} canWrite={canWrite} {...(recordActions === undefined ? {} : { actions: recordActions })} />
      </section>
    </article>
  );
}

/** Peso más reciente de la ficha: la API ordena la evolución con el más reciente primero (INV-SORT-001). */
function latestWeight(dashboard: PetDashboardView): number | null {
  return dashboard.weights[0]?.record.weightKg ?? null;
}
