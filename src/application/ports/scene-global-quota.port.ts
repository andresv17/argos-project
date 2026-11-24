/**
 * Puerto de la cuota GLOBAL mensual de generaciones de la escena (feature 006, Fase 14, T948; D6-22, N2-02 = A; REQ-ESC6-017, REQ-ESC6-031). El techo (5 generaciones por mes
 * globales al inicio) vive en `platform_parameters`; el descuento es atómico (`UPDATE ... WHERE usado < max`). Se consulta UNA vez por intento, justo antes de llamar al
 * proveedor, y solo con el driver real. Todo es `Promise` (INV-ARCH-005).
 *
 * @implements REQ-ESC6-017, REQ-ESC6-031, INV-ARCH-005
 */
export interface SceneGlobalQuotaPort {
  /** `true` si descontó una generación de la ventana `YYYY-MM`; `false` si se agotó o no se pudo comprobar (falla cerrado). Nunca lanza. */
  tryConsume(window: string): Promise<boolean>;
  /**
   * Devuelve la unidad descontada por `tryConsume` cuando la reverificación posterior (intento cancelado o cerrado antes de la llamada) falla (ADR-009-01, REQ-LIM9-003,
   * INV-LIM9-002): `UPDATE ... SET value = value - 1 WHERE value > 0`. Nunca baja de 0 y nunca lanza (falla cerrado: un error deja la unidad descontada).
   * Sobreconteo conservador aceptado (EDGE-009-042, `P5-01` = B): `tryConsume` (cliente propio del puerto) y la marca `provider_call_started_at` (transacción del
   * `UnitOfWork`) NO comparten transacción; una caída física del proceso entre ambos pasos deja UNA unidad descontada sin llamada (a lo sumo una por caída, nunca gasto
   * sin descontar). No hay reconciliación periódica ni tarea de mantenimiento; la unidad solo se recupera subiendo `scene.global_quota_max`, porque el reinicio de
   * cuota de `REQ-CFG9-006` no toca `scene.global_quota_used.YYYY-MM`.
   */
  refund(window: string): Promise<void>;
  /**
   * Lectura de SOLO LECTURA, sin consumo (REQ-ESC6-039, INV-ESC6-021; enmienda 2026-11-24): `true` si la cuota global de la ventana `YYYY-MM` está agotada (usado >= máximo);
   * `false` si queda cupo o si la lectura falla (sin falsa alarma: el worker sigue protegiendo con `tryConsume`, que falla cerrado). Nunca lanza ni escribe.
   */
  isExhausted(window: string): Promise<boolean>;
}
