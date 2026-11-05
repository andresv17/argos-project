/**
 * Isolated Technical Pet Dashboard Component (PetDashboard).
 * Displays the active pet's profile, deterministic SVG weight evolution chart, and isolated tabs
 * for all 6 clinical/biometric modules without leaking data from other pets.
 *
 * @implements REQ-PET-003, REQ-UI-002, REQ-UI-003, REQ-UI-004, STATE-ALERT-001, INV-SORT-001, INV-ARCH-004
 */

import type { PetDashboardView, WeightEntryView } from '../../generated/index.ts';
import { renderAlertBadgeHtml } from './AlertBadge.tsx';

export type ClinicalModuleTab =
  | 'WEIGHTS'
  | 'MEASUREMENTS'
  | 'VACCINATIONS'
  | 'DEWORMINGS'
  | 'VISITS'
  | 'CUSTOM_PARAMETERS';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates a deterministic SVG polyline chart for the weight evolution series.
 *
 * @implements REQ-UI-002, REQ-REC-001
 */
export function renderWeightEvolutionSvg(weightsDesc: readonly WeightEntryView[]): string {
  const chronological = [...weightsDesc].reverse();
  if (chronological.length === 0) {
    return `<div role="img" aria-label="Sin registros de peso" class="p-4 text-sm text-slate-700 border rounded">Sin mediciones de peso registradas.</div>`;
  }

  const width = 480;
  const height = 140;
  const padding = 24;
  const values = chronological.map((w) => w.weightKg);
  const minW = Math.min(...values);
  const maxW = Math.max(...values);
  const span = maxW - minW === 0 ? 1 : maxW - minW;

  const points = chronological
    .map((entry, idx) => {
      const x =
        chronological.length === 1
          ? width / 2
          : padding + (idx / (chronological.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((entry.weightKg - minW) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return `<svg role="img" aria-label="Gráfica de evolución de peso en kilogramos" viewBox="0 0 ${width} ${height}" class="w-full h-36 bg-slate-50 border border-slate-200 rounded" data-points-count="${chronological.length}">
    <title>Evolución cronológica de peso (kg)</title>
    <polyline fill="none" stroke="#0f172a" stroke-width="2.5" points="${points}" />
  </svg>`;
}

/**
 * Renders the isolated PetDashboard HTML for the active pet profile and its 6 historical modules.
 *
 * @implements REQ-PET-003, REQ-UI-002, REQ-UI-003, REQ-UI-004
 */
export function renderPetDashboardHtml(
  dashboard: PetDashboardView,
  activeModuleTab: ClinicalModuleTab = 'WEIGHTS'
): string {
  const {
    profile,
    computedAge,
    alertsSummary,
    weights,
    bodyMeasurements,
    vaccinations,
    dewormings,
    medicalVisits,
    customParameters,
  } = dashboard;

  const weightsRowsHtml = weights
    .map((w) => {
      const deltaStr =
        w.deltaKg === null
          ? 'Base'
          : w.deltaKg >= 0
            ? `+${w.deltaKg.toFixed(2)} kg`
            : `${w.deltaKg.toFixed(2)} kg`;
      return `<tr data-record-id="${escapeHtml(w.id)}" data-record-pet-id="${escapeHtml(w.petId)}">
        <td class="p-2 border-b">${escapeHtml(w.recordedAt)}</td>
        <td class="p-2 border-b font-semibold">${w.weightKg.toFixed(2)} kg</td>
        <td class="p-2 border-b" data-delta-kg="${escapeHtml(deltaStr)}">${escapeHtml(deltaStr)}</td>
        <td class="p-2 border-b">${escapeHtml(w.notes ?? '—')}</td>
      </tr>`;
    })
    .join('\n');

  const measurementsRowsHtml = bodyMeasurements
    .map(
      (m) => `<tr data-record-id="${escapeHtml(m.id)}" data-record-pet-id="${escapeHtml(m.petId)}">
        <td class="p-2 border-b">${escapeHtml(m.recordedAt)}</td>
        <td class="p-2 border-b">${m.neckCm.toFixed(1)} cm</td>
        <td class="p-2 border-b">${m.chestCm.toFixed(1)} cm</td>
        <td class="p-2 border-b">${m.backLengthCm.toFixed(1)} cm</td>
        <td class="p-2 border-b">${m.waistCm.toFixed(1)} cm</td>
      </tr>`
    )
    .join('\n');

  const vaccinationsRowsHtml = vaccinations
    .map(
      (v) => `<tr data-record-id="${escapeHtml(v.id)}" data-record-pet-id="${escapeHtml(v.petId)}">
        <td class="p-2 border-b font-semibold">${escapeHtml(v.vaccineName)}</td>
        <td class="p-2 border-b">${escapeHtml(v.appliedAt)}</td>
        <td class="p-2 border-b">${escapeHtml(v.nextBoosterAt)}</td>
        <td class="p-2 border-b">${renderAlertBadgeHtml(v.alert)}</td>
      </tr>`
    )
    .join('\n');

  const dewormingsRowsHtml = dewormings
    .map(
      (d) => `<tr data-record-id="${escapeHtml(d.id)}" data-record-pet-id="${escapeHtml(d.petId)}">
        <td class="p-2 border-b font-semibold">${escapeHtml(d.productBrand)} (${escapeHtml(d.dewormingType)})</td>
        <td class="p-2 border-b">${escapeHtml(d.appliedAt)}</td>
        <td class="p-2 border-b">${escapeHtml(d.nextSuggestedDoseAt)}</td>
        <td class="p-2 border-b">${renderAlertBadgeHtml(d.alert)}</td>
      </tr>`
    )
    .join('\n');

  const visitsRowsHtml = medicalVisits
    .map(
      (mv) => `<tr data-record-id="${escapeHtml(mv.id)}" data-record-pet-id="${escapeHtml(mv.petId)}">
        <td class="p-2 border-b">${escapeHtml(mv.visitDate)}</td>
        <td class="p-2 border-b font-semibold">${escapeHtml(mv.reason)}</td>
        <td class="p-2 border-b">${escapeHtml(mv.diagnosis)}</td>
        <td class="p-2 border-b">${escapeHtml(mv.treatment)}</td>
        <td class="p-2 border-b">${escapeHtml(mv.clinicOrVet)}</td>
      </tr>`
    )
    .join('\n');

  const customRowsHtml = customParameters
    .map(
      (cp) => `<tr data-record-id="${escapeHtml(cp.id)}" data-record-pet-id="${escapeHtml(cp.petId)}">
        <td class="p-2 border-b">${escapeHtml(cp.recordedAt)}</td>
        <td class="p-2 border-b">${escapeHtml(cp.category)}</td>
        <td class="p-2 border-b font-semibold">${escapeHtml(cp.title)}</td>
        <td class="p-2 border-b">${escapeHtml(cp.description)}</td>
      </tr>`
    )
    .join('\n');

  return `<section role="tabpanel" id="pet-panel-${escapeHtml(profile.id)}" aria-labelledby="pet-tab-${escapeHtml(profile.id)}" data-active-pet-id="${escapeHtml(profile.id)}" data-active-module="${escapeHtml(activeModuleTab)}" class="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
    <header class="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(profile.name)}</h2>
        <p class="text-sm text-slate-700">
          Especie: <strong>${profile.species === 'DOG' ? 'Perro' : 'Gato'}</strong> ·
          Raza: <strong>${escapeHtml(profile.breed)}</strong> ·
          Sexo: <strong>${profile.sex === 'MALE' ? 'Macho' : 'Hembra'}</strong> ·
          Nacimiento: <time datetime="${escapeHtml(profile.birthDate)}">${escapeHtml(profile.birthDate)}</time> ·
          Edad: <strong>${computedAge.years} años, ${computedAge.months} meses (${computedAge.totalDays} días)</strong>
        </p>
      </div>
      <div class="flex items-center gap-2" aria-label="Resumen de semáforo sanitario">
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300" data-overdue-count="${alertsSummary.overdueCount}">Vencidas: ${alertsSummary.overdueCount}</span>
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300" data-due-soon-count="${alertsSummary.dueSoonCount}">Próximas: ${alertsSummary.dueSoonCount}</span>
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300" data-up-to-date-count="${alertsSummary.upToDateCount}">Al día: ${alertsSummary.upToDateCount}</span>
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <article aria-labelledby="heading-weights" class="border border-slate-200 rounded-lg p-4">
        <h3 id="heading-weights" class="text-base font-bold text-slate-900 mb-3">1. Control de Peso y Evolución (kg)</h3>
        ${renderWeightEvolutionSvg(weights)}
        <table class="w-full text-left text-xs mt-3 border-collapse" aria-label="Historial de peso">
          <thead>
            <tr class="bg-slate-100 text-slate-900">
              <th scope="col" class="p-2 border-b">Fecha</th>
              <th scope="col" class="p-2 border-b">Peso</th>
              <th scope="col" class="p-2 border-b">Variación</th>
              <th scope="col" class="p-2 border-b">Notas</th>
            </tr>
          </thead>
          <tbody>${weightsRowsHtml}</tbody>
        </table>
      </article>

      <article aria-labelledby="heading-measurements" class="border border-slate-200 rounded-lg p-4">
        <h3 id="heading-measurements" class="text-base font-bold text-slate-900 mb-3">2. Medidas Corporales (cm)</h3>
        <table class="w-full text-left text-xs border-collapse" aria-label="Historial de medidas corporales">
          <thead>
            <tr class="bg-slate-100 text-slate-900">
              <th scope="col" class="p-2 border-b">Fecha</th>
              <th scope="col" class="p-2 border-b">Cuello</th>
              <th scope="col" class="p-2 border-b">Pecho</th>
              <th scope="col" class="p-2 border-b">Lomo</th>
              <th scope="col" class="p-2 border-b">Cintura</th>
            </tr>
          </thead>
          <tbody>${measurementsRowsHtml}</tbody>
        </table>
      </article>

      <article aria-labelledby="heading-vaccinations" class="border border-slate-200 rounded-lg p-4">
        <h3 id="heading-vaccinations" class="text-base font-bold text-slate-900 mb-3">3. Esquema de Vacunación</h3>
        <table class="w-full text-left text-xs border-collapse" aria-label="Historial de vacunación">
          <thead>
            <tr class="bg-slate-100 text-slate-900">
              <th scope="col" class="p-2 border-b">Vacuna</th>
              <th scope="col" class="p-2 border-b">Aplicada</th>
              <th scope="col" class="p-2 border-b">Refuerzo</th>
              <th scope="col" class="p-2 border-b">Estado</th>
            </tr>
          </thead>
          <tbody>${vaccinationsRowsHtml}</tbody>
        </table>
      </article>

      <article aria-labelledby="heading-dewormings" class="border border-slate-200 rounded-lg p-4">
        <h3 id="heading-dewormings" class="text-base font-bold text-slate-900 mb-3">4. Control de Desparasitación</h3>
        <table class="w-full text-left text-xs border-collapse" aria-label="Historial de desparasitación">
          <thead>
            <tr class="bg-slate-100 text-slate-900">
              <th scope="col" class="p-2 border-b">Producto / Tipo</th>
              <th scope="col" class="p-2 border-b">Aplicada</th>
              <th scope="col" class="p-2 border-b">Próxima Dosis</th>
              <th scope="col" class="p-2 border-b">Estado</th>
            </tr>
          </thead>
          <tbody>${dewormingsRowsHtml}</tbody>
        </table>
      </article>

      <article aria-labelledby="heading-visits" class="border border-slate-200 rounded-lg p-4">
        <h3 id="heading-visits" class="text-base font-bold text-slate-900 mb-3">5. Citas y Controles Médicos</h3>
        <table class="w-full text-left text-xs border-collapse" aria-label="Historial de consultas médicas">
          <thead>
            <tr class="bg-slate-100 text-slate-900">
              <th scope="col" class="p-2 border-b">Fecha</th>
              <th scope="col" class="p-2 border-b">Motivo</th>
              <th scope="col" class="p-2 border-b">Diagnóstico</th>
              <th scope="col" class="p-2 border-b">Tratamiento</th>
              <th scope="col" class="p-2 border-b">Clínica/Vet</th>
            </tr>
          </thead>
          <tbody>${visitsRowsHtml}</tbody>
        </table>
      </article>

      <article aria-labelledby="heading-custom" class="border border-slate-200 rounded-lg p-4">
        <h3 id="heading-custom" class="text-base font-bold text-slate-900 mb-3">6. Parámetros Adicionales</h3>
        <table class="w-full text-left text-xs border-collapse" aria-label="Historial de parámetros adicionales">
          <thead>
            <tr class="bg-slate-100 text-slate-900">
              <th scope="col" class="p-2 border-b">Fecha</th>
              <th scope="col" class="p-2 border-b">Categoría</th>
              <th scope="col" class="p-2 border-b">Título</th>
              <th scope="col" class="p-2 border-b">Descripción</th>
            </tr>
          </thead>
          <tbody>${customRowsHtml}</tbody>
        </table>
      </article>
    </div>
  </section>`;
}
