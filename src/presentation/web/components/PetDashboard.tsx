/**
 * Ficha de la mascota activa (REQ-PET-003): perfil, dueño, resumen de alertas y pestañas por módulo
 * (`tablist` WAI-ARIA). Renderiza solo los datos del `PetDashboardView` del `activePetId`. Formularios,
 * edición y eliminación solo si `canEdit`.
 *
 * @implements REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-UI-007, STATE-ALERT-001
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertBadge } from './AlertBadge.tsx';
import { Button } from './Field.tsx';
import { OwnerBadge } from './OwnerBadge.tsx';
import { RecordForm } from './RecordForm.tsx';
import { WeightChart, WeightTable } from './WeightChart.tsx';
import { RECORD_MODULES, type RecordModule } from '../records.ts';
import { alertCounters, formatAge, isDeleteConfirmed, nextFocusIndex, petActions, SEX_LABEL, SPECIES_LABEL, type PetDashboardView } from '../view-model.ts';

const CATEGORY_LABEL = Object.fromEntries(
  (RECORD_MODULES.find((m) => m.id === 'customParameters')?.fields.find((f) => f.name === 'category')?.options ?? []).map((o) => [o.value, o.label]),
);
const DEWORMING_LABEL: Readonly<Record<'INTERNAL' | 'EXTERNAL', string>> = { INTERNAL: 'Interna', EXTERNAL: 'Externa' };

function Empty(): JSX.Element {
  return <p className="text-slate-700">Sin registros.</p>;
}

function ItemList({ children }: { readonly children: ReactNode }): JSX.Element {
  return <ul className="divide-y divide-slate-200 rounded border border-slate-300 bg-white">{children}</ul>;
}

function ModuleContent({ module, dashboard }: { readonly module: RecordModule; readonly dashboard: PetDashboardView }): JSX.Element {
  switch (module) {
    case 'weights':
      return (
        <div className="grid grid-cols-1 gap-4">
          <WeightChart entries={dashboard.weights} />
          <WeightTable entries={dashboard.weights} />
        </div>
      );
    case 'measurements':
      return dashboard.bodyMeasurements.length === 0 ? (
        <Empty />
      ) : (
        <div role="region" aria-label="Medidas corporales (desplazable)" tabIndex={0} className="overflow-x-auto focus:outline focus:outline-2 focus:outline-blue-700">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Medidas corporales</caption>
            <thead>
              <tr className="border-b border-slate-400">
                <th scope="col" className="px-2 py-1">Fecha</th>
                <th scope="col" className="px-2 py-1">Cuello</th>
                <th scope="col" className="px-2 py-1">Pecho</th>
                <th scope="col" className="px-2 py-1">Lomo</th>
                <th scope="col" className="px-2 py-1">Cintura</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.bodyMeasurements.map((m) => (
                <tr key={m.id} className="border-b border-slate-200">
                  <td className="px-2 py-1">{m.recordedAt}</td>
                  <td className="px-2 py-1">{m.neckCm.toFixed(2)} cm</td>
                  <td className="px-2 py-1">{m.chestCm.toFixed(2)} cm</td>
                  <td className="px-2 py-1">{m.backLengthCm.toFixed(2)} cm</td>
                  <td className="px-2 py-1">{m.waistCm.toFixed(2)} cm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'vaccinations':
      return dashboard.vaccinations.length === 0 ? (
        <Empty />
      ) : (
        <ItemList>
          {dashboard.vaccinations.map(({ record, alert }) => (
            <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <strong>{record.vaccineName}</strong> · aplicada {record.appliedAt} · refuerzo {record.nextBoosterAt}
              </span>
              <AlertBadge alert={alert} />
            </li>
          ))}
        </ItemList>
      );
    case 'dewormings':
      return dashboard.dewormings.length === 0 ? (
        <Empty />
      ) : (
        <ItemList>
          {dashboard.dewormings.map(({ record, alert }) => (
            <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <strong>{record.productBrand}</strong> ({DEWORMING_LABEL[record.dewormingType]}) · aplicada {record.appliedAt} · próxima {record.nextSuggestedDoseAt}
              </span>
              <AlertBadge alert={alert} />
            </li>
          ))}
        </ItemList>
      );
    case 'visits':
      return dashboard.medicalVisits.length === 0 ? (
        <Empty />
      ) : (
        <ItemList>
          {dashboard.medicalVisits.map((v) => (
            <li key={v.id} className="p-3">
              <p>
                <strong>{v.visitDate}</strong> · {v.reason} · {v.clinicOrVet}
              </p>
              <p className="text-sm text-slate-700">
                Diagnóstico: {v.diagnosis}. Tratamiento: {v.treatment}.
              </p>
            </li>
          ))}
        </ItemList>
      );
    case 'customParameters':
      return dashboard.customParameters.length === 0 ? (
        <Empty />
      ) : (
        <ItemList>
          {dashboard.customParameters.map((c) => (
            <li key={c.id} className="p-3">
              <p>
                <strong>{c.recordedAt}</strong> · {CATEGORY_LABEL[c.category] ?? c.category} · {c.title}
              </p>
              <p className="text-sm text-slate-700">{c.description}</p>
            </li>
          ))}
        </ItemList>
      );
  }
}

export function DeletePetDialog({ petName, onConfirm, onCancel }: {
  readonly petName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  return (
    <div role="alertdialog" aria-modal="false" aria-labelledby="delete-pet-title" aria-describedby="delete-pet-desc" className="rounded border border-red-700 bg-red-50 p-4">
      <h3 id="delete-pet-title" className="font-semibold text-red-900">
        Eliminar a {petName}
      </h3>
      <p id="delete-pet-desc" className="text-sm text-red-900">
        Se eliminarán la mascota y todos sus registros. No se puede deshacer; exporta un respaldo antes. Escribe el nombre para confirmar.
      </p>
      <label className="mt-2 flex flex-col text-sm font-medium text-slate-900">
        Nombre de la mascota
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className="rounded border border-slate-500 px-3 py-2" />
      </label>
      <div className="mt-3 flex gap-2">
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

export function PetDashboard({ dashboard, activeTab, onTabChange, onAddRecord, onEdit, onDelete }: {
  readonly dashboard: PetDashboardView;
  readonly activeTab: RecordModule;
  readonly onTabChange: (tab: RecordModule) => void;
  readonly onAddRecord: (module: RecordModule, body: Record<string, string | number>) => Promise<void>;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): JSX.Element {
  const { profile } = dashboard;
  const actions = petActions({ canEdit: dashboard.permissions.editPetBasics });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, RECORD_MODULES.findIndex((m) => m.id === activeTab));
  const activeSpec = RECORD_MODULES[activeIndex] ?? RECORD_MODULES[0]!;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextFocusIndex(event.key, index, RECORD_MODULES.length);
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    const spec = RECORD_MODULES[next];
    if (spec !== undefined) onTabChange(spec.id);
  };
  return (
    <article aria-labelledby="pet-title" data-pet-id={profile.id} className="grid grid-cols-1 gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded border border-slate-300 bg-white p-4">
        <div className="grid gap-1">
          <h2 id="pet-title" className="text-xl font-bold text-slate-900">
            {profile.name}
          </h2>
          <p className="text-sm text-slate-700">
            {SPECIES_LABEL[profile.species]} · {profile.breed} · {SEX_LABEL[profile.sex]} · {formatAge(dashboard.computedAge)} · nació {profile.birthDate}
          </p>
          <p className="text-sm text-slate-700">Alertas: {alertCounters(dashboard.alertsSummary)}</p>
          <OwnerBadge owner={dashboard.owner} canEdit={dashboard.permissions.editPetBasics} />
        </div>
        {actions.canEdit ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="danger" onClick={onDelete}>
              Eliminar
            </Button>
          </div>
        ) : null}
      </header>
      <div role="tablist" aria-label="Módulos de la ficha" className="flex gap-1 overflow-x-auto border-b border-slate-400">
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
              className={`whitespace-nowrap px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                selected ? 'border-b-2 border-blue-700 text-blue-800' : 'text-slate-800'
              }`}
            >
              {spec.tabLabel}
            </button>
          );
        })}
      </div>
      <section id={`module-panel-${activeSpec.id}`} role="tabpanel" aria-labelledby={`module-tab-${activeSpec.id}`} tabIndex={0}>
        <ModuleContent module={activeSpec.id} dashboard={dashboard} />
        {actions.canEdit ? <RecordForm key={`${profile.id}-${activeSpec.id}`} spec={activeSpec} onSubmit={(body) => onAddRecord(activeSpec.id, body)} /> : null}
      </section>
    </article>
  );
}
