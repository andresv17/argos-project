/**
 * Casos de uso de los parametros en caliente de `/admin` (Feature 009, Fase 5a, #20; T1264; REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-007; EDGE-009-014, EDGE-009-015, EDGE-009-016).
 * - Lectura (`listAdminParameters`): SIEMPRE las seis claves del catalogo cerrado del codigo, en orden fijo, con valor efectivo (fila valida o defecto), defecto, restricciones, `writable`,
 *   fecha de la ultima edicion y autor (id de administrador de la ultima entrada de `admin_audit_entries`, NUNCA `updated_by_user_id`) y `etag`. Lee la FILA (sin la cache de <= 60 s):
 *   la vista muestra lo escrito; lo que rige en caliente tarda hasta 60 s por instancia (la interfaz lo avisa).
 * - Escritura (`updateAdminParameter`): orden esquema (clave del catalogo y escribible, `If-Match`, cuerpo cerrado, valor canonico EXACTO) -> precondicion (412). En UNA transaccion: compara el
 *   etag con la fila, hace compare-and-set de `value` y `updated_at` (`updated_by_user_id` queda `NULL`) y deja UNA entrada de auditoria con el id del administrador y la clave, SIN el valor.
 *   Un valor invalido o una clave no escribible NUNCA escribe. En 5b (T1296) modelo, region y tope global pasan ademas por la regla de coste (`ERR-ADMIN-SCENE-COST-CAP-EXCEEDED`, 422, sin escribir). Bajar el tope de fotos conserva las fotos (EDGE-009-015).
 * El etag es opaco y cambia con cada escritura aunque el valor sea igual (porque cambia `updated_at`); una fila ausente tiene el etag de ausencia.
 *
 * @implements ERR-ADMIN-SCENE-COST-CAP-EXCEEDED, REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-007, REQ-ADM9-004, INV-CFG9-003, EDGE-009-014, EDGE-009-015, EDGE-009-016, SC-009-017, SC-009-018, SC-009-019, SC-009-020, ERR-ADMIN-PARAMETER-PRECONDITION-FAILED, INV-ARCH-001, INV-ARCH-002
 */

import { sha256Hex } from '../../domain/audit/sha256.ts';
import {
  ADMIN_PARAMETER_CATALOG,
  ADMIN_PARAMETER_KEYS,
  effectiveParameter,
  isAdminParameterKey,
  type AdminParameterConstraints,
  type AdminParameterKey,
  type AdminParameterSpec,
} from '../../domain/platform/admin-parameter-catalog.ts';
import { quotaWindowOf } from '../../domain/scene/quota-window.ts';
import { SCENE_COST_TABLE_MICRO_USD, evaluateSceneSpendRule, sceneCostKeyOf, sceneImagesFit, type SceneImagesFit } from '../../domain/scene/scene-cost.ts';
import {
  SCENE_GLOBAL_QUOTA_USED_PREFIX,
  SCENE_PARAM_DRIVER_KEY,
  SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY,
  SCENE_PARAM_MODEL_KEY,
  deriveLocation,
  driverSupportsModel,
  isSceneProviderDriver,
  type SceneProviderDriver,
} from '../../domain/scene/provider-parameters.ts';
import { DomainError } from '../../generated/v35/index.ts';
import type { ParameterRowRecord } from '../ports/admin.port.ts';
import { ADMIN_AUDIT_ACTIONS } from './admin-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';

const invalid = (field: string, detail: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', detail, field);

const IF_MATCH = /^"[A-Za-z0-9_-]{8,64}"$/;
const ABSENT = 'ABSENT';

export interface AdminParameterView {
  readonly key: AdminParameterKey;
  readonly valueType: AdminParameterSpec['valueType'];
  readonly value: string;
  readonly default: string;
  readonly source: 'DATABASE' | 'DEFAULT';
  readonly constraints: AdminParameterConstraints;
  readonly writable: boolean;
  readonly lastEditedAt: string | null;
  readonly lastEditedBy: string | null;
  readonly etag: string;
}

/** Etag opaco de la version de la fila: cambia con cualquier escritura (valor o `updated_at`); distinto por clave. */
export function parameterEtag(key: string, row: ParameterRowRecord | null): string {
  const digest = sha256Hex(row === null ? `${key}\n${ABSENT}` : `${key}\n${row.value}\n${row.updatedAt}`);
  return `"${digest.slice(0, 32)}"`;
}

/** Proveedores del despliegue (T1314, D9-30): con credenciales y defecto de la fila ausente. Sin escena compuesta no hay ninguno (falla cerrado). */
export interface AdminDriverAvailability {
  readonly available: readonly SceneProviderDriver[];
  readonly defaultDriver: SceneProviderDriver | null;
}
const driversOf = (deps: ApplicationDeps): AdminDriverAvailability => ({
  available: deps.scene?.providerRouting?.available ?? [],
  defaultDriver: deps.scene?.providerRouting?.defaultDriver ?? null,
});

function viewOf(spec: AdminParameterSpec, row: ParameterRowRecord | null, lastEditedBy: string | null, drivers: AdminDriverAvailability): AdminParameterView {
  const isDriver = spec.key === SCENE_PARAM_DRIVER_KEY;
  const effective = effectiveParameter(spec, row?.value ?? null);
  // D9-30 (2)(4): el defecto del proveedor es el del despliegue y `allowed` lista solo los proveedores con credenciales (sin ninguno, el defecto de codigo para no dejar una lista vacia).
  const driverDefault = drivers.defaultDriver ?? spec.defaultValue;
  const value = isDriver && effective.source === 'DEFAULT' ? driverDefault : effective.value;
  const source = effective.source;
  return {
    key: spec.key,
    valueType: spec.valueType,
    value,
    default: isDriver ? driverDefault : spec.defaultValue,
    source,
    constraints: isDriver ? { allowed: drivers.available.length > 0 ? drivers.available : [driverDefault] } : spec.constraints,
    writable: spec.writable,
    lastEditedAt: row?.updatedAt ?? null,
    lastEditedBy,
    etag: parameterEtag(spec.key, row),
  };
}

/** @implements REQ-CFG9-001, REQ-CFG9-007, INV-CFG9-003, EDGE-009-014 */
export class ListAdminParametersUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<{ readonly items: readonly AdminParameterView[]; readonly sceneImagesFit: readonly SceneImagesFit[] }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const items: AdminParameterView[] = [];
      for (const key of ADMIN_PARAMETER_KEYS) {
        const row = await repositories.adminParameters.find(key);
        const editor = row === null ? null : await repositories.adminParameters.lastEditor(ADMIN_AUDIT_ACTIONS.parameterUpdate, key);
        items.push(viewOf(ADMIN_PARAMETER_CATALOG[key], row, editor, driversOf(this.deps)));
      }
      // Contrato 1.5.0: imagenes que aun caben por par (gasto del mes de la zona de la aplicacion); si no se puede calcular, lista vacia (falla cerrado).
      let fit: readonly SceneImagesFit[] = [];
      try {
        fit = sceneImagesFit(SCENE_COST_TABLE_MICRO_USD, await repositories.adminParameters.listSceneSpendAttempts(quotaWindowOf(this.deps.clock.todayIsoDate())));
      } catch {
        fit = [];
      }
      return { items, sceneImagesFit: fit };
    });
  }
}

/** @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-007, REQ-ADM9-004, EDGE-009-014, EDGE-009-015, EDGE-009-016 */
export class UpdateAdminParameterUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `key`, `ifMatch` y `body` llegan tal como los envio el cliente; cualquier valor fuera del contrato es `ERR-SCHEMA-VALIDATION-FAILED` y no escribe. */
  async execute(input: { readonly adminId: string; readonly key: string; readonly ifMatch: unknown; readonly body: unknown }): Promise<AdminParameterView> {
    if (!isAdminParameterKey(input.key)) throw invalid('key', 'El parámetro no existe en el catálogo.');
    const spec = ADMIN_PARAMETER_CATALOG[input.key];
    if (!spec.writable) throw invalid('key', 'El parámetro no se puede editar todavía.');
    if (typeof input.ifMatch !== 'string' || !IF_MATCH.test(input.ifMatch)) throw invalid('If-Match', 'If-Match debe ser el etag vigente del parámetro.');
    const value = parseValue(input.body);
    if (!spec.isCanonical(value)) throw invalid('value', 'El valor no cumple el formato o el rango del parámetro.');
    const ifMatch = input.ifMatch;
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const current = await repositories.adminParameters.find(spec.key);
      // El detalle del 412 no incluye el valor vigente (EDGE-009-016).
      if (parameterEtag(spec.key, current) !== ifMatch) throw new DomainError('ERR-ADMIN-PARAMETER-PRECONDITION-FAILED');
      // D9-29: un solo selector; la region se deriva del modelo y no se guarda. Una clave, una auditoria.
      if (COST_KEYS.has(spec.key)) {
        await this.assertDriverModel(repositories, spec.key, value);
        await this.assertSpendRule(repositories, spec.key, value);
      }
      const written = await repositories.adminParameters.compareAndSet(spec.key, spec.description, { value, updatedAt: now }, current);
      if (!written) throw new DomainError('ERR-ADMIN-PARAMETER-PRECONDITION-FAILED');
      // Solo el id del administrador, la clave y la marca de tiempo: nunca el valor (REQ-CFG9-007).
      await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: input.adminId, action: ADMIN_AUDIT_ACTIONS.parameterUpdate, objectRef: spec.key, occurredAt: now });
      return viewOf(spec, { value, updatedAt: now }, input.adminId, driversOf(this.deps));
    });
  }

  /** Proveedor efectivo: fila valida o defecto del despliegue (o `vertex`, defecto de codigo, sin enrutador). */
  private async effectiveDriver(repositories: RepositorySet): Promise<SceneProviderDriver> {
    const raw = (await repositories.adminParameters.find(SCENE_PARAM_DRIVER_KEY))?.value ?? null;
    if (raw !== null && isSceneProviderDriver(raw)) return raw;
    return driversOf(this.deps).defaultDriver ?? 'vertex';
  }

  /**
   * D9-30 (4)(5): guardar un proveedor SIN credenciales en el despliegue, o un proveedor/modelo que no se admiten entre si, es 422 sin escribir (sin detalle de secretos ni valores).
   * Elegir el modelo exige que el proveedor vigente lo admita; elegir el proveedor exige que admita el modelo vigente.
   */
  private async assertDriverModel(repositories: RepositorySet, key: AdminParameterKey, value: string): Promise<void> {
    if (key === SCENE_PARAM_DRIVER_KEY) {
      if (!isSceneProviderDriver(value) || !driversOf(this.deps).available.includes(value)) throw invalid('value', 'El proveedor no está disponible en este despliegue.');
      const model = effectiveParameter(ADMIN_PARAMETER_CATALOG[SCENE_PARAM_MODEL_KEY], (await repositories.adminParameters.find(SCENE_PARAM_MODEL_KEY))?.value ?? null).value;
      if (!driverSupportsModel(value, model)) throw invalid('value', 'El proveedor no admite el modelo vigente.');
    } else if (key === SCENE_PARAM_MODEL_KEY) {
      if (!driverSupportsModel(await this.effectiveDriver(repositories), value)) throw invalid('value', 'El proveedor vigente no admite ese modelo.');
    }
  }

  /**
   * Regla de coste (EDGE-009-036, T1296 (i)): con el valor nuevo sustituido en la combinacion vigente (modelo, region, tope), gasto del mes por intento (ventana `quota_window` de la zona
   * de la aplicacion, America/Bogota) + max(0, tope - usadas) x coste del par <= 5_000_000 micro-USD. Par sin celda verificada = 422 de esquema; exceso o tabla vacia = 422 de tope de gasto.
   * Sin cifras en el error; si lanza, la transaccion no escribe ni audita.
   */
  private async assertSpendRule(repositories: RepositorySet, key: AdminParameterKey, value: string): Promise<void> {
    const effective = async (k: AdminParameterKey): Promise<string> => effectiveParameter(ADMIN_PARAMETER_CATALOG[k], (await repositories.adminParameters.find(k))?.value ?? null).value;
    const model = key === SCENE_PARAM_MODEL_KEY ? value : await effective(SCENE_PARAM_MODEL_KEY);
    // D9-29/D9-30 (7): ubicacion DERIVADA del modelo (Vertex) o clave del proveedor `gemini-api` (sin region); un par sin coste de fuente no es seleccionable.
    const driver = key === SCENE_PARAM_DRIVER_KEY ? (value as SceneProviderDriver) : await this.effectiveDriver(repositories);
    const location = driver === 'vertex' ? (deriveLocation('vertex', model) ?? '') : sceneCostKeyOf(null);
    const max = Number(key === SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY ? value : await effective(SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY));
    const window = quotaWindowOf(this.deps.clock.todayIsoDate());
    const usedRaw = (await repositories.adminParameters.find(`${SCENE_GLOBAL_QUOTA_USED_PREFIX}${window}`))?.value ?? '0';
    const used = /^[0-9]{1,9}$/.test(usedRaw) ? Number(usedRaw) : 0;
    const attempts = await repositories.adminParameters.listSceneSpendAttempts(window);
    const decision = evaluateSceneSpendRule({ table: SCENE_COST_TABLE_MICRO_USD, attempts, used, model, location, max });
    if (decision.ok) return;
    if (decision.reason === 'PAIR_NOT_SELECTABLE') throw invalid('value', 'La combinación de modelo y región no está disponible.');
    throw new DomainError('ERR-ADMIN-SCENE-COST-CAP-EXCEEDED');
  }
}

/** Claves cuyo guardado pasa por la regla de coste (modelo, region y tope global). */
const COST_KEYS: ReadonlySet<string> = new Set([SCENE_PARAM_MODEL_KEY, SCENE_PARAM_GLOBAL_QUOTA_MAX_KEY, SCENE_PARAM_DRIVER_KEY]);

/**
 * Reinicio de la cuota de escena de las cuentas del administrador (T1268, REQ-CFG9-006, EDGE-009-022, EDGE-009-023; SC-009-026; opcion A de Neo, ADR-009-13): una transaccion que pone a cero SOLO los
 * contadores de las cuentas de usuario del administrador (sub de Google vinculado o correo verificado de la lista) y deja UNA entrada de auditoria sin ids de cuenta ni contadores. Los hogares
 * compartidos y `scene.global_quota_used.*` no se tocan. Si otra escritura cambia un contador durante el reinicio, 409 ERR-ADMIN-QUOTA-RESET-CONFLICT sin cambios parciales ni auditoria.
 *
 * @implements REQ-CFG9-006, REQ-ADM9-004, EDGE-009-022, EDGE-009-023, SC-009-026, ERR-ADMIN-QUOTA-RESET-CONFLICT
 */
export class ResetAdminSceneQuotaUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** `body` llega tal como lo envio el cliente: solo se admite ausente o `{}`. */
  async execute(input: { readonly adminId: string; readonly body: unknown }): Promise<{ readonly accountsReset: number; readonly resetAt: string }> {
    const body = input.body;
    if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)) throw invalid('body', 'El reinicio no admite cuerpo.');
    if (this.deps.admin === undefined) throw new DomainError('ERR-INTERNAL-UNEXPECTED');
    const emails = this.deps.admin.allowedEmails;
    const now = this.deps.clock.nowIsoTimestamp();
    return this.deps.uow.runInTransaction(async (repositories) => {
      const identity = await repositories.adminIdentities.findById(input.adminId);
      const subjects = identity === null ? [] : [identity.providerSubject];
      const result = await repositories.adminParameters.resetAdminAccountsSceneQuota(subjects, emails, now);
      if (result === null) throw new DomainError('ERR-ADMIN-QUOTA-RESET-CONFLICT');
      await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: input.adminId, action: ADMIN_AUDIT_ACTIONS.sceneQuotaReset, objectRef: null, occurredAt: now });
      return { accountsReset: result.accountsReset, resetAt: now };
    });
  }
}

/** Cuerpo cerrado: exactamente `{ value: string }` no vacio y dentro de la cota de transporte. */
function parseValue(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('value', 'El cuerpo debe ser un objeto con value.');
  const keys = Object.keys(body);
  const value = (body as Record<string, unknown>)['value'];
  if (keys.length !== 1 || keys[0] !== 'value' || typeof value !== 'string' || value.length < 1 || value.length > 16384) throw invalid('value', 'El cuerpo debe contener solo value como texto.');
  return value;
}
