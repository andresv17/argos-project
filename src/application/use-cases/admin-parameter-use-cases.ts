/**
 * Casos de uso de los parametros en caliente de `/admin` (Feature 009, Fase 5a, #20; T1264; REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-007; EDGE-009-014, EDGE-009-015, EDGE-009-016).
 * - Lectura (`listAdminParameters`): SIEMPRE las seis claves del catalogo cerrado del codigo, en orden fijo, con valor efectivo (fila valida o defecto), defecto, restricciones, `writable`,
 *   fecha de la ultima edicion y autor (id de administrador de la ultima entrada de `admin_audit_entries`, NUNCA `updated_by_user_id`) y `etag`. Lee la FILA (sin la cache de <= 60 s):
 *   la vista muestra lo escrito; lo que rige en caliente tarda hasta 60 s por instancia (la interfaz lo avisa).
 * - Escritura (`updateAdminParameter`): orden esquema (clave del catalogo y escribible, `If-Match`, cuerpo cerrado, valor canonico EXACTO) -> precondicion (412). En UNA transaccion: compara el
 *   etag con la fila, hace compare-and-set de `value` y `updated_at` (`updated_by_user_id` queda `NULL`) y deja UNA entrada de auditoria con el id del administrador y la clave, SIN el valor.
 *   Un valor invalido o una clave no escribible (P5-06 = B: solo `album.max_photos_per_pet` y `scene.enabled` en 5a) NUNCA escribe. Bajar el tope de fotos conserva las fotos (EDGE-009-015).
 * El etag es opaco y cambia con cada escritura aunque el valor sea igual (porque cambia `updated_at`); una fila ausente tiene el etag de ausencia.
 *
 * @implements REQ-CFG9-001, REQ-CFG9-002, REQ-CFG9-007, REQ-ADM9-004, INV-CFG9-003, EDGE-009-014, EDGE-009-015, EDGE-009-016, SC-009-017, SC-009-018, SC-009-019, SC-009-020, ERR-ADMIN-PARAMETER-PRECONDITION-FAILED, INV-ARCH-001, INV-ARCH-002
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
import { DomainError } from '../../generated/v35/index.ts';
import type { ParameterRowRecord } from '../ports/admin.port.ts';
import { ADMIN_AUDIT_ACTIONS } from './admin-use-cases.ts';
import type { ApplicationDeps } from './use-case-support.ts';

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

function viewOf(spec: AdminParameterSpec, row: ParameterRowRecord | null, lastEditedBy: string | null): AdminParameterView {
  const { value, source } = effectiveParameter(spec, row?.value ?? null);
  return {
    key: spec.key,
    valueType: spec.valueType,
    value,
    default: spec.defaultValue,
    source,
    constraints: spec.constraints,
    writable: spec.writable,
    lastEditedAt: row?.updatedAt ?? null,
    lastEditedBy,
    etag: parameterEtag(spec.key, row),
  };
}

/** @implements REQ-CFG9-001, REQ-CFG9-007, INV-CFG9-003, EDGE-009-014 */
export class ListAdminParametersUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<{ readonly items: readonly AdminParameterView[] }> {
    return this.deps.uow.runInTransaction(async (repositories) => {
      const items: AdminParameterView[] = [];
      for (const key of ADMIN_PARAMETER_KEYS) {
        const row = await repositories.adminParameters.find(key);
        const editor = row === null ? null : await repositories.adminParameters.lastEditor(ADMIN_AUDIT_ACTIONS.parameterUpdate, key);
        items.push(viewOf(ADMIN_PARAMETER_CATALOG[key], row, editor));
      }
      return { items };
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
      const written = await repositories.adminParameters.compareAndSet(spec.key, spec.description, { value, updatedAt: now }, current);
      if (!written) throw new DomainError('ERR-ADMIN-PARAMETER-PRECONDITION-FAILED');
      // Solo el id del administrador, la clave y la marca de tiempo: nunca el valor (REQ-CFG9-007).
      await repositories.adminAudit.insert({ id: this.deps.ids.nextId(), adminId: input.adminId, action: ADMIN_AUDIT_ACTIONS.parameterUpdate, objectRef: spec.key, occurredAt: now });
      return viewOf(spec, { value, updatedAt: now }, input.adminId);
    });
  }
}

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
      const result = await repositories.adminParameters.resetAdminAccountsSceneQuota(subjects, emails);
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
