/**
 * Textos y reglas de la pantalla de parámetros de /admin (T1269, subfase 5a). Sin correo ni identificadores en pantalla: el autor se resume en «Tú», «Otra persona administradora» o
 * «Sin ediciones…». El rango se lee de las restricciones del servidor (no se duplica); el aviso de caducidad se calcula sobre `expiresAt` de la sesión (LCK-25: a los 25 min de 30).
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-003, REQ-CFG9-006, NFR-009-001; SC-009-018
 */
import type { ParameterConstraints, ParameterKey } from './parameters-api.ts';

export const PROPAGATION_NOTICE = 'Puede tardar hasta 1 minuto en aplicarse';
export const SESSION_WARNING_TEXT = 'Tu sesión se cerrará en menos de 5 minutos. Termina lo que estás haciendo y guarda tus cambios.';
export const SESSION_WARNING_LEAD_MS = 5 * 60_000;

export const KEY_LABEL: Readonly<Record<ParameterKey, string>> = {
  'album.max_photos_per_pet': 'Máximo de fotos por mascota',
  'scene.enabled': 'Generación de escenas',
  'scene.global_quota_max': 'Tope mensual de escenas de la plataforma',
  'scene.provider_model': 'Modelo de imagen',
  'scene.provider_location': 'Región del servicio de imagen',
  'scene.prompt.blocks': 'Texto base de la escena',
};

export const LOAD_FAILED = 'No se pudieron cargar los parámetros.';
export const SAVE_FAILED = 'No se pudo guardar el cambio. Inténtalo de nuevo.';
export const SAVE_PRECONDITION = 'Otra persona cambió este valor. Se cargó el valor vigente; revísalo y vuelve a intentarlo.';
export const SAVE_INVALID = 'El servidor no aceptó ese valor. Revisa el rango e inténtalo de nuevo.';
export const PHOTO_LOWER_HINT = 'Si bajas el tope por debajo de las fotos que ya tiene una mascota, las fotos ya subidas se conservan y solo se bloquean las subidas nuevas.';
export const PHOTO_SAVED = 'Tope de fotos guardado.';
export const SCENE_ENABLED_TEXT = 'Escenas habilitadas';
export const SCENE_DISABLED_TEXT = 'Escenas deshabilitadas';
export const SCENE_TOGGLE_HINT_OFF = 'Mientras estén deshabilitadas no se inicia ninguna generación nueva; la imagen ya generada sigue visible.';
export const SCENE_TOGGLE_HINT_ON = 'Se reanuda la generación de escenas para todas las personas usuarias.';
export const RESET_HINT = 'Pone a cero el contador de escenas de tus cuentas de administración. No afecta a otras cuentas, a los hogares compartidos ni al tope mensual de la plataforma.';
export const RESET_DONE = 'Cuota de escenas reiniciada.';
export const RESET_NONE = 'No había cuentas de administración con cuota que reiniciar.';
export const RESET_CONFLICT = 'El contador cambió mientras se reiniciaba. Inténtalo de nuevo.';
export const RESET_FAILED = 'No se pudo reiniciar la cuota. Inténtalo de nuevo.';
export const READ_ONLY_NOTE = 'Por ahora solo se puede consultar.';

export function rangeText(c: ParameterConstraints): string {
  if (c.min !== undefined && c.max !== undefined) return `De ${c.min} a ${c.max}`;
  if (c.allowed !== undefined) {
    const sorted = [...c.allowed].sort();
    if (sorted.length === 2 && sorted[0] === 'false' && sorted[1] === 'true') return 'Sí o no';
    return `Uno de: ${c.allowed.join(', ')}`;
  }
  return 'Sin rango definido';
}

/** Texto canónico exacto (sin recortar): entero sin signo ni ceros a la izquierda dentro del rango del servidor. `null` = válido. */
export function validatePhotoCap(raw: string, c: ParameterConstraints): string | null {
  const min = c.min ?? 1;
  const max = c.max ?? 50;
  const message = `Escribe un número entero entre ${min} y ${max}, sin espacios.`;
  if (!/^[1-9]\d*$/.test(raw)) return message;
  const n = Number(raw);
  return n >= min && n <= max ? null : message;
}

export function authorLabel(lastEditedBy: string | null, viewerId: string | null): string {
  if (lastEditedBy === null) return 'Sin ediciones desde este portal';
  return viewerId !== null && lastEditedBy === viewerId ? 'Tú' : 'Otra persona administradora';
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
export const formatEditedAt = (iso: string | null): string => (iso === null ? 'Sin ediciones' : DATE_FORMAT.format(new Date(iso)));

/** Milisegundos hasta el aviso (5 min antes de `expiresAt`, es decir a los 25 de 30); 0 si ya pasó el momento; `null` si la sesión ya venció o la fecha no es válida. */
export function sessionWarningDelayMs(expiresAtIso: string, nowMs: number): number | null {
  const expires = Date.parse(expiresAtIso);
  if (Number.isNaN(expires) || expires <= nowMs) return null;
  return Math.max(0, expires - SESSION_WARNING_LEAD_MS - nowMs);
}
