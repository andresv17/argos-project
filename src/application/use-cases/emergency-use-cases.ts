/**
 * Casos de uso de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1675; `contracts/openapi/emergency.openapi.yaml` 0.3.0 APPROVED). Orden de evaluación de toda operación privada:
 * CSRF y sesión (capa HTTP) → tope por usuario (429, también cuenta lo que luego da 404) → AUTORIZACIÓN (404 uniforme) → esquema (422) → reglas de la operación → mutación → RECONCILIACIÓN al final.
 * El token se devuelve UNA sola vez (activar/regenerar) y solo se guarda su SHA-256; ninguna lectura posterior lo devuelve. La ruta pública jamás escribe salvo `last_scanned_at` con granularidad de 60 minutos.
 *
 * @implements REQ-QR12-001, REQ-QR12-002, REQ-QR12-003, REQ-QR12-004, REQ-QR12-005, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-001, INV-QR12-002, INV-QR12-003, INV-QR12-004, INV-QR12-006, INV-QR12-008,
 * SC-012-041..052, SC-012-083..087, SC-012-106, SC-012-110, SC-012-121..125, SC-012-127
 */
import { encodeQr, qrToSvg } from '../../domain/emergency/qr-encoder.ts';
import { isNoticeCompatible, isNoticeWaitExpired, shouldRefreshLastScanned, truncateLastScanned } from '../../domain/emergency/emergency-card-rules.ts';
import { buildEmergencyUrl } from '../../domain/emergency/emergency-url.ts';
import { normalizeE164 } from '../../domain/emergency/phone.ts';
import { phoneHmac, sameHex } from '../../domain/emergency/phone-hmac.ts';
import { normalizeCriticalAllergies, sanitizePublicPetName } from '../../domain/emergency/text-policy.ts';
import { generateEmergencyToken, hashEmergencyToken } from '../../domain/emergency/token.ts';
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { EMERGENCY_HISTORY_RETENTION_DAYS, QR_RATE_EVENTS_RETENTION_HOURS } from '../../domain/platform/feature-012-limits.ts';
import {
  DomainError,
  validateActivateEmergencyCardRequest,
  validateSetEmergencyPhoneConsentRequest,
  validateUpdateAccountPhoneRequest,
  type AccountPhoneView,
  type ActivateEmergencyCardRequest,
  type CriticalAllergiesView,
  type EmergencyCardActivationResult,
  type EmergencyCardOwnerView,
  type EmergencyCardPublicView,
  type SetEmergencyPhoneConsentRequest,
  type UpdateAccountPhoneRequest,
} from '../../generated/v38/index.ts';
import type { EmergencyCardRecord } from '../ports/emergency.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { requireOwner } from './co-ownership-support.ts';
import {
  ALLERGIES_AUDIT_TYPE,
  SYSTEM_EXECUTOR,
  actorRoleOf,
  buildOwnerView,
  chargeBucket,
  emergencyOf,
  loadCardState,
  notFound,
  reconcileCard,
  recordEmergencyAudit,
} from './emergency-support.ts';
import { assertMatchesSchema, requirePetAction, type ApplicationDeps } from './use-case-support.ts';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Estado vigente de la ficha tras una mutación: lee en la MISMA transacción, ya reconciliado. */
async function ownerView(deps: ApplicationDeps, repositories: RepositorySet, viewer: string, petId: string): Promise<EmergencyCardOwnerView> {
  return buildOwnerView(deps, repositories, viewer, petId);
}

/** @implements REQ-QR12-003, REQ-QR12-010, INV-QR12-004, SC-012-123 */
export class GetEmergencyCardStatusUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Autoriza (404 uniforme) y DESPUÉS reconcilia: un no titular no escribe nada. Nunca devuelve token, hash, URL ni SVG. */
  async execute(actorUserId: string, petId: string): Promise<EmergencyCardOwnerView> {
    const { deps } = this;
    emergencyOf(deps);
    return deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      await reconcileCard(deps, repositories, petId);
      return ownerView(deps, repositories, actorUserId, petId);
    });
  }
}

type CardRequest = ActivateEmergencyCardRequest;

/**
 * Núcleo común de activar y regenerar (mismo cuerpo, mismas guardas, mismo cubo de tope y misma respuesta): desde `OFF` cuenta como activar; con la ficha `ON` rota el token.
 * Orden: autorizar → esquema → (activar con `ON`: 409) → consentimiento del aviso → `showMyPhone` → guarda D12-14 → URL del QR → token nuevo → auditoría → reconciliación.
 */
async function issueCard(deps: ApplicationDeps, actorUserId: string, petId: string, input: unknown, mode: 'ACTIVATE' | 'REGENERATE'): Promise<EmergencyCardActivationResult> {
  const config = emergencyOf(deps);
  await chargeBucket(deps, 'QR_CARD_MUTATION', actorUserId);
  return deps.uow.runInTransaction(async (repositories) => {
    await requireOwner(repositories, actorUserId, petId);
    const body = assertMatchesSchema<CardRequest>('ActivateEmergencyCardRequest', validateActivateEmergencyCardRequest, input);
    const now = deps.clock.nowIsoTimestamp();
    const previous = await repositories.emergencyCards.findByPet(petId);
    const wasOn = previous?.status === 'ON';
    if (mode === 'ACTIVATE' && wasOn) throw new DomainError('ERR-QR12-ALREADY-ACTIVE');
    if (body.consentAccepted !== true || body.noticeVersion !== config.noticeVersion) throw new DomainError('ERR-QR12-CONSENT-REQUIRED');
    if (body.showMyPhone === true) await upsertMyConsent(deps, repositories, actorUserId, petId, config.noticeVersion);
    const state = (await loadCardState(repositories, config, petId))!;
    if (state.deceased || !(state.phones.length > 0 || state.allergies.length > 0)) throw new DomainError('ERR-QR12-ACTIVATION-REQUIREMENTS');
    const token = generateEmergencyToken(config.entropy.next32());
    const url = buildEmergencyUrl(config.publicBaseUrl, token);
    const qrSvg = qrToSvg(encodeQr(url));
    const row: EmergencyCardRecord = {
      petId,
      status: 'ON',
      statusReason: null,
      statusChangedAt: now,
      tokenHash: hashEmergencyToken(token),
      tokenRotatedAt: now,
      consentNoticeVersion: config.noticeVersion,
      consentedByUserId: actorUserId,
      activatedAt: wasOn ? (previous?.activatedAt ?? now) : now,
      lastScannedAt: null,
      version: (previous?.version ?? 0) + 1,
    };
    await repositories.emergencyCards.save(row); // invalida el token anterior y emite el nuevo en una sola escritura (INV-QR12-008)
    await recordEmergencyAudit(deps, repositories, actorUserId, wasOn ? 'EMERGENCY_CARD_REGENERATED' : 'EMERGENCY_CARD_ACTIVATED', petId, wasOn ? null : { noticeVersion: config.noticeVersion });
    await reconcileCard(deps, repositories, petId); // disparador enumerado: activar/regenerar con la ficha ON
    return { petId, status: 'ON', token, url, qrSvg, noticeVersion: config.noticeVersion, activatedAt: row.activatedAt!, shownOnce: true };
  });
}

/** Registra MI opt-in de teléfono para esta mascota (ligado a `phone_hmac`) y audita el cambio; sin teléfono en la cuenta, `ERR-QR12-PHONE-INVALID` con detalle genérico. */
async function upsertMyConsent(deps: ApplicationDeps, repositories: RepositorySet, actorUserId: string, petId: string, noticeVersion: string): Promise<void> {
  const config = emergencyOf(deps);
  const account = await repositories.users.findById(actorUserId);
  if (account?.phone === undefined) throw new DomainError('ERR-QR12-PHONE-INVALID', 'Agrega un teléfono a tu cuenta para mostrarlo en la ficha QR.', 'phone');
  await repositories.emergencyConsents.upsert({ petId, userId: actorUserId, consentedAt: deps.clock.nowIsoTimestamp(), noticeVersion, phoneHmac: phoneHmac(config.phoneHmacKey, account.phone) });
  await recordEmergencyAudit(deps, repositories, actorUserId, 'EMERGENCY_PHONE_CONSENT_CHANGED', petId, { visible: true, noticeVersion });
}

/** @implements REQ-QR12-003, REQ-QR12-005, REQ-QR12-006, INV-QR12-001, INV-QR12-005, SC-012-046, SC-012-052 */
export class ActivateEmergencyCardUseCase {
  constructor(private readonly deps: ApplicationDeps) {}
  async execute(actorUserId: string, petId: string, input: unknown): Promise<EmergencyCardActivationResult> {
    return issueCard(this.deps, actorUserId, petId, input, 'ACTIVATE');
  }
}

/** @implements REQ-QR12-003, REQ-QR12-010, INV-QR12-008, SC-012-083 */
export class RegenerateEmergencyCardUseCase {
  constructor(private readonly deps: ApplicationDeps) {}
  async execute(actorUserId: string, petId: string, input: unknown): Promise<EmergencyCardActivationResult> {
    return issueCard(this.deps, actorUserId, petId, input, 'REGENERATE');
  }
}

/** @implements REQ-QR12-003, SC-012-045, SC-012-083 */
export class DeactivateEmergencyCardUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Idempotente: con la ficha ya `OFF` (o sin ficha) no cambia nada. Comparte el cubo `QR_CARD_MUTATION` con activar y regenerar (trinity N-09). */
  async execute(actorUserId: string, petId: string): Promise<204> {
    const { deps } = this;
    emergencyOf(deps);
    await chargeBucket(deps, 'QR_CARD_MUTATION', actorUserId);
    return deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      const now = deps.clock.nowIsoTimestamp();
      if (await repositories.emergencyCards.switchOffIfOn(petId, 'USER_DEACTIVATED', now)) {
        await repositories.emergencyConsents.deleteByPet(petId); // reactivar exige un opt-in nuevo
        await recordEmergencyAudit(deps, repositories, actorUserId, 'EMERGENCY_CARD_DEACTIVATED', petId);
      }
      return 204 as const;
    });
  }
}

/** @implements REQ-QR12-006, REQ-QR12-010, INV-QR12-003, SC-012-084, SC-012-085, SC-012-086, SC-012-122, SC-012-123 */
export class SetEmergencyPhoneConsentUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Aplica PRIMERO la mutación (en una reconfirmación se actualizan `notice_version` y `consented_at`) y reconcilia DESPUÉS, para no apagar la ficha ni borrar el consentimiento que se reconfirmaba. */
  async execute(actorUserId: string, petId: string, input: unknown): Promise<EmergencyCardOwnerView> {
    const { deps } = this;
    const config = emergencyOf(deps);
    await chargeBucket(deps, 'QR_PRIVATE_WRITE', actorUserId);
    return deps.uow.runInTransaction(async (repositories) => {
      await requireOwner(repositories, actorUserId, petId);
      const body = assertMatchesSchema<SetEmergencyPhoneConsentRequest>('SetEmergencyPhoneConsentRequest', validateSetEmergencyPhoneConsentRequest, input);
      if (body.visible) {
        const account = await repositories.users.findById(actorUserId);
        if (account?.phone === undefined) throw new DomainError('ERR-QR12-PHONE-INVALID', 'Agrega un teléfono a tu cuenta para mostrarlo en la ficha QR.', 'phone');
        if (body.noticeVersion !== config.noticeVersion) throw new DomainError('ERR-QR12-CONSENT-REQUIRED');
        await upsertMyConsent(deps, repositories, actorUserId, petId, config.noticeVersion);
      } else if (await repositories.emergencyConsents.delete(petId, actorUserId)) {
        await recordEmergencyAudit(deps, repositories, actorUserId, 'EMERGENCY_PHONE_CONSENT_CHANGED', petId, { visible: false });
      }
      await reconcileCard(deps, repositories, petId);
      return ownerView(deps, repositories, actorUserId, petId);
    });
  }
}

/** @implements REQ-QR12-002, REQ-QR12-009, REQ-QR12-010, SC-012-042..045, SC-012-048 (T1662) */
export class UpdateCriticalAllergiesUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /**
   * Editable por el principal, el co-propietario ACTIVE y el ADMIN de hogar con la mascota en su hogar (rol efectivo, decisión de Neo 2026-11-27 (a)); quien no puede leer la mascota recibe el 404
   * uniforme. Reemplazo total e idempotente por contenido: solo un CAMBIO EFECTIVO audita `PET_CRITICAL_ALLERGIES_UPDATED`, con el rol del actor y SIN contenido, conteo, IP ni agente.
   */
  async execute(actorUserId: string, petId: string, input: unknown): Promise<CriticalAllergiesView> {
    const { deps } = this;
    emergencyOf(deps);
    await chargeBucket(deps, 'QR_PRIVATE_WRITE', actorUserId);
    return deps.uow.runInTransaction(async (repositories) => {
      const { pet } = await requirePetAction(repositories, actorUserId, petId, 'EDIT_PET_BASICS');
      // La forma (objeto con la lista) se valida aquí y la política de texto la aplica el DOMINIO: el esquema generado acota a 5 elementos de 1 a 60 y daría un error de esquema distinto sin pasar por `TEXT_POLICY`;
      // así un elemento inválido, uno vacío o la lista de 6 dan el mismo `ERR-SCHEMA-VALIDATION-FAILED` sin eco del valor.
      if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.keys(input).some((key) => key !== 'criticalAllergies') || !('criticalAllergies' in input)) {
        throw new DomainError('ERR-SCHEMA-VALIDATION-FAILED', 'La petición no cumple el formato esperado.', 'criticalAllergies');
      }
      const next = normalizeCriticalAllergies((input as { criticalAllergies: unknown }).criticalAllergies);
      const current = await repositories.emergencyCards.findAllergies(petId);
      const changed = current.length !== next.length || current.some((item, index) => item !== next[index]);
      if (changed) {
        await repositories.emergencyCards.setAllergies(petId, next);
        await recordEmergencyAudit(deps, repositories, actorUserId, ALLERGIES_AUDIT_TYPE, petId, { actorRole: await actorRoleOf(repositories, pet, actorUserId) });
      }
      const cardAutoDeactivated = await reconcileCard(deps, repositories, petId);
      return { petId, criticalAllergies: next as CriticalAllergiesView['criticalAllergies'], ...(cardAutoDeactivated ? { cardAutoDeactivated: true } : {}) };
    });
  }
}

/** @implements REQ-QR12-001, REQ-QR12-010, INV-QR12-003, SC-012-041, SC-012-047, SC-012-086 */
export class UpdateAccountPhoneUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /**
   * Fija o borra (`null`) el teléfono de LA PROPIA cuenta. Cambiarlo o borrarlo invalida (borra) los consentimientos ligados a `phone_hmac`, audita `EMERGENCY_PHONE_CONSENT_CHANGED` por cada mascota
   * afectada y DESPUÉS reconcilia cada ficha. El cuerpo y los errores no se registran ni ecoan el valor (LOG_REDACTION).
   */
  async execute(actorUserId: string, input: unknown): Promise<AccountPhoneView> {
    const { deps } = this;
    emergencyOf(deps);
    await chargeBucket(deps, 'QR_PRIVATE_WRITE', actorUserId);
    return deps.uow.runInTransaction(async (repositories) => {
      const body = assertMatchesSchema<UpdateAccountPhoneRequest>('UpdateAccountPhoneRequest', validateUpdateAccountPhoneRequest, input);
      const next = body.phone === null ? null : normalizeE164(body.phone);
      const account = await repositories.users.findByIdForUpdate(actorUserId);
      if (account === null) throw new DomainError('ERR-AUTH-UNAUTHENTICATED');
      if ((account.phone ?? null) === next) return { phone: next };
      await repositories.users.setPhone(actorUserId, next);
      const affected = (await repositories.emergencyConsents.listByUser(actorUserId)).map((c) => c.petId);
      for (const petId of affected) {
        await repositories.emergencyConsents.delete(petId, actorUserId);
        await recordEmergencyAudit(deps, repositories, actorUserId, 'EMERGENCY_PHONE_CONSENT_CHANGED', petId, { visible: false });
      }
      let droppedCards = 0;
      for (const petId of affected) if (await reconcileCard(deps, repositories, petId)) droppedCards += 1;
      return { phone: next, ...(droppedCards > 0 ? { emergencyCardsAutoDeactivated: droppedCards } : {}) };
    });
  }
}

/** Resultado interno de la lectura pública: la vista mínima o `null` (404 uniforme). */
export type PublicLookup = EmergencyCardPublicView | null;

/** @implements REQ-QR12-004, REQ-QR12-007, REQ-QR12-009, INV-QR12-002, INV-QR12-004, INV-QR12-006, SC-012-050, SC-012-051, SC-012-084, SC-012-110 */
export class GetEmergencyCardPublicUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  /** Lectura anónima por token: el hash se calcula SIEMPRE (también para valores mal formados). `ERR-PET-NOT-FOUND` uniforme ante cualquier falla. */
  async execute(token: string): Promise<EmergencyCardPublicView> {
    const view = await this.lookupByTokenHash(hashEmergencyToken(token));
    if (view === null) throw notFound();
    return view;
  }

  /**
   * Resuelve por el SHA-256 del token. Falla cerrada en cada lectura: ficha `ON`, mascota viva, nombre publicable y guarda cumplida; si no, `null`. NUNCA reconcilia ni escribe salvo `last_scanned_at`
   * (una vez por intervalo, solo tras token válido; su fallo no rompe la respuesta). Los teléfonos en espera o con HMAC distinto de la clave vigente no salen.
   */
  async lookupByTokenHash(tokenHash: string): Promise<PublicLookup> {
    const { deps } = this;
    const config = emergencyOf(deps);
    const now = deps.clock.nowIsoTimestamp();
    let refreshPetId: string | null = null;
    const view = await deps.uow.runInTransaction(async (repositories): Promise<PublicLookup> => {
      const card = await repositories.emergencyCards.findByTokenHash(tokenHash);
      if (card === null || card.status !== 'ON' || card.tokenHash === null || !sameHex(card.tokenHash, tokenHash)) return null;
      const state = await loadCardState(repositories, config, card.petId);
      if (state === null || state.deceased || !state.guardSatisfied) return null;
      const petName = sanitizePublicPetName(state.pet.name);
      if (petName === null) return null;
      if (shouldRefreshLastScanned(card.lastScannedAt, now)) refreshPetId = card.petId;
      return { petName, criticalAllergies: state.allergies as EmergencyCardPublicView['criticalAllergies'], contactPhones: state.phones.map((phone) => ({ phone })) as EmergencyCardPublicView['contactPhones'] };
    });
    if (view !== null && refreshPetId !== null) {
      const petId: string = refreshPetId;
      // Fuera de la transacción de lectura: en PostgreSQL un error de sentencia aborta la transacción y degradaría el COMMIT de la respuesta pública.
      try {
        await deps.uow.runInTransaction((repositories) => repositories.emergencyCards.touchLastScanned(petId, tokenHash, truncateLastScanned(now)));
      } catch {
        // Su fallo no rompe la lectura pública (contrato): la marca solo informa a los titulares.
      }
    }
    return view;
  }
}

/** Resultado del mantenimiento de la ficha: solo conteos, nunca identificadores. */
export interface EmergencyMaintenanceResult {
  readonly waitExpired: number;
  readonly cardsReconciled: number;
  readonly historyCleared: number;
  readonly rateEventsPurged: number;
}

/**
 * Barrido de mantenimiento de la 012 (`LAZY_RECONCILIATION`, trigger enumerado): borra los consentimientos en espera vencidos, reconcilia las fichas `ON` sin requisitos (para que no queden filas persistidas de cuentas
 * inactivas), devuelve a `OFF` sin historial las fichas con más de 90 días apagadas y purga los eventos de tope `QR_*` de más de 2 h. No escribe auditoría de usuario ni registra identificadores.
 * @implements REQ-QR12-006, REQ-QR12-010, SC-012-121, SC-012-122, SC-012-123, SC-012-124
 */
export class RunEmergencyMaintenanceUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<EmergencyMaintenanceResult> {
    const { deps } = this;
    const config = emergencyOf(deps);
    return deps.uow.runInTransaction(async (repositories) => {
      const now = deps.clock.nowIsoTimestamp();
      const expired = (await repositories.emergencyConsents.listAll()).filter((c) => !isNoticeCompatible(c.noticeVersion, config.noticeVersion) && isNoticeWaitExpired(config.noticeEffectiveAt, now));
      const touched = new Set<string>(await repositories.emergencyCards.listOnPetIds());
      let cardsReconciled = 0;
      for (const consent of expired) {
        if (await repositories.emergencyConsents.delete(consent.petId, consent.userId)) {
          await recordEmergencyAudit(deps, repositories, SYSTEM_EXECUTOR, 'EMERGENCY_PHONE_CONSENT_CHANGED', consent.petId, { visible: false, origin: 'NOTICE_WAIT_EXPIRED' });
          touched.add(consent.petId);
        }
      }
      for (const petId of [...touched].sort()) if (await reconcileCard(deps, repositories, petId)) cardsReconciled += 1;
      const historyCleared = await repositories.emergencyCards.clearHistoryBefore(addMillis(now, -EMERGENCY_HISTORY_RETENTION_DAYS * DAY_MS));
      const rateEventsPurged = await repositories.rateLimits.purgeScopesBefore(['QR_CARD_MUTATION', 'QR_PRIVATE_WRITE'], addMillis(now, -QR_RATE_EVENTS_RETENTION_HOURS * HOUR_MS));
      return { waitExpired: expired.length, cardsReconciled, historyCleared, rateEventsPurged };
    });
  }
}

/**
 * Barrido de rotación de `PHONE_HMAC_KEY` (anexo §9, decisión de Neo (2)): RECALCULA `phone_hmac` de cada fila desde `users.phone` con la clave vigente (el consentimiento se mantiene); si el usuario no tiene teléfono la
 * fila se BORRA (nunca queda en espera) con un `EMERGENCY_PHONE_CONSENT_CHANGED` de SISTEMA (`origin = PHONE_HMAC_KEY_ROTATION`) y se reconcilia la ficha. Idempotente.
 * @implements REQ-QR12-006, SC-012-122
 */
export class RotatePhoneHmacKeyUseCase {
  constructor(private readonly deps: ApplicationDeps) {}

  async execute(): Promise<{ readonly recalculated: number; readonly deleted: number; readonly cardsDeactivated: number }> {
    const { deps } = this;
    const config = emergencyOf(deps);
    return deps.uow.runInTransaction(async (repositories) => {
      const rows = await repositories.emergencyConsents.listAll();
      const accounts = new Map((await repositories.users.listByIds([...new Set(rows.map((r) => r.userId))])).map((u) => [u.id, u]));
      const touched = new Set<string>();
      let recalculated = 0;
      let deleted = 0;
      for (const row of rows) {
        const phone = accounts.get(row.userId)?.phone;
        if (phone === undefined) {
          if (await repositories.emergencyConsents.delete(row.petId, row.userId)) {
            await recordEmergencyAudit(deps, repositories, SYSTEM_EXECUTOR, 'EMERGENCY_PHONE_CONSENT_CHANGED', row.petId, { visible: false, origin: 'PHONE_HMAC_KEY_ROTATION' });
            deleted += 1;
            touched.add(row.petId);
          }
          continue;
        }
        const next = phoneHmac(config.phoneHmacKey, phone);
        if (next !== row.phoneHmac) {
          await repositories.emergencyConsents.upsert({ ...row, phoneHmac: next });
          recalculated += 1;
        }
      }
      let cardsDeactivated = 0;
      for (const petId of [...touched].sort()) if (await reconcileCard(deps, repositories, petId)) cardsDeactivated += 1;
      return { recalculated, deleted, cardsDeactivated };
    });
  }
}

