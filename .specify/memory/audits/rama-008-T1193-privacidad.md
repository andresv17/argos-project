# Acta Rama — T1193 (Feature 008, `[GH:#24]`): privacidad del autocompletado de colaboradores

Fecha: 2026-11-21 · HEAD 6965d52 · Rama 008-sso-portal-roles · Solo lectura (sin cambios en src/specs/tests/terraform, sin commit, sin push, sin `[x]`, sin tocar logos.json ni el bus central).
Trazabilidad: REQ-INV8-003, INV-INV8-001, NFR-008-004, EDGE-008-044; SC-008-050..052. Acta de Trinity: `.specify/memory/audits/trinity-008-T1193-enumeracion.md`.

## Dictamen

**FAIL en un punto (ALTO, plataforma), PASS en la aplicación, una validación pendiente de Neo.**

- La aplicación no registra ni audita la consulta `q` ni los `username` devueltos. Los registros, errores y respuestas están minimizados.
- La plataforma (Cloud Run) escribe la URL completa con `?q=` en su registro de solicitudes. Ese registro está fuera del control de la app y hoy no está excluido en Terraform. Esto contradice EDGE-008-044 («la consulta no se registra») y NFR-008-004.
- Riesgo jurídico sin base documentada: ver punto 6.

## Pruebas reproducidas (sin instalar nada)

| Comando | Resultado |
|---|---|
| `npx vitest run tests/unit/t1188-invitee-search-008.spec.ts tests/integration/api/t1188-autocompletado-colaboradores-008.api.spec.ts` | 2 archivos, **15/15 PASS** |
| `npx vitest run tests/integration/ops/logging.spec.ts tests/unit/cloud-logging.spec.ts` (complementaria) | 2 archivos, **19/19 PASS** |

## 1. Consulta y usernames fuera de logs, errores y trazas — PASS con observación (BAJO)

Evidencia en código:
- Serializador de petición: `src/infrastructure/http/cloud-logging.ts:119-121` devuelve solo `method` y la ruta con plantilla (`request.routeOptions.url`). La consulta de cadena no se copia.
- Error de base de datos: `cloud-logging.ts:131-138` (`serializeError`) conserva solo `sqlstate` (`^[0-9A-Z]{5}$`) y `constraint`. No copia `message`, `detail`, `where`, `parameters` ni `hint`. Se registra como serializador `err` en `cloud-logging.ts:146`.
- Redacción transversal: `cloud-logging.ts:164-166` (`logMethod` pasa cada argumento por `scrubValue`).
- Error no previsto: `src/infrastructure/http/plugins/problem-details.ts:50` produce `ERR-INTERNAL-UNEXPECTED` sin texto. Línea 61 registra `error no previsto` con `err`, que pasa por el serializador anterior.
- Respuesta 422: `src/application/use-cases/use-case-support.ts:165-172` (`assertMatchesSchema`) arma el detalle con el nombre del esquema, el campo y el `error.message` de Ajv, que no contiene el valor. `problem-details.ts:29` (`requestPath`) quita la query del campo `instance`.
- Respuesta de éxito: no hay `request.log` ni `console` en `SearchInviteesUseCase` (`household-use-cases.ts:223-234`).

Pruebas: `t1188 api:83-95` captura el stream del logger de producción con `PRODUCTION_LOGGER_OPTIONS` y confirma que no aparecen `pedro` ni `invitees?q`. `cloud-logging.spec.ts:117-143` cubre SQLSTATE y restricción. `ops/logging.spec.ts:132-148` cubre un error de pg no previsto, pero en una ruta de prueba `/boom`.

Observación BAJO (O-1): no hay prueba que fuerce un error de base de datos en `GET /invitees`, ni que compruebe que un 422 no escribe el valor en los logs. La cobertura es genérica y no específica de la ruta.

## 2. Sin escritura, sin `recordAudit`, sin conservar datos fuera de la respuesta — PASS

- `SearchInviteesUseCase.execute` (`household-use-cases.ts:223-234`) solo llama a `listMemberships`, `listByHousehold`, `publicProfilesById` (lecturas) y `users.searchUsernamesByPrefix`. No hay `recordAudit` (la búsqueda aparece sin llamadas a `recordAudit` en el grep de `household-use-cases.ts`; las líneas 169-440 corresponden a otros casos de uso).
- Consultas de solo lectura: `postgres-repositories.ts:133-136` (`SELECT username ... LEFT(LOWER(username), $1) = $2 ... LIMIT $3`) y `sqlite-repositories.ts:273-274`.
- Estado en memoria: `InviteeSearchRateLimiter` (`src/infrastructure/http/invitee-search-rate-limit.ts:15-35`) guarda `U:<userId>` e `I:<IP normalizada>` con marcas de tiempo durante la ventana. **No guarda el término de búsqueda ni los resultados.** Es un dato personal (IP y userId) pero acotado en tiempo y con barrido (`sweep`, tope 10 000 claves).

Pruebas: `t1188 api:85-87` compara el volcado del repositorio antes y después de la búsqueda (`api.dump()`), y no cambia.

Observación OBS-2: el limitador conserva IP y userId en memoria durante la ventana (1 minuto, `src/infrastructure/config/invitee-search-config.ts:12`, 30 consultas por ventana). Es aceptable y debe documentarse en la política de retención.

## 3. Minimización: solo `username` — PASS

- Contrato `specs/004-catalogos-registros-archivos/contracts/schemas/identity.schema.json`:
  - `InviteeSuggestion` (líneas 687-698): `additionalProperties: false`, `required: [username]`, descripción «nunca correo, nombre visible ni identificador interno».
  - `InviteeSearchResult` (líneas 700-715): `additionalProperties: false`, `items` de máximo 5.
  - `InviteeSearchPrefix` (líneas 680-686): mínimo 3, máximo 30, patrón `^[A-Za-z0-9._-]+$`.
- Contrato OpenAPI `specs/004-catalogos-registros-archivos/contracts/openapi/pet-tracker-api.openapi.yaml:1171-1205`: `searchInvitees`, 200 con `InviteeSearchResult`, `Cache-Control: no-store`, y 401/403/404/422/429/500.
- Código: `household-use-cases.ts:231-233` mapea cada coincidencia a `{ username }`. La aserción de tipo `as InviteeSearchResult['items']` no añade campos: en tiempo de ejecución el objeto tiene solo `username`.
- Prueba: `t1188 api:47-48` fija `some.json` igual a `{ items: [{ username: 'pedro.a' }] }`, y `none.json` igual a `{ items: [] }`.

Nota: `username` es un identificador pseudónimo que el contrato permite. No se devuelve correo, `sub`, nombre visible ni id interno.

## 4. Retención y caché — PASS con observación (BAJO)

- `src/infrastructure/http/routes/households.routes.ts:56`: `reply.header('cache-control', 'no-store').send(result)`. Solo se aplica a la respuesta 200.
- Prueba: `t1188 api:43-48` comprueba `cache-control: no-store` en 200 con y sin coincidencias.
- Caché intermedia: no encontré CDN ni caché de balanceador en `terraform/*.tf` (búsqueda por `cdn|cache`, sin coincidencias). El `static-assets.ts` solo cachea estáticos. La caché de `createCachedPlatformParameterPort` (`server.ts:148`) no afecta a búsquedas.
- Caché del cliente: `src/presentation/web/components/InviteeCombobox.tsx` no contiene `localStorage`, `sessionStorage` ni `console` (grep). El estado es en memoria de React.
- Observación BAJO (O-3): las respuestas 422, 429, 403 y 404 no llevan `no-store`. Son `application/problem+json` sin validadores y no se cachean por defecto. Trinity lo calificó de riesgo despreciable. Recomiendo `no-store` global en `/api/*` como defensa en profundidad (OBS-2 de Trinity).

## 5. Riesgo de plataforma: URL con `?q=` en el registro de Cloud Run — FAIL (ALTO)

Hechos verificados:
- `cloud-logging.ts:7-8` declara expresamente que el registro de solicitudes de Cloud Run (`run.googleapis.com/requests`: IP, URL, user-agent) lo escribe la plataforma fuera del control de la app, y que la app no lo duplica ni lo suprime.
- `terraform/logging.tf:2-10` documenta el precedente T793: el registro de Cloud Run (`httpRequest.requestUrl`) guardaría en claro el token de `/shared/`. La mitigación es una exclusión de `_Default` con filtro `httpRequest.requestUrl:"/shared/"`. **Solo esa ruta está excluida.** No hay exclusión para `/invitees`.
- Por lo tanto, cada búsqueda de prefijo (mínimo 3 caracteres) queda en el sumidero `_Default` con su consulta, la IP del cliente y la marca de tiempo. La retención por defecto de `_Default` es de 30 días salvo configuración distinta.
- Contradicción: EDGE-008-044 y el REQ-INV8-003 dicen «la consulta no se registra», y NFR-008-004 dice «ni en la URL registrada de las peticiones». Ambas afirmaciones solo son ciertas para los registros de la app, no para el de plataforma.

Impacto en privacidad: cada consulta es un dato personal (fragmento de username asociado a un hogar y a una IP) y su acceso lo tiene cualquier principal con permiso de lectura de logs del proyecto. Los accesos de gestores de hogar no están en ese registro, pero el prefijo sí.

Mitigaciones propuestas para `/link` (no implementadas):
- **(a) Recomendada: excluir la ruta del sumidero `_Default`**, con el mismo patrón que T793 en `terraform/logging.tf`. Filtro sugerido: `resource.type="cloud_run_revision" AND httpRequest.requestUrl:"/invitees?q="`. Pros: sin cambio de código ni de contrato; precedente. Coste: se pierden en `_Default` las solicitudes de esa ruta, incluidos sus 4xx y 429. Mitigación del coste: contadores de la app o métricas de Cloud Monitoring. Requiere aplicación por Neo (Nivel 2, `terraform plan`), igual que T793. Verificación: tras aplicar, una búsqueda de prueba no debe aparecer en `_Default` con el término.
- **(b) Enmascarar: no viable desde la app.** El registro lo escribe la plataforma. Cloud Logging no redacta campos en `_Default`; hay que excluir.
- **(c) Documentar y aceptar:** solo con decisión explícita de Neo y registro de la retención. No recomendable porque contradice EDGE-008-044 y NFR-008-004 literalmente.
- **(d) Cambio de contrato:** pasar el prefijo a un cuerpo `POST` o a una cabecera. Requiere `/architect` y enmienda de contrato y de la CSRF. Largo plazo, no es la vía para T1193.

## 6. RGPD / LGPD sobre el término de búsqueda — PARCIAL (validación requerida de Neo, MEDIO)

Análisis (no es asesoría legal):
- Un prefijo de username puede identificar a una persona, sobre todo si combina nombre y apellido. Se trata como dato personal.
- Marco aplicable: el proyecto opera en `America/Bogota` y `es-CO` (`claude/entorno-y-lecciones.md`). El marco colombiano de habeas data es la Ley 1581 de 2012. El RGPD solo aplica si hay titulares en la UE. «LGPD» es el régimen brasileño y no aplica a priori. Neo debe confirmar el marco.
- Búsqueda en `constitution.md`, `spec.md` y specs de 002/004/008: **no hay referencias a RGPD, LGPD ni Ley 1581.** La constitución solo tiene el principio V «Seguridad y Privacidad por Defecto» (líneas 217-226), sin plazos de retención ni base jurídica.

Controles existentes:
- Prefijo mínimo de 3 caracteres, máximo 5 resultados, solo `username`.
- Sin escritura de la consulta en la app, ni en auditoría, ni en caché de cliente ni de servidor.
- `no-store`, límite de tasa por usuario e IP, y 404/403 para no revelar existencia de hogares.

Controles que faltan:
- Base jurídica y finalidad documentadas para el tratamiento del término de búsqueda.
- Plazo de retención para el registro de plataforma (ver punto 5) y referencia a la política de retención de logs.
- Registro de actividades de tratamiento que incluya la consulta de prefijo.
- Procedimiento de atención a titulares para logs de plataforma.

Propuesta: Neo decide el marco aplicable y el plazo de retención, y se incorpora una línea a la constitución. Hasta entonces, la mitigación (a) del punto 5 es la vía técnica.

## Hallazgos

| ID | Sev | Punto | Descripción | Destino |
|---|---|---|---|---|
| H-RAMA-008-J-01 | **ALTO** | 5 | `?q=` del autocompletado llega al registro de solicitudes de Cloud Run sin exclusión; contradice EDGE-008-044 y NFR-008-004. | `/link`: exclusión (a); Neo aplica con `terraform plan` (Nivel 2). |
| H-RAMA-008-J-02 | MEDIO | 5 | NFR-008-004 afirma que `code`/`state` del callback de Google se redacta en el registro de peticiones. La redacción es real solo en la app (`cloud-logging.ts:119-121`, que no copia la query). El registro de plataforma no está excluido para el callback (`terraform/logging.tf` solo cubre `/shared/`). | `/link` y `/architect`: revisar exclusión del callback o corregir el texto de NFR-008-004. |
| H-RAMA-008-J-03 | MEDIO | 6 | Sin base jurídica, plazo de retención ni referencia a RGPD/LGPD/Ley 1581 para el término de búsqueda. | Neo: marco aplicable y retención. |
| O-1 | BAJO | 1 | Sin prueba de error de BD ni de 422 en la ruta `/invitees` (la cobertura es genérica en `ops/logging.spec.ts:132`). | `/keymaker`: prueba de regresión en el archivo de logs del caso de uso. |
| O-2 | BAJO | 4 | Respuestas de error sin `no-store`. | `/keymaker` (defensa en profundidad, `no-store` global en `/api/*`). |
| O-3 | OBS | 2 | El limitador guarda IP y userId en memoria durante la ventana. | Documentar en la política de retención. |

## Verificación del cierre de T1193

Sin cambios en el código. El dictamen de privacidad de la app es PASS. **T1193 no debe marcarse como cumplido** hasta que se aplique la mitigación del punto 5 o Neo acepte el riesgo por escrito. La marca `[x]` y la decisión de cierre son de Neo (Nivel 2).

## Recomendación

1. `/link`: proponer la exclusión del punto 5 (a) en `terraform/logging.tf`, con filtro `httpRequest.requestUrl:"/invitees?q="`, y revisar el callback de Google (H-RAMA-008-J-02). Aplicación por Neo tras `terraform plan`.
2. Neo: decidir marco aplicable y plazo de retención (H-RAMA-008-J-03).
3. `/keymaker`: añadir la prueba de O-1 y `no-store` global (O-2) en una tarea posterior, sin bloquear T1193.

## Addendum — Retención transitoria del flujo Google (T1134, opción B aprobada por Neo)

Fecha: 2026-11-22 · Referencia: NFR-008-004, H-RAMA-008-T1134-01 · Commit de la parte (a): 95b5a08 · Solo documentación; sin cambios en código, migraciones, contratos ni tareas.

- **Datos transitorios del flujo de Google:** la tabla `oauth_flow_states` guarda `state`, `pending_subject` (sub de Google) y `pending_email` (correo de Google) mientras el flujo está en curso. Son datos personales.
- **Duración:** el flujo vence a los 900 s (15 min, ADR-008-03 del plan). La cookie `argos_oauth` tiene la misma caducidad.
- **Purga:** el mantenimiento automático de SQLite y PostgreSQL elimina las filas vencidas (commit 95b5a08). Además, al iniciar un flujo nuevo se purgan los vencidos.
- **Límite conocido:** al consumir un flujo, anular `pending_email` y `pending_subject` queda fuera. El CHECK de las migraciones 0017 (SQLite) y 0013 (PostgreSQL) exige que ambos campos estén presentes en la fase `USERNAME`. Neo aprobó (opción B) conservar ese CHECK y aceptar la retención transitoria acotada: la fila dura como máximo hasta su `expires_at` (900 s desde la creación) y se elimina en la siguiente purga de mantenimiento posterior a ese vencimiento.
- **Riesgo residual aceptado:** una fila consumida puede conservar `pending_email` y `pending_subject` hasta su vencimiento (900 s) y la purga de mantenimiento posterior. No se revisa esta decisión sin cambio de esquema aprobado por Neo.
