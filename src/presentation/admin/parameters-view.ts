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
export const ALBUM_HEADING = 'Fotos del álbum';
export const NEVER_EDITED = 'Sin ediciones desde este portal';
export const SAVE_COST_CAP = 'La combinación supera el tope mensual de imágenes. No se ha guardado.';
export const MODEL_DEPRECATION = 'El modelo gemini-2.5-flash-image se retira el 15 de marzo de 2027; después de esa fecha habrá que elegir otro modelo.';
export const MODEL_SAVED = 'Modelo de imagen guardado.';
/** Aviso de EDGE-009-046 antes de guardar (D9-27 (5)): con `global` el procesamiento no queda fijado a una región ni a un país. Texto aprobado en firme por Neo. */
export const REGION_NOTICE = 'La región global procesa las imágenes sin fijarlas a una región ni a un país (transferencia internacional). Solo funciona con el modelo gemini-3.1-flash-image-preview; los pares válidos son gemini-2.5-flash-image con us-central1 y gemini-3.1-flash-image-preview con global.';
export const REGION_SAVED = 'Región guardada.';
export const QUOTA_HEADING = 'Imágenes de escena al mes';
export const QUOTA_HINT = 'Número máximo de imágenes de escena que la plataforma puede crear en un mes, sumando todas las cuentas.';
export const QUOTA_SAVED = 'Tope mensual de escenas guardado.';
export const BLOCKS_HEADING = 'Texto base de la escena';
export const BLOCKS_HINT = 'Seis textos que se combinan para pedir la imagen. El orden y el resto del contenido los fija el sistema.';
export const BLOCKS_PHOTOREF_HINT = '{photoRef} solo puede usarse en el bloque «Hogar con foto» y es obligatorio allí: se sustituye por la foto del hogar. No lo uses en los demás bloques, salvo en «Preservación de las mascotas».';
export const BLOCKS_PHOTOREF_PRESERVATION_HINT = '{photoRef} es opcional en este bloque: se sustituye por la foto de cada mascota (IMG_n). Si no lo incluyes, el sistema antepone «From IMG_n: » para no perder la referencia de la imagen.';
export const BLOCKS_SAVED = 'Texto base de la escena guardado.';
export const BLOCKS_BROKEN = 'No se pudo leer el texto base actual. Recarga la página.';
export const PHOTOREF = '{photoRef}';

/** Modelos que se pueden elegir (D9-27): solo los de los pares válidos; `gemini-3-pro-image` queda latente, sin selección. */
export const SELECTABLE_MODELS: readonly string[] = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];
/** Regiones con pares válidos (D9-27): `us-central1` con gemini-2.5 y `global` con gemini-3.1 preview. Al elegir una mitad el servidor guarda su pareja válida. */
export const SELECTABLE_LOCATIONS: readonly string[] = ['us-central1', 'global'];
export const DEPRECATED_MODEL = 'gemini-2.5-flash-image';

export const BLOCK_NAMES = ['STYLE_BASE_TEXT', 'HOUSEHOLD_WITH_PHOTO', 'HOUSEHOLD_GENERIC', 'PRESERVATION_BLOCK', 'PIXEL_REDRAW_RULE', 'STYLE_CLOSING'] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];
export const BLOCK_LABEL: Readonly<Record<BlockName, string>> = {
  STYLE_BASE_TEXT: 'Estilo base',
  HOUSEHOLD_WITH_PHOTO: 'Hogar con foto',
  HOUSEHOLD_GENERIC: 'Hogar sin foto',
  PRESERVATION_BLOCK: 'Preservación de las mascotas',
  PIXEL_REDRAW_RULE: 'Regla de redibujado en píxeles',
  STYLE_CLOSING: 'Cierre de estilo',
};

export function selectableOptions(c: ParameterConstraints, selectable: readonly string[]): readonly string[] {
  return (c.allowed ?? []).filter((v) => selectable.includes(v));
}

/** Tope mensual: entero canónico entre el mínimo y el máximo derivado que informa el servidor (no se duplica aquí). `null` = válido. */
export function validateQuota(raw: string, c: ParameterConstraints): string | null {
  const min = c.min ?? 1;
  const max = c.max ?? min;
  if (!/^[1-9]\d*$/.test(raw)) return `Escribe un número entero entre ${min} y ${max}, sin espacios.`;
  return Number(raw) > max ? `El tope no puede superar ${max} imágenes al mes.` : Number(raw) < min ? `El tope no puede ser menor que ${min}.` : null;
}

export function parseBlocks(raw: string): Readonly<Record<BlockName, string>> | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const out = {} as Record<BlockName, string>;
    for (const name of BLOCK_NAMES) {
      const t = (v as Record<string, unknown>)[name];
      if (typeof t !== 'string') return null;
      out[name] = t;
    }
    return out;
  } catch {
    return null;
  }
}

export function blockProblem(name: BlockName, text: string, max: number): string | null {
  if (text.trim().length === 0) return 'Este bloque no puede estar vacío.';
  if (text.length > max) return `Este bloque supera el máximo de ${max} caracteres.`;
  if (name === 'HOUSEHOLD_WITH_PHOTO' && !text.includes(PHOTOREF)) return `Este bloque debe incluir ${PHOTOREF}.`;
  if (name !== 'HOUSEHOLD_WITH_PHOTO' && name !== 'PRESERVATION_BLOCK' && text.includes(PHOTOREF)) return `${PHOTOREF} solo puede ir en el bloque «Hogar con foto».`;
  return null;
}

export const serializeBlocks = (blocks: Readonly<Record<BlockName, string>>): string => JSON.stringify(Object.fromEntries(BLOCK_NAMES.map((n) => [n, blocks[n]])));

export const BLOCKS_INTERNAL_NOTE = 'Texto interno, no se muestra aquí.';
export const EDIT_PENDING_NOTE = 'Por ahora solo se puede consultar; la edición de estos valores está en preparación.';
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
