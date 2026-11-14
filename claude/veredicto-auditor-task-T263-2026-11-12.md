# Veredicto Oracle — T263 (updateRecord / deleteRecord genéricos) — 2026-11-12

**Verdict: CONDICIONADO** (código APTO; condición única: decisión de Neo sobre los 2 andamios caducados).
Base: HEAD 21cde5a, T263 sin commit. Alcance auditado con git status/diff: record-invariants.ts, record-use-cases.ts, records-edit.routes.ts (nuevo), pets.routes.ts, use-cases.ts, app.ts.

## Compuertas (salida real)
- `npx tsc --noEmit`: exit 0.
- `verify-oracles.sh`: 89 archivos, oráculos débiles 0, CUMPLE.
- `verify-traceability.sh --feature 002 --task T263`: IDs 5/5, pureza 0 violaciones, CUMPLE (ERR-ACC-FORBIDDEN trazado también en records-edit.routes.ts:5).
- `vitest audit.api.spec.ts`: 14 pasan, 4 rojos (1 cuenta-delete T265; 2 maintenance-use-cases.ts ausente T266; 1 más de T265). Esperado.
- Suite completa: HEAD 103 fallos / 1379 pasan (con src revertido) -> working tree 104 fallos / 1378 pasan. Nuevos: exactamente los 2 previstos (session-csrf "barrido cubre toda operación servida" y access-control "cada celda No responde 403"). Corregido por T263: 1 (audit "registrar un peso ... borrarlo agrega fila DELETE"). Cero otros cambios.
- `git diff HEAD -- tests contracts specs/002-plataforma-v21/contracts src/generated`: vacío. Ninguna prueba, contrato ni generado modificado.

## Revisión puntual
1. RBAC: WRITE_ACTION por módulo (weights/measurements -> WRITE_WEIGHTS_AND_MEASUREMENTS; vaccinations/dewormings -> WRITE_HEALTH_EVENTS; visits/custom -> WRITE_APPOINTMENTS_AND_PARAMETERS) coincide con x-sdd-rbac-action del OpenAPI (record-use-cases.ts:39-46,186). DELETE_ACTION (:157-164) separa DELETE_HEALTH_EVENTS (vacunas, desparasitaciones) de DELETE_OTHER_RECORDS; ambos OWNER/ADMIN (rbac.ts:22,25). requirePetAction ejecuta requireReadablePet (404) antes de `can` (403) (use-case-support.ts:185-188): sin filtración entre hogares. Colección desconocida -> 404 ERR-PET-NOT-FOUND antes de tocar datos (:168-172), sin revelar existencia. Informativo: SC-015 "cualquier rol" para un lector sobre SUPERSEDED devuelve 403 y no 409 (RBAC primero); sigue siendo rechazo, consistente con el contrato (el 409 se prueba con OWNER/ADMIN/CAREGIVER, pets-records:546).
2. Auditoría: recordAudit se invoca dentro de runInTransaction tras replace/remove (:193, DeleteRecord ~:217) y usa deps.auditLog.append(repositories, ...); un fallo lanza y revierte. Entity types correctos por módulo (audit-support.ts:30-37). Informativo (I-1): no existe prueba con fallo inyectado para UPDATE/DELETE de registros (las de rollback cubren mascota y cuenta); la garantía es estructural. Sugerir prueba en T270/dojo.
3. assertRecordNotSuperseded: supersededStatus (:200-204) evalúa solo vaccinations y dewormings; los demás módulos devuelven 'ACTIVE'. Correcto. Se evalúa después de validar esquema/dominio (orden 404,403,404-registro,422,409), coherente con la documentación.
4. Formularios de vacuna/desparasitación: batchOrClinic/veterinarianName/veterinarianLicense validados por esquema generado (pets-records:511-512 pasa, límites 60/120/120).
5. DELETE: `current === undefined || !remove` -> 404; borrar el posterior restaura el vigente (derivado). Sin hallazgos.
6. pets.routes.ts: rutas PATCH/DELETE de vacunas retiradas y reemplazadas por la genérica; sin rutas duplicadas.

## Andamios caducados (verificado)
- session-csrf NOT_YET_SERVED (tests/security/exploits/session-csrf.security.spec.ts:36-42): `deleteRecord` y `updateRecord` ya están servidos (PATCH/DELETE en records-edit.routes.ts:16-22); el contrato los define en OpenAPI con CSRF y sesión. Recibido: [cancelInvitation, exportBackup, previewBackupImport]. Caducan legítimamente (el propio comentario dice "cada rebanada retira las suyas"). No es defecto de implementación.
- access-control H-T252-2a (access-control.security.spec.ts:222-244, esperado `['eliminar otro registro']`): ahora recibido `[]` y notForbidden `[]`, es decir las 19 celdas "No" responden 403 ERR-ACC-FORBIDDEN, incluso "eliminar otro registro". La excepción estaba condicionada textualmente a "mientras la Rebanada 4 no sirva DELETE ...". Caducó por cumplimiento (más estricto). No es defecto.
- Ambos arreglos requieren tocar tests/: potestad de Neo (Nivel 2). Barrido de operaciones servidas (sweep 401) ya incluye las 2 nuevas rutas y pasa en los otros 13 tests de session-csrf.

## Hallazgos
- Bloqueantes: ninguno.
- Condición C1: Neo debe autorizar (a) retirar `deleteRecord` y `updateRecord` de NOT_YET_SERVED y (b) retirar la excepción H-T252-2a (esperado `[19, [], [], 'Nala']`, quitar `contract:false` de DELETE /records/). Hasta entonces la suite tiene 2 rojos atribuibles a andamios caducados.
- Informativo I-1: sin prueba de rollback de auditoría para UPDATE/DELETE de registro (record-use-cases.ts:193, ~:217).
- Informativo I-2: lector sobre SUPERSEDED -> 403 antes que 409.
- Informativo I-3: untracked ajenos a T263 (logos.json, scripts/logos.py, GUIA-SKILLS-MATRIX.md, SKILLS-PROPUESTAS.MD) no deben entrar al commit de T263.
