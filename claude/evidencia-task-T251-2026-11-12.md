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

## H-T251-1 corrección (Keymaker, autorización de Neo opción (a), 2026-11-12)

Causa: validateVaccinationRecord/validateDewormingRecord (esquema 002) exigen category, batchOrClinic, veterinarianName, veterinarianLicense en el registro persistido; NULLABLE_DEFAULTS no los traía. Corrección mínima: completar NULLABLE_DEFAULTS (category constante por tipo: 'VACCINE' / 'DEWORMING'; campos clínicos null). Sin valores clínicos inventados. Nota: nextBoosterAt y nextSuggestedDoseAt también son obligatorios-nulables en el esquema; no se añadieron (fuera de lo autorizado); la prueba IDOR los envía. Una alta que los omita seguiría dando 500: pendiente para Neo/Architect.

Antes: idor-matrix 6 rojos / 55 verdes (500 ERR-INTERNAL-UNEXPECTED en vacunas y desparasitaciones OWNER/ADMIN/CAREGIVER).
Después: idor-matrix 61/61; pets-records.api 3 fallas / 32 verdes (bajó de 6 a 3 en vacunas/desparasitaciones; quedan 3 de GET /pets, ajenas); tests/unit 72 fallas (base 72, sin regresión); tsc 0; verify-oracles CUMPLE; verify-traceability --feature 002 --task T251 CUMPLE.
Ajuste de pruebas: 3 expectativas en tests/unit/use-cases.spec.ts pasaron a incluir los nuevos campos (category, veterinarianName/License null), pues comparaban la forma 001 con toEqual; sin debilitar oráculos.

```diff
diff --git a/src/application/use-cases/record-use-cases.ts b/src/application/use-cases/record-use-cases.ts
index ba286fb..70265b2 100644
--- a/src/application/use-cases/record-use-cases.ts
+++ b/src/application/use-cases/record-use-cases.ts
@@ -38,11 +38,11 @@ const WRITE_ACTION: Readonly<Record<RecordModule, RbacAction>> = {
 };
 
 /** Opcionales que el registro persistido exige como null cuando la entrada no los trae. */
-const NULLABLE_DEFAULTS: Readonly<Record<RecordModule, Readonly<Record<string, null>>>> = {
+const NULLABLE_DEFAULTS: Readonly<Record<RecordModule, Readonly<Record<string, string | null>>>> = {
   weights: { notes: null },
   bodyMeasurements: { notes: null },
-  vaccinations: { batchOrClinic: null, notes: null },
-  dewormings: { notes: null },
+  vaccinations: { category: 'VACCINE', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
+  dewormings: { category: 'DEWORMING', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
   medicalVisits: { observations: null },
   customParameters: { notes: null },
 };
diff --git a/tests/unit/use-cases.spec.ts b/tests/unit/use-cases.spec.ts
index d0b99ef..cc3efd8 100644
--- a/tests/unit/use-cases.spec.ts
+++ b/tests/unit/use-cases.spec.ts
@@ -467,12 +467,12 @@ describe('registros de los 6 módulos (src/application/use-cases/record-use-case
     const vaccine = await cases.vaccinations.execute(ANDRES, ARGOS.id, { ...INPUTS.vaccinations, batchOrClinic: 'Lote 7', notes: 'Sin reacción' });
     const deworming = await cases.dewormings.execute(ANDRES, ARGOS.id, INPUTS.dewormings);
     expect([vaccine.record, vaccine.alert!.status, vaccine.alert!.daysRemaining]).toEqual([
-      { ...INPUTS.vaccinations, batchOrClinic: 'Lote 7', notes: 'Sin reacción', id: generatedId(1), petId: ARGOS.id, createdAt: NOW },
+      { ...INPUTS.vaccinations, category: 'VACCINE', veterinarianName: null, veterinarianLicense: null, batchOrClinic: 'Lote 7', notes: 'Sin reacción', id: generatedId(1), petId: ARGOS.id, createdAt: NOW },
       'UP_TO_DATE',
       365,
     ]);
     expect([deworming.record, deworming.alert!.status, deworming.alert!.daysRemaining]).toEqual([
-      { ...INPUTS.dewormings, notes: null, id: generatedId(2), petId: ARGOS.id, createdAt: NOW },
+      { ...INPUTS.dewormings, category: 'DEWORMING', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null, id: generatedId(2), petId: ARGOS.id, createdAt: NOW },
       'DUE_SOON',
       5,
     ]);
@@ -487,7 +487,7 @@ describe('registros de los 6 módulos (src/application/use-cases/record-use-case
     const deworming = await cases.dewormings.execute(ANDRES, KIRA, { productBrand: 'Drontal', dewormingType: 'INTERNAL', appliedAt: '2026-10-01', nextSuggestedDoseAt: '2026-10-31' });
     expect([weight.record.id, weight.deltaKg, 'deltaPercent' in weight]).toEqual([generatedId(1), 0.1, false]);
     expect([vaccine.record, vaccine.alert!.status]).toEqual([
-      { vaccineName: 'Rabia', appliedAt: '2025-01-01', nextBoosterAt: '2026-01-01', batchOrClinic: null, notes: null, id: generatedId(2), petId: ARGOS.id, createdAt: NOW },
+      { vaccineName: 'Rabia', appliedAt: '2025-01-01', nextBoosterAt: '2026-01-01', category: 'VACCINE', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null, id: generatedId(2), petId: ARGOS.id, createdAt: NOW },
       'OVERDUE',
     ]);
     expect([deworming.record.id, deworming.alert!.status]).toEqual([generatedId(3), 'OVERDUE']);
```

## H-T251-2 (nextBoosterAt / nextSuggestedDoseAt omitidos -> 500) — 2026-11-12
Autorización explícita de Neo (Nivel 2), opción (a). Solo dos defaults; sin otros campos ni cambios de autorización.

### Diff exacto
```diff
--- a/src/application/use-cases/record-use-cases.ts
+++ b/src/application/use-cases/record-use-cases.ts
-  vaccinations: { category: 'VACCINE', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
-  dewormings: { category: 'DEWORMING', batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
+  vaccinations: { category: 'VACCINE', nextBoosterAt: null, batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
+  dewormings: { category: 'DEWORMING', nextSuggestedDoseAt: null, batchOrClinic: null, veterinarianName: null, veterinarianLicense: null, notes: null },
```
Prueba nueva (archivo nuevo): tests/unit/record-next-dose.spec.ts (2 pruebas, API real + SQLite: POST sin próxima fecha -> 201, campo null).

### Antes del fix (rojo)
Ambas pruebas: recibido [500, "ERR-INTERNAL-UNEXPECTED", undefined, undefined, undefined]; esperado [201, null, 'Rabia'|'Drontal', 'VACCINE'|'DEWORMING', null]. Test Files 1 failed, Tests 2 failed (2).

### Después del fix
- record-next-dose.spec.ts: Tests 2 passed (2).
- npx vitest run tests/unit: Test Files 7 failed | 19 passed (26); Tests 72 failed | 471 passed (543). Los 72 rojos son la base previa (backup-use-cases 49, record-invariants 10, components 8, view-model 2, validation 1, backup-import-atomicity 1, infrastructure-adapters 1); la nueva prueba en verde, sin regresión.
- idor-matrix.security.spec.ts: 61 passed (61).
- pets-records.api.spec.ts: 3 failed | 32 passed (35) (las 3 de GET /pets, ajenas).
- npx tsc --noEmit: sin salida (cero errores).
- verify-oracles.sh: Archivos analizados: 83; oráculos débiles: 0; Resultado: CUMPLE.
- verify-traceability.sh --feature 002 --task T251: IDs trazados: 2/2; Violaciones de pureza: 0; Resultado: CUMPLE.
