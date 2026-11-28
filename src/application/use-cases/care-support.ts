/**
 * Piezas comunes de los casos de uso del Modo Cuidador (Feature 012, Bloque C, #26; T1655): acceso de cuidado desde BD, presentación de filas y cursor del historial.
 * Sin limitador de escrituras (R-3: los cubos 120/60/30 son de T1656). El autor, la hora y `late` los fija siempre el servidor; el dominio es puro.
 *
 * @implements REQ-CAR12-001, REQ-CAR12-003, REQ-CAR12-004, REQ-CAR12-006, REQ-CAR12-009, INV-ARCH-001, INV-ARCH-002
 */
import { DomainError } from '../../generated/v38/index.ts';
import { isOwnerOfPet } from '../../domain/access/pet-ownership.ts';
import { toRoleMembership } from '../../domain/households/household-policies.ts';
import { computeMyCareAccess, type MyCareAccess } from '../../domain/care/care-permissions.ts';
import { bogotaInstantMs } from '../../domain/care/care-time.ts';
import type { PetProfile } from '../../domain/pet/pet-invariants.ts';
import type { CareLogRecord, CareRoutineRecord, CaregiverAccessRecord } from '../ports/care.port.ts';
import type { RepositorySet } from '../ports/repositories.port.ts';
import { requireReadablePet } from './use-case-support.ts';

export const DELETED_USER_NAME = 'Usuario eliminado';

/** 422 uniforme del esquema (campo opcional). */
export const invalidField = (field: string): DomainError => new DomainError('ERR-SCHEMA-VALIDATION-FAILED', undefined, field);
export const forbidden = (): DomainError => new DomainError('ERR-ACC-FORBIDDEN', undefined, 'petId');
export const petNotFound = (): DomainError => new DomainError('ERR-PET-NOT-FOUND', undefined, 'petId');

/** Gancho opcional de la capa HTTP que el caso de uso invoca JUSTO DESPUÉS de superar la potestad (R-3: el cupo solo gasta peticiones que pasan sesión, CSRF y potestad); puede lanzar el 429. */
export type AfterAuthorization = () => void;

export interface CareContext {
  readonly pet: PetProfile;
  readonly titular: boolean;
  readonly access: MyCareAccess;
}

/** Acceso de cuidado de `userId` sobre una mascota, calculado en CADA petición desde la BD (sin caché de rol, EDGE-012-015). */
export async function careAccessOf(repositories: RepositorySet, userId: string, pet: PetProfile, now: string): Promise<CareContext> {
  const coOwners = await repositories.coOwners.listByPet(pet.id);
  const memberships = (await repositories.households.listMembershipsOfUsers([userId])).map(toRoleMembership);
  const assignments = await repositories.assignments.listByPet(pet.id);
  const accessRows = await repositories.caregiverAccess.listByPet(pet.id);
  const access = computeMyCareAccess({ userId, pet: { id: pet.id, ownerUserId: pet.ownerUserId, coOwners }, households: { memberships, assignments }, accessRows, now });
  return { pet, titular: isOwnerOfPet(userId, { ownerUserId: pet.ownerUserId, coOwners }), access };
}

/** Mascota visible (404 uniforme) con el acceso de cuidado del actor. */
export async function requireCareContext(repositories: RepositorySet, userId: string, petId: string, now: string): Promise<CareContext> {
  const { pet } = await requireReadablePet(repositories, userId, petId);
  return careAccessOf(repositories, userId, pet, now);
}

/** Nombres visibles por id de usuario (`username`); un id ausente o suprimido no aparece en el mapa. */
export async function usernamesById(repositories: RepositorySet, userIds: readonly (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  return new Map((await repositories.users.listByIds(ids)).map((u) => [u.id, u.username] as const));
}

export interface EntryViewer {
  readonly userId: string;
  readonly titular: boolean;
}

/** `CareLogEntry` del contrato. REQ-CAR12-009: los titulares ven al autor; un cuidador solo se ve a sí mismo (el autor ajeno solo aparece en el 409). */
export function presentEntry(entry: CareLogRecord, viewer: EntryViewer, names: ReadonlyMap<string, string>, includeRevertDetail: boolean): Record<string, unknown> {
  const mine = entry.performedByUserId !== null && entry.performedByUserId === viewer.userId;
  const author = entry.performedByUserId === null ? (viewer.titular ? DELETED_USER_NAME : null) : viewer.titular || mine ? (names.get(entry.performedByUserId) ?? null) : null;
  const view: Record<string, unknown> = {
    id: entry.id,
    routineId: entry.routineId,
    occurrenceDate: entry.occurrenceDate,
    occurrenceTime: entry.occurrenceTime,
    status: entry.status,
    late: entry.late,
    performedAt: entry.performedAt,
    performedByDisplayName: author,
    performedByMe: mine,
    note: entry.note ?? '',
    revertedAt: entry.revertedAt,
    doseAmountAtTime: entry.doseAmountAtTime,
    doseUnitAtTime: entry.doseUnitAtTime,
  };
  if (viewer.titular && includeRevertDetail) {
    view['revertedByDisplayName'] = entry.revertedAt === null ? null : entry.revertedByUserId === null ? DELETED_USER_NAME : (names.get(entry.revertedByUserId) ?? null);
    view['revertReason'] = entry.revertReason;
  }
  return view;
}

/** `CareRoutine` del contrato (`instructions` vacío en lugar de null). */
export function presentRoutine(r: CareRoutineRecord): Record<string, unknown> {
  return {
    id: r.id,
    seriesId: r.seriesId,
    petId: r.petId,
    kind: r.kind,
    title: r.title,
    instructions: r.instructions ?? '',
    doseAmount: r.doseAmount,
    doseUnit: r.doseUnit,
    timesOfDay: [...r.timesOfDay],
    daysOfWeek: [...r.daysOfWeek],
    startDate: r.startDate,
    endDate: r.endDate,
    ongoing: r.ongoing,
    active: r.active,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    supersedesRoutineId: r.supersedesRoutineId,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** `careUntil` es inclusivo: el nivel deja de aplicar a las 00:00:00 de Bogotá del día siguiente. */
export function isCareUntilExpired(careUntil: string | null, now: string): boolean {
  return careUntil !== null && Date.parse(now) >= bogotaInstantMs(careUntil, '00:00') + 86_400_000;
}

/** `CaregiverAccess` del contrato. */
export function presentAccess(row: CaregiverAccessRecord, username: string, now: string): Record<string, unknown> {
  return { petId: row.petId, userId: row.userId, username, level: row.level, careUntil: row.careUntil, expired: isCareUntilExpired(row.careUntil, now), grantedAt: row.grantedAt, version: row.version };
}

/** Suma de comprobación corta (FNV-1a de 32 bits en base 36, 8 caracteres): detecta cursores alterados; no es una barrera criptográfica. */
function checksum(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(8, '0').slice(-8);
}

export interface CareLogCursorPosition {
  readonly date: string;
  readonly time: string;
  readonly performedAt: string;
  readonly id: string;
}

/** Cursor opaco `[A-Za-z0-9_-]+` (≤ 200): la posición `fecha|hora|performedAt|id` más una suma de 8 caracteres que ata la mascota, la huella de filtros + rol y la posición. */
export function encodeCareLogCursor(petId: string, fingerprint: string, at: CareLogCursorPosition): string {
  const body = Buffer.from(`${at.date}|${at.time}|${at.performedAt}|${at.id}`, 'utf8').toString('base64url');
  return `${body}${checksum(`${petId}|${fingerprint}|${body}`)}`;
}

/** Un cursor alterado, de otra mascota o de otros filtros: el MISMO 422. */
export function decodeCareLogCursor(cursor: string, petId: string, fingerprint: string): CareLogCursorPosition {
  if (!/^[A-Za-z0-9_-]{9,200}$/.test(cursor)) throw invalidField('cursor');
  const body = cursor.slice(0, -8);
  if (checksum(`${petId}|${fingerprint}|${body}`) !== cursor.slice(-8)) throw invalidField('cursor');
  const parts = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (parts.length !== 4 || parts.some((x) => x === '')) throw invalidField('cursor');
  return { date: parts[0]!, time: parts[1]!, performedAt: parts[2]!, id: parts[3]! };
}
