# Veredicto Oracle: Rebanada 5 [US7], fase verde T276 a T279 (2026-11-13)

VEREDICTO: T276 APTO CONDICIONADO | T277 APTO | T278 APTO CONDICIONADO | T279 APTO CONDICIONADO (H-V5-1..H-V5-4; A y B requieren enmienda de prueba por decisión de Neo/Morpheus; ninguna bloquea el código).

## Mediciones en disco (base HEAD 37772a2)
- src/ modificado: 8 archivos M + 3 nuevos (file-digest.ts, import-hardening.ts, fault-injector.ts), todos dentro de la lista permitida. Nada fuera de alcance en src/. `git status --short -- src/generated` vacío. Worktree base eliminado y podado. No se ejecutó test:gate ni compile-contracts. logos.* sin tocar.
- tsc --noEmit: 0 errores. verify-oracles: CUMPLE (102 archivos, 0 débiles). verify-traceability --feature 002: T276, T277, T278, T279 CUMPLE.
- Suite (vitest, JSON): base 37772a2 = 1613 pruebas, 208 fallos, 22 archivos rojos. Árbol actual = 1656 pruebas, 28 fallos, 12 archivos rojos.
- Comparación archivo por archivo y prueba por prueba: archivos que fallan ahora y no en la base = 0. Pruebas que fallan ahora y no fallaban en la base = 0. REGRESIONES: NINGUNA.
- Archivos corregidos (10): backup-atomicity-red, backup-atomicity, backup-export.api, backup-import-preview.api, sqlite-backup-import, access-control, credentials, malicious-input, backup-import-atomicity, backup-use-cases.
- 28 rojas restantes = 2 contradicciones (A: 1 en backup-hostile-input-red, B: 1 en backup-envelope-migration-red) + 26 heredadas idénticas en la base (pets-records 3, canonical-fixtures 4, codegen-drift 1, generated-contracts 3, openapi-conformance 2, web-client 1, infrastructure-adapters 1 [timeout scrypt], components 8, validation 1, view-model 2). Ninguna toca respaldo. Las heredadas son deuda de contratos generados 001 vs 002 y presentación; no son de la R5.

## Contradicción A (preview con ID ajeno)
- Aserciones: backup-hostile-input-red.spec.ts:124-148 exige 409 REFERENTIAL-INTEGRITY también en vista previa (recibe 200 en preview, 409 en import). backup-import-preview.api.spec.ts:62 (Lucía) exige 200 con colisiones 0/0 aunque el archivo traiga IDs de otro usuario.
- Spec: spec.md REQ-BACKUP2-002 "previsualización (conteos por entidad y colisiones solo contra los datos propios)". Máquina STATE-BACKUP-001: CHECKING_DOMAIN_INVARIANTS dice "IDs ajenos comprobados en la misma transacción que la escritura (I-5)", es decir en IMPORT; PREVIEW_READY: "colisiones solo contra datos propios ... No se escribió nada". rules.hardening: el rechazo por ID ajeno es el mismo error genérico (aplica al rechazo, que ocurre en la transacción de escritura).
- Dictamen: PREVALECE la prueba de Lucía (T272) y la implementación actual. Un 409 en la vista previa sería además un oráculo de existencia de IDs de otros usuarios, contrario a INV-BACKUP-001/P-14.
- Opción recomendada (A-2): enmendar la prueba T274: preview de archivo con ID ajeno => 200 sin filtrar ID; import => 409 REFERENTIAL-INTEGRITY, ROLLED_BACK, base intacta; el detail único se verifica entre las 2 importaciones (mascota ajena y registro ajeno). No enmendar spec ni máquina. Alternativa descartada: hacer que preview devuelva 409 (rompe Lucía y filtra existencia).

## Contradicción B (peso 900 en 2.0.0)
- El esquema 2.0.0 (LegacyWeightRecordV2) tiene weightKg max 150, min 0.05, multipleOf 0.01. 900 incumple el esquema en VALIDATING_VERSION_AND_SCHEMA, evento SCHEMA_INVALID => ERR-BACKUP-SCHEMA-INVALID (422) según la máquina. ERR-REC-WEIGHT-OUT-OF-RANGE solo se propaga desde CHECKING_DOMAIN_INVARIANTS (DOMAIN_INVARIANT_VIOLATED). Tras migrar DOG->CANINE y CAT->FELINE el límite por especie (0.05-150.00, 2 decimales) coincide con el esquema 2.0.0, por lo que desde un 2.0.0 válido el error de peso del dominio es inalcanzable. La implementación (backup-use-cases.ts:257) es conforme con la máquina.
- Opción recomendada (B-1): corregir la prueba: 2.0.0 con peso 900 => 422 ERR-BACKUP-SCHEMA-INVALID (misma conducta que un 3.0.0 con 900). La intención "misma validación final" ya queda cubierta por los casos DRAGON, role, assignments y fecha futura. Alternativa (B-2, no recomendada): enmendar la máquina para mapear x-sdd-error a un error específico; cambia un contrato normativo.

## BackupPage.tsx
- Confirmado en disco: src/presentation/web/pages/BackupPage.tsx:40 usa `legacyApi.GET('/backup/export')`, la ruta GET ya no existe (solo POST /api/backup/export); y :61 importa con `X-Argos-Import-Confirm: ''` (el servidor exige el fileDigest, 422). Ambas funciones de la página quedan inoperantes. Los comentarios "T271/T272 PENDIENTE" lo reconocen. src/presentation sin cambios en el diff.
- Cobertura: los 12 fallos de presentación (components 8, validation 1, view-model 2, web-client 1) son heredados, idénticos en la base, y ninguno ejercita export/import de BackupPage; tests/unit/presentation/api.spec.ts solo prueba importResultText/importProblemText. No hay prueba que detecte la rotura: la suite está verde en esa zona por ausencia de cobertura, no por funcionamiento.
- Dictamen: NO bloquea T276-T279 (su alcance es dominio, aplicación, persistencia y rutas; el cambio de presentación pertenece a T292 [US8], "Centro de Respaldos con arrastre, previsualización y barra de fases"). Es deuda registrable: la UI de respaldo está rota entre el cierre de R5 y T292. Recomendación: abrir DEUDA (o adelantar un fix mínimo POST export + preview + confirm digest en BackupPage) y añadir prueba de cliente; decisión de Neo/Morpheus.

## Revisión manual de pruebas nuevas
- rbac-export-permission.spec.ts: matriz de 4 roles + rol desconocido denegado; sin firma inventada (cierra H-R5-2/D-T271-2 opción b). backup-export-unauthenticated.api.spec.ts: 401 y base intacta, aserción de fondo (no solo 401). backup-import-hardening.spec.ts: digest contra createHash, rechazos de __proto__/constructor/prototype/duplicados/profundidad (100 000 niveles), migración y no mutación. fault-injector.spec.ts: recorrido de cada N, volcado idéntico y repetibilidad en memoria y SQLite.
- Sin .skip/.only/.todo/toBeDefined en las 4 ni en el diff de tests. try/catch en backup-harness.ts:57 relanza si no es DomainError; los `.catch(() => undefined)` de backup-use-cases.spec.ts:442/452 son preexistentes y la aserción posterior valida el resultado. Ningún oráculo débil.

## Hallazgos
- H-V5-1 (A): enmienda de la prueba T274 (preview 200, import 409). Decide Neo/Morpheus; no es defecto de código.
- H-V5-2 (B): corregir prueba 900 kg a SCHEMA-INVALID. Idem.
- H-V5-3: BackupPage.tsx rota (GET retirado + confirm vacío) sin prueba que lo detecte; abrir deuda o adelantar T292 mínimo.
- H-V5-4: 26 fallos heredados (contratos generados, presentación, timeout scrypt) siguen rojos; T282 (compuerta de rebanada) no podrá cerrarse con suite verde hasta resolverlos o declararlos fuera de alcance. e2e (Playwright) y test:gate no se ejecutaron por instrucción.
- Observación: T277 menciona src/infrastructure/adapters/ para el token; se implementó en la capa de aplicación (backup-use-cases.ts). Aceptable porque el token lo cubren pruebas verdes; documentar si se desea 1:1.

## Límites
Estados en tasks.md sin tocar ([ ] intactos, techo REVIEW). Sin commit ni push.
