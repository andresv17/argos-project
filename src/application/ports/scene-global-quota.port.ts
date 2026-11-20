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
}
