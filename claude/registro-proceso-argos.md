# Registro Central del Proceso SDD — Proyecto ARGOS (Bus Inter-Sesión `/logos`)

> **Propósito:** Bus central de memoria persistente en disco para las 24 skills de *The Matrix* en ARGOS. Ninguna skill depende de la ventana de conversación: toda decisión, commit, hallazgo o transición se registra aquí y en `claude/log-<personaje>.md`.

---

## 1. Fotografía de Estado Actual en Disco (Bootstrap Inicial — `2026-11-09`)

- **Autoridad Nivel 2:** **Neo (`Andrés Vallejo`)**
- **Rama Activa:** `001-pet-health-tracker` (creada desde `spec/v2.2.0-review` en `76a31bf`)
- **Último Commit en Disco (`HEAD`):** `329c392` — `docs(speckit): registro de decisiones del Arquitecto sobre la migración`
- **Commits Recientes de Migración Spec Kit:**
  - `329c392`: `docs(speckit): registro de decisiones del Arquitecto sobre la migración`
  - `3ed71e2`: `chore(speckit): cambios de Nivel 2 para Spec Kit (rutas, constitución §7, compuerta)`
  - `62486e4`: `docs(speckit): migración de artefactos SDD a la estructura de GitHub Spec Kit`
  - `9fbac7c`: `chore(speckit): renombra artefactos a rutas Spec Kit con git mv`
  - `76a31bf`: `docs(TASK-115): firma humana de checklist oracle-validation (autorizada por Andrés Vallejo)`
- **Estado de la Cola de Tareas (`specs/001-pet-health-tracker/tasks.md`):**
  - `TASK-100` (`T001`) a `TASK-114` (`T015`): **`COMPLETED`** (15/16 tareas completadas y firmadas).
  - `TASK-115` (`T016` — Cierre documental y checklists de compuerta): **`REVIEW`** (`code-review.md` y `oracle-validation.md` firmados y re-firmados en formato `CHK###`; pendiente firma Nivel 2 de **Neo** en `.specify/memory/audits/spec-review.md` y cierre final).
- **Estado de Compuertas Verificadas:**
  - `bash scripts/verify-traceability.sh`: **CUMPLE** (96/96 IDs vigentes, 0 violaciones de pureza).
  - `bash scripts/verify-oracles.sh`: **CUMPLE** (65 archivos, 0 oráculos débiles).
  - `npx tsc --noEmit`: **CUMPLE** (0 errores).
  - Pendiente ejecutar `npm run test:gate` completo en macOS y confirmar cierre de migración Spec Kit.

---

## 2. Deuda Técnica Activa Registrada en `tasks.md`

| ID Deuda | Descripción | Estado | Responsables |
| :--- | :--- | :--- | :--- |
| **`DEUDA-TIPADO-001`** | 3 usos de `any` en `tests/unit/application/backup-import-export.spec.ts` y 1 non-null assertion (`!`) en `src/infrastructure/persistence/sqlite/migrations.ts:76` | Abierta (No bloqueante) | `/keymaker`, `/dojo`, `/oracle` |
| **`DEUDA-DEP-001`** | Vulnerabilidad moderada en `react-router` / `@remix-run/router` reportada por `npm audit`; se resuelve al migrar a React Router v7 (requiere autorización Nivel 2 de **Neo**) | Abierta (Documentada) | `/merovingian`, `/trinity`, `/keymaker` |

---

## 3. Historial Cronológico de Eventos del Bus (`Write-Ahead Log`)

- **`[2026-11-09 | 76a31bf | Neo + Oracle]`** Firma humana autorizada por **Neo (Andrés Vallejo)** en `oracle-validation.md` para `TASK-115`.
- **`[2026-11-09 | 9fbac7c..3ed71e2 | Keymaker + Architect]`** Migración de artefactos SDD a la estructura oficial de GitHub Spec Kit (`specs/001-pet-health-tracker/` y `.specify/memory/`). Reporte detallado en `.specify/memory/speckit-migration-2026-11-09.md`.
- **`[2026-11-09 | 329c392 | Architect (/architect)]`** Registro de 6 decisiones arquitectónicas sobre la migración Spec Kit en `.specify/memory/speckit-migration-2026-11-09.md`:
  1. Re-firma de `code-review.md` y `oracle-validation.md` en formato `CHK###` (`.specify/memory/audits/checklist-signature-mapping-2026-11-09.md`).
  2. `spec.md` v2.4.0 aprobada por el Arquitecto con hash `2eef58a2fc8944fe`.
  3. Commit `3ed71e2` (Nivel 2) ratificado, incluyendo soporte `--task T###` en `verify-traceability.sh`.
  4. Principios IV y VI de la constitución aceptados sin ID de lineage.
  5. `tasks.md` v2.3.0 con líneas `T###` y alias `TASK-NNN` aprobado (`[x]` solo para `COMPLETED`).
  6. Re-ubicado `spec-review.md` hacia `.specify/memory/audits/spec-review.md` (pendiente de commit y firma Nivel 2 de **Neo**).
- **`[2026-11-09 | Ecosistema Matrix v1.0 | Inicialización]`** Instalación de las **24 skills de *The Matrix*** en `.claude/skills/<nombre>/SKILL.md` (`19 haiku` / `5 sonnet`), `CLAUDE.md` raíz y bitácoras incrementales `claude/log-*.md`. Jubilación de las ventanas conversacionales manuales anteriores.

---

## 4. Próximos Pasos en Cola para la Tripulación

1. **Verificación en disco por `/oracle`:** Auditar los cambios aún sin commitear en el árbol de trabajo (`git status`: renombrado de `.specify/memory/audits/spec-review.md`, actualizaciones en `plan.md`, `requirements.md`, `README.md` y `speckit-migration-2026-11-09.md`).
2. **Compuerta completa en macOS por `/keymaker` o `/seraph`:** Ejecutar `npm run test:gate` en el entorno macOS de **Neo**.
3. **Decisión Nivel 2 de `Neo`:** Revisar y autorizar la firma final de `.specify/memory/audits/spec-review.md` y el paso de `TASK-115` (`T016`) de `REVIEW` a `COMPLETED`.
- 2026-11-10 Arquitecto/Spec Kit: contratos movidos a specs/001-pet-health-tracker/contracts/, constitución v3.0.0, spec/plan/tasks en plantilla; gates: trazabilidad 96/96, oráculos 0 débiles, tsc OK, vitest 580/580 (copia scratch). Pendiente: TASK-NNN y §-refs en comentarios de src/tests/skills.
- 2026-11-10 Arquitecto: Neo confirma Status Approved en spec.md; plan/tasks/constitución no tienen campo de estado en Spec Kit, sin cambios. Alcance: solo organización Spec Kit.
- 2026-11-10 Arquitecto: tras /speckit-analyze alineé constitución (1024 px), plan (fila Principio VI) y tasks (dependencia T056/T057). G1 resuelto (spec Approved); G2 y I3 requieren confirmación de Neo.
- 2026-11-10 Arquitecto: Neo aprueba constitución v3.0.0 y ratifica desviación de tipado; reescribí Follow-up TODOs, plan (ratificación) y INV-HOUSE-001 (enlace a ERR-HOUSE-OWNER-CANNOT-LEAVE). Trazabilidad 96/96.
- 2026-11-10 Morpheus: despertar de sesión en HEAD `ef6af0d`. Cola: T001–T055 `[x]`, abiertas T056 (tipado `any`) y T057 (react-router v7). Hallazgos de Neo (1,2,3,4,5,6,8) registrados. Primer rol propuesto: `/architect` (cambios de contrato en DOG|CAT y en el texto de ERR-SCHEMA-VALIDATION-FAILED, y nuevas funciones de hogar). Sin COMPLETED, sin push.
- 2026-11-10 Morpheus/Neo (Nivel 2): hallazgos 2, 5 y 7 (rediseño visual, no 8) → Feature 002 tras cerrar 001. Hallazgo 6 → `/architect` (traducción en presentación). Orden: `/keymaker` arregla solo 1, 3 y 4 → `/oracle` valida en disco → `/architect` con el resto.
- 2026-11-10 Keymaker: hallazgos 1/3/4 de Neo. Causa del 3 y 4: claves React duplicadas en PetsPage (PetForm y PetDashboard con key=profile.id). Editando PetsPage.tsx, Field.tsx, AuthPages.tsx y pruebas unitarias. Sin contratos/git.
- 2026-11-10 Keymaker: hallazgos 1/3/4 listos. PetsPage (claves distintas), Field.tsx (PasswordField), AuthPages.tsx, tests unit auth-password.spec.ts y e2e auth-pet-forms.spec.ts. E2E 28/28 en Chrome real.
- 2026-11-10 Morpheus: Keymaker entrega bugs 1, 3 y 4 (cambios sin commit). Bug 4 = claves React duplicadas en PetsPage. Pendiente validación de `/oracle` en disco; discrepancia del bug 3 ("Agregar") por verificar.
- 2026-11-10 Oracle: PASS CON OBSERVACIONES a bugs 1/3/4; unit 581/582 (scrypt timeout preexistente), gates CUMPLE. Ver log-oracle.md.
- 2026-11-10 Oracle: veredicto PASS CON OBSERVACIONES sobre bugs 1, 3 y 4. Sin commit (decisión de Neo). e2e pendiente de corrida local. Scrypt timeout preexistente. Siguiente: Architect para hallazgo 6 y backlog Feature 002.
- 2026-11-10 Architect: hallazgo 6 (audits/hallazgo-6-traduccion-errores.md) y backlog Feature 002 (.specify/memory/backlog-feature-002.md) escritos; pendientes decisiones D1/D2 y preguntas de Neo. Sin commit.
- 2026-11-10 Architect: entrega diseño del hallazgo 6 (solo presentación, `.specify/memory/audits/hallazgo-6-traduccion-errores.md`) y backlog de Feature 002 (`.specify/memory/backlog-feature-002.md`). Pendientes para Neo: D1 (contrato para 422 del servidor) y D2 (lectura de REQ-UI-005).
- 2026-11-10 Morpheus/Neo: commits locales `cea2bf6` (UI) y `5bc48e4` (docs), sin push. Hallazgo 3 real = filtro "Nombre" con la misma etiqueta que el alta. Despacho a Keymaker para renombrar filtro. Pendiente: D1 y D2 de Architect.
- 2026-11-10 Keymaker: checkpoint hallazgo 3, renombrar etiquetas del filtro de mascotas (solo presentación); sin commit.
- 2026-11-10 Morpheus: Keymaker renombra filtros (PetCards.tsx) y añade prueba e2e; e2e no ejecutada por puerto 3000 ocupado (PID 73667, no tocado). Despacho a Oracle.
2026-11-10 | Oracle | Auditoria filtro Buscar mascota: PASS CON OBSERVACIONES (e2e pendiente de corrida por Neo)
- 2026-11-10 Oracle: filtros renombrados en PetCards.tsx, PASS CON OBSERVACIONES. E2E pendiente de corrida por Neo; commit pendiente de autorización.
- 2026-11-10 Neo: D1 aprobada (hallazgo 6 solo en presentación). D2 en espera de explicación.
- 2026-11-10 Morpheus/Neo: Fase 2 solicitada. Spec v2.1 (docx) conflicta con spec 001 Approved (email/SSO, CANINE/FELINE, roles distintos). Decisión Nivel 2 pendiente: ¿v2.1 reemplaza 001 o es 002? Despacho a Keymaker (bugs 1 y 2) y Architect (brecha y hoja de ruta).
- 2026-11-10 Neo (Nivel 2): Opción 2. 001 intacta (solo fallos reportados). Spec v2.1 = Feature 002 (Fase 2). Hoja de ruta bajo esa línea.
- 2026-11-10 Architect: Fase 2 entregada en .specify/memory/audits/fase-2-analisis-v21.md (brecha A, hallazgos 3-6 B, rutas C, hoja de ruta D). Recomienda Ruta 2 (Feature 002). Pendiente decisión Nivel 2 de Neo. Sin commit.
- 2026-11-10 Neo: D2 = A. Commit local de PetCards.tsx + e2e (sin push). Architect Fase 2 entregado (Ruta 2 recomendada).
- 2026-11-10 Keymaker: puertos e2e configurables (E2E_API_PORT/E2E_WEB_PORT) en playwright.config.ts y vite.config.ts; defaults 3000/5173. En curso, sin commit.
- 2026-11-10 Keymaker: bugs 1 y 2 no reproducibles en código (API OK); causa probable de entorno: Grafana en :3000 detrás del proxy de Vite. Añado 3 pruebas de regresión.
- 2026-11-10 Neo (Nivel 2): respondidas las 6 decisiones de la Feature 002 (username, timeout 30m/24h, especies aprobadas, matriz v2.1 para Cuidador, SSO/correo/PDF a 003, bloqueo de eliminación con hogar compartido). Hoja de ruta de la 002 en curso. `specs/002-*` requiere autorización aparte.
- 2026-11-10 Keymaker: puertos e2e listos; e2e 4 OK / 1 FALLA (auth-pet-forms.spec.ts:81, botón 'Entrar' vs 'Iniciar sesión'). Pruebas intactas. Sin commit.
- 2026-11-10 Keymaker: puertos e2e configurables; 4/5 pasan con Chrome del sistema en 3200/5273; falla un selector de la prueba nueva ("Entrar", no "Iniciar sesión"). Hay tres archivos de prueba modificados fuera de su alcance, por revisar.
- 2026-11-10 Keymaker: corrigiendo selector botón 'Iniciar sesión' -> 'Entrar' en auth-pet-forms.spec.ts:81 (solo ese archivo).
- 2026-11-10 Neo: confirma 6-A y 6-B como hallazgos separados. Despacho a Keymaker para diagnosticar 6-B.
- 2026-11-10 Keymaker: selector corregido (línea 81 'Entrar'); e2e 4 OK / 1 FALLA ahora en línea 90 (getByLabel('Nombre',{exact:true}) = 0; la etiqueta visible es 'Nombre *'). Aserciones intactas; config temporal borrada.
- 2026-11-10 Architect: hoja de ruta Feature 002 escrita en .specify/memory/audits/hoja-de-ruta-feature-002.md (fases F0–F8, rebanadas, sustitución de pruebas). Pendientes: 6-A/6-B, D1/D2, F2 clarify. Sin commit.
- 2026-11-10 Keymaker: editando aserción línea 90 de auth-pet-forms.spec.ts (selector form[aria-labelledby] input[name="name"]); verificando en puertos 3200/5273.
- 2026-11-10 Keymaker: línea 90 corregida; e2e auth-pet-forms 5/5 pasan (puertos 3200/5273). Config temporal borrada.
- 2026-11-10 Morpheus: hoja de ruta de la 002 entregada (F0–F8). Pendientes de Neo: autorizaciones [N2] y lista de fallos de la 001 antes de F0.
- 2026-11-10 keymaker: hallazgo 6-B, escribiendo e2e tests/e2e/visual/household-counter.spec.ts (REQ-HOUSE-001/REQ-UI-006) y luego contador de hogares en AppShell/HouseholdsPage.
- 2026-11-10 Neo: autoriza mover la API de desarrollo a otro puerto. Confirma que la API estaba caída al fallar el login (Grafana en 3000). Keymaker se despacha tras la validación de Oracle.
- 2026-11-10 oracle: auditoria sin commit (puertos E2E, selectores, 3 regresiones) PASS CON OBSERVACIONES; compuertas verdes; household-counter.spec.ts nuevo sin src asociado.
- 2026-11-10 keymaker: e2e household-counter falla antes (sin contador de hogares); editando AppShell.tsx (householdCount en contexto/encabezado).
- 2026-11-10 Oracle: validación de puertos, e2e y regresiones PASS CON OBSERVACIONES. Excluido household-counter.spec.ts. Keymaker despachado para mover la API a 3100.
- 2026-11-10 keymaker: editando puerto por defecto de API 3000 -> 3100 (app-config, vite, playwright, app-config.spec).
- 2026-11-10 Neo: autoriza F0 completo, T057 (react-router v7) y D2 = A. COMPLETED, push y etiqueta siguen siendo de Neo tras el veredicto verde de Oracle.
- 2026-11-10 keymaker: T057 en curso, migrando react-router-dom 6.30.6 -> ^7 (package.json, lock, src/presentation/web).
- 2026-11-10 keymaker: 6-B cerrado en REVIEW: AppShell.tsx (contador hogares) + tests/e2e/visual/household-counter.spec.ts; e2e 30/30, tsc/trazabilidad/oráculos OK.
- 2026-11-10 architect: añadiendo T058 (traducción de errores de esquema, solo presentación) a tasks.md; queda [ ] pendiente de Oracle/Neo.
- 2026-11-10 keymaker: editando T056 (any en backup-use-cases.spec.ts y ! en backup-migration.ts).
- 2026-11-10 Architect: T058 (6-A) añadida a tasks.md como pendiente. Trazabilidad 6/6. Falta validación de Oracle antes de implementar.
- 2026-11-10 keymaker: API dev/e2e movida a 3100 (app-config, vite, playwright, .env.example, app-config.spec); tsc, unit, integration y e2e 5/5 verdes. Pendiente decision de Neo sobre README/quickstart.
- 2026-11-10 Keymaker: 6-B reproducido. El "0" es el contador de invitaciones, no de hogares. Se añade contador neutro de hogares con e2e (30/30). Falta validación de Oracle.
- 2026-11-10 Morpheus: T056, puerto 3100 y 6-B listos para validación de Oracle. T057 en curso. T058 pendiente.
- 2026-11-10 keymaker: T057 listo para Oracle: react-router-dom ^7.18.5, audit 0 vulnerabilidades, tsc/presentation/trazabilidad OK, e2e auth-pet-forms 5/5 (Chrome, 3300/5299).
- 2026-11-10 Keymaker: T057 lista (react-router v7, npm audit 0). Pendiente validación de Oracle.
- 2026-11-10 oracle: auditados T056, puerto 3100 y contador 6-B → PASS/PASS CON OBS; compuertas verdes (tsc, vitest 215/215, trazabilidad 96/96, oráculos 0 débiles). Ver claude/log-oracle.md
- 2026-11-10 oracle: T057 react-router v7 -> PASS CON OBS (rango ^ vs pin exacto); archivos: package.json, package-lock.json. Ver claude/log-oracle.md
- 2026-11-10 Morpheus: commits locales F0 (sin push): 42bfd0d, c1b7186, a3af27d, 232fb72, 372f635. T058 y bitácoras sin commit.
- 2026-11-10 Morpheus: react-router fijado exacto (7.18.5); README y quickstart en 3100. Sin commit. Neo marca T056/T057 y hace push.
