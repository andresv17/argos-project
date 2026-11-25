/**
 * Gráfico SVG determinista de evolución de peso y tabla con variación absoluta y porcentual (de la API).
 *
 * @implements REQ-UI-002, REQ-REC-001
 */
import type { ReactNode } from 'react';
import { weightChart, weightRows, type WeightEntryView } from '../view-model.ts';

export function WeightChart({ entries }: { readonly entries: readonly WeightEntryView[] }): JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="text-sm text-slate-800">
        <p className="font-semibold">Sin mediciones de peso.</p>
        <p className="text-text-muted">Registra el primer peso para ver la evolución.</p>
      </div>
    );
  }
  const chart = weightChart(entries);
  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={`Evolución de peso: ${chart.points.length} mediciones, mínimo ${chart.minLabel}, máximo ${chart.maxLabel}`}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full rounded-2xl border border-slate-200 bg-white"
      >
        <path d={chart.path} fill="none" className="stroke-primary" strokeWidth={2} />
        {chart.points.map((p) => (
          <circle key={`${p.x}-${p.y}-${p.label}`} cx={p.x} cy={p.y} r={4} className="fill-primary">
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="text-sm text-text-muted">
        Mínimo {chart.minLabel} · Máximo {chart.maxLabel}
      </figcaption>
    </figure>
  );
}

export function WeightTable({ entries, actionsFor }: {
  readonly entries: readonly WeightEntryView[];
  /** Acciones por fila (editar, eliminar) cuando la ficha las ofrece; sin ellas no hay columna (REQ-BOR-003). */
  readonly actionsFor?: (entry: WeightEntryView) => ReactNode;
}): JSX.Element {
  const rows = weightRows(entries);
  return (
    <div role="region" aria-label="Evolución de peso (desplazable)" tabIndex={0} className="overflow-x-auto rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracota">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Evolución de peso</caption>
        <thead>
          <tr className="border-b border-slate-400">
            <th scope="col" className="px-2 py-1 font-semibold">Fecha</th>
            <th scope="col" className="px-2 py-1 font-semibold">Peso</th>
            <th scope="col" className="px-2 py-1 font-semibold">Variación (kg)</th>
            <th scope="col" className="px-2 py-1 font-semibold">Variación (%)</th>
            {actionsFor === undefined ? null : <th scope="col" className="px-2 py-1 font-semibold">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => (
            <tr key={r.id} className="border-b border-slate-200">
              <td className="px-2 py-1 tabular-nums">{r.date}</td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums">{r.weight}</td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums">{r.deltaKg}</td>
              <td className="whitespace-nowrap px-2 py-1 tabular-nums">{r.deltaPercent}</td>
              {actionsFor === undefined ? null : <td className="px-2 py-1">{actionsFor(entries[index]!)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
