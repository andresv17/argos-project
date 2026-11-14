/**
 * Aviso previo de expiración de sesión (T293, REQ-UI2-001, REQ-UI-005; decisión 6-A de Neo). Un único temporizador local,
 * calculado con `idleExpiresAt` que entrega el servidor, hace visible el aviso 5 minutos antes de que se cumpla la
 * inactividad. No hay sondeo ni peticiones en segundo plano: cada actividad autenticada de la persona (que el servidor ya
 * cuenta como renovación) reinicia el temporizador y oculta el aviso. La redirección al expirar queda fuera (B-7).
 *
 * @implements REQ-UI2-001, REQ-UI-005, INV-AUTH2-002
 */
import { useEffect, useState } from 'react';
import { onActivity } from './activity.ts';

/** Antelación del aviso, en minutos y en milisegundos. */
export const WARNING_LEAD_MINUTES = 5;
const WARNING_LEAD_MS = WARNING_LEAD_MINUTES * 60_000;

export function useIdleNotice(idleExpiresAt: string | null, lastActivityAt: string | null): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (idleExpiresAt === null || lastActivityAt === null) return undefined;
    const idleWindowMs = Date.parse(idleExpiresAt) - Date.parse(lastActivityAt);
    let expiresAt = Date.parse(idleExpiresAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setVisible(true), Math.max(0, expiresAt - WARNING_LEAD_MS - Date.now()));
    };
    arm();
    const stop = onActivity(() => {
      expiresAt = Date.now() + idleWindowMs;
      setVisible(false);
      arm();
    });
    return () => {
      stop();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [idleExpiresAt, lastActivityAt]);
  return visible;
}
