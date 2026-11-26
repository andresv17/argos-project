/**
 * Foto de perfil de la cuenta (feature 011, #78, T1556; REQ-PRF11-001, SC-011-057, SC-011-058, EDGE-011-007): con `avatarVersion` muestra la imagen del proxy autenticado de la misma
 * origen (`/api/account/avatar?v=<versión>`, sin id de usuario ni URL externa); sin foto, o si la carga falla, las iniciales del nombre, sin texto de error visible. Decorativa (`alt=""`):
 * el nombre ya está en el texto vecino.
 *
 * @implements REQ-PRF11-001, REQ-PRF11-002, SC-011-057, SC-011-058, EDGE-011-007
 */
import { useState } from 'react';
import { petInitials, userAvatarImagePath } from '../view-model.ts';

const SIZE_CLASS = { 32: 'h-8 w-8 text-xs', 40: 'h-10 w-10 text-sm', 64: 'h-16 w-16 text-lg', 96: 'h-24 w-24 text-2xl' } as const;

export function UserAvatar({ displayName, avatarVersion, size }: {
  readonly displayName: string;
  readonly avatarVersion: number | null | undefined;
  readonly size: keyof typeof SIZE_CLASS;
}): JSX.Element {
  // La versión cuya carga falló: una versión nueva (subida o reemplazo) vuelve a intentarse.
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const version = avatarVersion ?? null;
  const imagePath = userAvatarImagePath(version);
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE_CLASS[size]}`}>
      {imagePath !== null && failedVersion !== version ? (
        <img src={imagePath} alt="" loading="lazy" onError={() => setFailedVersion(version)} className="h-full w-full object-cover" />
      ) : (
        <span className="inline-flex h-full w-full items-center justify-center bg-secondary font-bold text-white">{petInitials(displayName)}</span>
      )}
    </span>
  );
}
