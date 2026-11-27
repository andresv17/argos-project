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
/** Solicitudes críticas (crear, aprobar, rechazar) por usuario y día, no por mascota (errata RES1; H-10 de `trinity` T1612, `429 ERR-RATE-LIMITED`). */
export const OWNER_REQUESTS_PER_USER_PER_DAY = 10;
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
/** Disputas abiertas por usuario (todas las clases, REQ-CHP12-004) y SLA de arbitraje en días hábiles. */
export const MAX_OPEN_DISPUTES_PER_USER = 3;
export const DISPUTE_SLA_BUSINESS_DAYS = 15;
/** Congelación inicial y plazo máximo abierto de una disputa (ADR-012-08, N2-R5, P-1): vence `EXPIRED` sin cooldown. */
export const DISPUTE_FREEZE_MAX_DAYS = 30;
export const DISPUTE_MAX_OPEN_DAYS = 60;
/** Cooldown del solicitante tras una disputa rechazada por `/admin` (N2-R5). */
export const DISPUTE_REJECTED_COOLDOWN_DAYS = 90;

/** Milisegundos de un día: para fechas de vencimiento sobre `ClockPort` (sin aritmética de calendario local). */
export const DAY_MS = 86_400_000;

/**
 * Bloque B (#23, T1635..T1646): reclamación de chip, contadores por IP, evidencia y arbitraje. Cifras de `chip-claim.schema.json` y `admin-disputes.schema.json` (`x-sdd-constants`).
 * @implements REQ-CHP12-003, REQ-CHP12-004, REQ-CHP12-005, REQ-CHP12-008, REQ-CHP12-009, INV-ARCH-006
 */
/** TTL de `CLAIM_CO_OWNERSHIP` y cooldown tras un rechazo por `(solicitante, chip_hmac)`. */
export const CHIP_CLAIM_TTL_DAYS = 14;
export const CHIP_CLAIM_COOLDOWN_DAYS = 30;
export const CLAIM_MESSAGE_MAX_CHARS = 280;
/** Contadores de todo intento con `microchipId` (N2-R4): usuario 10, IP 30, global 1000, ventana móvil de 24 h; aviso `warn` al 70 % del global. */
export const MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY = 10;
export const MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY = 30;
export const MICROCHIP_LOOKUP_MAX_GLOBAL_PER_DAY = 1000;
export const MICROCHIP_LOOKUP_GLOBAL_WARN_RATIO = 0.7;
export const MICROCHIP_LOOKUP_WINDOW_MS = 86_400_000;
/** Peticiones multipart de `openChipDispute` por usuario/IP y día (rama NUEVO-4): 10 por usuario y 30 por IP (decisión de Neo, Nivel 2, 2026-11-27). */
export const CHIP_MULTIPART_MAX_PER_USER_PER_DAY = 10;
export const CHIP_MULTIPART_MAX_PER_IP_PER_DAY = 30;
/** Tope del cuerpo multipart COMPLETO de `openChipDispute` (15 MiB, decidido por Neo 2026-11-27) y de mascotas con chip por importación de respaldo (50; `SC-012-117`). */
export const CHIP_DISPUTE_BODY_MAX_BYTES = 15_728_640;
export const MICROCHIP_IMPORT_MAX_PETS = 50;
/** Retención de `ip_rate_events` (la ventana es de 24 h; la purga de mantenimiento corre a las 25 h). */
export const IP_RATE_EVENTS_RETENTION_HOURS = 25;
/** Evidencia de disputa (REQ-CHP12-008). */
export const DISPUTE_EVIDENCE_MAX_FILES = 5;
export const DISPUTE_EVIDENCE_MAX_PIXELS = 16_000_000;
export const DISPUTE_EVIDENCE_RETENTION_DAYS = 365;
export const DISPUTE_EVIDENCE_STAGING_TTL_HOURS = 24;
export const DISPUTE_EVIDENCE_URL_TTL_SECONDS = 300;
/** Arbitraje (REQ-CHP12-009). */
export const DISPUTE_FREEZE_EXTENSION_DAYS = 30;
export const DISPUTE_FREEZE_ABSOLUTE_MAX_DAYS = 60;
export const ARBITRATION_DELAY_HOURS = 72;
export const ADMIN_STEPUP_WINDOW_MINUTES = 5;
export const DECISION_REASON_MAX_CHARS = 500;
export const ARBITER_AUDIT_RETENTION_DAYS = 1095;

/** Modo Cuidador (Bloque C, REQ-CAR12-001..007): topes y ventanas de rutinas y registro de cuidado. */
export const MAX_ROUTINES_PER_PET = 20;
/** Filas totales (versiones incluidas) por mascota. */
export const MAX_ROUTINE_ROWS_PER_PET = 100;
/** Gracia tras la hora de una ocurrencia antes de pasar a `OVERDUE` y de marcar `late`. */
export const OVERDUE_GRACE_MINUTES = 60;
/** Ventana de registro hacia atrás. */
export const CARE_LOG_BACKFILL_HOURS = 24;
/** Tolerancia de un `DONE` registrado antes de la hora de la ocurrencia. */
export const CARE_LOG_EARLY_TOLERANCE_MINUTES = 15;
/** Plazo para deshacer un registro propio (o de cualquiera, si es titular). */
export const CARE_LOG_UNDO_MINUTES = 10;
export const CARE_LOG_PAGE_MAX = 100;
export const CARE_LOG_PAGE_DEFAULT = 50;
export const CARE_LOG_WRITES_PER_USER_PER_HOUR = 120;
export const CARE_ROUTINE_WRITES_PER_USER_PER_HOUR = 60;
export const CARE_LOG_REVERT_WRITES_PER_USER_PER_HOUR = 30;
export const CARE_TIMEZONE = 'America/Bogota';
/** America/Bogota es UTC-5 fijo (sin horario de verano, D12-12). */
export const CARE_UTC_OFFSET_HOURS = -5;
/** Tope de `doseAmount` (NUMERIC(9,3), data-model.md). */
export const CARE_DOSE_MAX = 100000;
