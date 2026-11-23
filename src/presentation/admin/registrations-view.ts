/**
 * Textos y formato de la pantalla de solicitudes de /admin (T1250). Sin la palabra «lista» ni correo en pantalla (EDGE-009-008); el umbral numérico del aviso NO se muestra: el servidor solo
 * dice si se superó (`warning`, D9-25).
 *
 * @implements REQ-APR9-005, NFR-009-001; SC-009-006, SC-009-008
 */
import type { DecisionAction, RegistrationMethod } from './registrations-api.ts';

export const METHOD_LABEL: Readonly<Record<RegistrationMethod, string>> = { PASSWORD: 'Usuario y contraseña', GOOGLE: 'Google' };

export const WARNING_TEXT = 'Hay muchas solicitudes pendientes. Conviene revisarlas pronto.';

export function pendingCountText(pending: number): string {
  if (pending === 0) return 'No hay solicitudes pendientes.';
  return pending === 1 ? '1 solicitud pendiente' : `${pending} solicitudes pendientes`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
export const formatRequestedAt = (iso: string): string => DATE_FORMAT.format(new Date(iso));

export const ACTION_LABEL: Readonly<Record<DecisionAction, string>> = { approve: 'Aprobar', reject: 'Rechazar' };

export function confirmQuestion(action: DecisionAction, username: string): string {
  return action === 'approve' ? `¿Aprobar la solicitud de ${username}?` : `¿Rechazar la solicitud de ${username}?`;
}
export const CONFIRM_HINT: Readonly<Record<DecisionAction, string>> = {
  approve: 'La persona podrá entrar con su usuario o con Google. No se envía correo.',
  reject: 'La persona no podrá entrar y no podrá volver a registrarse con ese usuario durante 30 días. No se envía correo.',
};
export const CONFIRM_LABEL: Readonly<Record<DecisionAction, string>> = { approve: 'Confirmar aprobación', reject: 'Confirmar rechazo' };

export const decisionDone = (action: DecisionAction, username: string): string => (action === 'approve' ? `Solicitud de ${username} aprobada.` : `Solicitud de ${username} rechazada.`);
export const DECISION_NOT_FOUND = 'Esa solicitud ya no está disponible: otra persona la decidió o venció. Se actualizó el contador.';
export const DECISION_FAILED = 'No se pudo registrar la decisión. Inténtalo de nuevo.';
export const LOAD_FAILED = 'No se pudieron cargar las solicitudes.';
