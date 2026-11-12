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
