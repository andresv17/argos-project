/**
 * Errores uniformes del acceso con Google (feature 008, catálogo de la 002 3.2.0). Un único código, estado y detalle por familia para que el
 * cliente y el atacante no distingan la causa: el detalle sale del catálogo y nunca incluye correo, `sub`, tokens ni el motivo del rechazo.
 * Solo fábricas: el flujo OIDC (bloques A y B) las usará; aquí no hay red, reloj ni persistencia.
 *
 * @implements REQ-AUTH2-002, REQ-AUTH2-003, INV-AUTH-006, ERR-AUTH-GOOGLE-FAILED, ERR-AUTH-GOOGLE-LINK-CONFLICT
 */
import { DomainError } from '../../generated/v31/index.ts';

/** Cualquier fallo del flujo de acceso con Google (400); la causa se registra aparte, sin PII. */
export const googleFailed = (): DomainError => new DomainError('ERR-AUTH-GOOGLE-FAILED');

/** Vinculación imposible: la cuenta ya tiene Google o ese `sub` pertenece a otra cuenta (409), sin revelar cuál. */
export const googleLinkConflict = (): DomainError => new DomainError('ERR-AUTH-GOOGLE-LINK-CONFLICT');
