# Veredicto Oracle — T250 (2026-11-12) — CONDICIONADO

Commit auditado: d4baaea (rama 002-plataforma-v21). Auditor solo lector.

## Verificaciones
1. Alcance: el commit toca solo tests/e2e/visual/{household.spec.ts,household-counter.spec.ts,e2e-support.ts} y 3 archivos en claude/. Cero cambios en src/, specs/, contracts/, src/generated/ y tasks.md.
2. Cobertura: REQ-HOUSE2-004, SC-017, INV-ACC2-001/002 comprobados con valores concretos (404 ERR-HOUSE-NOT-FOUND, 403 ERR-ACC-FORBIDDEN, 201, 409 ERR-HOUSE-OWNER-CANNOT-LEAVE, ERR-PET-NOT-FOUND, toEqual de los 9 permisos por rol contra REQ-RBAC-001). Lo declarado coincide con el codigo.
3. H-T250-1 CONFIRMADO defecto de produccion: household-use-cases.ts usa requireOwner en InviteMemberUseCase; spec REQ-HOUSE2-001 ("propietario del hogar o un ADMIN invita") y fila de REQ-RBAC-001 (spec.md:230,236) permiten ADMIN. El propio comentario del codigo dice "T238 PENDIENTE: autorizacion de ADMIN para invitar".
   H-T250-2 CONFIRMADO: PetDashboard.tsx:173,198-206 condiciona Editar y Eliminar a editPetBasics (petActions canEdit); la matriz da deletePet solo al Propietario Legal. ADMIN ve Eliminar indebidamente.
4. household.spec.ts:310: las expect.soft son aserciones legitimas con valores de la spec ([202,null], pendingInvitations CAREGIVER/INVITED, Eliminar count 0). Fallan por H-T250-1 (dos aserciones) y H-T250-2 (una). Preparacion y "Editar count 1" pasan; no es error de la prueba.
5. Salidas: playwright "1 failed, 15 passed" (solo :310); tsc --noEmit exit 0; verify-oracles: 81 archivos, 0 debiles, CUMPLE; verify-traceability --feature 002 --task T250: 3/3, CUMPLE.

## Veredicto: CONDICIONADO
Las pruebas son correctas y suficientes; el codigo de produccion no cumple la spec. T250 no puede cerrarse con prueba roja ni quedar en verde sin debilitar la prueba.
Bloqueantes: ambos son bloqueantes para firmar T250 en verde (ruta sana: corregir src/ en tarea posterior: H-T250-1 backend, H-T250-2 UI, T284/T283). Pueden diferirse solo por decision explicita de Neo (Nivel 2), y entonces T250 queda en REVIEW con la prueba roja documentada (o test.fixme autorizado por Neo, nunca relajar aserciones). Recomiendo no diferir: la correccion es pequena (requireOwner a requireManager; condicionar Eliminar a permissions.deletePet).
