# Veredicto Oracle · T248 [US2] revalidación C1-C3 · 2026-11-12 · sin commit (HEAD 9af6f0b)

## Veredicto: APTO (con 2 observaciones menores no bloqueantes)
MAX_RETRY de T248 sigue en 1, sin usar.

## 1. Alcance
- Pruebas adaptadas: tests/unit/use-cases.households.spec.ts, tests/unit/use-cases.spec.ts y tests/integration/api/roles.api.spec.ts (nuevo, sin tracking; contiene el caso C2).
- src/: mtime de todos los archivos de T248 (09:57-09:59) es anterior a las pruebas adaptadas (10:12-10:14) y a la evidencia (10:14); la evidencia declara src intacto. Sin cambios en src por C1-C3.
- Archivos de backup/presentation/record-invariants/infrastructure-adapters: sin modificaciones (git status vacío).

## 2. Fuerza de los oráculos
- En las líneas añadidas de use-cases.households.spec y use-cases.spec: 0 coincidencias de toBeDefined, toBeTruthy, toBeFalsy, any, skip, todo, only, toContain. roles.api.spec.ts: 0 coincidencias. Valores literales (nombres, roles, booleanos, owners).
- Única comparación por longitud: `(await names({filter:'ALL'})).length` = 8 en use-cases.spec; preexistente (antes 7), se mantiene el patrón; observación O-1 (reforzable, no es debilitamiento).

## 3. C1
- Andrés editPetBasics true en 6 (use-cases.households.spec.ts:229-232); María [false,false,false,false,false,true] (línea 233).
- Caso negativo it.each READER/CAREGIVER (línea 236+): Carlos acepta con ese rol; espera 6 mascotas, editPetBasics Array(6).fill(false) y myRole Array(6).fill(role). Pasa.

## 4. C2
- Línea 141: Andrés es CAREGIVER en el hogar de Lucía; tras la transferencia: [200, prunedAssignments [], {403, ERR-ACC-FORBIDDEN}]. El título ya es veraz ("solo CAREGIVER ... 403").
- Línea 155: Andrés ADMIN de su hogar, PATCH -> [200, 'Otro'] (REQ-OWN-001 / REQ-RBAC-001). Título veraz.

## 5. C3 (use-cases.spec.ts)
- Lista Andrés: Argos, Kira, Luna (ADMIN, owner María, colorToken null), Milo, Nyx, Toby, con myRole y editPetBasics literales.
- Filtros: FELINE -> ['Luna','Milo','Nyx']; CANINE -> ['Argos','Kira','Toby']; OTHERS ['Nube','Piolín']; WITH_ALERTS ['Argos','Nyx'] (Luna sin alertas, fuera); ALL = 8 (6+2 añadidas).
- O-2: el título de la prueba línea ~286 sigue diciendo "Mis mascotas: solo las propias" y ya es falso (la expectativa incluye Luna por asignación). Corregible por Keymaker (cambio de título solamente).

## 6. Cambio no listado: lista de María en use-cases.spec
Juicio: legítimo, consecuencia directa de REQ-PET2-002/listMyPets (propias + visibles por asignación). María es miembro ACTIVE del hogar donde están asignadas las 5 mascotas de Andrés (rol READER en C1, editPetBasics false) y es OWNER de Luna. La expectativa anterior [LUNA.id] contradecía la spec igual que C3, y la nueva es más fuerte (nombre, rol y permiso literales en orden). Es coherente con C1 (María false x5, true en Luna). Recomendación: Neo lo ratifica como parte de C3 (mismo fundamento); no requiere rebote.

## 7. Línea base tests/unit
- Archivos de esos 5 grupos no están tocados en el árbol. Verificación sin stash: extraje HEAD 9af6f0b con git archive a scratchpad (head/) con node_modules enlazado y ejecuté vitest tests/unit allí: backup-use-cases 49, record-invariants 10, components 8, view-model 2, validation 1, backup-import-atomicity 1, infrastructure-adapters 1 = 72 fallos idénticos a los actuales. En HEAD además fallaban household-policies (4), use-cases.households (5) y access-policy (2), que T245-T248 corrigen. Total HEAD 83 fallos; árbol actual 72. Base verificada: 72 preexistentes, 0 nuevos. Causa: pruebas adaptadas al contrato 3.0.0 (T207) frente a backup y presentación aún 001 (p. ej. "reading 'editPetBasics'" de undefined por el canEdit del cliente web), fuera del alcance de T248.

## 8. Salidas literales
- use-cases.households.spec: Test Files 1 passed (1); Tests 23 passed (23)
- use-cases.spec: Test Files 1 passed (1); Tests 36 passed (36)
- roles.api + households.api (juntos): Test Files 2 passed (2); Tests 44 passed (44)
- assignments-ownership.api: Tests 1 failed | 10 passed (11); SqliteError: no such table: audit_log (B2, trasladado a T264)
- tests/unit: Test Files 7 failed | 18 passed (25); Tests 72 failed | 459 passed (531)
- tsc --noEmit: exit 0
- verify-oracles: Archivos analizados: 81; oráculos débiles: 0; Resultado: CUMPLE
- verify-traceability --feature 002 --task T248: IDs trazados 12/12; violaciones de pureza 0; CUMPLE

## Hallazgos
- O-1 (menor): filtro ALL se valida solo por longitud (preexistente); reforzar con lista literal cuando se toque.
- O-2 (menor, corregible por Keymaker): título obsoleto "solo las propias" en use-cases.spec (Mis mascotas).
- B2 audit_log: aceptado, T264.
- H-T248-1/2 informativos (access-policy.ts sin uso en use cases; vista de hogar omite dueños no ACTIVE).

## Decisión
Neo puede pasar T248 a REVIEW/COMPLETED a su criterio (Oracle no marca COMPLETED). Ratificar el punto 6.
