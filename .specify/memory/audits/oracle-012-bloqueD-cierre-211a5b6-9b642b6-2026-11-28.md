# Acta /oracle — Cierre Bloque D (Feature 012), rango 211a5b6..9b642b6 — 2026-11-28

Alcance: 5 commits (211a5b6 RAMA-01, 957fac0 RAMA-02, 23c07da BAJA-1, e3ed96e contratos, 9b642b6 tasks). Solo lectura.

## Veredicto: CUMPLE CON RESERVAS (0 ALTA, 0 MEDIA, 2 BAJA, 3 INFO)

## Gates (salida real, árbol de trabajo; incluye cambios sin commitear de Bloque E/H-01 ajenos al rango)
- `npx tsc --noEmit`: rc=0, sin salida.
- `bash scripts/verify-oracles.sh`: 693 archivos, 0 oráculos débiles, CUMPLE, rc=0.
- `bash scripts/verify-traceability.sh --feature 012`: CUMPLE, pureza 0 violaciones, rc=0.
- vitest dirigido (6 archivos): 6 passed; 100 tests verdes, 31 omitidos (PostgreSQL sin TEST_DATABASE_URL; aceptado por Neo).

## 1. RAMA-01 — CUMPLE
`emergency-use-cases.ts:332` pasa `[...EMERGENCY_AUDIT_TYPES]` (sin `ALLERGIES_AUDIT_TYPE`); la purga 90 d borra solo EMERGENCY_*. La retención 730 d de PET_CRITICAL_ALLERGIES_UPDATED la da la purga estándar (`ARGOS_AUDIT_RETENTION_DAYS=730`), coherente con annex §7 («no se acorta») y data-model.md:161. La prueba siembra `aud-allergies-old` a 100 d y exige `toContain`; además `EMERGENCY_CARD_ACTIVATED` queda 1 (el de 10 d) e idempotencia (segunda pasada 0).

## 2. RAMA-02 (annex §10) — CUMPLE
`EmergencyCardLifecycleHook.onPetDeceased` (emergency-support.ts:166-170): (a) `switchOffIfOn(petId,'AUTO_PET_DECEASED',now)`; los 3 motores (memory, sqlite, postgres) ponen OFF, token_hash NULL, consented_by_user_id NULL solo `WHERE status='ON'` y devuelven si afectó 1 fila; (b) un `EMERGENCY_CARD_AUTO_DEACTIVATED` solo si afectó; (c) `deleteByPet` siempre; ficha inexistente no crea fila. En `UpdatePetUseCase` (pet-use-cases.ts:152-158) el hook corre tras `assertPetNotFrozen` (congelación) y `pets.save`, dentro de la misma transacción, solo en transición no-DECEASED→DECEASED; si lanza, se propaga y revierte. Volver a ALIVE no invoca nada.
Tercer parámetro `actorUserId`: COHERENTE con §10.4(b) («`actorUserId` = quien marcó el fallecimiento»); no cambia forma pública. Lo que está desfasado es el texto de §10.2, que aún dice `onPetDeceased(petId, tx)` (ver BAJA-1).

## 3. Vía de respaldo — NO exigido; sin hallazgo ALTA/MEDIA
`backup-use-cases.ts:593-606` (importación) hace `pets.delete(id)` y `pets.save(pet)` por cada mascota. `pet_emergency_cards` y `pet_emergency_phone_consents` tienen `ON DELETE CASCADE` a `pets` (sqlite 0041, postgres 0037) y el motor en memoria lo replica (in-memory-unit-of-work.ts:467-468). Tras importar, ficha y consentimientos de esa mascota no existen: no puede quedar ficha ON de una mascota DECEASED; la ruta pública da 404 (fila ausente). Los efectos (a) y (c) quedan subsumidos. No se aplica §10.7 (que cubre filas heredadas): la pregunta es §10.1 «cualquier otra vía que lo fije», y la vía de respaldo cumple el resultado aunque no el mecanismo. Brecha residual: no se emite EMERGENCY_CARD_AUTO_DEACTIVATED y el borrado afecta también a fichas ON de mascotas que siguen ALIVE (comportamiento previo de la importación, fuera de este rango). Ver BAJA-2.

## 4. Aislamiento de commits — CUMPLE
`git show --stat` de los 5 commits: solo emergency-use-cases.ts, emergency-support.ts, pet-use-cases.ts, use-case-support.ts, server.ts, tests (fixture, parity, purge, authz), 4 archivos de contratos/spec (annex, emergency.openapi.yaml, data-model, spec.md) y tasks.md. Cero coincidencias con share-link*, share-links-pets.openapi, contracts/README, error-catalog.json, src/generated, .env.example, deploy-argos.yml, app-config.ts, terraform, origin-verify, specs/005, logos.

## 5. server.ts en 957fac0 — CUMPLE
Hunk de import (+1) y la línea `...(emergency === null ? {} : { emergency, emergencyLifecycle: new EmergencyCardLifecycleHook(() => deps) })` (+1/-1): 2 inserciones, 1 borrado, sin `originVerifySecret`. El árbol de trabajo conserva 2 inserciones H-01 sin commitear (esperado). `deps` es `const` (línea 187) y el hook lo resuelve de forma diferida: sin ciclo.

## 6. REQ-QR12-002 «ARGOS»→«Tipi» — COHERENTE
Cambio de una sola palabra en el texto del editor («Tipi no verifica esta información con un veterinario»), igual a `allergiesEditorHelp` de schema/emergency-texts.ts ya validado en H-2 (acta de 6581ea2). Cierra la observación de spec.md:112 de esa acta. Neo aprobó la enmienda (según el despacho).

## 7. Oráculos fuertes (hook) — SÍ, con INFO
ON→DECEASED: aserta estado/motivo/token_hash/consented_by exactos, consentimientos [], un solo evento, 404 público, y que ALIVE no reactiva ni duplica evento. OFF con consentimiento en espera: consentimiento borrado, sin fila de ficha, 0 eventos. Hook que falla: rechaza, `life_status` ALIVE y ficha ON. 23c07da: ficha ON sembrada, 404 uniforme sin escritura y ficha sigue ON; CAREGIVER 403 ERR-ACC-FORBIDDEN, sin auditoría ni fila PET_CRITICAL_ALLERGIES_UPDATED. Sin oráculos débiles según el gate.

## Hallazgos
- BAJA-1: annex §10.2 dice `onPetDeceased(petId, tx)`; §10.4(b) y el código usan `actorUserId` como tercer parámetro. e3ed96e no alineó §10.2. Pedir a /architect una línea de aclaración (MINOR, sin cambio de forma pública).
- BAJA-2: la vía de importación de respaldo no invoca el hook (§10.1 «cualquier otra vía»). Resultado equivalente por CASCADE; falta decisión documental (annex o nota en §10.7) y, si se desea, prueba que fije DECEASED por importación y afirme 0 ficha/0 consentimientos. No bloquea.
- INFO-1: la prueba ON→DECEASED no asevera el actor del evento (actorUserId = quien marcó); añadir una aserción sobre `executorUserId`.
- INFO-2: `emergencyLifecycle` opcional: si falta, el fallecimiento no apaga la ficha (solo opera la reconciliación perezosa). En producción se cablea junto con `emergency`, y sin `emergency` la ficha falla cerrada; sin riesgo hoy.
- INFO-3: las firmas de Neo de T1676/T1682 (9b642b6: 64 [x] / 29 [ ], verificado) no quedan en la línea de tasks.md; su evidencia es el mensaje de commit y el despacho. PostgreSQL sin ejecutar (31 omitidos), aceptado por Neo.

## Siguiente paso
/architect: alinear §10.2 y decidir BAJA-2. Ningún cambio de código obligatorio.
