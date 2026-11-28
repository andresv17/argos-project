/**
 * `TEXT_POLICY` (`emergency-card.schema.json` 0.3.0, anexo §2): UNA función para `criticalAllergies` (entrada) y `petName` (emisión pública). Sin `\p{..}` en los esquemas: la aplica el dominio.
 * NFC y trim; se rechazan Cc, Cf, Zl, Zp, Co, Cn, Cs, los controles bidi y los rellenos invisibles; más de 3 marcas combinantes seguidas; y los elementos sin un solo carácter visible (L, N, P o S).
 * La deduplicación pliega mayúsculas SIN configuración regional (`toLowerCase()` sin argumento; nunca `toLocaleLowerCase`).
 *
 * @implements REQ-QR12-002, REQ-QR12-009, INV-QR12-002, SC-012-042, SC-012-043, SC-012-044, SC-012-110
 */
import { DomainError } from '../../generated/v38/index.ts';
import { CRITICAL_ALLERGY_MAX_CODE_POINTS, MAX_CRITICAL_ALLERGIES } from '../platform/feature-012-limits.ts';

const REJECTED_CATEGORIES = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]/u;
/** Rellenos invisibles que sobreviven al trim y a las categorías anteriores (anexo §2): Hangul Filler, Braille en blanco, selectores y U+034F. */
const INVISIBLE_FILLERS = /[ㅤᅟᅠﾠ⠀឴឵᠋-᠏͏]/u;
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;
/** Más de 3 marcas combinantes seguidas, contadas SOBRE LA DESCOMPOSICIÓN (NFD): `a` + 4 marcas se compone en `à` + 3 y debe rechazarse igual. */
const MARK_RUN = /\p{M}{4,}/u;

const rejected = (field: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'El texto de las alergias críticas no cumple la política de texto.', field);
const isRejectedChar = (char: string): boolean => REJECTED_CATEGORIES.test(char) || INVISIBLE_FILLERS.test(char);

/** Valida y normaliza la lista de alergias críticas (0 a 5 textos de 1 a 60 puntos de código). Lanza 422 `ERR-SCHEMA-VALIDATION-FAILED` sin eco. */
export function normalizeCriticalAllergies(input: unknown): string[] {
  if (!Array.isArray(input) || input.some((item) => typeof item !== 'string')) throw rejected('criticalAllergies');
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input as string[]) {
    const text = raw.normalize('NFC').trim();
    const length = [...text].length;
    if (length < 1 || length > CRITICAL_ALLERGY_MAX_CODE_POINTS) throw rejected('criticalAllergies');
    if ([...text].some(isRejectedChar) || MARK_RUN.test(text.normalize('NFD')) || !VISIBLE.test(text)) throw rejected('criticalAllergies');
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  if (result.length > MAX_CRITICAL_ALLERGIES) throw rejected('criticalAllergies');
  return result;
}

/** Nombre de la mascota para la vista pública: NFC, sin los caracteres rechazados y con al menos un carácter visible; `null` = 404 uniforme (falla cerrada). */
export function sanitizePublicPetName(name: string): string | null {
  const cleaned = [...name.normalize('NFC')].filter((char) => !isRejectedChar(char)).join('').trim();
  return VISIBLE.test(cleaned) ? cleaned : null;
}
