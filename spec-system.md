# SPEC-SYSTEM CONTROL PLANE (SDD GOVERNANCE)

Este repositorio opera estrictamente bajo la metodología Spec-Driven & Schema-Driven Development (SDD).
Toda IA, agente automatizado o asistente generativo debe leer, interpretar y alinearse con las restricciones de este archivo antes de inspeccionar, sugerir o generar código.


---

## 1. PRINCIPIO DE INVERSIÓN ARQUITECTÓNICA Y JERARQUÍA DE VERDAD
- **Jerarquía de Fuentes de Verdad (Precedencia Ejecutable):** Las especificaciones funcionales (`specs/<NNN-feature>/spec.md`) y los contratos formales (`specs/<NNN-feature>/contracts/`) constituyen la Fuente de Verdad del sistema. El código fuente (`src/`) es un derivado secundario y desechable ("Ambient Code"). Ante cualquier discrepancia entre la prosa narrativa de `specs/<NNN-feature>/spec.md` y un contrato formal ejecutable (`specs/<NNN-feature>/contracts/schemas/`, `specs/<NNN-feature>/contracts/openapi/`, `specs/<NNN-feature>/contracts/state-machines/`, `specs/<NNN-feature>/contracts/errors/`), **prevalece el contrato formal** y se detiene la ejecución hasta reconciliar ambos artefactos.
- **Cero "Vibe Coding":** Queda estrictamente prohibido implementar código sin una tarea atómica (`specs/<NNN-feature>/tasks.md`) en estado `APPROVED`, vinculada a un plan técnico (`specs/<NNN-feature>/plan.md`), respaldada por contratos bloqueados (`specs/<NNN-feature>/contracts/` -> `src/generated/`) y derivada de una especificación (`specs/<NNN-feature>/spec.md`) validada con `.specify/memory/audits/spec-review.md`.
- **Ciclo de Vida de los Artefactos SDD:** Todo documento SDD (`.specify/memory/`, `specs/`) y contrato en `specs/<NNN-feature>/contracts/` debe declarar en su cabecera su versión SemVer y su estado formal: `DRAFT` -> `REVIEW` -> `APPROVED` -> `LOCKED` (o `DEPRECATED` / `SUPERSEDED`). Ninguna fase downstream puede iniciarse si el artefacto upstream no se encuentra en estado `APPROVED` o `LOCKED`.
- **Resolución de Deriva (Drift Resolution):**
  - *Caso A — Regresión de Implementación:* Si una prueba falla porque `src/` violó un contrato o especificación vigente en estado `LOCKED`, **está prohibido modificar la especificación o el contrato**; debe corregirse exclusivamente la implementación en `src/`.
  - *Caso B — Defecto de Especificación o Nuevo Caso de Negocio:* Si se identifica un caso de borde no modelado o un cambio en las reglas de negocio, la actualización debe realizarse primero en `specs/<NNN-feature>/spec.md` y `specs/<NNN-feature>/contracts/`, regenerar `src/generated/`, ajustar `specs/<NNN-feature>/plan.md` y `specs/<NNN-feature>/tasks.md`, y solo entonces modificar `src/`.
- **Trazabilidad Verificable por Máquina (Lineage IDs):** Toda regla de negocio (`REQ-XXX`), invariante de dominio (`INV-XXX`), transición de máquina de estados (`STATE-XXX`) y fallo tipado (`ERR-XXX`) debe poseer un identificador inmutable declarado en `specs/<NNN-feature>/spec.md` y `specs/<NNN-feature>/contracts/`, referenciado en `src/` y verificado explícitamente en `tests/`.
- **Versionado Semántico de Contratos (SemVer):** Todo esquema y contrato en `specs/<NNN-feature>/contracts/` se rige por SemVer (`MAJOR.MINOR.PATCH`). Cualquier cambio incompatible hacia atrás (`MAJOR`) exige estrategia de migración explícita y autorización humana previa (Nivel 2).

---

## 2. ÍNDICE Y MAPA DEL SISTEMA DE GOBERNANZA
Cualquier interacción debe consultar y respetar las siguientes rutas según la fase del ciclo de vida:

| Fase | Directorio Base | Archivo / Plantilla Relevante | Función |
| :--- | :--- | :--- | :--- |
| **0. Gobernanza** | `.specify/memory/` | `constitution.md` | Invariantes arquitectónicas no negociables y límites de autoridad. |
| **1. Specify** | `specs/<NNN-feature>/` | `spec.md` (plantilla `.specify/templates/spec-template.md`), `checklists/requirements.md`, `.specify/memory/audits/spec-review.md` | Requisitos funcionales, invariantes, casos de borde y compuerta de revisión de especificación (What/Why). |
| **1.5. Contract Lock** | `specs/<NNN-feature>/contracts/` | `schemas/`, `openapi/`, `state-machines/`, `errors/`, `examples/` | Formalización declarativa de estructuras de datos, APIs, máquinas de estados, taxonomía de errores y ejemplos canónicos. |
| **2. Plan** | `specs/<NNN-feature>/` | `plan.md` (plantilla `.specify/templates/plan-template.md`), `research.md`, `data-model.md`, `quickstart.md`, `specs/<NNN-feature>/contracts/` | Arquitectura técnica, diseño de componentes y mapeo de contratos (How). |
| **3. Tasks** | `specs/<NNN-feature>/` | `tasks.md` (plantilla `.specify/templates/tasks-template.md`) | Descomposición de tareas atómicas secuenciales con IDs de trazabilidad. |
| **4. Implement** | `src/`, `specs/<NNN-feature>/checklists/` | `src/generated/`, `checklists/code-review.md` | Compilación de contratos a código tipado y generación downstream en `domain/`, `application/`, `infrastructure/` y `presentation/`. |
| **5. Test Gate** | `tests/`, `specs/<NNN-feature>/checklists/`, `scripts/` | `checklists/oracle-validation.md`, `verify-traceability.sh`, `verify-oracles.sh` | Ejecución determinista de compuertas multinivel, trazabilidad de IDs y auditoría humana de aserciones. |

---

## 3. LÍMITES OPERATIVOS UNIVERSALES (THREE-TIER BOUNDARY)
Toda acción del agente debe estar regulada por los siguientes niveles de autonomía definidos en la Constitución:

### Nivel 1: Mandatos (Always Do)
- Leer `.specify/memory/constitution.md` y este archivo antes de generar especificaciones, contratos, planes o código.
- Ejecutar `scripts/compile-contracts.sh` tras cualquier cambio aprobado en `specs/<NNN-feature>/contracts/` y consumir exclusivamente los tipos y validadores de `src/generated/`.
- Aplicar validación estricta de esquemas en runtime (`additionalProperties: false`) en todas las fronteras de entrada/salida (`src/infrastructure/` y `src/presentation/`).
- Incluir pruebas unitarias (`tests/unit/`), pruebas basadas en propiedades con semilla fija (`tests/property/`) y pruebas de contrato (`tests/integration/contracts/`) vinculadas por ID (`REQ-`, `INV-`, `STATE-`, `ERR-`) para cada cambio.
- Mantener los nombres de archivos y la estructura de carpetas exactamente como se definen en el estándar del repositorio.
- Reportar qué archivo de especificación, contrato e IDs de trazabilidad respaldan el cambio propuesto.

### Nivel 2: Puntos de Control Humano (Ask First)
- Creación, modificación o cambio de versión en contratos formales (`specs/<NNN-feature>/contracts/openapi/`, `specs/<NNN-feature>/contracts/schemas/`, `specs/<NNN-feature>/contracts/state-machines/`, `specs/<NNN-feature>/contracts/errors/`).
- Transición de estado de especificaciones o contratos hacia `APPROVED` o `LOCKED`.
- Alteraciones en esquemas de base de datos, persistencia o migraciones.
- Inclusión o actualización de dependencias y paquetes de terceros.
- Modificación a las canalizaciones de CI/CD (`.github/workflows/`), scripts de verificación (`scripts/`) o umbrales de mutación (`stryker.conf.json`).

### Nivel 3: Prohibiciones Categóricas (Never Do)
- Escribir o cometer secretos, credenciales o API keys en texto plano.
- Modificar manualmente cualquier archivo dentro de `src/generated/` o directorios de dependencias del sistema (`node_modules/`, `vendor/`).
- Invocar fuentes de entropía o efectos secundarios no deterministas directamente en `src/domain/` o `src/application/` (`Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`, lectura directa de `process.env` o llamadas de red/disco sin abstraer mediante puertos inyectados).
- Eliminar, comentar, relajar pruebas o emplear selección heurística/probabilística de tests para simular éxito en el Test Gate.
- Generar código en `src/` sin contratos en estado `LOCKED`, sin haber aprobado `.specify/memory/audits/spec-review.md` y sin una tarea atómica validada en `specs/<NNN-feature>/tasks.md`.

---

## 4. BUCLE DE CONTROL Y EJECUCIÓN (SOP)
Para cada instrucción de desarrollo, el agente debe seguir estrictamente este flujo determinista:
1. Validar que la feature cuenta con un documento en `specs/<NNN-feature>/spec.md` en estado `APPROVED` tras cumplir `.specify/memory/audits/spec-review.md`.
2. Verificar que los contratos formales correspondientes en `specs/<NNN-feature>/contracts/` (`schemas/`, `openapi/`, `state-machines/`, `errors/`, `examples/`) están en estado `LOCKED` y compilar los artefactos hacia `src/generated/` mediante `scripts/compile-contracts.sh`.
3. Verificar que existe un blueprint técnico en `specs/<NNN-feature>/plan.md` en estado `APPROVED`.
4. Seleccionar la siguiente tarea pendiente en `specs/<NNN-feature>/tasks.md` verificando los IDs de trazabilidad objetivo (`REQ-`, `INV-`, `STATE-`, `ERR-`).
5. Generar el código determinista mínimo necesario en `src/` (`domain/`, `application/`, `infrastructure/`, `presentation/`) y sus pruebas exhaustivas en `tests/` (`unit/`, `property/`, `integration/contracts/`, `e2e/`).
6. Ejecutar la validación del Test Gate, incluyendo `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh`, `specs/<NNN-feature>/checklists/code-review.md` y `specs/<NNN-feature>/checklists/oracle-validation.md`.
7. Esperar la validación y el aval del arquitecto humano antes de marcar la tarea como completada y pasar a la siguiente.
