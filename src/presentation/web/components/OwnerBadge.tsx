/**
 * Distinción del dueño: siempre el `displayName` en texto; insignia de color solo con `colorToken` (hogar).
 * «Solo lectura» cuando la matriz de permisos no permite ninguna escritura (REQ-UI2-003).
 *
 * @implements REQ-UI-007, REQ-UI2-003, INV-HOUSE-005
 */
import { ownerBadge, READ_ONLY_LABEL, type OwnerTag } from '../view-model.ts';

export function OwnerBadge({ owner, readOnly }: { readonly owner: OwnerTag; readonly readOnly: boolean }): JSX.Element {
  const badge = ownerBadge(owner);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs">
      {badge.style === null ? (
        <span data-owner-badge="none" className="font-semibold text-slate-800">{badge.text}</span>
      ) : (
        <span data-owner-badge={owner.colorToken ?? ''} className="rounded-full px-2 py-0.5 font-semibold" style={badge.style}>
          {badge.text}
        </span>
      )}
      {readOnly ? (
        <span data-read-only="true" className="rounded-full border border-border-strong bg-white px-2 py-0.5 font-semibold text-slate-800">
          {READ_ONLY_LABEL}
        </span>
      ) : null}
    </span>
  );
}
