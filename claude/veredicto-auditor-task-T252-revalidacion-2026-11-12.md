# Veredicto Oracle — T252 revalidación tras H-T252-1..3 (2026-11-12, base 57b2083)

**Veredicto: CONDICIONADO.** Las correcciones H-T252-1..3 cumplen y están en verde (households.property 3/3, session-csrf 14/14, household-policies 37/37, tsc 0, oráculos 0 débiles, trazabilidad T242 CUMPLE). access-control queda 11/13: los 2 fallos son POST /api/backup/export (rebanada 5, ajeno). Quedan dos decisiones de Neo (desviación H-T252-2a; tratamiento de exportBackup) y marcar T236-T242 solo con evidencia.

## Salidas literales
- households.property: 1 passed (3 tests). session-csrf: 14 passed. household-policies: 37 passed. tsc exit 0. verify-oracles: 83 archivos, 0 débiles, CUMPLE. verify-traceability T242: 3/3, pureza 0, CUMPLE.
- access-control: 13 tests, 2 failed, 11 passed. Ambos: "contrato OpenAPI de POST /api/backup/export ... exportBackup: estado 404 no declarado (200, 401, 403, 429, 500)" (líneas 87 y 100 de la prueba).

## 1. Alcance
git diff 57b2083 --name-only: nada en src/, specs/ (salvo tasks.md: solo marcas [x] de T250/T251, previas a H-T252), contracts/, src/generated/, migraciones. Pruebas tocadas: households.property, access-control.security, session-csrf.security. Cumple.

## 2. H-T252-1 (proyección de membresía)
Esquema generado HouseholdMember (src/generated/schemas/types.ts:1037): membershipId, householdId, userId, username, displayName, role, isHouseholdOwner, status ACTIVE|LEFT|REMOVED, joinedAt, firstJoinedAt, updatedAt (sin invitedAt ni invitedByUserId; la 002 mueve la invitación a household_invitations). Es adaptación legítima del modelo 002, no relajación: la fila de dominio no porta username/displayName (modelo de lectura) y los campos de invitación violarían additionalProperties. Se siguen validando uuid, rol, status, isHouseholdOwner (derivado de isOwnerRow) y marcas de tiempo. Matiz: username/displayName son valores sintéticos (esos dos campos no se ejercen) y la rama joinedAt===null solo comprueba isLegacyHouseholdMember + invitedAt/invitedByUserId presentes, no valida el esquema HouseholdInvitation. Aceptable; mejora opcional: validateHouseholdInvitation sobre la rama de invitación.

## 3. Desviación H-T252-2a (importante)
Autorizado: omitir problem+json en la ruta no servida. Hecho además: (i) contract:false en DELETE .../records/... (las 2 celdas del CAREGIVER: "eliminar evento sanitario" y "eliminar otro registro", con NONEXISTENT_RECORD); contract:false desactiva TODA la validación OpenAPI de esas llamadas, no solo problem+json; (ii) se acepta 404 sin código como "apartado" del 403; (iii) se afirma exactamente esas 2 celdas, el resto 403 ERR-ACC-FORBIDDEN, 19 celdas.
Evaluación: va un paso más allá de la letra de la autorización (la 2.ª parte, aceptar 404), pero el 403 no es alcanzable mientras la ruta no exista (rebanada 4/T25x), así que exigirlo haría la prueba imposible de pasar. La condición es fuerte: solo se aparta 404 con code === undefined (cualquier 200/204/403 distinto, 404 con código u otro status falla), y el arreglo `unservedSlice4` debe ser exactamente esas dos etiquetas, de modo que cuando la rebanada 4 sirva la ruta la prueba FALLA y obliga a retirar la excepción (autocaducable). Debilidades menores: el comentario del código dice "el 403 y el código de error se siguen exigiendo", lo cual es falso para esas 2 celdas (comentario obsoleto); un 404 genérico del enrutador no distingue "ruta ausente" de un defecto futuro.
Recomendación: NO volver a exigir 403 en esas celdas; Neo debe ratificar la desviación (no es necesario un reintento de Keymaker, MAX_RETRY de T252 no se consume), con dos ajustes triviales de comentario que puede hacer Keymaker junto con el cierre: (a) corregir el comentario de la línea ~220 para decir que esas dos celdas aceptan 404 sin código; (b) anotar en tasks.md/T25x de la rebanada 4 "retirar la excepción de deleteRecord en access-control.security.spec.ts". Es también la opción que mejor protege: ante duda, Neo puede exigir en su lugar que las dos celdas se dejen en it.todo, pero eso es más débil que la actual.

## 4. GET /api/pets/{petId} -> /dashboard con profile.name
OpenAPI 002 contiene /pets/{petId}/dashboard (línea 370) y NO tiene GET en /pets/{petId} (solo patch/delete). La aserción sigue siendo igual de fuerte (name === 'Nala' leído del perfil del dashboard, mismo actor andres, mismo tipo de verificación) y el contrato ahora se valida contra una ruta declarada. Cambio no listado en la autorización, pero de bajo riesgo y necesario: aceptable. Recomiendo que Neo lo ratifique junto con 2a por transparencia (no requiere reintento).

## 5. H-T252-2b y 3a/3b
- 2b: `before = api.dump()` ahora después del login de carlos_88. Confirmado.
- 3a: INV-HOUSE-004 espera ['ACTIVE','ACTIVE'] para el dueño (INVITED excluido; la invitación vive en household_invitations). Confirmado; el miembro no ve a carlos_88 (se mantiene).
- 3b: NOT_YET_SERVED reducida a cancelInvitation, deleteRecord, exportBackup, previewBackupImport, updateRecord. Las 6 quitadas están registradas: changeMemberRole y transferHouseholdOwnership en households.routes.ts:52/56; listPetAssignments, assignPetToHousehold, unassignPetFromHousehold en assignments.routes.ts:21/25/29; transferPetOwnership en ownership.routes.ts:18. session-csrf 14/14. Nota: cancelInvitation sigue en la lista; no se verificó si ya se sirve (no es hallazgo: la lista errando por exceso es seguro).

## 6. Pendiente de Neo: exportBackup
Causa confirmada: el OpenAPI 002 declara POST /backup/export (x-sdd-change CHANGED, token efímero en cabecera, CSRF), pero src/infrastructure/http/routes/backup.routes.ts:19 registra app.get('/api/backup/export') con el contrato 001. La prueba (POST + x-argos-request) recibe 404 del enrutador. Es trabajo de la rebanada 5 (REQ-BACKUP2-001), no de H-T252.
Opción mínima recomendada: en esas dos pruebas (INV-ACC-001/INV-AUTH-003 y INV-ACC-002), marcar la llamada exportBackup con contract:false y comentario H-T252-4 "ruta de la rebanada 5" NO es recomendable porque la prueba entonces no podría leer el sobre (recibe 404, el assert de contenido falla igual). La opción coherente es excluir esas dos pruebas de la compuerta de la rebanada 3 (it.skip/it.todo con rótulo "rebanada 5") y registrar que T252 se firma con 11/13 + 2 diferidos a la rebanada 5. No aplicada.

## Estado de tasks.md
T236-T242 y T252 siguen [ ]; T243-T251 [x] ya marcadas. Ningún agente puede marcar COMPLETED; el techo es REVIEW.

## Hallazgos
- H-T252-R1 (menor): comentario obsoleto en access-control línea ~220 contradice el comportamiento de las 2 celdas.
- H-T252-R2 (decisión Neo): ratificar desviación 2a y el cambio /dashboard.
- H-T252-R3 (decisión Neo): tratamiento de exportBackup (rebanada 5) para cerrar T252.
- H-T252-5 (heredado): deuda ajena (trazabilidad global, backup, GET /pets, B2) sin cambios.

DE: Oracle
PARA: Neo (Andrés Vallejo — Nivel 2)
ESTADO: Validación requerida
