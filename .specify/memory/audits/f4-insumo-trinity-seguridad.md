# Insumo de Seguridad para F4 — Feature 002 (Trinity)

- **Autor:** Trinity (Seguridad, Criptografía y SAST) · **Fecha:** 2026-11-10 · **Rama:** `002-plataforma-v21`
- **Despachada por:** Morpheus, con autorización de Neo (Nivel 2) para F4.
- **Alcance:** solo documentación. No se editó ninguna spec, contrato, código, prueba ni la constitución.
- **Fuentes:** `specs/002-plataforma-v21/spec.md` (APPROVED), `.specify/memory/constitution.md` (3.1.0), `specs/001-pet-health-tracker/spec.md`, `contracts/state-machines/auth-session.machine.json` (v2.2.0, leído sin editar).
- **Convención:** todo lo marcado **PROPUESTA** (P-01 a P-14) está fuera de la spec aprobada o la precisa; no es requisito hasta que Neo lo decida. Lo demás deriva directamente de un ID citado.

---

## 1. Sesiones (`REQ-AUTH2-002/003`, `REQ-AUTH-003/004`, `INV-AUTH2-002`, constitución §Technology Stack, viñeta Autenticación)

### 1.1 Modelo
- **Credencial:** token opaco de 32 bytes aleatorios (`node:crypto`), base64url, en cookie `argos_session` (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` en Cloud). Esto ya lo fija la constitución.
- **En la base se guarda solo `SHA-256(token)`** (hex, índice único), nunca el token (`INV-AUTH-003`, `INV-AUD-001`). Un token de 256 bits no necesita sal ni KDF lento; el SHA-256 basta y la búsqueda es por hash exacto.
- **Fila de sesión:** `sessionId`, `userId`, `tokenHash`, `createdAt`, `lastActivityAt`, `revokedAt` (nulo si vigente). El `expiresAt` de la v2.2.0 deja de ser un campo: la caducidad se **deriva** de `createdAt` y `lastActivityAt`.
- **Vigencia (`INV-AUTH2-002`):** válida si `revokedAt` es nulo, `ahora < createdAt + 24 h` **y** `ahora < lastActivityAt + 30 min`. Se evalúa de forma perezosa en cada petición con el reloj del servidor; no hay temporizadores. Un estado `EXPIRED` es derivado, no escrito.
- **Renovación:** solo una petición autenticada **válida** actualiza `lastActivityAt`. Una petición rechazada antes de autenticar (CSRF, `INV-AUTH-007`, que se valida antes que la sesión), con sesión caducada o revocada, **no renueva nada**. La actividad **nunca** extiende las 24 h absolutas.
- **Recarga de página:** el navegador reenvía la cookie; `REQ-AUTH-004` (sesión actual) cuenta como petición válida y renueva la inactividad. Dentro de la vigencia no cierra sesión (constitución). Tras 30 min sin ninguna petición, la recarga recibe `ERR-AUTH-UNAUTHENTICATED` y la interfaz va a inicio de sesión.
- **Cierre de sesión (`REQ-AUTH-003`):** marca `revokedAt` de **esa** sesión; idempotente (204 en cualquier estado). La cookie vieja reutilizada después da `ERR-AUTH-UNAUTHENTICATED`.
- **Cambio de contraseña (`REQ-AUTH2-003`):** en **una sola transacción** se actualiza el hash de la contraseña y se revocan todas las demás sesiones del usuario (`sessionId <> actual`). Si cualquiera de los dos falla, ninguno se aplica; nunca debe quedar la contraseña nueva con sesiones viejas vivas.
- **Inicio de sesión:** siempre crea un token nuevo; se ignora cualquier cookie previa (sin fijación de sesión). Eliminar la cuenta borra sus sesiones (`REQ-ACC-002`).
- **Error:** siempre `ERR-AUTH-UNAUTHENTICATED`, idéntico para caducada por inactividad, absoluta, revocada o inexistente (sin canal que distinga el motivo; `INV-AUTH-006`).

### 1.2 Cambios propuestos a `STATE-AUTH-SESSION-001` (no editada; la edición es de Architect)
La v2.2.0 sigue con `SESSION_TTL_DAYS: 7`, `expiresAt` y `revoked`, y no conoce la inactividad ni la revocación por cambio de contraseña. Cambios concretos para una nueva versión:

1. **Versión y metadatos.** La spec dice «`STATE-AUTH-SESSION-001` v2» (`REQ-AUTH2-002`) y el archivo está en 2.2.0. **PROPUESTA P-01:** que Architect decida la numeración (sugiero 3.0.0, MAJOR, porque cambia la semántica de vigencia) y añada a `traceability`: `REQ-AUTH2-002`, `REQ-AUTH2-003`, `INV-AUTH2-002`, `REQ-ACC-002`.
2. **Constantes.** Quitar `SESSION_TTL_DAYS`. Añadir `SESSION_ABSOLUTE_TTL_HOURS: 24` y `SESSION_IDLE_TIMEOUT_MINUTES: 30` (`INV-AUTH2-002`). `MAX_FAILED_ATTEMPTS` y `LOCKOUT_WINDOW_MINUTES` no cambian (`INV-AUTH-005`).
3. **`AUTHENTICATED.REQUEST`.** Guarda: `!revoked && now < createdAt + 24h && now < lastActivityAt + 30min`. Efecto: `lastActivityAt = now`.
4. **Eventos de caducidad separados** hacia `EXPIRED`: `IDLE_TIMEOUT` (guarda `now >= lastActivityAt + 30min`) y `ABSOLUTE_TTL_ELAPSED` (guarda `now >= createdAt + 24h`); reemplazan a `TTL_ELAPSED`. Se evalúa primero la absoluta. Ambos con el mismo error `ERR-AUTH-UNAUTHENTICATED`; el motivo solo se registra en pruebas, no se devuelve.
5. **Revocación por cambio de contraseña.** Nuevo evento en `AUTHENTICATED`: `PASSWORD_CHANGED` con efecto `revokeOtherSessions(userId, currentSessionId)`; la sesión actual sigue en `AUTHENTICATED`. Para las otras sesiones, el evento externo `REVOKED_BY_PASSWORD_CHANGE` lleva a un estado terminal. **PROPUESTA P-02:** estado `REVOKED` distinto de `LOGGED_OUT` (mismo comportamiento de acceso y `LOGOUT` idempotente) para que las pruebas distingan «cerré yo» de «me revocaron». También `ACCOUNT_DELETED` → `REVOKED`.
6. **Regla `ttlIsDerived`:** `EXPIRED` no se persiste; se deriva en cada petición. Añadir regla `absoluteNotExtendable` (la actividad no mueve `createdAt`).
7. **Regla `noRenewalOnRejected`:** peticiones rechazadas por CSRF, sin sesión o con sesión inválida no modifican `lastActivityAt`.
8. Se conservan sin cambio `ANONYMOUS`, `LOGIN_*`, bloqueo y `logoutIdempotent`.

### 1.3 Otras propuestas de sesión
- **P-03 (purga):** tarea de limpieza de sesiones caducadas o revocadas con más de, por ejemplo, 7 días, y de tokens de confirmación vencidos (sección 3). Evita crecimiento sin límite y conservación innecesaria de hashes. Sin efecto funcional.
- **P-04 (interfaz sin sondeo):** la interfaz no debe hacer peticiones autenticadas en segundo plano (polling), porque cada una cuenta como actividad (`INV-AUTH2-002`) y anularía la expiración por inactividad en una pestaña olvidada. Es una regla de pruebas e2e y de revisión de código, no un cambio de spec.
- **No recomendado (se anota por completitud):** limitar a una escritura por minuto de `lastActivityAt` para ahorrar escrituras. Contradice «cada petición renueva» (`INV-AUTH2-002`); solo se justifica si la medición lo exige. No lo adopto como propuesta.

---

## 2. Auditoría (`REQ-AUD-001`, `INV-AUD-001`, `SC-012`, `SC-014`, N-1, N-A)

### 2.1 Qué se hashea y con qué
| Campo | Mecanismo | Fuente |
|---|---|---|
| `executorUserId` de un usuario eliminado (todas sus filas) | `HMAC-SHA256(ARGOS_AUDIT_HMAC_SECRET, userId)`, hex | `REQ-AUD-001`, N-1 |
| `entityId` de la fila `ACCOUNT_DELETE` y de filas con `entityType = USER` del usuario eliminado | el mismo HMAC, mismo secreto y formato (ambos campos coinciden) | `REQ-AUD-001`, N-A, `SC-014` |
| `previousStateHash`, `newStateHash` | `SHA-256` **sin clave** sobre JSON canónico (claves ordenadas) de la vista pública; `null` en creación o borrado | `REQ-AUD-001`, `SC-012` |
| Contraseñas, hashes de contraseña, tokens, cookies | **nunca** se guardan en ninguna fila | `INV-AUD-001`, `INV-AUTH-003` |

El HMAC se calcula **en la transacción de eliminación**, no antes: mientras la cuenta existe, el `userId` está en claro y es cuando se reescribe. Las sesiones y los tokens de confirmación no se auditan (`REQ-AUD-001`, H-F5-05).

### 2.2 Riesgo de correlación si se reutiliza el HMAC
- **Determinismo deliberado:** mismo usuario, mismo hash dentro de una instalación (US6 AC3). Eso permite unir todas las filas de ese usuario eliminado entre sí, y es lo que se quiere. No permite unirlas con una persona sin conocer el secreto.
- **Reutilización del secreto para otra cosa** (hash de tokens de sesión, token de respaldo, sal de contraseñas, CSRF) crea oráculos cruzados y vuelve más grave una filtración. **P-05:** el secreto solo se usa para HMAC de auditoría; los tokens usan SHA-256 simple y la contraseña usa `scrypt` con su sal (constitución). Es una restricción de implementación y no contradice la spec.
- **Separación de dominio dentro del HMAC** (p. ej. prefijo «user|» antes del `userId`) reduciría riesgo si el secreto se reutilizara, pero la spec fija `HMAC-SHA256(secreto, userId)` literal. No lo propongo: con P-05 no hace falta y cambiaría un formato aprobado.
- **Dependencia del formato de `userId`:** si los `userId` son UUID aleatorios, adivinarlos para confirmar un hash es inviable incluso con el secreto filtrado. Si fueran secuenciales o cortos, una filtración del secreto permitiría enumerarlos todos. Hay que verificar en el plan que `userId` sea un identificador aleatorio de al menos 122 bits.
- **P-06 (hallazgo, hashes SHA-256 sin clave de la entidad `USER`):** `REQ-AUD-001` dice que `previousStateHash`/`newStateHash` son SHA-256 sin clave sobre la «vista pública». Para filas con `entityType = USER` (edición de perfil, `REQ-ACC-001`), esa vista puede contener `displayName` o `email`, que tienen poca entropía. Un hash sin clave de datos de baja entropía se puede confirmar por diccionario; sobrevive a la eliminación de la cuenta y choca con «sin datos del usuario» de `SC-014`. Opciones, para decidir: (a) calcular el hash de `USER` sobre una vista sin `email` ni `displayName`; (b) poner en `null` esos dos hashes al eliminar la cuenta. Lo mismo, en menor grado, aplica a mascotas con nombre corto. Requiere decisión (sección 5, D2).

### 2.3 Configuración del secreto (`REQ-AUD-001`, `INV-ARCH-006`)
- Variable `ARGOS_AUDIT_HMAC_SECRET`, leída solo en `src/infrastructure/config/`, validada por el esquema de configuración; nunca en base, respaldo ni logs (incluidos mensajes de error de validación, que no deben imprimir el valor).
- **Producción: sin secreto o inválido, no arranca.** Desarrollo y pruebas: valor fijo de prueba explícito.
- **P-07 (precisión de «32 bytes de entropía»):** la entropía no se puede medir; el esquema debe comprobar **longitud decodificada >= 32 bytes** (hex de 64 caracteres o base64 que decodifique a >=32 bytes) y rechazar valores triviales (repetidos, el valor de prueba conocido). El valor de prueba **nunca** se acepta cuando el modo es producción, aunque alguien lo copie en la variable. Prueba de seguridad propia (vector V12).
- El secreto es una clave binaria usada con `createHmac('sha256', key)`; comparaciones de hashes con `timingSafeEqual` si alguna vez se verifican.

### 2.4 Rotación y versión de clave
- **Efecto de rotar hoy (spec):** los HMAC anteriores dejan de poder correlacionarse con un `userId` candidato; la spec lo acepta como decisión operativa. Dado que un `userId` eliminado no vuelve a aparecer, lo único que se pierde es la capacidad de demostrar «este hash corresponde al usuario X conocido». Las filas siguen siendo legibles.
- **P-08 (preparación sin implementar rotación):** si Neo quiere poder verificar tras rotar, hace falta saber con qué clave se calculó cada hash. Mecanismo mínimo: columna `auditKeyVersion` (entero, nula o `1` en filas sin HMAC) en la fila de auditoría, y configuración con anillo de claves (`ARGOS_AUDIT_HMAC_SECRET` = versión activa; versiones anteriores en variables adicionales solo para verificar). Los HMAC nuevos usan la activa; verificar prueba la versión indicada en la fila.
- **Recomendación: la rotación completa NO va en F4; va en una fase posterior.** Razones: la spec la declara decisión operativa y no un requisito; añade columna al contrato de auditoría y lógica de anillo, sin historia ni criterio de aceptación en `SC-012`/`SC-014`; y el caso de uso (verificar a un eliminado concreto) es raro. **Sí conviene en F4** un costo casi nulo: que la función `hmacUserId` viva detrás de un puerto único que reciba la clave por parámetro (`INV-ARCH-006`), de modo que añadir `auditKeyVersion` después no obligue a tocar el dominio. Mientras tanto, documentar en el runbook de despliegue que rotar el secreto rompe la verificación de HMAC previos. La decisión de incluir o no la columna ahora es de Neo (D1).

---

## 3. Respaldo (`REQ-BACKUP2-001/002`, `REQ-ACC-002` punto 5, N-2, `INV-BACKUP-001`, `SC-004`, `SC-014`)

### 3.1 Token efímero de confirmación
- **Generación:** 32 bytes aleatorios (`node:crypto`), base64url. Se entrega **una sola vez**, junto con la descarga (`REQ-BACKUP2-001`).
- **Almacenamiento:** solo `SHA-256(token)` (mismo criterio que la sesión; `INV-AUTH-003`, `INV-AUD-001`), con `userId`, `createdAt`, `expiresAt = createdAt + 10 min` y `usedAt` nulo. Restricción única por `userId`: un token nuevo reemplaza al anterior (la spec: «un token nuevo invalida el anterior»). Nada del token ni su hash va en logs, auditoría ni respaldo.
- **Enlace al usuario:** la consulta exige hash coincidente **y** `userId` igual al de la sesión. Un token de otro usuario, caducado, usado o inexistente produce el **mismo** `ERR-ACCOUNT-CONFIRMATION-MISMATCH` y el mismo tiempo de respuesta aproximado (sin canal para distinguir los casos; `INV-AUTH-006` por analogía).
- **Un solo uso real:** el consumo (`usedAt`) ocurre en la **misma transacción** que la eliminación y con condición atómica (`UPDATE ... WHERE hash=? AND userId=? AND usedAt IS NULL AND expiresAt > ahora`). Dos peticiones simultáneas con el mismo token: solo una puede ganar (vector V10). Si la eliminación falla y se revierte, el token vuelve a estar vigente hasta su caducidad.
- **No entra en el archivo:** el token **no** va dentro del JSON del respaldo. Si estuviera, quien tuviera el archivo tendría la autorización, y `REQ-BACKUP2-001` dice que el archivo nunca incluye sesiones ni credenciales. **P-09:** se entrega en una cabecera de la respuesta de exportación (la spec dice «junto con el archivo» sin fijar el canal) con `Cache-Control: no-store`; la interfaz la lee de la respuesta y la guarda solo en memoria, no en `localStorage`.
- **P-10 (momento de emisión):** el token se emite y se invalida el anterior **solo cuando la generación del archivo terminó bien** y en la misma transacción que el reemplazo del token. Si la exportación falla, el token previo sigue vigente. Para poder enviar la cabecera antes del cuerpo, el archivo se arma completo en memoria antes de responder (el sobre de una cuenta es acotado). Coincide con «al terminar la generación» de `REQ-BACKUP2-001`.

### 3.2 ¿Qué pasa si el token caduca a mitad de la descarga?
- El reloj de 10 minutos empieza **en la emisión**, que ocurre al terminar la generación y antes de enviar el cuerpo. La caducidad solo se comprueba al **eliminar la cuenta**, no al descargar. Por tanto, una descarga lenta no se interrumpe por la caducidad; lo que se agota es el tiempo para completar el formulario (frase, contraseña, token), por diseño de la spec («tiempo suficiente para guardar el archivo y completar el formulario»).
- Si la persona tarda más de 10 min, la eliminación se rechaza con `ERR-ACCOUNT-CONFIRMATION-MISMATCH` sin cambios y debe volver a exportar (el nuevo token anula el viejo). No hay estado intermedio que reparar.
- Límite honesto: el token prueba que **se pidió** un respaldo, no que el archivo se guardó. Es un freno contra eliminación impulsiva o por sesión secuestrada sin contraseña, no una garantía de copia. Se declara como riesgo residual (D5).
- **P-11 (orden de verificación):** el token se consume solo si **todas** las demás comprobaciones pasan (frase `ELIMINAR MI CUENTA`, contraseña actual, bloqueos de `REQ-ACC-002`). Así un error de tecleo no quema el token y no obliga a re-exportar. La spec no fija el orden.
- **P-12 (CSRF en la exportación):** la exportación **cambia estado** (emite el token). Debe exigir la marca de petición propia (`INV-AUTH-007`) y usar un método no seguro (POST), aunque entregue un archivo. Con `SameSite=Strict` el riesgo es bajo, pero la constitución (principio V, regla 3) pide la marca para peticiones que modifican estado.
- **P-13 (fuerza bruta de la contraseña):** el formulario de eliminación y el de cambio de contraseña verifican la contraseña actual con una sesión ya abierta. Un atacante con una sesión robada podría probar contraseñas sin pasar por `INV-AUTH-005`, que solo cuenta el inicio de sesión. Propuesta: los fallos de «contraseña actual» en `REQ-ACC-002` y `REQ-AUTH2-003` cuentan en la misma ventana de bloqueo del `username`, y la exportación (que emite tokens y es costosa) tiene límite de frecuencia. Ninguno está en la spec. Decisión de Neo (D3).

### 3.3 Integridad del archivo importado y no escalada de privilegios (`REQ-BACKUP2-002`, `INV-BACKUP-001`)
- **Lo que la spec garantiza:** el archivo se valida contra su esquema, sus invariantes y <= 10 MB; acepta `1.0.0`, `2.0.0`, `3.0.0` y migra; el reemplazo es atómico; las mascotas importadas quedan con `ownerUserId` = **usuario actual** y **sin asignaciones**; el efecto es solo sobre mascotas propias, sin tocar hogares ni membresías. `REQ-BACKUP2-001` confirma que el export nunca contiene hogares, asignaciones, sesiones ni credenciales, de modo que un archivo legítimo no lleva roles ni asignaciones.
- **Verificación contra escalada (resultado):** la spec lo cubre en intención y consecuencia. **No está dicho con palabras de qué se ignora o rechaza** si un archivo manipulado (o de la 1.0.0/2.0.0, que no pasaron por este esquema) trae `ownerUserId`, `householdId`, `role`, `assignments` o una `schemaVersion` mezclada. Para que la garantía sea comprobable: **P-14:** (a) los campos de propiedad, rol y asignación del archivo **nunca se leen** como autoridad: `ownerUserId` se fija siempre a la sesión, y los demás se descartan o el archivo se rechaza con `ERR-SCHEMA-VALIDATION-FAILED` (preferible rechazar, para no ocultar manipulación); (b) esquema con `additionalProperties: false` en cada sobre/versión; (c) rechazar las claves `__proto__`, `constructor` y `prototype` en cualquier nivel y evitar fusiones recursivas (`Object.assign` profundos, `merge`); (d) el tope de 10 MB se aplica a los **bytes realmente leídos** (flujo con corte), no a `Content-Length`; (e) profundidad máxima de anidamiento y claves duplicadas rechazadas; (f) las migraciones `1.0.0`→`3.0.0` y `2.0.0`→`3.0.0` ejecutan la misma validación final, no la saltan.
- **«Integridad» del archivo:** la spec define integridad como validez estructural e invariantes (`INV-BACKUP-001`); **no hay checksum ni firma** del archivo, y no la propongo: el usuario puede editar legítimamente su respaldo y una firma sin secreto compartido no aporta seguridad. Lo que protege es que **nada del archivo decide permisos**.
- **Fuga por colisión de IDs ajenos:** `INV-BACKUP-001` rechaza IDs que pertenezcan a otro usuario, mientras la previsualización informa colisiones «solo contra los datos propios» (`REQ-BACKUP2-002`). El rechazo no debe distinguirse de un error genérico de esquema para no confirmar la existencia de IDs ajenos; con identificadores aleatorios el riesgo es bajo. Se registra para el plan.
- **Efecto sobre terceros (no es escalada, pero sí cruce):** una mascota propia asignada a un hogar compartido que se reemplaza por importación pierde sus asignaciones (las importadas quedan «sin asignaciones»), y los miembros del hogar dejan de verla. La spec dice que el reemplazo no afecta hogares ni membresías, lo cual es cierto, pero no menciona este efecto en la previsualización. Se pide a Neo que decida si la previsualización debe avisarlo (D4).
- **La fila `IMPORT` de auditoría** lleva solo hashes SHA-256 de los JSON canónicos antes y después (`REQ-AUD-001`); no incluye el contenido del archivo.

---

## 4. Batería de seguridad (constitución §5 / principio de pruebas, `tests/security/`)

La constitución lista 9 vectores. La 001 los cubre. Cambios con la 002:

### 4.1 Vectores existentes que cambian
| # | Vector | Cambio con la 002 | ID |
|---|---|---|---|
| 1 | IDOR / acceso cruzado | Se prueba con los 4 roles y la matriz `can(rol, acción)`; lectura ajena = `ERR-PET-NOT-FOUND`, escritura sin permiso = `ERR-ACC-FORBIDDEN` | `INV-ACC2-001/002`, `SC-003` |
| 2 | Hogares ajenos | Membresías `INVITED/ACTIVE/LEFT/REMOVED`; tras expulsar o abandonar, las asignaciones se retiran | `REQ-HOUSE2-002` |
| 3 | Rutas sin sesión | Nuevas rutas: `/cuenta`, cambio de contraseña, exportación, eliminación | `REQ-AUTH2-003`, `REQ-UI2-004` |
| 4 | Sesión expirada | Dos relojes (30 min y 24 h), con pruebas en el límite exacto y reloj controlado; ya no 7 días | `INV-AUTH2-002` |
| 5 | CSRF | Nuevas peticiones que cambian estado: cambio de contraseña, eliminación y **exportación (emite token)** | `INV-AUTH-007`, P-12 |
| 6 | Enumeración y tiempo en login | `email` no único (sin canal en el registro); tiempo uniforme se mantiene; la política de contraseña no se aplica al login | `REQ-AUTH2-001/002`, `INV-AUTH-006` |
| 7 | XSS almacenado | Nuevos campos de texto: `displayName`, `speciesOther`, `email`, campos de las 6 colecciones y los del respaldo importado | `INV-PET2-001`, `REQ-ACC-001` |
| 8 | Importación maliciosa (prototype pollution) | Tres versiones de esquema y migración; campos de propiedad/rol/asignación manipulados | `REQ-BACKUP2-002`, P-14 |
| 9 | Carga > 10 MB | Se aplica sobre bytes leídos en las tres versiones | `REQ-BACKUP2-002` |

### 4.2 Vectores nuevos (7)
| # | Vector nuevo | Prueba esperada | ID |
|---|---|---|---|
| V10 | **Token de respaldo reutilizado** (segunda eliminación con el mismo token; dos peticiones simultáneas) | Una sola gana; la otra recibe `ERR-ACCOUNT-CONFIRMATION-MISMATCH`; la cuenta no queda a medias | `REQ-ACC-002`, `SC-014` |
| V11 | **Token caducado, ajeno, ausente o sustituido** (a 10 min exactos, token de otro usuario, token previo tras exportar de nuevo) | Mismo error y mismo cuerpo en todos los casos, sin cambios en datos | `REQ-ACC-002`, N-2 |
| V12 | **HMAC mal configurado** (variable ausente, <32 bytes, valor de prueba en modo producción) | La aplicación no arranca en producción; el valor nunca aparece en logs; en desarrollo se admite el valor de prueba explícito | `REQ-AUD-001`, `SC-014`, P-07 |
| V13 | **Sesión revocada por cambio de contraseña** (la cookie de la otra sesión se reutiliza después) | `ERR-AUTH-UNAUTHENTICATED`; la sesión actual sigue válida | `REQ-AUTH2-003`, `INV-AUTH2-002` |
| V14 | **Expiración por inactividad vs absoluta** (actividad constante no supera las 24 h; peticiones rechazadas no renuevan) | Expira en el primero de los dos límites | `INV-AUTH2-002` |
| V15 | **Auditoría sin secretos ni identificadores en claro** tras eliminar cuenta (búsqueda del `userId` en filas y en el volcado de la base) | Cero apariciones en `executorUserId` y `entityId`; hash idéntico con distinto orden de claves | `INV-AUD-001`, `SC-012`, `SC-014` |
| V16 | **Importación con privilegios falsos** (`ownerUserId`/`role`/asignaciones ajenas en el archivo, versión 1.0.0 y 2.0.0) | Propiedad = usuario de la sesión; sin asignaciones; o rechazo con `ERR-SCHEMA-VALIDATION-FAILED` | `REQ-BACKUP2-002`, P-14 |

Vectores añadidos: **7** (V10 a V16).

---

## 5. Riesgos que la spec no cubre: decisiones de Neo (Nivel 2)

**PARA: Neo (Andrés Vallejo — Nivel 2)**

- **D1 — Rotación del HMAC y `auditKeyVersion` (P-08):** recomiendo diferirla a una fase posterior; en F4 solo dejar el puerto parametrizado y el aviso en el runbook. Decidir si se acepta o se quiere la columna ya.
- **D2 — Hashes sin clave de la entidad `USER` (P-06):** pueden revelar `email` o `displayName` por diccionario aun tras eliminar la cuenta. Decidir (a) vista sin esos campos o (b) hashes en `null` al eliminar.
- **D3 — Fuerza bruta de «contraseña actual» con sesión abierta (P-13):** contar los fallos en la ventana de `INV-AUTH-005` y limitar la frecuencia de exportaciones. Hoy no está en la spec.
- **D4 — Importación y mascotas asignadas a hogares compartidos:** el reemplazo les quita las asignaciones y los demás miembros pierden la vista. Decidir si la previsualización lo avisa y si se acepta ese efecto.
- **D5 — Alcance del token:** prueba que se pidió el respaldo, no que se guardó. Aceptar como riesgo residual o exigir otra señal (fuera de la spec).
- **D6 — Numeración de la máquina de sesión (P-01) y estado `REVOKED` (P-02):** la spec habla de «v2» y el archivo está en 2.2.0; decidir 3.0.0 y si se separa `REVOKED`.

Propuestas menores sin decisión urgente, para que Architect/Keymaker las adopten si Neo las aprueba: P-03 (purga), P-04 (sin sondeo en la interfaz), P-05 (el secreto solo para auditoría), P-07 (validación del secreto), P-09 (token en cabecera, no en el archivo), P-10 (emisión tras generar), P-11 (consumo al final), P-12 (CSRF en exportación), P-14 (endurecimiento del parser de importación).

**Total de PROPUESTAS: 14** (P-01 a P-14). Ninguna contradice la spec aprobada; P-01, P-02, P-06, P-08 y P-13 tocan contratos o comportamiento no descritos y requieren decisión.

---

DE: Trinity (Seguridad)
PARA: Morpheus
ESTADO: Validación requerida
DETALLE: Insumo F4 en `.specify/memory/audits/f4-insumo-trinity-seguridad.md`.
SIGUIENTE PASO RECOMENDADO: Morpheus presenta D1 a D6 a Neo y entrega las secciones 1.2 y 3 a Architect.
