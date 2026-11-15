# CLAUDE.md — Gobernanza y Ecosistema de Skills SDD de ARGOS (Edición *The Matrix*)

## 1. Autoridad Humana Nivel 2: `Neo` (`Andrés Vallejo`)
- En este repositorio (**Proyecto ARGOS — Pet Health & Biometric Tracker**), el usuario humano **Andrés Vallejo es `Neo` (`El Elegido` — Autoridad Nivel 2)**.
- **Potestad Exclusiva de `Neo` (Nivel 2):** Ningún agente ni skill puede:
  1. Marcar una tarea como `COMPLETED` en `specs/001-pet-health-tracker/tasks.md` (el techo de los agentes es `REVIEW`).
  2. Cambiar el estado de documentos normativos a `APPROVED` o `LOCKED`.
  3. Autorizar dependencias externas de Nivel 2 (`.specify/memory/constitution.md`, Technology Stack & Repository Structure).
  4. Ejecutar `git push` o eliminar locks de Git (`.git/index.lock`).
- Todo escalamiento al humano DEBE usar el encabezado: **`TO: Neo (Andrés Vallejo — Level 2)`**.

---

## 2. Regla Inquebrantable de Cierre de Sesión en Lenguaje Natural (`"close session"` / `"cerremos sesión"` → `/hardline`)
Cuando **Neo** escriba en lenguaje natural frases como ***"close session"***, ***"cerremos sesión"***, ***"cerrar sesión"***, ***"cierra la sesión"***, ***"terminemos por hoy"*** o ***"dame salida"*** (incluso si NO escribió `/hardline`):
1. **Activa inmediatamente la skill `/hardline` (`~/.claude/skills/hardline/SKILL.md`).**
2. Detén cualquier tarea o edición nueva en el acto.
3. Inspecciona el estado físico real en disco (`git status --short --branch`, `git log -1 --oneline`, `git diff --stat`).
4. Actualiza la bitácora del personaje activo en `claude/log-<personaje>.md` y genera/actualiza `claude/handover-<personaje>-YYYY-MM-DD.md`.
5. Sincroniza el bus central `claude/registro-proceso-argos.md` y verifica `specs/001-pet-health-tracker/tasks.md`.
6. Imprime el bloque compacto de despertar listo para copiar y pegar en la siguiente ventana.

---

## 3. Bitácora Incremental en Disco (`Write-Ahead Log`) — Cero Dependencia de la Ventana de Contexto
La ventana de conversación es efímera; **el disco es la única fuente de verdad**:
- Cada skill posee su propia bitácora incremental en `claude/log-<personaje>.md`, comparte el bus central `claude/registro-proceso-argos.md` y consulta los hechos fijos en `claude/entorno-y-lecciones.md`.
- **Hooks automáticos (`.claude/settings.json`):** `SessionStart` (`startup|resume|compact`) inyecta automáticamente el estado Git, `claude/entorno-y-lecciones.md` y las últimas entradas del bus al abrir o compactar sesión; `PreCompact` recuerda persistir checkpoints antes de comprimir contexto.
- **Al despertar:** Toda skill DEBE leer primero `claude/registro-proceso-argos.md`, `claude/entorno-y-lecciones.md` y su `claude/log-<personaje>.md`.
- **En cada micro-hito (en caliente):** Cada vez que una skill toma una decisión (`CC-*`), edita un archivo, crea un commit local, ejecuta una compuerta o emite un hallazgo (`H-*`), **primero añade un registro fechado de 3–5 líneas en `claude/log-<personaje>.md` y una línea en `claude/registro-proceso-argos.md` antes de responder en el chat**.
- **Rotación entre features:** Al cerrar una feature (`001` → `002`), `/hamann` o `/morpheus` archivan las bitácoras extensas cerradas para evitar inflar el contexto de sesiones nuevas (*Progressive Disclosure*).

---

## 4. Topología de Llamadas Directas (`MAX_HOPS = 2`) y Sobre Multiversal `FROM: / TO:`
1. **Sobre Estructurado Obligatorio:** Toda respuesta de cualquier skill DEBE cerrar con el bloque canónico:
   ```text
   FROM: <Character / Role>
   TO: <Recipient>
   STATUS: <In Progress | Blocked | Validation Required>
   DETAILS: <Content + disk-backed evidence>
   RECOMMENDED NEXT STEP: <Exact command or action>
   ```
   - **Regla de Cierre en Modo Logos:** Cuando el canal `logos.json` esté activo (`logos.py wait` corriendo en segundo plano), es obligatorio anexar inmediatamente debajo de `RECOMMENDED NEXT STEP:` el banner visual `┌─ Note ─┐` de la skill activa como últimas líneas de la respuesta en terminal.
2. **Cortafuegos contra Bucles Infinitos:**
   - `/keymaker` ↔ `/architect`: Máximo **1 ida y vuelta (`MAX_HOPS = 2`)** para dudas de especificación/contrato (Caso B). Si persiste, escalan a `/zion` o `/morpheus`.
   - `/keymaker` o `/architect` → `/oracle`: Toda entrega pasa por validación en disco de `/oracle` (**`MAX_RETRY = 1`**).
   - **Portavoces ante `Neo`:** Solo **`/oracle`**, **`/morpheus`** y **`/neb`** detienen la cadena para hablar directamente con **Neo**.

---

## 5. FinOps de Modelos — Regla Automática de 3 Niveles (`haiku` N1 → `sonnet` N2 → `opus` N3)
- **Nivel 1 (`haiku` — Orquestadores y consulta rápida):** Roles de coordinación, triage y lectura (`/morpheus`, `/neb`, `/link`, `/hardline`, etc.) corren en `haiku`.
- **Nivel 2 (`sonnet` — Despacho automático de ejecución):** `/architect`, `/keymaker`, `/oracle`, `/sati`, `/trinity`, `/seraph` y `/zion` ya declaran `model: sonnet` en su `SKILL.md`. Cuando `/morpheus` los despacha como subagentes vía herramienta `Agent` (`subagent_type: "general-purpose"`), Claude Code los ejecuta automáticamente en `sonnet` **sin** pedirle a Neo cambiar `/model` manualmente.
- **Nivel 3 (`opus` — Cirugía crítica y ataque adversarial):** `/smith` declara `model: opus` y se despacha automáticamente en `opus` para caos/resiliencia o problemas transaccionales/criptográficos de máxima complejidad.
- **Nota de Portabilidad (`model:` en `SKILL.md`):** El campo `model:` en el frontmatter YAML de las skills es una extensión propietaria de Claude Code. En otros entornos (como Google Antigravity o herramientas de OpenAI) esta propiedad no tiene soporte nativo y se ignora silenciosamente, ejecutando la skill con el modelo activo del entorno.

---

## 6. Mapa de Rutas Canónicas (Spec Kit v2.4.0)
- **Plano de Control SDD:** `spec-system.md` (`LOCKED`)
- **Constitución:** `.specify/memory/constitution.md`
- **Feature 001 (Spec, Plan, Tasks):** `specs/001-pet-health-tracker/{spec,plan,tasks,research,data-model,quickstart}.md`
- **Checklists de Compuerta:** `specs/001-pet-health-tracker/checklists/{requirements,code-review,oracle-validation}.md` y `.specify/memory/audits/spec-review.md`
- **Contratos Formales:** `specs/001-pet-health-tracker/contracts/{schemas,openapi,state-machines,errors}/` (compilados con `bash scripts/compile-contracts.sh` hacia `src/generated/`)
- **Compuertas Automáticas:** `bash scripts/verify-traceability.sh`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`
- **Bus de Memoria Viva y Hooks:** `claude/registro-proceso-argos.md`, `claude/entorno-y-lecciones.md`, `claude/log-<personaje>.md`, `claude/handover-<personaje>-YYYY-MM-DD.md`, `.claude/settings.json`
