---
handover_id: HANDOVER-NEB-CREW-2026-11-14
character: neb-crew
functional_role: Morpheus (orquestación) con Keymaker, Architect, Sati, Oracle, Seraph y Trinity
date: 2026-11-14
branch: 002-plataforma-v21
head_commit: 6c2e953f9440ccc11f0cc8996f6f812e73aba6e6 (6c2e953)
active_task: Fase 8, ola 2 (T302 a T311)
progress_percent: 91%
status: IN_PROGRESS
---

# Session Handover — Neb-Crew (2026-11-14)

## 1. Plain Language Summary for Neo (Project Lead / Level 2)
- Quedaron cerradas en Git la Rebanada 6 (T284 a T296) y la pieza de diseño T295 (ver commits 425c006 y 99a959a). También se commiteó la primera ola de seguridad de la Fase 8 (T297 a T301) en 6c2e953.
- Pendiente real: la segunda ola (T302 a T311). Los defectos de seguridad detectados se corrigieron (límite de scrypt, denylist de secretos en producción), pero ese trabajo y la ruta de cancelar invitación (T311) siguen sin commit.
- El score de mutación del 88 % es una medición no oficial. El comando oficial `npm run test:mutation` estaba bloqueado por pruebas de la 001; Keymaker las corrigió, y Seraph lanzó la medición oficial, que sigue corriendo al cerrar.

## 2. Active Task and Real Disk State
- **Task:** T303 a T310 (Fase 8, ola 2). Progreso global de la feature 002: 102 de 112 tareas marcadas (91 %). Incluye T204a marcada `[x]` en el árbol de trabajo, sin commit.
- **Latest On-Disk Commit:** `6c2e953` — test(002): fase 8 ola 1 — seguridad T297-T301 (V10-V16 y V12 en producción). Anteriores: `bf30703` (bus de la Rebanada 6), `99a959a` (cierre T295), `425c006` (cierre Rebanada 6).
- **Rama:** `ahead 6` respecto a `origin/002-plataforma-v21`. El remoto sigue en `ff0fe62`. **No hay push.** Neo lo reservó hasta T310.
- **Working Tree (`git status`):** 31 archivos modificados y 8 sin seguimiento. Agrupados:
  - **Código de Keymaker sin commit (src):** `src/application/use-cases/household-use-cases.ts` (caso de uso CancelHouseholdInvitationUseCase, T311), `src/infrastructure/adapters/scrypt-password-hasher.adapter.ts` (tope de scrypt, INV-AUTH-003), `src/infrastructure/http/routes/households.routes.ts` y `use-cases.ts` (ruta DELETE cancelInvitation).
  - **Pruebas de la 25 sustituciones y de T311 (tests):** `tests/integration/api/households.api.spec.ts`, `pets-records.api.spec.ts`, `contracts/canonical-fixtures`, `codegen-drift`, `generated-contracts`, `openapi-conformance`, `persistence/audit-pseudonym`, `presentation/web-client`, `security/exploits/session-csrf`, `unit/presentation/components`, `presentation-fixtures.ts`, `validation`, `view-model`.
  - **Documentos de trabajo (specs/.specify/claude):** `specs/002-plataforma-v21/tasks.md` (T311 nueva, T204a marcada `[x]` sin commit, referencia T309 en línea 19), `specs/002-plataforma-v21/checklists/sustitucion-pruebas-001.md` (columna Estado, 12 filas sustituida), y bitácoras.
  - **Ajenos a esta sesión, NO commitear sin decisión de Neo:** `.specify/memory/constitution.md` y `.specify/memory/audits/enmienda-principio-iii-002-borrador.md` (enmienda del principio III, pendiente de firma de Neo), `CLAUDE.md`, `GUIA-SKILLS-MATRIX.md`, `SKILLS-PROPUESTAS.MD`.
  - **Sin seguimiento:** `.playwright-mcp/`, `gate-T296-output.txt`, `logos.json`, `scripts/logos.py` (no versionar, orden de Neo), y los hallazgos nuevos `claude/analisis-t304-pruebas-001.md`, `claude/hallazgos-t302-trinity.md`, `claude/hallazgos-t303-mutacion.md`, `claude/mapeo-filas-pendientes-t304.md`.
- **Latest Executed Gates:**
  - `npx tsc --noEmit`: exit 0 (último registro).
  - Suites de unidad, integración, propiedad y seguridad: 1792 pruebas en verde (Seraph B y Keymaker). Seguridad: 267 de 267.
  - `verify-traceability.sh --feature 002`: 118/118, CUMPLE.
  - `verify-oracles.sh`: 116 archivos, 0 débiles, CUMPLE.
  - Accesibilidad E2E (`wcag.spec.ts`): **inestable**. Una fila de la tabla (20) falla en cada corrida, en una prueba distinta cada vez (timeouts de 60 s y `main` no visible). Sospecha: carga de la mutación de fondo; no confirmada.
  - `npm run test:mutation` (oficial): **en curso** al cerrar. Un proceso Stryker sigue activo (PID 32799 y workers). Si termina, su informe debe quedar en `claude/hallazgos-t303-mutacion-oficial.md`; si la sesión se cierra antes, el resultado se pierde y hay que relanzarlo.
  - Medición no oficial de Seraph (T303): 88 % con configuración temporal que excluye 11 suites. No vale como cumplimiento.

## 3. Decisions Made in Session
- **CC: Renovación de sesión (D1, Neo, opción a):** cualquier petición con sesión válida renueva `lastActivityAt`, también con 403, 404 o 422. Fijado en `tests/security/exploits/session-audit-import.security.spec.ts:119`.
- **CC: Denylist de secretos (V12, Neo aprobó):** fuera de `NODE_ENV=test` se rechazan el secreto de fixtures (por huella SHA-256) y la clave de desarrollo. Archivo: `src/infrastructure/config/app-config.ts`. Commit `6c2e953`.
- **CC: Tope de scrypt (INV-AUTH-003, Neo aprobó):** `verify` rechaza N, r o p por encima de `DEFAULT_SCRYPT_PARAMETERS`. Sin commit.
- **CC: Tabla de sustitución de la 001 (Neo firmó):** columna Estado, regla 6 («sustituida» solo si la prueba listada existe en el archivo listado y está en verde; nunca excluir de la ejecución) y filas 35 y 36. Rechazo total de excluir suites de Stryker o vitest.
- **CC: Cabecera a 320 px (Neo, opción A):** cuatro enlaces en flex-wrap, sin scroll interno ni `order-*`. Verificado en `AppShell.tsx`.
- **CC: Vista previa de importación (Neo, D-N1 opción A):** `architecture_spec.md` §3.6 y §3.7 enmendados; la UI consume `POST /backup/import/preview`.

## 4. Technical Debt and Open Blockers
- **Huecos de interfaz (Caso A, no resueltos, Neo debe decidir A o B):**
  1. Columna «Variación (%)» muestra «—» fijo en `view-model.ts` y `WeightChart.tsx`; el contrato 3.0.0 retiró `deltaPercent`.
  2. Cancelar invitación no aparece en la interfaz de hogares (T238 y T284 pendientes; `memberActions` no devuelve CANCEL_INVITATION).
  3. Un ADMIN no propietario no puede retirar miembros en la interfaz (el contrato lo permite).
  Estas tareas están marcadas `[x]` aunque la interfaz está incompleta: integridad a revisar.
- **Tabla de sustitución:** 12 filas en «sustituida» (Architect, verificadas en disco). 23 filas más cumplen la regla 6 según Keymaker (`claude/mapeo-filas-pendientes-t304.md`), pero dos filas tienen reserva:
  - Fila 4: el caso de migración 1.0.0/2.0.0 a 3.0.0 está en `backup-migration.spec.ts`, no en el archivo listado.
  - Fila 22: la prueba multi-feature está en `verify-gates.spec.ts`, no en el archivo listado.
  Neo debe decidir: marcarlas aceptando el archivo real, o corregir el archivo listado.
- **Fila 20 (wcag.spec.ts):** PENDIENTE_ROJO. Inestable, no reproducida en aislamiento.
- **T204a:** marcada `[x]` en el árbol de trabajo. No la marqué yo ni Keymaker; no se ha confirmado que Neo la haya firmado. Bloquea T306 si no está firmada.
- **H-T304-1 (Oracle debe revisar):** tareas marcadas `[x]` con filas de sustitución incompletas: T221, T226, T228, T240, T255, T284.
- **Semgrep (T302, M-2):** no instalado. SAST por grep sin coincidencias y `npm audit` en cero. Instalar sería dependencia de nivel 2; decisión de Neo.
- **M-1 (T302, menor):** V9 (XSS) tiene una prueba; ampliar a los cuatro roles (Caso A, no urgente).
- **Renovación de sesión en `test/security`:** cubierta por D1 (decisión firmada).

## 5. Wake-Up Order for Next Session Instance
- **Character to wake up:** `/morpheus`
- **Files to read first:**
  1. `claude/registro-proceso-argos.md`
  2. `claude/entorno-y-lecciones.md`
  3. `claude/handover-neb-crew-2026-11-14.md` (este archivo)
  4. `claude/log-morpheus.md`
  5. `specs/002-plataforma-v21/tasks.md`
  6. `claude/hallazgos-t303-mutacion.md`, `claude/analisis-t304-pruebas-001.md` y `claude/mapeo-filas-pendientes-t304.md`
- **Immediate action to execute:**
  1. Verificar en disco si terminó `npm run test:mutation` (buscar `claude/hallazgos-t303-mutacion-oficial.md`). Si no existe ni hay un proceso Stryker vivo, relanzarlo con `npm run test:mutation` (no excluir archivos ni suites). Si hay proceso vivo, esperarlo.
  2. Recordarle a Neo las decisiones pendientes: huecos de interfaz (A o B), reservas de filas 4 y 22, confirmación de la firma de T204a, decisión sobre Semgrep, y qué hacer con los cambios de `constitution.md` y de la enmienda del principio III.
  3. Pedir a Oracle la auditoría de T302, T303, T304 y T311 con el árbol estable, y la revisión de H-T304-1.
  4. No hacer push ni marcar COMPLETED sin orden de Neo. El push queda reservado para cuando se supere T310.

---

## 6. Actualización de cierre (Morpheus, segunda sesión 2026-11-14)

- **HEAD verificado:** `6c2e953` (sin commits nuevos). Rama `002-plataforma-v21`, ahead 6, **sin push**. Árbol sin cambios de esta sesión en `src/` ni `tests/`.
- **Mutación oficial (`npm run test:mutation`): NO CONCLUIDA.** Stryker terminó con `SIGKILL` (pid 76877). Salida en `/private/tmp/claude-501/-Users-andresvalejo-Documents-Tecnica-Proyecto-Argos/783efc3c-1d17-4b26-99d4-767a0a6071d4/scratchpad/mutacion-oficial-2026-11-14.txt`. Dentro del sandbox había pruebas rojas en la línea base: `households.routes` (EDGE-037/038, `expected … to deeply equal`) y `pets-records.api` (SUPERSEDED debe dar 409). **T303 y T309 siguen abiertas.** No existe `claude/hallazgos-t303-mutacion-oficial.md`. Puede quedar residuo en `.stryker-tmp/`.
- **Decisiones de Neo ratificadas (verificadas en disco):** constitución 3.2.0 y T204a `[x]` correctas. Ruta `DELETE …/invitations/:invitationId` aprobada (sin commit). Semgrep queda reservado para CI. Opción A para filas 4 y 22.
- **Filas 4 y 22:** Architect las marcó `sustituida`. Quedan **22 filas `pendiente`**. Architect advierte que `sqlite-backup-import.spec.ts` y `layer-dependencies.spec.ts` no contienen literalmente el escenario de la columna; Oracle debe verificarlo.
- **Tareas:** 102 `[x]`, 10 `[ ]` (T302, T303, T304, T305, T306, T307, T308, T309, T310, T311). Sin marcar ninguna nueva.
- **Handover de Morpheus del 14 (`claude/handover-morpheus-2026-11-14.md`) es de una sesión anterior** (HEAD `ff0fe62`, frente rojo R6). Quedó desactualizado; no se modificó.

### Próximo paso al despertar
1. Relanzar `npm run test:mutation` **sin exclusiones**. Primero corregir o confirmar las pruebas rojas de la línea base (households EDGE-037/038 y pets-records SUPERSEDED 409), porque matan la corrida.
2. Lanzar Oracle sobre T302, T303, T304, T311 y filas 4 y 22, con el árbol estable.
3. Pendiente de Neo: nada bloqueante de Nivel 2 (T204a y decisiones ratificadas). Solo falta el informe de mutación.

- **Nota de cierre (notificación de fondo):** el proceso devolvió `exit 0`, pero el log muestra un crash de Stryker al 15 % (770 de 3457 mutantes probados; 22 sobrevivientes, 5 timeouts; `ChildProcessCrashedError` SIGKILL). No hay informe de puntuación. Se considera no concluida.
