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

---
## `[2026-11-10 | Decisiones de Neo F2 (Feature 002) y autorización de F3]`
- 1A contraseña 10–128 con mayúscula, número y símbolo al registrar o cambiar; login sin política.
- 2A respaldo de cuenta: solo mascotas propias.
- 3A merge diferido a 003; en 002 solo reemplazo atómico.
- 4A una `APP_TIMEZONE`; el timezone del perfil solo para mostrar.
- 5B asignación explícita mascota-hogar por el Propietario Legal, con migración de la visibilidad actual.
- 6A eliminar cuenta bloqueada hasta transferir o desasignar mascotas compartidas.
- 7B peso mínimo 0.001 kg (3 decimales) para especies distintas de CANINE y FELINE, según tabla de Maggie.
- Criterios por defecto aceptados: miembros actuales migran a Lector; transferencia inmediata; permisos de consultas y medidas. `supersedesId` se resuelve en F3.
- Autorizado F3 (Nivel 2): crear rama y `specs/002-*`, con `spec.md` en DRAFT/REVIEW para revisión de Neo. Sin commit ni push.

---
## `[2026-11-10 | F3 entregada por Architect | spec 002 en DRAFT para revisión de Neo]`
- Rama `002-plataforma-v21` creada desde `3ae0847`. Sin commit ni push.
- `specs/002-plataforma-v21/spec.md` (DRAFT): 8 historias, 51 identificadores, 15 criterios de éxito, sin preguntas abiertas.
- `supersedesId`: calculado, no persistido (C-16). Ajustar la hoja de ruta F4.
- Puntos para Neo: `neutered` y `microchipId` añadidos (de P-07); registro sin `nextDueAt` fuera del semáforo (cambio aditivo a STATE-ALERT-001); importación por reemplazo quita asignaciones; cambiar contraseña revoca otras sesiones; auditoría en la misma transacción; errores nuevos provisionales; tabla de pesos máximos es entregable de Maggie.

---
## `[2026-11-10 | Neo acepta los 7 puntos de la spec 002 y autoriza F5]`
- Aceptados: supersedesId calculado y SUPERSEDED inmutable; neutered y microchipId opcionales (unicidad de microchip por propietario); sin nextDueAt fuera del semáforo; importación por reemplazo sin asignaciones a hogares; cambiar contraseña revoca otras sesiones; auditoría en la misma transacción; errores provisionales hasta F4 y pesos por especie de Maggie en F4.
- Observación a verificar en F5: Neo menciona "hash con sal" al eliminar cuenta; la spec dice SHA-256 sin secretos. Mouse debe aclarar cuál aplica.
- Spec sigue en DRAFT hasta aprobación final de Neo. Despacho a `/mouse` (F5).

---
## `[2026-11-10 | F5 de Mouse | 17 hallazgos (5 altos) | 5 preguntas N-1..N-5 para Neo]`
- Checklist 27/40. Cambios 1–17 para el Architect. Dependen de Neo: 1 y 2 (N-4, N-5), 3 (N-2), 5 (N-3), 6 y 11 (N-1).
- Despacho a `/architect` de los cambios que NO dependen de Neo (7–10, 12–17). Los demás quedan pendientes de sus respuestas.

---
## `[2026-11-10 | Neo responde N-1..N-5 de la spec 002 | Aprueba decisiones del Architect]`
- Aprobadas las dos decisiones del arquitecto (username con mayúsculas se rechaza; poda de asignaciones al transferir).
- N-1 A: HMAC-SHA256 con secreto de aplicación en configuración de despliegue (no sal por usuario).
- N-2 A: verificación en servidor con token efímero emitido al descargar el respaldo.
- N-3 A: enmienda de constitución vía `/speckit-constitution`, con firma Nivel 2 de Neo antes de aprobar la spec.
- N-4 B: todos los roles importan sobre sus propias mascotas; reemplazo atómico; las mascotas entran sin asignaciones.
- N-5 A: si es el único miembro activo, el hogar se elimina en cascada con la cuenta.
- Despacho: `/architect` aplica N-1..N-5 en la spec y prepara borrador de enmienda constitucional para firma. Luego `/mouse` repite F5.

---
## `[2026-11-10 | Reauditoría de Mouse: 40/40 | Spec 002 y enmienda listas para firma de Neo]`
- Cuatro huecos cerrados con evidencia en disco. Checklist `specs/002-plataforma-v21/checklists/requirements.md` 40/40.
- Pendiente de Neo: revisar y firmar `specs/002-plataforma-v21/spec.md` (Approved) y `.specify/memory/audits/enmienda-constitucion-002-borrador.md` (versión 3.1.0 o 4.0.0).
- Después de firma: `/speckit-plan` (F4) con Architect, Trinity, Rama y Maggie.

---
## `[2026-11-10 | Neo aprueba spec 002, firma enmienda 3.1.0 y autoriza F4]`
- Spec 002: DRAFT → APPROVED.
- Enmienda constitucional 3.1.0 aplicada vía `/speckit-constitution` (incluye párrafo "Sistema" con RBAC y pantalla de cuenta en axe-core).
- F4 autorizada: plan y contratos con Architect, Trinity, Rama y Maggie. Sati obligatorio si toca UI (320, 768, 1024, 1280 px).
- Orden: (1) estado y constitución; (2) plan y contratos; (3) insumos de Maggie, Trinity y Rama en paralelo.

---
## `[2026-11-10 | Constitución 3.1.0 y spec 002 APPROVED aplicadas | F4 arranca]`
- Constitución 3.1.0 aplicada por Architect con script Python (no `/speckit-constitution`). Contenido igual al borrador firmado. Anotado a Neo.
- Verify-traceability CUMPLE 96/96. Pendiente de firma Nivel 2: incorporar los IDs de la 002 al principio III cuando existan los contratos de F4.
- Insumos de F4 en paralelo: Maggie (tabla de pesos por especie y cotas), Trinity (seguridad de sesión, HMAC de auditoría, token de respaldo), Rama (privacidad en eliminación y respaldo). Después, Architect redacta plan y contratos.

---
## `[2026-11-10 | Insumo de Maggie (F4) | Decisión de Neo: máximo de peso en especies pequeñas]`
- 2 de 8 especies con rango validado (CANINE y FELINE, 0.05–150 kg). 6 provisionales: RABBIT, FERRET, BIRD, REPTILE, SMALL_MAMMAL, OTHER, con mínimo 0.001 kg (7B) y máximo 150 kg provisional.
- Riesgo: un máximo de 150 kg para un conejo o un ave acepta valores absurdos. Maggie recomienda dejarlo provisional sin inventar cifras.
- Decisión pendiente de Neo: A) mantener 150 kg provisional y marcarlo en el contrato; B) pedir a un veterinario una cota por especie antes de cerrar F4.
- Sin alertas automáticas de peso ideal ni geriátricas (no existen en la 001 para ninguna especie). Edad solo en años reales.

---
## `[2026-11-10 | Insumo de Trinity (F4) | Decisiones D1–D6 pendientes de Neo]`
- Documento `.specify/memory/audits/f4-insumo-trinity-seguridad.md`: 14 propuestas (P-01 a P-14), 7 vectores nuevos (V10–V16).
- Decisiones para Neo: D1 rotación HMAC (recomienda diferir), D2 hashes de entidad USER (a: vista sin email/nombre; b: null al eliminar), D3 contar fallos de contraseña actual y limitar exportaciones, D4 importación quita asignaciones a hogares (previsualización lo avisa), D5 token prueba la solicitud, no el guardado (riesgo residual), D6 versión 3.0.0 de la máquina de sesión y estado REVOKED separado.
- Bloque de propuestas: P-14 (endurecimiento del parser de importación) requiere aprobación de Neo; menores P-03 a P-12 adoptables por Architect si Neo las aprueba.
- Trabajo pendiente: Rama (privacidad) y luego Architect para plan y contratos.

---
## `[2026-11-10 | Insumo de Rama (F4) entregado | Consolidación de decisiones para Neo]`
- Documento `.specify/memory/audits/f4-insumo-rama-privacidad.md`: datos personales por entidad, secuencia atómica de eliminación de cuenta (fase A fuera de transacción, fase B en una transacción), criterio de fallo inyectado para importación, riesgos R-01..R-11.
- Decisiones para Neo consolidadas: Maggie (máximo de 150 kg en especies pequeñas: A/B); Trinity (D1–D6, P-14, menores P-03..P-12); Rama (D-1..D-7).
- Pendiente de verificar en la 001: que `userId` sea aleatorio no enumerable (R-08, R-11).
- Architect no arranca el plan hasta recibir respuestas de Neo.

---
## `[2026-11-10 | Neo aprueba bloque recomendado de F4 | Arranca plan y contratos]`
- M1 A (150 kg provisional, a validar por veterinario). T1 después (HMAC con puerto parametrizado). T2 resuelto vía R2. T3 sí. T4 sí. T5 sí. T6 sí (3.0.0 y REVOKED). T7 sí (P-14). T8 sí (P-03 a P-12). R1 sí (24 meses). R2 sí: vista canónica de auditoría sin email, displayName ni microchipId. R3 sí. R4 sí (secure_delete y checkpoint WAL). R5 sí (90 días). R6 sí (sin userId ni exportedByUserId). R7 sí.
- Verificado: userId = randomUUID() (UUID v4), no enumerable.
- Despacho a `/architect`: plan, contratos OpenAPI/JSON Schema, data-model y quickstart de la 002, dentro de `specs/002-plataforma-v21/`.

---
## `[2026-11-10 | F4 entregada por Architect | Auditorías de Mouse y Oracle en curso]`
- Artefactos en `specs/002-plataforma-v21/`: plan, data-model, quickstart, 6 esquemas (common 2.3.0, identity 3.0.0, pet 3.0.0, medical-records 3.0.0, backup-envelope 3.0.0, audit-entry 1.0.0), OpenAPI 3.0.0 (40 operaciones), 5 máquinas de estado, catálogo de errores 3.0.0 (35 errores). Estado REVIEW, sin commit.
- Pendientes que necesitan decisión de Neo: (1) apuntar `compile-contracts.sh` y `codegen.mjs` a la 002 (Nivel 2, F6); (2) aprobar STATE-ACCOUNT-DELETE-001, ERR-PET-MICROCHIP-DUPLICATE y ERR-RATE-LIMITED; (3) confirmar retiro de ERR-AUTH-USER-NOT-FOUND y ERR-HOUSE-MEMBER-ALREADY-EXISTS; (4) topes de frecuencia 5 exportaciones y 20 invitaciones por 15 min (provisionales); (5) vencimiento de invitaciones a 30 días (no aprobado); (6) avatarUrl solo https (no aprobado); (7) ADR-002-04, ADR-002-09 y ADR-002-11 (invitación como entidad propia, peso en gramos, ruta genérica de registros).

---
## `[2026-11-10 | Oracle valida contratos F4 | PASS CON OBSERVACIONES]`
- Parseo JSON y YAML correcto. Ajv compila los 6 esquemas en strict. 35 errores RFC 9457 completos; 31 ERR-* usados, todos existentes. 4 errores del catálogo sin uso (revisar).
- Pendientes marcados solo en plan.md: ERR-PET-MICROCHIP-DUPLICATE y ERR-RATE-LIMITED aparecen en el catálogo sin marca de pendiente; hay que marcarlos.
- Seguridad de contrato verificada con Ajv: respaldo 3.0.0 rechaza campos de identidad y ACCOUNT_DELETE con id en claro.
- Commit F4: entran los 17 archivos de `specs/002-plataforma-v21/`. La enmienda de la constitución la firmó Neo y se commitea aparte.
- Mouse sigue auditando F4.

---
## `[2026-11-10 | Mouse audita F4 | 3 altos, 5 medios, 7 bajos | Architect corrige sin decisión de Neo]`
- Altos: F4-A1 (token de confirmación ausente da error de esquema en vez de ERR-ACCOUNT-CONFIRMATION-MISMATCH); F4-A2 (migración de INVITED/DECLINED/CANCELLED a household_invitations, riesgo de pérdida de datos); F4-A3 (assigned_by_user_id sin FK bloquea la eliminación de cuenta).
- Medios: F4-M1 (oneOf de updateRecord ambiguo), M2 (etiqueta SUPERSEDED distinta de la spec), M3 (entityId para ASSIGN/UNASSIGN), M4 (registro sin próxima fecha seguido de otro: definir si es SUPERSEDED, con Maggie), M5 (fileDigest, cabecera de confirmación y GET→POST: decisión de Neo).
- Cobertura: 62 de 63 requisitos con contrato. Falta REQ-MIG-001 como artefacto formal.
- Despacho a `/architect` para A1–A3 y M1–M4, B1–B4. M5 queda para Neo.

---
## `[2026-11-10 | Neo aprueba decisiones de F4 | F4 cerrada | Arranca F6]`
- 1 POST exportación y confirmación de importación con fileDigest: APROBADO. 2 tres identificadores: APROBADOS; retiro definitivo de ERR-AUTH-USER-NOT-FOUND y ERR-HOUSE-MEMBER-ALREADY-EXISTS confirmado. 3 scripts de compilación para leer `specs/002-plataforma-v21/contracts/` en F6: AUTORIZADO. 4 límites 5 y 20 por 15 min: CONFIRMADOS. 5 invitaciones sin caducidad automática: CONFIRMADO. 6 riesgo residual de username y nombre en hashes: ACEPTADO. 7 avatar http(s) y data:image png/jpeg/webp, sin javascript: CONFIRMADO. 8 borrador de enmienda del principio III: AUTORIZADO (preparar, no aplicar).
- Pendiente: validación clínica de Maggie sobre ADR-002-15.
- Despacho: `/architect` F6 (tasks.md de la 002 por rebanadas con tabla de sustitución) y borrador de enmienda del principio III.

---
## `[2026-11-10 | Neo aprueba tasks.md 002, T204/T204a/T205 N2 y enmienda 3.2.0 | Commit 1ee7a21 | Arranca F7]`
- Aprobado: lista de tareas (111), T204 y T205 autorizados, T204a como compuerta de firma previa a T306, T283 y T295 para supervisión de Sati, T310 reservada para Neo. Versión de la enmienda 3.2.0.
- Commit local `1ee7a21` (tasks.md, sustitución y borrador de enmienda). Sin push.
- Siguiente: F7 (T201–T206) con `/keymaker`: herramientas multi-feature, sin regenerar `src/generated/` (eso es T207).

---
## `[2026-11-10 | Architect corrige T220, T202 y README de contratos 002 | Espera Oracle de F7]`
- T220 sin IDs de errores retirados en la trazabilidad (el script no los admite de forma segura); la prueba debe comprobar que no se devuelven. T202: 13 contratos. README 002: `$anchor` y las tres `x-sdd-*`.
- Pendiente: veredicto de `/oracle` sobre F7, luego commit local de F7 si está verde.

---
## `[2026-11-10 | Oracle valida F7 | PASS CON OBSERVACIONES | Commit local 24fa17b (sin push)]`
- Commit con los 8 archivos de F7 (scripts, workflows, pruebas). 001 intacta: trazabilidad 96/96, oráculos CUMPLE, compile idéntico. 59/59 en pruebas nuevas.
- Fuera del commit: `tasks.md` y `contracts/README.md` (fixes del Architect; pendiente commit de documentos) y bitácoras `claude/*`.
- Observación para la fase CI de la 002: el paso `npm run test:gate` no recibe `--feature`; mide siempre la 001.
- Pendiente de Neo: marcar T201–T206 como COMPLETED si está conforme.

---
## `[2026-11-10 | Neo: T201–T206 COMPLETED, CI como acordado, autoriza T207 con revisión previa del diff]`
- T201–T206 marcadas [x] por Neo. T204a sigue abierta hasta firma de la enmienda III antes de T306.
- CI: automático mide 001; `workflow_dispatch` acepta FEATURE=002; conmutación definitiva en cierre de la feature.
- T207 autorizada: `compile-contracts.sh --feature 002` regenera `src/generated/`. Antes de adaptar código, presentar diff e impactos a Neo.

---
## `[2026-11-10 | T207 ejecutada (regeneración de src/generated con 002) | Rompe compilación y pruebas | Decisión de Neo]`
- Diff: 14 archivos modificados y 1 nuevo en `src/generated`, +2903/−685. Sin commit.
- Impacto: tsc 67 errores (antes 0); 6 suites de integración de API no cargan (regex de guarda de respaldo en `backup-use-cases.ts:42`); 4 pruebas de `validation.spec.ts` fallan; trazabilidad 001 FALLA por pureza (falso positivo: texto del contrato menciona `process.env`); trazabilidad 002 FALLA (71/118, 11 retirados aún usados, 47 sin `@implements`).
- Vuelta atrás posible: `git checkout -- src/generated` y borrar `account-deletion.machine.ts`.
- Decisiones para Neo: (1) cómo proceder: adaptar por rebanadas sin commitear hasta verde, o revertir y regenerar al inicio de cada rebanada; (2) falso positivo de pureza: cambiar texto del contrato (recomendado) o ajustar script (requiere autorización).

---
## `[2026-11-10 | Neo decide transición T207: A (adaptar por rebanadas) y A (ajuste de texto en contrato)]`
- Ajustar `audit-entry.schema.json` línea 289: «process.env» → «variables de entorno directamente». Recompilar con `--feature 002`.
- Prioridad 1: guarda de respaldo `backup-use-cases.ts:42` para que carguen las suites.
- Estabilizar tsc y suites con adaptaciones mínimas para cerrar T207, y luego arrancar rebanada 1 (T208 en adelante). Sin commit hasta verde.

---
## `[2026-11-10 | T207: tsc en verde, pruebas 342/602 | T207 NO cerrada | Decisión de Neo: fixtures canónicos 002]`
- tsc 0 errores. Compuertas 001 CUMPLE; 002 FALLA (71/118, IDs retirados en src para no romper la 001: conflicto a resolver en T237).
- Fallos: 260 de 602. Causa dominante: fixtures de la 001 que no cumplen 3.0.0 (especie DOG/CAT, vacunas sin category, canEdit). Respaldo 1.0.0/2.0.0 rechazado hasta T233 (cambio deliberado). Sesión de 7 días en auth-policies (sustituir). Registro con contraseña de 8 caracteres.
- Sin commit: no se commitea código con la suite roja.
- Opciones para Neo: (a) `/architect` entrega fixtures canónicos 3.0.0 en la 002; (b) Keymaker deriva un adaptador de fixtures de la 001 en `tests/fixtures`.
- Observación: T236 (matriz de permisos) quedó sin decidir por Keymaker, pero la matriz de 44 celdas está en REQ-RBAC-001 y debe implementarse desde la spec.

---
## `[2026-11-11 | Neo decide T207: opción (a) fixtures canónicos 002 | Matriz RBAC en Rebanada 3 | Despacho a Architect]`
- (a): `/architect` entrega fixtures canónicos nativos de la 002 (contraseñas conformes, CANINE/FELINE, esquemas 3.0.0). Se descarta el adaptador desde la 001.
- T207 se cierra cuando los fixtures y las pruebas de contrato estén en verde.
- Matriz de 44 celdas (REQ-RBAC-001): conforme, se implementa en Rebanada 3 (T236 en adelante).

---
## `[2026-11-11 | Fixtures canónicos 002 entregados | Defecto de contrato D-F8-01 (speciesOther nulo) | Decisión de Neo]`
- Fixtures: 226 válidos y 181 inválidos; 397 pasan, 10 bloqueados por D-F8-01.
- D-F8-01: en `pet.schema.json`, `SpeciesOther` declara tipo null pero exige string (allOf NonEmptyTrimmedString), así que `speciesOther: null` nunca valida. Afecta a crear mascotas CANINE/FELINE/etc., a respaldos y a importación. Es un defecto real; corrección PATCH del contrato.
- Decisión para Neo: autorizar la corrección PATCH del contrato (recomendado) o aceptar 10 casos como xfail y cerrar T207 con salvedad.
- Mientras tanto: conectar fixtures a pruebas de contrato con los 10 como xfail (sin commit).

---
## `[2026-11-11 | Neo autoriza corrección PATCH de SpeciesOther (D-F8-01) y da por cerrada T207 con 412 en verde]`
- Paso 1: `/architect` corrige `pet.schema.json` (SpeciesOther: null separado del allOf de string; maxLength 60).
- Paso 2: `/keymaker` recompila con `--feature 002`, quita los 10 `it.skip`, ejecuta pruebas y tsc. T207 cerrada si todo verde.
- Rebanada 1 (T208 en adelante) autorizada tras cerrar T207.

---
## `[2026-11-11 | Neo aprueba adaptación de 26 pruebas de la 001 con revisión semántica previa | T201–T207 marcadas por Neo | Commit después del veredicto]`
- Paso 1: `/oracle` revisa línea por línea las 26 pruebas de la 001 modificadas (diff contra HEAD) y certifica que no relajan oráculos ni ocultan regresiones.
- Paso 2: con veredicto, commit local de T207 SIN `.claude/skills/` ni `GUIA-SKILLS-MATRIX.md`. Sin push.
- Después: arranca Rebanada 1 (T208 en adelante).

---
## `[2026-11-11 | Commit local de T207 tras veredicto de Oracle (PASS CON OBSERVACIONES, 0 aflojamientos) | Sin push]`
- Commit de 73 archivos (src, tests, contratos 002, fixtures). Sin `.claude/skills/` ni `GUIA-SKILLS-MATRIX.md`.
- Pendientes de Rebanada 1: título de `auth-policies` (TTL 7 días), `backup-atomicity` (espera 2.0.0), reescritura de suites viejas a 3.0.0, y retirada de casts temporales en T214, T226, T255 y T284.
- Arranca Rebanada 1 (T208 en adelante) con `/keymaker`.

---
## `[2026-11-11 | Rebanada 1 entregada por Keymaker (T208–T222) | Pendiente Oracle | Decisiones para Neo]`
- Trazabilidad 002 pasa a 85/118. vitest completo: 154 fallan (antes 260), ninguno que pasaba en HEAD falla ahora.
- Hallazgo: compuerta 001 pasa de 96/96 a 89/96 (IDs de la 001 retirados por la 002: REQ-AUTH-001, REQ-AUTH-002, REQ-HOUSE-002, INV-AUTH-002, INV-AUTH-004, ERR-AUTH-USER-NOT-FOUND, ERR-HOUSE-MEMBER-ALREADY-EXISTS). `npm run test:gate` (001) fallará. Decisión de Neo/Architect: cómo tratar la compuerta de la 001 frente a la 002.
- Desfase: ruta real de eliminación `POST /api/account/deletion` (OpenAPI 3.0.0), no `DELETE /users/me` que dice T219. Architect corrige texto.
- T223 (vectores de Sentinels y Trinity) y T224 (Rama) necesitan sus agentes; Keymaker dejó pruebas escritas.
- Pendiente: validación de `/oracle` de T208–T222.

---
## `[2026-11-11 | Oracle valida rebanada 1 (PASS CON OBSERVACIONES) | Commit local de la rebanada 1 | Sin push]`
- Oracle: sin regresiones por nombre, oráculos CUMPLE, compile sin deriva, 002 a 85/118, 001 a 89/96 (IDs retirados, decisión de Neo).
- Observaciones: T222 (E2E) no ejecutado; T223 y T224 sin agente; T219 con ruta errónea en tasks.md (H-1, para Architect).
- Commit local creado con 76 archivos (src, tests, .env.example, tabla de sustitución). Sin skills, guía, bitácoras ni contratos.

---
## `[2026-11-11 | Architect corrige ruta de T219 en tasks.md | Trinity (T223) y Rama (T224) en curso]`
- T219: ruta `POST /api/account/deletion` (coincide con contrato y código). Solo esa línea cambió; estado `[ ]`.
- Pendiente: evidencia de T223 (Trinity) y T224 (Rama); luego T225 (compuerta de la rebanada) y revisión de Neo.

---
## `[2026-11-11 | Trinity entrega T223 (sesión y CSRF): 14/14 pasan, dos mutantes detectados | Sentinels no ejecutado | Rama (T224) en curso]`
- Mutante 1 (inactividad en `session-policy.ts`) y mutante 2 (cabecera CSRF en `csrf-guard.ts`) detectados; archivos restaurados idénticos.
- Pendiente: Sentinels (parte de T223) y Rama (T224). Luego T225 (compuerta de rebanada) y veredicto de Oracle.

---
## `[2026-11-11 | Rama entrega T224 (privacidad): 14/14, mutante detectado | Brechas menores | Informe pendiente]`
- Pruebas: credentials 11/11 y log-redaction 3/3 pasan. Mutante de log en `app.ts` detectado; archivo restaurado idéntico.
- Brechas: displayName sin prueba en logs; correo sin prueba en respuestas de export y de hogar; username en logs solo en flujo de eliminación.
- Rama pide autorización para escribir `.specify/memory/audits/rebanada-1-rama.md` (entregable de T224). Lo cubre T224 misma: se autoriza.
- Plan: Keymaker añade tres aserciones y corre T225 (compuerta). Sentinels ejecuta vectores de la rebanada 1 (parte de T223). Oracle valida todo antes de commit.

---
## `[2026-11-11 | Rama escribe rebanada-1-rama.md (T224) | 4 brechas de gravedad baja, destino T225 | Keymaker en curso]`
- Informe en `.specify/memory/audits/rebanada-1-rama.md`. Brechas B1–B4 se cubren en T225 (Keymaker en curso). B4 puede pasar a tarea posterior si el respaldo aún no existe.

---
## `[2026-11-11 | Keymaker cierra brechas B1–B3 y compuerta T225 | Oracle valida rebanada 1 completa | Débil: correo en exportación sin mascotas]`
- Tres aserciones añadidas (displayName y username en logs del primer flujo; correo ausente en hogar y exportación). Pasan: privacidad 15/15.
- Compuerta T225: tsc 0, sin deriva de contratos, oráculos CUMPLE, trazabilidad 002 en CUMPLE para T208–T222.
- Debilidad: la comprobación del correo en exportación no ejecuta con mascotas (sale `pets: []`). Oracle decide si es bloqueante.
- Sentinels (parte de T223) sigue pendiente.

---
## `[2026-11-11 | Oracle valida pasadas posteriores (PASS CON OBSERVACIONES) | Commit privacidad (T224) sin push | Corrección de cifra]`
- Commit local con credentials, log-redaction y rebanada-1-rama.md. `tasks.md` queda fuera hasta que Neo apruebe la ruta de T219.
- Corrección: 47 fue el subconjunto de `tests/security tests/unit/presentation tests/integration/api`. Suite completa: 154 fallos, todos de la 001 de rebanadas posteriores.
- Pendientes de Neo: aprobar ruta de T219; decidir si Sentinels se ejecuta antes de la marca o se dispensa; registrar como deuda la comprobación débil del correo en exportación.

---
## `[2026-11-11 | Neo cierra rebanada 1 (T208–T225 COMPLETED, T219 aprobada, Sentinels dispensada, deuda registrada) | Commit de cierre sin push | Arranca rebanada 2]`
- Commit de tasks.md de cierre (sin push).
- Rebanada 2 (modelo de mascota y especies, T226–T235) autorizada. Keymaker en curso.
- Deuda para rebanada 5: correo en exportación con mascotas reales.

---
## `[2026-11-11 | Rebanada 2 entregada por Keymaker (T226–T233; T235 compuerta) | T234 pendiente de Maggie | Oracle en curso]`
- Suite completa: 121 fallos de la 001 de rebanadas posteriores (antes 154). Ninguna prueba nueva en rojo.
- Decisión que cambia contrato: `deltaPercent` retirado de la API (contrato 002 con additionalProperties false).
- Fila 33 de sustitución dice BIRD→DRAGON: DRAGON es valor inválido de prueba, no especie. Oracle valida la redacción de la fila.
- Despacho: Maggie (T234, `rebanada-2-maggie.md`) y Oracle (validación de rebanada 2).

---
## `[2026-11-11 | Maggie entrega T234 (rebanada-2-maggie.md) | Acepta ADR-002-15 con condición de interfaz | Riesgo para veterinario: OVERDUE desaparece con nueva aplicación sin fecha]`
- 2 especies validadas (CANINE, FELINE), 6 provisionales. Sin alertas de peso ni edad en las 8 especies (verificado en código).
- Condición para rebanada 6 (interfaz): registro sin próxima fecha se muestra sin insignia y con texto «sin próxima fecha registrada», nunca «al día». Pendiente de P-5.
- Puntos veterinario abiertos: P-1, P-2, P-3, P-4, P-5. Ninguno se cierra con esta rebanada.
- Pendiente: `/oracle` valida rebanada 2.

---
## `[2026-11-11 | Oracle valida rebanada 2 (PASS CON OBSERVACIONES) | Fila 33 corregida | Commit local de la rebanada 2 sin push]`
- 40 archivos, sin skills, guía ni bitácoras. Incluye el informe de Maggie (T234).
- Pendientes de Neo: firma de T226–T235 como COMPLETED.
- Siguiente: rebanada 3 (roles y permisos, T236–T252) cuando Neo lo autorice.

---
## `[2026-11-11 | HARDLINE: cierre de sesión | HEAD 9af6f0b | Handover escrito | Sin push]`
- Estado: rebanadas 1 y 2 validadas y commiteadas en local; T226–T235 y T236 pendientes de Neo.
- Observado en disco: `.claude/skills/` con SKILL.md borrados (no hechos en esta sesión). No se restauran sin orden de Neo.
- Próximo paso: respuesta de Neo a (a) firma T226–T235, (b) rebanada 3, (c) skills, (d) compuerta 001.

---
## `[2026-11-11 | Arranque de sesión (/morpheus) | Estado en disco verificado | Sin cambios desde el handover | Rebanada 3 sin autorizar]`
- HEAD `9af6f0b` en `002-plataforma-v21`, sin push. tasks.md: 35 [x], 76 [ ]. T236 pendiente de autorización de Neo.
- Árbol: 43 SKILL.md borrados en `.claude/skills/` (corrige el conteo de "más de 50" de /neb) y 4 modificados; sin commit.
- Hallazgo H-MOR-01: `.specify/feature.json` apunta a `specs/001-pet-health-tracker`, pero la rama activa es la 002. Requiere corrección (Nivel 2 de configuración o decisión de Neo).
- Acción: no se despacha código hasta que Neo autorice T236 (handover §5).

---
## `[2026-11-11 | Neo AUTORIZA rebanada 3 (T236–T252) | T226–T235 quedan [x] por decisión de Neo | Pendientes aceptados: T231, T238, T265, T284 | TDD estricto]`
- Decisión de Neo (Nivel 2): T226–T235 se mantienen [x] (COMPLETED firmado por Neo). No se revierten marcas.
- Pendientes aceptados por diseño: T231 (cota 150 kg, M1), T238 (alias species), T265 (auditoría de cuenta), T284 (interfaz de registros sin próxima fecha).
- Orden de operación: rebanada 3 con TDD estricto. Primero pruebas de la matriz de 44 celdas can(rol, acción) y de políticas de hogar (T236–T242), luego implementación (T243–T249), luego compuerta T252.
- Sin resolver: H-MOR-01 (.specify/feature.json apunta a 001) y el árbol con 43 SKILL.md borrados (no se mencionó en la autorización).
- Siguiente: despacho a /keymaker para T236 (solo pruebas, en rojo) y después /oracle.

---
## `[2026-11-11 | Neo confirma: H-MOR-01 resuelto (feature.json → 002), skills 43 borradas son deliberadas (migradas a ~/.claude/skills), despacho de T236 autorizado | Morpheus despacha Keymaker (subagente, MAX_HOPS=2) | Solo pruebas en rojo]`
- Verificado en disco: `.specify/feature.json` = `specs/002-plataforma-v21`. H-MOR-01 cerrado.
- Skills: no restaurar. Limpieza en commit de mantenimiento al cerrar la feature. Solo maggie, zee, kid, niobe deben quedar en `.claude/skills/`.
- Orden T236: pruebas de can(rol, acción) en `tests/unit/permissions-matrix.spec.ts`, en rojo, sin código de dominio. T236 sigue `[ ]` hasta firma de Neo.

---
## `[2026-11-11 | Keymaker entrega T236 (44 pruebas en rojo) | Verificado en disco por Morpheus | Sin código de dominio | Pendiente /oracle]`
- tests/unit/permissions-matrix.spec.ts: 44 fallidas, 0 pasan; causa: módulo src/domain/access/rbac.ts ausente (esperado).
- git: sin cambios en src/, contratos ni src/generated. tasks.md solo con las marcas previas. T236 sigue [ ].
- Matices de Keymaker a validar por Oracle/Neo: (1) MANAGE_HOUSEHOLD_MEMBERS con OWNER; casos de ADMIN no propietario quedan fuera de las 44 celdas. (2) EXPORT_IMPORT_BACKUP permite importar a READER (excepción N-4 de la spec).

---
## `[2026-11-11 | Neo autoriza despacho autónomo de tripulantes (permanente) | Matices ratificados (MANAGE_HOUSEHOLD_MEMBERS, N-4 READER) | Despacho de Oracle para T236]`
- Ratificado: can(rol, acción) es matriz gruesa; restricciones contextuales de hogar van en T237/T245/T246, no en can().
- Ratificado: N-4 (B), importar/exportar a nivel de cuenta permitido para todo rol.
- Alcance: T236 completa incluye property/access.property.spec.ts y access-policy.spec.ts (fila 6). Solo la primera parte está hecha.
- Límite: la autorización permanente cubre despacho. NO cubre marcar COMPLETED ni git push (siguen siendo de Neo).

---
## `[2026-11-11 | Oracle emite veredicto T236 parte 1: PASS CON OBSERVACIONES | 44/44 celdas verificadas | Pendiente fila 6 (property + access-policy) | Despacho de Keymaker para fila 6 (solo pruebas en rojo)]`
- Informe: .specify/memory/audits/oracle-T236-permissions-matrix.md. Verificación de verify-oracles: 0 débiles. verify-traceability T236: 0/3 (esperado, sin implementación).
- Observación O1 de Oracle (T226–T235 [x] sin commit): Neo ya lo firmó como COMPLETED en su decisión de Nivel 2. Queda registrado.
- Fila 6 (access.property.spec.ts y access-policy.spec.ts) sigue pendiente; son pruebas de la 001 que deben sustituirse por las de la 002. Se encarga a Keymaker en rojo, sin borrar pruebas de la 001.
- Implementación de rbac.ts NO se despacha (es T244, rebanada 3 posterior).

---
## `[2026-11-11 | Keymaker entrega fila 6 de T236 (15 pruebas nuevas en rojo) | 2 fallos 001 previos (EDGE-008/009, INV-ACC vs INV-ACC2) reportados | Despacho de Oracle]`
- Archivos: tests/unit/access-policy.spec.ts (+11) y tests/property/access.property.spec.ts (+4). Sin borrados. src/ intacto.
- Pendiente de Neo: EDGE-008/009 (001) rojos antes del cambio; decidir si se actualizan a INV-ACC2 o se sustituyen. Pruebas 001 candidatas a sustitución: 8 + 2, sin borrar.
- tsc: 5 errores TS2307 (módulos ausentes effective-role.ts, rbac.ts), esperados hasta T244.
- Firma de effectiveRole no fijada en spec: supuesta en el informe; T244 debe confirmarla.

---
## `[2026-11-11 | Oracle veredicto fila 6 de T236: PASS CON OBSERVACIONES | Sin defectos en pruebas nuevas | Decisiones para Neo: (a) EDGE-008/009, (b) firma de effectiveRole]`
- Informe: .specify/memory/audits/oracle-T236-fila6.md. 318 inserciones, 0 borrados. verify-oracles: 0 débiles.
- Confirmado: EDGE-008/009 rojos en HEAD por INV-ACC vs INV-ACC2 (no causados por Keymaker).
- Confirmado: firma de effectiveRole no está en la spec (suposición de Keymaker). T244 no la fija.
- O-2: hoja de ruta §C dice 32 celdas; spec y T236 dicen 44. Corregir la hoja.
- O-1: T236 completa aún requiere cerrar la parte 1 (permissions-matrix ya validada por Oracle).

---
## `[2026-11-11 | Neo decide (a) EDGE-008/009 → INV-ACC2 y (b) firma effectiveRole confirmada | Neo autoriza encadenar T237–T242 (rojo) y T243–T249 (verde) con Keymaker/Oracle sin confirmación intermedia salvo bloqueo | T236 cerrada en pruebas; marca [x] solo de Neo]`
- effectiveRole(user, pet, memberships, assignments) -> RbacRole | null: contrato para T244 (src/domain/access/effective-role.ts).
- Próximo: Keymaker actualiza EDGE-008/009 y escribe T237–T242 en rojo; Oracle valida; luego T243–T249.

---
## `[2026-11-11 | Keymaker entrega T237–T242 (52 pruebas nuevas; 47 rojas, 5 ya verdes) + EDGE-008/009 corregidos | Discrepancias: fixtures 002 vs arneses 001, 18 pruebas 001 rojas | Despacho de Oracle]`
- Oracle debe validar: (1) las 5 pruebas verdes nuevas (expulsar, abandonar, eliminar hogar, propietario no abandona, responder invitación dos veces) y si deben quedarse; (2) el desajuste de fixtures 002 vs arneses 001; (3) las 18 pruebas 001 rojas (OWNER/MEMBER); (4) tsc no ejecutado por Keymaker.
- Suposiciones sin contrato: applyMembershipEvent, ChangeMemberRoleUseCase, TransferHouseholdOwnershipUseCase, audit_entries, data.revokedAt.

---
## `[2026-11-11 | Oracle FAIL en T237–T242 (B1–B9) | MAX_RETRY=1 consumido aquí | Devuelve a Keymaker | Pendientes de Neo: N-1 (tabla C, backup export) y N-2 (RbacAction 11 vs 9)]`
- B1 household-policies.spec tabla 9 de 48 celdas; B2 property con expect([403,404,409]); B3 aserciones de ADMIN con roleOnJoin ignorado; B4 GET vs POST con CSRF en backup export; B5 falta siembra de invitación; B6 500 de dueño en vacunas (no tocar prueba, investigar); B7 audit_entries → audit_log; B8 tipado tsc (10 errores, 5 TS2307 esperados); B9 declarar access.property y permissions-matrix.
- Tras corrección: Oracle repite 11 archivos y tsc. No es segundo rebote: queda FAIL si persiste.

---
## `[2026-11-11 | Keymaker corrige B1–B9 (tests/ solamente) | B6 NO corregido: defecto de src/ (campos required de vacunas/desparasitaciones) | B4 queda rojo por GET vs POST en src/ | Despacho de Oracle para verificación final (última vuelta)]`
- vitest 11 archivos: 96 pasan / 124 fallan / 220. tsc: solo 5 TS2307 esperados. Sin oráculos débiles.
- Decisión pendiente de Neo/Architect: B6 (de dónde salen category y datos veterinarios de vacunas y desparasitaciones). No es de Keymaker.
- Pendientes de Neo: N-1 (tabla C), N-2 (vocabulario RbacAction 11 vs 9, bloquea T244), N-3 (nombres de funciones; puede ir a Architect).

---
## `[2026-11-11 | Oracle VEREDICTO FINAL T237–T242: FAIL (MAX_RETRY consumido) | Causa: 10 pruebas 001 sin sustituir (tabla C) | Escalado a Neo: D-1 a D-6]`
- Informe: .specify/memory/audits/oracle-T237-T242-final.md. vitest 96/124/220. tsc solo TS2307 esperados. verify-oracles CUMPLE.
- Clasificación de 124 fallos: (a) 66 módulos/migración ausentes; (b) 14 funciones no exportadas; (c) 27 rutas no implementadas; (d) 7 defectos de src/; (e) 10 pruebas 001 sin sustituir (causa del FAIL).
- Decisiones de Neo: D-1 sustituir 10 pruebas (e) o aplazar a T243 por escrito; D-2 fuente de category y datos veterinarios (Maggie+Architect); D-3 backup GET→POST en src (T279); D-5 RbacAction 11 vs 9 (bloquea T244); D-6 nombres de funciones.
- Nota de Oracle sobre tasks.md [x] en T226–T235: Neo ya lo ratificó como COMPLETED; queda registrado.

---
## `[2026-11-11 | Neo resuelve D-1 a D-6 | D-1: sustituir 10 pruebas 001 ahora | D-2: category constante (VACCINE/DEWORMING), vet fields opcionales con null | D-4: N-1 ratificado | D-5: 11 acciones en RbacAction, PetPermissions = proyección de 9 | D-6: nombres aprobados | Despacho Keymaker (sustitución 10) → Oracle revalida]`
- Pendiente tras sustitución: Architect (contrato vet fields, Caso B por posible conflicto con el required del esquema) → Keymaker (NULLABLE_DEFAULTS en record-use-cases.ts; hoy src/ no es de este paso).
- B4 (GET→POST) es src/ (T279) y se implementa después; los tests ya usan POST.

---
## `[2026-11-11 | Keymaker sustituye las 10 pruebas 001 (D-1) | 4 sustitutas salen VERDES (filas 3, 6, 8, 9) | Filas de tabla C ratificadas por Neo NO existen en la hoja en disco | Backup export GET→POST en 4 archivos más (efecto colateral) | Despacho de Oracle]`
- vitest 9 archivos: 55 fallan / 89 pasan / 144. tsc: solo TS2307 esperados.
- Hallazgo H-MOR-02: la tabla C de hoja-de-ruta-feature-002.md no contiene las filas «use-cases.households» ni «roles-migration» que Neo ratificó. Hay que añadirlas o confirmar que no aplican.
- Oracle debe decidir sobre las 4 sustitutas en verde y revisar el efecto colateral del POST en backup-atomicity, malicious-input, credentials y openapi-conformance.

---
## `[2026-11-11 | Oracle D1 revalidación: FAIL | Causas: (e) canEdit sin sustituir en household-policies:340-352; (f) malicious-input:252 y openapi-conformance:49/63 sin roleOnJoin / username inválido; (b) access-control:46 verde por atajo legado | Cifras no concilian (55/89/144 vs 139 fallos en 15 archivos) | Escalado a Neo (MAX_RETRY de la fase consumido)]`
- D-1 cumplida en disco: 10/10 sustituciones presentes.
- Oracle no reconcilia cifras de Keymaker. Keymaker debe declarar cuáles son válidas.
- H-MOR-02 confirmado: filas de tabla C no existen en disco.
- Pendientes de Neo: D-10 (diferir tests/unit/presentation a T284), confirmar que H-1 (tasks.md [x] T226–T235) ya está ratificado, aprobar corrección de 4 defectos en tests/.

---
## `[2026-11-11 | Neo autoriza: (1) Keymaker corrige los 4 defectos en tests/ (vuelta extra autorizada por Neo); (2) diferir tests/unit/presentation a T284; (3) añadir a tabla C las filas use-cases.households y roles-migration | T226–T235 se mantienen como firmadas]`
- Keymaker: corregir en tests/ únicamente (household-policies:340-352, malicious-input:252, openapi-conformance:49/63, access-control:46).
- Architect: solo documentación. Añadir a tabla C de hoja-de-ruta-feature-002.md las filas use-cases.households y roles-migration y la nota de diferimiento de tests/unit/presentation a T284 (D-10).
- Después: Oracle revalida (verify-oracles, tsc, vitest en 15 archivos).

---
## `[2026-11-11 | Architect entrega hoja de ruta: filas tabla C (use-cases.households, roles-migration), nota D-10, 32→44 en fila de permissions-matrix | Pendiente Neo: 32 residuales en A.4 (línea 18) y D.3(a) (línea 92)]`
- Residuo MEMBER en use-cases.households.spec.ts:78 (fila INVITED): Keymaker debe limpiarlo en la vuelta D1.
- Keymaker D1 sigue en curso. Después Oracle revalida 15 archivos + hoja.

---
## `[2026-11-11 | Keymaker D1: corrección parcial | (1) canEdit→permissions: ahora ROJO por dependencia de src (householdPets devuelve canEdit) | (2) roleOnJoin OK, sigue rojo | (3) openapi-conformance parcial, TypeError persiste | (4) access-control parcial, sigue verde por atajo legado | Cifras conciliadas 15 archivos: 126/140/266 | Despacho de Oracle para veredicto final de la fase]`
- tsc: 7 errores (5 TS2307 esperados + 2 TS2339 nuevos en household-policies:346/356).
- Riesgo: (3) y (4) siguen siendo defectos de tests/ según Keymaker. Esta es la última verificación de la fase; si sale FAIL, se escala a Neo como FAIL definitivo.

---
## `[2026-11-11 | Oracle VEREDICTO FINAL de fase T237–T242: FAIL | Defectos de tests/: contraseñas sin símbolo y sin confirmPassword (malicious-input:248, openapi-conformance:49); residuo MEMBER (use-cases.households:78) | Escalado a Neo]`
- Aceptados por Oracle: canEdit en rojo por src (d); access-control:46 verde aceptable hasta T244 (a).
- Pendientes de Neo: (1) autorizar última ronda de 3 correcciones en tests/; (2) hoja 32→44 en líneas 18 y 96; (3) aceptar D hasta T244; (4) H-1 tasks.md (ya ratificado por Neo, Oracle lo vuelve a pedir).
- Informe: .specify/memory/audits/oracle-T237-T242-final-D1.md.

---
## `[2026-11-11 | Neo autoriza: (1) última ronda de 3 correcciones en tests/ (contraseñas con símbolo y confirmPassword; residuo MEMBER), (2) hoja 32→44 en líneas 18 y 96, (3) aceptación escrita de canEdit en rojo y access-control:46 verde hasta T244 | Despacho Keymaker + Architect (docs) → Oracle revalidación final]`
- Aceptado por Neo hasta T244: household-policies:340–352 (rojo por src) y access-control:46 (verde por atajo legado). Se reabren en T244 si la aserción no se sustituye.
- Después de esta ronda, no hay más vueltas de MAX_RETRY en esta fase.
- 2026-11-11 | Architect 32->44 aplicado (líneas 18 y 96), 0 residuos.
- 2026-11-11 | Keymaker última ronda: 3 correcciones aplicadas (contraseñas, openapi username/pwd, fila INVITED sin role). vitest 3 archivos: 14 fallan / 20 pasan. tsc 7 sin nuevos. Despacho de Oracle final.
- 2026-11-11 | Oracle final D2: PASS en puntos 1-3; FAIL por único defecto T-1 (household-policies.spec.ts:323, expectativa OWNER/MEMBER obsoleta). Escalado a Neo: (a) corregir una línea, (b) deuda hasta T244. Informe: .specify/memory/audits/oracle-T237-T242-final-D2.md.
- 2026-11-11 | Neo autoriza corregir T-1 (household-policies:323 a valores 002). Keymaker en curso; luego Oracle revalida.
- 2026-11-11 | Keymaker T-1: línea 323 a ['ADMIN','READER']; ahora ROJO por src (householdView devuelve role crudo; fixture 001). Clasificable como (d) igual que canEdit. Despacho de Oracle para veredicto final.
- 2026-11-11 | Oracle FINAL-T1: FAIL (f). Línea 323 mezcla entrada 001 con expectativa 002; rojo que D2 no tenía. Cifras 141/266 (15 archivos). Opciones para Neo: (a) corregir setup en household-policies 309-387 con roles 002 (más de una línea), (b) aceptar hasta T244 por escrito. Informe: .specify/memory/audits/oracle-T237-T242-FINAL-T1.md.
- 2026-11-11 | Neo elige (a) para T-1: Keymaker reconstruye setup 002 en household-policies 309-387 (solo tests/). Luego Oracle revalida.
- 2026-11-11 | Keymaker T-1 (a): helper entrada002 en household-policies 309-387; línea 323 VERDE; archivo 12/23/35; añade flag isHouseholdOwner (verificar contra contrato). Despacho de Oracle final.
- 2026-11-11 | Oracle VEREDICTO T237-T242 (T1a): PASS CON OBSERVACIONES. Sin defectos de tests/ sin clasificar. Pendientes Neo: O-1 (expectativa Andrés=true en mascotas), O-4 (firma applyMembershipEvent supuesta), aceptaciones hasta T244 vigentes.
- 2026-11-11 | Neo decide: O-1 aceptado (Andrés=true en mascotas); O-4 firma applyMembershipEvent confirmada; aceptaciones hasta T244 vigentes. Despacho de Keymaker: T243 (migración) y T244 (rbac.ts, effective-role.ts) en verde, por fases.
- 2026-11-11 | Keymaker T243: migración 0004 + sqlite-database @implements; roles-migration 5/7 (2 defectos de prueba en líneas 116 y 128). T244: rbac.ts y effective-role.ts; 3 archivos 69/69; trazabilidad 4/4. Regresiones fijas 0001-0003 (4) y decisión INVITED pendientes de Neo. Nota: run en haiku; CLAUDE.md §5 pide sonnet para src/. Despacho de Oracle (sonnet).
- 2026-11-11 | Neo decide: (1) convertir INVITED/DECLINED/CANCELLED a household_invitations (data-model §2.9-2.10); (2) actualizar 4 aserciones fijas 0001-0003; (3) corregir roles-migration (116, 128, y exclusión del dueño en 77-79). Oracle T243-T244: PASS CON OBSERVACIONES. Despacho de Keymaker (sonnet) para la ronda de ajustes, luego Oracle.
- 2026-11-11 | Keymaker ajustes T243: A (conversión INVITED) rompe repositorio/harness: suite global 164→321 fallos (CHECK status en saveMembership). B y C aplicados; persistencia 45/61. INCIDENTE: Keymaker hizo git stash y pop para baseline; verificado: stash list vacío, árbol intacto. Escalado a Neo: revertir conversión o aceptar rojo hasta T247/T248.
- 2026-11-11 | Neo decide: mantener conversión INVITED en 0004 y absorber en T247/T248 (~157 rojos nuevos con causa conocida). Incidente git stash: cerrado por Neo. Despacho de Oracle (sonnet) para revalidar T243-T244 con ajustes.
- 2026-11-11 | Oracle revalidación T243-T244: PASS CON OBSERVACIONES. 16 rojos persistencia clase (i), causa conocida (T247/T248). Obs: T226-T235 [x] sin commit (Neo confirma); invitedByUserId nulo difiere de data-model §2.10 l.171. Escalado a Neo: cierre T243/T244 y autorización T245.
- 2026-11-11 | Neo ordena cerrar T243 y T244 ([x] aplicado por orden de Neo, solo esas dos líneas). Neo decide: invitedByUserId nulo según data-model §2.10 (relajar NOT NULL). T245 NO autorizado aún.
- 2026-11-11 | Keymaker: 0004 reconstruye household_invitations con invited_by_user_id anulable; conversión deja NULL si falta. vitest persistencia 20/20; tsc 2 errores T248. Despacho de Oracle para revalidar 0004.
- 2026-11-11 | Oracle 0004 invitedByUserId: PASS CON OBSERVACIONES. Falta test del caso sin invitedByUserId. Oracle recomienda T243 en REVIEW (yo marqué [x] por orden 'cerrar' de Neo: confirmar estado). Escalado a Neo.
- 2026-11-11 | Neo: T243 y T244 se mantienen [x]. Neo autoriza solo la prueba del caso invitedByUserId nulo (sin T245 aún). Keymaker en curso.
- 2026-11-11 | Keymaker corrige roles-migration:120 (toThrow→toContain MIGRATION_0004). Morpheus verifica en disco: verify-oracles CUMPLE 0 débiles/79; roles-migration 8/8; tsc 2 errores (T248); stash vacío.
- 2026-11-11 | HARDLINE: cierre de sesión. Handover actualizado. Próxima acción: orden de Neo para T245.

### 2026-11-12 07:32 — Morpheus: handoff autónomo iniciado
- Turno concedido en bus (iteración 0/20). Directiva de Neo: implementar T245 (roles, propietario único, poda, transferencia de mascota).
- Plan: cargar instrucciones de Keymaker y ejecutar T245 con verificación en disco; luego /oracle antes de devolver a Neo.
- Nota de modelo: sesión en haiku; CLAUDE.md exige sonnet para programar src/. Se registra como riesgo.

### 2026-11-12 07:42 — Morpheus: modo automático detenido por Neo (PAUSA_NEO). T245 queda en espera de decisión A/B.

### 2026-11-12 07:58 — Morpheus: modo automático reanudado por Neo. Neo ratificó B (T245 [x]); misión T246 con requisitos H-T245-1 y H-T245-2.

### 2026-11-12 07:59 — Morpheus: T246 bloqueada antes de editar.
- Use-cases.households: 9 fallos. 4 T237 (ChangeMemberRoleUseCase, TransferHouseholdOwnershipUseCase no exportados).
- Contradicción: test de creación exige fila de propietario sin isHouseholdOwner; el dominio T237 exige el flag para reconocer propietario. Caso B.
- Faltan puertos: household owner update (transferir) y repositorio de pet_assignments (poda H-T245-2). Pertenecen a T247 según tasks.
- Sin cambios de código en T246. Espera decisión de Neo.

### 2026-11-12 08:02 — Morpheus: Neo aprueba A2 y B para T246 y ordena Sonnet. Morpheus no puede cambiar de modelo desde la sesión; se pide a Neo /model sonnet antes de despachar.

### 2026-11-12 08:07 — Morpheus: modo automático detenido por Neo. T246 aprobada (A2+B) pendiente de /model sonnet. Sin despacho.

### 2026-11-12 08:17 — Morpheus: reanudación pedida. El entorno indica Haiku 5.5, no Sonnet 5.5; no se despacha T246 en Haiku. Bus en PAUSA_NEO.

### 2026-11-12 08:47 — Morpheus: modo automático reanudado. Neo aprobó A2+B. Despacho de T246 a Keymaker en subagente sonnet (con H-T245-1 y H-T245-2).

### 2026-11-12 08:56 — Morpheus: Oracle T246 CONDICIONADO (H-T246-1..7). Pendientes decisiones de Neo: H-T246-4 (fila creador), alcance de H-T246-3 (escritura de INVITED vs T238). Sin despacho hasta respuesta.

### 2026-11-12 09:05 — Morpheus: modo automático detenido por Neo. T246 CONDICIONADO, sin despacho; pendientes decisiones H-T246-3/4 y alcance H-T246-1/2.

### 2026-11-12 09:09 — Morpheus: Neo resuelve H-T246-4 (1a, corregir prueba), H-T246-3 (sí, household_invitations), H-T246-1 y H-T246-2 (sí). Despacho a Keymaker sonnet y luego Oracle.

### 2026-11-12 09:16 — Morpheus: Oracle revalidación T246 APTO (ciclo 2). Pendiente firma de Neo para marcar T246. Hallazgos H-T246-5/6/7 pasan a T247 y auditoría.

### 2026-11-12 09:25 — Morpheus: Neo firma T246 [x]. Hallazgos H-T246-5/6/7 trasladados. Despacho de T247 a Keymaker sonnet, luego Oracle.

### 2026-11-12 09:54 — Morpheus: Neo firma T247 [x]. Despacho de T248 a Keymaker sonnet (incluye H-T247-1 con prueba roja y permissions de HouseholdPetEntry).

### 2026-11-12 10:12 — Morpheus: Neo autoriza C1 sí, C2 A, C3 sí para T248. Despacho a Keymaker sonnet solo pruebas (sin tocar src), luego Oracle.

### 2026-11-12 10:23 — Morpheus: Neo firma T248 [x], ratifica lista de María y autoriza título O-2. Despacho de T249 y título O-2 a Keymaker sonnet.
