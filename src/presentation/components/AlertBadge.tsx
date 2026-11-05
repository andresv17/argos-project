/**
 * Sanitary Alert Traffic-Light Badge Component (AlertBadge).
 * Maps 1:1 with STATE-ALERT-001 (OVERDUE -> Red, DUE_SOON -> Amber, UP_TO_DATE -> Green, SUPERSEDED -> Neutral).
 *
 * @implements REQ-UI-003, REQ-UI-004, STATE-ALERT-001, INV-ARCH-004
 */

import type { AlertStateMetadata } from '../../generated/index.ts';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats the days remaining / overdue description for WCAG 2.1 AA accessible badges.
 *
 * @implements REQ-UI-003, STATE-ALERT-001
 */
export function formatAlertDaysLabel(alert: AlertStateMetadata): string {
  if (alert.status === 'SUPERSEDED') {
    return 'Histórico reemplazado';
  }
  if (alert.status === 'OVERDUE') {
    const overdueDays = Math.abs(alert.daysRemaining);
    return `Vencida (${overdueDays}d de retraso)`;
  }
  if (alert.status === 'DUE_SOON') {
    return `Próxima a vencer (${alert.daysRemaining}d restantes)`;
  }
  return `Al día (+${alert.daysRemaining}d)`;
}

/**
 * Renders the accessible semantic HTML badge for a sanitary alert.
 *
 * @implements REQ-UI-003, REQ-UI-004, STATE-ALERT-001
 */
export function renderAlertBadgeHtml(alert: AlertStateMetadata): string {
  const textLabel = formatAlertDaysLabel(alert);
  const badgeClasses: Record<AlertStateMetadata['uiBadge'], string> = {
    DANGER_RED: 'bg-red-100 text-red-900 border-red-400',
    WARNING_AMBER: 'bg-amber-100 text-amber-900 border-amber-400',
    SUCCESS_GREEN: 'bg-emerald-100 text-emerald-900 border-emerald-400',
    NEUTRAL_GRAY: 'bg-slate-100 text-slate-800 border-slate-300',
  };

  return `<span role="status" data-alert-status="${escapeHtml(alert.status)}" data-ui-badge="${escapeHtml(alert.uiBadge)}" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClasses[alert.uiBadge]}" aria-label="Estado sanitario: ${escapeHtml(textLabel)}">${escapeHtml(textLabel)}</span>`;
}
