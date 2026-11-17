/**
 * Avatar de la mascota (decisión D1 de Neo, blueprint §4.2): `data:image/*` directo; `http(s)` con
 * `referrerPolicy="no-referrer"` y caída automática a las iniciales si la imagen falla; cualquier otro valor, iniciales.
 * Privacidad (nota de Rama): `no-referrer` evita enviar la URL de la app, pero el navegador sigue pidiendo la imagen al
 * servidor remoto y le expone la dirección IP y el momento de la visita; esa exposición la aceptó Neo al decidir D1.
 *
 * @implements REQ-UI2-003, REQ-UI-007
 */
import { useState } from 'react';
import { avatarSource, OWNER_COLORS, petInitials, type OwnerColorToken } from '../view-model.ts';

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

export function PetAvatar({ name, avatarUrl, colorToken, size }: {
  readonly name: string;
  readonly avatarUrl: string | null | undefined;
  readonly colorToken: OwnerColorToken | null;
  readonly size: 64 | 96;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  const source = avatarSource(avatarUrl);
  // Aro de dueño solo en contexto de hogar (hay `colorToken`): decorativo, el texto «Dueño: …» siempre está.
  const ring = colorToken === null ? undefined : { boxShadow: `0 0 0 3px ${OWNER_COLORS[colorToken]}` };
  const initialsStyle = colorToken === null ? undefined : { backgroundColor: OWNER_COLORS[colorToken] };
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 ${SIZE_CLASS[size]}`}>
      <span className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full" {...(ring === undefined ? {} : { style: ring })}>
        {source.kind === 'DATA' ? (
          <img src={source.src} alt="" className="h-full w-full object-cover" />
        ) : source.kind === 'REMOTE' && !failed ? (
          <img src={source.src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
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
