# Contratos de la Feature 011 (DRAFT, aún sin redactar)

Ningún contrato se escribe hasta que Neo resuelva la decisión de la que depende (ver `../spec.md`, «Decisiones pendientes»). Cada contrato nace en una tarea `[ARCH]` de `../tasks.md` con `additionalProperties: false`, límites numéricos explícitos y `x-sdd-metadata`.

| Contrato previsto | Depende de | Tarea `[ARCH]` | Notas |
| --- | --- | --- | --- |
| `openapi/admin.openapi.yaml` (011, MINOR sobre 009) + `schemas/admin-delegate.schema.json` | `D11-01`, `D11-03`, `D11-04` | `T1524` | Rutas `/api/admin/administrators*`; matriz operación→roles |
| `state-machines/admin-delegate.machine.json` (`STATE-ADM11-001`, `ACTIVE ↔ DISABLED`; el sentido DISABLED→ACTIVE solo si `D11-04` = A) | `D11-04` | `T1524` | Cerrada; sin transiciones implícitas |
| `errors/error-catalog.json` (011) | todas | por bloque | Códigos `ERR-ADM11-*`, `ERR-HOG11-*`, `ERR-PRF11-*` |
| Enmienda de enlaces de veterinario (005, MINOR) | `D11-06` = B | `T1507` | Lista de `petIds`; migración Nivel 2 |
| Enmienda de la vista pública con foto | `D11-09` ≠ C | `T1534` | Excepción al invariante de privacidad de 005 |
| Lectura del álbum del hogar | `D11-11` | `T1542` | Sin tablas nuevas; sin claves de objeto en la respuesta |
| Avatar de usuario | `D11-13` | `T1553` | Migración Nivel 2 |
| Tope de hogares | `D11-12` ≠ A | `T1548` | Constante o parámetro (INV-ARCH-006) |
