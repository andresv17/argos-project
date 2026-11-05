/**
 * Accessible Quick Pet Selector Bar Component (PetSelectorBar).
 * Renders up to 4 registered pets (max 2 DOG, max 2 CAT) with keyboard navigation (role="tablist", aria-selected),
 * species quota indicators, computed age, and active sanitary alert counters.
 *
 * @implements REQ-UI-001, REQ-UI-003, REQ-UI-004, STATE-PET-QUOTA-001, STATE-ALERT-001, INV-ARCH-004
 */

import type { PetListOverview, PetSummaryCardView } from '../../generated/index.ts';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PetSelectorBarProps {
  readonly overview: PetListOverview;
  readonly activePetId: string;
}

function renderSinglePetTab(card: PetSummaryCardView, isSelected: boolean): string {
  const { profile, computedAge, alertsSummary } = card;
  const speciesLabel = profile.species === 'DOG' ? 'Perro' : 'Gato';
  const ageLabel = `${computedAge.years}a ${computedAge.months}m`;

  const alertCounterHtml =
    alertsSummary.totalActiveAlerts > 0
      ? `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
          alertsSummary.overdueCount > 0
            ? 'bg-red-800 text-white'
            : 'bg-amber-800 text-white'
        }" data-active-alerts="${alertsSummary.totalActiveAlerts}" aria-label="${alertsSummary.totalActiveAlerts} alertas sanitarias activas">${alertsSummary.totalActiveAlerts} alerta(s)</span>`
      : `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-800 text-white" data-active-alerts="0">Al día</span>`;

  return `<button type="button" role="tab" id="pet-tab-${escapeHtml(profile.id)}" aria-selected="${isSelected ? 'true' : 'false'}" aria-controls="pet-panel-${escapeHtml(profile.id)}" tabindex="${isSelected ? '0' : '-1'}" data-pet-id="${escapeHtml(profile.id)}" data-species="${escapeHtml(profile.species)}" class="flex items-center justify-between px-4 py-3 rounded-lg border text-left transition ${
    isSelected
      ? 'bg-slate-900 text-white border-slate-900 font-bold'
      : 'bg-white text-slate-900 border-slate-300'
  }">
    <div>
      <div class="text-sm font-semibold">${escapeHtml(profile.name)} <span class="text-xs font-normal">(${speciesLabel} · ${escapeHtml(profile.breed)})</span></div>
      <div class="text-xs opacity-90">Edad: ${escapeHtml(ageLabel)} (${computedAge.totalDays} días)</div>
    </div>
    ${alertCounterHtml}
  </button>`;
}

/**
 * Renders the accessible Pet Selector Bar HTML with quota status (STATE-PET-QUOTA-001) and pet tabs.
 *
 * @implements REQ-UI-001, REQ-UI-004, STATE-PET-QUOTA-001
 */
export function renderPetSelectorBarHtml(props: PetSelectorBarProps): string {
  const { overview, activePetId } = props;
  const { quota, pets } = overview;

  const tabsHtml = pets
    .map((card) => renderSinglePetTab(card, card.profile.id === activePetId))
    .join('\n');

  const createDisabledAttr = quota.state === 'FULL_QUOTA' ? 'disabled aria-disabled="true"' : '';

  return `<nav aria-label="Selector rápido de mascotas" class="w-full bg-slate-50 border-b border-slate-200 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div data-quota-state="${escapeHtml(quota.state)}" class="text-xs font-semibold text-slate-800">
        Cupo del Sistema: <span data-dogs-quota="${quota.dogsCount}/2">${quota.dogsCount}/2 Perros</span> · <span data-cats-quota="${quota.catsCount}/2">${quota.catsCount}/2 Gatos</span> (${quota.totalPets}/4 Total)
      </div>
      <button type="button" id="btn-register-pet" ${createDisabledAttr} class="px-3 py-1.5 rounded text-xs font-semibold bg-slate-900 text-white disabled:opacity-50">
        ${quota.state === 'FULL_QUOTA' ? 'Cupo Completo (4/4)' : 'Registrar Mascota'}
      </button>
    </div>
    <div role="tablist" aria-label="Perfiles de mascotas registradas" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      ${tabsHtml}
    </div>
  </nav>`;
}
