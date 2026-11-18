/**
 * Puerto de ganchos de privacidad y ciclo de vida de la escena (feature 006, enmienda `N2-06` (d); ratificado por /architect el 2026-11-18, plan.md §1.2
 * «Puerto `ScenePrivacyHooksPort`»). Es el ÚNICO punto por donde los casos de uso LOCKED de 002/004/005 tocan la escena; ninguno importa `scene-use-cases` ni
 * el dominio de escena (INV-ARCH-001/002).
 *
 * Reglas del contrato: el caso de uso invoca el gancho dentro del `runInTransaction` de la causa con el `RepositorySet` de esa transacción (el gancho no abre
 * transacción ni hace E/S externa; si lanza, la causa se revierte completa); los ganchos de retiro se invocan ANTES de la mutación y `onHouseholdCreated`
 * DESPUÉS de insertar el hogar; eventos opacos (solo identificadores, `cause` de lista cerrada, el seudónimo HMAC de auditoría y `now` UTC canónico de
 * `ClockPort.nowIsoTimestamp()`): sin nombres, fotos, claves de objeto, textos libres ni correos (INV-ESC6-016); sin escena no hay efecto (INV-ESC6-019) y
 * son idempotentes; un evento por causa (`onMemberRemoved` subsume la desasignación). Todo devuelve `Promise<void>` (INV-ARCH-005).
 *
 * @implements REQ-ESC6-017, REQ-ESC6-022, REQ-ESC6-029, REQ-ESC6-030, REQ-ESC6-032, INV-ESC6-016, INV-ESC6-019, INV-ARCH-005
 */

import type { RepositorySet } from './repositories.port.ts';

export interface ScenePrivacyHooksPort {
  onPetRemoved(repositories: RepositorySet, event: { petId: string; cause: 'PET_DELETED' | 'AVATAR_DELETED'; now: string }): Promise<void>;
  onPetUnassigned(repositories: RepositorySet, event: { petId: string; householdId: string; now: string }): Promise<void>;
  onMemberRemoved(repositories: RepositorySet, event: { householdId: string; userId: string; cause: 'LEFT' | 'REMOVED'; now: string }): Promise<void>;
  onHouseholdCreated(repositories: RepositorySet, event: { householdId: string; ownerUserId: string; now: string }): Promise<void>;
  onHouseholdDeleting(repositories: RepositorySet, event: { householdId: string; now: string }): Promise<void>;
  onAccountDeleting(repositories: RepositorySet, event: { userId: string; pseudonym: string; householdIds: readonly string[]; now: string }): Promise<void>;
  onPetOwnershipTransferred(repositories: RepositorySet, event: { petId: string; previousOwnerUserId: string; newOwnerUserId: string; now: string }): Promise<void>;
  onBackupImported(repositories: RepositorySet, event: { ownerUserId: string; replacedPetIds: readonly string[]; now: string }): Promise<void>;
}
