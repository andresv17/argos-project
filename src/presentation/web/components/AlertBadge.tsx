/**
 * Insignia del semáforo sanitario: Rojo, Ámbar, Verde o Gris según STATE-ALERT-001, con texto (no solo color).
 *
 * @implements REQ-UI-003, REQ-UI-004, STATE-ALERT-001
 */
import { alertBadge, type AlertStateMetadata } from '../view-model.ts';

export function AlertBadge({ alert }: { readonly alert: AlertStateMetadata | null }): JSX.Element {
  // T255 PENDIENTE: sin próxima fecha la alerta es nula; la UI nueva decide el texto.
  if (alert === null) return <span className="text-xs text-slate-700">Sin próxima fecha</span>;
  const badge = alertBadge(alert);
  return (
    <span
      data-alert-status={badge.status}
      data-ui-badge={badge.uiBadge}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.className}`}
    >
      <span className="sr-only">Semáforo {badge.color}: </span>
      {badge.text}
    </span>
  );
}
