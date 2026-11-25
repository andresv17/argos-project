# Data Model — Feature 010

Solo `#75`, `#33` y (opcional) `#65/D10-02` tocan datos. Migraciones SQLite y Postgres con la misma numeración lógica, transaccionales e idempotentes (patrón 009).

| Entidad | Cambio | Feature |
| --- | --- | --- |
| cuenta de usuario | `adult_declared_at` (timestamp, nullable: cuentas anteriores), `adult_notice_version` (texto, nullable) | `[GH:#75]` |
| `about_content` (singleton, `id = 1`) | `body_markdown` (texto, tope **20 000 caracteres**, ~80 KB UTF-8, APPROVED 2026-11-24, `EDGE-010-011`; validado en servidor y `maxLength=20000` en el editor), `photo_object_key` (nullable), `photo_alt` (texto), `version` (CAS), `updated_at`, `updated_by` | `[GH:#33]` |
| `platform_parameters` | clave nueva `brand.display_name` sembrada «Tipi» (solo si `D10-02`) | `[GH:#65]` |

Notas: la foto se guarda sin EXIF; `photo_object_key` nunca sale en respuestas públicas. Auditoría de cambios con el mecanismo de 009. Sin datos de menores adicionales.

Decisiones APPROVED (2026-11-24): `H-02` opción A no añade tabla ni migración (el límite de registro sigue en memoria, por instancia y por IP real); `H-03` no cambia datos (solo orden de validación). 
