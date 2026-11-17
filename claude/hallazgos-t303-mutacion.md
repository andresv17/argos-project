# Hallazgos T303 — Mutación (Seraph + Dojo)

Fecha: 2026-11-14. Rama 002-plataforma-v21. Sin cambios en src/, specs/, contratos, logos.json ni ui_blueprint.md. Sin commit. T303 sin marcar.

## 1. Configuración final de `mutate`
`tests/mutation/stryker.conf.json` ya contenía, desde antes de esta ola, exactamente lo que pide T303 (no hizo falta editarlo; archivo sin cambios):

```json
"mutate": ["src/domain/**/*.ts", "src/application/**/*.ts", "!src/generated/**"],
"thresholds": { "high": 90, "low": 85, "break": 85 }
```
Sin exclusiones nuevas ni mutantes ignorados. Stryker encontró 50 archivos y generó 3435 mutantes.

## 2. Score
| Medición | Resultado |
|---|---|
| Inicial con el comando oficial `npm run test:mutation` | NO ARRANCA: el dry-run falla (ConfigError: "There were failed tests in the initial test run"). Sin score. |
| Final con las 11 suites rojas preexistentes excluidas solo del dry-run | **88.00 %** (sobre cubiertos 90.16 %); umbral break 85 → PASA |

Conteo de mutantes: Killed 1717, Timeout 79, Survived 196, NoCoverage 49, CompileError 1393 (ignorados por el checker de TypeScript, no cuentan), RuntimeError 1. Duración: 58 min. 8.86 pruebas por mutante en promedio.

### Bloqueo del comando oficial (hallazgo de proceso)
`vitest run` en el árbol actual tiene 27 pruebas rojas en 11 archivos (ya aparecían en `gate-T296-output.txt`, es decir, preexistentes). Son pruebas de la 001 pendientes de sustitución/adaptación (T304), p. ej. `generated-contracts.spec.ts` y `canonical-fixtures.spec.ts` leen los contratos de la 001 pero `src/generated/` está compilado desde la 002; `components.spec.ts`, `view-model.spec.ts` y otros fallan con `view-model.ts:127 isReadOnly` (permisos undefined) y filas de peso sin porcentaje. Archivos rojos:
```
tests/integration/api/pets-records.api.spec.ts
tests/integration/contracts/canonical-fixtures.spec.ts
tests/integration/contracts/codegen-drift.spec.ts
tests/integration/contracts/generated-contracts.spec.ts
tests/integration/contracts/openapi-conformance.spec.ts
tests/integration/persistence/audit-pseudonym.spec.ts
tests/integration/presentation/web-client.spec.ts
tests/unit/infrastructure-adapters.spec.ts
tests/unit/presentation/components.spec.ts
tests/unit/presentation/validation.spec.ts
tests/unit/presentation/view-model.spec.ts
```
Stryker exige dry-run verde, así que `npm run test:mutation` y por tanto `npm run test:gate` seguirán fallando hasta que T304 los deje en verde. No los toqué (no relajar ni editar pruebas; algunos son de Trinity/Keymaker).

Workaround usado solo para medir (no está en el repo): config temporal que excluye esos 11 archivos únicamente al ejecutar Stryker. Efecto: el 88.00 % es medido sin esas pruebas; al volver verdes con T304 el score solo puede subir o mantenerse (más pruebas matan más).
- vitest temporal: `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/c0e3b953-ab96-4db7-b790-e9d7b38bda1b/scratchpad/vitest.mutation.config.ts` (mergeConfig de `vite.config.ts` con `test.exclude`).
- stryker temporal: `.../scratchpad/stryker.tmp.json` (copia de la config oficial + `vitest.configFile` + reporters clear-text/json/html).

### Comando exacto ejecutado
```
bash scripts/compile-contracts.sh --feature 002          # sin diff en src/generated
npm run test:mutation                                    # falla en dry-run (sin score)
npx stryker run <scratchpad>/stryker.tmp.json            # 88.00 %, exit 0
```

## 3. Mutantes sobrevivientes por archivo (Survived / NoCoverage)
Los 245 restantes (score final); no hubo "antes" medible porque el comando oficial no llega a mutar. Líneas:tipo de mutador (primeras 60 por archivo; lista completa en mutation.json del scratchpad).

| Archivo | Surv | NoCov | Score |
|---|---|---|---|
| src/application/use-cases/household-use-cases.ts | 36 | 1 | 73.94 |
| src/application/use-cases/backup-use-cases.ts | 24 | 4 | 84.00 |
| src/domain/households/household-policies.ts | 19 | 5 | 90.40 |
| src/application/use-cases/record-use-cases.ts | 3 | 20 | 58.18 |
| src/application/use-cases/use-case-support.ts | 21 | 2 | 58.93 |
| src/application/use-cases/pet-use-cases.ts | 20 | 0 | 58.33 |
| src/domain/records/record-invariants.ts | 8 | 9 | 84.26 |
| src/application/use-cases/account-use-cases.ts | 7 | 2 | 84.75 |
| src/domain/backup/import-hardening.ts | 9 | 0 | 84.75 |
| src/domain/pet/ownership-transfer.ts | 6 | 2 | 80.95 |
| src/domain/records/superseded-guard.ts | 7 | 0 | 0.00 |
| src/domain/audit/canonical-json.ts | 3 | 4 | 82.05 |
| src/application/use-cases/assignment-use-cases.ts | 6 | 0 | 76.00 |
| src/domain/pet/pet-invariants.ts | 6 | 0 | 94.00 |
| src/domain/records/weight-limits.ts | 5 | 0 | 83.87 |
| src/domain/account/profile-policy.ts | 4 | 0 | 73.33 |
| src/domain/pet/species.ts | 3 | 0 | 90.91 |
| src/domain/auth/auth-policies.ts | 2 | 0 | 96.61 |
| src/application/use-cases/maintenance-use-cases.ts | 1 | 0 | 83.33 |
| src/application/use-cases/ownership-use-cases.ts | 1 | 0 | 90.91 |
| src/domain/account/account-deletion-guards.ts | 1 | 0 | 98.21 |
| src/domain/backup/backup-migration.ts | 1 | 0 | 98.53 |
| src/domain/access/effective-role.ts | 1 | 0 | 95.83 |
| src/domain/pet/estimated-age.ts | 1 | 0 | 83.33 |
| src/domain/auth/password-policy.ts | 1 | 0 | 96.15 |

Detalle por línea (archivo | Survived | NoCoverage | línea:mutador):
```
src/application/use-cases/household-use-cases.ts | 36 | 1 | 118:LogicalOperator 74:StringLiteral 70:StringLiteral 115:ConditionalExpression 117:ConditionalExpression 117:ConditionalExpression 117:LogicalOperator 117:ConditionalExpression 190:ConditionalExpression 257:MethodExpression 257:ConditionalExpression 257:ArithmeticOperator 265:ConditionalExpression 265:LogicalOperator 265:ConditionalExpression 265:MethodExpression 265:ArrowFunction 265:ConditionalExpression 265:ConditionalExpression 265:EqualityOperator 265:ConditionalExpression 267:ConditionalExpression 265:EqualityOperator 280:ConditionalExpression 290:BlockStatement 280:ConditionalExpression 291:ConditionalExpression 280:EqualityOperator 291:EqualityOperator 296:ConditionalExpression 318:ConditionalExpression 319:ConditionalExpression 319:EqualityOperator 337:CallExpression 389:MethodExpression 389:ConditionalExpression 446:ConditionalExpression
src/application/use-cases/backup-use-cases.ts | 24 | 4 | 366:ConditionalExpression 366:ConditionalExpression 366:EqualityOperator 367:StringLiteral 355:ConditionalExpression 355:EqualityOperator 475:UnaryOperator 430:StringLiteral 475:MethodExpression 475:ConditionalExpression 475:ConditionalExpression 475:EqualityOperator 475:EqualityOperator 475:ConditionalExpression 475:ConditionalExpression 475:EqualityOperator 476:ArrayDeclaration 475:EqualityOperator 482:UnaryOperator 482:MethodExpression 482:ConditionalExpression 482:ConditionalExpression 482:EqualityOperator 482:EqualityOperator 482:ConditionalExpression 482:ConditionalExpression 482:EqualityOperator 482:EqualityOperator
src/domain/households/household-policies.ts | 19 | 5 | 65:BooleanLiteral 586:BlockStatement 587:StringLiteral 587:StringLiteral 668:ConditionalExpression 124:EqualityOperator 354:StringLiteral 583:ConditionalExpression 584:StringLiteral 586:ConditionalExpression 591:StringLiteral 593:ConditionalExpression 593:LogicalOperator 594:StringLiteral 618:StringLiteral 620:BlockStatement 615:CallExpression 621:StringLiteral 620:ConditionalExpression 690:ArrowFunction 690:ConditionalExpression 646:ConditionalExpression 661:ArrayDeclaration 661:ArrayDeclaration
src/application/use-cases/record-use-cases.ts | 3 | 20 | 169:StringLiteral 189:StringLiteral 191:CallExpression 201:ConditionalExpression 201:ConditionalExpression 201:ArrowFunction 201:ConditionalExpression 201:ConditionalExpression 201:EqualityOperator 201:StringLiteral 202:ConditionalExpression 202:ConditionalExpression 202:EqualityOperator 202:ArrowFunction 202:ConditionalExpression 202:EqualityOperator 202:ConditionalExpression 202:StringLiteral 203:StringLiteral 218:StringLiteral 218:ConditionalExpression 218:LogicalOperator 218:ConditionalExpression
src/application/use-cases/use-case-support.ts | 21 | 2 | 98:StringLiteral 99:StringLiteral 94:ConditionalExpression 98:LogicalOperator 99:StringLiteral 99:LogicalOperator 127:ConditionalExpression 148:MethodExpression 148:ConditionalExpression 150:ConditionalExpression 158:ConditionalExpression 194:EqualityOperator 194:ConditionalExpression 194:ConditionalExpression 195:ConditionalExpression 195:ConditionalExpression 194:EqualityOperator 195:EqualityOperator 196:ConditionalExpression 195:EqualityOperator 196:ConditionalExpression 196:EqualityOperator 196:EqualityOperator
src/application/use-cases/pet-use-cases.ts | 20 | 0 | 55:ConditionalExpression 57:ConditionalExpression 58:ConditionalExpression 179:MethodExpression 179:ConditionalExpression 180:ConditionalExpression 180:ArrowFunction 180:ConditionalExpression 180:MethodExpression 180:EqualityOperator 181:ConditionalExpression 181:ConditionalExpression 181:EqualityOperator 181:MethodExpression 181:ArrowFunction 182:ConditionalExpression 182:ConditionalExpression 182:EqualityOperator 182:ArrowFunction 182:MethodExpression
src/domain/records/record-invariants.ts | 8 | 9 | 201:StringLiteral 269:CallExpression 271:ConditionalExpression 271:ConditionalExpression 271:EqualityOperator 271:BlockStatement 272:StringLiteral 272:StringLiteral 274:ObjectLiteral 207:StringLiteral 241:StringLiteral 242:StringLiteral 243:StringLiteral 244:StringLiteral 251:ConditionalExpression 244:StringLiteral 245:StringLiteral
src/application/use-cases/account-use-cases.ts | 7 | 2 | 63:StringLiteral 175:BlockStatement 176:StringLiteral 110:StringLiteral 126:ConditionalExpression 126:ConditionalExpression 150:StringLiteral 163:BlockStatement 175:ConditionalExpression
src/domain/backup/import-hardening.ts | 9 | 0 | 41:EqualityOperator 56:StringLiteral 65:StringLiteral 63:ConditionalExpression 66:ConditionalExpression 66:ConditionalExpression 66:ConditionalExpression 66:BlockStatement 67:CallExpression
src/domain/pet/ownership-transfer.ts | 6 | 2 | 71:BlockStatement 72:CallExpression 53:StringLiteral 56:StringLiteral 59:MethodExpression 59:ConditionalExpression 65:StringLiteral 71:ConditionalExpression
src/domain/records/superseded-guard.ts | 7 | 0 | 10:BlockStatement 11:ConditionalExpression 11:ConditionalExpression 11:EqualityOperator 11:StringLiteral 11:BlockStatement 12:StringLiteral
src/domain/audit/canonical-json.ts | 3 | 4 | 29:StringLiteral 33:ConditionalExpression 34:StringLiteral 37:StringLiteral 18:ArithmeticOperator 29:ConditionalExpression 37:ConditionalExpression
src/application/use-cases/assignment-use-cases.ts | 6 | 0 | 55:ConditionalExpression 57:StringLiteral 58:ConditionalExpression 73:ConditionalExpression 73:EqualityOperator 75:ConditionalExpression
src/domain/pet/pet-invariants.ts | 6 | 0 | 48:StringLiteral 75:ConditionalExpression 118:EqualityOperator 155:StringLiteral 212:StringLiteral 215:StringLiteral
src/domain/records/weight-limits.ts | 5 | 0 | 62:ConditionalExpression 62:LogicalOperator 62:ConditionalExpression 67:StringLiteral 64:ConditionalExpression
src/domain/account/profile-policy.ts | 4 | 0 | 14:ConditionalExpression 14:MethodExpression 14:StringLiteral 23:StringLiteral
src/domain/pet/species.ts | 3 | 0 | 35:ConditionalExpression 37:StringLiteral 40:StringLiteral
src/domain/auth/auth-policies.ts | 2 | 0 | 34:MethodExpression 60:StringLiteral
src/application/use-cases/maintenance-use-cases.ts | 1 | 0 | 17:StringLiteral
src/application/use-cases/ownership-use-cases.ts | 1 | 0 | 24:StringLiteral
src/domain/account/account-deletion-guards.ts | 1 | 0 | 41:ConditionalExpression
src/domain/backup/backup-migration.ts | 1 | 0 | 41:ConditionalExpression
src/domain/access/effective-role.ts | 1 | 0 | 62:EqualityOperator
src/domain/pet/estimated-age.ts | 1 | 0 | 21:StringLiteral
src/domain/auth/password-policy.ts | 1 | 0 | 41:StringLiteral
```

## 4. Pruebas añadidas
Ninguna en esta ola. Con 88.00 % ≥ 85 % el criterio de T303 se cumple; cazar los 245 restantes exige varias corridas de 58 min y no es necesario para el umbral. Pruebas no reforzadas, queda margen de mejora.

## 5. Observaciones de calidad (Dojo), prioridad para siguiente ola
1. `src/domain/records/superseded-guard.ts`: 0.00 % (7 supervivientes, 0 muertos). El guard de SUPERSEDED no tiene prueba que falle al mutarlo; es el mayor hueco relativo (REQ del 2.0 de Cuidador/SUPERSEDED).
2. `household-use-cases.ts` 73.94 % (36 Survived), `use-case-support.ts` 58.93 %, `pet-use-cases.ts` 58.33 % (20 Survived), `record-use-cases.ts` 58.18 % (20 NoCoverage), `assignment-use-cases.ts` 76 %, `profile-policy.ts` 73.33 %. Son los archivos que bajan el score; todos bajo el 85 % por archivo, aunque el global pasa.
3. Muchos supervivientes son `StringLiteral` en mensajes/detalles de error (p. ej. use-case-support 98-99, superseded-guard 11-12): se matan comprobando `detail`/`title` exactos, no solo `code`. Candidatos a equivalentes: ninguno confirmado sin revisar línea a línea.

## 6. Hallazgos Caso A / Caso B
Ninguno de comportamiento incorrecto en src/ (no se analizó mutante por mutante; no se detectó incorrección). Hallazgos de proceso (para Morpheus):
- H-T303-1 (Caso A, Keymaker / T304): 27 pruebas rojas preexistentes bloquean Stryker y `test:gate`. Causa: pruebas 001 sin adaptar a contratos 3.0.0 / `src/generated` de la 002.
- H-T303-2 (posible Caso B, Architect): `tests/integration/contracts/*.spec.ts` leen `specs/001-pet-health-tracker/contracts` mientras `compile-contracts.sh` compila 002 por defecto; la tabla de sustitución debe decidir si se adaptan o se marcan sustituidas.
