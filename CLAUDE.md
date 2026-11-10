# CLAUDE.md — Gobernanza y Ecosistema de Skills SDD de ARGOS (Edición *The Matrix*)

## 1. Autoridad Humana Nivel 2: `Neo` (`Andrés Vallejo`)
- En este repositorio (**Proyecto ARGOS — Pet Health & Biometric Tracker**), el usuario humano **Andrés Vallejo es `Neo` (`El Elegido` — Autoridad Nivel 2)**.
- **Potestad Exclusiva de `Neo` (Nivel 2):** Ningún agente ni skill puede:
  1. Marcar una tarea como `COMPLETED` en `specs/001-pet-health-tracker/tasks.md` (el techo de los agentes es `REVIEW`).
  2. Cambiar el estado de documentos normativos a `APPROVED` o `LOCKED`.
  3. Autorizar dependencias externas de Nivel 2 (`.specify/memory/constitution.md`, Technology Stack & Repository Structure).
  4. Ejecutar `git push` o eliminar locks de Git (`.git/index.lock`).
- Todo escalamiento al humano DEBE usar el encabezado: **`PARA: Neo (Andrés Vallejo — Nivel 2)`**.

---

## 2. Regla Inquebrantable de Cierre de Sesión en Lenguaje Natural (`"cerremos sesión"` → `/hardline`)
Cuando **Neo** escriba en lenguaje natural frases como ***"cerremos sesión"***, ***"cerrar sesión"***, ***"cierra la sesión"***, ***"cierra sesión"***, ***"terminemos por hoy"*** o ***"dame salida"*** (incluso si NO escribió `/hardline`):
1. **Activa inmediatamente `.claude/skills/hardline/SKILL.md`.**
2. Detén cualquier tarea o edición nueva en el acto.
3. Inspecciona el estado físico real en disco (`git status --short --branch`, `git log -1 --oneline`, `git diff --stat`).
4. Actualiza la bitácora del personaje activo en `claude/log-<personaje>.md` y genera/actualiza `claude/handover-<personaje>-YYYY-MM-DD.md`.
5. Sincroniza el bus central `claude/registro-proceso-argos.md` y verifica `specs/001-pet-health-tracker/tasks.md`.
6. Imprime el bloque compacto de despertar listo para copiar y pegar en la siguiente ventana.

---

## 3. Bitácora Incremental en Disco (`Write-Ahead Log`) — Cero Dependencia de la Ventana de Contexto
La ventana de conversación es efímera; **el disco es la única fuente de verdad**:
- Cada skill posee su propia bitácora incremental en `claude/log-<personaje>.md` y comparte el bus central `claude/registro-proceso-argos.md`.
- **Al despertar:** Toda skill DEBE leer primero `claude/registro-proceso-argos.md` y su `claude/log-<personaje>.md`.
- **En cada micro-hito (en caliente):** Cada vez que una skill toma una decisión (`CC-*`), edita un archivo, crea un commit local, ejecuta una compuerta o emite un hallazgo (`H-*`), **primero añade un registro fechado de 3–5 líneas en `claude/log-<personaje>.md` y una línea en `claude/registro-proceso-argos.md` antes de responder en el chat**.

---

## 4. Topología de Llamadas Directas (`MAX_HOPS = 2`) y Sobre Multiversal `DE: / PARA:`
1. **Sobre Estructurado Obligatorio:** Toda respuesta de cualquier skill DEBE cerrar con el bloque:
   ```text
   DE: <Personaje / Rol>
   PARA: <Destinatario>
   ESTADO: <En progreso | Bloqueado | Validación requerida>
   DETALLE: <Contenido en lenguaje claro + evidencia en disco>
   SIGUIENTE PASO RECOMENDADO: <Comando o acción exacta>
   ```
2. **Cortafuegos contra Bucles Infinitos:**
   - `/keymaker` ↔ `/architect`: Máximo **1 ida y vuelta (`MAX_HOPS = 2`)** para dudas de especificación/contrato (Caso B). Si persiste, escalan a `/zion` o `/morpheus`.
   - `/keymaker` o `/architect` → `/oracle`: Toda entrega pasa por validación en disco de `/oracle` (**`MAX_RETRY = 1`**).
   - **Portavoces ante `Neo`:** Solo **`/oracle`**, **`/morpheus`** y **`/neb`** detienen la cadena para hablar directamente con **Neo**.

---

## 5. FinOps de Modelos — Regla de 3 Niveles (`haiku` N1 → `sonnet` N2 → `opus` N3)
- **Nivel 1 (`haiku` — Por defecto en las 24 skills):** Todas las 24 skills arrancan en `haiku`. Toda conversación sencilla, consulta de estado, lectura de bitácoras (`claude/log-*.md`), ejecución de scripts (`verify-traceability.sh`, `verify-oracles.sh`, `tsc`) y coordinación entre roles se resuelve en `haiku`.
- **Nivel 2 (`sonnet` — Segundo nivel para ejecución importante):** Se escala a `/model sonnet` únicamente cuando `/architect`, `/keymaker`, `/oracle`, `/trinity` o `/zion` van a ejecutar trabajo profundo (diseñar/editar contratos o specs complejos, programar features en `src/` y `tests/`, hacer auditoría forense línea por línea o moderar un debate en `/zion`). Al terminar la tarea, se regresa a `haiku`.
- **Nivel 3 (`opus` — Máximo nivel para cirugía crítica):** Reservado exclusivamente para algoritmos complejos, bugs transaccionales/criptográficos difíciles o decisiones arquitectónicas de altísima complejidad donde `sonnet` no baste. Se activa solo en ese turno puntual y se regresa inmediatamente a `haiku`.

---

## 6. Mapa de Rutas Canónicas (Spec Kit v2.4.0)
- **Plano de Control SDD:** `spec-system.md` (`LOCKED`)
- **Constitución:** `.specify/memory/constitution.md`
- **Feature 001 (Spec, Plan, Tasks):** `specs/001-pet-health-tracker/{spec,plan,tasks,research,data-model,quickstart}.md`
- **Checklists de Compuerta:** `specs/001-pet-health-tracker/checklists/{requirements,code-review,oracle-validation}.md` y `.specify/memory/audits/spec-review.md`
- **Contratos Formales:** `specs/001-pet-health-tracker/contracts/{schemas,openapi,state-machines,errors}/` (compilados con `bash scripts/compile-contracts.sh` hacia `src/generated/`)
- **Compuertas Automáticas:** `bash scripts/verify-traceability.sh`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit`, `npm run test:gate`
- **Bus de Memoria Viva:** `claude/registro-proceso-argos.md`, `claude/log-<personaje>.md`, `claude/handover-<personaje>-YYYY-MM-DD.md`
