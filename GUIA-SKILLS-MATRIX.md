# Guía Rápida de Skills — Proyecto ARGOS (*The Matrix* Edition)

> **Tu Rol en el Proyecto:** Eres **`Neo` (`Andrés Vallejo` — Autoridad Nivel 2)**.
> Ningún agente puede sustituirte para:
> 1. Marcar tareas como `COMPLETED` en `specs/001-pet-health-tracker/tasks.md`.
> 2. Aprobar documentos finales (`APPROVED` o `LOCKED`).
> 3. Autorizar librerías nuevas de Nivel 2 (`package.json`).
> 4. Hacer `git push`.

---

## 1. Cómo trabajar en tu día a día (Flujo en 1 Sola Ventana)

### Paso 1 — Arrancar sesión
Abre Claude Code en la carpeta `Proyecto Argos` y escribe uno de estos comandos según lo que quieras hacer:

- **Para saber dónde estamos hoy en español sencillo (sin siglas técnicas):**
  ```text
  /neb Dame el resumen actual del proyecto y qué decisiones mías como Neo están pendientes.
  ```
- **Para continuar el trabajo de la cola de tareas automáticamente:**
  ```text
  /morpheus Despierta sesión en ARGOS. Lee claude/registro-proceso-argos.md y coordina el siguiente paso.
  ```
- **Para hablar directo con uno de los 3 roles principales:**
  - `/architect` → Diseñar o ajustar specs y contratos.
  - `/keymaker` → Programar código o correr pruebas.
  - `/oracle` → Auditar en disco lo que se hizo antes de tu firma.

### Paso 2 — Dejar que interactúen (sin copiar y pegar entre ventanas)
- En la misma ventana, `/keymaker` y `/architect` pueden resolver dudas entre sí (máximo 1 ida y vuelta para no quedarse en bucle).
- Al terminar una tarea o cambio, `/oracle` revisa el disco y te entrega el mensaje final con formato `DE: The Oracle / PARA: Neo` pidiendo tu autorización.
- Cada rol guarda automáticamente su progreso en caliente dentro de la carpeta `claude/log-<personaje>.md` (no dependen de la memoria del chat).

### Paso 3 — Cerrar sesión
Cuando termines una tarea o quieras parar de trabajar, solo escribe en lenguaje natural:
```text
cerremos sesión
```
*(Esto activa automáticamente `/hardline`, guarda el handover del día en `claude/` y te imprime el texto exacto de 3 líneas para despertar en la próxima sesión).*

---

## 2. Regla de Modelos en 3 Niveles (Ahorro Inteligente de Tokens)

Todas las **24 skills tienen `haiku` como modelo por defecto** para que cualquier conversación sencilla, consulta o ejecución de scripts sea rápida y económica:
- **Nivel 1 (`haiku` — Por defecto en las 24 skills):** Charlas sencillas, dudas rápidas, lectura de bitácoras, correr scripts (`verify-traceability.sh`, `tsc`) y coordinar entre roles.
- **Nivel 2 (`sonnet` — Ejecución importante):** Se usa en `/architect`, `/keymaker`, `/oracle`, `/trinity` o `/zion` únicamente cuando van a redactar contratos/specs, programar código en `src/` y `tests/`, hacer auditoría profunda o debatir. Al terminar vuelven a `haiku`.
- **Nivel 3 (`opus` — Máximo nivel):** Reservado solo para cirugía algorítmica o arquitectónica crítica donde `sonnet` no sea suficiente.

---

## 3. Tabla Concreta de las 24 Skills y Cómo Usarlas

### A. Escuadra Principal (Uso diario — 90% del tiempo)
| Comando | Personaje | Modelo (Niveles) | Función Concreta | Ejemplo de uso |
| :--- | :--- | :---: | :--- | :--- |
| **`/architect`** | El Arquitecto | `haiku` → `sonnet` → `opus` | **Arquitecto SDD:** Diseña y edita `spec.md`, `plan.md`, `constitution.md` y `contracts/`. Resuelve dudas de diseño (`CC-*`). No toca código. | `/architect Revisa el contrato de mascotas y define el esquema para alertas.` |
| **`/mouse`** | Mouse | `haiku` → `sonnet` | **Auditor de Specs & Spec Kit:** Valida la coherencia de especificaciones con `speckit-analyze`, `speckit-clarify` y compuertas de trazabilidad antes de programar. | `/mouse Ejecuta speckit-analyze y dime si hay huecos en la spec antes de aprobarla.` |
| **`/keymaker`** | El Cerrajero | `haiku` → `sonnet` → `opus` | **Desarrollador SDD:** Programa `src/` y `tests/`, compila contratos, corre tests y hace commits locales. | `/keymaker Implementa TASK-115 y ejecuta npm run test:gate.` |
| **`/oracle`** | El Oráculo | `haiku` → `sonnet` | **Auditor SDD en Disco:** Verifica en disco (git, hashes y tests reales) lo reportado por `/keymaker` y `/architect`. Filtro único antes de tu firma como **Neo**. | `/oracle Audita en disco los últimos cambios de la rama y dame tu veredicto.` |
| **`/morpheus`** | Morfeo | `haiku` | **Tech Lead / Capitán:** Revisa la cola `tasks.md`, te dice qué tarea sigue y coordina a qué rol invocar. | `/morpheus ¿Qué tarea sigue en la cola y quién debe actuar?` |

### B. Especialistas Técnicos (Bajo demanda según el tema)
| Comando | Personaje | Modelo (Niveles) | Función Concreta | Ejemplo de uso |
| :--- | :--- | :---: | :--- | :--- |
| **`/trinity`** | Trinity | `haiku` → `sonnet` | **Seguridad y Criptografía:** Audita sesiones, Argon2id, CSRF, IDOR y reglas Semgrep. | `/trinity Revisa si el endpoint nuevo tiene riesgo de IDOR o CSRF.` |
| **`/seraph`** | Seraph | `haiku` | **QA Avanzado:** Verifica calidad de tests (cero oráculos falsos), mutación Stryker y E2E Playwright. | `/seraph Verifica los oráculos de tests y corre verify-oracles.sh.` |
| **`/tank`** | Tank (Operador) | `haiku` | **Cloud GCP y DevOps:** Prepara Docker, Cloud Run, Terraform IaC y GitHub Actions. | `/tank Prepara el Dockerfile y el plan de despliegue en Cloud Run.` |
| **`/niobe`** | Capitana Niobe | `haiku` | **IoT y Proyecto Mirror:** Diseña la integración con collares GPS, comederos, areneros y **Mirror**. | `/niobe Diseña cómo recibiremos telemetría desde el proyecto Mirror.` |
| **`/sati`** | Sati | `haiku` | **Diseño UX/UI:** Cuida componentes React, Tailwind, colores (`colorToken`), gráficas y accesibilidad. | `/sati Mejora la visualización de la curva de peso en el dashboard.` |
| **`/hamann`** | Consejero Hamann | `haiku` | **Optimizador de Claude:** Ajusta tus skills y `CLAUDE.md` para gastar menos tokens. | `/hamann Revisa qué podemos optimizar para consumir menos tokens.` |
| **`/merovingian`** | El Merovingio | `haiku` | **Causa-Efecto y Librerías:** Calcula qué archivos se rompen si tocas un contrato y audita `package.json` (`npm audit`). | `/merovingian ¿Qué se afecta si cambio este esquema y cómo va DEUDA-DEP-001?` |

### C. Producto, Dominio Mascotas y Lentes de Criterio
| Comando | Personaje | Modelo (Niveles) | Función Concreta | Ejemplo de uso |
| :--- | :--- | :---: | :--- | :--- |
| **`/zee`** | Zee | `haiku` | **Producto / Dueño (`OWNER`):** Evalúa si una función es fácil y útil para el dueño de la mascota. | `/zee Evalúa si el flujo de registrar una vacuna es claro para el dueño.` |
| **`/kid`** | The Kid | `haiku` | **Usuario Invitado (`MEMBER`):** Revisa la experiencia del familiar o paseador invitado al hogar. | `/kid ¿Qué ve y qué puede hacer un invitado al entrar al hogar compartido?` |
| **`/dozer`** | Dozer | `haiku` | **Veterinario:** Valida lógica clínica (vacunas, peso ideal, signos vitales, mascotas geriátricas +10 años). | `/dozer Valida si los rangos de alerta de peso geriátrico tienen sentido clínico.` |
| **`/rama`** | Rama Kandra | `haiku` | **Privacidad y Backups:** Cuida que no salgan datos sensibles en logs y que los backups `.json` sean atómicos. | `/rama Verifica que el backup de 10 MB haga rollback completo si falla.` |
| **`/lock`** | Comandante Lock | `haiku` | **Abogado del Diablo:** Busca casos borde (`EDGE-*`) y qué puede salir mal antes de programar. | `/lock Haz de abogado del diablo sobre esta propuesta y dime cómo podría fallar.` |
| **`/mifune`** | Capitán Mifune | `haiku` | **Lente Pragmático:** Frena la sobre-ingeniería y propone la solución más simple y directa. | `/mifune Simplifica este diseño para entregarlo hoy sin complicarnos.` |

### D. Espacios de Trabajo, Consola, Bus y Salida
| Comando | Personaje / Lugar | Modelo (Niveles) | Función Concreta | Ejemplo de uso |
| :--- | :--- | :---: | :--- | :--- |
| **`/zion`** | Consejo de Sion | `haiku` → `sonnet` | **Arena de Debate:** Pone a debatir a 2 o más roles (`1v1`, `Escuadrón` o `7v7`) para destrabar una decisión difícil. | `/zion Abre debate 1v1 entre /architect y /keymaker sobre este bloqueo.` |
| **`/dojo`** | Dojo de Morfeo | `haiku` | **Mejora y Deuda Técnica:** Analiza y planifica cómo limpiar deudas (`DEUDA-*`) o subir cobertura de tests. | `/dojo Arma el plan para limpiar DEUDA-TIPADO-001 sin romper nada.` |
| **`/neb`** | Consola Nabucodonosor | `haiku` | **Traductor a Español Claro:** Traduce las siglas y códigos del proyecto (`CC-*`, `INV-*`, `H-*`) a lenguaje normal. | `/neb Explícame en español sencillo en qué va el proyecto hoy.` |
| **`/logos`** | Nave Logos | `haiku` | **Bus Mensajero:** Sincroniza `claude/registro-proceso-argos.md` si abres más de una ventana o conectas con **Mirror**. | `/logos Sincroniza el bus central con los últimos cambios en disco.` |
| **`/hardline`** | Línea Telefónica | `haiku` | **Cierre de Sesión:** Guarda todo en disco y genera el prompt de despertar. *(Se activa sola al decir **"cerremos sesión"**)*. | `cerremos sesión` *(o `/hardline`)* |

### E. Pruebas de Ataque y Caos (Red Team)
| Comando | Personaje | Modelo (Niveles) | Función Concreta | Ejemplo de uso |
| :--- | :--- | :---: | :--- | :--- |
| **`/smith`** | Agente Smith | `haiku` → `sonnet` | **Chaos Engineering:** Simula caídas de SQLite, cortes a mitad de un backup o alta concurrencia. | `/smith Intenta romper la importación de backups simulando un fallo a mitad de camino.` |
| **`/sentinels`** | Los 9 Centinelas | `haiku` | **Batería de 9 Exploits:** Lanza los 9 ataques obligatorios de la Constitución §5 (IDOR, CSRF, XSS, fuerza bruta, >10 MB). | `/sentinels Pasa lista a los 9 vectores de ataque sobre las rutas HTTP.` |

---

## 4. Ubicación de Archivos Clave
- **Esta guía rápida:** `GUIA-SKILLS-MATRIX.md`
- **Skills activas (leídas por Claude Code):** `.claude/skills/<nombre>/SKILL.md`
- **Reglas globales automáticas:** `CLAUDE.md`
- **Memoria viva y logs en disco:** `claude/registro-proceso-argos.md` y `claude/log-<personaje>.md`
- **Especificación completo de las 24 skills:** `SKILLS-PROPUESTAS.MD`
