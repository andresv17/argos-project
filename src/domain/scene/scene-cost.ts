/**
 * Regla de coste de la escena (feature 009, Fase 5b, T1296; EDGE-009-036, EDGE-009-021, REQ-CFG9-004, REQ-CFG9-008; NFR-009-003; Enmienda 009-B 3.10.0, Anexo A). PURO: sin E/S, sin reloj,
 * enteros en micro-USD (nunca coma flotante). El gasto del mes se calcula POR INTENTO (modelo x region registrados en cada intento con llamada al proveedor), no por contador de cuenta:
 * el reinicio de cuota de una cuenta no reduce el gasto. Una fila sin par o con un par fuera de la tabla se valora con el coste MAXIMO de la tabla (cota conservadora).
 * Tabla vacia = falla cerrado (`TABLE_EMPTY`).
 *
 * @implements REQ-CFG9-004, REQ-CFG9-008, NFR-009-003, EDGE-009-021, EDGE-009-036
 */

/** Clave de proveedor (no region) de las celdas de la Gemini API en la tabla de costes. */
export const SCENE_GEMINI_API_COST_KEY = 'gemini-api';

/** Tope mensual de gasto en micro-USD (5 USD). */
export const SCENE_MONTHLY_CAP_MICRO_USD = 5_000_000;

export type SceneCostTable = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * Pares VALIDOS con coste de fuente (D9-27, enmienda 2026-11-24 de Neo, Nivel 2): `gemini-2.5-flash-image` + `us-central1` = 45_000 µUSD (se conserva) y `gemini-3.1-flash-image-preview` + `global`
 * = 75_000 µUSD. El par `gemini-3.1-flash-image-preview` + `us-central1`, el nombre `gemini-3.1-flash-image` sin sufijo y cualquier otro par sin coste con fuente son INVALIDOS (INV-CFG9-001).
 */
export const SCENE_COST_TABLE_MICRO_USD: SceneCostTable = {
  'gemini-2.5-flash-image': { 'us-central1': 45_000, [SCENE_GEMINI_API_COST_KEY]: 45_000 },
  'gemini-3.1-flash-image': { global: 75_000, [SCENE_GEMINI_API_COST_KEY]: 75_000 },
  'gemini-3.1-flash-image-preview': { global: 75_000, [SCENE_GEMINI_API_COST_KEY]: 75_000 },
};

/** Clave de proveedor de las celdas `gemini-api` (D9-30 (7), Enmienda 009-C, Anexo A): la Gemini API no tiene region; la clave del proveedor ocupa el lugar de la region y NUNCA es una region de Vertex. */
export function sceneCostKeyOf(location: string | null): string {
  return location === null ? SCENE_GEMINI_API_COST_KEY : location;
}

export interface SceneSpendAttempt {
  readonly providerModel: string | null;
  readonly providerLocation: string | null;
  readonly providerCallStartedAt: string | null;
}

export type SceneSpendDecision =
  | { readonly ok: true; readonly remainingImages: number; readonly accumulatedMicroUsd: number; readonly projectedMicroUsd: number }
  | { readonly ok: false; readonly reason: 'PAIR_NOT_SELECTABLE' | 'TABLE_EMPTY' }
  | { readonly ok: false; readonly reason: 'SPEND_EXCEEDED'; readonly accumulatedMicroUsd: number; readonly projectedMicroUsd: number };

const own = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

const allCosts = (table: SceneCostTable): number[] => Object.values(table).flatMap((byRegion) => Object.values(byRegion));

/** Coste unitario del par, o `null` si el par no esta en la tabla. */
export function sceneUnitCost(table: SceneCostTable, model: string, location: string): number | null {
  if (!own(table, model)) return null;
  const byRegion = table[model]!;
  return own(byRegion, location) ? byRegion[location]! : null;
}

/** `true` si el par modelo x region tiene coste en la tabla de pares validos (D9-27; INV-CFG9-001). */
export const isSelectableScenePair = (model: string, location: string, table: SceneCostTable = SCENE_COST_TABLE_MICRO_USD): boolean => sceneUnitCost(table, model, location) !== null;

/** Techo derivado del tope global: floor(tope / costeMinimo); `null` con la tabla vacia. */
export function sceneCostCeiling(table: SceneCostTable): number | null {
  const costs = allCosts(table);
  if (costs.length === 0) return null;
  return Math.floor(SCENE_MONTHLY_CAP_MICRO_USD / Math.min(...costs));
}

/** Gasto acumulado del mes: suma el coste del par de cada intento con llamada al proveedor ejecutada; `null` (falla cerrado) con la tabla vacia. */
export function sceneAccumulatedSpend(attempts: readonly SceneSpendAttempt[], table: SceneCostTable): number | null {
  const costs = allCosts(table);
  if (costs.length === 0) return null;
  const worst = Math.max(...costs);
  let total = 0;
  for (const a of attempts) {
    if (a.providerCallStartedAt === null) continue;
    // `providerLocation` null con modelo = llamada a la Gemini API (sin region); modelo null = lectura fallida (coste maximo).
    const unit = a.providerModel === null ? null : sceneUnitCost(table, a.providerModel, sceneCostKeyOf(a.providerLocation));
    total += unit ?? worst;
  }
  return total;
}

/** gastoAcumuladoMes + max(0, max - usadas) x costeUnitario(par) <= tope. La decision no lleva valores de parametros. */
export function evaluateSceneSpendRule(input: {
  readonly table: SceneCostTable;
  readonly attempts: readonly SceneSpendAttempt[];
  readonly used: number;
  readonly model: string;
  readonly location: string;
  readonly max: number;
}): SceneSpendDecision {
  const accumulated = sceneAccumulatedSpend(input.attempts, input.table);
  if (accumulated === null) return { ok: false, reason: 'TABLE_EMPTY' };
  const unit = sceneUnitCost(input.table, input.model, input.location);
  if (unit === null) return { ok: false, reason: 'PAIR_NOT_SELECTABLE' };
  const remainingImages = Math.max(0, input.max - input.used);
  const projected = accumulated + remainingImages * unit;
  if (projected > SCENE_MONTHLY_CAP_MICRO_USD) return { ok: false, reason: 'SPEND_EXCEEDED', accumulatedMicroUsd: accumulated, projectedMicroUsd: projected };
  return { ok: true, remainingImages, accumulatedMicroUsd: accumulated, projectedMicroUsd: projected };
}

export interface SceneImagesFit {
  readonly model: string;
  readonly location: string;
  readonly imagesFit: number;
}

/**
 * Imagenes que aun caben por par seleccionable (contrato admin 1.5.0; EDGE-009-036): floor(max(0, tope - gastoAcumuladoMes) / costeDelPar), una entrada por par de la tabla en su orden.
 * Lista vacia (falla cerrado) con la tabla vacia. No expone costes ni gasto.
 */
export function sceneImagesFit(table: SceneCostTable, attempts: readonly SceneSpendAttempt[]): readonly SceneImagesFit[] {
  const spent = sceneAccumulatedSpend(attempts, table);
  if (spent === null) return [];
  const margin = Math.max(0, SCENE_MONTHLY_CAP_MICRO_USD - spent);
  // Contrato 1.7.0: `location` solo admite regiones de Vertex; las celdas `gemini-api` no se listan aqui.
  return Object.entries(table).flatMap(([model, byRegion]) =>
    Object.entries(byRegion)
      .filter(([location]) => location !== SCENE_GEMINI_API_COST_KEY)
      .map(([location, cost]) => ({ model, location, imagesFit: Math.floor(margin / cost) })),
  );
}
