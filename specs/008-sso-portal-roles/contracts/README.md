# Contratos de la Feature 008 (delta normativo; sin esquemas ejecutables)

**Estado**: `DRAFT`. Línea de contratos: **002** (nueva MINOR), coordinando con 004 (`3.3.0`) y 005. Este README solo registra qué contratos habrá que escribir; **los archivos JSON Schema / OpenAPI / máquinas de estado los redacta `/architect` en `T1110`, `T1135`, `T1144` y `T1156` tras las decisiones de Neo**, y no se compila nada en `src/generated/` hasta entonces.

| Contrato | Origen | Tarea | Depende de |
| --- | --- | --- | --- |
| Rutas y esquemas de acceso con Google, registro, verificación, reenvío, elección de `username`, `auth_identities` | `[GH:#16]` | T1110 | D8-04, D8-05 |
| Vinculación de proveedores (intento pendiente, confirmación, desvincular) | `[GH:#17]` | T1110 (extensión) | D8-04, D8-05 |
| `STATE-ACCT8-001` y `accountStatus` | `[GH:#18]` | T1135 | D8-02 |
| `/api/admin/*` y sesión de administración | `[GH:#19]` | T1144 | D8-03 |
| Parámetros de plataforma (`GET`/`PUT`, `If-Match`) | `[GH:#20]` | T1156 | D8-03, D8-08 |
| Parámetro de descarga de la imagen de escena (condicional) | `[GH:#54]` | T1167 | evidencia de T1166 |

`errors/error-catalog.json` es un **índice incremental vacío** (sin códigos) que solo existe para que la compuerta `verify-traceability.sh` encuentre su fuente; los códigos nuevos se añaden en `T1110`, `T1135`, `T1144` y `T1156`. Todo objeto con `properties` declarará `additionalProperties: false` y límites explícitos.
