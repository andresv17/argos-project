/**
 * Pantalla del álbum de una mascota (`/mascotas/:petId/album`, T588, REQ-ALB-001): obtiene el nombre de la mascota y muestra `PhotoAlbum`.
 *
 * @implements REQ-ALB-001
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
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    unwrap(api.GET('/pets/{petId}/dashboard', { params: { path: { petId } } })).then(
      (view) => setName(view.profile.name),
      () => setMissing(true),
    );
  }, [api, petId]);

  if (missing) return <p role="alert" className="text-sm text-red-900">No encontramos esa mascota.</p>;
  if (name === null) return <p role="status" className="text-sm text-slate-800">Cargando…</p>;
  return <PhotoAlbum petId={petId} petName={name} />;
}
