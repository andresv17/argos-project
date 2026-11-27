/**
 * Constantes de la Feature 012 (Multidueño, Microchip y Cuidador): un solo lugar para los números (INV-ARCH-006).
 * Módulo propio y sin I/O porque `app-config.ts` está tocado por `H-01` (plan.md, Constitution Check); cuando `H-01` se integre se re-exportan desde allí
 * (decisión de `/morpheus`). Solo se declaran las que el código usa en runtime (`P-16`): este archivo crece por bloque.
 *
 * @implements INV-ARCH-006, REQ-OWN12-003, REQ-OWN12-004, REQ-OWN12-009, REQ-OWN12-011, NFR-012-009
 */

/** Tope de propietarios por mascota, principal incluido; las invitaciones pendientes cuentan (REQ-OWN12-003, D12-01). */
export const MAX_CO_OWNERS_PER_PET = 3;
/** Vigencia de una invitación de co-propiedad (REQ-OWN12-002). */
export const CO_OWNER_INVITE_TTL_DAYS = 7;
/** Vigencia de una solicitud de aprobación conjunta (REQ-OWN12-004 (e), confirmada por `/trinity`). */
export const OWNER_APPROVAL_TTL_DAYS = 7;
/** Intentos de invitación por invitador y día; TODO intento cuenta, también el inexistente o el `ERR-OWN12-ALREADY-OWNER` (H-02, REQ-OWN12-002). */
export const CO_OWNER_INVITES_PER_USER_PER_DAY = 5;
/** Solicitudes críticas (crear, aprobar, rechazar) por usuario, mascota y día (H-10 de `trinity` T1612, `429 ERR-RATE-LIMITED`). */
export const OWNER_REQUESTS_PER_USER_PER_PET_PER_DAY = 10;
/** Espera máxima por el bloqueo de la fila de la mascota antes de `ERR-OWN12-RETRYABLE` (REQ-OWN12-011; valor fijado en T1616, Nivel 1). */
export const OWNERSHIP_LOCK_TIMEOUT_MS = 3000;
/** Retención de filas terminales de `pet_co_owners` y de solicitudes no disputa, en días desde la decisión (NFR-012-009, data-model.md §Retención). */
export const OWNERSHIP_TERMINAL_RETENTION_DAYS = 90;

/** Disparador objetivo de la disputa por ausencia (REQ-OWN12-009, N2-R1, H-09). */
export const ABSENCE_MIN_EXPIRED_REQUESTS = 2;
export const ABSENCE_WINDOW_DAYS = 60;
/** Inactividad mínima continua del `target` hasta la apertura (H-09, Neo). */
export const ABSENCE_MIN_INACTIVE_DAYS = 14;
/** Respuesta única del `target`, en puntos de código (N2-R1, N2-R5). */
export const ABSENCE_RESPONSE_MAX_CHARS = 280;
/** Retención de la disputa por ausencia desde su `RESOLVED`/`EXPIRED` (P-2). */
export const DISPUTE_ABSENCE_RETENTION_DAYS = 90;

/** Milisegundos de un día: para fechas de vencimiento sobre `ClockPort` (sin aritmética de calendario local). */
export const DAY_MS = 86_400_000;
