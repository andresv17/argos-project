# Veredicto Oracle · T248 [US2] · 2026-11-12 · sin commit (HEAD 9af6f0b)

## Veredicto: CONDICIONADO
Implementación APTA contra la spec 002; condicionada solo a las decisiones de Neo sobre C1, C2 y C3 (pruebas de la 001 que contradicen la spec). No hay rebote: MAX_RETRY de T248 sigue en 1 sin usar y no hay nada corregible por Keymaker en src.

## 1. Alcance
- src de T248 (en el árbol sin commit, mezclado con T245-T247): use-case-support.ts (effectiveRoleOf, listVisiblePets, requireReadablePet, requirePetAction; se eliminan requireWritablePet y legacyRoleAndPermissions), pet-use-cases.ts (EDIT_PET_BASICS, DELETE_PET, Mis mascotas propias + asignadas, myRole/permissions), record-use-cases.ts (WRITE_ACTION por módulo), assignment-use-cases.ts y ownership-use-cases.ts (ASSIGN_PET_TO_HOUSEHOLDS / TRANSFER_PET_OWNERSHIP, por requirePetAction), household-use-cases.ts (GetHouseholdPetsUseCase lee pet_assignments), household-policies.ts (toRoleMembership, HouseholdPetEntry con myRole+permissions sin canEdit, householdPets con contexto de acceso).
- Pruebas nuevas: use-cases.households.spec.ts (prueba H-T247-1 unitaria) y roles.api.spec.ts (H-T247-1 HTTP, describe línea 201).
- Mapa módulo->acción coincide con REQ-RBAC-001: weights/bodyMeasurements -> pesos y medidas; vaccinations/dewormings -> eventos sanitarios; medicalVisits/customParameters -> citas y parámetros.
- Fuera de alcance confirmado: backup, presentation (canEdit del cliente web), adaptadores, audit_log (T264).

## 2. H-T247-1
- Código previo (git show HEAD): GetHouseholdPetsUseCase usaba pets.listByOwners(activeIds), es decir, todas las mascotas de los dueños activos, ignorando pet_assignments. Ahora itera assignments.listByHousehold. Causa correcta de la roja: tras desasignar Argos, seguía en la lista (recibido incluía 'Argos', esperado sin él), no por tipado ni fixtures.
- Las pruebas verifican valores concretos (listas de nombres ['Kira','Milo','Nyx','Toby','Luna'], 404 con código ERR-PET-NOT-FOUND@petId, 200 del dueño), también el antes/después HTTP ([['Vista'],200] vs [[],404]). Verdes sin debilitarse. No pude re-ejecutar la roja sin editar src (soy solo lector); me apoyo en el diff del código previo y en el informe.

## 3. Contrato y spec
- PetCardView/dashboard devuelven myRole y permissions, sin canEdit en src (grep de canEdit en application/domain de T248: solo comentarios del lado 001). openapi sin canEdit.
- 404 antes que 403 (requireReadablePet lanza ERR-PET-NOT-FOUND si no hay rol; requirePetAction lanza ERR-ACC-FORBIDDEN si can() niega): conforme con INV-ACC2-001/002, REQ-PET2-003, REQ-PET-004 (DELETE_PET), REQ-REC-002/005/006.

## 4. Contradicciones
- C1 (use-cases.households.spec.ts:217-230, editPetBasics de Andrés sobre Luna): CONTRADICE la spec: SÍ. Andrés es ADMIN del hogar (REQ-MIG-001: OWNER->ADMIN) y la matriz da S a Admin en editar datos básicos (REQ-RBAC-001); Luna está asignada a H. Salida literal: Expected false / Received true solo en la fila de Luna. Propuesta de Keymaker (Andrés true en las 6; María [false x5, true]): CORRECTA y mantiene la fuerza (valores concretos; además se mantiene la distinción por rol). Recomendación adicional: añadir una aserción de un READER/CAREGIVER (p. ej. Carlos tras aceptar, o Lucía) que sí sea false, para no perder el caso negativo.
- C2 (roles.api.spec.ts:141, ex-dueño PATCH -> 403): CONTRADICE la spec: SÍ. REQ-OWN-001: el dueño anterior conserva el rol que tenga en cada hogar; Andrés es propietario/ADMIN del hogar donde está asignada, y ADMIN tiene S en editar datos básicos: PATCH -> 200 es lo correcto. El título de la prueba ("la sigue viendo por el hogar compartido") es falso para un ADMIN. Propuesta A (hogar donde Andrés sea CAREGIVER/READER, mantener 403): CORRECTA y conserva la fuerza del oráculo (mantiene el caso negativo, ahora válido). Propuesta B (esperar 200): correcta pero DEBILITA el propósito (deja de probar que perder la propiedad quita permisos). Recomiendo A, y opcionalmente añadir el caso B (ADMIN -> 200) como segunda prueba. 
- C3 (use-cases.spec.ts:289, 312 y especies/grupo, 3 pruebas "Mis mascotas: solo las propias"): CONTRADICE la spec: SÍ. REQ-PET2-002 y listMyPets del OpenAPI: propias + visibles por asignación. Andrés ve Luna por Casa Vallejo. Propuesta de añadir Luna: CORRECTA, con matices que Neo/Keymaker deben respetar: (a) el rol de Andrés sobre Luna es ADMIN (la evidencia de Keymaker dice "rol READER", error de redacción; la propuesta editPetBasics true sí es coherente con ADMIN); (b) el orden por nombre pone Luna entre Kira y Milo; (c) Luna es FELINE: entra en el filtro species FELINE (['Luna','Milo','Nyx']) pero no en CANINE; (d) colorToken null del owner en listado (EDGE-030) debe seguir exigiéndose para las ajenas. Mantiene la fuerza si se añaden valores concretos y no se relajan a "contiene". Debilita si se cambiara a toContain/longitud.
- Ninguna propuesta de Keymaker debilita la aserción si se aplican como se describe arriba; la B de C2 sí la debilitaría.

## 5. Salidas literales (resumen; texto completo en la sesión)
- household-policies.spec: 1 archivo, 36/36 pasan.
- use-cases.households.spec: 21 tests, 1 falla (C1), 20 pasan.
- households.api: 29/29. roles.api: 13 pasan, 1 falla (C2, "expected { status: 200, code: undefined } to deeply equal { status: 403 ... }"). assignments-ownership: 10 pasan, 1 falla (B2: "no such table: audit_log", T264). Nota: el comando con las 3 rutas juntas no encuentra archivos (el filtro de vitest se rompe con la ruta tests/integration/... por include); se ejecutaron por separado.
- use-cases.spec.ts: 3 fallas C3 (Mis mascotas propias, filtro q/species, filtro por grupo).
- npx tsc --noEmit: exit 0, sin errores.
- verify-oracles: 81 archivos, 0 débiles, CUMPLE.
- verify-traceability --feature 002 --task T248: 12/12, pureza 0, CUMPLE.

## Hallazgos
- H-T248-1 (informativo): access-policy.ts queda sin uso en casos de uso, solo lo ejercitan sus pruebas; deuda de limpieza (autorizar su retirada o conservarlo).
- H-T248-2 (informativo): vista de hogar omite dueños de mascotas asignadas que no son miembros ACTIVE (la poda de T245 evita el caso); aceptable.
- H-T248-3: evidencia de Keymaker dice Luna "rol READER" para Andrés; el rol real es ADMIN (corregir al adaptar).
- Sin rebote a Keymaker: nada en src es corregible. Tras decisión de Neo, Keymaker aplica las adaptaciones de C1-C3 (cambio de pruebas, no de src).

## Decisión para Neo
Autorizar C1 (adaptar), C2 (propuesta A, con B opcional como prueba nueva), C3 (adaptar con Luna). Con ello se esperan 0 fallos nuevos sobre la línea base (restan B2 -> T264).
