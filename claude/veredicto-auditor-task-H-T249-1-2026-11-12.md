# Veredicto Oracle: revalidacion H-T249-1 contra 497c12d (2026-11-12)

## Veredicto: APTO

## Evidencia
1. `git show --stat 497c12d`: 4 archivos. Codigo: solo `tests/fixtures/identity-fixtures.ts` (+13/-1, unicamente `identityState()`). Los otros 3 son bitacoras (evidencia T249, log-keymaker, registro). Sin cambios en src/, migraciones, specs ni archivos de aserciones.
2. Causa: la fila `row(4, ELENA, CARLA, MEMBER, INVITED)` ya no entra a `state.memberships` (filtro `status !== 'INVITED'`); va a `state.invitations` con invitationId, householdId, inviteeUsername, inviteeUserId, roleOnJoin CAREGIVER, invitedByUserId, status INVITED, createdAt, respondedAt null. La migracion 0004 define `household_invitations` con id, household_id, invitee_username, invitee_user_id, invited_by_user_id, role_on_join (ADMIN/CAREGIVER/READER), status (INVITED/DECLINED/CANCELLED/ACCEPTED), created_at, responded_at: admite todos los campos. `household_members` solo admite ACTIVE/LEFT/REMOVED, lo que explica el fallo original.
3. `IDENTITY_MEMBERSHIPS` queda intacto (4 filas, incluye INVITED de Carla); `tests/unit/account-deletion.spec.ts` lo sigue importando sin cambios. El diff no toca ninguna asercion.
4. Ejecucion: account-deletion.api + account.api = 2 files, 22/22 passed; unit account-deletion = 26/26; `npx tsc --noEmit` salida vacia, exit 0; verify-oracles.sh = 81 archivos, 0 debiles, CUMPLE.
5. H-T249-2 (3 pruebas de sqlite-repositories.spec via repository-contract-suite.ts:232 con INVITED directo) consta abierto en evidencia, log-keymaker y registro; el commit no toca ese archivo ni la suite.

## Hallazgos
- H-T249-1: CERRADO.
- H-T249-2: ABIERTO, fuera de alcance, requiere decision/adaptacion (patron C1-C3).
- Menor: la rama conserva 35 fallos de integracion documentados (B2 audit_log/OpenAPI/backup), no atribuibles a este commit.
