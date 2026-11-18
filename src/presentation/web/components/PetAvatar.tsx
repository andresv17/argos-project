/**
 * Avatar de la mascota (REQ-AVA-001, REQ-AVA-002, D-19 A): prioridad avatar cargado (imagen del proxy autenticado de la misma origen, `?v=` por versión) >
 * inicial en el color de dueño. `avatarUrl` NUNCA se renderiza como imagen (la CSP estricta lo impide ni pide nada a un tercero): se ofrece como enlace de
 * texto «Ver enlace externo» (`AvatarExternalLink`). Si la imagen cargada falla, cae a la inicial.
 *
 * @implements REQ-AVA-001, REQ-AVA-002, REQ-AVA-003, REQ-UI2-003, REQ-UI-007
 */
import { useState } from 'react';
import { avatarImagePath, externalAvatarLink, OWNER_COLORS, petInitials, type OwnerColorToken } from '../view-model.ts';

const SIZE_CLASS = { 64: 'h-16 w-16 text-lg', 96: 'h-24 w-24 text-2xl' } as const;

/** Huella genérica de especie (SVG en línea, `currentColor`, decorativa). */
function SpeciesGlyph(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="10" r="1.6" />
      <circle cx="10" cy="6.5" r="1.6" />
      <circle cx="14" cy="6.5" r="1.6" />
      <circle cx="17.5" cy="10" r="1.6" />
      <path d="M12 12.5c-2.6 0-5 2.4-5 4.6 0 1.4 1.1 2 2.4 2 1 0 1.6-.4 2.6-.4s1.6.4 2.6.4c1.3 0 2.4-.6 2.4-2 0-2.2-2.4-4.6-5-4.6Z" />
    </svg>
  );
}

/** Enlace de texto al `avatarUrl` externo (REQ-AVA-003): http(s) solamente, pestaña nueva y sin referrer; sin valor válido no renderiza nada. */
export function AvatarExternalLink({ avatarUrl }: { readonly avatarUrl: string | null | undefined }): JSX.Element | null {
  const href = externalAvatarLink(avatarUrl);
  if (href === null) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      Ver enlace externo
    </a>
  );
}

export function PetAvatar({ name, petId, avatarVersion, colorToken, size }: {
  readonly name: string;
  readonly petId: string;
  readonly avatarVersion: number | null;
  readonly colorToken: OwnerColorToken | null;
  readonly size: 64 | 96;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const imagePath = avatarImagePath(petId, avatarVersion);
  // Aro de dueño solo en contexto de hogar (hay `colorToken`): decorativo, el texto «Dueño: …» siempre está.
  const ring = colorToken === null ? undefined : { boxShadow: `0 0 0 3px ${OWNER_COLORS[colorToken]}` };
  const initialsStyle = colorToken === null ? undefined : { backgroundColor: OWNER_COLORS[colorToken] };
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 ${SIZE_CLASS[size]}`}>
      <span className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full" {...(ring === undefined ? {} : { style: ring })}>
        {imagePath !== null && !failed ? (
          <img src={imagePath} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <span className={`inline-flex h-full w-full items-center justify-center font-bold text-white ${colorToken === null ? 'bg-secondary' : ''}`} {...(initialsStyle === undefined ? {} : { style: initialsStyle })}>
            {petInitials(name)}
          </span>
        )}
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-primary">
        <SpeciesGlyph />
      </span>
    </span>
  );
}
