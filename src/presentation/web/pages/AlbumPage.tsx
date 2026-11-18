/**
 * Pantalla del álbum de una mascota (`/mascotas/:petId/album`, T588, REQ-ALB-001): obtiene el nombre y los permisos de la mascota (la misma matriz que el panel de
 * archivos: `writeHealthEvents` sube, `deleteHealthEvents` borra) y muestra `PhotoAlbum` (T726, REQ-ALB5-001).
 *
 * @implements REQ-ALB-001, REQ-ALB5-001
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PhotoAlbum } from '../components/PhotoAlbum.tsx';
import { unwrap } from '../api.ts';
import { useSession } from '../session.tsx';

export function AlbumPage(): JSX.Element {
  const { petId = '' } = useParams();
  const { api } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<{ readonly canUpload: boolean; readonly canDelete: boolean }>({ canUpload: false, canDelete: false });
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    unwrap(api.GET('/pets/{petId}/dashboard', { params: { path: { petId } } })).then(
      (view) => {
        setPermissions({ canUpload: view.permissions.writeHealthEvents, canDelete: view.permissions.deleteHealthEvents });
        setName(view.profile.name);
      },
      () => setMissing(true),
    );
  }, [api, petId]);

  if (missing) return <p role="alert" className="text-sm text-red-900">No encontramos esa mascota.</p>;
  if (name === null) return <p role="status" className="text-sm text-slate-800">Cargando…</p>;
  return <PhotoAlbum petId={petId} petName={name} canUpload={permissions.canUpload} canDelete={permissions.canDelete} />;
}
