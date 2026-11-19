# Borrador de enmienda a la Constitución, Principio VI (feature 006)

**Estado**: `APLICADO` el 2026-11-18 en `.specify/memory/constitution.md` v3.6.0 (Enmienda 006, N2-07 y N2-12; firmada por Neo). El texto vigente prevalece sobre el borrador de abajo (versión 3.6.0 en lugar de 3.4.0; tope 5 USD equivalentes = 22500 COP; se añade el alcance de `jose` a `/internal/scene-worker`). Estado anterior: `DRAFT`, no aplicada. Autor: `/architect`, 2026-11-18. Autoriza Neo (Nivel 2); la firma de `D6-12` = A (2026-11-18) fija el contenido, pero la edición de la constitución y su versión (`3.3.0` → `3.4.0`, MINOR) quedan para Neo o para la tarea que él ordene.
**Fuentes**: `D6-12` = A y `D6-01` = A (spec 006), `merovingian-006-dependencia-ia.md` (`H-MERO-006-01`, `H-MERO-006-03`), `plan.md` §5 y §7.

## Texto que se añadiría al final del Principio VI («Stack Autorizado y Estructura de Repositorio Estándar»)

> **Excepción acotada de la feature 006 (generación de imágenes con IA).** El Principio VI admite solo servicios gratuitos. Se autoriza **una única excepción de pago** para el adaptador de `SceneImageGeneratorPort` de la feature 006, que consume la API de Google Vertex AI (Gemini Image) desde `src/infrastructure/` mediante `fetch` nativo de Node 22, **sin dependencia npm nueva**. La excepción: (a) tiene un tope preventivo de **5 USD por mes** en `terraform/budget.tf` (alerta; no detiene el gasto por sí sola, por lo que la cuota por hogar de la feature 006 es el control duro); (b) **no se activa en producción** hasta que los términos de datos de Vertex (sin entrenamiento con datos del cliente, retención mínima, región `us-central1`, límite de imágenes de entrada) consten con fuente en `specs/006-escena-hogar-pixel-art/research.md`; (c) no cubre ningún otro servicio ni proveedor de pago; (d) el desarrollo y las pruebas usan exclusivamente el adaptador simulado (0 USD) y el CI no hace llamadas reales. Cualquier ampliación del tope, otro modelo de pago u otro proveedor requiere una autorización nueva (Nivel 2).

## Cambios acompañantes (no se aplican aquí)

| Artefacto | Cambio descrito | Quién |
|---|---|---|
| `constitution.md` | Texto anterior; versión 3.4.0; `Last Amended`; firma de Neo | Neo |
| `terraform/budget.tf` y `variables.tf` | Presupuesto con tope 5 USD (hoy 1 USD, `var.budget_units`); descripción de la excepción | `/link` + Nivel 2 (`plan.md` §7) |
| `terraform/services.tf` | Habilitar `aiplatform.googleapis.com` y `cloudtasks.googleapis.com` | `/link` + Nivel 2 |
| `terraform/iam.tf` | `roles/aiplatform.user` y `roles/cloudtasks.enqueuer` a la cuenta de servicio de Cloud Run | `/link` + Nivel 2 |
| `spec-system.md` | Sin cambio (LOCKED) | — |

## Alternativa descartada
SDK `@google/genai` o `@google-cloud/vertexai`: dependencia nueva con transitivas y superficie de supply chain; descartada por `D6-01` = A (fetch nativo). Solo por enmienda MINOR posterior con versión exacta y ámbito acotado a `infrastructure/`.
