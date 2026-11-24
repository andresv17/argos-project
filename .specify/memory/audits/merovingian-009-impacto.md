# Acta /merovingian — Grafo de impacto y dependencias externas de la Feature 009

- **Tarea**: T1205 (parte `/merovingian`), dispatch de Morpheus.
- **Fecha**: 2026-11-23. **Rama**: `009-aprobacion-admin-correo` (base `917bbf8`).
- **Modo**: solo lectura sobre `specs/`, `.specify/`, `package.json`, `src/` (lectura de constantes y migraciones). Sin checkout, stash, reset, commit ni push. Sin marcar casillas. `spec.md`, `plan.md` y `tasks.md` no se tocaron.
- **Estado de la spec 009**: `DRAFT`. Constitución vigente **3.8.0** (sin enmiendas 009 firmadas todavía).
- **Límite de la verificación**: no se consultaron precios de Vertex AI ni disponibilidad de modelos en línea. Todo dato de coste se marca `[verificar]`, como en la propia 006.

## 1. Veredicto

**PASS CON CAMBIOS**

- Dependencias externas: **PASS**. La 009 no añade ninguna dependencia npm. `package.json` no tiene diferencias contra `HEAD`. No hay librería de correo. `jose` 6.2.17 ya está autorizada (Enmienda 008) y su reutilización para administración requiere la Enmienda 009-A, que el plan ya prevé.
- Contratos: **CAMBIOS REQUERIDOS**. La 009 cambia el comportamiento de `registerUser` y de `login` en 002 y 004 (sin sesión para `PENDING`), pero el plan declara que no edita esos contratos. La tarea `T1241` dice «sin editar 002 ni 004». Esa contradicción es el hallazgo principal (MER-01).
- Tope de 5 USD: **CAMBIOS REQUERIDOS**. La regla `EDGE-009-036` no protege el gasto acumulado cuando cambia el modelo dentro del mes (MER-02). Además, los precios no están fuentes (MER-03).
- Enmienda de `REQ-PRO9-007` sobre 007: **CAMBIOS REQUERIDOS**. 007 es `APPROVED` y su R4 es normativo byte a byte. No debe cambiarse sin enmienda versionada firmada (MER-07).

Condición para pasar a `PASS` sin reservas: corregir MER-01, MER-02, MER-03 y MER-07 en `spec.md` y `plan.md` (o en sus tareas `[ARCH]`) antes de que `/keymaker` toque las fases 2, 4 y 5 y la `T1212`.

## 2. Dependencias externas

| Dependencia | Estado en `package.json` | Origen y justificación | Veredicto |
| --- | --- | --- | --- |
| Librerías de correo (`nodemailer`, SMTP, SDK de correo) | No existen | `D9-01` = A: correo al administrador diferido sin fase; `REQ-APR9-006` diferido | **Ninguna añadida. PASS** |
| `jose` 6.2.17 | Existente, versión exacta | Autorizada en Enmienda 3.6.0 (`oidc-verify.ts`), 3.8.0 (`google-oidc-verify.ts`, D8-05) | Existente. Reutilizada en el flujo de administración con **Enmienda 009-A** (`T1224`/`T1225`). **PASS con la enmienda** |
| `@fastify/cookie` 11.1.5 | Existente | Ya autorizada. Cookies `argos_admin_session` y `argos_admin_oauth` se manejan con ella o con cabeceras de Fastify | Existente. **PASS** |
| Rate limit por IP (`trustProxy` de 1 salto) | Sin dependencia. Fastify ya es base | Si se usa un plugin de rate limit, sería dependencia nueva. El plan no lo declara y la spec pide almacenamiento propio (`EDGE-009-035`). Confirmar que no se importa `@fastify/rate-limit` | Sin dependencia. **PASS** (vigilar en `/keymaker`) |
| CSP estricta propia | Sin dependencia prevista (cabecera manual) | Si se usa `@fastify/helmet`, sería dependencia nueva fuera de autorizadas | Sin dependencia prevista. **PASS** (vigilar) |
| Hash SHA-256, PKCE `S256`, `state`, `nonce` | `node:crypto` | Principio II: solo en `infrastructure/` | **PASS** |
| Cookies de `/admin` con `Path=/api/admin` | Configuración | Cambio de atributos de cookie: exige Enmienda 009-A (Stack, Autenticación) | Requiere enmienda, ya prevista |
| Lista cerrada de 3 modelos Vertex (`gemini-2.5-flash-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`) | Configuración, sin paquete | Principio VI, excepción 006 (d) prohíbe «otro modelo»: requiere Enmienda 009-B | Requiere enmienda, ya prevista |
| Región `global` (`aiplatform.googleapis.com`) | Configuración (host en código) | Principio VI no la menciona. Pero la excepción 006 fija el alcance del adaptador y su REQ-ESC6-017/031 cierra la lista de regiones | Requiere enmienda de **006** (ver MER-08) |
| Tabla de coste unitario por modelo | Configuración en `app-config.ts` (`EDGE-009-036`) | Dato de facturación, no dependencia | Ver MER-02/03/04 |

**Conclusión de dependencias.** La 009 cumple la regla de «cero dependencias nuevas». Las únicas autorizaciones de Nivel 2 que necesita son las dos enmiendas constitucionales ya previstas (009-A y 009-B), más la ampliación de la excepción 006 para `global` (ver MER-08).

## 3. Impacto en contratos vigentes

| Contrato | Versión actual (verificada en disco) | Cambio que pide la 009 | Versión propuesta | Consumidores | Declarado en plan/tareas |
| --- | --- | --- | --- | --- | --- |
| 002 `pet-tracker-api.openapi.yaml` | 3.3.0 | `registerUser` y `login` sin sesión para `PENDING`/`REJECTED`; error nuevo; `accountStatus` | MINOR siguiente (la asigna `/architect`) | Web de registro e inicio; E2E; ≈18 pruebas con `auth/register` (`ADR-009-10`) | **No**. Plan: «no se editan». `T1241`: «sin editar 002 ni 004». **Contradicción** (MER-01) |
| 002 `identity.schema.json` | 3.1.0 | `accountStatus` en `UserSelfProfile`; cuerpo de `PENDING` | MINOR siguiente | Perfil de usuario, UI de estado «en revisión» | **No** (MER-01) |
| 002 `error-catalog.json` | 3.2.0 (008 README) | Códigos nuevos: cuenta pendiente, cuenta rechazada, borrado con hogares activos (`EDGE-009-049`), reautenticación caducada | MINOR siguiente | Todos los clientes que muestran error | **No**. Ningún código nuevo en la spec salvo `ERR-SCHEMA-VALIDATION-FAILED` (MER-10) |
| 004 `pet-tracker-api.openapi.yaml` | 3.4.0 | Espejo de 002 (008 lo actualizó en ambas líneas) | MINOR siguiente | Igual que 002 | **No** (MER-01, paridad) |
| 004 `identity.schema.json` | 3.2.0 | Espejo de 002 | MINOR siguiente | Igual que 002 | **No** (MER-01) |
| 004 `error-catalog.json` | Sin verificar en este pase | Igual que 002 | MINOR siguiente | Igual que 002 | **No** |
| `STATE-AUTH-SESSION-001` (002 y 004) | Sin cambio desde 008 | Guardas: `PENDING` sin sesión; enmienda como máquina de 009 (`T1241`) | Enmienda MINOR en la línea de 002 y 004, o máquina nueva documentada | Guardas de sesión | **Parcial**: `T1241` la mueve a 009; `REQ-APR9` la menciona. Decidir en qué línea vive (MER-01) |
| `STATE-ACCT9-001` (nuevo, `contracts/state-machines/`) | No existe | Máquina `PENDING`→`ACTIVE`/`REJECTED` | 1.0.0 nueva | Admin y registro | Sí (`T1241`) |
| 006 `home-scene.openapi.yaml` | 3.5.0 (cabecera del propio archivo también dice «se mantiene en 3.4.0» en su nota, incoherente, ver MER-09) | Indicador `sceneEnabled`/`enabled` en la vista y error de generación con escena deshabilitada | MINOR siguiente (3.6.0 sugerido) | Pantalla de escena, E2E de 006 y 007 | **Sí** (`T1257`), pero solo este archivo |
| 006 `scene.schema.json` (`SceneView`) | 1.1.1 | El indicador vive en `SceneView`, definido aquí, no en el openapi | PATCH/MINOR siguiente (1.2.0 sugerido) | Igual | **No** (MER-08) |
| 006 `error-catalog.json` | Sin verificar | Código de escena deshabilitada | MINOR siguiente | UI de escena | **No** (MER-10) |
| 006 `ScenePayload` (`scene-payload.schema.json`) | Sin cambio | `D9-03` = A: el prompt no es contrato HTTP | Sin cambio | Worker | Correcto |
| 005 `platform-parameter.schema.json` | 1.0.0 | Su descripción dice «Sin endpoint ni interfaz de edición» y «Sin FK: el perfil de administrador aún no existe». La 009 lo vuelve falso | Nota o PATCH de descripción | Documentación | **No**. `T1297` declara «sin cambio de contrato de 005» (MER-09) |
| 008 `AuthMethods` (en identity 002/004) | Vigente (008) | `REQ-DEL9-001` lo usa (`hasPassword = false`); no cambia su forma | Sin cambio | Perfil, borrado de cuenta | Correcto: sin cambio. Consumidor nuevo: el aviso de `T1220` |
| 008 cookie `argos_oauth` | Vigente (3.8.0, `Path=/api/auth/google`) | Nueva intención `DELETE` en `oauth_flow_states` (`T1219`) cambia el `CHECK` de la tabla de 008 | Migración N2 | Flujo de Google de usuario | Sí (`T1219`), pero `ADR-009-06` afirma «cero cambios al flujo de usuarios» (MER-06) |
| Contratos nuevos de 009 (`/api/admin/*`, `/api/admin/parameters`, `/api/admin/registrations`, reautenticación de borrado) | No existen | Nuevos | 1.0.0 | Bundle `/admin`, `/api/admin` | Sí (`T1217`, `T1226`, `T1241`, `T1256`) |

**Respuesta directa: ¿son las enmiendas MINOR de cookies y de lista de 3 modelos las únicas necesarias?**
No. Son las únicas **constitucionales**. Además hacen falta: (a) MINOR en 002 y 004 por el estado `PENDING` (MER-01); (b) MINOR en 006 `SceneView` y error catalog (MER-08); (c) enmienda de `REQ-ESC6-017/031` para la región `global` (MER-08); (d) la enmienda de 007 (MER-07); (e) una nota en 005 (MER-09). Y la migración del `CHECK` de `oauth_flow_states` (`T1219`), que no está en el plan.

## 4. Causa-efecto del tope de 5 USD/mes

### 4.1 Datos de partida (verificados en disco)

- Tope: 5 USD equivalentes (22500 COP) por mes (Principio VI, Enmienda 006, cond. b; 006-bis).
- Cuota global: `scene.global_quota_max` cuenta **imágenes**, no dólares (`EDGE-009-036`). Valor por defecto en código: `SCENE_DEFAULT_GLOBAL_QUOTA_MAX = 5` (`src/domain/scene/provider-parameters.ts`). Tope de validación en código: `SCENE_GLOBAL_QUOTA_MAX_CEILING = 1000`.
- Modelo por defecto: `gemini-2.5-flash-image` (`SCENE_DEFAULT_MODEL`). Regex `^gemini-…` admite los tres modelos nombrados.
- Costes de referencia en 006 `research.md` §2.4 (línea 52): ~0,04 USD por imagen en el modelo rápido y 0,13–0,24 USD en el Pro, **todos marcados `[verificar]`**. La propia 006 dice que las cifras no tienen fuente.
- `SCENE_REAL_DRIVER_ACTIVATED = true` (`app-config.ts:143`, desde T885). La excepción 006 (cond. a) exige REQ-ESC6-028 (datos del proveedor con fuente) antes de activar el adaptador real. `research.md` línea 64 deja fuera de firma la retención, la región de proceso y los precios.

### 4.2 Cálculos de referencia (con los `[verificar]` de 006)

| Modelo | Coste unitario (`[verificar]`) | Máximo de imágenes que caben en 5 USD |
| --- | --- | --- |
| `gemini-2.5-flash-image` | ≈ 0,04 USD | ≈ 125 |
| `gemini-3-pro-image` | ≈ 0,13–0,24 USD | ≈ 20–38 |
| `gemini-3.1-flash-image` | Sin dato en el repositorio | No calculable: `EDGE-009-036` dice que no es seleccionable hasta tener coste |

- Con el valor por defecto `scene.global_quota_max = 5` el gasto máximo del mes es ≈ 1,2 USD con Pro. Hay margen.
- Con el tope de código `1000` y el modelo rápido el gasto máximo sería ≈ 40 USD. **El techo de código permite valores que violan el tope** (MER-05).

### 4.3 Hueco de acumulado con varios modelos (MER-02)

`EDGE-009-036` valida solo `scene.global_quota_max × coste(modelo nuevo) ≤ 5` en el momento de guardar. El gasto real del mes es la suma sobre todas las imágenes del mes, cada una con el coste del modelo que la generó.

Contraejemplo con los valores de referencia:
1. `scene.global_quota_max = 20`, modelo Pro. Se validan 20 × 0,24 = 4,80 ≤ 5. Se generan 20 imágenes. Gasto del mes: 4,80 USD.
2. El administrador cambia a `gemini-2.5-flash-image` y sube `global_quota_max` a 125. La regla evalúa 125 × 0,04 = 5,00 ≤ 5 y **acepta**.
3. Quedan 105 imágenes por generar (contador en 20 de 125). Gasto posible: 4,80 + 105 × 0,04 = **9,00 USD**. Supera el tope en casi el doble.

Causa: `scene.global_quota_used` no separa modelos y la regla no usa el gasto ya acumulado. Sin registro del modelo por intento, el gasto del mes no se puede reconstruir (`EDGE-009-045`, `LCK-11`, pendiente `D9-22`).

Efecto en la decisión `D9-21`: aprobar `EDGE-009-036` tal como está **no garantiza** el tope de 5 USD. Hace falta una de estas tres salidas:
- (a) Registrar modelo y ubicación por intento (migración N2 en `scene_attempts`, `D9-22`), y validar contra el gasto real del mes: `gastoReal + (M − usadas) × coste(nuevo) ≤ 5`.
- (b) Conservar en `platform_parameters` el coste máximo de los modelos usados en el mes y validar con ese máximo: `usadas × costeMáximoUsado + (M − usadas) × costeNuevo ≤ 5`.
- (c) Prohibir cambiar de modelo dentro del mes si ya hay imágenes generadas, o bloquear subir `global_quota_max` tras un cambio de modelo.

Recomendación: (a). Es la única que deja la garantía verificable (el registro de auditoría de `REQ-ADM9-004` no sirve porque registra acciones de administración, no llamadas al proveedor).

### 4.4 Lista de modelos en la constitución

- La Enmienda 009-B (`T1254`) con tres modelos es necesaria por la excepción 006 (d): «no cubre ningún otro … modelo». Correcto.
- **Falta** en la enmienda: el coste de cada modelo debe estar firmado (con fuente) antes de firmar la enmienda, porque la excepción está condicionada al tope de 5 USD. Hoy los costes son `[verificar]`.
- **Falta** la región: la lista de 009-B no menciona `global`. Ver MER-08.
- Los nombres `gemini-3.1-flash-image` y `gemini-3-pro-image` no se pudieron comprobar en línea en este pase. Confirmar disponibilidad en Vertex AI antes de firmar (`[verificar]`).

## 5. Efecto de REQ-PRO9-007 sobre la spec 007 (`APPROVED`, D9-26)

- 007 `REQ-ESC7-003` y su regla R4 son normativos «byte a byte» (`spec.md` línea 142), según `claude/decisiones-neo-007-2026-11-21.md`.
- La 009 cambia: el orden de bloques (ya en 007 R4 como `Place all…` antes del JSON), el bloque de preservación (ausente en 007), el texto de `N = 0` (`PET_COUNT_RULE` → «Draw no animals…»). Todo eso altera el resultado byte a byte de 007.
- Pruebas que caerían: `SC-007-043` (literal de tres escenarios), `SC-007-035`, `t1071-prompt-combinado-16bit-007.spec.ts`, `t1071-hogar-sin-consentimiento-escena-007.spec.ts`, `t841-prompt-payload-escena-006.spec.ts`, `t939-prompt-inspiracion-conteo-escena-006.spec.ts`.
- Relajar o borrar esas pruebas para que pasen está **prohibido** (Nivel 3, Principio IV). Actualizar su expectativa sin enmienda firmada de 007 también es un cambio no declarado de un artefacto aprobado.
- La `T1212` (enmienda textual) sin firma de `D9-26` deja 007 como documento falso o contradice `APPROVED`. La opción «excepción documentada» de `D9-26` no basta: deja pruebas de 007 en rojo permanente y el gate `verify-traceability.sh --feature 007` no pasaría.
- Efecto sobre el orden de fases: `T1212` pertenece a la Fase 1, que es la primera del orden obligatorio. Eso bloquea el arranque limpio de #57.
- Recomendación: enmienda versionada de 007 (nota de versión con referencia a la 009 y firma de Neo), y actualización de las pruebas citadas dentro de la misma tarea, con su motivo en el acta. Como alternativa, Neo decide si el orden actual de 007 se mantiene y #57 se aplica solo a partir de una versión nueva de 007.

## 6. Hallazgos

| ID | Severidad | Hallazgo | Evidencia | Acción recomendada |
| --- | --- | --- | --- | --- |
| **MER-01** | **ALTO** | Cambio no declarado de contratos 002 y 004. `registerUser` dice «Registra … e inicia sesión» (002 y 004 openapi) y el registro con `PENDING` no inicia sesión. `login` y `STATE-AUTH-SESSION-001` cambian también. El plan dice «los contratos existentes no se editan» y `T1241` dice «sin editar 002 ni 004». Además 002 y 004 son espejos (`identity` 3.1.0/3.2.0, `openapi` 3.3.0/3.4.0), y 008 los enmendó en ambos | `specs/004…/openapi:44`, `specs/002…/identity:11`, `specs/008…/contracts/README.md` | Declarar en plan (Constitution Check) y `T1241` la enmienda MINOR de 002 y 004 en paralelo, o justificar por escrito que la línea 009 sustituye la 002/004 y retirar la frase «sin editar». Bump de ambas versiones |
| **MER-02** | **ALTO** | El tope de 5 USD no se garantiza con varios modelos: la regla de `EDGE-009-036` evalúa solo el modelo nuevo y no el gasto acumulado del mes. Contraejemplo en §4.3 (≈ 9,00 USD frente a 5) | `spec.md:110`, `plan.md ADR-009-16(4)` | Reescribir `EDGE-009-036` con la fórmula de (a) o (b) de §4.3 y registrar modelo por intento (`D9-22` = migración). No firmar `D9-21` sin esta corrección |
| **MER-03** | **ALTO** | Costes unitarios sin fuente. La 006 los marca `[verificar]`, REQ-ESC6-028 sigue abierto y la excepción 006 (cond. a) exige ese cierre. La 009 pide firmar costes en `app-config.ts` y activar tres modelos y `global` sobre el mismo adaptador | `006 research.md:52,64`; `constitution.md` Principio VI cond. a; `app-config.ts:143` (activación `true`) | Antes de firmar 009-B: fuente oficial de precio por modelo y región (`/link` o `/rama` con red), y dictamen de REQ-ESC6-028. Sin eso, no activar los modelos nuevos. Anotar que la activación `true` del driver real es previa a esta spec |
| **MER-04** | MEDIO | La tabla de coste está indexada solo por modelo. `global` puede tener precio distinto de la regional | `EDGE-009-036`, `ADR-009-16(4)` | Indexar el coste por par modelo × región, o declarar que la región `global` no se habilita sin tarifa propia |
| **MER-05** | MEDIO | El tope de validación en código (`SCENE_GLOBAL_QUOTA_MAX_CEILING = 1000`) permite valores que, con el modelo rápido, superan 5 USD (1000 × 0,04 ≈ 40 USD). La spec no lo reconcilia | `src/domain/scene/provider-parameters.ts` | Derivar el techo de `scene.global_quota_max` del coste del modelo (`floor(5 / coste)`), en `/admin` y en la lectura de BD |
| **MER-06** | MEDIO | `DELETE` como intención de reautenticación cambia el `CHECK` de `oauth_flow_states` (SQLite 0017: `intent IN ('LOGIN','LINK')`; Postgres 0013). Es una migración de la tabla del flujo de usuarios de 008, y `ADR-009-06` afirma «cero cambios al flujo de usuarios ya desplegado». `T1219` sí la contempla como [N2] | `0017_google_sso.sql:29`; `tasks.md:76`; `plan.md ADR-009-04/06` | Alinear el plan: declarar la migración de 008 en el Constitution Check. SQLite exige reconstruir la tabla. Pasar la paridad y la reconstrucción a `/link` antes de `T1219` |
| **MER-07** | **ALTO** | `REQ-PRO9-007` modifica 007 `APPROVED` (R4 normativo byte a byte, `REQ-ESC7-003`, `SC-007-035/043`, cuatro pruebas de 006/007). La firma `D9-26` está pendiente y la `T1212` está en la Fase 1 | `007 spec.md:142`; `009 spec.md:173-174`; `tasks.md:57` | No aplicar `T1212` sin enmienda firmada de 007 con versión y sin actualizar pruebas con motivo (ver §5). Hasta entonces, la Fase 1 no puede cerrar `#57` |
| **MER-08** | MEDIO | Alcance de 006 subestimado. (a) El indicador de escena deshabilitada vive en `SceneView` de `scene.schema.json` (1.1.1), no solo en `home-scene.openapi.yaml` (`T1257`). (b) La región `global` cambia `REQ-ESC6-017/031` (lista cerrada de regiones) sin enmienda de 006. (c) El código de error de escena deshabilitada no está en el catálogo de 006 | `scene.schema.json:7`, `spec.md:152`, `tasks.md:156` | Extender `T1257` a `scene.schema.json` y al `error-catalog.json` de 006; añadir enmienda de la lista de regiones de 006 (o declarar que es un cambio de configuración aprobado por la 009-B) |
| **MER-09** | MEDIO | (a) `updated_by_user_id` como autor de la edición de parámetros (REQ-CFG9-001/007) no tiene a quién apuntar: el administrador no tiene cuenta de usuario (`ADR-009-05`, `REQ-ADM9-003`). (b) El contrato de 005 `platform-parameter.schema.json` dice «Sin endpoint ni interfaz de edición» y «perfil de administrador aún no existe»: la 009 lo vuelve falso y `T1297` dice que no cambia 005. (c) La nota de `home-scene.openapi.yaml` 3.5.0 dice «se mantiene en 3.4.0», incoherente con la cabecera | `005 …platform-parameter.schema.json:5,68`; `spec.md:149,156`; `006 openapi:26` | (a) Definir el autor como identificador de `admin_identities` en columna propia, o auditar solo en `admin_audit_entries`. (b) Nota de descripción en 005 (PATCH documental). (c) Corregir la nota en la enmienda de 006 |
| **MER-10** | MEDIO | Códigos de error no nombrados. La spec solo menciona `ERR-SCHEMA-VALIDATION-FAILED`. Faltan los de: cuenta `PENDING`/`REJECTED` en login, escena deshabilitada, `429` del flujo de administración (`EDGE-009-035`), reinicio de cuota, `EDGE-009-049` (hogares afectados), reautenticación caducada | Búsqueda `ERR-` en `spec.md`: 1 resultado | Nombrar cada código y su catálogo (002/004/006/009) en `T1241`, `T1217`, `T1256` antes de `/keymaker`. Sin esto, `verify-traceability.sh --feature 009` no puede pasar |
| **MER-11** | BAJO | Baseline del repositorio. `git status` muestra cambios sin commit ajenos a esta pasada (`.gitignore`, `CLAUDE.md`, `playwright.config.ts`, logs, 005 `tasks.md`). La rama de 009 no parte de un árbol limpio | `git status` al inicio | Morpheus decide si se commitean o se aíslan antes de la Fase 1. No es responsabilidad de esta pasada |
| **MER-12** | BAJO | `REQ-PRO9-005` («Draw no animals in this room.») cambia el prompt de `N = 0`. Es un cambio de texto de 007 sin impacto de contrato, pero entra en el mismo paquete que MER-07 | `spec.md:171` | Cubierto por MER-07 |

## 7. Lo que sí está bien (sin hallazgo)

- Sin dependencias npm nuevas (PASS).
- Sin correo (`D9-01` = A), sin `EmailSenderPort`.
- `#60` no necesita migración: `provider_call_started_at` existe en PG 0009 y SQLite 0013 (`ADR-009-01/02`).
- `#57` no cambia `ScenePayload` ni el JSON de la escena (`D9-03`).
- La cookie de administración no usa `argos_session` ni `argos_oauth` (`Path` distinto, `ADR-009-06`). Los atributos de `argos_session` no cambian.
- La lista de administradores en configuración (`D9-02`) no requiere enmienda de Stack.

## 8. Decisiones que espera Neo (propuesta de `/merovingian`)

| ID | Propuesta de `/merovingian` |
| --- | --- |
| `D9-21` | Aprobar **con corrección**: `EDGE-009-036` reescrita con la fórmula de gasto acumulado (MER-02) y coste por modelo × región (MER-04). No firmar sin fuente de precio (MER-03) |
| `D9-22` | **Migración N2** de modelo y región por intento (columna en `scene_attempts`). El registro de auditoría no reconstruye el gasto |
| `D9-23` | Sí: exigir dictamen de `/rama` antes de habilitar `global` (y coste propio de `global`, MER-04) |
| `D9-24` | Lo decide Neo en producto. Este pase no evalúa la regla de 008 sobre transferencia |
| `D9-25` | Sin objeción de coste ni de dependencias. Los números son de `/lock` |
| `D9-26` | Enmienda versionada de 007 con actualización de pruebas (§5). La «excepción documentada» no basta |

## 9. Registro de la pasada

- Lectura de: `specs/009…/plan.md`, `spec.md`, `tasks.md`, `claude/inbox-feature-009.md`, `.specify/memory/constitution.md` (3.8.0), contratos 002, 004, 006 y 008 (README), `package.json`, `src/domain/scene/provider-parameters.ts`, migraciones 0013/0017, `app-config.ts:143`, 006 `research.md`, 007 `spec.md`, 005 `platform-parameter.schema.json`.
- Sin escritura fuera de esta acta y de las entradas de bitácora (`claude/log-merovingian.md` y `claude/registro-proceso-argos.md`).
- No se marcó ninguna casilla. No se tocó `spec.md`, `plan.md` ni `tasks.md`. No hubo `git` mutante.
