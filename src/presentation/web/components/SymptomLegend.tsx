/**
 * Leyenda fija de los síntomas: «Este registro no sustituye la consulta veterinaria» y la derivación al veterinario, con el mismo texto
 * y el mismo estilo siempre (sin depender de la intensidad). Va en el formulario, en el listado y en la exportación.
 *
 * @implements REQ-SIN-003, INV-SIN-002
 */
import { SYMPTOM_DISCLAIMER, SYMPTOM_REFERRAL } from '../symptoms.ts';

export function SymptomLegend(): JSX.Element {
  return (
    <div className="grid gap-1 rounded-2xl border border-border-strong bg-slate-50 px-3 py-2 text-sm text-text-muted">
      <p className="font-semibold">{SYMPTOM_DISCLAIMER}</p>
      <p>{SYMPTOM_REFERRAL}</p>
    </div>
  );
}
