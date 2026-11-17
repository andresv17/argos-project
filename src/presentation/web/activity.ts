/**
 * Bus de actividad autenticada de la SPA: cada respuesta correcta de la API avisa a quien escuche. No usa temporizadores ni
 * hace peticiones; solo permite que el aviso de expiración sepa que el servidor renovó la inactividad (INV-AUTH2-002).
 *
 * @implements REQ-UI2-001, INV-AUTH2-002
 */
const listeners = new Set<() => void>();

/** Se suscribe a la actividad; devuelve la función que cancela la suscripción. */
export function onActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyActivity(): void {
  for (const listener of [...listeners]) listener();
}
