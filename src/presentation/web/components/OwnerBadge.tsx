/**
 * Distinción del dueño: siempre el `displayName` en texto; insignia de color solo con `colorToken` (hogar).
 * "Solo lectura" para las mascotas ajenas (`canEdit = false`).
 *
 * @implements REQ-UI-007, INV-HOUSE-005
 */
import { ownerBadge, petActions, type OwnerTag } from '../view-model.ts';

export function OwnerBadge({ owner, canEdit }: { readonly owner: OwnerTag; readonly canEdit: boolean }): JSX.Element {
  const badge = ownerBadge(owner);
  const { readOnlyLabel } = petActions({ canEdit });
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      {badge.style === null ? (
        <span data-owner-badge="none" className="text-slate-700">{badge.text}</span>
      ) : (
        <span data-owner-badge={owner.colorToken ?? ''} className="rounded-full px-2 py-0.5 text-xs font-semibold" style={badge.style}>
          {badge.text}
        </span>
      )}
      {readOnlyLabel === null ? null : (
        <span data-read-only="true" className="rounded border border-slate-500 px-2 py-0.5 text-xs font-semibold text-slate-800">
          {readOnlyLabel}
        </span>
      )}
    </span>
  );
}
