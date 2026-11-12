# Evidencia T251 [US2] — Matriz IDOR con cuatro roles (SC-003, INV-ACC2-001, INV-ACC2-002)

DE: Sentinels · PARA: Oracle · Fecha 2026-11-12 · Rama 002-plataforma-v21 (base cf1e68c, sin push)

## Archivo entregado
- `tests/security/exploits/idor-matrix.security.spec.ts` (61 pruebas). Sin cambios en src/, specs/, contracts/.

## Mundo de prueba (cada celda usa un mundo nuevo; API real Fastify + SQLite en memoria)
Mascota Nala (dueño andres) asignada al hogar IDOR. Roles efectivos: OWNER = andres (Propietario Legal), ADMIN = maria.v, CAREGIVER = lucia.r, READER = carlos_88 (membresías ACTIVE aceptadas por la API). Mascota ajena "Ajena" (dueña lucia.r) en su propio hogar. Hogar de reserva del dueño como destino de PUT assignments.

## Matriz rol x acción (esperado = obtenido salvo las 6 celdas marcadas ROJO)
| Acción (acción RBAC) | OWNER | ADMIN | CAREGIVER | READER |
|---|---|---|---|---|
| GET dashboard (lectura) | 200/200 | 200/200 | 200/200 | 200/200 |
| PATCH pet (EDIT_PET_BASICS) | 200/200 | 200/200 | 403/403 | 403/403 |
| DELETE pet (DELETE_PET) | 204/204 | 403/403 | 403/403 | 403/403 |
| GET assignments (ASSIGN) | 200/200 | 403/403 | 403/403 | 403/403 |
| PUT assignment (ASSIGN) | 200/200 | 403/403 | 403/403 | 403/403 |
| DELETE assignment (ASSIGN) | 204/204 | 403/403 | 403/403 | 403/403 |
| POST ownership-transfer (TRANSFER) | 200/200 | 403/403 | 403/403 | 403/403 |
| POST records/weights (WRITE_WEIGHTS_AND_MEASUREMENTS) | 201/201 | 201/201 | 201/201 | 403/403 |
| POST records/measurements (idem) | 201/201 | 201/201 | 201/201 | 403/403 |
| POST records/vaccinations (WRITE_HEALTH_EVENTS) | 201/**500** ROJO | 201/**500** ROJO | 201/**500** ROJO | 403/403 |
| POST records/dewormings (WRITE_HEALTH_EVENTS) | 201/**500** ROJO | 201/**500** ROJO | 201/**500** ROJO | 403/403 |
| POST records/visits (WRITE_APPOINTMENTS_AND_PARAMETERS) | 201/201 | 201/201 | 403/403 | 403/403 |
| POST records/custom-parameters (idem) | 201/201 | 201/201 | 403/403 | 403/403 |

Formato: esperado/obtenido. Todo 403 es `ERR-ACC-FORBIDDEN` y, en cada 403, la base (dump SQLite) queda idéntica. 52 celdas: 46 verdes, 6 rojas.

## Pruebas adicionales (9, todas verdes)
- OWNER, ADMIN y READER del hogar IDOR sobre la mascota de otro hogar: 13 de 13 acciones → `404 ERR-PET-NOT-FOUND`, base sin cambios (3 pruebas).
- El 404 de la mascota ajena es idéntico al de un id inexistente (sin `instance`) y no contiene "Ajena" ni el id del dueño.
- Listado `GET /api/pets` de cada rol: incluye Nala; excluye la mascota ajena (Lucía la ve porque es suya).
- ADMIN de un hogar donde la mascota NO está asignada (hogar de reserva): 404.
- Rol efectivo = mayor rol entre hogares: CAREGIVER+READER → peso 201; READER en dos hogares sigue 403; al desasignar el hogar IDOR, Lucía queda READER → 403.
- El dueño no asigna su mascota a un hogar ajeno donde no es miembro: 403 ERR-ACC-FORBIDDEN y sin asignación.
- Tras 403 de transferencia y borrado por ADMIN: propietario sigue siendo andres y la ficha existe (200).

## Salidas literales
```
$ npx vitest run tests/security/exploits/idor-matrix.security.spec.ts
 Test Files  1 failed (1)
      Tests  6 failed | 55 passed (61)
   (6 rojos: POST records/vaccinations y /dewormings x OWNER, ADMIN, CAREGIVER → "expected '500 ERR-INTERNAL-UNEXPECTED' to be '201'")
$ npx vitest run tests/security/exploits
 Test Files  5 failed | 1 passed (6)
      Tests  17 failed | 99 passed (116)
$ git stash -u; npx vitest run tests/security/exploits   (línea base sin mi archivo)
 Test Files  4 failed | 1 passed (5)
      Tests  11 failed | 44 passed (55)
$ npx tsc --noEmit            → exit 0 (cero errores)
$ bash scripts/verify-oracles.sh
 [SDD Oracle Gate] Archivos analizados: 82; oráculos débiles: 0
 [SDD Oracle Gate] Resultado: CUMPLE
$ bash scripts/verify-traceability.sh --feature 002 --task T251
 OK INV-ACC2-002 (… tests: tests/security/exploits/idor-matrix.security.spec.ts:163 …)
 [SDD Traceability Gate] IDs trazados: 2/2 · Violaciones de pureza: 0 · Resultado: CUMPLE
```
Las 17 fallas = 11 preexistentes (otros archivos: exportación/importación 500 contrato OpenAPI, prototype pollution, payload 10 MB, XSS, credenciales, barrido de rutas sin sesión, 2 de access-control T242) + 6 nuevas de este hallazgo.

## Hallazgos
- **H-T251-1 (Media, funcional; no es fuga de acceso)**: `POST /api/pets/{petId}/records/vaccinations` y `/dewormings` responden `500 ERR-INTERNAL-UNEXPECTED` ("Objeto inválido para vaccinations (...); no se guarda") para OWNER, ADMIN y CAREGIVER con el cuerpo canónico RECORD_INPUTS. La autorización es correcta (READER 403, ajeno 404, resuelven antes) y falla cerrado (no se guarda nada), pero los tres roles con permiso WRITE_HEALTH_EVENTS no pueden dar de alta esas dos colecciones. Mismo síntoma preexistente en `tests/integration/api/pets-records.api.spec.ts` (6 fallas). Probable causa: esquema 002 de vacunas/desparasitaciones (campos nuevos de la rebanada 4, T260/T263) frente al adaptador/dominio aún en forma 001. Acción: Keymaker en rebanada 4; hasta entonces las 6 celdas quedan en rojo real como prueba de aceptación.
- Sin hallazgos de severidad Alta/Crítica: ningún rol obtiene o modifica datos fuera de la matriz; cero accesos cruzados (SC-003). ADMIN no borra, no transfiere ni asigna (solo OWNER) como exige la matriz 002.

## Fuera de alcance
- `PATCH/DELETE /pets/{petId}/records/{collection}/{recordId}` (updateRecord/deleteRecord, filas «Eliminar eventos» y «Eliminar otros registros» de REQ-RBAC-001): no se sirven aún (T263). Quedan sin celda; deben añadirse al cerrar T263.
- Fila «Invitar, expulsar y cambiar rol» (acción sobre el hogar; cubierta por roles.api.spec.ts y access-control T242) y exportar/importar respaldo (sin sesión de datos ajenos cubierto en access-control.security.spec.ts).
- Los 11 fallos preexistentes del directorio no son de T251.
- No se marcó tasks.md; T251 no es COMPLETED hasta firma de Neo.
