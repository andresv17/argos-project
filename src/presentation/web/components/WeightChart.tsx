/**
 * Gráfico SVG determinista de evolución de peso y tabla con variación absoluta y porcentual (de la API).
 *
 * @implements REQ-UI-002, REQ-REC-001
 */
import { weightChart, weightRows, type WeightEntryView } from '../view-model.ts';

export function WeightChart({ entries }: { readonly entries: readonly WeightEntryView[] }): JSX.Element {
  if (entries.length === 0) return <p className="text-slate-700">Sin mediciones de peso.</p>;
  const chart = weightChart(entries);
  return (
    <figure className="w-full">
      <svg
        role="img"
        aria-label={`Evolución de peso: ${chart.points.length} mediciones, mínimo ${chart.minLabel}, máximo ${chart.maxLabel}`}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full rounded border border-slate-300 bg-white"
      >
        <path d={chart.path} fill="none" stroke="#1d4ed8" strokeWidth={2} />
        {chart.points.map((p) => (
          <circle key={`${p.x}-${p.y}-${p.label}`} cx={p.x} cy={p.y} r={4} fill="#1d4ed8">
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="text-sm text-slate-700">
        Mínimo {chart.minLabel} · Máximo {chart.maxLabel}
      </figcaption>
    </figure>
  );
}

export function WeightTable({ entries }: { readonly entries: readonly WeightEntryView[] }): JSX.Element {
  const rows = weightRows(entries);
  return (
    <div role="region" aria-label="Evolución de peso (desplazable)" tabIndex={0} className="overflow-x-auto focus:outline focus:outline-2 focus:outline-blue-700">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">Evolución de peso</caption>
        <thead>
          <tr className="border-b border-slate-400">
            <th scope="col" className="px-2 py-1">Fecha</th>
            <th scope="col" className="px-2 py-1">Peso</th>
            <th scope="col" className="px-2 py-1">Variación (kg)</th>
            <th scope="col" className="px-2 py-1">Variación (%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-200">
              <td className="px-2 py-1">{r.date}</td>
              <td className="px-2 py-1">{r.weight}</td>
              <td className="px-2 py-1">{r.deltaKg}</td>
              <td className="px-2 py-1">{r.deltaPercent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
