# Veredicto Oracle: T264 [US6] (2026-11-12, rama 002-plataforma-v21, HEAD 26a245a)

**Verdict: CONDICIONADO** (el cierre de pruebas es real y suficiente para REQ-OWN-001/REQ-AUD-001/SC-016; dos condiciones menores de texto y un hallazgo informativo de cobertura).

## Qué verifica realmente cada prueba
- tests/integration/api/audit.api.spec.ts:113 (transferencia a dos hogares): fixture Andrés dueño; María ACTIVE en hMaria, Lucía-hogar sin María (hLucia); mascota asignada a ambos. Aserción `toEqual` exacta sobre las filas añadidas (`slice(before)`): `[OWNERSHIP_TRANSFER, PET, petId en claro, ANDRES]` y `[UNASSIGN, PET_ASSIGNMENT, hmacHex("petId:hLucia"), ANDRES]`. Además `added.some(entity_id === hmacHex("petId:hMaria"))` es false: la asignación sobreviviente no genera fila. Estado HTTP 200 verificado. Sin aserciones débiles. Nota: el entityId de OWNERSHIP_TRANSFER/PET es el petId en claro (correcto: spec §Auditoría solo exige HMAC para PET_ASSIGNMENT y USER).
- audit.api.spec.ts:128 (determinismo HMAC) y :90 (ASSIGN con HMAC "petId:householdId") refuerzan el entityId.
- assignments-ownership.api.spec.ts:154: exactamente 1 fila OWNERSHIP_TRANSFER/PET con entity_id = pet (COUNT = 1). Aserción concreta, aunque no revisa UNASSIGN (lo cubre audit.api:113).
- tests/unit/ownership-transfer.spec.ts:47-55: dominio puro; `out.audit` toEqual `[{kind:'OWNERSHIP_TRANSFER', petId, fromUserId, toUserId}]` y poda de H2 solamente. Cubre la regla de poda, no la escritura en audit_log.
- Implementación: src/application/use-cases/ownership-use-cases.ts:25-47 (todo dentro de `uow.runInTransaction`; recordAudit en :43 y UNASSIGN por poda en :44); src/application/use-cases/audit-support.ts:40-72 (recibe el `RepositorySet` de la transacción, sin transacción propia; HMAC de `${petId}:${householdId}` en :54-56).

## Correspondencia con el requisito
REQ-OWN-001 (spec.md:208) "Se audita" y poda de asignaciones; REQ-AUD-001 (spec.md:249): 1 fila OWNERSHIP_TRANSFER sobre la mascota + 1 UNASSIGN por asignación podada, hijas sin fila; SC-016 (spec.md:354): cambia dueño, poda, genera una fila de auditoría. Las pruebas citadas verifican exactamente eso.

## Hallazgos
- H-T264-1 (informativo): no existe prueba de reversión específica de la transferencia. Las pruebas de atomicidad de audit.api.spec.ts:~150-175 usan CREATE de mascota (trigger sobre audit_log) y registro de peso; la de cuenta está roja (T265). Por código, la transferencia y la poda (ownership-use-cases.ts:25-47) y las filas comparten `runInTransaction`, por lo que un fallo de auditoría revertiría ambas, pero no hay prueba que lo demuestre para este caso de uso. Sugerencia opcional: trigger `BEFORE INSERT ON audit_log WHEN NEW.mutation_type='UNASSIGN'` y comparar `api.dump()`. No bloquea.
- H-T264-2 (condición, texto): tests/integration/api/assignments-ownership.api.spec.ts:8 ("La fila de auditoría depende de T264 (pendiente)") y :154 ("pendiente de T264") están desactualizados; la fila ya existe por T262/T263. Requiere edición de tests (fuera del alcance de Oracle); decisión de Neo/Keymaker (cambio solo de texto).
- H-T264-3 (condición, administrativa): [x] de T264 en tasks.md es potestad exclusiva de Neo; el techo de agentes es REVIEW. No se tocó tasks.md. Keymaker no produjo cambios, por lo que T264 se cierra por verificación, sin commit de código.
- H-T264-4 (informativo): dependencia del cierre en T262/T263; T264 en sí no aporta artefacto nuevo.

## Compuertas (salida real)
- `npx tsc --noEmit`: exit 0.
- `bash scripts/verify-oracles.sh`: archivos 89, oráculos débiles 0, CUMPLE.
- `bash scripts/verify-traceability.sh --feature 002 --task T264`: IDs trazados 2/2 (REQ-OWN-001 y REQ-AUD-001 con src y tests), pureza 0 violaciones, CUMPLE.
- vitest (assignments-ownership + audit.api + ownership-transfer): 33 pruebas, 29 verdes, 4 rojas esperadas de T265/T266 (ACCOUNT_DELETE x2, purga de retención x2). Todas las de transferencia/poda verdes.
- Suite completa: 102 fallos, 1380 verdes (1482), 17 archivos con fallos; mismo conteo esperado, sin rojos nuevos (las rojas en audit.api son solo las 4 de T265/T266).
- git status / `git diff HEAD --stat -- src tests contracts specs`: vacío; no hay cambios en src/, tests/, contratos ni tasks.md. Solo bitácoras/vereditos, logos.json y scripts/logos.py (ajenos, sin tocar).

## Recomendación
APTO para que Neo marque [x] T264 con las condiciones H-T264-2 (limpiar el texto "pendiente de T264") y, opcionalmente, H-T264-1 como deuda de prueba de reversión.
