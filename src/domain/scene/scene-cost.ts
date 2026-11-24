/**
 * Regla de coste de la escena (feature 009, Fase 5b, T1296; EDGE-009-036, EDGE-009-021, REQ-CFG9-004, REQ-CFG9-008; NFR-009-003; Enmienda 009-B 3.10.0, Anexo A). PURO: sin E/S, sin reloj,
 * enteros en micro-USD (nunca coma flotante). El gasto del mes se calcula POR INTENTO (modelo x region registrados en cada intento con llamada al proveedor), no por contador de cuenta:
 * el reinicio de cuota de una cuenta no reduce el gasto. Una fila sin par o con un par fuera de la tabla se valora con el coste MAXIMO de la tabla (cota conservadora).
 * Tabla vacia = falla cerrado (`TABLE_EMPTY`).
 *
 * @implements REQ-CFG9-004, REQ-CFG9-008, NFR-009-003, EDGE-009-021, EDGE-009-036
 */

/** Tope mensual de gasto en micro-USD (5 USD). */
export const SCENE_MONTHLY_CAP_MICRO_USD = 5_000_000;

export type SceneCostTable = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Anexo A APROBADO (constitucion 3.10.0): solo los dos pares verificados de us-central1; `global` y los demas pares no son seleccionables. */
export const SCENE_COST_TABLE_MICRO_USD: SceneCostTable = {
  'gemini-2.5-flash-image': { 'us-central1': 45_000 },
  'gemini-3.1-flash-image': { 'us-central1': 75_000 },
};

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
    const unit = a.providerModel === null || a.providerLocation === null ? null : sceneUnitCost(table, a.providerModel, a.providerLocation);
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
  return Object.entries(table).flatMap(([model, byRegion]) => Object.entries(byRegion).map(([location, cost]) => ({ model, location, imagesFit: Math.floor(margin / cost) })));
}
