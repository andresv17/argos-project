# Veredicto Oracle: cierre de la Rebanada 5 (T280, T281, H-1, compuertas T282) — 2026-11-13

VEREDICTO: T280 APTO | T281 (informe y pruebas) APTO CONDICIONADO (cita de línea desfasada, menor) | H-1 APTO | Compuertas R5 CUMPLE (sin test:gate, por instrucción).

## Mediciones (base HEAD 304ed41, solo lectura)
- git: sin commits nuevos. Cambios de código solo en access-control.security.spec.ts (M) y backup-chaos.security.spec.ts / backup-chaos-child.ts / audits/rebanada-5-rama.md (nuevos); el resto son bitácoras y docs de gobernanza. `git status --short -- src/generated` vacío. logos.* sin tocar.
- T280: backup-chaos.security.spec.ts 10/10 verdes en 3 ejecuciones consecutivas (2,15-2,37 s), sin flakiness. Sin procesos hijos vivos (pgrep) ni directorios argos-smith-* en el tmp.
- T281: 4 archivos pedidos 4/4, 76/76 verdes (coincide con Rama: 13+12+13+38).
- Compuertas: tsc --noEmit 0 errores; verify-oracles CUMPLE (105 archivos, 0 débiles); verify-traceability --feature 002 T271..T281 las 11 CUMPLE.
- Suite de respaldo (api/backup-*, exploits/backup-*, persistence/backup-*, unit/backup-*): 12 archivos de prueba, 275/275 verdes (el 13.º fichero del glob es backup-chaos-child.ts, que no es suite).
- Vitest completo (sin e2e): 26 fallos, 1642 verdes, 10 archivos: pets-records.api 3, canonical-fixtures 4, codegen-drift 1, generated-contracts 3, openapi-conformance 2, web-client 1, infrastructure-adapters 1, components 8, validation 1, view-model 2. Ninguno es archivo de respaldo (decisión J confirmada).

## T280 APTO
- SIGKILL real: el hijo (backup-chaos-child.ts) hace `process.kill(process.pid, 'SIGKILL')` desde SigkillInjector.beforeWrite (modo write:N, transacción abierta) o desde el reemplazo de checkpointAfterCommit (modo after-commit); el padre lo lanza con spawnSync de `process.execPath` y afirma `signal === 'SIGKILL'`, stderr vacío y el marcador killed-at.txt escrito por el hijo antes de morir (`N operación`). No es simulado; si el hijo terminara solo saldría con código 3 y la señal sería null, fallando la prueba.
- Fases del commit (afirmaciones de Smith): write:1, intermedia y última (`total`, incluye `auditLog.insert`) dan estado ANTERIOR: volcado igual a before.json, 0 filas IMPORT, imagen SHA-256 igual a before.sha, integrity_check 'ok'. after-commit da NUEVO: volcado igual a after.json, 1 fila IMPORT, imagen distinta, integrity ok. Los puntos se derivan del contador real de escrituras (no números mágicos) y el WAL se reabre con openSqliteDatabase, así que la recuperación del WAL es la real.
- Vector 1 (HTTP, SQLite, cada escritura N de la transacción del commit, localizada por sondeo): 500 ERR-BACKUP-ATOMIC-ROLLBACK/ROLLED_BACK, dump e imagen idénticos, 0 filas de auditoría añadidas, sin fuga del texto del fallo ni del ID de Argos, reintento 200 COMPLETED con 1 fila IMPORT. Comparación por cadena exacta de todas las N (toEqual).
- Vectores 2 y 4: corrupción (byte, truncado, UTF-8 roto, NUL, digest mayúsculas/63 car./ajeno/ausente), 40 mutaciones fast-check con semilla 280, fila JSON corrupta, página corrupta de `weights`, cabecera SQLite destruida; imagen y bytes de disco idénticos antes/después.
- Oráculos: sin try/catch que traguen, sin toBeDefined vacío; todas las aserciones son toEqual contra valores exactos. Limpieza vía afterEach (recursos y directorios temporales, cierre de app y db). `track` ignora un db ya cerrado con `db.open && db.close()` sin enmascarar aserciones.
- Observaciones menores (no bloquean): (a) la fuga se comprueba con subcadenas fijas ('fallo inyectado', ARGOS.id); suficiente para el vector. (b) El hijo usa `--experimental-transform-types`: depende de Node 22.23 (.nvmrc), coherente con el entorno.

## T281 APTO CONDICIONADO
- Informe rebanada-5-rama.md: el veredicto "sin hallazgos de producción" se sostiene. Citas verificadas en disco: backup-use-cases.ts:166,168,175,179,190,230,276,282,286,314,320,350,362,449-457; backup.routes.ts:29,34,40; sha256-backup-token.adapter.ts:17 (confirmationTokenHash); sqlite-repositories.ts:546; BackupPage.tsx:33-37,64; backup-export.api.spec.ts:22,37,44,94; backup-import-preview.api.spec.ts:51,62. Las pruebas citadas existen y coinciden con su descripción.
- H-R-1 (menor, documental): el informe cita `access-control.security.spec.ts:86` y `:100` (importar el respaldo de María como Lucía), pero tras la enmienda H-1 esa prueba está en la línea 106 (:86 sigue siendo la de la exportación de María). Además el informe sigue listando H-1 como abierto; ya está liquidado. Actualizar el informe o aceptar la nota. Tampoco `use-case:195-205` apunta ya al armado del sobre (está en :172-182); el hecho descrito es correcto.
- H-R-2 (informativa): `:149` apunta a la declaración del tipo de cabecera, no a la emisión (la emisión es :190). Sin efecto.

## H-1 APTO
- Diff: la aserción ahora calcula `leakedKeys` (ownerUserId/exportedByUserId en el sobre y en cada mascota), exige `[]`, y además `!/ownerUserId|exportedByUserId/.test(response.text)`; ya no compara undefined con undefined.
- Mutación en copia de trabajo (scratchpad, node_modules enlazado, árbol real intacto): (1) inyectando ownerUserId en las mascotas exportadas (sin quitar el campo en backup-use-cases.ts:175 y saltando validateBackupEnvelopeV3), con el arnés de contrato OpenAPI activo, falla por "must NOT have additional properties" (2 pruebas rojas). (2) Con la verificación de contrato del arnés (api-harness.ts:93) también desactivada en la copia, siguen 2 pruebas rojas (la de H-1 y la de importación INV-ACC-002) sobre 13. (3) Control con el código real en la copia: 13/13 verdes. Observación: no capturé el texto de diferencia de la prueba H-1 en el caso (2); el rojo del caso (2) es el de leakedKeys/regex de texto por construcción de la mutación.
- Restauración: la mutación solo vivió en la copia; `git diff --stat -- src tests` tras la prueba: únicamente access-control.security.spec.ts (+9/-3).

## Compuertas de cierre R5 (T282): CUMPLE
tsc 0 | oráculos 105/0 | traza T271-T281 11/11 CUMPLE | respaldo 275/275 | 26 fallos heredados sin archivos de respaldo. test:gate y compile-contracts NO ejecutados (instrucción); la ausencia de test:gate completo (cobertura, mutación Stryker, Playwright) queda como verificación pendiente de Neo/Morpheus si se exige en el cierre.

## Hallazgos
H-R-1 (menor, documental), H-R-2 (informativa). Ninguno bloquea. Heredados de la ronda anterior: H-E-1, H-E-2 (UI, T292).
Pendiente de Neo (no de agentes): marcar [x] T271-T281, commits locales y push (decisión K).
