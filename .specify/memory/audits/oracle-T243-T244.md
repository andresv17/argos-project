# Auditoría Oracle T243 y T244 (2026-11-11)

Veredicto: PASS CON OBSERVACIONES (implementación conforme; 3 decisiones de Neo pendientes).

- Alcance: tasks.md/specs/contratos/src/generated/tests sin cambios en esta entrega (mtime de tests y tasks.md anterior a 21:05; `git status` de src/generated y contracts vacío).
- rbac.ts: 44/44 celdas de canonical-fixtures.json (rbacMatrix) coinciden con can(); 11 acciones x 4 roles; matriz = spec.md 219-232. petPermissionsFor proyecta los 9 booleanos de PetPermissions; rol null = todo false. Sin reglas de hogar en can().
- effective-role.ts: effectiveRole(user, pet, memberships, assignments) -> RbacRole | null; OWNER si pet.ownerUserId === user.id; si no, mayor rol ACTIVE en hogares con la mascota asignada (ADMIN > CAREGIVER > READER). Sin lógica extra.
- Migración 0004: role, is_household_owner, índice único parcial (household_id) WHERE is_household_owner=1 AND status='ACTIVE', pet_assignments PK (pet_id, household_id), asignaciones por hogar común, sesiones revocadas, transaccional. Desviación: no convierte INVITED/DECLINED/CANCELLED a household_invitations (data-model §2.9-2.10); decisión de Neo.
- Trazabilidad: --task T243 y T244 CUMPLE (4/4 cada una). Global 98/118 FALLA solo por REQ-UI2-* y otras tareas futuras.
- vitest: 3 archivos de T244 + roles-migration = 74/76 (69 + 5/7).
- tsc: 2 errores (household-policies.spec.ts:351, 361; T248). verify-oracles: 79 archivos, 0 débiles.
- Decisiones de Neo: (1) INVITED; (2) aserciones fijas sqlite-repositories.spec.ts:65,116 y species-migration.spec.ts:82,154; (3) roles-migration.spec.ts:114/116-119 (orden) y :73-79/:125-128 (columna id vs pet_id y owner no excluido en VISIBLE_IN_002).
