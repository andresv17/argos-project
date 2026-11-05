/**
 * Backup Export & Atomic Import Modal Component (BackupModal).
 * Displays current transaction state (STATE-BACKUP-001) and detailed ProblemDetails on error.
 *
 * @implements REQ-BACKUP-001, REQ-BACKUP-002, REQ-UI-004, STATE-BACKUP-001, INV-ARCH-004
 */

import type { BackupTransactionState, ProblemDetails } from '../../generated/index.ts';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BackupModalProps {
  readonly transactionState: BackupTransactionState;
  readonly lastExportedJson: string | null;
  readonly lastError: ProblemDetails | null;
}

/**
 * Renders the accessible Backup & Restore JSON section with explicit error code feedback.
 *
 * @implements REQ-BACKUP-001, REQ-BACKUP-002, REQ-UI-004, STATE-BACKUP-001
 */
export function renderBackupModalHtml(props: BackupModalProps): string {
  const { transactionState, lastExportedJson, lastError } = props;

  const errorBannerHtml = lastError
    ? `<div role="alert" data-error-code="${escapeHtml(lastError.code)}" class="p-3 mt-3 rounded bg-red-100 border border-red-400 text-red-900 text-xs">
        <strong>Error [${escapeHtml(lastError.code)}] (${escapeHtml(lastError.title)}):</strong> ${escapeHtml(lastError.detail)}
        <span class="block mt-1 font-semibold">Estado transaccional: ROLLED_BACK (Base de datos previa intacta).</span>
      </div>`
    : '';

  const previewHtml = lastExportedJson
    ? `<label for="backup-json-textarea" class="block text-xs font-semibold text-slate-800 mt-3 mb-1">Payload JSON de Respaldo (schemaVersion 1.0.0)</label>
       <textarea id="backup-json-textarea" readonly rows="5" class="w-full font-mono text-xs p-2 border border-slate-300 rounded bg-slate-50 text-slate-900">${escapeHtml(lastExportedJson)}</textarea>`
    : '';

  return `<aside aria-labelledby="backup-section-title" data-backup-state="${escapeHtml(transactionState)}" class="p-4 mt-6 bg-slate-50 rounded-xl border border-slate-200">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id="backup-section-title" class="text-base font-bold text-slate-900">Respaldo y Restauración Atómica JSON</h2>
        <p class="text-xs text-slate-700">Estado de máquina transaccional: <strong>${escapeHtml(transactionState)}</strong></p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" id="btn-export-backup" class="px-3 py-1.5 rounded text-xs font-semibold bg-slate-900 text-white">Exportar JSON v1.0.0</button>
        <button type="button" id="btn-import-backup" class="px-3 py-1.5 rounded text-xs font-semibold bg-white text-slate-900 border border-slate-400">Importar JSON con Rollback</button>
      </div>
    </div>
    ${errorBannerHtml}
    ${previewHtml}
  </aside>`;
}
