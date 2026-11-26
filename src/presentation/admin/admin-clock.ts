/**
 * Reloj del portal `/admin` (T1528, H-011-2): el panel recibe el reloj como función inyectable (`Clock`) y no invoca `Date.now()` en su cuerpo
 * (INV-ARCH-001). `systemClock` solo expone la referencia al reloj del navegador, sin llamarla aquí; el portal no importa de `web/` (t1235 A10/A16/A17).
 *
 * @implements REQ-ADM9-001
 */
export type Clock = () => number;

/** Reloj real del navegador: referencia sin invocar; quien lo recibe lo llama como `clock()`. */
export const systemClock: Clock = Date.now;
