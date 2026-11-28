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

### 2026-11-14 — Oracle: veredicto formal T310 (feature 002)
- Medido: tasks 106 [x]/6 [ ] (T305-T310); verify-oracles EXIT=0 (0 débiles); traceability 002 EXIT=0 (118/118); tsc EXIT=0; evidencia T309 coincide.
- T308 repetición 7/7 PASA; mapa-sc-002 existe pero no refleja la aceptación de Neo sobre SC-002 (R-1). Vite: ports excluido, umbral 95.
- Git HEAD 11637e0, sin commitear código de presentación (R-2). Veredicto CUMPLE CON RESERVAS: claude/veredicto-oracle-T310-feature-002-2026-11-14.md. Sin commits ni marcas.

## 2026-11-15 Oracle — Auditoria feature 003
- Verificado en disco: 5 gates presentes, 96 IDs 1:1, 81 tareas, 0 [x], DRAFT, D-17..D-28 RESUELTAS, REQ-CICD-012 ok.
- Repo sin commits 003, src/tests/terraform/.github sin cambios. Veredicto CUMPLE CON RESERVAS (R1..R5): .specify/memory/audits/oracle-003-veredicto.md. Sin ediciones de spec, sin commit.

## 2026-11-18 Oracle — Auditoría diseño feature 006
- Verificado en disco: IDs 36 REQ/19 INV/33 EDGE/96 SC/4 NFR/12 RR/17 D6/12 N2 citados=definidos; 13 operaciones OpenAPI, 7 ERR-SCENE; ajv compila scene y scene-payload (falla con strictTypes:true).
- 001..005, terraform, scripts, .github, constitución sin cambios; 0 N2 aplicadas. Observaciones: OBS-5 (hash de idempotencia sin `action` en data-model), OBS-3 (cuota 1 GiB foto), OBS-1 strictTypes.
- H-MIF-006-03 no resuelto: EDGE-ESC6-016 y REQ-034 requieren historial de 24 h; no recomendar columnas. Informe: .specify/memory/audits/oracle-006-diseno.md. Sin commit.

## 2026-11-18 Oracle — Auditoría tasks.md 006 (post N2-01..12)
- Verificado en disco: 196/196 IDs con tarea (36 REQ, 19 INV, 33 EDGE, 96 SC, 4 NFR, STATE, 7 ERR); 85 tareas, 0 ciclos, 0 [x]; OpenAPI 13 ops; 4 JSON parsean.
- Colisión T601..T617 (004) y T700..T798 (005): no rompe verify-traceability (--task lee solo tasks.md de la feature); OBS-1 convención. OBS-2 T639 depende de T672. Sin cambios fuera de specs/006 por la asentación.
- Veredicto PASS CON OBSERVACIONES. Informe: .specify/memory/audits/oracle-006-tasks.md. Sin commit.

## 2026-11-18 — Auditoria 006 Fase 1 (T801..T807, N2-08)
- Verificados 10 commits: solo rutas permitidas; sin src/ de producto, .tf, specs ni constitution; lock intacto; pin T778 documentado.
- TDD en orden; sin it() borrado ni expect aflojado (3 lineas eliminadas, todas justificadas). Gates en vivo CUMPLE; tsc 0; 643 pruebas verdes.
- R-LINK-006-3 confirmado en spec/plan/Dockerfile (no en codigo: aun inexistente). Veredicto PASS CON OBSERVACIONES. Informe: .specify/memory/audits/oracle-006-fase1.md. Sin commit.

## 2026-11-18 — Auditoria 006 Fase 2 (T809..T823, N2-05/N2-06)
- 14 commits verificados: specs 003/004 solo las 6 enmiendas aprobadas; schema 3.2.0 +3 enums (OBS supersedes 1.0.0->3.1.0); api/002 intactos; migraciones solo audit_log, 17=17.
- Terraform conforme (14 APIs, IAM minimo, cola 1/2/1, 120s/1Gi, 22500); sin rastro de terraform/bootstrap. Pruebas 001..005 ajustadas sin aflojar.
- vitest 23 failed (T813 x5, T815 x18) | 4045 passed; tsc 0; gates CUMPLE. PASS CON OBSERVACIONES. Informe: .specify/memory/audits/oracle-006-fase2.md. Sin commit.

## 2026-11-18 — Auditoria 006 Fase 3 (T826..T830, H-KEY-F3-2)
- 5 commits verificados (398504c..648232f). Alcance conforme; extra aceptable: 3 lineas de persistence/* (T828). Pureza grep limpia.
- Pruebas 003/004: solo fixture (PROD_SCENE/loadAppConfigActivated); audit-secret.security pasa a staging+rechazo production sin perder aserciones de no filtracion. Bloqueo production=N2-10 intencional. H-KEY-F3-2 = (A) con observacion para T885.
- tsc 0; trazabilidad 001/002/006 y oraculos 006 CUMPLE; vitest 23 failed (T813 x5, T815 x18) | 4139 passed. PASS CON OBSERVACIONES. Informe: .specify/memory/audits/oracle-006-fase3.md. Sin commit.

## 2026-11-18 Oracle auditoria 006 Fase 4 (T831..T836, T814)
- Verifique en disco 7 commits, paridad 0013/0009 identica (salvo STRICT), PG real postgres:17 reproducido (119 verdes en 5 suites; suite completa 4389 verdes, solo T815 x18), tsc 0, gates CUMPLE.
- H-KEY-F4-1 CONFIRMADO: 3 columnas sin FK sobreviven al paso 3 del runbook (brecha B10 de 002, media-baja); correccion minima: purga en runbook + incluirlas en referencias_restantes. cuota N2-06 (c) cuadra.
- T825 parte /oracle: CERRABLE (reservas: T824 humano, H-KEY-F4-1); firma /merovingian pendiente. Informe .specify/memory/audits/oracle-006-fase4.md

## 2026-11-18 Oracle — Auditoría Fase 5 lote 1 (T837..T850, T862..T868)
- Verificado: pureza dominio/aplicación 0 hallazgos; 6 reglas del puerto OK; 7 casos de uso cableados en orden del puerto; backup relanza el fallo (backup-use-cases:580); D6-09 DELETE antes de UPDATE coincide con data-model §5.
- Compuertas: tsc 0; traceability 001/002/006 CUMPLE; oracles 0 débiles; vitest 4387 verdes/190 omitidas (2 de 3 corridas); 1 corrida con rojo de tiempos t591R-2 (004), aislado 2/2 verde.
- SC sin prueba: 027 (T859 pendiente), 042 (diferida a T885). Veredicto PASS CON OBSERVACIONES: .specify/memory/audits/oracle-006-fase5-lote1.md. Sin commit.

## 2026-11-18 Oracle: auditoria Fase 5 lote 2 (92c2b00 + T851..T861)
- tsc 0; traceability 001/002/006 CUMPLE; oracles 006 CUMPLE (0 debiles); vitest 4503 pasan, 201 omitidos (sin PG), 0 rojos; T591R-2 no fallo (TECHDEBT-005-01).
- Veredicto PASS CON OBSERVACIONES: pureza, idempotencia, orden T1, encolado, worker, foto, consentimiento y auditoria conformes; PG real no verificado por Oracle; 5 observaciones del implementador no bloquean T870 (la 4 bloquea rutas T871+).
- Informe: .specify/memory/audits/oracle-006-fase5-lote2.md
- 2026-11-18 Oracle: auditoria Fase 5 lote 3 (504c4f7+e35be0c+ac55662). tsc 0; traceability 001/002/006 y oracles 006 CUMPLE; vitest con PG real 4714 pasan, 1 omitido, 1 rojo T591R-2 (flaky 004).
- Herencia de fuentes en incremental: CORRECTO (REQ-ESC6-025; en spec.md linea 174, data-model 2.3, plan 93). F5-5/6/7 conformes; pureza t826 verde.
- Veredicto PASS CON OBSERVACIONES. Informe: .specify/memory/audits/oracle-006-fase5-lote3.md

## 2026-11-18 Oracle: auditoria Fase 6 de la 006 (T869..T874; bfff91f..0cf0e64) = PASS CON OBSERVACIONES
- Verificado en disco: OIDC cruzada por ruta (jose acotado, correo exacto, identidad antes del cuerpo), 12 rutas /api contra OpenAPI, despachador Cloud Tasks solo con dobles, composicion real negada, SCENE_REAL_DRIVER_ACTIVATED=false.
- Compuertas: tsc 0; trazabilidad 001/002/006 CUMPLE; oracles 006 CUMPLE; scan-secrets 0; vitest PG real 305 archivos, 4813 pasan, 1 omitida, 0 rojos.
- Hallazgo tEXt (prompt en PNG eco): NO BLOQUEANTE para Fase 6, BLOQUEANTE para T885 (lista blanca de chunks conservando caBX y iTXt XMP). Informe: .specify/memory/audits/oracle-006-fase6.md

## 2026-11-18 Oracle: auditoria Fase 7 (T875..T878) + Parte A de Fase 6 (6e1fba4, 8f2dd6e, d210a04)
- Filtro de salida y 404 unificado verificados con prueba propia (tEXt+prompt, ancilares, critico, CRC, truncado, WebP) y con t855/t871; deriva de contrato 1 linea de comentario; catalogo y contratos 001..005 intactos.
- Gates: tsc 0; trazabilidad 001/002/006 CUMPLE; oracles CUMPLE; scan-secrets 0; vitest PG real 311 archivos, 4869 pasan, 1 omitida, 1 roja T591R-2. e2e wcag: 14/14 en d210a04 limpio; el timeout del arbol principal es por .stryker-tmp (OOM de Vite), no por 006.
- Veredicto PASS CON OBSERVACIONES; prototipo de /sati ausente = BLOQUEANTE para COMPLETED y activacion, no para seguir con tareas sin UI. Informe: .specify/memory/audits/oracle-006-fase7.md

## 2026-11-18 Oracle: cierre Fase 7 de la 006 (f30f472 + fe6727b)
- Correcciones H-S1..H-S5, H-S12 verificadas en codigo; t877 solo anade onReload. Foco real sin e2e: NO BLOQUEANTE con condicion (deuda e2e con consentimiento sembrado).
- Gates: tsc 0; trazabilidad 001/002/006 y oracles CUMPLE; scan-secrets 0; vitest PG real 312 archivos, 4881 pasan, 1 omitida, 0 rojas; wcag 14/14.
- Veredicto PASS CON OBSERVACIONES. Informe: .specify/memory/audits/oracle-006-fase7-cierre.md

## 2026-11-18 Oracle: auditoria Fase 8 de 006 (T883) -> PASS CON OBSERVACIONES
- Reejecute test:gate con postgres:17 propio: exit 0, 314 archivos, 4896 pasan/1 omitida/0 rojas; trazabilidad 002/003/006 CUMPLE, oraculos 363/0 debiles, sin deriva en src/generated; domain/scene 100 % lineas y funciones. Guarda del driver real, runbook y T885 (bloqueada, 7 condiciones abiertas) verificados en disco.
- Stryker: umbral break 85 intacto, pero reports/mutation/mutation.html es del 16-nov y no contiene domain/scene; 93,86/28 sobrevivientes solo constan en el log del Keymaker. Sobrevivientes NO BLOQUEANTES con condicion (/smith T882, endurecer inputs-snapshot y scene-payload y reejecutar con informe persistido antes de T885).
- Observaciones: deuda e2e del foco sin tarea en tasks.md; arbol con cambios ajenos a Fase 8 (constitution.md es Nivel 2). Informe: .specify/memory/audits/oracle-006-fase8.md

- 2026-11-18 20:30 | Oracle | Verificacion en disco de smith-006-cadena-intentos: ejecutado chaos con config temporal fuera del repo (12 tests, 3 rojos, 9 verdes). SMITH-01 CONFIRMADA ALTA (scene-lifecycle-hooks.ts:120-121; viola EDGE-ESC6-033/SC-ESC6-076/REQ-ESC6-011; spec exige el arrastre sin escena de propietario), SMITH-02 CONFIRMADA MEDIA (media-use-cases.ts:66-67; REQ-ESC6-029/SC-ESC6-044).
- 2026-11-18 20:30 | Oracle | SMITH-03 LATENTE BAJA (adaptador REST no emite codigos numericos, cloud-tasks-scene-dispatcher.adapter.ts:114-122). tsc 0; chaos fuera de test:gate. 01 y 02 bloquean driver real; 01 se sella antes de cerrar 006. Informe: .specify/memory/audits/oracle-006-smith-verificacion.md
- 2026-11-18 | Oracle | Cierre SMITH-01/02 (3fef7b4): tsc 0, trazabilidad 001/002/006 y oraculos 006 CUMPLE, PG real 314 archivos 4900 pasan 1 omitida 0 rojos; chaos 5b y 7b verdes, 6b (SMITH-03) rojo = deuda. t858 FORTALECE. PASS CON OBSERVACIONES.
- 2026-11-18 | Oracle | Informe .specify/memory/audits/oracle-006-smith-cierre.md: SMITH-01 y SMITH-02 CERRADAS; SMITH-03 deuda BAJA (disparador: Cloud Tasks por gRPC). Quedan T883/T884 [GOV] y limpieza del arbol; T885 bloqueada.

### 2026-11-18 — Oracle T899: tramo gemini-api (T889..T898) PASS CON OBSERVACIONES
- Informe: .specify/memory/audits/oracle-006-gemini-api-t899.md. Traceability 006 CUMPLE (205/205), tsc 0, 8 archivos y 218 pruebas verdes; PG 17 real: 319 archivos, 4959 pasan, 1 omitida (evidencia del orquestador).
- Clave solo en cabecera x-goog-api-key; sin AIza en el repo; .env ignorado y no leído; producción rechaza fake y gemini-api; real bloqueado.
- Pendientes T900 [HUM] para Neo: fijar ARGOS_SCENE_GEMINI_MODEL, verificar responseModalities y límites inline, fuentes de términos de datos, firmar aviso, tope de 5 USD solo en consola.

## 2026-11-19 T910 [GOV] auditoría T901..T909 (fixes en vivo 006)
- Veredicto PASS CON OBSERVACIONES. Acta: specs/006-escena-hogar-pixel-art/audits/oracle-006-fixes-en-vivo-t910.md.
- Tareas T901..T910 todas `[ ]`; sin marcas indebidas. decide-mode, package.json, lock, generated, scan-secrets.mjs sin diff.
- argos-scan:allow en 4 tests: legítimo (clave sintética, solo tests/, mecanismo documentado, prueba negativa en src/ OK, scan repo 0 hallazgos). Requiere reconocimiento de Neo.
- Compuertas: traza 006 CUMPLE, oráculos 0 débiles, tsc 0, test:gate PG17 rc0 (320 archivos, 4974 pasan, 1 omitida); T591R-2 pasó con load1 ≈ 4 (no reposo absoluto; frágil bajo carga).
- Observaciones: OBS-3 SC-106 vs SC-105 redacción "byte a byte". Sin commit ni cambios de código.

## 2026-11-19 T923 [GOV] auditoría Fase 11 (T911..T922) -> PASS CON OBSERVACIONES
- Acta: specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-t923.md. Tareas T901..T909 [x], T910..T923 [ ]; contrato 1.1.0 y v34 recompilado; OpenAPI 3.4.0.
- Redacté el literal centinela en oracle-006-fixes-en-vivo-t910.md:22; scan-secrets repo 0 hallazgos.
- Compuertas: traza 006 CUMPLE (221/221), oráculos 0 débiles, tsc 0, test:gate PG17 rc0, 323 archivos, 5022 pasan, 1 omitida; T591R-2 pasó (máquina no en reposo absoluto).
- Decisiones para Neo: PET_COUNT_RULE, OpenAPI 3.4.0 vs 3.5.0, T904 editada en [x], T591R-2, firma COMPLETED. Sin commit ni cambios de código.

## 2026-11-19 T934 [GOV] auditoria Fase 12 (T924..T933) -> PASS CON OBSERVACIONES
- Acta: specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-t934.md. T924..T934, T910, T923 [ ]; T911..T922 [x]. Decisiones D6-20 y N2-16 B+C verificadas en codigo; change_note solo prosa; generated/package/lock sin diff.
- Compuertas: traza 006 CUMPLE, oraculos 0 debiles, tsc 0, test:gate PG17 rc0 (324 archivos, 5068 pasan, 1 omitida), scan-secrets 0.
- OBS-1: SC-ESC6-124 sin prueba etiquetada. Pregunta de keymaker (KEEP ausente = degraded) para Neo: recomendado mantener. Sin commit ni cambios de codigo.

## 2026-11-19 Revalidacion Fase 12 (SC-ESC6-124)
- Prueba t855:509 verificada (aserciones exactas, decision A). src/ y schema sin cambios desde mi acta (mtime, diff 6 archivos).
- Gates: traza 233/233 CUMPLE; oraculos 374/0 debiles; tsc 0; test:gate PG17 rc0, 324 archivos, 5069 pasan/1 omitida/0 rojas; scan 0.
- Veredicto PASS CON OBS (OBS-1 cerrada). Acta: specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-t934-revalidacion.md

## 2026-11-19 T942 [GOV] auditoria Fase 13 (T935..T940, T942) -> PASS CON OBSERVACIONES
- Acta: specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-t942.md. T935..T943, T910, T923, T934 [ ]; T911..T933 [x]. Contratos y generated sin diff; decide-mode/scene-spec intactos.
- Boton unico, frase de inspiracion y conteo por especie verificados en codigo; t931 eliminado coherente (SC-128..130 SUSTITUIDA, aserciones en t936).
- Gates: traza 006 CUMPLE 241/241, oraculos 376/0 debiles, tsc 0, test:gate PG17 rc0 (326 archivos, 5114 pasan, 1 omitida), scan 0. Maquina no en reposo (load 13..34); T591R-2 paso.
- OBS: t938 en memoria (sin PG17), N2-16 stale en spec, T941/N2-17 pendiente. Sin commit ni cambios de codigo.

## 2026-11-19 | Auditoria final cierre Fase 13 (006)
PASS CON OBS. Traza 241/241 rc0, oraculos 0 debiles, tsc 0, test:gate PG17 rc0 (326 archivos, 5122 pasan, 1 omitida), scan 0. Contratos 1.1.1/3.4.0 solo prosa; frase hogar y contador a 0 en disco; sin aria-live nuevo. Acta: specs/006-escena-hogar-pixel-art/audits/oracle-006-fase-cierre-final.md.

## 2026-11-20 Oracle: auditoria Fase 14 (006, T944..T952)
- Veredicto PASS CON OBS; acta .specify/memory/audits/oracle-006-fase14.md. Gate PG17 real rc 0 (5281 pasan, 1 omitida). H-F14-1..6 clasificados. Sin [x], sin commit.

## 2026-11-20 Oracle: Fase 14 cierre final (006)
- Revalide en disco: gate PG17 rc 0 (5289 pasan), tsc 0, traza CUMPLE, oraculos 0 debiles, scan 0; T885 sigue [ ]. Veredicto PASS CON OBS (H-CF-1 decision Neo). Acta .specify/memory/audits/oracle-006-fase14-cierre-final.md.

## 2026-11-19 | Auditoria forense 007 Bloque C + semilla (e0764a9, b1e5ab4, 83c2f5d, 351bf9a) en worktree argos-007
- Contratos/generated: src/generated recompilado con compile-contracts (002/004/005/006) y diff -r IDENTICO; contracts/** solo en e0764a9; tasks.md 007 sin [x] nuevos (5 antes, 5 despues); sin APPROVED/LOCKED.
- Gates: tsc 0; vitest unit+integration+security rc0, 332 archivos pasan/3 omitidos, 5212 pasan/203 omitidas/0 rojas (PG sin motor: SQL Postgres 0010 y upsert $12 NO ejercitados); oraculos 395/0 debiles; traza 007 FALLA 31/53 (22 FAIL; REQ-FAL7-004..008 solo con ID en describe, no en it).
- Decisiones del Keymaker verificadas en codigo (version solo columna, auditPetView sin version, export 3.2.0, import version+1, lockPet 1a operacion). Trailer Co-Authored-By dice "Claude Haiku 5.5" en los 4 commits. Veredicto: PASS CON OBS x4. Sin commit, sin [x].

## 2026-11-19 | Auditoria acotada c308614 (007, worktree argos-007): IDs REQ-FAL7 en titulos + no-retroceso de version
- Solo 4 tests/unit/*.spec.ts; sin diff en src/, contracts/, src/generated/ ni tasks.md. Titulos de it() con solo prefijo de texto; 0 aserciones tocadas. Prueba nueva con oraculos reales (7->8, version==prior+1, no-retroceso). Mapeo REQ-FAL7-008 valido (WRITE_PET: 403/404).
- Gates: tsc 0; vitest 4 archivos 114 pasan; oraculos 395/0 debiles; traza 007 FALLA 36/53 (17 FAIL, antes 31/53). Trailer sigue "Claude Haiku 5.5".
- Veredicto PASS CON OBS. Sin commit ni [x].

## 2026-11-19 | Auditoria forense 007 lote ab8aa2c..6e7f0a3 (7 commits, worktree argos-007, HEAD 6e7f0a3)
- Alcance: 28 archivos src/ y tests/; sin diff en contracts/**, src/generated/** ni specs/**/tasks.md (los 3 archivos tests/integration/contracts/* son pruebas). Autor Andres Vallejo; trailer sigue "Claude Haiku 5.5" en los 7.
- Oraculos nuevos (t1022 x2, t1026, t1027, E2E T1029) con aserciones de valor exacto; sin vacias. t778 relajado de igualdad exacta a MAJOR + const summaryVersion del esquema: justificado (MINOR 1.1.0 aditiva), obs: ya no detecta deriva MINOR. Correcciones E2E (deceasedAt '' al pasar a ALIVE, confirmed.current en onFormSubmit) presentes en PetForm.tsx:153/166-170.
- Gates: tsc 0; vitest unit+integration+security con PG17 55432 rc0 (339 archivos, 5442 pasan, 1 omitida); oraculos 400/0 debiles; traza 007 FALLA 47/53 (6 FAIL: ESC7-003..006, FEC7-006, REG7-003); Playwright estado-vida-007 7/7.
- Veredicto: PASS CON OBS x7 (sin FAIL). Sin commit, sin [x].

## 2026-11-19 | Auditoria acotada f070ba2 (007, worktree argos-007): segmentos de fecha a 320 px + formato ISO nacimiento
- Alcance exacto: DateField.tsx, PetCards.tsx, PetDashboard.tsx y fecha-segmentos-007.spec.ts; sin diff en contracts/**, src/generated/**, tasks.md. DateField: solo clases (grow/max-w/basis-0/min-w-0); logica, fieldset/legend, min-h-12 y ring-2 intactos. PetDashboard usa formatIsoDateEs (existe en view-model.ts:220); PetCards solo whitespace-nowrap.
- Gates: tsc 0; vitest tests/unit/presentation 53 archivos/556 pasan; Playwright chromium fecha-segmentos-007 9/9 (nueva prueba 320 px pasa); oraculos 400/0 debiles.
- OBS: no se re-ejecuto el stash; no se comprobo que la prueba nueva falle sin el arreglo (anchos viejos suman 240 px, podrian caber en el contenedor del formulario de peso); trailer sigue "Claude Haiku 5.5". Veredicto PASS CON OBS. Sin commit ni [x].

## 2026-11-19 | Auditoria forense 007 lote de cierre a63e285..94e0865 (7 commits, worktree argos-007, HEAD 94e0865)
- Alcance: 46 archivos; sin diff en contracts/**, src/generated/** ni [x] en tasks.md. Autor Andres Vallejo; trailer sigue "Claude Haiku 5.5" en los 7.
- Migraciones 0015/0011: CHECK IN (0,1), NOT NULL DEFAULT 0, paridad (PG con NOT VALID+VALIDATE); sin UPDATE sobre include_deceased_at. Gate deceasedAt solo con includeDeceasedAt===true && DECEASED; sameCreation incluye el flag (422 probado t1026:105). EXCLUDED_BY_DECISION solo feature 007 con motivo (REG7-003, FEC7-006); ESC7-003..006 NO excluidos (siguen FAIL).
- Gates: tsc 0; vitest unit+integration+security con PG17 55432: 344 archivos, 5474 pasan, 1 omitida, 0 rojas; oraculos 405/0 debiles; traza 007 FALLA 47/51 (solo ESC7-003..006); verify-ci-ready LISTO rc0 (semgrep ausente: estatico).
- Veredicto PASS CON OBS x7. Sin commit ni [x].

## 2026-11-20 Oracle: T1077 auditoria Bloque G (19af111, 4b2f206)
- PASS / PASS CON OBS; tsc 0, vitest 5319 ok, oraculos 0 debiles, traza 51/51. Acta .specify/memory/audits/oracle-t1077-bloque-g.md. OBS: tasks.md del worktree con cambios sin commit.

## 2026-11-20 Oracle: auditoria lote Architect 008 (c8e59e7, 86fad83, cebdf9f)
- c8e59e7 solo constitution.md; 86fad83 solo contratos 002/004/006 + src/generated; cebdf9f sin src/tests. Constitucion 3.8.0 coherente (jose 6.2.17 solo google-oidc-verify.ts; argos_oauth Lax 900 s; argos_session Strict); sin APPROVED/LOCKED.
- compile 002/004/005/006 rc 0, sin deriva en src; oraculos 412/0 debiles; tsc 0. 0 [x]; 64 abiertas + 36 diferidas sin casilla. Sin /api/admin ni PENDING. Veredicto PASS CON OBS x3. Acta .specify/memory/audits/oracle-008-contratos.md. Sin commit.

## 2026-11-20 Oracle: auditoria 008 rebanada 1 (82127e2, 30af1b8, c4a8c98)
- PASS CON OBS / PASS / PASS CON OBS. vitest 76 archivos 1185 ok, tsc 0, oraculos 0 debiles, traza 002 124/124, 008 38/87 (esperado; UX8-002 trazado). Acta .specify/memory/audits/oracle-008-rebanada1.md. Sin commit ni [x].
- 2026-11-20 Oracle: acta d48524f T1168 servidor PASS CON OBS (190 ok, tsc 0, oraculos 0 debiles). .specify/memory/audits/oracle-008-d48524f.md

## 2026-11-20 oracle 008 bloques K e I
Veredicto PASS CON OBS (238a89b, 52c0065). 57 passed/1 skipped en suites propias, tsc rc 0, verify-oracles CUMPLE, trazabilidad ROL8/BIO8 OK. Acta en .specify/memory/audits/oracle-008-bloques-K-I.md. Pendiente Caso B: ayuda del Administrador.

## 2026-11-21 Oracle: auditoria 008 Bloque J (3bf26bd, 548ecb7)
- 3bf26bd PASS (contador por puntos de codigo, borde 280/281 emojis). 548ecb7 PASS CON OBS x6 (H-J-1..6: 422/403 sin espia de lecturas, PG real no ejercitado, IP solo en unidad, limiter por instancia, UI obsoleta 300 ms).
- Gates propios: tsc 0; oraculos 426/0 debiles; traza 008 52/87 con pureza 0; vitest 7 archivos 69 ok. Acta .specify/memory/audits/oracle-008-bloque-J.md. Sin commit ni [x].

## 2026-11-21 Oracle: auditoria parche Bloque J (b0d5a88, 4e0108e)
- b0d5a88 PASS (6 mutaciones M1..M6b en copia scratchpad, todas detectadas; cierra H-J-1, H-J-3, H-J-4). 4e0108e PASS CON OBS (OBS-3..6: sin 202 explicito, esperas 600/400 ms, solo Chromium y 4 de los casos de T1192). Deuda H-K-1 debounce documentada, sin arreglar.
- Gates: tsc 0; t1188 api 11/11; Playwright chromium 4/4 (3200/5273 libres); oraculos 427/0 debiles; traza 008 52/87 pureza 0. Acta .specify/memory/audits/oracle-008-bloque-J-parche.md. Sin commit ni [x].

## 2026-11-21 Oracle: auditoria d320b1d (T1192 sin coincidencias y limite de tasa)
- Solo tests/e2e/visual/invitee-autocomplete-008.spec.ts; playwright.config.ts fuera del commit. tsc 0; Playwright chromium 6/6; oraculos 427/0 debiles. Cupo agotado por bucle hasta 429 (no depende del orden); aviso visible y status verificados por separado; sin esperas nuevas.
- Veredicto PASS CON OBS (H-T1192-1..4: locators por clase, status vacio en sin-coincidencias, 'lim' sin conteo, Firefox/WebKit no instalados -> pendiente de Neo). OBS-6 cerrado en Chromium. Acta .specify/memory/audits/oracle-008-T1192-d320b1d.md. Sin commit ni [x].

## 2026-11-21 Oracle: auditoria b3922ba (H-T1192-2 status sin coincidencias)
- PASS CON OBS: InviteeCombobox.tsx:99 anuncia D8-11, `<p>` visible sin role; rate-limited/failed intactos. Mutacion en scratchpad cae 1/8 solo la prueba nueva. tsc 0; t1191 8/8; Playwright chromium 6/6; oraculos 427/0 debiles.
- OBS: log-keymaker +71 lineas de entradas 007 mezcladas en commit de codigo (no viola reglas). Acta .specify/memory/audits/oracle-008-b3922ba.md. Sin commit ni [x].

## 2026-11-21 Oracle: auditoria 200d9ac (T1192 multi-navegador + PG17)
- 200d9ac PASS: prefijos por proyecto y espera por condicion no aflojan oraculos; cubeta U:/I: del limiter coincide con su doc. E2E reproducido 18/18 (Chromium, Firefox, WebKit 6/6). tsc 0; oraculos 427/0 debiles.
- part1 usa cliente doble, no PG real. postgres-repositories.spec.ts con PG real: caso de prefijo pasa, pero 28/41 rojas por BASELINE sin 0012 (biography) en spec:20 (origen 52c0065). H-J-2 NO cerrado. playwright.config.ts sin commitear.
- Veredicto PASS CON OBS; T1192 a REVIEW en 3 navegadores. Acta .specify/memory/audits/oracle-008-200d9ac.md. Sin commit ni [x].

## 2026-11-21 Oracle: re-auditoria H-J-2 (ef8ca23, 6965d52)
- PASS CON OBS. Helper lee las 12 migraciones en orden; PG_SHARE_SQL retirado sin perder cobertura (0007/0008/0011 dentro del esquema completo); 0 skip nuevos.
- Con PG real persistence+sharing 836 ok/1 skip/0 rojas (postgres-repositories 41/41); sin variable 645 ok/192 skip/0 rojas; tsc 0; oraculos 428/0 debiles.
- H-J-2 CERRADO. OBS: listas manuales sin 0012 en t834:385-389 y t862:184-188 (latentes). Acta .specify/memory/audits/oracle-008-H-J-2-reauditoria.md. Sin commit ni [x].

## 2026-11-21 Oracle: validacion forense T1193 (actas Trinity, Rama, Sentinels + prueba t1193)
- Trinity PASS CON OBS, Rama PASS (H-RAMA-008-J-01 ALTO CONFIRMADO: terraform/logging.tf:6-10 solo excluye /shared/, sin /invitees), Sentinels PASS CON OBS. Citas archivo:linea reales (solo rutas abreviadas y deriva de 1 linea).
- Prueba t1193 11/11, tests/security 424/424, tsc 0, oraculos 429/0 debiles, traza 113/113. src/ y terraform/ sin cambios.
- H-ORA-T1193-1 MEDIO: test XSS en username vacio (sin usuarios 'pedro' en createApi por defecto); -2 aserciones not.toBe(200)/[200,422]; -3 POST de fixture. T1193 no cerrable hasta mitigar H-RAMA-008-J-01. Acta .specify/memory/audits/oracle-008-T1193.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria c2d1b48 (T1193 sentinels con datos sembrados)
- H-ORA-T1193-1 y -2 CERRADOS: createApi(stateWith(EXTRA)), names.length>0 antes del for, 404 exacto (IDOR x2, INVITED), 200 exacto con items [] en __proto__/constructor/prototype (valido por InviteeSearchPrefix 680-686 y household-use-cases.ts:226; aserto aceptable).
- t1193 11/11; tests/security 424/424; tsc 0; oraculos 429/0 debiles. OBS BAJO H-ORA-T1193-5 (CSRF/brute solo comparan status). PASS CON OBS. Acta .specify/memory/audits/oracle-008-c2d1b48.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria 441a158 (exclusiones _Default J-01/J-02)
- PASS CON OBS: +24/-0 solo terraform/logging.tf, 2 exclusiones con patron identico a shared_token_requests; ruta real /api/households/:householdId/invitees, filtro "/invitees?q=" coincide (subcadena). fmt -check 0, validate OK (init -backend=false); sin plan/apply.
- Callback: exclusion de requestUrl no afecta logs de app (sin httpRequest); riesgo BAJO de perdida de estado HTTP de plataforma. Spec NFR-008-004/EDGE-008-044 a reformular (architect). Aplicacion pendiente de Neo.
- Acta .specify/memory/audits/oracle-008-441a158.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria forense lote A1 008 (877988b..9015ed0, T1112..T1117)
- PASS CON OBS: H-A1-1 (t1114 solo prueba alg none, no HS256), H-A1-2 (3e29017 arrastra chaos smith-006; causa del rojo de verify-ci-ready), H-A1-3 (aud arreglo sin azp), H-A1-4 (state/nonce/verifier/pending_email en claro 900 s; purga sin planificador). Sin ALTO/MEDIO.
- Gates: tsc 0; t1112/t1114/t869 57 ok; tests/security 428 ok; oraculos 434/0 debiles; traza 008 57/87 (faltantes de bloques posteriores), pureza 0; PG real persistence 804 ok/1 skip/0 rojas.
- password_hash NOT NULL vs SC-008-062: conflicto real, dos opciones (sentinela o relajar columna) sin decidir. Acta .specify/memory/audits/oracle-008-lote-A1.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria 020ede2 (T1124 Terraform Google OAuth)
- PASS CON OBS: secreto sin version/valor/tfvars; secretAccessor solo argos-run sobre el secreto; patron identico a los 3 existentes; variables validadas sin default; fmt/init/validate OK (sin plan/apply).
- H-ORA-1 MEDIO client id fuera de Secret Manager vs REQ-SSO8-007; H-ORA-2 falta viewer del deployer; H-ORA-3 infraestructura.yml sin TF_VAR_google_oauth_*; H-ORA-4 4 tests rojos (secret-manager:27, iam:36, iam-secrets:39, labels:44; solo cuentan 3 -> 4).
- Acta .specify/memory/audits/oracle-008-020ede2.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria 679df2a y 9cf93ea (viewer deployer, TF_VAR CI, conteos, HS256)
- 679df2a PASS CON OBS: viewer identico a los 3 existentes (viewer, solo ese secreto, deployer); 6 pasos con TF_VAR desde secrets, sin literales ni pasos de validacion tocados. H-ORA-2 y H-ORA-3 CERRADOS. OBS: validate-secrets.mjs no cubre GOOGLE_OAUTH_* (falla ruidosa del plan sin mensaje de guia).
- 9cf93ea PASS: conteos 3->4 son ampliaciones exactas (4 recursos reales); HS256 espera 'SIGNATURE' uniforme. H-ORA-4 y H-A1-1 CERRADOS. vitest 57/57, tsc 0, oraculos 434/0 debiles, fmt/init/validate OK.
- H-ORA-5 MEDIO: github-bootstrap-docs.spec.ts roja; SECRETOS (:15) y quickstart.md sin los 2 secretos nuevos; terraform/README.md ya modificado sin commitear. Stash: 2 previos (18-20 nov), ninguno de hoy. Acta .specify/memory/audits/oracle-008-679df2a-9cf93ea.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria cadena Bloque A 008 (bf5b4a7..ee8b1ab)
- PASS CON OBS global. bf5b4a7 (ADR-008-14 real; el mensaje dice 005: H-BA-1 BAJO), ad72062 (H-BA-2 sin prueba del cableado env:/guardia, H-BA-3), c153583 PASS, 3947dfa PASS (sin otras referencias), 891d66d PASS, ee8b1ab PASS CON OBS.
- Gates: tsc 0; unit 3073/3073; oraculos 433/0 debiles; verify-ci-ready LISTO; terraform validate OK, fmt 0. Sin secretos (solo ejemplo 000000000000-example). H-A1-2 y H-ORA-5 cerrados.
- Acta .specify/memory/audits/oracle-008-bloqueA-cadena.md. Bloque A apto para REVIEW. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria lote A2-1 008 (59d28fe, 15cb6d8; T1120, T1121)
- 59d28fe PASS; 15cb6d8 PASS CON OBS. Centinela: dummy con mismos N/r/p (medido real 26.97 ms, centinela 27.81 ms, razon 1.03); tolerancia de prueba 0.4x-3x demasiado amplia (H-A21-1 BAJO).
- Decision 1 (LINK emite sesion nueva + revokeOthers): conforme con obs; contradice "Set-Cookie solo caso 1" del contrato y no ata a la sesion origen (H-A21-2 MEDIO, architect). Decision 2: 500 declarado en contrato, conforme. Decision 3: constantes, sin cifras en contrato; NAT BAJO.
- H-A21-5 ALTO fuera de alcance: cuenta Google no puede borrar cuenta (DeleteAccount/ChangePassword exigen contrasena); decision de Neo. H-A21-7 trazabilidad REQ-VIN8-004.
- Gates: tsc 0; 58/58 lote; security 428; oraculos 0 debiles; PG real 804 ok; traza 59/87 (bloques posteriores). Acta .specify/memory/audits/oracle-008-A2-1.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: revalidacion 99b9cc7 (H-A21-1, H-A21-4 link, H-A21-7)
- PASS CON OBS: los tres hallazgos cerrados. Razon centinela/real 0.99-1.01 (3 corridas estables); mutantes sin dummy 0.00, N/2 0.489, r=4 0.491 fallan (copias temporales borradas). Unico cambio en src: etiqueta @implements REQ-VIN8-004. Prueba link usa GOOGLE_AUTH_LIMITS.link.maxPerWindow.
- OBS BAJO: solo 1 de 3 hashes basura se mide en coste (el resto solo false).
- Gates: tsc 0; lote 53/53; unit 3114; security 428; oraculos 438/0 debiles; traza 61/87 (esperado). Acta .specify/memory/audits/oracle-008-99b9cc7.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria lote vinculacion atada a sesion de origen 008 (0c0823f, 778f033, 341ba6c)
- 0c0823f PASS; 778f033 PASS CON OBS; 341ba6c PASS CON OBS. Callback LINK exige origen existente/mismo usuario/AUTHENTICATED sin renovar, revokeOthersByTokenHash conserva origen, LINKED sin token ni Set-Cookie; hashSessionToken == sessions.token_hash (SHA-256 hex). CHECKs en dos restricciones, mas estrictos que el dictamen (H-VO-1 BAJO doc).
- Riesgo 3.5 MEDIO residual aceptado por Neo, documentado en spec/tasks (DEUDA-008-GOOGLE-LINK-2STEP). Aviso de perfil conforme (authMethods ausente = con contrasena); H-VO-2/3/4 BAJOS (SC-008-013 inexistente en tasks T1129/T1134).
- Gates: tsc 0; unit 3124; security 428; oraculos 439/0 debiles; traza 008 62/88 (VIN8-002/004, INV-VIN8-005 trazados); PG real 807 ok/1 skip/0 rojas. Acta .specify/memory/audits/oracle-008-vinculacion-origen.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria T1122 y T1123 008 (5d79f42, c5583ce, 65e80e6)
- 5d79f42 PASS; c5583ce PASS CON OBS; 65e80e6 PASS CON OBS. Enlace a /api/auth/google/start sin datos, sin storage, /elige-usuario publica, POST con CSRF, mensajes del catalogo en role=alert; anti-enumeracion conforme a REQ-LOG-002 (ocupado solo con flujo vigente); harness sin red externa, sin esperas arbitrarias.
- H-T1122-2 MEDIO: el 400 del callback es problem+json por contrato (openapi 004 L148+); JSON crudo en pantalla; requiere decision architect/Neo. H-T1122-3 BAJO: 3 rojas de auth-pet-forms/medios-csp-wcag YA fallaban en e3dc7ca (worktree temporal, borrado); etiqueta quitada por 942fac0 (004 T550), no por c5583ce.
- Gates: tsc 0; unit 3135; security 428; oraculos 442/0 debiles; traza 62/88; E2E google 21/21 en 3 navegadores (puertos 3800/5873 por 3200 ocupado). Arbol avanzo durante la auditoria (8602971 + cambio sin commit).
- Acta .specify/memory/audits/oracle-008-T1122-T1123.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria 8602971 y 381dc48 (foco al campo en /elige-usuario, H-T1122-S1)
- 8602971 PASS CON OBS; 381dc48 PASS CON OBS. Cambio local (solo ChooseUsernamePage.tsx, +8; Field.tsx intacto); contador errorFocus dispara con error de cliente y de servidor (field=username), no con error de flujo; E2E rojo demostrado en worktree temporal (toBeFocused inactive), borrado.
- H-FOCO-1 BAJO-MEDIO: envio con Enter (foco ya en el input) no re-anuncia el error, sin prueba. H-FOCO-2 BAJO: cuerpo 409 simulado sin invariantRef (requerido por ProblemDetails).
- Gates: tsc 0; unit 3135; security 428; oraculos 442/0 debiles; E2E google 21/21 en 3 navegadores (puertos 3800/5873; 3200/5273 ocupados). H-T1122-S1 cerrado (flujo de clic).
- Acta .specify/memory/audits/oracle-008-foco-elige-usuario.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria cdc5baa y 9960495 (auth-pet-forms, 004 T550)
- cdc5baa PASS; 9960495 PASS. Solo localizadores (+3/-3 lineas), 0 aserciones quitadas, 0 skip/only/todo; DOG_PASTOR_ALEMAN CANINE no deprecated, especie por defecto CANINE, select Raza lee BREEDS. PetForm y medios-csp-wcag intactos.
- E2E por proyecto 7/7 en chromium, firefox y webkit (3200/5273). En una sola invocacion con 3 proyectos firefox/webkit fallan L40 y L103 por usernames fijos sobre BD compartida (H-AP-1 BAJO, no de los commits). tsc 0; oraculos 442/0 debiles.
- Acta .specify/memory/audits/oracle-008-auth-pet-forms-004.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria 3cfa52f, 46f6275, bac74a6 (H-FOCO-1/2)
- 3cfa52f PASS CON OBS; 46f6275 FAIL aislado (3 guardas rojas: presentation-architecture, session-client, ui-invitation-logs; HEAD 22/22 verdes); bac74a6 PASS CON OBS. 0 temporizadores en ChooseUsernamePage.tsx; Field.tsx intacto; 409 con invariantRef INV-AUTH-001 fiel al catalogo.
- H-FOCO-3 MEDIO-BAJO: vaciado y reposicion en el mismo frame en firefox/webkit (medido); en chromium 14 ms/otro frame; re-anuncio del mismo error no garantizado; patron React valido, tecnica fragil. Prueba E2E no demuestra lectura (H-F-2). H-FOCO-2 cerrado.
- Gates: tsc 0; unit 3135; security 428; oraculos 442/0 debiles; E2E 24/24 (3800/5873). Prueba roja en 9960495 (worktree borrado). Recomendado squash local 46f6275+bac74a6 (decide Neo). T1122/T1123 aptos para REVIEW.
- Acta .specify/memory/audits/oracle-008-H-FOCO.md. Sin commit ni [x]; bus central no tocado por orden.

## 2026-11-21 Oracle: auditoria T1125/T1126 008 (3 archivos nuevos sin commit; caracterizacion de T1121 778f033/15cb6d8)
- PASS CON OBS. 24/24 verdes (t1125 8, t1126 unit 10, t1126 api 6); sin skip/only/todo/any; todos los titulos trazan a INV/REQ/EDGE; oraculos fuertes (toMatchObject de codigo+estado, cuerpos identicos, conteo de identidades, estado del arnes). Son caracterizacion legitima: el SUT ya cumplia (T1121), no hay tautologias.
- OBS: (1) 401 INV-VIN8-001 compara solo code/status, no cuerpo; (2) coste de SC-008-012 no compara googleCompletions en el caso (c) y 'coste' = solo llamadas al hasher; (3) HTTP bloqueo por intentos usa status>=400 laxo (el unit si fija ERR-AUTH-TOO-MANY-ATTEMPTS); (4) auditoria HTTP solo negativa (sin sub/correo), sin afirmar USER/UPDATE (el unit solo '"UPDATE"'); (5) T1126 no cubre en estos archivos sin-contrasena/LINK-CONFLICT inicial (si en t1120 L333/L342).
- DISCREPANCIA SC-008-014 (para T1128, NO resuelta): spec.md L189 y error-catalog 004 (ERR-AUTH-GOOGLE-LINK-CONFLICT 409: 'sub ya pertenece a otra cuenta') exigen 409; openapi 004 callback solo declara 400 y la implementacion (use-cases L222-224) y estas pruebas (INV-VIN8-002, SC-008-014) fijan 400 ERR-AUTH-GOOGLE-FAILED. Cuenta con Google ya vinculado: 409 solo en startGoogleLink; en callback 400. Requiere decision architect/Neo antes de marcar T1126/T1128.
- Gates: vitest 3 archivos 24/24; tsc 0; verify-oracles 445 archivos/0 debiles. Sin commit ni [x]; nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: revalidacion lote T1125/T1126 tras alinear a opcion A (sin commit)
- PASS CON OBS. OBS-1 cerrada (401 compara cuerpo completo JSON), OBS-2 cerrada en parte (googleCompletions [1,1,0] comparado; "coste" sigue siendo solo llamadas al hasher), OBS-3 cerrada (HTTP bloqueo fija 429 ERR-RATE-LIMITED exacto; TOO-MANY-ATTEMPTS en login HTTP y unit), OBS-4 cerrada (fila audit_log USER/UPDATE, entity_id == executor), OBS-5 cerrada (unit sin-contrasena 409 y 409 HTTP con Google ya vinculado, sin argos_oauth).
- 409 de startGoogleLink: oraculo fuerte (code+status, flows sin crecer, identidades intactas, sin cookie); no tautologico. Opcion A coherente entre spec SC-008-014, tasks T1126, catalogo LINK-CONFLICT y pruebas (400 callback / 409 start).
- H-429 (sin resolver): HTTP da 429 ERR-RATE-LIMITED (limite de ruta 5/15 min precede al bloqueo); spec REQ-VIN8-002/SC-008-011 no nombra el codigo del bloqueo, no hay contradiccion literal; REQ-VIN8-002 remite al contador de REQ-LOG-001 (TOO-MANY-ATTEMPTS). Ambiguedad a decidir por architect/Neo.
- Gates: vitest 27/27; tsc 0; oraculos 445/0 debiles; JSON catalogo OK. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria nota LINK-CONFLICT + precedencia H-429 (sin commit)
- PASS. Catalogos 002/004: 1 linea cada uno, solo campo note de ERR-AUTH-GOOGLE-LINK-CONFLICT; JSON valido. Generados (4 error-codes.ts): 1 linea cada uno, solo note, sin tipos/logica/status. spec.md REQ-VIN8-002: solo se anade la frase de precedencia H-429 (429 ERR-RATE-LIMITED por limitador HTTP primero; TOO-MANY-ATTEMPTS en casos de uso); cifras e IDs intactos.
- Coherencia: nota (409 solo en startGoogleLink; callback 400 ERR-AUTH-GOOGLE-FAILED) = SC-008-014/T1126 = prueba API L138 (409 start); precedencia = pruebas (429 HTTP / TOO-MANY unit). H-429 queda resuelto en spec.
- Gates: tsc 0; vitest 27/27 (t1125/t1126); deriva 30/30 (codegen-drift, generated-004, generated-contracts); verify-oracles 445/0 debiles. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1131 008 (vincular Google en perfil, sin commit)
- PASS CON OBS. 12/12 verdes; titulos con REQ-VIN8-001/002, NFR-008-002, SC-008-010/011; sin any, skip/only/todo; oraculos fuertes (toEqual de feedback completo, contra ERROR_CATALOG; authMethods en 4 combinaciones).
- Contrasena incorrecta -> bajo el campo + foco (focusField); resto de codigos -> mensaje del catalogo aunque el servidor envie detail crudo (probado). Estado vinculado solo de authMethods.google===true; sin authMethods = con contrasena; sin contrasena y sin Google = sin seccion. Contrasena se limpia antes de navegar. Sin datos sensibles reales (fixtures .test).
- Conocido (no FAIL): DEUDA-008-CALLBACK-400-PROBLEM (JSON problem+json crudo del callback LINK) diferido a 009 por Neo.
- OBS: (1) GoogleLinkSection (handler, foco por efecto, window.location.assign) sin prueba unitaria: cubierto solo por E2E T1132; (2) test «estado vinculado» con role=status prueba presencia, no anuncio real; (3) warnings useLayoutEffect de MemoryRouter en SSR (ruido, no fallo); (4) revision visual 320/1024/1280 pendiente de /sati.
- Gates: tsc 0; t1131 12/12; unit 211 archivos/3167; verify-oracles 446/0 debiles. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: revalidacion T1131 008 tras correcciones de /sati (sin commit)
- PASS. H-T1131-S1: GOOGLE_LINK_WRONG_PASSWORD texto llano propio; la prueba nueva fija que no contiene detailTemplate del catalogo, "pérdida de sesión", "ERR-" ni "urn:argos" (no vacua: el catalogo trae la nota de desarrollador). Resto de errores via problemMessage (catalogo) sin cuerpo crudo, probado con detail crudo inyectado (5 codigos, toEqual completo).
- OBS-2 cerrada: GoogleLinkedStatus sin role=status, con aria-labelledby; la prueba afirma ausencia de role=status y presencia de aria-labelledby dentro de la seccion extraida (si la seccion faltara, falla por toContain 'Google vinculado'): no es falsa.
- Gates: tsc 0; t1131 13/13; unit 211 archivos/3168; verify-oracles 446/0 debiles; git diff src/generated y contracts vacio. OBS-1 (GoogleLinkSection sin prueba unitaria, cubierta por E2E T1132) sigue vigente. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1132 008 (E2E vincular Google, google-vincular-008.spec.ts sin commit; google-sim-support.ts sin diff)
- PASS CON OBS. 12/12 verdes (4 casos x chromium/firefox/webkit, 35 s); tsc 0; verify-oracles 447/0 debiles. Sin skip/only/todo/any; titulos con REQ-VIN8-001/002/004 y SC-008-010/011/013/014.
- SC-008-014 ya alineado a opcion A (spec.md L189, commit 4619d32): el caso (d) fija 400 ERR-AUTH-GOOGLE-FAILED en callback (UI y cadena HTTP), cuerpo sin sub ni correo, sin vincular, la otra sesion sigue 200; no usa LINK-CONFLICT. El reporte de keymaker "pendiente de architect" esta desfasado. 409 de startGoogleLink queda en T1126 (API).
- Revocacion (e): otra sesion 200 antes y 401 despues; origen 200 con google=true; sin Set-Cookie argos_session y cookie intacta (caso b, SC-008-063 parte vigente). El meta refresh en WebKit solo sustituye el 302 del page.route; la espera del callback y los status/estado se afirman igual: no oculta fallos.
- OBS: (1) caso (d) depende de (b) por sharedSub en modo serial (si (b) falla, (d) falla con ruido); (2) SC-008-063 negativos (origen revocada/vencida/otro usuario) no estan en E2E, solo unit/API; (3) caso (d) asume Firefox sin navegar y lo evita con otra pestana (DEUDA-008-CALLBACK-400-PROBLEM, conocida); (4) mala-contrasena no comprueba que no hubo peticion al callback (solo URL y authMethods). Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1133 008 (tests/security/t1133-vinculacion-google-008.security.spec.ts, 29 pruebas, sin commit)
- PASS CON OBS. 29/29 verdes; tests/security 25 archivos/464 verdes; tsc 0; verify-oracles 450 archivos/0 debiles. Sin skip/only/todo/any; titulos trazan a REQ-VIN8-001..004, INV-VIN8-001/005, EDGE-008-003/023/050, SC-008-009..013.
- V-A/V-B/V-C reales (estado en BD, identidades, usersDump, huella completa estado+tipo+cache+cuerpo+cookies en V-C1; la uniformidad NO esconde diferencias HTTP). V-D es conteo determinista (hasher.verify, completions), no tiempo.
- OBS: (1) V-B1 hace 4 CSRF y luego login correcto; el bloqueo es a 5 (MAX_FAILED_ATTEMPTS=5): 4 no demuestra que no sumen, subir a >=5. (2) V-A7 titulo cita tope 24 h pero solo prueba inactividad 31 min. (3) V-D4 titulo cita callback y start, solo prueba /link. (4) Laxos: V-A6 [400,401,422], V-A8 [200,204], V-C4 solo regex negativa, V-C5 solo status/code. (5) OBS-1 coste por latencia no HTTP: V-D prueba conteos, no igualdad de tiempo; canje a Google solo ocurre con estado valido (diferencia de latencia real entre rechazo previo y posterior al canje), coherente con spec INV-VIN8-001 como no medible aqui. (6) OBS-2 DEUDA-008-GOOGLE-LINK-2STEP: sin prueba de posesion de sesion en callback (robo de argos_oauth); spec.md L113/L226 la acepta (Opcion A); sin contradiccion. Ninguna prueba afirma lo contrario.
- Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1134 008 parte (a) H-RAMA-008-T1134-01 (purga oauth_flow_states, sin commit)
- PASS CON OBS. Produccion: sqlite purgeExpired anade DELETE oauth_flow_states WHERE expires_at <= @now sin tocar el return; postgres-maintenance anade bucle DELETE por lotes (ctid IN ... LIMIT $2) tras login_attempts; MaintenanceCounts sigue con 5 conteos (diff solo anade sentencias, sin conteo propio), patron = login_attempts.
- Pruebas: t1134-purga (2), t1134-retencion-cascada (11, sin it.fails), t1134-security (7; 2 it.fails son H-02/H-03 distintos, documentados), postgres-maintenance (TABLES+byTable con oauth_flow_states). 34 verdes, 1 skip preexistente (PG real sin TEST_DATABASE_URL, T431).
- Parte (b): solo bloque de comentario "PENDIENTE DE DECISION DE ESQUEMA (Neo/architect)", sin it.skip/todo ni verde falso; CHECK USERNAME (0017/0013) exige correo y sub NOT NULL; requiere migracion Nivel 2.
- Gates: tsc 0; verify-oracles 451 archivos/0 debiles; src/generated, contracts sin diff. OBS: DELETE PG no probado contra PG real (solo forma de sentencia); (b) sin prueba ejecutable por diseno. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: revalidacion T1133 008 tras ajustes (MAX_RETRY=1, sin commit)
- PASS CON OBS. OBS-1 cerrada (V-B1: 6 rechazos CSRF > MAX_FAILED_ATTEMPTS=5, luego login correcto 200 afirmado; si sumaran, el login quedaria bloqueado), OBS-2 cerrada (V-A7 titulo = inactividad 31 min, 400 + code), OBS-3 cerrada (V-D4 acotado a /link, aclara que callback/start no se prueban).
- Exactas: V-A6 (status+code por caso, 422/422/401/422), V-A8 204, V-C4 (400, code, sin argos_session, identityRows [], sin location), V-C5 (401 ambos, code, cuerpo igual salvo instance).
- OBS residual (no bloqueante, fuera de los puntos pedidos): laxas restantes en L253 ([404,405]), L432 y L471 (>=400, V-C6/otro); no fijan status exacto.
- Gates: t1133 29/29; tsc 0; verify-oracles 451 archivos/0 debiles. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria E2E escena-008.spec.ts (T1165/T1169, sin commit; tests/e2e/visual/escena-008.spec.ts nuevo)
- PASS CON OBS. 9/9 verdes (3 casos x chromium/firefox/webkit, 20.8 s); tsc 0; vitest 9 archivos/110 verdes (t1163, t1166, t1170, t918, t1051, t875 x2, t1168 unit + api); verify-oracles 452/0 debiles. Sin skip/only/todo/any; titulos con REQ-UX8-001/002, SC-008-034..038, EDGE-008-020/021, NFR-008-002.
- Oraculos fuertes: texto exacto (exact:true) calculado desde quota.resetsAt del servidor en America/Bogota, 320/1024/1280 sin desbordar, ausencia del texto viejo; sin imagen -> boton ausente (toHaveCount 0) con «Crear imagen» visible; con imagen -> evento download real, nombre /^argos-hogar-AAAA-MM-DD.png$/ sin PII, bytes PNG (firma), clic y teclado, 44x44, sin navegar. La omision de axe en Firefox esta comentada (crash de axe ajeno a la app) y afecta solo a Firefox: Chromium y WebKit la ejecutan con toEqual([]) en 3 anchos.
- Commits 1c1c899 (T1163/1164), c4a8c98 (T1166/1168 UI), d48524f (T1168 servidor), ec50937 (T1170..1172) cumplen lo declarado en tasks.md; sin diff en src/contracts pendiente.
- OBS: (1) SC-008-038 es la parte E2E; Content-Disposition/redireccion solo en API t1168 (aceptable). (2) E2E no cubre EDGE-008-022/SC-008-039..041 (Mascotas): T1171 por grep de E2E «sin textos» no verificado aqui. (3) axe en Firefox sin sustituto (WCAG Firefox no auditado). (4) fecha del nombre no comparada con updatedAt en E2E (solo formato; unit lo cubre). (5) readFile import dinamico: cosmetico.
- Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1184 008 (tests/e2e/visual/biografia-008.spec.ts nuevo, sin commit)
- PASS CON OBS. 9/9 verdes (3 casos x chromium/firefox/webkit, 21.9 s); tsc 0; verify-oracles 453 archivos/0 debiles; sin diff en src/contracts. Sin skip/only/todo/any; titulos con REQ-BIO8-001..003, REQ-RBAC-001, SC-008-043..046, EDGE-008-042.
- Caso 1: biografia con <b>/& se afirma con toHaveText literal y locator('b') = 0 (texto, no HTML), tras recargar y por API (profile.biography). Caso 2: Lector ve texto sin <b>, sin boton Editar ni campo (toHaveCount 0); PATCH -> [403,'ERR-ACC-FORBIDDEN'] exacto y valor intacto leido por la propietaria. Caso 3: imageTag/status/pending/quota.remaining iguales a la referencia previa (owner y reader), canUpdate=false + NO_CHANGES; control de mascota nueva deja pending>0 (el detector reacciona).
- OBS: (1) la nota de caracterizacion (nacio verde porque T1183 ya existia) NO esta declarada en el archivo ni en tasks.md; solo en el bus (keymaker). No se presenta como prueba de fallo, pero conviene un comentario de cabecera. (2) Caso 3 depende del caso 1 (serial) para que la biografia exista y no guarda por si mismo; si el 1 falla, el 3 pierde sentido. (3) El titulo del caso 3 dice «Actualizar sin habilitar» pero solo se afirma canUpdate por API, no el boton en UI. (4) El control sube pending pero no reafirma imageTag; aceptable. (5) EDGE-008-042 (resumen veterinario/logs/prompt) no se cubre en E2E: va en T1185 (rama/trinity).
- Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1185 (unit /rama) + ajustes OBS-1/OBS-3 de T1184 (sin commit)
- PASS CON OBS. t1185-privacidad-biografia-008.spec.ts 10/10; E2E biografia-008 9/9 (3 casos x chromium/firefox/webkit, 16.1 s); tsc 0; verify-oracles 455 archivos/0 debiles (CUMPLE, el t1185 security ajeno de trinity no fallo). Sin skip/only/todo/any en ambos archivos; src/contracts sin cambios de este trabajo.
- Unit: oraculos fuertes con centinela SECRETO-T1185: errores (message + JSON de propiedades propias + stack) sin el texto ni su prefijo; auditLog tras UpdatePetUseCase sin centinela (con length>0 y la mascota si lo guarda); intento invalido deja snapshot identico; respaldo dueno contiene el centinela y el de MARIA no; sobre 3.3.0 valida y rechaza \u0000, salto de linea y 281 (280 valido); resumen veterinario sin centinela ni /biography/ con todas las opciones; ficha escapa HTML; guarda estatica de consola/logger sobre >5 modulos. Titulos con REQ-BIO8-001/002/004, NFR-008-004, EDGE-008-041/042.
- E2E OBS-1 cerrada: comentario de cabecera correcto (caracterizacion; UI solo tiene «Regenerar/Crear imagen del hogar» por canRegenerate, scene-view.ts:207 confirma que canUpdate/NO_CHANGES no se leen; no hay boton «Actualizar»). OBS-3 cerrada: titulo del caso 3 ya dice canUpdate=false (NO_CHANGES) en la API, sin prometer boton.
- OBS: (1) caso «otra cuenta» (MARIA) solo prueba ausencia; no afirma que su respaldo traiga datos propios (riesgo de vacuidad bajo: contraste con el del dueno, mismo harness). (2) Test «normalizador» es casi trivial. (3) Guarda estatica por regex amplia (console./logger.) sobre archivos que mencionan biography: heuristica, no prueba de flujo; hoy sin infractores. (4) Escena (D8-12=A) delegada a t1182, declarado en cabecera. (5) Caso 3 E2E sigue serial dependiente del caso 1 (OBS previa, no bloqueante).
- Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: re-auditoria T1183 008 tras correcciones de /sati S1/S2/S4 (sin commit)
- PASS CON OBS. t1183 10/10; unit/presentation 65 archivos/660; tsc 0; verify-oracles 455/0 debiles; src/generated y contracts sin diff.
- (1) Pruebas nuevas con oraculos fuertes: S1 exige [overflow-wrap:anywhere] y min-w-0 en la etiqueta de data-pet-biography; S4 posicional (bio despues del primer shrink-0 = envoltorio del avatar, PetDashboard L406; en HEAD la bio iba antes, asi que el rojo es real, coherente con los 3 fallos de la bitacora de keymaker); S2 exige role=alert en #b-error, texto propio y ausencia del generico. Rojo inicial 3/3 declarado.
- (2) BIOGRAPHY_TOO_LONG solo en PetForm.tsx (grep en src/contracts/specs/tests); catalogo y contrato intactos. Solo reemplaza el texto cuando over=true; errores de servidor/otros pasan tal cual.
- (3) Foco: useEffect depende de [errors]; en use-contract-form errors es useState que solo cambia en onSubmit (L50/L60), no en onChange: teclear no roba foco. Verificacion en navegador queda para /sati.
- (4) Sin lecturas sensibles ni cambio de permisos: BiographyField solo se monta con profile!==null en el formulario de edicion (canEdit); la lectura sigue sin boton Editar para Lector/Cuidador.
- OBS: (a) S4 usa proxy 'shrink-0' (el fallback data-pet-avatar no existe): fragil ante reordenar clases; (b) si hay error en otro campo y en biografia, ambos efectos enfocan y gana el ultimo en montarse (biografia), no necesariamente el primer error: verificar en /sati; (c) el contador role=status solo al exceder y el role=alert coexisten (doble anuncio posible), juicio de /sati.
- Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: T1173 parcial, auditoria en disco Bloques A, B, F, G, H, I, J (K excluido; sin commit)
- Gates (HEAD e96209a): tsc 0 errores; verify-oracles 456 archivos/0 debiles CUMPLE; verify-traceability --feature 008 FALLA, 63/88 IDs, purity 0. Sin diff en src/contracts/package.json. tasks.md: 0 [x] de agentes (solo texto «0 [x]» en Registro); T1110/T1111/T1167/T1178/T1187 [ARCH] en REVIEW por texto del Registro, resto [ ].
- IDs sin cubrir (FAIL): A = REQ-SSO8-002, REQ-SSO8-006, STATE-ACCT8-001 (todos diferidos a 009 por D8-04=C/M8-01; spec L109/L212). B = INV-VIN8-001/002/003 sin @implements en src (OBS real, T1128 los cita; pruebas si los trazan), INV-VIN8-004 y REQ-VIN8-005 diferidos a 009. F/G/H/I = 0 sin cubrir. J = REQ-INV8-002 descartado por D8-10=A. Resto (ADM8, APR8, PRM8) son 009 y no pertenecen a estos bloques.
- SC en titulos de it/test: presentes SC-008-001..006, 009..012, 014, 032..041, 043..052, 054, 055, 061, 062. Hallazgos: SC-008-053 solo en rangos de cabecera («048..052/048..053»), ningun titulo; SC-008-013 se cita en el titulo de google-vincular-008.spec.ts L121 aunque H-VO-3 (e3dc7ca) lo declaro inexistente (spec solo da 009..014 por rango); SC-008-042 transversal sin titulo (esperado, cierre de feature).
- Commits: 76 en main..HEAD; cada tarea de A,B,F,G,H,I,J con commit propio salvo T1128/T1180/T1181/T1190 solo en mensajes de rango (T1121, T1179..T1183, T1188/1190/1191). Veredictos previos existen en este log y audits/ para cadena A (bf5b4a7..ee8b1ab), B (T1125/6/31..34), F/G/H (rebanada 1 y escena-008), I (oracle-008-bloques-K-I, T1183..T1185), J (3bf26bd..6965d52, T1192/T1193). Sin veredicto nominal: T1113..T1116 (cubiertos por la cadena A), T1190 (por J).
- Veredicto: A PASS CON OBS, B PASS CON OBS, F PASS, G PASS, H PASS CON OBS (EDGE-008-022/SC-008-039..041 sin E2E de Mascotas, ya anotado), I PASS CON OBS, J PASS CON OBS. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria T1198 (E2E roles-ayuda-008.spec.ts, nuevo) y T1199 [GOV] (contraste de frases con can()), sin commit
- T1198 PASS CON OBS. 9/9 verdes (3 casos x chromium/firefox/webkit, 40.5 s); t1196 10/10; tsc 0; verify-oracles 456/0 debiles. Sin skip/only/todo/any (el unico match de grep es texto). Titulos con SC-008-056..060, EDGE-008-049, REQ-ROL8-001/002, REQ-RBAC-001.
- Oraculos fuertes: toHaveText literal de las frases D8-13, toHaveAccessibleDescription en selector y por miembro, ADMIN sin frase (count 0); aviso de la propietaria ligado al group de alcance. Caso 3: rol real por API (myRole CAREGIVER/READER) y control positivo (pestana «Historial / Archivos» seleccionada + enlace «Ver el album de fotos» visible) antes de afirmar count 0 de panel, titulo, marcador y texto del aviso; ademas su propia frase si aparece en /households.
- OBS: (1) el riesgo latente de canCreateLinks (PetsPage L279-281: condicion myRole OWNER||ADMIN y prop literal `canCreateLinks`; ShareLinks default false) NO esta declarado en el spec ni en tasks.md; el E2E solo cubre el caso por rol, no una regresion donde canCreateLinks=true se pase a un Cuidador; la proteccion real es la condicion del padre + unit t1196 (marcado sin permiso). Declarar en cabecera. (2) Serial: casos 2/3 dependen del beforeAll, aceptable. (3) Sin axe/320-1280 aqui (es de /sati).
- T1199 PASS. Frases vs src/domain/access/rbac.ts: Cuidador allows WRITE_WEIGHTS_AND_MEASUREMENTS/WRITE_HEALTH_EVENTS/WRITE_MEDIA = [OWNER,ADMIN,CAREGIVER] (cierto), denies EDIT_PET_BASICS/MANAGE_HOUSEHOLD_MEMBERS/CREATE_SHARE_LINK = solo OWNER,ADMIN (cierto); Lector solo READ_MEDIA/EXPORT_IMPORT_BACKUP, resto negado (frase «solo consultar», «ni registrar ni editar» cierta). Ninguna promete mascotas ajenas (aviso: «asignadas a ese hogar» y «que sean tuyas» = REQ-VET-002). t1196 compara catalogo con can() real (15 acciones, fijado de la matriz).
- Cero cambios en can() ni contrato 005: git diff 238a89b..working de src/domain/access, specs/005*/contracts, media-use-cases y share = 0 lineas. Contratos tocados desde 238a89b son 002/004 error-catalog/openapi (otros bloques de 008, ajenos a #25). Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria sc053-sin-busqueda-correo-008.api.spec.ts (SC-008-053, D8-10=A; sin commit)
- PASS CON OBS. Caso 1/1 verde (98 ms); tsc 0; verify-oracles 457 archivos/0 debiles CUMPLE. Sin skip/only/todo/any/asercion vacia.
- (1) Espia = copia fiel del de t1188 (H-J-1, L99-132): proxy de repositorios dentro de runInTransaction, registra repositorio.metodo salvo sessions. Puede fallar: el toEqual exige ['households.listMemberships'] no vacio (si no registrara, fallaria) y si la ruta consultara users/invitations/profiles aparecerian. Control positivo con prefijo valido esta en t1188 L148-151 (users.searchUsernamesByPrefix + invitations.listByHousehold), no en este archivo.
- (2) Cubre EMAIL, ana@x.com, PEDRO.A@EXAMPLE.TEST y ped@; status 422 y code ERR-SCHEMA-VALIDATION-FAILED exactos via problemOf; ademas texto de respuesta sin reflejo (q, example.test, pedro.a/b).
- (4) «Nacio verde» correcto: SearchInviteesUseCase (household-use-cases.ts L226) valida con InviteeSearchPrefix, schema identity.schema.json L675-681 pattern ^[A-Za-z0-9._-]+$ (sin @); la validacion va tras requireManager y antes de limiter/lecturas. No hay brecha.
- OBS: (a) sin control positivo propio en el archivo (depende de t1188); (b) no hay prueba de mutacion ejecutada (no se modifico nada); (c) el rechazo es por patron generico, no por rama «correo» explicita: si el patron admitiera «@» en el futuro la prueba si fallaria (bien). Nada modificado salvo bitacora y bus.

## 2026-11-22 Oracle: auditoria opcion A, EXCLUDED_BY_DECISION 008 en verify-traceability.sh (sin commit)
- PASS. Diff +16/-1 solo anade rama feature==='008' (ternario anidado tras la de 007); la logica de verificacion y las entradas de 007 no cambian. 22 IDs = 6 sueltos + APR8 1..5 + ADM8 1..6 + PRM8 1..4 + REQ-INV8-002.
- Cada ID aparece en spec.md «Diferido a 009» (L212, L220-225) con su motivo; INV-ADM8-001 esta diferido explicitamente (L223, Bloque D con REQ-ADM8-001..006; definicion L268), no es exclusion indebida. STATE-ACCT8-001 y APR8 en Bloque C (D8-02); REQ-INV8-002 descartado D8-10=A.
- Gates: traceability 008 66/66 CUMPLE pureza 0; 007 51/51 CUMPLE (2 excluidos, sin cambio); verify-oracles 457/0 debiles; tsc 0.
- OBS: los motivos de la lista cubren D8-01/02/03/04/07/08/10 y M8-01/03; la spec cita D8-07 y D8-08 solo como motivos, texto de la decision no re-auditado. Nada modificado salvo bitacora y bus.

## 2026-11-21 Oracle: auditoria H-T1197-S1 (min-h-10 a min-h-11 en select «Rol de <miembro>»), sin commit
- PASS. Diff HouseholdsPage.tsx = 1 linea (L148), solo clase min-h-10 a min-h-11; aria-label, aria-describedby, onChange y frases intactos. Unico min-h-1x en el archivo en esa linea.
- Prueba nueva (t1196 L94-102): extrae por regex los <select aria-label="Rol de ..."> reales del markup de HouseholdCard (OWNER), exige length>0 y por cada uno clase con \bmin-h-11\b y ausencia de min-h-10. No vacua. Simulacion en memoria con node: con min-h-10 la asercion positiva da false (falla), con min-h-11 true (pasa). No se toco disco.
- Gates: vitest t1196 11/11 verde; tsc 0; verify-oracles 457/0 debiles CUMPLE.
- OBS menores: la prueba verifica la clase Tailwind, no la altura renderizada (la altura real 44 px es de /sati/E2E); si el select tuviera una clase min-h-12 fallaria (aceptable, estricta). Otros cambios sin commit en src (google-auth) son ajenos a esta correccion. Nada modificado salvo bitacora y bus.

## 2026-11-22 Oracle: compuerta transversal final T1174 008 (HEAD 1c7e854, sin commit)
- (1) verify-traceability --feature 008: PASS, 66/66 CUMPLE, pureza 0. (2) verify-oracles: PASS, 457 archivos/0 debiles. (4) tsc --noEmit: PASS, 0 errores.
- (3) verify-ci-ready.sh (existe): FAIL. Semgrep PASA y tests/ sin rutas claude/ PASA; falla (iii) por 4 archivos rastreados modificados sin commit: src/application/use-cases/google-auth-use-cases.ts, src/infrastructure/http/routes/google-auth.routes.ts, src/presentation/web/pages/HouseholdsPage.tsx, tests/unit/presentation/t1196-ayuda-rol-008.spec.ts. Es estado de arbol de trabajo, no defecto de codigo.
- (5) test:gate con TEST_DATABASE_URL=postgres://argos_test:argos_test@127.0.0.1:55432/argos_test (docker-compose.test.yml): BLOQUEADO/FAIL. Al inicio PG 17.12 respondia (pg_isready OK). 1.a corrida: terminada por SIGTERM (143) a mitad, persistencia verde hasta ahi. 2.a corrida: 206 fallos/5844 pass/8 skip en 35 archivos, todos persistencia/integracion PG con ECONNREFUSED 127.0.0.1:55432; Docker daemon caido (docker.sock inaccesible) y puerto 55432 sin listener. Gates previos del test:gate (compile, traceability 002/003/006, oracles) CUMPLEN. No se reinicio Docker ni se toco nada. No es resultado valido de la suite; no es PASS.
- Nada modificado salvo bitacora y bus.

## 2026-11-23 T1220/T1221
Validacion en disco: PASS CON OBSERVACIONES. Acta oracle-009-T1220-T1221.md. tsc 0, vitest 21/21, oracles 0 debiles, E2E 009 3/3x3, 008 12/12x3.

## 2026-11-23 /oracle T1223 Fase 2 de 009
- Compuerta final ejecutada: tsc exit 0; test:gate exit 1 (2 failed/6185 passed/1 skipped); traceability 009 exit 1 (43/79, 0 huerfanos, 36 FAIL de Fases 3+), 008 66/66, 007 51/51, 006 196/279; oracles exit 0 (0 debiles).
- Hallazgo ORA-T1223-01 (ALTO): account-deletion-google.ts usa fetch sin notifyActivity (rompe ui-invitation-logs INV-AUTH2-002). verify-ci-ready exit 1 esperado (sin commit).
- Veredicto FAIL; acta .specify/memory/audits/oracle-009-T1223-fase2.md

## 2026-11-23 Oracle T1224/T1226 fase 3
Acta .specify/memory/audits/oracle-009-T1224-T1226-fase3.md: PASS CON OBSERVACIONES (OBS-1..3); compile-contracts 009 exit 0, src/generated sin diff; 3 decisiones abiertas para Neo.

## 2026-11-23 — Oracle 009 Fase 3 (#19) T1228..T1234: PASS CON OBSERVACIONES
- Auditoría en disco del portal /admin: tsc 0; vitest 7 archivos / 102 tests verdes; verify-oracles CUMPLE (475, 0 débiles); trazabilidad 009 = 52/79 (sin FAIL ADM9); verify-ci-ready falla por archivos sin commit (esperado). Migraciones 0019/0015 aditivas, 0014/0018 sin diff.
- Decisiones a-g de keymaker: ninguna contradice; b (correo en reposo) y c (acumulación de flujos) escaladas como observación. Acta: .specify/memory/audits/oracle-009-T1228-T1234-fase3.md. Sin [x], sin commit.

## 2026-11-23 Oracle — auditoría regla CSRF-antes-de-sesión (admin.openapi 1.2.0)
- Acta: .specify/memory/audits/oracle-009-admin-csrf-order-1.2.0.md. Veredicto: PASS CON OBS (contrato/plan y código).
- Guard global csrf-guard.ts:25 ya da 403 previo a sesión e idéntico al de ruta inexistente (sin fuga); choca solo con la letra "404" de T1228/SC-009-009.
- OBS: origen evaluado tras sesión (admin.routes.ts:123-124) vs texto 1.2.0 ambiguo; docstring 1.1.0; falta firma Neo. t1228+t1231 28/28 verdes.
- 2026-11-23T13:25 [oracle] 009 pre-commit Fase 3: PASS CON OBS (t1228/t1231/t1227 38/38, tsc 0, yaml via node OK; PyYAML ausente). Orden Origin/CSRF CONFIRMED, O-2 OK. Acta oracle-009-precommit-fase3.md. Sin FAIL.
- 2026-11-23 [oracle] T1235 auditado: PASS CON OBS; FAIL fallback admin.html->index.html en static-assets.ts:25 (sirve app de usuarios en /admin sin admin.html; fix keymaker fail-closed); SC-009-010 baseline = pregunta N2 a Neo; vitest 68/68, tsc 0, pw 21/21. Acta: .specify/memory/audits/oracle-009-T1235-admin-ui.md
- 2026-11-23 [oracle] T1235 RETRY: PASS (fail-closed /admin: sin admin.html 404 text/plain GET/HEAD/?a=1, nunca app de usuarios; boot guard server.ts:147 ok; vitest 70/70, tsc 0). OBS: dist/ actual viejo sin admin.html -> rebuild antes de deploy. Acta: .specify/memory/audits/oracle-009-T1235-retry.md
- 2026-11-23 [oracle] T1236/T1237 + regen v35 auditados: PASS CON OBS (vitest 72/72, pw chromium 25/25, tsc 0, mutacion T1236 roja). Acta: .specify/memory/audits/oracle-009-T1236-T1237.md
- 2026-11-23 [oracle] T1238 auditado: PASS CON OBS (api 542/542, security 561/561, 2 suites 52/52, tsc 0; mutaciones M1/M2 rojas; 01b real). OBS: actas sentinels/trinity desactualizadas (refrescar antes de commit). Acta: .specify/memory/audits/oracle-009-T1238.md
- 2026-11-23 [oracle] T1239 re-auditado: PASS CON OBS (64/64 3 suites, persistence 671 ok/212 skip PG real, tsc 0, verify-oracles 0; PG real NO ejecutado). admin_audit retencion sigue pendiente de Neo. Acta: .specify/memory/audits/oracle-009-T1239.md
- 2026-11-23 [oracle] T1240 compuerta FINAL Fase 3: FAIL (PG17 real ok; persistence 881/883 1 fail schema-parity viva sin 0015 -> keymaker; test:gate 2 fail: schema-parity + presentation-architecture REQ-UI-004 vs src/presentation/admin -> architect/keymaker; traceability 52/79; oracles 0; tsc 0; E2E 73/75: webkit A6/A7 foco skip link). Seraph cookies PASS. Acta: .specify/memory/audits/oracle-009-T1240-fase3-final.md
- 2026-11-23 [oracle] T1240 reintento: gate VERDE (persistence 882/883, test:gate 415 files 6377 pass cov 98.87%, e2e 25/25/25 chromium/firefox/webkit, tsc/oracles exit 0, trazabilidad 009 solo Fase 4-5 abiertos). Acta oracle-009-T1240-retry.md. [x] pendiente Neo.
- 2026-11-23 [oracle] 009 T1241..T1244 auditado: PASS CON OBS (persistence+t1244 59 files 899 ok/1 skip PG17 real, tsc 0, verify-oracles 0; full suite 52 fail = deriva 002/004 DRAFT + 1 untracked 0016 en verify-ci-ready). Acta .specify/memory/audits/oracle-009-T1241-T1244.md
- 2026-11-23 [oracle] 009 T1245+T1246 auditado: PASS CON OBS (tsc 0, oraculos 0, persistence+T1245/T1246 con PG17 915 ok/7 rojas esperadas T1248; suite completa 16 rojas = 4 T1248 + 11 deriva 002/004 + gates-004 + verify-ci). OBS: presentacion rota hasta T1249, no desplegar. Acta .specify/memory/audits/oracle-009-T1245-T1246.md
- 2026-11-23 oracle: T1248 PASS CON OBS (OBS-1 cast PG con createdAt no-timestamp aborta la pasada; no alcanzable). PG17 916 passed, tsc 0, verify-oracles 0; suite 12 rojos ajenos (deriva DRAFT, gates-004, t1238 flaky). Acta audits/oracle-009-T1248.md
- 2026-11-23 [oracle] T1249 auditado: PASS CON OBS (tsc 0, oraculos 0 exit 0, t1249 10/10, e2e chromium 4/4, 48 px real; suite 11 rojos = deriva 002/004 + gates-004 T1288/9; WebKit/FF no corridos). Acta oracle-009-T1249.md
- 2026-11-23 /oracle: auditoria corte supresion 009 Fase 4 = PASS CON OBS (tsc 0, oracles 0, vitest 6205/1 gates-004 esperado, pw 4/4, v34 requerido por drift CI). Acta .specify/memory/audits/oracle-009-corte-supresion-fase4.md
- 2026-11-23 /oracle: auditoria T1288+T1289 (009) PASS CON OBS (carrera check-then-record por instancia; trustProxy TRI-03; aviso sin cablear hasta T1247/T1250). Acta .specify/memory/audits/oracle-009-T1288-T1289.md. Sin [x].
- 2026-11-23 /oracle: auditoria T1247 (009) PASS CON OBS (CAS atomico 3 motores, PG17 carrera real; revoke con '' fragil; 404 uniforme JSON pre-existente; contador <30d; archivo -E huerfano). Acta .specify/memory/audits/oracle-009-T1247.md. Sin [x].
- 2026-11-23 /oracle: T1250 (009) PASS CON OBS (tsc 0, oraculos 0, vitest 19/19, pw chromium 14/14; OBS S1 exito solo sr-only, S2 foco, S3 gap 320). Acta audits/oracle-009-T1250.md. Sin [x].

- 2026-11-23 /oracle T1251: PASS CON OBS. Acta oracle-009-T1251.md.

- 2026-11-23 /oracle RAMA-T1239-03: PASS CON OBS. Acta oracle-009-T1252-retencion.md.
- 2026-11-23 /oracle T1253 Fase 4 (#18): PASS CON OBS. tsc 0, oraculos 0, test:gate PG17 exit 0 (6501 pass, cov 98.87%), trazabilidad 009 60/78 con 0 FAIL de Fase 4 (4 FAIL son Fase 1, 14 Fase 5); sin EmailSenderPort ni dependencia de correo. Acta oracle-009-T1253-fase4.md. Sin [x].

- 2026-11-23 /oracle 009 Fase 5a ola 1 (T1258/T1260/T1262/T1263): PASS CON OBS. Acta oracle-009-fase5a-ola1.md. Sin [x].

- 2026-11-23 /oracle 009 Fase 5a ola 2 (T1264/T1266): PASS CON OBS. Acta oracle-009-fase5a-ola2.md. Sin [x].

## 2026-11-23 Oracle 009 Fase 5a ola 3 (T1262/T1268): PASS CON OBS
- Alcance opcion A conforme (3 motores), CAS por fila real, 409 sin auditoria, 422 cuerpo no vacio; aserciones T1262 no relajadas. OBS-1 rama null sin prueba determinista; OBS-2 PG sin cobertura de correo/exclusiones. Acta .specify/memory/audits/oracle-009-fase5a-ola3-reinicio.md. Sin [x], sin commit.
- 2026-11-23 /oracle 009 Fase 5a ola 4 (T1293/T1297 EDGE-009-048): PASS CON OBS. tsc 0, oraculos 0, vitest 2+1skip, PG17 3/3; media-use-cases.ts sin diff. Acta .specify/memory/audits/oracle-009-fase5a-ola4-fotos.md. Sin [x].

- 2026-11-23 /oracle 009 Fase 5a ola 5 (T1269): PASS CON OBS. Acta oracle-009-fase5a-ola5-editor.md. Sin [x].

- 2026-11-23 /oracle 009 Fase 5a ola 6 (revalidacion T1269): PASS CON OBS. tsc 0, oraculos 0, unit 12/12, pw 51/51. Vitest completo 2 rojos: t1235-api (CAUSADO por T1269: adminId en src/presentation/admin vs regex prohibida) y t1238 timing (flaky preexistente, 3/3 verde aislado). Acta oracle-009-fase5a-ola6-revalidacion.md. Sin [x].

- 2026-11-23 /oracle 009 Fase 5a ola 7 (T1269 OPCION 2): PASS CON OBS. Acta oracle-009-fase5a-ola7-t1269.md. Sin [x].

- 2026-11-23 /oracle T1304 compuerta final 5a: PASS CON OBS. Acta oracle-009-T1304-fase5a.md. Sin [x].

- 2026-11-23 /oracle 009 5b ola 1 (T1261/T1295 rojo): PASS CON OBS. Acta oracle-009-5b-ola1-rojo.md. Sin [x].

- 2026-11-23 /oracle 009 5b borradores sin cifras: PASS CON OBS. Acta oracle-009-5b-borradores.md. Sin [x].
- 2026-11-23 [oracle] 009 5b Ola 2 (T1267/T1303/T1298) auditada: PASS CON OBS (tsc 0, oraculos 0 debiles, 3 suites 59 verdes, PG17 persistence 1018/1018). OBS: fallback registra defectos en vez de null (antes de T1300); rama RENDER en incrementales inalcanzable, la causa es el fixture de t1261; falta prueba de composicion providerCall. Acta: .specify/memory/audits/oracle-009-5b-ola2.md

- 2026-11-23 /oracle 009 5b Ola 2 revalidacion: PASS. Acta oracle-009-5b-ola2-revalidacion.md. Sin [x].
- 2026-11-23 /oracle 009 5b ola 3 (rojo T1292/T1259): PASS CON OBS. Acta oracle-009-5b-ola3-rojo.md. Sin [x].

- 2026-11-23 /oracle 009 5b ola 4 (T1265/T1296): PASS CON OBS. Acta oracle-009-5b-ola4-T1265-T1296.md. Sin [x].

## 2026-11-23 — Auditoria T1296 paso 1 (h)
- PASS CON OBS: providerCall dinamico cierra (h); composicion no vacua. Acta oracle-009-5b-T1296-paso1.md. tsc 0; oracles 0 debiles; 6/6 verdes.

- 2026-11-23 /oracle 009 5b T1296 FINAL: PASS CON OBS. Acta oracle-009-5b-T1296-final.md. Sin [x].

## 2026-11-23 — T1305 auditoría editor 5b
- PASS CON OBS: ver .specify/memory/audits/oracle-009-T1305-editor5b.md. OBS-1 bloqueante (EDGE-009-036 previo), OBS-2/3 bajos.

- 2026-11-23 /oracle 009 admin 1.5.0 contrato: FAIL (cifras 45_000/5_000_000 en l.820 y change_note). Acta oracle-009-admin-1.5.0-contrato.md. Sin [x].

## 2026-11-23 — 5b ola 8 final: PASS CON OBS (OBS-1 aserto de restauracion t1306 debil; OBS-2 sin tarea T1307). Acta oracle-009-5b-ola8-final.md
- 2026-11-23 /oracle T1272 (009 Fase 5 completa 5a+5b): PASS CON OBS. tsc 0, oraculos 0, traza 78/78, E2E admin 85/86 (1 flake ENOENT traza t1270, 6/6 aislado), PG17 985/985+1 skip. OBS-1 nota de despliegue /link (cuota 112..1000, no fijar entorno). Acta oracle-009-T1272-fase5.md. Sin [x].
- 2026-11-23 /oracle T1274 cierre: FAIL (t1235 por URL http en SceneParameterEditors.tsx l.54). Acta oracle-009-T1274-cierre.md. Sin [x].

## 2026-11-24 — Auditoría fix/006-escena T961..T967: PASS CON OBS
- Gates rc=0 (tsc, oráculos, trazabilidad 006, test:gate con PG17). Acta .specify/memory/audits/oracle-006-fix-escena-2026-11-24.md. Sin [x], commit ni push.

- 2026-11-24 [oracle] T968 revalidacion: PASS CON OBS. R-1 (scene-run-use-case:151-153) = compuerta de loadLiveInputs; R-2 notice §4/§6 ok, gemini-api sin "no entrena". Gates verdes (test:gate rc=0 en 2a corrida, flake t1238). Acta oracle-006-T968-revalidacion-2026-11-24.md

## 2026-11-24 — 006 consolidado (504e4a0..12651ee)
- Veredicto PASS CON OBS (OBS-1 spec 009 desfasada, OBS-2 APP14 Adobe, OBS-3 decision incrementales, OBS-4 flake t1238). Acta audits/oracle-006-consolidado-2026-11-24.md.

## 2026-11-24 — 009 fix/009-escena-driver-selector-y-reset (6a4aabd, 86a89c7, a7ac566)
- Veredicto PASS CON OBS. T1313/T1315/T1316 verificados en disco; gates tsc, oraculos, traza 009/006, vitest 6993 rc0, terraform fmt/validate rc0. OBS: SC-009-059 dice 5 (codigo 20), 009-C no cubre global/preview/Anexo A, marca de escena libera ACTOR_LIMIT de otros actores, gcloud silencioso en deploy, mock t1307. t1306 pendiente de corrida real. Acta audits/oracle-009-driver-reset-a7ac566-2026-11-24.md.

## 2026-11-24 — Oracle: auditoria cierre 009 HEAD 240b89a
- PASS CON OBS. Ver audits/oracle-009-cierre-240b89a-2026-11-24.md (deriva generated v35, 3 contradicciones spec 009, flake t591).

## 2026-11-25 — T1418 abfacfa
- PASS CON OBS. ipLimitKey y setBounded en los 5 limitadores verificados; OBS-3 t1416 endurecida; gates verdes. Acta audits/oracle-010-T1418-abfacfa-2026-11-25.md. Sin [x].

## 2026-11-25 — T1418 revalidación (4dbc441, b6fde9b)
- PASS. Fix SEN-IP-09 real (trim eliminado, FORBIDDEN_CHARS), oráculos endurecidos sin debilitar; gates rc 0. Acta audits/oracle-010-T1418-revalidacion-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1422 + T1423 (a45ea50, cc1f7fc)
- Veredicto PASS CON OBS. Alcance limpio (solo log-keymaker propio), rojas T1422 por falta de implementación, contratos/migraciones conformes a REQ-MEN10-001..003, compile-contracts determinista sin tocar v35. Gates rc 0 (tsc, oráculos, traza T1423, compile 002/003/006/010).
- OBS: PG real no ejecutado; ADULT_NOTICE_VERSION indefinida. Acta audits/oracle-010-T1422-T1423-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1425 (8c01cdf)
- PASS CON OBS. Alcance limpio; textos 18+ de legal-texts/Terminos/Privacidad coinciden con T1424 (casilla en registro y /elige-usuario, rechazo servidor, fecha+version 0.1.0, sin nacimiento/documento, eliminacion /cuenta); sin acciones de admin prometidas; 4 placeholders literales; scene-notice/LegalLayout intactos.
- Gates rc 0: tsc, traza 010, t1411 18/18. OBS: 4 puntos legales (no 5), t1411 no cubre 18+, contacto@tipi.pet solo en meta de legal-texts.
- Acta audits/oracle-010-T1425-8c01cdf-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1424 (2dce52f)
- Veredicto PASS CON OBS. Alcance limpio (solo log-keymaker propio, sin specs/logos). requireAdultDeclaration antes de existencia y antes de oauthFlows.consume; version 0.1.0 solo en servidor, cliente no la envía; update SQL/PG/memoria no toca columnas; tests existentes solo ganan adultDeclaration (2 aserciones ampliadas, 0 debilitadas).
- Gates rc 0: tsc, oráculos (0 débiles), traza T1424 6/6, vitest t1422 con PG17 43/43 sin skip. OBS: sin prueba directa de update-no-toca; pet-dashboard:166 (T1406) y t1238 flaky no atribuibles; E2E de casilla no corrido. Acta audits/oracle-010-T1424-2dce52f-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 Bloque D parcial (906754d, b17c686, 0ae8459, 1cce3c2)
- PASS CON OBS. Alcance limpio en los 4; redacciones de /rama idénticas en legal-texts/Privacidad/Términos, DRAFT 0.1.0, 4 placeholders, sin contacto@tipi.pet, scene-notice/LegalLayout intactos; RAMA-T1426-01 sin aplicar.
- t1424-update-no-toca-adult: 9/9 con PG17, oráculos fuertes. Gates rc 0: tsc, oráculos, traza 010, t1411 18/18.
- OBS: RAMA-T1426-01 pendiente de Neo; t1411 no cubre frases nuevas; H-01/H-02 lock BAJA. Acta audits/oracle-010-bloqueD-parcial-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 cierre Bloque D (T1422..T1426, foco 759a330)
- PASS CON OBS. 759a330 acotado (3 .tsx + 1 test + log propio); role="alert" sin cambio de texto; helpers solo para la casilla; 0 bitácoras ajenas en los 9 commits.
- rc 0: t1424-casilla 8/8; t1422+t1424-update PG17 45/45; traza 010 (CUMPLE). test:gate no corrido (Morpheus).
- OBS: foco/limpieza sin prueba de cableado; RAMA-T1426-01 pendiente Neo. Acta audits/oracle-010-bloqueD-cierre-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 Bloque E rojo + contrato (648a2a7, a07e265)
- PASS CON OBS. Alcance limpio (0 bitácoras ajenas); rojo por falta de implementación (about-markdown, about-use-cases, AboutPage, aboutContent, rutas); 4 guardas verdes legítimas (404 uniforme y /acerca-de verdes por construcción); oráculos fuertes (0 débiles); If-Match: 412 obsoleto, 422 ausente, foto incrementa versión.
- Migraciones 0029/0025 aditivas, tabla vacía, CHECK 20 000; tests actualizados sin debilitar salvo .at(-1)->toContain en t831/t1423. Gates rc 0: tsc, oráculos, traza T1429, compile 010 sin deriva.
- OBS: PG real no ejecutado; decisión A pendiente de Neo. Acta audits/oracle-010-bloqueE-rojo-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1430 (f9638bf)
- PASS CON OBS. Alcance limpio (solo log-keymaker propio; sin specs/contratos/generated). Orden CSRF -> sesión (404 uniforme, antes del cuerpo) -> origen -> cuerpo verificado en código y prueba (JSON 5 MB sin sesión = baseline). CAS 422/412, foto siempre +1, limpieza en 412. 413 solo en PUT /api/admin/about; foto cruda ERR-MEDIA-TOO-LARGE.
- Stripper movido a dominio: diff byte a byte vacío, sin imports; t847/t848b/t874/t568 verdes. Conciliación about/ compara con photo_object_key (la vigente no se encola). Claves: solo requireUuid, prefijo about/ 15 min.
- Gates rc 0: tsc, oráculos (0 débiles), PG17 t1428 81/81 sin omitidas, lote 132/132, traza T1430 rc 0 (no rc 1). Fuzz propio 50 000 corridas del sanitizador: 0 violaciones. Acta audits/oracle-010-T1430-f9638bf-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1431 (51c4d67)
- PASS CON OBS. Alcance limpio (11 archivos, solo log-keymaker propio). about-markdown web sin imports, escape total y lista cerrada de etiquetas; 16 hostiles + fuzz 60 000 (web y servidor->web): 0 violaciones reales.
- /acerca-de fuera de Guard/Session, credentials omit, h1 único; admin If-Match con etag, 412 con recarga, maxLength 20000 + contador; t1249 solo añade '/acerca-de'. Los 3 fallos Playwright no corresponden a archivos tocados.
- Gates rc 0: tsc, vitest 58/58, oráculos, traza T1431. OBS: href `/\evil.com` permitido (BAJO), sin prueba de AboutPanel. Acta audits/oracle-010-T1431-51c4d67-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1431 revalidación del fix (b2ab1d9)
- PASS CON OBS. Alcance limpio (7 archivos, solo log-keymaker propio). `\/(?![\/\\])` bloquea `/\evil.com` y `//evil.com` en servidor y cliente sin romper rutas válidas; LINK con un nivel de paréntesis: render(x)==render(sanitizar(x)) en las hostiles del test.
- Pruebas AboutPanel con oráculos fuertes (If-Match, 412 role=alert, maxLength 20000, altWarning); reflow E2E 4/4 (rojo-antes por bitácora de keymaker, no reproducido). Gates rc 0: tsc, vitest 83/83, oráculos 0, traza T1431, playwright reflow.
- OBS: 2+ niveles de anidado difieren web/servidor (inerte, sin fuga); panel probado por fragmentos; alt vacío aviso vs nota del esquema. Acta audits/oracle-010-T1431-fix-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1431 cierre (3fbc04b, abec567)
- PASS. Alcance limpio (logos propios). AboutContent movido literal, misma carga (fetch /api/about, credentials omit, sin /auth/me); t1444 11/11.
- Pruebas alt="" y alt escapado fuertes (0 débiles). about.schema 1.0.1 PATCH: estructura JSON idéntica sin description; generated v36 solo descripción/versión, compile 010 sin deriva.
- Gates rc 0: tsc, vitest 75/75, oráculos, traza T1431, compile. OBS-3 cerrada. Acta audits/oracle-010-T1431-cierre-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1431 OBS-4 sati (e174c26)
- PASS CON OBS. Compilé Tailwind real: `[&_a:focus-visible]` genera `.cls a:focus-visible` con box-shadow/ring Terracota; `outline-none` = `2px solid transparent` (visible por anillo; E2E exige outline != auto).
- Alcance: sin PetForm/pet-dashboard/household/medios-csp/playwright.config; OBS BAJO: el commit incluye 46 líneas ajenas del registro (arrastradas por git add del archivo). Stash@{0}/@{1} y árbol intactos.
- Gates rc 0: tsc, vitest 29/29, pw 6/6, oráculos, traza T1431. Acta audits/oracle-010-T1431-e174c26-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1432 TRI-01/02/03 (e384094)
- FAIL. Alcance limpio (7 archivos, sin registro ni bitácoras ajenas). Seguridad PASS: solo h1-h6/p/ul/ol/li/strong/em/a, href con SAFE_HREF, 0 innerHTML en código, semgrep 0, excepción de fetch acotada (solo +1 entrada y 2 controles), TRI-03 no altera enlaces válidos.
- Equivalencia de render NO demostrada: fuzz 300k (viejo parcheado con regla TRI-03) da 1 820 difs, 1 725 con viejo BIEN anidado y texto visible distinto (`**a _b_ c**` -> `_b_` literal, `__a *b* c__`), 0 difs de href. Las ~26k "marcador" = entradas con U+E000/E001 (99,2 % de difs en mi alfabeto), nuevo las cambia a U+FFFD.
- Gates: tsc 0, vitest 818/818, security rc 0 (1.ª con flaky t1238 de latencia, aislado verde), semgrep 0, oráculos 0, traza rc 0. Acta audits/oracle-010-T1432-e384094-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1432 reintento ORA-T1432-01 (99614b4)
- FAIL. Alcance limpio, seguridad/TRI-03/pruebas OK, casos del acta y PUA corregidos (salida idéntica al viejo).
- Pero con 300k entradas propias: 336 viejo mal anidado distinto; 100 solo serialización, 236 con texto visible perdido (nuevo siempre más corto). Causa: `stack.length = at + 1` descarta nodos abiertos intermedios. Ej. `**x _y** z_` pierde "y". La propiedad de keymaker excluye todo mal anidado y no lo ve.
- Gates rc 0 (tsc, vitest 89/89, security 641, semgrep, oráculos, traza). ORA-T1432-04 ALTO; MAX_RETRY agotado -> Neo. Acta audits/oracle-010-T1432-99614b4-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1432 re-auditoría ORA-T1432-04 (55799b4)
- PASS. Excepción a MAX_RETRY autorizada por Neo. Alcance limpio (4 archivos, solo log-keymaker propio). `emphasis()` promueve intermedias abiertas al cerrar (sin `stack.length = at + 1`); 13 cruces manuales con texto visible igual y salida bien anidada.
- Muestreo propio 4 semillas x 300 000 = 1,2 M entradas (52 átomos, PUA, U+2028/2029, NBSP, enlaces): 0 diferencias de texto visible, 0 etiquetas fuera de lista, 0 hrefs distintos fuera de TRI-03; fixture == e384094^.
- Propiedad: seed 1432, 20 000, compara textContent; única exclusión TRI-03; 0 aserciones débiles; t1428/t1431/t1444 intactos. pet-dashboard solo 3.2.0 -> 3.3.0.
- Gates rc 0: tsc, vitest 91/91, security 641, semgrep, oráculos, traza T1432. Acta audits/oracle-010-T1432-55799b4-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1431 guarda T1235 copia admin (31b5d46)
- PASS CON OBS. Alcance limpio (3 src + prueba + log-keymaker propio, sin registro). `cmp` de las 2 parejas rc 0; solo la prueba nueva en tests/, guardas intactas.
- Identidad cubierta: toBe sobre fuentes + arbol/render; test:gate corre vitest completo sin include restrictivo. Seguridad: SAFE_HREF, rel, lista cerrada, 0 innerHTML, semgrep 0.
- OBS BAJA: propiedad t1432 solo ejercita web (admin cubierta transitivamente). Gates rc 0: tsc, vitest 21/21, oráculos, traza T1431. Acta audits/oracle-010-T1235-copia-admin-2026-11-25.md. Sin [x].

## 2026-11-25 — 010 T1436 cierre de feature (63a2c9b)
- PASS CON OBS. Rama limpia de cambios propios (diff src/tests/specs010 vacío); 59 commits desde b4067b7.
- Gates rc 0: traza 010 (75/75), compile 010 sin deriva, tsc, oráculos 0 débiles, vitest dirigido 100/100, semgrep 0 hallazgos.
- Marca: toLowerCase en 4 cabeceras, logo horizontal solo en admin, 0 nunito en código. Legal: contacto@tipi.pet, 3 placeholders intactos, 0.1.0 DRAFT. Acerca de: lista cerrada de etiquetas, SAFE_HREF, 0 innerHTML en código, copias identicas.
- OBS BAJA: zips/whl/gate-output sueltos en raíz; legal-texts.md línea 17 desactualizada. Deuda declarada (h). Acta audits/oracle-010-T1436-cierre-2026-11-25.md. Sin [x].

## 2026-11-25 — 011 paquete DRAFT (db8eb75)
- PASS CON OBS. Alcance limpio (4 archivos de specs/011 + 5 líneas de log-architect, 0 src/tests). 9/9 requerimientos del inbox cubiertos; 61 tareas, 0 sin [GH:], 0 [x]; 9 bloques con [LOCAL] antes de compuertas, sync en cada cierre, T1560 Closes #N.
- Inventario en disco cierto: sin tope de hogares, sin picture/avatar de usuario, IA solo escena, ARGOS_ADMIN_EMAILS única fuente, vista pública excluye avatar/álbum.
- OBS: ORA-011-01 IDs de tarea erróneos en «Bloquea» de spec (D11-01/03/04/06/09); ORA-011-02 decisiones presupuestas (STATE ACTIVE↔DISABLED vs D11-04, página única vs D11-05, álbum vs D11-11); ORA-011-03/04 BAJA. Traza 011 rc 2 confirmada: falta error-catalog.json y script sin ramal 011. Acta audits/oracle-011-paquete-db8eb75-2026-11-25.md. Sin [x].

## 2026-11-25 — 011 enmienda documental (a755193)
- PASS CON OBS. Alcance limpio (4 archivos specs/011 + log-architect propio, 0 src/tests). OBS-1 verificada ID por ID contra tasks.md (D11-01 T1524..T1531, D11-03/04 T1524+T1527, D11-06 T1507+T1508, D11-09 T1534+T1535).
- OBS-2/3/4 resueltas: presunciones condicionadas a D11-xx, 0 «Vertex AI» único, nota de trazabilidad sin catálogo ni script 011. D11-01..13 abiertas, 0 [x]. Traza 010 rc 0.
- OBS BAJA residual: plan.md:21, T1508, T1510 y SC-011-001 dicen «página única» sin marca D11-05. Acta audits/oracle-011-enmienda-a755193-2026-11-25.md. Sin [x].

## 2026-11-25 — 011 acta D11 (T1501)
- PASS CON OBS. D11-01..13 + ORDEN reflejadas sin contradiccion en spec/plan/tasks; D11-02 abierta en los 4 artefactos; 0 residuos 'segun D11-xx'; 0 [x]. Traza 011 rc=0 (109/109), oraculos rc=0. Sin checklists/.
- OBS: ORA-1 rama 'a crear' obsoleta; ORA-2 tabla premisas en tono de decision abierta; ORA-3 plan #74 migracion y T1507 [N2] sobrantes; ORA-4 posibles adiciones (sanear historicos T1519, cuentas sin Google, N2 de constantes); ORA-5 REQ-HOG11-007 vs endpoint avatar #31; ORA-6 cambios ajenos (005 T797 [x], settings, etc.). Acta audits/oracle-011-acta-d11-2026-11-25.md.

## 2026-11-25 — 011 revalidación Fase 0 (MAX_RETRY=1)
- PASS CON OBS. Hallazgos lock/trinity/mifune/merovingian/architect incorporados; Pendientes de Neo (F-03,F-05,F-11,H-1,H-6,MIF-03/04/10,MER-11-01,paginación,2FA) intactos; EDGE-011-011/014 sin texto; 0 IDs duplicados; 0 [x]; traza 011 rc=0, oráculos rc=0.
- OBS: ORA-1 EDGE-017/T1543 presupone paginación global (MEDIA); ORA-2 spec:16 y fila 2FA sin citar acta architect; ORA-3 contracts/README desfasado; ORA-4 US2.1 «descarga»; ORA-5 trinity H-5/H-2b sin traza. Acta: .specify/memory/audits/oracle-011-fase0-2026-11-25.md
- 2026-11-25 [oracle] Auditoría cierre Fase 0 de 011 (directiva Neo iter 208): PASS CON OBS (ORA-1 decisiones derivadas sin rotular, ORA-2, ORA-3); traceability rc=0, oracles rc=0, 0 [x]. Acta: .specify/memory/audits/oracle-011-cierre-fase0-2026-11-25.md
- 2026-11-25 oracle T1511 Bloque A (#64): PASS CON OBS (ORA-1..4); acta .specify/memory/audits/oracle-011-T1511-bloqueA-2026-11-25.md
- 2026-11-25 oracle T1516 Bloque B (#72): PASS CON OBS (ORA-1 T1515 manual pendiente, ORA-2 T797 [x] ajeno en 005 sin commit); tsc/vitest(59)/oracles/trazabilidad rc=0; acta .specify/memory/audits/oracle-011-T1516-bloqueB-2026-11-25.md
- 2026-11-25 oracle T1523 Bloque C (#73): PASS CON OBS (ORA-1 spec REQ-IA11-004 sin enmendar, ORA-2 cambio breed/speciesOther sin declarar, ORA-3 DEUDA-011-RETENCION-CONSOLA solo en log; ORA-4 PG skipped); tsc/vitest(40)/oracles/trazabilidad T1519+T1521 rc=0; acta .specify/memory/audits/oracle-011-T1523-bloqueC-2026-11-25.md
- 2026-11-25 oracle T1524 contratos roles 011: PASS CON OBS (ORA-1 recuperación EDGE-011-019 inalcanzable con UNIQUE(email)+INVITE no-op; ORA-2 derivadas (g)(h) sin rotular); verify-traceability 011/010/009 rc=0, oráculos rc=0; ERR_ID_011 correcto; acta .specify/memory/audits/oracle-011-T1524-roles-2026-11-25.md
- 2026-11-25 oracle T1526+T1527 Bloque D (#63): PASS CON OBS (ORA-1 indice sub ACTIVE no rotulado derivada pendiente de Neo, ORA-2 anexo con UNIQUE incondicional, ORA-3 PG omitido, ORA-4 OUT_DIR fijo en sentinels); tsc/vitest(182p/9s)/oracles/traza 011,T1526,T1527 rc=0; stash sin entradas nuevas; acta .specify/memory/audits/oracle-011-T1526-T1527-bloqueD-2026-11-25.md
- 2026-11-25 oracle cierre Bloque D (#63) T1524-T1531: PASS CON OBS (ORA-1 MEDIA ratificación iter 226 no registrada en decisiones/anexo, ORA-2 D-4 sin PG, ORA-3..5 BAJA); tsc/oracles/traza 011+T1531 rc=0, vitest 210p/9s, PG17 propio 219/219; mutación D-4 falla; acta .specify/memory/audits/oracle-011-bloqueD-cierre-2026-11-25.md
2026-11-25 T1538-T1539 bloque F auditado: CUMPLE CON RESERVAS; acta en .specify/memory/audits/oracle-011-T1538-T1539-bloqueF-2026-11-25.md

## 2026-11-25 — 011 Bloque G (T1543/T1544/T1546)
- Veredicto CUMPLE CON RESERVAS; PG17 efimero verde; RES-1 trazabilidad T1543 rc1 (SC-011-046..052 sin ID individual), RES-2 deuda sin TECHDEBT. Acta oracle-011-T1547-bloqueG-2026-11-25.md.

## 2026-11-25 — 011 Bloque H (T1548-T1550, cierre T1552)
- Veredicto CUMPLE CON RESERVAS; PG17 real verde (71/1 skip placeholder); acta oracle-011-T1552-bloqueH-2026-11-25.md
- 2026-11-25 [oracle] Validación final Bloque H (tras S-1/S-2/OBS-1) hecha: CUMPLE CON RESERVAS; ver acta oracle-011-T1552.
- 2026-11-25 T1558 validacion Bloque I: CUMPLE CON RESERVAS; acta .specify/memory/audits/oracle-011-T1558-bloqueI-2026-11-25.md
- 2026-11-25 oracle: validé ampliación ficha mascota (011) -> CUMPLE CON RESERVAS; acta en audits/oracle-011-ampliacion-ficha-mascota-2026-11-25.md

## 2026-11-26 Auditoria commits 011
- Revise 70b47df, ebf6ec0, 73c058f, 2ee0162 contra disco.
- Hallazgo bloqueante: registerUserAvatarRoutes ausente en app.ts de 70b47df (18 pruebas t1554 rojas en worktree limpio, verdes en arbol sucio).
- verify-ci-ready: Semgrep (AdministratorsPanel, T1528 de 011) y archivos sin commit fallan; trazabilidad 011 y oraculos rc=0.
- Acta: .specify/memory/audits/oracle-011-auditoria-commits-2026-11-26.md

## 2026-11-26 T1559 cierre consolidado 011
- B-1 PASS (worktree limpio HEAD 4e83e72: app.ts cableado, tsc 0, t1554+t1535 vista previa 34 ok). B-2 PASS (Semgrep 0; verify-ci-ready i,ii OK; iii solo H-01/config). Traza 011 rc=0, oraculos rc=0.
- Hallazgo nuevo: test:gate en HEAD limpio rc=1 (49 rojas). 46 = tests de config sin commit; H-011-1 PetDashboard "OWNER/ADMIN" vs t1235/t1236 (ebf6ec0); H-011-2 AdministratorsPanel importa de web/ (4e83e72). Mi auditoria de ebf6ec0 no ejecuto test:gate.
- Acta: .specify/memory/audits/oracle-011-T1559-cierre-consolidado-2026-11-26.md (CUMPLE CON RESERVAS BLOQUEANTES). Worktrees eliminados.

## 2026-11-26 — T1559 revalidacion e7602fe
- test:gate HEAD limpio rc=1: 45 rojas/15 archivos, todas config (ARGOS_ADMIN_EMAILS) con arreglo sin commit; los 6 archivos H-01 verdes en HEAD. Arbol sucio: 8 rojas = lista H-01. t1238 28/28 x3 (flaky).
- admin-clock: CUMPLE SOLO LA FORMA; propuesto nosemgrep explicito (precedente SessionExpiryNotice). Gates tsc/semgrep/trace/oraculos OK. Acta ampliada; T1559 sin [x]. Worktree retirado.

## 2026-11-26 — T1559 revalidacion final en e3cf678
- Worktree limpio e3cf678 (eliminado). test:gate rc=1: 0 pruebas rojas, pero cobertura de ramas 94.65% < 95% (H-011-3, nuevo, fuera de lista H-01). Los 6 specs H-01 verdes en HEAD limpio.
- 738fe05 solo tests/**; e3cf678 solo admin-clock.ts: sin H-01. nosemgrep en l.14 antes de Date.now() l.15, regla exacta.
- tsc 0, semgrep 0, traza 011 0, oraculos 0. Veredicto: NO CUMPLE provisional (un bloqueo: cobertura). Sin [x], sin commits. Acta actualizada.

## 2026-11-26 — Revalidacion a50cdb5 (H-011-3)
- Worktree huerfano wt: sin cambios rastreados; retirado y recreado desde a50cdb5; eliminado al cierre.
- test:gate rc=0 (7681 ok, 0 rojas, ramas 95.21%); tsc, semgrep, verify-traceability 011, verify-oracles rc=0.
- Commit a50cdb5: 2 tests t1553 + 2 bitacoras; sin H-01/005 tasks/inbox. Higiene: bitacoras arrastran ~124/206 lineas ajenas a Keymaker.
- Veredicto T1559: CUMPLE CON RESERVAS (commit de H-01 por Neo antes de push). Sin [x].

## 2026-11-26 — Auditoría TECHDEBT-011-PREVIEW-AVATAR-HOGAR (HEAD 5bc4739)
- Worktree limpio: test:gate rc=0 (7683 passed, branches 95.23%, 0 rojas); SEN-IP-07 no reprodujo (3x aislado verde).
- Commits 5e112f7/ac0c64d/5bc4739 limpios (sin H-01, 005/tasks, inbox, logs); generated v33 solo descripción de petIds.
- Backend petIds en vista previa autenticada coincide con la autorización de Neo; avatar valida pertenencia y sesión.
- Gates tsc/semgrep/traceability 011/oracles/compile 005: rc=0, sin diff. Veredicto CUMPLE CON RESERVAS (H-01 sin commitear). Acta en .specify/memory/audits/oracle-011-preview-avatar-hogar-2026-11-26.md.

## 2026-11-26 — Auditoría purga de delegados (216f4b9)
- Worktree limpio desde 216f4b9; test:gate rc=1 x2 por 4 rojas intermitentes distintas (vacuum-sentinel, t591, t1525-tope PG, t1238), todas verdes aisladas; vitest completo 535/535, ramas 95.24 %.
- H-9 PASA (2 DELETE en src/, ambos con forma autorizada); retención 72/30/365 coincide; commit 216f4b9 con los 9 archivos esperados; tsc/semgrep/trace 011/oracles rc=0.
- Veredicto CUMPLE CON RESERVAS; acta en .specify/memory/audits/oracle-011-purga-delegados-2026-11-26.md. Worktree eliminado.

## 2026-11-26 — Auditoría fillSlots (0d56466) y desviación H-9 (b85e19a)
- Worktree limpio desde b85e19a; test:gate rc=1 por 1 roja intermitente (t1525-tope PG, loginRoot del arnés, no usa fillSlots); aislada 3/3 verde (37/37); vitest completo con cobertura 535/535, 8044 pruebas, ramas 95.24 %.
- 0d56466 correcto (lanza ante !=202 y conteo, sin PII; aserción 19 antes de la carrera; expectativa intacta). b85e19a ACEPTABLE: 2 delegados previos + 18 = 20, mismos 6 estados.
- tsc/semgrep/trace 011/oracles rc=0. Veredicto CUMPLE CON RESERVAS; acta en .specify/memory/audits/oracle-011-fillSlots-2026-11-26.md. Sin commit (decisión de Neo).

## 2026-11-26 — Auditoría T1612 (Feature 012, Bloque A, 3c2fa6c + DRAFT sin commit)
- Gates rc=0: traceability --feature 012 (295/295), verify-oracles (0 débiles), tsc; 5 JSON y OpenAPI (ruby) parsean; 25/25 ERR-* de spec en el catálogo.
- DRAFT intacto, sin [x] nuevos, APPROVED solo ENM-002-MINOR-012/ENM-005-A; ABSENCE_MIN_INACTIVE_DAYS=14 y secuencialidad coherentes en spec/data-model/contratos/T1625/T1627.
- Veredicto CUMPLE CON RESERVAS (11 archivos sin commit; falta firma de Neo/trinity). Acta .specify/memory/audits/oracle-012-T1612-2026-11-26.md.

## 2026-11-26 — Auditoría T1613 (Feature 012, Bloque A, 14e4370)
- Gates: traza 012 rc=0, oraculos rc=0, persistence 891 ok/0 fallos (PG omitido); tsc rc=2 solo por 13 errores de las rojas T1614/T1615 (modulos aun inexistentes), ninguno fuera de ellas.
- Commit 14e4370 limpio (9 archivos, sin H-01/005); paridad SQLite/PG de pet_co_owners, owner_requests, ownership_version y FK SET NULL identica; desviaciones de nombre (pet_assignments) y TEXT ISO documentadas solo en errata DRAFT untracked.
- Veredicto CUMPLE CON RESERVAS. Acta .specify/memory/audits/oracle-012-T1613-2026-11-26.md.

## `[2026-11-26 | Auditoria dominio 012 Bloque A, 68ec963..1283ba5]`
- Gates: tsc 0, oraculos 0, traza 012 0, semgrep 0 hallazgos; vitest 012: 197 verdes, 2 rojas (B-2 chip registrado, memoria+SQLite), 43 omitidas (PG); T1614 98 verdes.
- Commits sin H-01/005/contratos 001..011; 0034/0030 con paridad e integridad de datos; sin pruebas debilitadas (TRANSFER->CHANGE_PRINCIPAL en 2 casos, reserva).
- Veredicto CUMPLE CON RESERVAS. Acta .specify/memory/audits/oracle-012-dominio-2026-11-26.md.
- 2026-11-27 oracle: acta 012 1283ba5..8a68218 CUMPLE CON RESERVAS (5 reservas).

## 2026-11-27 — Validacion Bloque B v0.8
CUMPLE CON RESERVAS; gates rc=0/0; acta oracle-012-bloqueB-v08-2026-11-27.md. Sin aprobacion.
- 2026-11-27 [oracle] Auditoria Bloque B (ea3801c/dbb826b/206e80b): CUMPLE CON RESERVAS; acta en audits/oracle-012-bloqueB-migraciones-T1633-T1648-2026-11-27.md

## 2026-11-27 — Auditoria Bloque B T1636+T1643 (49243e7..1d294b8)
- Veredicto CUMPLE CON RESERVAS. Gates rc=0 (tsc, trace, oracles, trace --task T1635, vitest 218 verdes).
- Hallazgos: H-01 motivo no persistido, H-02 person_id sin via de asignacion, H-03 step-up nominal y en memoria (bloqueantes de produccion); H-04..H-07 menores. Acta en .specify/memory/audits/oracle-012-bloqueB-T1636-T1643-2026-11-27.md.
- 2026-11-27 oracle: rango 1d294b8..d5d6d47 NO CUMPLE por gate oráculos (O-01). Acta oracle-012-rango-1d294b8-d5d6d47-2026-11-27.md

## 2026-11-27 — Revision rojas T1653/T1654 (Bloque C, 3e9aae5 + 115fa8a)
- Veredicto CUMPLE CON RESERVAS. Constantes: las 10 coinciden. Gates en rojo: tsc rc=2 (15 errores, todos care), oracles rc=0, trace rc=0. Tras dba20eb: trace rc=1 (4 PURITY FAIL en src/domain/care).
- Firmas: F1 sin especie en validateCareRoutine, F2 id en planRoutineUpdate, F3 pureza, F4 created 200/201. Reservas R-1 (reloj hacia atras vs CHECK), R-2 (A-04), R-3 (tope 60 vs 100 filas), R-4 (PG sin sharing).
- Acta: .specify/memory/audits/oracle-012-BlocC-rojas-T1653-T1654-2026-11-27.md

## 2026-11-27 — T1661 b1016b1
Auditoría CUMPLE CON RESERVAS; ver acta oracle-012-T1661-retencion-b1016b1-2026-11-27.md. Reserva 3 pendiente de Neo.

## 2026-11-27 T1656 f52a0a4 — veredicto CUMPLE CON RESERVAS; ver acta .specify/memory/audits/oracle-012-T1656-f52a0a4-2026-11-27.md

## 2026-11-27 oracle T1656 c4afc1f
Veredicto CUMPLE; ver acta oracle-012-T1656-c4afc1f-2026-11-27.md.

## 2026-11-27 T1658 árbol
Acta oracle-012-T1658-arbol: CUMPLE CON RESERVAS; gates rc0; ver audits.

## 2026-11-27 T1658 b037dd1+6c860b5 revalidación
Acta oracle-012-T1658-b037dd1-6c860b5: CUMPLE CON RESERVAS. Gates tsc/oracles/traceability rc0; vitest 101 archivos 1087 tests verdes (PG real). Puntos 1-3 cumplen; H-T1658-1 MEDIO: CHECK dose_unit de 0035/0039 aún acepta IU; propuesta migración 0036 PG (DROP/ADD CONSTRAINT) y triggers SQLite 0040; t1652 :46/:167 a cambiar.

## 2026-11-27 — Bloque D #32 DRAFT 0.3.0 verificacion puntual
- Veredicto: CUMPLE CON RESERVAS; 12 puntos de Neo y re-auditorias verificados en disco (git diff HEAD + lectura de archivos nuevos).
- Gates rc=0: tsc, compile-contracts --feature 012 (generated sin deriva), verify-oracles (667/0 debiles), verify-traceability 012 (309/309).
- Hallazgos: H-A MEDIA (SC-122/127 sin tarea de codigo), H-C MEDIA (SC-086 y T1680 sin ampliar), H-B/D/E/F BAJA.
- Acta: .specify/memory/audits/oracle-012-QR-0.3.0-puntual-2026-11-27.md

## 2026-11-27 oracle Bloque D T1672-T1674
CUMPLE x3; gates rc=0; acta audits/oracle-012-bloqueD-T1672-T1673-T1674-2026-11-27.md

## 2026-11-27 oracle Bloque D fase verde
CUMPLE CON RESERVAS; H-D1..H-D7; gates rc=0; acta oracle-012-bloqueD-verde-3861257-1ffbad9-2026-11-27.md

## 2026-11-27 oracle Bloque D lote final backend
CUMPLE CON RESERVAS; gates rc=0 (tsc, oracles 687/0 debiles, traz 012, vitest 18 archivos/352); H-BD-F1 purga audit EMERGENCY_* 90 d ausente; T1674 a/b/c CORRECTAS; acta oracle-012-bloqueD-backend-final-2026-11-27.md

## 2026-11-27 /oracle — T1676 UI QR + T1681/82/85 (23008cc..755f130)
Veredicto CUMPLE CON RESERVAS; D-1 literal ARGOS vs REQ-TIP10-001/t1404, D-2 alergias por rol, D-3 alcance withoutAnnexFields, R-3 guarda sin handler real. tsc/oraculos/trazabilidad rc=0; presentation 1027/1027. Acta: .specify/memory/audits/oracle-012-T1676-755f130-2026-11-27.md

## 2026-11-28 — Auditoría 012 D-1/D-2/D-3 (4937203)
- Veredicto CUMPLE CON RESERVAS. tsc, oráculos (0 débiles) y trazabilidad 012 rc=0; vitest dirigido 44+12 verdes; v38 sin deriva; 0 "ARGOS no verifica".
- Reservas: commit trae 6 archivos (tasks.md con T1681/T1685 en [x] sin firma de Neo en disco); schema/annex/legal-texts 010 con Tipi sin commitear.
- Acta: .specify/memory/audits/oracle-012-D1-D2-D3-4937203-2026-11-28.md. T1676/T1682 no marcadas.

## 2026-11-28 — Revalidación H-2 (commit 6581ea2)
- 6581ea2 toca solo legal-texts.md (010), emergency-additive-annex.md y emergency-card.schema.json; sin staged pendientes.
- allergiesEditorHelp en schema == emergency-texts.ts (domain y web) en HEAD, literal "Tipi no verifica…"; 0 "ARGOS no verifica" en src/, tests/, contratos 012.
- Gates sobre HEAD: verify-traceability --feature 012 rc=0 (CUMPLE), verify-oracles rc=0 (691 archivos, 0 débiles).
- Veredicto: H-2 CERRADO. Observación menor: spec.md:112 (REQ-QR12-002) aún dice «ARGOS no verifica»; fuera del alcance de H-2, para /architect.

## 2026-11-28 — Auditoría lote T1678/T1683 (13a5537..f4f9ed1, base 6581ea2)
- Veredicto CUMPLE CON RESERVAS: 0 ALTA/MEDIA, 2 BAJA, 3 INFO. tsc rc=0; verify-oracles 693/0 débiles rc=0; traceability 012 309/309 rc=0; vitest dirigido 6 archivos 116 verdes (27 PG omitidos).
- H-T1678-01 CERRADO CON NOTA (inject normaliza %2e%2e vía new URL; prueba por socket real lo confirma; sin cambio de enrutador, no requiere Neo). Resto de hallazgos (MEDIA-1, BAJA-2, H-T1678-02, B-01, S-1..3) CERRADOS.
- Ningún commit toca contratos/generated/spec/data-model/annex/legal-texts/tasks/H-01/005/logos.
- Acta: .specify/memory/audits/oracle-012-lote-T1678-T1683-2026-11-28.md

## 2026-11-28 — Cierre Bloque D (211a5b6..9b642b6)
- CUMPLE CON RESERVAS: 0 ALTA/MEDIA, 2 BAJA, 3 INFO. tsc rc=0; verify-oracles 693/0 débiles; traceability 012 CUMPLE; vitest dirigido 6 archivos 100 verdes/31 omitidos (PG).
- RAMA-01 y RAMA-02 conformes a annex §7/§10; actorUserId coherente con §10.4(b) (texto §10.2 desfasado, BAJA-1). Importación de respaldo no llama al hook pero CASCADE borra ficha y consentimientos (BAJA-2, no bloquea).
- Commits aislados: sin Bloque E, H-01, 005 ni logos; server.ts de 957fac0 sin originVerifySecret.
- Acta: .specify/memory/audits/oracle-012-bloqueD-cierre-211a5b6-9b642b6-2026-11-28.md

## 2026-11-28 — Validación ENM-005-E DRAFT 0.2.2 (Bloque E, #81, solo lectura)
- Veredicto CUMPLE CON RESERVAS: 0 CRITICA/ALTA/MEDIA, 3 BAJA, 4 INFO. Las 5 decisiones de Neo (MEDIA-6, R2-04 B, R2-03, filtro de logs Fase 1, EDGE-077) aplicadas sin contradicción; correcciones r3 cerradas.
- Gates: compile-contracts --feature 012 rc=0; verify-oracles 693/0 débiles rc=0; tsc rc=0; traceability 012 rc=0 (317/317).
- BAJA-1 residuos 0.2.1 (annex §10.2, catálogo); BAJA-2 spec REQ-VET12-007/T1701 sin la regla owner/ADMIN no titular = 404; BAJA-3 matriz de retención de data-model sin R2-04.
- Acta: .specify/memory/audits/oracle-012-ENM-005-E-0.2.2-2026-11-28.md

## 2026-11-28 — Auditoría cadena 13bf24f..4857c3a (T1692, T1693, T1694; Bloque E, #81, solo lectura)
- Veredicto CUMPLE CON RESERVAS: 0 ALTA/MEDIA, 3 BAJA, 5 INFO. Bump 005 conforme a ENM-005-E §1/§10.2; 0042 SQLite y 0038 PG conformes a annex §2/§8 (PG solo estático).
- Gates: tsc rc=0; verify-oracles 700/0 débiles; traceability 012 rc=0 (317/317); compile-contracts 012 rc=0 sin deriva. Rojas: 50 rojas por falta de implementación, 9 verdes deliberadas, 5 omitidas (PG).
- BAJA-1 annex §10.2 dice firma pendiente; BAJA-2 denied() acepta cualquier excepción; BAJA-3 emergency-migration relajado a toContain. 4 fallos heredados «última migración» no son de esta cadena.
- Acta: .specify/memory/audits/oracle-012-T1692-T1694-13bf24f-4857c3a-2026-11-28.md

## 2026-11-28 — Auditoría fase verde Bloque E (0d92275..9e8a48d, #81, solo lectura)
- Veredicto CUMPLE CON RESERVAS: 1 ALTA, 1 MEDIA, 3 BAJA, 6 INFO. tsc rc=0; verify-oracles 704/0 débiles rc=0; traceability 012 317/317 rc=0; compile-contracts 012 rc=0 sin deriva; vitest dirigido 13 archivos, 125 verdes/9 omitidos.
- Backend conforme: default-deny exhaustivo (4 funciones), bandera exacta al arrancar y 404 uniforme, autoridad y revocación entera con R2-04 (B), hooks en todos los caminos, idempotencia, activeCount. Staging selectivo limpio (sin H-01, logos, 005/tasks).
- ALTA-1 aviso previo al actor solo en la confirmación de revocar (annex §5.1, D-1); MEDIA-1 selector solo con ownerUserId = usuario (co-poseídas fuera). Límite de vista previa 30/10 min: aceptable (BAJA-2, contrato calla el valor).
- Acta: .specify/memory/audits/oracle-012-faseverde-E-0d92275-9e8a48d-2026-11-28.md

## 2026-11-28 — Revalidación lote corrección fase verde Bloque E (25b5e58..223fdcb, #81, solo lectura)
- Veredicto CUMPLE CON RESERVAS: 0 ALTA, 1 MEDIA, 3 BAJA, 4 INFO. tsc rc=0; verify-oracles 707/0 débiles; traceability 012 rc=0; vitest dirigido 9 archivos 99 verdes/3 omitidos.
- MEDIA-1 previa (selector co-poseídas) y BAJA-1 previa (precheck) cerradas; t1517 P-3 por nombre OK. ALTA-1 cerrada en parte: falta aviso en el flujo TRANSFER (TransferOwnership.tsx); CHANGE_PRINCIPAL es sobre-aviso inocuo; fail-open aceptable.
- Staging sin H-01/logos/tasks. Acta: .specify/memory/audits/oracle-012-faseverde-lote2-25b5e58-223fdcb-2026-11-28.md

## 2026-11-28 — Revalidación MEDIA-1 transferencia (2ade05c, solo lectura)
- Veredicto CUMPLE: 0 ALTA/0 MEDIA/1 BAJA/1 INFO. tsc rc=0; verify-oracles 707/0 débiles; traceability 012 rc=0; vitest dirigido 4 archivos 28 verdes.
- Guard antes del POST, fail-open, texto único reutilizado, prueba roja real (0 símbolos en 2ade05c^), solo 2 archivos tocados. Desbloquea firma T1695..T1702 por Neo.
- Acta: .specify/memory/audits/oracle-012-MEDIA1-transferencia-2ade05c-2026-11-28.md
