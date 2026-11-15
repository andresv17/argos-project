# Bitácora Incremental — The Oracle (`/oracle` — Auditor SDD en Disco)

> **Regla Write-Ahead Log:** Cada vez que `/oracle` inspeccione el disco, compruebe hashes, ejecute compuertas o emita un veredicto (`CONFORME`, `CONFORME CON OBSERVACIONES`, `NO CONFORME`), debe añadir una entrada fechada al final de este archivo antes de responder en el chat.
> **Rol de Portavoz:** `/oracle` es el filtro forense obligatorio antes de pedir cualquier firma de Nivel 2 a **Neo (`Andrés Vallejo`)**.

---

## `[2026-11-09 | Bootstrap Inicial desde Commit 329c392]`
- **Últimas Auditorías Consolidadas en Disco:**
  - `.specify/memory/audits/pet-health-tracker-audit-2026-11-05.md` (`LOCKED`).
  - `.specify/memory/audits/spec-review-v2.2.0-auditor-r2.md`.
  - `.specify/memory/audits/checklist-signature-mapping-2026-11-09.md` (mapeo de firmas previas a ítems `CHK###` en `code-review.md` y `oracle-validation.md`).
- **Estado de Checklists de Compuerta:**
  - `specs/001-pet-health-tracker/checklists/code-review.md`: Re-firmado por Arquitecto en formato `CHK001..CHK010`.
  - `specs/001-pet-health-tracker/checklists/oracle-validation.md`: Firmado por **Neo** en `76a31bf` y re-firmado en formato `CHK001..CHK008`.
  - `.specify/memory/audits/spec-review.md`: Re-ubicado en el árbol de trabajo; pendiente de validación final en disco y firma de Nivel 2 de **Neo**.
- **Siguiente Acción para `/oracle`:**
  - Verificar en disco los cambios pendientes de commit en la rama `001-pet-health-tracker` y presentar a **Neo** el veredicto consolidado para cerrar la migración Spec Kit y `TASK-115` (`T016`).

## 2026-11-10 Oracle: auditoria bugs 1/3/4 (Keymaker)
- Veredicto: PASS CON OBSERVACIONES. Solo cambian los 3 archivos de src y 2 pruebas listadas (mas logs/docs de skills). Sin commits nuevos ni stash. playwright.config.ts intacto.
- Compuertas: tsc OK; auth-password.spec 2/2; vitest 581/582 (falla infrastructure-adapters scrypt por timeout, archivo fuera del diff: preexistente/entorno); traceability 96/96 CUMPLE; oracles 0 debiles CUMPLE.
- Observaciones: e2e 28/28 no reproducido por Oracle (config temporal borrada); texto "Agregar" inexistente en src/presentation/web (boton es "Guardar").

## 2026-11-10 Oracle - auditoria filtro "Buscar mascota" (hallazgo 3)
- Alcance: solo PetCards.tsx (etiquetas/placeholder/aria-label) y e2e nueva; filtrado y PetForm sin cambios.
- Compuertas: tsc OK; vitest 581/582 (scrypt preexistente); trazabilidad 96/96; oraculos 0 debiles.
- E2E PENDIENTE: puerto 3000 ocupado (PID 73667) y 5173 (73666); no se ejecuto Playwright.
- Veredicto: PASS CON OBSERVACIONES.

## 2026-11-10 Oracle: auditoria de cambios sin commit (puertos E2E, selectores, 3 regresiones)
- Verificado en disco: defaults 3000/5173 identicos; proxy usa E2E_API_PORT; selector 'Entrar' coincide con AuthPages.tsx:41; 3 pruebas nuevas solo adiciones, con ID en titulo, sin oraculos debiles.
- Compuertas: tsc OK; vitest api+presentation 113/113 (12 archivos); trazabilidad 96/96 CUMPLE; oraculos 68 archivos, 0 debiles. E2E por lectura de codigo (5/5 reportado por Keymaker en 3200/5273).
- Observacion: aparecio tests/e2e/visual/household-counter.spec.ts (sin rastrear, fuera de la lista); referencia data-household-count que aun no existe en src/ (fallaria hasta implementar el contador).
- Veredicto: PASS CON OBSERVACIONES.

## 2026-11-10 — Auditoría T056 + puerto 3100 + contador de hogares (6-B)
- T056: PASS (firma intacta, sin `!` en normalizeToCanonicalUtc; 37 `it` igual que HEAD, títulos iguales, sin `any`).
- Puerto 3100: PASS CON OBSERVACIONES (5173 intacto; .env.example = defaults; specs/.specify/README sin editar por este cambio).
- Contador 6-B: PASS (insignia ámbar igual; e2e con [REQ-HOUSE-001][REQ-UI-006]); e2e verificado solo por lectura.
- Compuertas: tsc 0 errores; vitest 215/215 en 16 archivos; traceability 96/96 CUMPLE; oracles 0 débiles CUMPLE.
- Ajenos sin auditar: package.json/lock (T057), tasks.md (solo T058 + dependencias), tests auth-pet-forms/auth.api/pets-records/presentation api.spec.

## 2026-11-10 Checkpoint Oracle: auditoría T057 (react-router-dom 6.30.6 -> ^7.18.5)
- package.json: diff solo react-router-dom (pin exacto 6.30.6 pasó a rango ^7.18.5). node_modules = 7.18.5.
- package-lock.json: +40/-24; solo react-router, react-router-dom, retira @remix-run/router, añade cookie 1.1.1 y set-cookie-parser 2.7.3 (deps de v7). Sin reinstalación masiva.
- src/: cambios ajenos (backup-migration.ts, app-config.ts, AppShell.tsx) sin referencias a router; no son de T057.
- npm audit --omit=dev: 0 vulnerabilidades. tsc limpio; vitest presentation 49/49; trazabilidad 96/96 CUMPLE. E2E no ejecutado (por lectura; Keymaker reportó 5/5).
- Veredicto: PASS CON OBSERVACIONES (rango ^ rompe la política de pins exactos).

## 2026-11-10 Oracle: auditoría F4 (contratos 002) — PASS CON OBSERVACIONES
- En disco: 6 esquemas + 5 máquinas + catálogo parsean; OpenAPI 3.1 parsea (344 $ref, 0 sin resolver); Ajv strict/strictTypes/formats compila los 6 (con las x-sdd-* registradas como en scripts/codegen.mjs).
- Catálogo: 35 entradas completas; 0 ERR citados sin entrada. Prueba de seguridad: sobre 3.0.0 rechaza exportedByUserId/userId; ACCOUNT_DELETE rechaza entityId y executor UUID en claro. verify-traceability.sh: 96/96 CUMPLE (mide la 001).
- Observaciones: 3 IDs pendientes sin marca en catálogo/OpenAPI (solo plan.md/README); 4 ERR del catálogo sin uso; compuertas de la 002 aún sin script. Sin ediciones en specs/src/tests.

## 2026-11-10 Oracle: auditoría F7 (T201-T206) — PASS CON OBSERVACIONES
- En disco: 8 archivos de F7 modificados; src/generated, specs/001, constitución sin diff; tasks.md 0 marcadas; sin commits ni stash nuevos. Appareció diff de Architect (F7-doc-fix) en tasks.md y contracts/README.md de la 002 durante la auditoría (ajeno a Keymaker).
- Compuertas: traceability 001 96/96 CUMPLE; oracles 68 archivos CUMPLE; compile --out idéntico a src/generated; --feature 999/abc rc=2; --feature 002 rc=1 (FALLA esperada); vitest 59/59; tsc 0.
- Observación: CI usa FEATURE=001 por defecto, pero test-gate.yml y drift-detection no ejecutan `npm run test:gate` con --feature (ver informe).

## 2026-11-11 Oracle - auditoria T207
- PASS CON OBSERVACIONES: tsc 0 errores, 412/412 fixtures 002, oraculos 0 debiles, trazabilidad 001 96/96 pureza 0, D-F8-01 verificada con Ajv 2020 strict.
- 002: FALLA 71/118 (rebanadas pendientes) + 6 retirados en household-policies.ts:14,218 y household-policies.spec.ts:171,178.
- Observacion: tasks.md tiene T201-T206 en [x] sin commit; T207 sigue [ ].

## 2026-11-11 Oracle - revision semantica de 27 pruebas 001 adaptadas (T207)
- PASS CON OBSERVACIONES: 0 hunks C/D/E/F; conteo de it() identico en los 27 archivos; hunks B (auth-policies 7d->24h, codegen-drift 001->002) justificados por filas 3 y 10 de sustitucion-pruebas-001.md.
- tsc 0 errores; verify-oracles CUMPLE 0 debiles; vitest 260/1014 fallan por reglas 002 (species, confirmPassword, roles, backup 3.0.0), ninguna por aflojamiento; se atienden en T208+.

## 2026-11-11 Oracle - auditoria rebanada 1 (T208-T222)
- PASS CON OBSERVACIONES: tsc 0, verify-oracles CUMPLE (75 archivos, 0 debiles), trazabilidad 002 85/118 (los 33 faltantes son de rebanadas 2+), 001 89/96, sin deriva en src/generated.
- vitest 972 pasan / 154 fallan (HEAD: 754/260); 0 regresiones por nombre; 24 pruebas de HEAD renombradas/retiradas; fallos restantes en backup, hogares ADMIN, especies, UI (rebanadas posteriores); 1 timeout scrypt (flaky).
- Hallazgo: T219 dice DELETE /users/me pero la ruta es POST /api/account/deletion (OpenAPI 3.0.0); para Architect.

## 2026-11-11 Oracle checkpoint rebanada 1 (pasadas T223/T224 post 58fd942)
- Verificado: src sin cambios vs 58fd942; 15/15 privacidad pasan; tsc 0; oracles CUMPLE; trazabilidad 002 T208-T222 CUMPLE 15/15; 001 89/96.
- Vitest completo 973 pasan/154 fallan (declarados 47): ninguno en suites protegidas. Observación débil: correo en backup/export (pets vacio). tasks.md T219 con ruta corregida sin marcar. Sentinels pendiente.

## 2026-11-11 — Auditoria Rebanada 2 (T226-T233), veredicto PASS CON OBSERVACIONES
- tsc 0 errores; verify-oracles CUMPLE (76 archivos, 0 debiles); traceability T226..T235 CUMPLE; compile-contracts sin errores.
- Vitest: 1079 pasan / 121 fallan de 1200 (base a7f07e5: 973/154 de 1127). 0 pruebas que pasaban ahora fallan; 12 removidas por la tabla de sustitucion (filas 30-31). Todas las 121 ya fallaban en base (rebanadas posteriores).
- Observaciones: fila 33 (DRAGON), toBeUndefined en asserts void, T234 pendiente. Sin cambios a specs/001, constitucion, spec, contratos, tasks.md.

### 2026-11-11 — Auditoría T236 (parte 1: permissions-matrix)
- CC: veredicto PASS CON OBSERVACIONES. Informe en `.specify/memory/audits/oracle-T236-permissions-matrix.md`.
- H: 44 casos verificados celda por celda contra spec §5.2 y canonical-fixtures `rbacMatrix` (0 discrepancias). vitest: 44 fallos `Failed to load url ../../src/domain/access/rbac.ts` (ausencia de módulo, no sintaxis).
- H: `tasks.md` tiene 10 líneas T226–T235 pasadas a `[x]` sin commit. Solo Neo puede marcar COMPLETED. Escalado a Neo.
- H: fila 6 pendiente. `tests/property/access.property.spec.ts` y `tests/unit/access-policy.spec.ts` son versiones 001 (no prueban can()).

### 2026-11-11 — Auditoría T236 fila 6 (access.property / access-policy, 002)
- CC: veredicto PASS CON OBSERVACIONES. Informe en `.specify/memory/audits/oracle-T236-fila6.md`.
- H: git diff de los dos archivos: 318 inserciones, 0 borrados. verify-oracles: 77 archivos, 0 débiles, CUMPLE. Grep manual de patrones débiles: 0.
- H: vitest: 17 fallidas / 8 pasadas. 15 nuevas por módulo ausente (14 effective-role.ts, 1 rbac.ts). tsc: 5 errores, todos TS2307.
- H: EDGE-008/009 (001): afirmación de Keymaker CIERTA. HEAD espera INV-ACC-00x; catálogo HEAD (error-codes.ts) emite INV-ACC2-00x. Verificado por lectura de git show, sin cambios en el árbol.
- H: firma de effectiveRole es suposición no fijada en spec ni en T244. Escalado a Neo. Decisiones (a) EDGE-008/009 y (b) firma.
- H: matriz 002 canónica (44 filas) coincide 1:1 con REQ-RBAC-001. Las pruebas nuevas no usan ese fixture.

## 2026-11-11 · Oracle · Auditoría T237–T242 (Keymaker)
- H: git diff confirma sin cambios en src/, contratos ni src/generated. Solo 3 líneas borradas (access-policy:57,88 y la importación de access-control). Fuera de lista: access.property.spec.ts (+167) y permissions-matrix.spec.ts (nuevo, 44 celdas).
- H: vitest 9 archivos: 94 pasan / 76 fallan de 170. Extra: access.property 2/4, permissions-matrix 0/44. verify-oracles: CUMPLE, pero la compuerta no detecta toContain([403,404,409]).
- H: tsc: 10 errores (5 TS2307 esperados hasta T244; 4 TS2554 y 1 TS2345 son defectos de tipado en tests).
- H: household-policies:95 `[9,27]` es imposible: la máquina tiene 6×8=48 celdas y 11 transiciones válidas. La tabla de test omite CHANGE_ROLE y TRANSFER_OWNERSHIP.
- H: 5 pruebas verdes: 4 (a) con cobertura real de removeOrLeave/requireInvitation; «eliminar el hogar» (b): roleOnJoin ignorado, el 403 no prueba ADMIN.
- H: 18 pruebas de 001 clasificadas: 9 sustituibles, 7 no sustituibles (2 son 500 de pets-records sin explicar; 2 son método GET en vez de POST de backup; 2 son regresión D-01 probable; 1 es siembra ausente de INV-HOUSE-004), 2 no determinadas.
- H: 403 vs ERR-HOUSE-NOT-FOUND: prevalece OpenAPI (403) para la asignación; no es Caso B bloqueante. Recomendación no bloqueante a Architect.
- H: informe completo en .specify/memory/audits/oracle-T237-T242.md. Veredicto FAIL (B1–B9, MAX_RETRY=1). Escalado a Neo: N-1 tabla C, N-2 firma effectiveRole, N-3 nombres T243/T244.

## 2026-11-11 — Verificación final T237–T242 (última vuelta, MAX_RETRY consumido)
- CC-ORA-F1: B1, B2, B3, B5, B7, B8 corregidos en tests/; B4 parcial (test corregido, src/ sigue GET en backup.routes.ts:20); B6 no tocado (líneas 1–376 idénticas a HEAD); B9 declarado.
- H: vitest 11 archivos = 96 pasan / 124 fallan / 220 (coincide con Keymaker). tsc: solo 5 TS2307 esperados (a). verify-oracles CUMPLE, 0 oráculos débiles.
- H: 124 fallos clasificados: (a) 66, (b) 14, (c) 27, (d) 7, (e) 10. El grupo (e) son pruebas 001 que contradicen la 002 sin sustituir (tabla C): no encaja en a–d, veredicto FAIL.
- H: hallazgo fuera de alcance: tasks.md con 10 líneas [ ]→[x] en T226–T235 sin commit (Nivel 2). No tocado.
- Informe: .specify/memory/audits/oracle-T237-T242-final.md. Escalado a Neo: D-1 (grupo e), D-2 (category/vet en B6), D-3 (GET→POST backup en src).

## `[2026-11-11 | Revalidación D-1 T237–T242]`
- CC-ORA-D1: revalidación en disco de la sustitución D-1. Informe: `.specify/memory/audits/oracle-T237-T242-D1.md`.
- H: 10/10 sustituciones presentes en disco. Verdes: `household-policies:274` (a), `use-cases:250` (a, O-2), `households.api:12` (a, O-2), `access-control:46` (b, atajo legado `use-case-support.ts:148-152`).
- H: FAIL por (e) `household-policies.spec.ts:340-352` (canEdit retirado por `pet.schema.json:490`), (f) `malicious-input.spec.ts:252` (invitación sin `roleOnJoin`, requerido por `identity.schema.json:517`), (f) probable `openapi-conformance.spec.ts:49` (username fuera de patrón).
- Vitest 15 archivos: 127 pasan / 139 fallan / 266 (no concilia con Keymaker 55/89/144). tsc: 5× TS2307, 0 TS2554/TS2345. H-MOR-02 confirmado: filas ausentes de la tabla C. H-1 (`tasks.md` [x] T226–T235) sigue abierto.

## `[2026-11-11 | Veredicto final D1 T237–T242]`
- CC-ORA-FINAL: revalidación final en disco. Informe: `.specify/memory/audits/oracle-T237-T242-final-D1.md`. Sin commit, sin push, sin tocar src/tests/specs/tasks.md.
- H: A `household-policies:340-352` aceptable (d): aserción correcta según REQ-RBAC-001; rojo por `householdPets` sin `permissions` en src.
- H: B `malicious-input:248,252` y C `openapi-conformance:49,63`: defecto de la prueba (f). Contraseñas sin símbolo (INV-AUTH2-001, `src/domain/auth/password-policy.ts`) y sin `confirmPassword`; registro falla, `house.household` undefined.
- H: D `access-control:46` aceptable hasta T244 (rbac.ts ausente, clase a). Observación: verde por `legacyRoleAndPermissions`.
- H: extra `use-cases.households:78` residuo 001 `role: 'MEMBER'`, pasa en verde (e). Defecto de tests/.
- Vitest 15 archivos: 126/140/266 (conciliado con Keymaker). Global 1087/224/1311. tsc: 5 TS2307 + 2 TS2339 (household-policies:346,356).
- Hoja: filas tabla C (use-cases.households, roles-migration) y D-10 presentes. Residuo «32 celdas» en líneas 18 y 96 (no 92).
- Veredicto: FAIL, escalado a Neo (PARA: Neo, Nivel 2). H-1 (tasks.md [x] T226–T235) sigue abierto.

## `[2026-11-11 | Oracle revalidación FINAL D2 T237–T242: FAIL | 1 defecto de tests/ (T-1) | Escalado a Neo]`
- H: malicious-input:248 y openapi-conformance:49 CUMPLEN la política INV-AUTH2-001 (longitud, mayúscula, dígito, símbolo `!`) y tienen confirmPassword. Login sin política (253) correcto.
- H: openapi-conformance:69 falla por `POST /api/backup/export` con 404 no declarado: `backup.routes.ts:20` registra GET; contrato POST. Defecto de src (d). Lectura de Keymaker correcta.
- H: use-cases.households:78–87 decisión CORRECTA (INVITED sin rol; roleOnJoin en invitación; ACCEPT asigna role). Rojo = src `domain/households/household-policies.ts:231` (residuo 001).
- H: T-1 `household-policies.spec.ts:323` `['OWNER','MEMBER']` en vista de hogar, contrato HouseholdRole = ADMIN|CAREGIVER|READER. Verde por legado. Defecto de tests/ (e). Bloquea PASS.
- Cifras: 15 archivos 126/140/266 (conciliado); última ronda 20/14/34; tsc 7 (5 TS2307 + 2 TS2339 src); verify-oracles CUMPLE 79/0; greps débiles 0.
- Hoja: 32 celdas = 0; 44 celdas en 18, 66, 96; tabla C filas 68–69 y D-10 (línea 84) presentes.
- Informe: .specify/memory/audits/oracle-T237-T242-final-D2.md (nombre distinto de FINAL por colisión en macOS con final.md).

## `[2026-11-11 | Oracle final T1 T237–T242: FAIL | 1 defecto de tests/ (T-1, clase f) | Escalado a Neo]`
- H: household-policies.spec.ts:323 pasó de verde (D2, expectativa 001) a rojo (expectativa 002). Entrada `casa`/`members` = fixtures 001 (OWNER/MEMBER, líneas 36–43); householdView (household-policies.ts:385–400) devuelve me.role crudo. Clase (f), no (d): src no debe mapear roles en lectura (REQ-MIG-001 es persistencia).
- Cifras: 15 archivos 125/141/266 (D2 140; +1 = línea 323). household-policies 13/22/35. tsc 7 (5 TS2307 + 2 TS2339 src). verify-oracles CUMPLE 79/0. Greps débiles 0. Hoja: 32 celdas = 0; 44 celdas en 18, 66, 96; tabla C 68–69; D-10 en 84.
- Aceptación Neo hasta T244 NO cubre este rojo (nuevo, de tests/). Opciones: (a) autorizar corrección de setup en 309–387 (recomendada); (b) deuda hasta T244 por escrito.
- Informe: .specify/memory/audits/oracle-T237-T242-FINAL-T1.md

## [2026-11-11 | Oracle T1a: veredicto final tras T-1 (a) | PASS CON OBSERVACIONES]
- Disco: git status en src, contratos, src/generated y tasks.md solo muestra tasks.md (H-1, T226–T235 en [x], ratificado por Neo). Sin cambios en src/contratos.
- household-policies: 12 fallos / 23 pasan / 35. Línea 328 (ADMIN/READER) pasa. Fallos: 9 applyMembershipEvent ausente (src), 1 editPetBasics ausente (src, 346–352), 2 AssertionError de src (crear hogar y roleOnJoin).
- isHouseholdOwner: contrato-backed (identity.schema.json:391,416; household-membership.machine.json:37,42,57; canonical-fixtures.json). No es suposición. Observación: la firma de applyMembershipEvent sigue siendo suposición de prueba (no fijada en contrato).
- 15 archivos T237–T242 (lista de la tabla de la auditoría previa): 140 fallos / 126 pasan / 266. tsc 7 (5 TS2307 + 2 TS2339 en household-policies:351,361). verify-oracles CUMPLE 79/0. Greps débiles 0 fuera de verify-gates.
- Observación O-1: en mascotas por dueño, la expectativa de Andrés pasa de owner===andres a true (REQ-RBAC-001: Admin = S). Fundada en la spec, pero excede el cambio de rol. O-2: hoja-de-ruta línea 68 dice residuo MEMBER en línea 78; ya no existe (stale). O-3: sin snapshot previo a T-1, no puedo aislar el diff de T-1 frente al resto de T237.
- Informe: no escrito como .md (regla de la sesión); veredicto devuelto en el handback.

## 2026-11-11 Oracle: auditoría T243 y T244
- Veredicto PASS CON OBSERVACIONES. can() 44/44 contra rbacMatrix; effectiveRole conforme; 0004 conforme salvo INVITED/DECLINED/CANCELLED (decisión de Neo).
- vitest 74/76 (roles-migration 5/7: defectos de prueba en líneas 114-119 y 73-79/125-128); 4 aserciones fijas de 0001-0003 fallan por la 0004; tsc 2 (T248); verify-oracles 0 débiles.
- Informe: .specify/memory/audits/oracle-T243-T244.md

## 2026-11-11 Oracle: revalidacion T243/T244 -> PASS CON OBSERVACIONES. Informe .specify/memory/audits/oracle-T243-T244-revalidacion.md. 16 rojos persistencia clase (i) CHECK status. Sin tocar src/tests/specs.

## 2026-11-11 Oracle: revalidacion 0004 invited_by_user_id nulo -> PASS CON OBSERVACIONES. Informe .specify/memory/audits/oracle-T243-0004-invitedby.md. Reconstruccion fiel, transaccional; 20/20; 12 rojos clase (i); tsc 2 errores T248; trazabilidad 4/4.

### 2026-11-11 — Validación prueba roles-migration.spec.ts:111 (invitedByUserId nulo)
- Veredicto: FAIL por compuerta de oráculos. verify-oracles.sh: roles-migration.spec.ts:120 `expect(() => runMigrations(db)).not.toThrow()` marcado como oráculo débil (1 de 79 archivos).
- Resto OK: vitest 8/8; tsc solo T248 (household-policies.spec.ts:351,361); stash vacío; comportamiento coincide con data-model §2.10 y 0004 (líneas 16, 31, 45-51). Archivo es untracked (git diff no aplica).

### 2026-11-12 07:36 — Oracle: auditoría T245
- Veredicto CONDICIONADO. Gates re-ejecutados: traceability CUMPLE, oracles CUMPLE, tsc 2 errores de T248.
- H-T245-1: fallback 1970 en applyMembershipEvent (riesgo INV-HOUSE-005). H-T245-2: pets ?? [] omite poda sin error (REQ-HOUSE2-002).
- Veredicto: claude/veredicto-auditor-task-T245-2026-11-12.md. No se tocó tasks.md ni git.

## 2026-11-12 Oracle: auditoría T246 -> CONDICIONADO
- Gates: vitest 49/57 (8 rojos), tsc 2 (T248), oracles CUMPLE 80/0, traceability CUMPLE 8/8. households.api 29/29 rojo por CHECK 0004.
- A2, B, H-T245-1 y H-T245-2 cumplen. Hallazgos: roleOnJoin/responder con placeholders (H-1), ADMIN no expulsa (H-2, removeOrLeave:303), INVITED vs CHECK 0004 (H-3, 0004 untracked, origen T243), test creador contradice esquema (H-4, confirmado).
- Veredicto: claude/veredicto-auditor-task-T246-2026-11-12.md. Sin tocar src/tests/tasks.md/git.

## 2026-11-12 Oracle: revalidación T246 -> APTO
- vitest 59/60 (único rojo T248), tsc 2 (T248), oracles CUMPLE 80/0, traceability 8/8, API 26/29 (3 rojos T247).
- H-T246-1..4 cerrados; cambio de la prueba "invitar con CAREGIVER" a isLegacyHouseholdMember evaluado: legítimo. H-5/6/7 aceptables fuera de T246.
- Veredicto: claude/veredicto-auditor-task-T246-revalidacion-2026-11-12.md.

## 2026-11-12 Oracle: auditoría T247 -> CONDICIONADO
- households.api 26/29 (3 rojos B1 intactos), assignments-ownership 10/11 (audit_log T264), roles 13/13, tsc 2 (T248), oracles CUMPLE 81/0, traceability 4/4.
- Contrato OK (PUT, DELETE, POST ownership-transfer). Cambio loadPetAccess correcto según INV-ACC2-001, sin regresión en T244/T246. Prueba dashboard legítima.
- H-T247-1 (media): /households/{id}/pets ignora asignaciones, diferido a T248. B1 adaptable con autorización de Neo; B2 trasladable a T264/T265. H-T246-5 abierto (Architect).
- Veredicto: claude/veredicto-auditor-task-T247-2026-11-12.md.

## 2026-11-12 09:45 — T247 revalidación tras B1: APTO
- Diff B1 = 3 aserciones autorizadas (EDGE-037/038, HOUSE2-001, conteo 422), valores concretos, sin oráculos débiles; fixtures/src/otros tests no tocados por B1.
- households 29/29; assignments 10/11 (audit_log = B2 -> T264/T265); roles 13/13; tsc solo 2 'permissions' T248; oracles 0 débiles.
- Fuera de T247: B2, H-T246-5 (Architect), H-T247-1 (T248), H-T247-2 (Architect). Ver claude/veredicto-auditor-task-T247-revalidacion-2026-11-12.md

## 2026-11-12 10:10 — T248 auditoría: CONDICIONADO
- Implementación conforme (myRole/permissions, 404 antes que 403, H-T247-1 por pet_assignments). tsc 0; oracles 0 débiles; traza 12/12.
- C1, C2, C3: las tres pruebas 001 contradicen la spec 002 (SÍ); adaptaciones de Keymaker correctas; C2 usar propuesta A (hogar con CAREGIVER/READER, 403) para no debilitar. Luna es ADMIN para Andrés (no READER) y FELINE.
- Sin rebote a Keymaker (MAX_RETRY intacto). Ver claude/veredicto-auditor-task-T248-2026-11-12.md

## 2026-11-12 10:30 — T248 revalidación C1-C3: APTO
- Adaptaciones C1, C2 (A + caso ADMIN 200), C3 correctas y con valores literales; src intacto; cambio de lista de María legítimo (REQ-PET2-002), pedir ratificación a Neo.
- Línea base verificada con git archive de HEAD: 72 fallos de tests/unit preexistentes, 0 nuevos. B2 -> T264. tsc 0, oracles 0 débiles, traza 12/12.
- Menores: título obsoleto "solo las propias" (O-2) y ALL por longitud (O-1). Ver claude/veredicto-auditor-task-T248-revalidacion-2026-11-12.md

## 2026-11-12 Oracle T249: APTO
- Diff de T249 confinado a guards + fase B + 9 pruebas; B4/B5/B6 releídos dentro de la transacción; código coincide con STATE-ACCOUNT-DELETE-001 (B4->B5->B6) y REQ-ACC-002/SC-014; regla "único ACTIVE no bloquea" en spec y máquina. joinBetweenPhases simula alta real entre fase A y B (2.ª runInTransaction).
- account-deletion 26/26, use-cases 36/36, unit 72=base, tsc 0, oracles 0 débiles, traza 4/4. O-2 solo texto en el título.
- H-T249-1: los 22 fallos de account*.api NO existen en HEAD (22/22 verdes en git archive); son regresión del árbol sin commit T245-T248 (CHECK status SQLite al sembrar). No bloquea T249. Ver claude/veredicto-auditor-task-T249-2026-11-12.md

## 2026-11-12 Oracle H-T249-1: APTO (revalidacion 497c12d)
- Commit solo toca identityState() en identity-fixtures.ts (+ bitacoras); src/migraciones/specs/aserciones intactos.
- INVITED de Carla pasa a state.invitations; campos admitidos por household_invitations (0004). IDENTITY_MEMBERSHIPS intacto.
- account*.api 22/22, account-deletion 26/26, tsc 0, oracles CUMPLE. H-T249-2 sigue abierto. Ver claude/veredicto-auditor-task-H-T249-1-2026-11-12.md

## 2026-11-12 Oracle H-T249-2 (APTO)
- d193d9c solo toca 2 archivos de tests (+ claude/); sin src/migraciones/specs/contracts.
- 37/37, 22/22, 26/26, tsc 0, oracles CUMPLE. Cobertura INVITED/INV-HOUSE-003 intacta. Veredicto: claude/veredicto-auditor-task-H-T249-2-2026-11-12.md

## 2026-11-12 Oracle T250 (CONDICIONADO)
- d4baaea solo tests + claude/; sin src/specs/contracts/tasks.md. Playwright 15 passed/1 failed (:310), tsc 0, oracles CUMPLE, trazabilidad 3/3 CUMPLE.
- H-T250-1 y H-T250-2 confirmados como defectos de produccion; expect.soft legitimas. Veredicto: claude/veredicto-auditor-task-T250-2026-11-12.md

## 2026-11-12 Checkpoint Oracle T250 final
Audite cf1e68c: alcance limpio, requireManager = MANAGE_HOUSEHOLD_MEMBERS, Eliminar por deletePet, prueba ADMIN concreta.
tsc 0; vitest 60/60 y 44/44; playwright 16/16; oracles 0 debiles; trazabilidad 3/3. Veredicto APTO.
Obs: mensaje del commit menciona contador no presente en el diff.

## 2026-11-12 — Checkpoint T251 (corrección 05b5267)
- Auditado 05b5267: alcance limpio, NULLABLE_DEFAULTS conforme al esquema 002; 3 toEqual legítimos.
- Corridas: idor 61/61, use-cases 36/36, pets-records 32/35, unit 72 (base), tsc 0, oracles y trazabilidad CUMPLE.
- Hallazgo H-T251-2: POST sin nextBoosterAt/nextSuggestedDoseAt da 500 (record exige null). Veredicto CONDICIONADO. Ver claude/veredicto-auditor-task-T251-2026-11-12.md

## 2026-11-12 — Checkpoint T251 final (57b2083)
- Auditado 57b2083 sobre 05b5267: alcance limpio, 2 líneas de código, 2 pruebas toEqual estrictas, fallaban antes.
- Corridas: record-next-dose 2/2, idor 61/61, pets-records 32/35 (GET /pets ajeno), unit 72 base, tsc 0, oracles y trazabilidad CUMPLE.
- H-T251-1 y H-T251-2 cerrados. Veredicto APTO (REVIEW). Ver claude/veredicto-auditor-task-T251-final-2026-11-12.md

## 2026-11-12 — Checkpoint T252 compuerta rebanada 3 (57b2083)
- Trazabilidad T236..T251 16/16 CUMPLE; oráculos 83/0 débiles CUMPLE; tsc 0; trazabilidad global FALLA 88/96 (IDs 001).
- vitest: 113 fallos = 72 unitarias base + 41 no unitarias (GET /pets 4, B2 1, respaldo 23, contratos 7, records.property 1, propios de rebanada 3: 5).
- Propios: households.property (T237), 2 de T242, INV-HOUSE-004, NOT_YET_SERVED de session-csrf. T236-T242 siguen [ ].
- Veredicto CONDICIONADO. Ver claude/veredicto-auditor-task-T252-2026-11-12.md

## 2026-11-12 — T252 revalidación tras H-T252-1..3 (Oracle)
- Diff de 3 archivos de prueba contra 57b2083; sin cambios en src/, contracts/, generated, migraciones.
- households.property 3/3, session-csrf 14/14, household-policies 37/37, access-control 11/13 (2 por POST /api/backup/export 404, rebanada 5), tsc 0, oráculos CUMPLE, traza T242 CUMPLE.
- Veredicto CONDICIONADO; decisiones de Neo: desviación 2a (404 sin código en 2 celdas deleteRecord), /dashboard, exportBackup. Detalle: claude/veredicto-auditor-task-T252-revalidacion-2026-11-12.md.

## 2026-11-12 — Checkpoint T252 veredicto final (CONDICIONADO)
- access-control 13/13, verify-oracles CUMPLE (0 debiles), tsc 0, session-csrf+households.property 17/17. tasks.md sin cambios en T236-T242/T252.
- Pruebas de export con GET + contract:false: fuertes en contenido (200, solo LUNA, sin ARGOS, sin secretos; import ajeno 409 rollback) pero no ejercen POST 002 ni 401/403 de rol. Causa raiz de Neo confirmada (72e7e70).
- Deuda D-T271-1..3 declarada. Detalle: claude/veredicto-auditor-task-T252-final-2026-11-12.md

## 2026-11-12 Oracle — T253 fase ROJA: APTO (condicion T259)
- Commit 7c079e9 solo tests+bitacoras; vitest falla por modulo src/domain/audit/* ausente (no tests ejecutados); tsc 6x TS2307; verify-oracles CUMPLE; traceability falla solo INV-AUD-001 (esperado).
- Lista de secretos: sessionId sobra vs spec (inocuo); faltan tokenHash/confirmationToken (data-model 2.2/2.4, common.schema ConfirmationToken). Condicion para T259.
- Detalle: claude/veredicto-auditor-task-T253-2026-11-12.md

## 2026-11-12 Oracle — T254-T257 fase ROJA: APTO
- Commit d83cb77 solo tests+bitacoras; rojo por audit_log ausente, src/domain/audit y superseded-guard ausentes, rutas PATCH/DELETE de registros ausentes y config ARGOS_AUDIT_HMAC_SECRET sin validar. 3 fallas GET /pets de pets-records son de la base. tsc 6x TS2307; verify-oracles CUMPLE.
- Secretos de T253 correctos (sessionId solo como no secreto). Saneamiento de fixtures 002 sin debilitar oraculos.
- Supuestos verde: secreto de prueba, produccion 64 hex, superseded-guard 409, app-config.spec. Detalle: claude/veredicto-auditor-task-T254-T257-2026-11-12.md

### [2026-11-12] Oracle checkpoint T258-T259
- Veredicto CONDICIONADO: gates verdes; condiciones C1 (access-control:247), C2 (CC-T258-2), C3 (H-T258-O1). Ver claude/veredicto-auditor-task-T258-T259-2026-11-12.md
- 2026-11-12 [oracle] Revalidación T258-T259: APTO. Filtro extra aprobado (más estricto: 'eliminar evento sanitario' exige 403).

### [2026-11-12] Oracle veredicto T260: APTO (ver claude/veredicto-auditor-task-T260-2026-11-12.md)

### [2026-11-12] Oracle veredicto T262: CONDICIONADO (ver claude/veredicto-auditor-task-T262-2026-11-12.md)

### [2026-11-12] Oracle veredicto T263: CONDICIONADO (ver claude/veredicto-auditor-task-T263-2026-11-12.md)
- Codigo sin bloqueantes; tests/contracts/generated sin cambios; 2 andamios caducados legitimamente, requieren autorizacion de Neo para retirarlos.

### [2026-11-12] Oracle revalidación T263: APTO (ver claude/veredicto-auditor-task-T263-revalidacion-2026-11-12.md)
- Solo cambian las 2 pruebas autorizadas; aserción [19, [], 'Nala'] más estricta, sin huérfanos; suite 102 fallos como se esperaba.

### [2026-11-12] Oracle T264: CONDICIONADO (ver claude/veredicto-auditor-task-T264-2026-11-12.md)
- audit.api:113 afirma OWNERSHIP_TRANSFER/PET + UNASSIGN con HMAC "petId:householdId"; la superviviente sin fila. Misma transacción por código; sin prueba de reversión específica (informativo).
- tsc 0, oracles CUMPLE, traza CUMPLE, 4 rojos T265/T266, suite 102 fallos, sin cambios en src/tests.

### [2026-11-13] Oracle T265 FINAL: APTO
- Medido: traza 4/4, oraculos CUMPLE, tsc 0, account-deletion 26/26, checkpoint 4/4, suite 96/1485 (16 archivos), ninguno de T265 (solo scrypt timeout preexistente en infrastructure-adapters).
- Diff: ACCOUNT_DELETE y pseudonymizeUser dentro de la transaccion; checkpoint tras commit; 0 residuos NULL_PSEUDONYM/puertos transitorios. Veredicto: claude/veredicto-auditor-task-T265-final-2026-11-13.md

### [2026-11-13] Oracle T266: APTO (ver claude/veredicto-auditor-task-T266-2026-11-13.md)
- Medido: traza CUMPLE, oraculos CUMPLE 0 debiles, tsc 0, audit.api 18/18, maintenance 3/3, suite 94/1488 (15 archivos), ninguno tocado por T266.
- Diff: solo DELETE, una transaccion, checkpoint tras commit, sin Date. 6 decisiones a Neo (D1, D4, D5 sin respaldo pleno); H-T266-I1..I3 informativos.

### [2026-11-13] Oracle T267: auditoria iniciada
- Checkpoint WAL: verificando traza, oraculos, tsc, marker 5/5, suite y debilidad de aserciones sobre sqlite-migration-marker.spec.ts.

### [2026-11-13] Oracle T267: APTO (ver claude/veredicto-auditor-task-T267-2026-11-13.md)
- Medido: traza CUMPLE, oraculos 0 debiles, tsc 0, marker 5/5, suite 94/1493, ninguno tocado por T267. Solo se anade test; migracion 0005 ya cumple. H-T267-I1..I3 informativos.

### [2026-11-13] Oracle T268: auditoria iniciada
- Checkpoint WAL: diff solo 3 archivos (src solo comentario); verificando traza, oraculos, tsc, mutacion, H-3 en HEAD, suite.

### [2026-11-13] Oracle T268: APTO CONDICIONADO
- traza 3/3, oraculos 0 debiles, tsc 0, 107/110, suite 94/1496 (0 nuevos), mutacion tumba las 3 pruebas, H-3 ya fallaba en HEAD. Veredicto: claude/veredicto-auditor-task-T268-2026-11-13.md

### [2026-11-13] Oracle T268/T269 revalidación D-1: auditoría iniciada
- Checkpoint WAL: diff src/tests = 8 archivos esperados; verificando app-config, pruebas nuevas, ajustes, compuertas y suite.

### [2026-11-13] Oracle revalidación D-1: T268 APTO, T269 APTO
- Medido: traza T268 3/3 y T269 1/1 CUMPLE, oraculos 0 debiles, tsc 0, 4 archivos 31/31, suite 94/1502 (0 nuevos). Veredictos: claude/veredicto-auditor-task-T269-D1-2026-11-13.md, ...T268-revalidacion-D1-2026-11-13.md

### [2026-11-13] Oracle T271/T272 FASE ROJA: auditoría
- Medido: 25 rojas/0 verdes (23 = 404 no declarado en contrato exportBackup, 1 = 404 previewBackupImport, 1 = GET heredado devuelve 200), tsc 0, oráculos 0 débiles, traza T271 5/5 y T272 3/3 CUMPLE, src/tests solo 2 archivos nuevos.
- Veredicto: APTO CONDICIONADO (H-T271-1..4, H-T272-1..2). Archivo: claude/veredicto-auditor-task-T271-T272-faseroja-2026-11-13.md

### [2026-11-13] Oracle Rebanada 5 FRENTE ROJO T271-T275: auditoría
- Medido: 83 nuevas rojas (19/38/26) + 52/14 backup-use-cases + 2 access-control + 12 preview, todas por funcionalidad ausente o heredado; tsc 0, oráculos 0 débiles, traza T271-T275 CUMPLE, src vacío, HEAD 45649fc.
- Hallazgo clave: execute(userId,{role}) no existe y rbac concede EXPORT_IMPORT_BACKUP a 4 roles: prueba de 403 inalcanzable (decisión de Neo). 2 de 3 rojas T271 enmascaradas por ERR-INTERNAL-UNEXPECTED.
- Veredicto: APTO CONDICIONADO (H-R5-1..6). Archivo: claude/veredicto-auditor-rebanada5-faseroja-2026-11-13.md

### [2026-11-13] Oracle Rebanada 5 FASE VERDE T276-T279: inicio de auditoría
- Alcance: diff sin commit sobre HEAD 37772a2; comparación de suite con worktree base; dictamen contradicciones A/B y BackupPage. Solo lectura.

### [2026-11-13] Oracle R5 FASE VERDE T276-T279: veredicto
- Medido: tsc 0; oráculos 102/0; traza T276-279 CUMPLE; suite base 208/1613 vs ahora 28/1656; regresiones 0; 26 heredadas idénticas + A + B. src dentro de lista; src/generated limpio.
- A: prevalece T272 (Lucía), enmendar prueba T274. B: corregir prueba a SCHEMA-INVALID. BackupPage rota, no bloquea, deuda/T292.
- Veredicto: T276/T278/T279 APTO CONDICIONADO, T277 APTO. Archivo: claude/veredicto-auditor-rebanada5-faseverde-2026-11-13.md

### [2026-11-13] Oracle R5 ENMIENDAS H-A-2/H-B-1/I: inicio de auditoría
- Alcance: diff sin commit sobre 37772a2; dictamen D1 (colisiones 5/5) y D2 (Web Crypto). Solo lectura.

### [2026-11-13] Oracle R5 enmiendas H-A-2/H-B-1/I: veredicto
- Medido: tsc 0; oráculos 103/0; traza T271-279 CUMPLE; 3 archivos 66/66; respaldo 265/265; presentación 11 fallos, todos heredados (base 11 idénticos). D1 y D2 aceptar. H-E-1, H-E-2 menores.
- Veredicto: H-A-2 APTO, H-B-1 APTO, I APTO CONDICIONADO. Archivo: claude/veredicto-auditor-rebanada5-enmiendas-2026-11-13.md

### [2026-11-13] Oracle R5 cierre (T280, T281, H-1, compuertas T282): INICIO
- Alcance: backup-chaos.security.spec.ts + backup-chaos-child.ts (T280), rebanada-5-rama.md (T281), access-control H-1, compuertas de cierre R5 sin test:gate. Solo lectura; mutación H-1 en copia de trabajo.

### [2026-11-13] Oracle R5 cierre: veredicto
- Medido: chaos 10/10 x3; T281 4 archivos 76/76; respaldo 12 archivos 275/275; tsc 0; oráculos 105/0; traza T271-281 11/11; vitest completo 26 fallos heredados, ninguno de respaldo. Mutación H-1 en copia: roja; control 13/13.
- Veredicto: T280 APTO; T281 APTO CONDICIONADO (H-R-1 cita desfasada :100 -> :106; H-1 ya liquidada); H-1 APTO; compuertas R5 CUMPLE. Archivo: claude/veredicto-auditor-rebanada5-cierre-2026-11-13.md

### 2026-11-14 — Oracle: auditoría del rediseño visual. APTO CONDICIONADO. Sin cambios de código ni de Git.
- Alcance, exports, atributos semánticos, [FIX B-1], blur, typecheck, build, Vitest (idéntico por archivo), E2E (mismos 23/2), axe en vivo (0), 31 pares de contraste (0 fallos).
- Condición: la suite E2E del repo no ejecuta sus pruebas axe por seed 'DOG' (wcag.spec.ts:29) y el usuario duplicado (pet-dashboard.spec.ts). Requiere autorización para corregir la suite.

### 2026-11-14 — Oracle: auditoría de ui_blueprint.md v2.0 + ui_maqueta_v2.html. NO APTO (corregible, 1 rebote a Sati).
- Compuertas: (1) cobertura NO CUMPLE (riel pierde datos [UI] de tarjeta); (2) contraste y blur CUMPLEN (blur 0 en <640, 1 en >=640; reserva: activo solo por relleno lima 1.25:1); (3) E2E en riesgo/roto (pet-dashboard.spec.ts:112, D2 en :63-68/:82-87, rebanada6 grilla 1/2/3); (4) cero métricas inventadas, con D3 sin declarar como excepción.
- Maqueta: id duplicado en <main> (pet-panel inexistente), axe aria-valid-attr-value critical (corrida propia, solo maqueta). E2E y axe del repo NO ejecutados.
- Veredicto: claude/veredicto-auditor-blueprint-v2.md (11 hallazgos H-BP2-1..11). src/, tests/ y contratos intactos; logos.json no tocado.

### 2026-11-14 — Oracle: reauditoría única de ui_blueprint.md v2.1 + maquetas v2 y cuenta. APTO CONDICIONADO.
- Verificado en disco y Chromium (320/639/640/768/1024/1280): H-BP2-1,2,3,5,6,7 corregidos; 0 ids duplicados; pet-panel dentro de main; axe 0 violaciones; blur 0/<640 y 1/>=640; 1 "Nueva mascota"; contraste 41 pares OK (disabled exento).
- /cuenta: todos los controles con endpoint (identity.schema.json, /account/*, /backup/export); sin Dead UI ni métricas.
- Tabla de peso a 320 px: desborda su región (313 en 220) con scroll interno; página sin scroll horizontal: cumple la regla.
- Elevado a Neo: H-BP2-12 enlace "Perfil" directo vs menú de avatar de REQ-UI2-001/T287 (decisión 7 no lo cubre). Bajos: H-BP2-13 (Apéndice A), H-BP2-14 asterisco, H-BP2-15.
- Veredicto: claude/veredicto-auditor-blueprint-v2-reauditoria.md. src/, tests/, specs/, contratos y logos.json intactos.

### 2026-11-14 — Oracle: auditoría Rebanada 6 (T284-T293). APTO CONDICIONADO.
- Ejecutado en disco: tsc 0; vitest 26 fallos/1660 ok (= línea base 12+14, sin fallo nuevo); verify-oracles CUMPLE (111 archivos, 0 débiles); traza --feature 002 117/118 (INV-HOUSE-001 ajeno) y T284..T293 CUMPLE una a una; Playwright suite completa 52/52; sonda propia 320/639/640/1280 en /, /households, /backup, /cuenta: blur 0/0/1/1, 0 ids duplicados, 0 desbordamiento, 1 "Nueva mascota" en /.
- H-K-1 validada (lista blanca de 2 archivos, sin peticiones en ellos); H-K-2 coherente, enmendar blueprint §4.3 l.346 y §4.6 l.440; H-K-3 medio (ratificar); H-K-4 cumple T286, enmendar §5.2 l.481; H-K-5 sin UI muerta (ratificar); H-K-7/8 cumplen.
- Límite: test:gate no ejecutado. Veredicto: claude/veredicto-auditor-rebanada6-t284-t293.md. Sin tocar src/tests/specs/contratos/logos.json; sin commit.

### 2026-11-14 — Oracle: auditoría documental ui_blueprint v2.2 y tasks.md T287/T288. APTO CONDICIONADO.
- tasks.md: diff de exactamente 2 líneas (T287, T288); IDs, casillas y estados intactos. v2.1 archivada existe.
- Blueprint: enmiendas H-K-3/4/5 coherentes con RBAC (architecture_spec §4.1) y REQ-UI2-001. L388 (registro condicionado a editPetBasics) dictaminada ALTA: contradice REQ-RBAC-001/SC-008 y el código (PetDashboard.tsx:285, records.ts:140) y choca con L374 (Registrar peso).
- Medias: "Tres NavLink" con cuatro enlaces (L220), texto obsoleto L226/L240, escenarios obsoletos spec.md:154-155,361. Bajas: Apéndice C sin v2.2, disparador del aviso de sesión.
- Veredicto: claude/veredicto-auditor-documental-v22.md. Sin tocar src/tests/specs/contratos/logos.json; sin commit.

### 2026-11-14 — Oracle: reconfirmación documental v2.3 (H-V22-2/3/4/5). CUMPLE 4/4.
- Grep "Tres .NavLink" y "decisión 7" = 0; L220 "Cuatro NavLink"; L31/L45/L226/L240 describen decisión cerrada.
- spec.md: diff de 4 líneas (L154, L155, L263, L361), coherente con T287. Apéndice C ordenado con v2.2 y v2.3; bloque E de §8 lista "Perfil".
- Nueva menor N-1: ui_blueprint.md:201 esquema ASCII sin "Perfil". Veredicto: claude/veredicto-auditor-documental-v22-reconfirmacion.md. Sin commits.

### 2026-11-14 — Oracle: fallos test:gate T296, línea base vs actual
- Worktree ff0fe62 vs proyecto, tests/unit/presentation + tests/integration/presentation: 12 fallos en ambos; 12/12 HEREDADOS, 0 NUEVOS (incl. web-client REQ-UI-007).
- Reserva: línea base ya incluye la presentación 002 commiteada; 14 fallos restantes del gate sin comparar. Veredicto: claude/veredicto-auditor-fallos-gate-t296.md. Sin commits; worktree eliminado.
- 2026-11-14 Oracle: comparados los 14 restantes del gate T296 contra ff0fe62 (worktree limpio, retirado): 14/14 HEREDADOS, 0 NUEVOS; veredicto CUMPLE con excepción B-11. Detalle en claude/veredicto-auditor-fallos-gate-t296.md.

### 2026-11-14 — Oracle: auditoría ui_blueprint v2.5 + arreglos D1-D3 (T295)
- §5.3 coincide con REQ-UI2-007; subcampos de ImportPreviewResult verificados contra schema y types generados (0 inventados). tsc 0; vitest presentación 11 fallos = ítems 1-11 heredados; axe 14/14 con puertos 3210/5210 (sin residuos).
- Hallazgos: H-V25-1 ALTA (D1 order-* rompe foco=visual, 2.4.3); H-V25-5 MEDIA (nav con scroll a 320 px); H-V25-6 MEDIA (insignias sin palabra); H-V25-4/2/3 BAJAS (Revertida con UNKNOWN; D4 y D8 mal justificadas, snap-x = proximity).
- Veredicto APTO CONDICIONADO: claude/veredicto-auditor-pieza-t295-v25.md. Decisiones para Neo: conflicto §3.6 vs REQ-UI2-007 y nav a 320 px. Sin commits.

### 2026-11-14 — Oracle: reconfirmación final T295
- Medido en Chromium (320/768/1024/1280): orden visual = DOM (wordmark, nav, cuenta), 0 clases order-* en la cabecera; nav scrollWidth = clientWidth (256 a 320 px, 533 en el resto), 4 enlaces operables; palabras "hogares"/"invitaciones" visibles en todos los anchos; Tab: Mascotas, Hogares, Respaldo, Perfil, Cerrar sesión.
- BackupPage:168 "Revertida" solo con ROLLED_BACK; stalled quita aria-current. D4 (styles.css:21, línea citada 20) y D8 (corePlugins:1500-1509) correctas. D-N1 sin campos inventados frente a ImportPreviewResult, REQ-UI2-007 y backup-import.machine.json.
- Gates: tsc 0; vitest presentación 11/11 heredados; axe 14/14 (3230/5230, sin residuos). Veredicto APTO; cabecera de 260 px a 320 px = decisión de producto para Neo. Sin commits.

### 2026-11-14 — Oracle: auditoría Fase 8 ola 1 (T297-T301) y V12
- Leídos los 6 specs y el diff de app-config.ts; verify-oracles 0 débiles; tsc 0; security 264/264; presentación+scrypt 12 fallos heredados (11+1).
- V12: mensaje sin valor, sin secretos nuevos (huella SHA-256), NODE_ENV=test intacto, validaciones previas intactas.
- Latencia de invitación: aceptable (5/5 verdes), límite documentado. D1 (renovación con 4xx) escalada a Neo. Detalle en claude/veredicto-auditor-fase8-ola1.md.

### 2026-11-14 — Oracle: auditoría T302, T303, T304, T311 (antes de dictaminar)
- Medido en disco: security 267/267 (13 archivos); vitest completo 1792/1792 (90 archivos); tsc 0; traceability 118/118 CUMPLE; verify-oracles 0 débiles.
- Mutación: score 88.98, EXIT=0, 1172 pruebas en dry-run, stryker.conf.json sin diff contra HEAD, sin exclusiones en config.
- Tabla 001: 14 «sustituida» y 22 «pendiente» (regla 6 exige todas); T311: ruta DELETE servida, NOT_YET_SERVED vacío.
- Veredictos: T302 CUMPLE CON RESERVAS, T303 CUMPLE, T304 NO CUMPLE, T311 CUMPLE CON RESERVAS. Detalle en claude/veredicto-oracle-T302-T311-2026-11-14.md. Sin commits, sin marcar tareas.

### 2026-11-14 — Oracle: revalidación T304 (tabla 001)
- Tabla: 36 filas «sustituida», 0 «pendiente» (3 apariciones de la palabra son prosa en filas 26/33 y nota de huecos). Archivos de filas 4, 20 y 22 existen y contienen las pruebas.
- Medido: playwright fila 20 aislado 22/22; security 271/271 (13 archivos); tsc 0; traceability 118/118 CUMPLE; verify-oracles 0 débiles.
- tasks.md: T302, T303, T311 en [x]; T304 en [ ]. Veredicto T304 CUMPLE. Detalle en claude/veredicto-oracle-T304-revalidacion-2026-11-14.md. Sin commits.
