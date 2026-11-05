# SPEC-SYSTEM CONTROL PLANE (SDD GOVERNANCE)

Este repositorio opera estrictamente bajo la metodología Spec-Driven & Schema-Driven Development (SDD).
Toda IA, agente automatizado o asistente generativo debe leer, interpretar y alinearse con las restricciones de este archivo antes de inspeccionar, sugerir o generar código.

---

## 1. PRINCIPIO DE INVERSIÓN ARQUITECTÓNICA Y JERARQUÍA DE VERDAD
- **Jerarquía de Fuentes de Verdad (Precedencia Ejecutable):** Las especificaciones funcionales (`.specify/specs/`) y los contratos formales (`contracts/`) constituyen la Fuente de Verdad del sistema. El código fuente (`src/`) es un derivado secundario y desechable ("Ambient Code"). Ante cualquier discrepancia entre la prosa narrativa de `.specify/specs/` y un contrato formal ejecutable (`contracts/schemas/`, `contracts/openapi/`, `contracts/state-machines/`, `contracts/errors/`), **prevalece el contrato formal** y se detiene la ejecución hasta reconciliar ambos artefactos.
- **Cero "Vibe Coding":** Queda estrictamente prohibido implementar código sin una tarea atómica (`.specify/tasks/`) en estado `APPROVED`, vinculada a un plan técnico (`.specify/plans/`), respaldada por contratos bloqueados (`contracts/` -> `src/generated/`) y derivada de una especificación (`.specify/specs/`) validada con `.specify/checklists/spec-review.md`.
- **Ciclo de Vida de los Artefactos SDD:** Todo documento en `.specify/` y contrato en `contracts/` debe declarar en su cabecera su versión SemVer y su estado formal: `DRAFT` -> `REVIEW` -> `APPROVED` -> `LOCKED` (o `DEPRECATED` / `SUPERSEDED`). Ninguna fase downstream puede iniciarse si el artefacto upstream no se encuentra en estado `APPROVED` o `LOCKED`.
- **Resolución de Deriva (Drift Resolution):**
  - *Caso A — Regresión de Implementación:* Si una prueba falla porque `src/` violó un contrato o especificación vigente en estado `LOCKED`, **está prohibido modificar la especificación o el contrato**; debe corregirse exclusivamente la implementación en `src/`.
  - *Caso B — Defecto de Especificación o Nuevo Caso de Negocio:* Si se identifica un caso de borde no modelado o un cambio en las reglas de negocio, la actualización debe realizarse primero en `.specify/specs/` y `contracts/`, regenerar `src/generated/`, ajustar `.specify/plans/` y `.specify/tasks/`, y solo entonces modificar `src/`.
- **Trazabilidad Verificable por Máquina (Lineage IDs):** Toda regla de negocio (`REQ-XXX`), invariante de dominio (`INV-XXX`), transición de máquina de estados (`STATE-XXX`) y fallo tipado (`ERR-XXX`) debe poseer un identificador inmutable declarado en `.specify/specs/` y `contracts/`, referenciado en `src/` y verificado explícitamente en `tests/`.
- **Versionado Semántico de Contratos (SemVer):** Todo esquema y contrato en `contracts/` se rige por SemVer (`MAJOR.MINOR.PATCH`). Cualquier cambio incompatible hacia atrás (`MAJOR`) exige estrategia de migración explícita y autorización humana previa (Nivel 2).

---

## 2. ÍNDICE Y MAPA DEL SISTEMA DE GOBERNANZA
Cualquier interacción debe consultar y respetar las siguientes rutas según la fase del ciclo de vida:

| Fase | Directorio Base | Archivo / Plantilla Relevante | Función |
| :--- | :--- | :--- | :--- |
| **0. Gobernanza** | `.specify/constitution/` | `constitution.md` | Invariantes arquitectónicas no negociables y límites de autoridad. |
| **1. Specify** | `.specify/specs/`, `.specify/checklists/` | `templates/spec-template.md`, `checklists/spec-review.md` | Requisitos funcionales, invariantes, casos de borde y compuerta de revisión de especificación (What/Why). |
| **1.5. Contract Lock** | `contracts/` | `schemas/`, `openapi/`, `state-machines/`, `errors/`, `examples/` | Formalización declarativa de estructuras de datos, APIs, máquinas de estados, taxonomía de errores y ejemplos canónicos. |
| **2. Plan** | `.specify/plans/` | `templates/plan-template.md` | Arquitectura técnica, diseño de componentes y mapeo de contratos (How). |
| **3. Tasks** | `.specify/tasks/` | `templates/tasks-template.md` | Descomposición de tareas atómicas secuenciales con IDs de trazabilidad. |
| **4. Implement** | `src/`, `.specify/checklists/` | `src/generated/`, `checklists/code-review.md` | Compilación de contratos a código tipado y generación downstream en `domain/`, `application/`, `infrastructure/` y `presentation/`. |
| **5. Test Gate** | `tests/`, `.specify/checklists/`, `scripts/` | `checklists/oracle-validation.md`, `verify-traceability.sh`, `verify-oracles.sh` | Ejecución determinista de compuertas multinivel, trazabilidad de IDs y auditoría humana de aserciones. |

---

## 3. LÍMITES OPERATIVOS UNIVERSALES (THREE-TIER BOUNDARY)
Toda acción del agente debe estar regulada por los siguientes niveles de autonomía definidos en la Constitución:

### Nivel 1: Mandatos (Always Do)
- Leer `.specify/constitution/constitution.md` y este archivo antes de generar especificaciones, contratos, planes o código.
- Ejecutar `scripts/compile-contracts.sh` tras cualquier cambio aprobado en `contracts/` y consumir exclusivamente los tipos y validadores de `src/generated/`.
- Aplicar validación estricta de esquemas en runtime (`additionalProperties: false`) en todas las fronteras de entrada/salida (`src/infrastructure/` y `src/presentation/`).
- Incluir pruebas unitarias (`tests/unit/`), pruebas basadas en propiedades con semilla fija (`tests/property/`) y pruebas de contrato (`tests/integration/contracts/`) vinculadas por ID (`REQ-`, `INV-`, `STATE-`, `ERR-`) para cada cambio.
- Mantener los nombres de archivos y la estructura de carpetas exactamente como se definen en el estándar del repositorio.
- Reportar qué archivo de especificación, contrato e IDs de trazabilidad respaldan el cambio propuesto.

### Nivel 2: Puntos de Control Humano (Ask First)
- Creación, modificación o cambio de versión en contratos formales (`contracts/openapi/`, `contracts/schemas/`, `contracts/state-machines/`, `contracts/errors/`).
- Transición de estado de especificaciones o contratos hacia `APPROVED` o `LOCKED`.
- Alteraciones en esquemas de base de datos, persistencia o migraciones.
- Inclusión o actualización de dependencias y paquetes de terceros.
- Modificación a las canalizaciones de CI/CD (`.github/workflows/`), scripts de verificación (`scripts/`) o umbrales de mutación (`stryker.conf.json`).

### Nivel 3: Prohibiciones Categóricas (Never Do)
- Escribir o cometer secretos, credenciales o API keys en texto plano.
- Modificar manualmente cualquier archivo dentro de `src/generated/` o directorios de dependencias del sistema (`node_modules/`, `vendor/`).
- Invocar fuentes de entropía o efectos secundarios no deterministas directamente en `src/domain/` o `src/application/` (`Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`, lectura directa de `process.env` o llamadas de red/disco sin abstraer mediante puertos inyectados).
- Eliminar, comentar, relajar pruebas o emplear selección heurística/probabilística de tests para simular éxito en el Test Gate.
- Generar código en `src/` sin contratos en estado `LOCKED`, sin haber aprobado `.specify/checklists/spec-review.md` y sin una tarea atómica validada en `.specify/tasks/`.

---

## 4. BUCLE DE CONTROL Y EJECUCIÓN (SOP)
Para cada instrucción de desarrollo, el agente debe seguir estrictamente este flujo determinista:
1. Validar que la feature cuenta con un documento en `.specify/specs/[feature].md` en estado `APPROVED` tras cumplir `.specify/checklists/spec-review.md`.
2. Verificar que los contratos formales correspondientes en `contracts/` (`schemas/`, `openapi/`, `state-machines/`, `errors/`, `examples/`) están en estado `LOCKED` y compilar los artefactos hacia `src/generated/` mediante `scripts/compile-contracts.sh`.
3. Verificar que existe un blueprint técnico en `.specify/plans/[feature]-plan.md` en estado `APPROVED`.
4. Seleccionar la siguiente tarea pendiente en `.specify/tasks/[feature]-tasks.md` verificando los IDs de trazabilidad objetivo (`REQ-`, `INV-`, `STATE-`, `ERR-`).
5. Generar el código determinista mínimo necesario en `src/` (`domain/`, `application/`, `infrastructure/`, `presentation/`) y sus pruebas exhaustivas en `tests/` (`unit/`, `property/`, `integration/contracts/`, `e2e/`).
6. Ejecutar la validación del Test Gate, incluyendo `scripts/verify-traceability.sh`, `scripts/verify-oracles.sh`, `.specify/checklists/code-review.md` y `.specify/checklists/oracle-validation.md`.
7. Esperar la validación y el aval del arquitecto humano antes de marcar la tarea como completada y avanzar a la siguiente.
