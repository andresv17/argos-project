---
handover_id: HANDOVER-MORPHEUS-2026-11-11
character: morpheus
functional_role: Capitán y Tech Lead (orquestación de la cola de tareas de la Feature 002)
date: 2026-11-11
branch: 002-plataforma-v21
head_commit: 9af6f0b7cea3b8710532feb97531787984ef2881 (corto 9af6f0b)
active_task: Rebanada 3 (T236–T249). T243 y T244 cerradas por Neo ([x]). Próximo: T245 (pendiente de orden de Neo).
progress_percent: 50%
status: READY_FOR_NEO_APPROVAL
---

# Handover de Sesión — Morpheus (2026-11-11)

## 1. Resumen en Lenguaje Claro para Neo (Andrés Vallejo)
- La rebanada 3 (roles y permisos) avanzó bastante. Están cerradas por tu orden T243 (migración de roles y asignaciones, con la conversión de INVITED a invitaciones) y T244 (`can(rol, acción)` y rol efectivo). Oracle las dio PASS CON OBSERVACIONES.
- T236 a T242 tienen las pruebas en rojo validadas por Oracle, pero siguen en `[ ]` hasta tu firma. T237 a T242 cerraron con PASS CON OBSERVACIONES tras varias rondas de corrección.
- Falta T245 en adelante (roles de hogar, transferencia, asignaciones, matriz en mascotas y bloqueo de eliminación de cuenta). No está autorizado todavía.
- Quedan rojos conocidos: 16 pruebas de persistencia y unas 157 por el `INVITED` en `household_members` del repositorio. Se absorben en T247/T248.

## 2. Tarea Activa y Estado Real en Disco
- **Tarea:** Rebanada 3, T245 pendiente de orden (T236–T244 con pruebas validadas; T243 y T244 `[x]` por orden de Neo).
- **Último Commit en Disco:** `9af6f0b` — feat(002): rebanada 2 modelo de mascota y especies (T226-T235). Sin push desde la fase 2.
- **Árbol de Trabajo (`git status`):** 72 archivos con cambios sin commit. Principales:
  - `src/`: nuevos `domain/access/rbac.ts`, `domain/access/effective-role.ts`, `infrastructure/persistence/sqlite/migrations/0004_roles_and_pet_assignments.sql`; modificado `sqlite-database.ts` (cabecera).
  - `tests/`: 15 archivos modificados y 3 nuevos (`assignments-ownership.api.spec.ts`, `roles-migration.spec.ts`, `permissions-matrix.spec.ts`).
  - `specs/002-plataforma-v21/tasks.md`: T226–T235 `[x]` (ratificado por Neo), T243 y T244 `[x]` (por orden de Neo).
  - `.specify/memory/audits/`: informes de Oracle nuevos y `hoja-de-ruta-feature-002.md` corregida (44 celdas, tabla C, nota D-10).
  - `claude/`: bitácoras de Morpheus, Keymaker, Oracle y Architect; `log-maggie.md`, `log-neb.md`, `log-rama.md`, `log-trinity.md` nuevas.
  - `.claude/skills/`: 43 SKILL.md borrados (deliberado; migrados a `~/.claude/skills/`). Limpieza en commit de mantenimiento al cerrar la feature. Solo maggie, zee, kid, niobe deben quedar.
  - Sin identificar: `scripts/handoff.py` (sin seguimiento) y `.gitignore` (modificado). Revisar antes de commit.
- **Stash:** ninguno.
- **Últimas Compuertas Ejecutadas (hoy):**
  - `verify-oracles.sh`: CUMPLE (79 archivos, 0 oráculos débiles).
  - `npx vitest run` (suite completa): 321 fallan / 991 pasan / 1312. Causa principal: repositorio y harness que escriben INVITED en `household_members` (se absorbe en T247/T248), más módulos y rutas de T245 a T249 aún no implementados.
  - `npx tsc --noEmit`: 2 errores, ambos en `tests/unit/household-policies.spec.ts` líneas 351 y 361 (`permissions` no existe en `HouseholdPetEntry`). Dependen de T248.
  - `verify-traceability --feature 002 --task T243` y `--task T244`: CUMPLE 4/4 cada una.
  - `roles-migration.spec.ts`: 8/8.

## 3. Decisiones Tomadas en la Sesión
- Ruta de eliminación de cuenta: `POST /api/account/deletion` (T219, aprobada).
- Matriz RBAC de 44 celdas implementada en la rebanada 3. `can(rol, acción)` es la matriz gruesa de REQ-RBAC-001; las restricciones de hogar van en T245/T246.
- Firma de `effectiveRole(user, pet, memberships, assignments) -> RbacRole | null` confirmada por Neo.
- `RbacAction` con 11 acciones de la matriz; `PetPermissions` son los 9 booleanos que proyectan esas acciones sobre la mascota.
- EXPORT_IMPORT_BACKUP permitido para todos los roles (resolución N-4 (B)).
- EDGE-008/009 de la 001 actualizados a INV-ACC2-001 e INV-ACC2-002.
- Diferido a T284: `tests/unit/presentation/` (forma 001).
- Conversión de INVITED/DECLINED/CANCELLED a `household_invitations` en la 0004 (data-model §2.9–2.10). `invited_by_user_id` queda nulo si la fila de la 001 no lo trae.
- Aceptado hasta T244: `canEdit` en rojo por `src/` (household-policies 340–352) y atajo legado verde en access-control:46. Pendiente de revisión en T244 (sigue pendiente la sustitución explícita de esa aserción).
- Nombres aprobados: `applyMembershipEvent`, `ChangeMemberRoleUseCase`, `TransferHouseholdOwnershipUseCase`.
- Backup export: pruebas en POST con CSRF; la ruta en `src/` sigue en GET (`backup.routes.ts:20`), se corrige en T279.
- Incidente menor: Keymaker usó `git stash` para un baseline y lo restauró. Verificado sin pérdida. Cerrado por Neo.

## 4. Deuda Técnica y Bloqueos Pendientes
- **Deuda técnica activa:**
  - Repositorio y harness escriben INVITED en `household_members` (16 rojos de persistencia; unos 157 en la suite completa). Se absorbe en T247/T248.
  - Dos errores de `tsc` en `household-policies.spec.ts` (351, 361). Dependen de T248.
  - Rutas HTTP pendientes: POST export (T279), asignaciones y transferencia (T247), PATCH de miembros (T246).
  - `roleOnJoin` ignorado en `src/` hasta T247.
  - `householdPets` devuelve `canEdit` en vez de `permissions` (T248).
  - Vacunas y desparasitaciones dan HTTP 500 para el dueño: el contrato exige `category`, `veterinarianName` y `veterinarianLicense`. Decisión de Neo: `category` constante por tipo (VACCINE/DEWORMING); datos veterinarios opcionales con null. Pendiente de Architect (cambio de contrato) y Keymaker (NULLABLE_DEFAULTS en `record-use-cases.ts`).
  - Alias `species` en `request-input.ts` y `pet-use-cases.ts` (hasta T238 y T284).
  - Fila de auditoría `MIGRATION` (T265) y auditoría de eliminación de cuenta (T265).
  - Cota de 150 kg provisional (T231, M1), a validar por veterinario.
  - Scrypt: timeout de 5 s en `infrastructure-adapters.spec.ts` (entorno).
  - Trazabilidad 001: 89/96 por IDs retirados. Decisión de Neo pendiente.
  - Pendiente de decisión: `tests/unit/presentation/` (D-10, diferido a T284).
- **Hallazgos / Bloqueos abiertos:**
  - H-MOR-01 (`feature.json`): resuelto (Neo confirmó; apunta a 002).
  - H-MOR-02 (filas de tabla C): resuelto por Architect (use-cases.households y roles-migration añadidas).
  - Riesgo clínico para veterinario: una vacuna vencida desaparece del aviso si se registra una aplicación nueva sin próxima fecha (P-5, Maggie). Puntos P-1 a P-5 abiertos.
  - T204a (firma de enmienda del principio III) sigue abierta; bloquea T306.
  - Los agentes corren en `haiku` en esta sesión; CLAUDE.md pide `sonnet` para programar en `src/`. Usé `model: sonnet` en los despachos posteriores a la corrección.

## 5. Orden de Despertar para la Siguiente Instancia
- **Personaje que debe despertar:** `/morpheus`
- **Archivos que debe leer primero:**
  1. `claude/registro-proceso-argos.md` (últimas entradas).
  2. `claude/log-morpheus.md` (sección de hoy, desde la autorización de T236 hasta el cierre).
  3. `claude/handover-morpheus-2026-11-11.md` (este archivo).
  4. `specs/002-plataforma-v21/tasks.md` (T243 y T244 `[x]`; T245 a T249 `[ ]`).
  5. `.specify/memory/audits/hoja-de-ruta-feature-002.md` (fases y rebanadas).
  6. `.specify/memory/audits/oracle-T243-T244.md` y `oracle-T243-T244-revalidacion.md` (últimos veredictos).
- **Acción inmediata a ejecutar:** esperar la orden de Neo para T245. No despachar código sin orden. Antes de cualquier commit, Neo decide qué hacer con `scripts/handoff.py`, `.gitignore` y las skills borradas.
