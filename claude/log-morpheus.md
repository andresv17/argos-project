# Bitácora Incremental — Morpheus (`/morpheus` — Capitán y Orquestador SDD)

> **Regla Write-Ahead Log:** Cada vez que `/morpheus` coordine la cola de tareas (`specs/001-pet-health-tracker/tasks.md`), despache una misión a la tripulación o consolide un reporte para **Neo**, debe añadir una entrada fechada al final de este archivo antes de responder en el chat.

---

## `[2026-11-09 | Bootstrap Inicial desde Commit 329c392]`
- **Estado de la Misión (`001-pet-health-tracker`):**
  - 15 de 16 tareas en estado `COMPLETED` (`TASK-100..TASK-114` / `T001..T015`).
  - 1 tarea activa en cierre final: `TASK-115` (`T016` — `REVIEW`).
  - Migración a GitHub Spec Kit ejecutada y con decisiones de `/architect` registradas en `.specify/memory/speckit-migration-2026-11-09.md`.
- **Orden de Batalla Recomendado:**
  1. Invocar `/oracle` para auditar el árbol de trabajo actual (`git status`) y validar la reubicación de `.specify/memory/audits/spec-review.md`.
  2. Invocar `/keymaker` para ejecutar `npm run test:gate` en macOS y commitear los archivos de cierre de la migración Spec Kit.
  3. Presentar a **Neo** la solicitud de firma Nivel 2 para cerrar `TASK-115` (`COMPLETED`) y los documentos Spec Kit (`APPROVED`/`LOCKED`).

---
## `[2026-11-10 | Despertar de sesión | HEAD ef6af0d]`
- Lectura en disco: bus, bitácora, `tasks.md` (T001–T055 `[x]`; T056 y T057 abiertas como deuda posterior a T055), constitución v3.0.0 y spec v2.4.0 `Approved` según el bus. Árbol de trabajo: `GUIA-SKILLS-MATRIX.md` y `SKILLS-PROPUESTAS.MD` modificados sin commit.
- Hallazgos de Neo recibidos (1, 2, 3, 4, 5, 6, 8; el 7 no fue enviado). Evidencia rápida: el mensaje "El payload incumple…" viene de `contracts/errors/error-catalog.json` (detailTemplate); DOG|CAT está en `contracts/schemas/pet.schema.json`; no existe código de "Mostrar contraseña" en `src/presentation/web`.
- Decisión CC-MORPHEUS-001: primer rol = `/architect`. Motivo: los hallazgos 2 y 6 cambian contratos/spec (LOCKED para agentes), y 5 pide nuevas funciones que requieren historias nuevas. Ningún agente toca `contracts/**` (prohibido a Morpheus).
- No se marcó ninguna tarea como COMPLETED. No se hizo commit ni push.

---
## `[2026-11-10 | Decisiones de Neo (Nivel 2) | Despacho a Keymaker]`
- Neo decide: hallazgos 2, 5 y rediseño visual → Feature 002 (después de cerrar 001). Hallazgo 6 → `/architect` prepara traducción de errores de esquema en capa de presentación (sin tocar `error-catalog.json` salvo decisión posterior).
- Corrección de numeración de Neo: el rediseño visual es el hallazgo **7** (no hay 8). Hallazgos vigentes: 1, 2, 3, 4, 5, 6, 7.
- Orden inmediato: `/keymaker` resuelve solo bugs de interfaz 1 (mostrar contraseña), 3 (nombre duplicado) y 4 (bucle de edición). Luego `/oracle` valida en disco. Luego `/architect` con el resto.
- Morfeo despacha a `/keymaker` (subagente, modelo sonnet por FinOps Nivel 2). Prohibido: tocar `contracts/**`, `src/generated/**`, marcar COMPLETED, push.

---
## `[2026-11-10 | Hand-back de Keymaker | Pendiente Oracle]`
- Keymaker reporta cambios en `Field.tsx`, `AuthPages.tsx`, `PetsPage.tsx` y dos pruebas nuevas. Bug 4 = claves React duplicadas (`key` igual en `PetForm` y `PetDashboard`). Bug 3 no reproducido aislado; no hubo cambio de contrato.
- Compuertas reportadas: tsc PASS, vitest 581/582 (falla preexistente de scrypt por timeout, según Keymaker), traceability 96/96, oracles 67 sin débiles, e2e 28/28 con Chrome del sistema.
- Discrepancia a verificar: Neo describió una sección 2 con botón "Agregar"; Keymaker no encontró ese texto en código (el botón dice "Guardar"). Oracle debe confirmar.
- Morfeo despacha a `/oracle` para validación forense en disco. No se marca nada COMPLETED.

---
## `[2026-11-10 | Veredicto Oracle | PASS CON OBSERVACIONES]`
- Oracle verifica en disco los 5 archivos de código y 2 pruebas nuevas. Sin cambios en contratos, spec, constitución ni tasks. Sin commits ni stash nuevos.
- Observaciones: e2e Playwright no verificado de forma independiente (Neo debe correr `npx playwright test tests/e2e/visual/auth-pet-forms.spec.ts`); scrypt timeout preexistente (a deuda/dojo); `GUIA-SKILLS-MATRIX.md` y `SKILLS-PROPUESTAS.MD` sin commit mezclados.
- La cadena "Agregar" no existe en `src/presentation/web`. Pendiente captura de Neo.
- Commit: decisión de Neo (no hecho). Nada marcado COMPLETED.
- Siguiente: Neo ordenó pasar a `/architect` con lo demás (hallazgo 6 en presentación; 2, 5, 7 como backlog de Feature 002 sin crear archivos hasta cerrar 001).

---
## `[2026-11-10 | Hand-back de Architect | Decisiones D1 y D2 para Neo]`
- Architect entrega: `.specify/memory/audits/hallazgo-6-traduccion-errores.md` (solución en presentación) y `.specify/memory/backlog-feature-002.md` (hallazgos 2, 5, 7 con preguntas abiertas). Sin implementación, sin `specs/002-*`, sin commit.
- D1 (Neo): ¿solo presentación para el hallazgo 6, o autorizar después un cambio de contrato para los 422 del servidor?
- D2 (Neo): REQ-UI-005 dice "mensajes del catálogo" y la spec está LOCKED. Propuesta: el código del catálogo no cambia y los mensajes humanos son solo redacción. Si Neo exige literalidad, hay que enmendar REQ-UI-005 antes de implementar.
- Pendiente: decisión de commit de los bugs 1, 3 y 4 (Neo); corrida e2e en su máquina; captura de la pantalla "Agregar" si existe.

---
## `[2026-11-10 | Commits autorizados por Neo | Hallazgo 3 real]`
- Neo autoriza commits locales (sin push). Creados: `cea2bf6` (fix UI: contraseña y claves únicas) y `5bc48e4` (docs skills y bitácoras).
- Capturas de Neo: el campo "Nombre" de la barra izquierda es un FILTRO de búsqueda, con la misma etiqueta que "Nombre *" del formulario de alta. Al pulsar "Nueva mascota", el alta abre vacía. Ese es el origen real del hallazgo 3; el arreglo de Keymaker no lo cubría.
- Decisión de Morfeo (default sensato, sin contrato): renombrar el filtro a "Buscar mascota" y el filtro de especie a "Filtrar por especie". Despacho a `/keymaker` y luego a `/oracle`.

---
## `[2026-11-10 | Hand-back Keymaker (etiquetas filtro) | Pendiente Oracle]`
- Cambio: `PetCards.tsx` (PetFilter): "Nombre" → "Buscar mascota" (+placeholder, aria-label), "Especie" → "Filtrar por especie". Prueba e2e nueva con [REQ-UI-001][REQ-UI-002].
- e2e NO ejecutada: puerto 3000 ocupado por PID 73667 (posible servidor de Neo). Keymaker no lo mató. Morfeo tampoco.
- Compuertas: tsc limpio; vitest 581/582 (scrypt preexistente); traceability y oracles CUMPLE.
- Siguiente: `/oracle` valida en disco; e2e queda pendiente hasta que Neo libere el puerto.

---
## `[2026-11-10 | Veredicto Oracle (filtros) | PASS CON OBSERVACIONES]`
- Diff limitado a `PetCards.tsx` (+4/-2) y la e2e nueva. Lógica de filtrado y alta intactas. Compuertas: tsc OK; vitest 581/582 (scrypt preexistente); traceability y oracles CUMPLE.
- E2E pendiente de corrida por Neo (puerto 3000 ocupado por PID 73667, y 5173 por PID 73666). No se mataron procesos.
- Observación: el aria-label "Buscar mascota por nombre" cambia el nombre accesible del campo; cumple WCAG 2.5.3 porque lo contiene. Validar con Sati si se quiere igualar.
- Commit de PetCards.tsx y la e2e: NO hecho, requiere orden de Neo (la autorización previa cubría solo los commits ya creados).

---
## `[2026-11-10 | Decisión de Neo D1 | D2 pendiente de aclaración]`
- D1 (Neo): el hallazgo 6 se resuelve solo en presentación. Sin cambio de contrato.
- D2 pendiente: Neo pidió explicación. Pregunta: ¿los mensajes humanos sustituyen el texto del catálogo (requiere enmendar REQ-UI-005, spec LOCKED) o el código del catálogo se mantiene y solo cambia la redacción visible?

---
## `[2026-11-10 | Fase 2 solicitada por Neo | Spec v2.1 recibida]`
- Neo entrega hallazgos 1–7 y la Especificación Técnica v2.1 (`/Users/andresvalejo/Downloads/Argos - Especificación Técnica de UI_UX y Pantallas.docx`, texto en scratchpad `v21/spec-v21.txt`).
- Conflicto de fondo con spec 001 (LOCKED/Approved): v2.1 usa email+SSO, `CANINE|FELINE`, `MALE|FEMALE`, roles Admin/Cuidador/Lector, contraseña de 10 caracteres con complejidad, 19 pantallas P-01..P-19. Requiere decisión Nivel 2 de Neo: ¿v2.1 reemplaza a 001, o es la 002?
- Bugs 1 y 2 (error "Ocurrió un error inesperado" al volver a iniciar sesión y al guardar mascota editada) son de la 001: se despachan a `/keymaker` ya.
- Hallazgos 3 (timeout de sesión), 4 (especies), 5 (eliminar cuenta/perfil), 6 (verificar hogares) y 7 (pantallas v2.1) → `/architect` para análisis de brecha y hoja de ruta.
- D2 (REQ-UI-005) sigue abierta; hallazgo 6 de la 001 aprobado con D1 en presentación.

---
## `[2026-11-10 | Decisión Nivel 2 de Neo: Opción 2 | Feature 002 = spec v2.1]`
- Neo elige: la 001 queda como está (solo fallos reportados). La spec v2.1 completa es la Feature 002 (Fase 2). Hoja de ruta bajo esa línea.
- Pendiente de Neo: D2 (REQ-UI-005, A o B). Pendiente: corrida e2e `auth-pet-forms` y commit de `PetCards.tsx`.
- En curso: Keymaker (bugs 1 y 2 de la 001) y Architect (análisis en `.specify/memory/audits/fase-2-analisis-v21.md`).

---
## `[2026-11-10 | Decisiones de Neo: D2 = A y commit autorizado]`
- D2 = Opción A: cambia solo la redacción visible; el código del catálogo se mantiene; sin enmendar la spec 001. Hallazgo 6 queda autorizado para implementar (tarea nueva en `tasks.md` por Architect).
- Commit autorizado y creado: PetCards.tsx y auth-pet-forms.spec.ts (sin push). Temporales de Keymaker (`repro.tmp.mjs`, `vite.tmp-repro.config.ts`) quedan sin commit; deben eliminarse.
- Puerto: Grafana ocupa 3000 en la máquina de Neo. La e2e necesita puerto configurable o Grafana detenido.
- Architect entregó análisis Fase 2 (Ruta 2 recomendada, F0–F8) en `.specify/memory/audits/fase-2-analisis-v21.md`.

---
## `[2026-11-10 | Decisiones Nivel 2 de Neo para Feature 002 (F1 cerrada)]`
1. Identificador: `username` se mantiene como login e invitaciones en la 002. Email opcional en perfil, sin envío de correos. Correo real pasa a Feature 003 (Cloud).
2. Sesión: 30 min de inactividad y tope absoluto de 24 h. Recargar mantiene la sesión; cerrar sesión la revoca de inmediato.
3. Especies aprobadas: CANINE, FELINE, RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL, OTHER. Migración automática DOG→CANINE y CAT→FELINE en BD. Retrocompatibilidad al importar respaldos 1.0.0 y 2.0.0.
4. Roles: matriz de permisos v2.1 §5.2. Cuidador registra pesos y eventos sanitarios; no edita perfil básico ni elimina mascota. Admin Hogar gestiona miembros y datos básicos según matriz. Lector solo lectura.
5. Diferidos a Feature 003: SSO (Google/Apple/SAML), recuperación por correo y adjuntos PDF.
6. Eliminar cuenta: bloqueado si es propietario único de hogar con miembros, hasta transferir o vaciar/eliminar el hogar. Descarga previa de respaldo, re-autenticación y texto literal.
- No confirmado aún: renumeración 6-A (mensaje técnico) y 6-B (hogar).
- Pendiente de autorización separada: crear `specs/002-*` (F3). Esta orden autoriza solo la hoja de ruta.

---
## `[2026-11-10 | Hand-back Keymaker (puertos e2e) | Pendiente selector y revisión de archivos ajenos]`
- Puertos configurables (`E2E_API_PORT`, `E2E_WEB_PORT`), por defecto 3000/5173 intactos. tsc OK.
- E2E con Chrome del sistema en 3200/5273: 4 pasan, 1 falla por selector erróneo de la prueba nueva (botón "Entrar", no "Iniciar sesión"). Defecto en la prueba, no en puertos.
- Archivos modificados que NO son de Keymaker (revisar con Oracle): `tests/integration/api/auth.api.spec.ts`, `tests/integration/api/pets-records.api.spec.ts`, `tests/unit/presentation/api.spec.ts`.

---
## `[2026-11-10 | Neo confirma 6-A y 6-B como hallazgos separados]`
- 6-A: mensaje técnico de payload. Ruta aprobada: solo presentación (D1) y redacción visible (D2 = A). Pendiente: tarea en `tasks.md` (Architect) e implementación (Keymaker).
- 6-B: hogar creado que no actualiza la pestaña "Hogares" (muestra 0). Sin diagnosticar. Despacho a `/keymaker` para reproducir y corregir con puertos alternativos (3200/5273). Grafana sigue en 3000.
- Pendiente de autorización: mover la API de desarrollo a otro puerto (hipótesis de bugs 1 y 2).

---
## `[2026-11-10 | Hoja de ruta Feature 002 entregada por Architect]`
- Documento: `.specify/memory/audits/hoja-de-ruta-feature-002.md`. Fases F0–F8 con 6 rebanadas de implementación.
- Autorizaciones [N2] de Neo pendientes: F0 (marcar T056/T057 COMPLETED, push, etiqueta v1.0.0-feature-001), F2b (diseño y librerías), F3 (crear specs/002-* y rama), F4 (constitución si hace falta), F5 (spec Approved), F6 (tasks Approved), F8 (cada COMPLETED).
- Corrección: D1 (solo presentación) y D2 (opción A) ya están aprobadas por Neo. El informe de Architect las lista como pendientes por error.
- Preguntas abiertas para Neo: listar otros fallos de la 001 antes de F0; confirmar causa de bugs 1 y 2 (Grafana en 3000).

---
## `[2026-11-10 | Neo autoriza mover la API de desarrollo a otro puerto]`
- Neo confirma: la API de ARGOS estaba caída cuando falló el login; Grafana respondía en 3000. Causa de bugs 1 y 2 = entorno, no código (pendiente de cierre por Oracle).
- Autorizado: mover la API de desarrollo a otro puerto (propuesta: 3100) en la configuración de desarrollo y de e2e, y que el proxy de Vite apunte ahí.
- Se despacha a `/keymaker` después de que `/oracle` termine su validación de los cambios sin commit (para no invalidar su snapshot).

---
## `[2026-11-10 | Oracle valida cambios sin commit | PASS CON OBSERVACIONES]`
- Puertos, selectores e2e y regresiones validados por lectura. Compuertas verdes (tsc, 113/113 integración y presentación, trazabilidad 96/96, oráculos 68).
- Fuera de lista de Neo: `tests/e2e/visual/household-counter.spec.ts` (6-B, sin implementación todavía). Se excluye del commit.
- Pendiente de autorización de commit de Neo: 6 de código y config, bitácoras, y 4 documentos de auditoría.
- Despacho a `/keymaker`: mover la API de desarrollo a 3100 (autorizado por Neo).

---
## `[2026-11-10 | Neo autoriza F0 completo | T057 y D2 = A confirmados]`
- T057: autorizada la actualización de `react-router-dom` a v7 en `package.json` (dependencia gratuita, Nivel 2 aprobado).
- D2 = A confirmada otra vez.
- F0 completo autorizado: T056, T057, correcciones reportadas, e2e, commits locales y validación de `/oracle`. Neo marca COMPLETED, push y etiqueta `v1.0.0-feature-001` solo después del veredicto verde.
- Despacho en paralelo: T056 (Keymaker), T057 (Keymaker), tarea de 6-A en tasks.md (Architect). Keymaker sigue con el puerto 3100 y 6-B.

---
## `[2026-11-10 | T058 añadida a tasks.md por Architect | pendiente de Oracle]`
- T058 (6-A, traducción de errores en presentación) queda como `[ ]`. Verifica trazabilidad 6/6.
- Siguiente: `/oracle` valida la tarea; después `/keymaker` la implementa.

---
## `[2026-11-10 | Keymaker reporta 6-B | El "0" era de invitaciones, no de hogares]`
- El 0 junto a "Hogares" es el contador de invitaciones pendientes (`AppShell.tsx`, `data-pending-invitations`, REQ-UI-006). Un hogar propio no lo incrementa; por eso quedaba en 0.
- La lista de hogares sí se recarga al crear. No hay defecto de recarga.
- Corrección aplicada: contador neutro nuevo de hogares (`data-household-count`) en el encabezado, con e2e `household-counter.spec.ts` (falla antes, pasa después). Suite e2e en 3200/5273: 30/30.
- "No me deja gestionar los animales del hogar": comportamiento especificado (mascotas ajenas solo lectura). Si Neo quiere gestionarlas desde el hogar, es cambio de spec, y ya está previsto en la matriz de la 002 (Admin Hogar).
- Decisión de Neo pendiente: ¿mantener la insignia de invitaciones y la nueva de hogares a la vez?
- Pendiente: `/oracle` valida. Revisar también cambios de otro agente en app-config (puerto 3100), .env.example, package.json.

---
## `[2026-11-10 | Hand-backs: T056, puerto 3100 y 6-B listos para Oracle | T057 en curso]`
- T056 (tipado): `backup-migration.ts` sin `!`; `backup-use-cases.spec.ts` sin `any`. Compuertas verdes.
- Puerto 3100: `app-config.ts`, `vite.config.ts`, `playwright.config.ts`, `app-config.spec.ts`, `.env.example`. ARGOS responde 401 problem+json en 3100. e2e auth 5/5.
- 6-B: contador neutro de hogares en `AppShell.tsx` y e2e `household-counter.spec.ts` (30/30 suite).
- Documentos que mencionan el 3000 (README, quickstart, plan, openapi, constitución, history, hoja de ruta): no editados; Neo decide.
- Pendiente: T057 (react-router v7, `ac1d5133`) y T058 (aún sin implementar, espera validación de Oracle).
- Despacho a `/oracle`: validación en disco de T056, puerto 3100 y 6-B.

---
## `[2026-11-10 | T057 entregada por Keymaker | Pendiente Oracle]`
- react-router-dom 6.30.6 → ^7.18.5. `npm audit --omit=dev`: 2 moderadas antes, 0 después. Sin cambios en `src/` (las importaciones son compatibles con v7).
- e2e auth 5/5 en 3300/5299. tsc OK; presentación 49/49; trazabilidad 96/96.
- Archivos: `package.json`, `package-lock.json`. Despacho a `/oracle` en auditoría separada.

---
## `[2026-11-10 | Commits locales de F0 validados por Oracle | sin push]`
- `42bfd0d` fix(api,web): regresiones de bugs 1 y 2 y selectores e2e (incluye las 4 pruebas que Oracle marcó como "ajenas": son mías de los bugs 1 y 2 y ya fueron validadas en la auditoría anterior).
- `c1b7186` chore(dev): API en 3100.
- `a3af27d` refactor(backup): T056.
- `232fb72` feat(web): contador de hogares (6-B).
- `372f635` chore(deps): react-router v7 (T057). Observación de Oracle: rango `^7.18.5`; Neo decide si fijar exacta.
- Sin commit (fuera de validación): `tasks.md` (T058 sin auditar), bitácoras y 4 documentos de auditoría sin seguimiento.
- Pendiente de Neo: revisar y hacer push; marcar T056 y T057 COMPLETED; etiqueta `v1.0.0-feature-001`.

---
## `[2026-11-10 | Neo: fijar react-router exacto y pasar docs a 3100 | sin commit]`
- `package.json` y `package-lock.json`: react-router-dom fijado a 7.18.5 exacto. npm audit 0; tsc OK.
- `README.md` (líneas 50, 59, 90) y `specs/001-pet-health-tracker/quickstart.md` (líneas 26, 57): 3000 → 3100.
- Sin commit todavía. Pendiente: commit de estos cambios y marcar T056/T057 en `tasks.md` (líneas 208–209) por Neo.
