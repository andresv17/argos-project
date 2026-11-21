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
| Enmienda de `STATE-AUTH-SESSION-001` (004 y 002) si las cuentas nacen `PENDING` | `[GH:#18]` | T1200 | D8-02 |
| Campo `biography` de mascota (002) y MINOR del sobre de respaldo (004); `ScenePayload` de 006 sin cambio con `D8-12` = A | `[GH:#21]` | T1178 | D8-12 |
| Ruta de búsqueda de colaboradores y, si `D8-10` = B, enmienda de `REQ-HOUSE2-001` | `[GH:#24]` | T1187 | D8-10, D8-11 |
| Textos de ayuda de rol y aviso de hogar (catálogo cerrado; sin contrato ejecutable) | `[GH:#25]` | T1195 | D8-13 |

`errors/error-catalog.json` es un **índice incremental vacío** (sin códigos) que solo existe para que la compuerta `verify-traceability.sh` encuentre su fuente; los códigos nuevos se añaden en `T1110`, `T1135`, `T1144` y `T1156`. Todo objeto con `properties` declarará `additionalProperties: false` y límites explícitos.
