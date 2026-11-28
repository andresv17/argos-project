/**
 * Piezas comunes de los casos de uso de la ficha QR de emergencia (Feature 012, Bloque D, #32; T1675).
 * - Estado de la ficha de UNA mascota (`loadCardState`): titulares, alergias, consentimientos clasificados (visible / en espera por cambio del aviso / HMAC distinto de la clave vigente / inválido).
 * - Reconciliación perezosa (`reconcileCard`, `LAZY_RECONCILIATION`): UNA sola función llamada por todos los disparadores, SIEMPRE después de autorizar y de aplicar la mutación; `UPDATE … WHERE status = 'ON'` y
 *   un solo `EMERGENCY_CARD_AUTO_DEACTIVATED`. La ruta pública NUNCA reconcilia (solo falla cerrada).
 * - Topes por usuario (`chargeBucket`): ventana móvil de 1 h en `rate_limit_events` (ámbitos `QR_CARD_MUTATION` y `QR_PRIVATE_WRITE`), evaluados ANTES de autorizar y en su propia transacción, de modo que también
 *   cuentan las peticiones que acaban en 404; un intento bloqueado no se registra ni prolonga la ventana.
 * - Auditoría `EMERGENCY_*` y `PET_CRITICAL_ALLERGIES_UPDATED` (entidad `PET`, sin contenido, sin teléfono, token, hash ni URL).
 *
 * @implements REQ-QR12-003, REQ-QR12-006, REQ-QR12-007, REQ-QR12-010, INV-QR12-001, INV-QR12-003, INV-QR12-004, INV-QR12-008, SC-012-106, SC-012-121, SC-012-122, SC-012-123
 */
import { addMillis } from '../../domain/auth/utc-timestamp.ts';
import { deriveCriticalAllergiesChange, deriveLastChange, evaluateGuard, isNoticeCompatible, isNoticeWaitExpired, selectContactPhones, type AuditEventRef, type ContactCandidate } from '../../domain/emergency/emergency-card-rules.ts';
import { phoneHmac, sameHex } from '../../domain/emergency/phone-hmac.ts';
import { EMERGENCY_HISTORY_RETENTION_DAYS } from '../../domain/platform/feature-012-limits.ts';
import { isPrincipalOfPet } from '../../domain/access/pet-ownership.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { AuditMutationType } from '../../generated/v31/index.ts';
import { DomainError, type EmergencyCardOwnerView } from '../../generated/v38/index.ts';
import type { EmergencyCardRecord, EmergencyConsentRecord, EmergencyStatusReason } from '../ports/emergency.port.ts';
import type { RateLimitScope, RepositorySet } from '../ports/repositories.port.ts';
import type { ApplicationDeps, EmergencyServices } from './use-case-support.ts';

const DAY_MS = 86_400_000;

/** Tipos de auditoría de la ficha (el contrato 3.1.0 de `AuditMutationType` no los incluye: se castea en este único punto, como los de co-propiedad; el CHECK de `audit_log` los admite desde 0041/0037). */
export const EMERGENCY_AUDIT_TYPES = [
  'EMERGENCY_CARD_ACTIVATED',
  'EMERGENCY_CARD_REGENERATED',
  'EMERGENCY_CARD_DEACTIVATED',
  'EMERGENCY_CARD_AUTO_DEACTIVATED',
  'EMERGENCY_PHONE_CONSENT_CHANGED',
] as const;
export const LAST_CHANGE_AUDIT_TYPES: readonly string[] = ['EMERGENCY_CARD_ACTIVATED', 'EMERGENCY_CARD_REGENERATED', 'EMERGENCY_CARD_DEACTIVATED', 'EMERGENCY_CARD_AUTO_DEACTIVATED'];
export const ALLERGIES_AUDIT_TYPE = 'PET_CRITICAL_ALLERGIES_UPDATED';
type EmergencyAuditType = (typeof EMERGENCY_AUDIT_TYPES)[number] | typeof ALLERGIES_AUDIT_TYPE;
/** Ejecutor de los eventos de sistema (auto-apagado, vencimiento de la espera, rotación de la clave): `actorUserId = NULL` en el contrato; `audit_log.executor_user_id` no admite NULL. */
export const SYSTEM_EXECUTOR = 'SYSTEM';

export const notFound = (): DomainError => new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');

/** Servicios de la ficha; ausentes = falla cerrada con un error interno (la composición no los conectó). */
export function emergencyOf(deps: Pick<ApplicationDeps, 'emergency'>): EmergencyServices {
  if (deps.emergency === undefined) throw new DomainError('ERR-INTERNAL-UNEXPECTED', 'La ficha QR no está configurada en esta composición.');
  return deps.emergency;
}

/**
 * Fila de auditoría de la ficha: una por operación sobre la entidad `PET`. H-D1 (b): `newStateHash` queda siempre `null` (sin rol del actor, origen ni hash de metadatos); los eventos de sistema llevan
 * `actorUserId = NULL` en el contrato. Nunca se pasa el contenido de las alergias, el teléfono, su HMAC, el token, su hash ni la URL.
 */
export async function recordEmergencyAudit(deps: ApplicationDeps, repositories: RepositorySet, executorUserId: string, type: EmergencyAuditType, petId: string): Promise<void> {
  await deps.auditLog.append(repositories, {
    id: deps.auditIds.nextId(),
    timestamp: deps.clock.nowIsoTimestamp(),
    executorUserId,
    mutationType: type as unknown as AuditMutationType,
    entityType: 'PET',
    entityId: petId,
    previousStateHash: null,
    newStateHash: null,
  });
}

/**
 * Tope por usuario (REQ-QR12-007): ventana móvil de 1 h evaluada tras CSRF y sesión y ANTES de consultar la mascota; en su propia transacción, que confirma aunque la petición acabe en 404 o 422.
 * Rechazado con 429 no registra nada (la ventana no se prolonga). `Retry-After` conservador: la ventana completa.
 */
export async function chargeBucket(deps: ApplicationDeps, scope: Extract<RateLimitScope, 'QR_CARD_MUTATION' | 'QR_PRIVATE_WRITE'>, userId: string): Promise<void> {
  const allowed = await deps.uow.runInTransaction((repositories) => deps.rateLimiter.tryConsume(repositories, scope, userId, deps.clock.nowIsoTimestamp()));
  if (!allowed) throw Object.assign(new DomainError('ERR-RATE-LIMITED'), { retryAfterSeconds: 3600 });
}

/** Un consentimiento de teléfono clasificado contra el estado ACTUAL (clave, aviso, teléfono de la cuenta y pertenencia). */
export type ConsentKind = 'VISIBLE' | 'WAITING' | 'STALE' | 'INVALID';
export interface ClassifiedConsent {
  readonly consent: EmergencyConsentRecord;
  readonly kind: ConsentKind;
  readonly phone: string | null;
}

export interface CardState {
  readonly pet: PetProfile;
  readonly card: EmergencyCardRecord | null;
  readonly allergies: string[];
  readonly consents: ClassifiedConsent[];
  /** Teléfonos publicables (0 a 2), principal primero. */
  readonly phones: string[];
  /** Hay al menos un teléfono visible o una alergia crítica (D12-14); los consentimientos con HMAC distinto de la clave vigente (rotación pendiente) cuentan para la guarda pero NUNCA se publican. */
  readonly guardSatisfied: boolean;
  readonly deceased: boolean;
}

/**
 * Lee y clasifica el estado de la ficha. `STALE` = el teléfono existe pero su HMAC no coincide con la clave vigente (rotación o cambio fuera de banda): no se publica (falla cerrada) y el barrido de rotación
 * lo recalcula o lo borra; cuenta para la guarda para que la rotación no deje una ficha sin servicio mientras corre el barrido (anexo §9). `INVALID` = sin teléfono o sin pertenencia ACTIVE.
 */
export async function loadCardState(repositories: RepositorySet, config: EmergencyServices, petId: string): Promise<CardState | null> {
  const pet = await repositories.pets.findById(petId);
  if (pet === null) return null;
  const [card, allergies, rows, consents] = await Promise.all([
    repositories.emergencyCards.findByPet(petId),
    repositories.emergencyCards.findAllergies(petId),
    repositories.coOwners.listByPet(petId),
    repositories.emergencyConsents.listByPet(petId),
  ]);
  const joinedAt = new Map<string, string>();
  for (const row of rows) if (row.status === 'ACTIVE' && row.userId !== null) joinedAt.set(row.userId, row.joinedAt ?? row.invitedAt);
  const accounts = new Map((await repositories.users.listByIds(consents.map((c) => c.userId))).map((u) => [u.id, u]));
  const classified: ClassifiedConsent[] = consents.map((consent) => {
    const owner = isPrincipalOfPet(consent.userId, pet) || joinedAt.has(consent.userId);
    const phone = accounts.get(consent.userId)?.phone ?? null;
    if (!owner || phone === null) return { consent, kind: 'INVALID', phone };
    if (!sameHex(phoneHmac(config.phoneHmacKey, phone), consent.phoneHmac)) return { consent, kind: 'STALE', phone };
    if (!isNoticeCompatible(consent.noticeVersion, config.noticeVersion)) return { consent, kind: 'WAITING', phone };
    return { consent, kind: 'VISIBLE', phone };
  });
  const candidates: ContactCandidate[] = classified
    .filter((c) => c.kind === 'VISIBLE' && c.phone !== null)
    .map((c) => ({ userId: c.consent.userId, phone: c.phone!, joinedAt: joinedAt.get(c.consent.userId) ?? '', isPrincipal: isPrincipalOfPet(c.consent.userId, pet) }));
  const phones = selectContactPhones(candidates);
  const stale = classified.filter((c) => c.kind === 'STALE').length;
  const deceased = pet.lifeStatus === 'DECEASED';
  return { pet, card, allergies, consents: classified, phones, guardSatisfied: evaluateGuard({ visiblePhones: phones.length + stale, allergies: allergies.length }), deceased };
}

/** Borra la fila de un consentimiento y audita el cambio como evento de sistema (`actorUserId = NULL`). */
async function dropConsentAsSystem(deps: ApplicationDeps, repositories: RepositorySet, consent: EmergencyConsentRecord): Promise<void> {
  if (await repositories.emergencyConsents.delete(consent.petId, consent.userId)) {
    await recordEmergencyAudit(deps, repositories, SYSTEM_EXECUTOR, 'EMERGENCY_PHONE_CONSENT_CHANGED', consent.petId);
  }
}

/**
 * Reconciliación (`LAZY_RECONCILIATION`): (1) borra los consentimientos en espera vencidos (90 días desde la entrada en vigor del aviso); (2) si la ficha está `ON` y la mascota falleció o la guarda se perdió, la pasa a
 * `OFF` con `UPDATE … WHERE status = 'ON'`: solo si afecta una fila se borran los consentimientos y se emite UN `EMERGENCY_CARD_AUTO_DEACTIVATED`. Devuelve `true` si ESTA llamada la apagó.
 * Llamar SIEMPRE después de autorizar y de aplicar la mutación pedida (en una reconfirmación, primero se actualiza la fila).
 */
export async function reconcileCard(deps: ApplicationDeps, repositories: RepositorySet, petId: string): Promise<boolean> {
  const config = emergencyOf(deps);
  const now = deps.clock.nowIsoTimestamp();
  let state = await loadCardState(repositories, config, petId);
  if (state === null) return false;
  const waitingBefore = state.consents.some((c) => c.kind === 'WAITING');
  const expired = state.consents.filter((c) => c.kind === 'WAITING' && isNoticeWaitExpired(config.noticeEffectiveAt, now));
  for (const item of expired) await dropConsentAsSystem(deps, repositories, item.consent);
  if (expired.length > 0) state = (await loadCardState(repositories, config, petId))!;
  if (state.card === null || state.card.status !== 'ON') return false;
  const reason: EmergencyStatusReason | null = state.deceased ? 'AUTO_PET_DECEASED' : !state.guardSatisfied ? (waitingBefore ? 'AUTO_NOTICE_CHANGED' : 'AUTO_GUARD_LOST') : null;
  if (reason === null) return false;
  if (!(await repositories.emergencyCards.switchOffIfOn(petId, reason, now))) return false; // otro proceso ya reconcilió: sin segundo evento
  await repositories.emergencyConsents.deleteByPet(petId); // toda transición a OFF borra en el acto los consentimientos de teléfono (anexo §1)
  await recordEmergencyAudit(deps, repositories, SYSTEM_EXECUTOR, 'EMERGENCY_CARD_AUTO_DEACTIVATED', petId);
  return true;
}

/**
 * Un titular deja de serlo (`LEFT`, `ENDED` o cuenta eliminada): su consentimiento de teléfono se borra y la ficha se reconcilia (puede caer a `OFF` con `AUTO_GUARD_LOST`). Misma transacción que la salida.
 * Sin la ficha configurada solo se borra la fila (no hay ficha `ON` que reconciliar).
 */
export async function onOwnerRemoved(deps: ApplicationDeps, repositories: RepositorySet, petId: string, userId: string): Promise<void> {
  await repositories.emergencyConsents.delete(petId, userId);
  if (deps.emergency !== undefined) await reconcileCard(deps, repositories, petId);
}

/** Vista privada del estado (`EmergencyCardOwnerView`): nunca el token, su hash, la URL ni el SVG. */
export async function buildOwnerView(deps: ApplicationDeps, repositories: RepositorySet, viewerUserId: string, petId: string): Promise<EmergencyCardOwnerView> {
  const config = emergencyOf(deps);
  const state = (await loadCardState(repositories, config, petId))!;
  const now = deps.clock.nowIsoTimestamp();
  const since = addMillis(now, -EMERGENCY_HISTORY_RETENTION_DAYS * DAY_MS);
  const events = await repositories.auditLog.listEvents('PET', petId, [...LAST_CHANGE_AUDIT_TYPES, ALLERGIES_AUDIT_TYPE], since);
  const refs: AuditEventRef[] = events.map((e) => ({ type: e.mutationType, actorUserId: e.executorUserId === SYSTEM_EXECUTOR ? null : e.executorUserId, occurredAt: e.timestamp }));
  const card = state.card;
  const on = card?.status === 'ON';
  const mine = state.consents.find((c) => c.consent.userId === viewerUserId);
  const reasonFresh = card?.status === 'OFF' && card.statusReason !== null && card.statusChangedAt !== null && card.statusChangedAt > since;
  return {
    petId,
    status: on ? 'ON' : 'OFF',
    statusReason: reasonFresh ? card!.statusReason : null,
    guardSatisfied: state.guardSatisfied,
    myPhoneVisible: mine?.kind === 'VISIBLE',
    myPhoneReconfirmRequired: mine?.kind === 'WAITING',
    visiblePhonesCount: state.phones.length,
    criticalAllergiesCount: state.allergies.length,
    lastScannedAt: on ? (card?.lastScannedAt ?? null) : null,
    lastChange: deriveLastChange(refs, viewerUserId, now),
    criticalAllergiesChange: deriveCriticalAllergiesChange(refs, viewerUserId, now),
    noticeVersion: card?.consentNoticeVersion ?? null,
  };
}
