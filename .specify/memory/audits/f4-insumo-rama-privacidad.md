# F4 — Insumo de Rama (Privacidad, Habeas Data y Respaldos Atómicos) — Feature 002

> Fecha: 2026-11-10. Autor: `/rama`. Rama `002-plataforma-v21`. Solo documentación: no edita `specs/**`, `contracts/**`, `src/**`, `tests/**`, `tasks.md` ni la constitución.
> Fuentes: `specs/002-plataforma-v21/spec.md` (APPROVED), `.specify/memory/constitution.md` (3.1.0, principio V), `specs/001-pet-health-tracker/spec.md` (`REQ-BACKUP-001/002`, `INV-BACKUP-001`, `STATE-BACKUP-001`), `.specify/memory/audits/f2-clarificacion-feature-002.md` (C-08, C-17, C-24).
> Convención: lo que responde a la spec cita su ID. Todo lo que **añade** algo fuera de la spec aprobada va marcado **PROPUESTA** y no obliga hasta que Neo (Nivel 2) o el Architect lo adopten. Este documento no es asesoría legal: las referencias a Habeas Data son de principio (finalidad, minimización, supresión) y la lectura jurídica concreta queda para Neo.

---

## 1. Datos personales por entidad, clasificación y retención

Clasificación usada (propia de este documento, para que F4 la copie al esquema si Neo la adopta):

- **P-DIRECTO**: identifica a la persona por sí solo (`username`, `displayName`, `email`).
- **P-INDIRECTO**: identifica a la persona al cruzarse con otro dato (mascota con `microchipId`, `lastActivityAt`, vínculos de hogar).
- **P-TERCERO**: dato de una persona que no es la titular de la cuenta (veterinario y colegiado).
- **SECRETO**: credenciales y tokens (`INV-AUTH-003`, constitución V.1). Nunca en logs, respaldos ni auditoría.
- **NO-PERSONAL**: sin vínculo con una persona.

La retención de la auditoría la deja la spec a F4 («Retención y puerto de auditoría: F4», `REQ-AUD-001`); el resto de plazos de abajo son **PROPUESTA** salvo donde la spec ya los fija (sesión 24 h / 30 min, token 10 min).

| Entidad | Campo | Clasificación | Base en la spec | Retención propuesta |
|---|---|---|---|---|
| **Usuario** | `username` | P-DIRECTO | `REQ-AUTH2-001`, D1 | Mientras exista la cuenta; se borra en la eliminación (`REQ-ACC-002`). No se reutiliza en el mismo instante (ver R-09) |
| | `displayName` | P-DIRECTO | `REQ-AUTH2-001`, `REQ-ACC-001` | Igual que `username`. Es visible a miembros de hogares compartidos (Propietario Legal identificado, `REQ-HOUSE2-*`) |
| | `email` (opcional, no único, no verificado) | P-DIRECTO | `REQ-AUTH2-001`, `REQ-ACC-001`; solo visible para el propio usuario (`REQ-AUTH-004`) | Mientras exista la cuenta; el usuario puede vaciarlo (`REQ-ACC-001`); se borra en la eliminación. PROPUESTA: nunca en logs, ni en el hash de auditoría (R-03), ni en el respaldo (ya excluido por `REQ-BACKUP2-001`) |
| | hash de contraseña | SECRETO | `INV-AUTH-003`, `INV-AUTH2-001` | Mientras exista la cuenta; se borra con ella |
| | `preferredLanguage`, `timezone` | NO-PERSONAL / P-INDIRECTO bajo | `REQ-ACC-001` | Igual que la cuenta |
| **Sesión** | credencial, `createdAt`, `lastActivityAt` | SECRETO (credencial) y P-INDIRECTO (`lastActivityAt` es conducta) | `STATE-AUTH-SESSION-001` v2, `INV-AUTH2-002` | Vida de la sesión (24 h absolutas, 30 min de inactividad). PROPUESTA: purgar filas expiradas o revocadas a más tardar 24 h después de caducar. PROPUESTA: no guardar IP ni user-agent (la spec no los pide) |
| **Token de confirmación** | token, `userId`, caducidad, usado | SECRETO | `REQ-ACC-002` (5), `REQ-BACKUP2-001` | Caduca a los 10 min (spec). PROPUESTA: guardar solo su digest SHA-256, no el valor; purgar caducados o usados en ≤ 1 h; borrar en la eliminación |
| **Mascota** | `name`, `breed`, `birthDate`, `sex`, `neutered`, `speciesOther` | NO-PERSONAL salvo texto libre; P-INDIRECTO por `ownerUserId` | `REQ-PET2-001`, `INV-OWN2-001` | Mientras exista; se borra con la cuenta (si no está compartida, `REQ-ACC-002`) o se reemplaza en la importación |
| | `microchipId` | P-INDIRECTO (enlaza con registros nacionales de microchip que identifican al propietario) | `REQ-PET2-001`, C-24 (único por propietario, no global) | Igual que la mascota. Nunca se compara entre usuarios (C-24) |
| | `avatarUrl` (≤ 2048) | P-INDIRECTO (URL externa: quien la carga revela su IP al servidor remoto) | `REQ-PET2-001` | Igual que la mascota. Ver R-07 |
| | `ownerUserId` | P-INDIRECTO | `INV-OWN2-001` | Igual que la mascota. En la importación se fuerza al usuario actual (`REQ-BACKUP2-002`) |
| **Registros clínicos** (6 colecciones: peso, medidas, vacunación, desparasitación, citas, parámetros) | fechas, valores clínicos | NO-PERSONAL (sensible por contexto si se asocia al dueño) | `REQ-REC2-*`, US5 | Igual que la mascota; cascada con ella |
| | vacunación y desparasitación: `veterinarian`, colegiado (`license`), lote | **P-TERCERO** (nombre y número profesional de otra persona) | US5 AC5, `REQ-REC2-*` | Igual que la mascota. El dueño responde por ese dato; ver R-06 sobre texto libre |
| | notas y texto libre | Posible P-DIRECTO o P-TERCERO sin control | `REQ-REC2-*` | Igual que la mascota; sin validación de contenido (R-06) |
| **Hogar** | nombre del hogar, `ownerUserId` | P-INDIRECTO (el nombre puede contener apellidos o dirección) | `REQ-HOUSE2-001/002` | Mientras exista. Se borra con la cuenta si el usuario es el único miembro `ACTIVE` (N-5); se bloquea la eliminación si hay otros `ACTIVE` |
| **Membresía** | `userId`, rol, estado (`INVITED`, `ACTIVE`, `DECLINED`, `LEFT`, `REMOVED`) | P-INDIRECTO (revela con quién convive) | `STATE-HOUSE-MEMBERSHIP-001`, `REQ-HOUSE2-002` | Estados vivos: mientras dure. PROPUESTA: filas terminales (`DECLINED`, `LEFT`, `REMOVED`) se purgan a los 90 días o con el hogar, lo que ocurra antes; se borran siempre al eliminar la cuenta de cualquiera de las dos partes (`REQ-ACC-002`) |
| **Invitación** | `username` del invitado, rol (`roleOnJoin`), quién invita, estado | P-DIRECTO (username de un tercero que quizá no aceptó) | `REQ-HOUSE2-001` | PROPUESTA: invitaciones `PENDING` sin respuesta caducan a los 30 días; terminales se purgan a los 90 días; se borran al eliminar la cuenta del invitado o del que invita (R-04) |
| **Asignación mascota–hogar** | `petId`, `householdId` | P-INDIRECTO (decide qué ve un tercero) | `REQ-HOUSE2-003` | Mientras exista; se retira con abandono, expulsión, transferencia podada, importación y eliminación |
| **Auditoría** | `executorUserId` | P-INDIRECTO mientras sea `userId` en claro; **seudónimo** (HMAC) tras eliminar | `REQ-AUD-001`, N-1 | Ver abajo |
| | `entityId` | NO-PERSONAL salvo `entityType = USER` (= `userId`) o `ACCOUNT_DELETE` (HMAC) | `REQ-AUD-001`, N-A, `SC-014` | Igual |
| | `timestamp`, `mutationType`, `entityType` | NO-PERSONAL (metadato de conducta) | `REQ-AUD-001` | Igual |
| | `previousStateHash`, `newStateHash` | **P-INDIRECTO**: SHA-256 sin clave de datos de baja entropía (R-03) | `REQ-AUD-001`, `SC-012` | Igual |
| **Sobre de respaldo** (archivo del usuario) | mascotas propias y 6 colecciones | Todo lo anterior de mascota y registros, incluido P-TERCERO | `REQ-BACKUP2-001` | **Fuera del control del sistema** una vez descargado; el sistema no lo conserva (ver R-05) |

**Retención de la auditoría — PROPUESTA.** La auditoría debe sobrevivir a la eliminación de la cuenta (`REQ-AUD-001`, `INV-AUD-001`), pero no indefinidamente. Propuesta: conservar las filas **24 meses desde `timestamp`** y luego purgarlas con un trabajo de mantenimiento que registra solo un conteo (sin identificadores). El plazo se configura (nombre provisional `ARGOS_AUDIT_RETENTION_DAYS`, solo en `src/infrastructure/config/`, `INV-ARCH-006`). Es decisión D-1 para Neo. La purga no es una mutación del usuario y no genera fila `REQ-AUD-001`.

**Puerto de auditoría — PROPUESTA** (la spec lo delega a F4): un puerto `AuditLogPort` con solo `append(entry)` y `pseudonymizeUser(userId)`; sin operaciones de lectura ni borrado de filas sueltas. La tabla de auditoría **no debe tener clave foránea a `users`** ni `ON DELETE CASCADE`/`SET NULL`: una FK impediría el borrado de la cuenta o borraría la huella. La spec no define ninguna pantalla ni endpoint de lectura de la auditoría; se recomienda que siga sin haberlos para usuarios (solo operador por base de datos).

---

## 2. Secuencia de eliminación de cuenta (`REQ-ACC-002`, `REQ-HOUSE2-002`, US7, `SC-014`)

Principio: **una sola transacción** con bloqueo de escritura desde el inicio (`runInTransaction`, `INV-ARCH-005`; en SQLite, `BEGIN IMMEDIATE`; en una base Cloud, aislamiento serializable o bloqueo de las filas del usuario). Todo lo que decide el resultado se **vuelve a comprobar dentro** de la transacción, porque otro usuario puede aceptar una invitación o asignar una mascota entre la comprobación y el borrado (carrera de tiempo de comprobación a tiempo de uso).

### Fase A — Fuera de la transacción (sin escrituras)

| # | Paso | Cita | Nota |
|---|---|---|---|
| A1 | Validar sesión vigente, cabecera `X-Argos-Request: 1` y esquema de la petición (frase, contraseña, token) | Constitución V.3 | Si falla, no se tocó nada |
| A2 | Comparar la frase con el literal `ELIMINAR MI CUENTA` (sensible a mayúsculas y sin recortar; la spec dice «literalmente») | `REQ-ACC-002` (3) | Orden entre errores: el que fije F4 (`spec.md` línea 163: «primer fallo en este orden») |
| A3 | Verificar la contraseña actual (hash lento, fuera del bloqueo de escritura para no retenerlo) | `REQ-ACC-002` (4) | PROPUESTA: los intentos fallidos cuentan para el mismo limitador y el mismo tiempo uniforme que el login (`INV-AUTH-006`); ver R-02 |
| A4 | Calcular `h = HMAC-SHA256(ARGOS_AUDIT_HMAC_SECRET, userId)` en hexadecimal, con el secreto ya validado al arrancar | `REQ-AUD-001`, `SC-014` | Cálculo puro. Si el secreto falta, la aplicación no habría arrancado en producción |

### Fase B — Transacción única

| # | Qué hace | Efecto | Cita |
|---|---|---|---|
| B1 | `BEGIN` con bloqueo de escritura | Serializa contra cualquier otra mutación | `INV-ARCH-005` |
| B2 | Releer sesión y usuario: si ya no existen, abortar sin cambios (dos peticiones simultáneas: la segunda ve la cuenta eliminada) | Idempotencia | `REQ-AUTH-003` por analogía |
| B3 | **Consumir el token** con una sola sentencia condicional: marcar usado donde `userId` coincide, no esté usado y no haya caducado (reloj inyectado), y exigir 1 fila afectada; comparar su digest en tiempo constante. Cero filas → `ERR-ACCOUNT-CONFIRMATION-MISMATCH` y rollback | Un solo uso incluso con dos peticiones simultáneas; caducado, usado, ajeno o ausente se tratan igual | `REQ-ACC-002` (5), US7 AC7 |
| B4 | **Bloqueo 1:** ¿hay un hogar cuyo propietario sea el usuario y que tenga otro miembro `ACTIVE`? → `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD`, rollback (el consumo del token de B3 se revierte con él, por lo que el token sigue vigente) | | `REQ-ACC-002` (1), `REQ-HOUSE2-002` |
| B5 | **Bloqueo 2:** ¿hay una mascota del usuario asignada a un hogar con otro miembro `ACTIVE` (distinto del usuario)? → `ERR-ACCOUNT-OWNS-SHARED-PETS`, rollback | Una asignación a un hogar donde el usuario es el único `ACTIVE` no bloquea: ese hogar se elimina en B9 | `REQ-ACC-002` (2) |
| B6 | **Aserción de seguridad (PROPUESTA):** en cada hogar a eliminar por cascada, comprobar que toda asignación pertenece a una mascota del usuario (invariante «el dueño de una mascota es miembro `ACTIVE` de todo hogar donde está asignada», `REQ-OWN-001`, `REQ-HOUSE2-002`). Si aparece una mascota de otro dueño, abortar con `ERR-INTERNAL-UNEXPECTED` y rollback, **sin borrar datos ajenos** | Defensa ante un estado corrupto: la cascada nunca puede borrar datos de un tercero | `SC-003`, `INV-ACC2-001` |
| B7 | **Auditoría de la eliminación:** insertar 1 fila `ACCOUNT_DELETE` (`entityType = USER`) con `executorUserId = h` y `entityId = h`, `newStateHash = null`, `previousStateHash` = SHA-256 de la vista pública del usuario. **Nunca** se inserta con el `userId` en claro y luego se reescribe | Cumple «no existe ningún `userId` en claro» incluso ante un fallo a mitad | `REQ-AUD-001` (N-A), `SC-014` |
| B8 | **Seudonimizar el historial:** `executorUserId = h` en todas las filas donde sea el `userId`; `entityId = h` en las filas con `entityType = USER` y `entityId = userId` (incluye el `IMPORT` de `REQ-AUD-001`). Solo esos dos campos | Un solo mecanismo, idéntico para el mismo usuario | `REQ-AUD-001`, US6 AC3 |
| B9 | **Borrado en orden hoja → raíz** (todas dentro de la misma transacción): (a) las 6 colecciones de registros de las mascotas del usuario; (b) las asignaciones de esas mascotas; (c) las mascotas del usuario; (d) las invitaciones del usuario (recibidas, emitidas) y las de los hogares en cascada; (e) las asignaciones de los hogares en cascada; (f) las membresías del usuario en cualquier hogar y las de los hogares en cascada; (g) los hogares en cascada (único `ACTIVE`, N-5); (h) las sesiones del usuario (todas, incluida la actual); (i) los tokens del usuario; (j) la fila del usuario | Sin filas huérfanas, sin dejar al usuario referenciado | `REQ-ACC-002`, `REQ-HOUSE2-002` |
| B10 | **Poscondiciones dentro de la transacción (PROPUESTA):** (1) cero filas en cualquier tabla con el `userId` en claro; (2) sin mascotas con `ownerUserId` = ese usuario; (3) comprobación de claves foráneas sin errores; (4) exactamente 1 fila `ACCOUNT_DELETE` nueva. Si algo falla, rollback | Convierte el criterio de `SC-014` en una guarda de ejecución | `SC-014` |
| B11 | `COMMIT` | Todo o nada | `REQ-ACC-002` («en una transacción») |

Estado tras el éxito: el usuario ya no puede entrar (B9h, B9j) y la auditoría conserva solo `h` (HMAC) como identificador.

### Qué se borra, qué se anonimiza y qué se conserva

- **Se borra**: usuario, hash de contraseña, `email`, perfil; sesiones; token; mascotas propias y sus 6 colecciones; asignaciones; membresías e invitaciones del usuario; hogares donde era el único miembro `ACTIVE` con sus membresías, invitaciones y asignaciones.
- **Se anonimiza (seudonimiza)**: `executorUserId` y `entityId` (`USER`) en la auditoría, reemplazados por `h`.
- **Se conserva**: filas de auditoría con `timestamp`, `mutationType`, `entityType`, `entityId` de mascotas y hogares (identificadores propios, no contienen el `userId`), `previousStateHash`, `newStateHash` (ver R-03 sobre el riesgo de estos hashes), y la fila `ACCOUNT_DELETE`. Las mascotas, registros, membresías, invitaciones, sesiones, token y hogares en cascada **no** generan fila propia (`REQ-AUD-001`, «Filas por mutación», caso 2).
- **No se toca**: datos de otros usuarios, incluidas las mascotas ajenas asignadas a hogares donde el usuario era miembro (solo desaparece su membresía), y los hogares con otros miembros `ACTIVE` (la eliminación está bloqueada si es el propietario; si no lo es, el hogar sigue).

### Pasos que no pueden ser atómicos, y su compensación

| # | Paso no atómico | Por qué no entra en la transacción | Mecanismo de compensación |
|---|---|---|---|
| NA-1 | **Archivo de respaldo ya descargado** (en el equipo del usuario) | Está fuera del sistema; la spec lo asume (el token no prueba que el archivo se guardó) | Ninguna técnica. Compensación de proceso: la interfaz avisa en la zona de peligro de que el archivo contiene datos de terceros (veterinarios) y de que su custodia pasa a ser del usuario (R-05). La spec ya define que el servidor solo comprueba el token (`REQ-ACC-002`) |
| NA-2 | **Entrega del token junto con el archivo** (`REQ-BACKUP2-001`) | La respuesta HTTP puede perderse tras emitir el token | Fallo seguro: el token caduca a los 10 min y un token nuevo invalida el anterior. **PROPUESTA:** grabar el token antes de responder y, si la escritura falla, devolver error en vez de entregar solo el archivo. El token mal entregado no destruye nada: sin él la eliminación se rechaza |
| NA-3 | **Cookie y estado del navegador** tras el éxito | El servidor no controla el cliente | La sesión ya fue borrada en B9h: una cookie vieja se rechaza con `ERR-AUTH-UNAUTHENTICATED`. Además, responder con `Set-Cookie` de expiración. Es idempotente, no requiere reintento |
| NA-4 | **Residuos físicos en el almacenamiento** (páginas libres y archivo WAL de SQLite conservan los bytes borrados hasta sobrescribirse) | El borrado lógico confirmado no garantiza el borrado físico | **PROPUESTA:** activar `PRAGMA secure_delete = ON` al abrir la base y, tras el `COMMIT`, ejecutar un checkpoint del WAL con truncado. Si ese paso falla, no se revierte (la cuenta ya no existe): se registra un aviso sin identificadores y se reintenta en el siguiente arranque y en el trabajo periódico. Con una base Cloud (fase posterior) aplica la política del proveedor |
| NA-5 | **Copias de la base hechas por el operador** (copias de seguridad de infraestructura) | Fuera del alcance del producto | **PROPUESTA:** documentar un plazo máximo de retención de copias del operador (30 días) en la guía de despliegue; una restauración debe reaplicar las eliminaciones posteriores a la copia (lista de HMAC eliminados, no de `userId`) |
| NA-6 | **Registros de aplicación (logs)** y cachés en memoria | Se escriben fuera de la base | Los logs no deben contener `userId`, `username`, `email`, token ni cookie (constitución V.1, `INV-AUTH-003`, ampliado en R-01). Caché de sesiones en memoria: se vacía la entrada tras el `COMMIT`; si falla, la entrada ya apunta a una fila inexistente y la siguiente petición la rechaza |

Resultado: **ningún paso de la fase B es no atómico**; todo lo no atómico ocurre antes (A) o después (NA-3, NA-4) y es idempotente o fallo-seguro.

---

## 3. Atomicidad de la importación por reemplazo (`REQ-BACKUP2-002`, `INV-BACKUP-001`, `STATE-BACKUP-001`, `SC-004`)

### 3.1 Invariantes que deben cumplirse antes del `COMMIT`

Se reutilizan las de la 001, que la spec 002 mantiene (`REQ-BACKUP2-002`, tabla de trazabilidad del `spec.md`). Orden fijado por `INV-BACKUP-001` (v2.3.0) y `STATE-BACKUP-001`:

1. **I-1 Tamaño y forma:** ≤ 10 MB medido en bytes; JSON válido; versión soportada (`1.0.0`, `2.0.0`, `3.0.0`); esquema del sobre válido. Cualquier fallo de esquema devuelve `ERR-BACKUP-SCHEMA-INVALID` y `finalState: "ROLLED_BACK"`.
2. **I-2 Migración dentro del flujo:** `1.0.0`/`2.0.0` se migran en memoria (`DOG`/`CAT` → `CANINE`/`FELINE`) y **no** generan fila de auditoría propia (misma fila `IMPORT`, `REQ-AUD-001` caso 4).
3. **I-3 Integridad del sobre:** IDs únicos en todo el sobre (mascotas y registros comparten espacio), sin registros con `petId` ausente de `pets[]` (huérfanos).
4. **I-4 Invariantes de dominio:** `INV-PET-*` y luego `INV-REC-*` por módulo, en ese orden.
5. **I-5 IDs ajenos:** ningún ID del sobre pertenece a entidades de **otro** usuario (`ERR-BACKUP-REFERENTIAL-INTEGRITY`), comprobado **en la misma transacción** que la escritura (cierra la ventana en la que otro usuario crearía ese ID entre la comprobación y el commit).
6. **I-6 Propiedad forzada:** toda mascota importada queda con `ownerUserId` = usuario autenticado, **sin asignaciones a hogares**, sin importar lo que diga el archivo (`REQ-BACKUP2-002`, edge case «Importar con reemplazo elimina las asignaciones»).
7. **I-7 Alcance del reemplazo:** solo se borran las mascotas de las que el usuario es Propietario Legal y sus 6 colecciones y asignaciones. No se tocan mascotas ajenas, hogares, membresías, sesiones ni cuentas (`REQ-BACKUP2-002`, `SC-003`).
8. **I-8 Una fila `IMPORT` en la misma transacción:** `entityType = USER`, `entityId = userId`, `previousStateHash` y `newStateHash` sobre el JSON canónico de las mascotas propias con sus 6 colecciones antes y después (`REQ-AUD-001`, caso 3). Si la transacción se revierte, no queda fila (US6 AC2).
9. **I-9 Poscondiciones del commit (PROPUESTA):** conteos por entidad iguales a los de la previsualización; ninguna mascota del usuario con asignación; comprobación de claves foráneas sin errores; filas de otros usuarios sin variación (conteo y suma de verificación por usuario).

Nada se persiste antes de `COMMITTING_SNAPSHOT`; el commit es una única transacción (`STATE-BACKUP-001`). La previsualización no escribe (conteos y colisiones solo contra datos propios, C-24).

### 3.2 Cómo se verifica que nada queda a medias

- **Volcado lógico canónico antes y después.** Función de prueba que serializa en orden estable todas las filas del usuario (mascotas, 6 colecciones, asignaciones) y el conteo y la suma de verificación de la tabla de auditoría y de las filas de los demás usuarios. «Byte a byte» (`SC-004`) se interpreta sobre este volcado, no sobre el archivo físico de SQLite (cuyas páginas internas pueden variar sin cambio lógico). **PROPUESTA:** que Seraph/Keymaker lo documenten así en la prueba.
- **Punto de inyección de fallo por sentencia.** El puerto transaccional debe permitir en pruebas un «inyector de fallos» que haga fallar la N-ésima escritura. Sin él, `INV-BACKUP-001` no es verificable.
- **Rollback fallido:** el caso excepcional de `INV-BACKUP-001` (el rollback del almacenamiento falla) no puede verificarse con el volcado; se verifica por su código (`ERR-INTERNAL-UNEXPECTED`, `finalState: "UNKNOWN"`) y por el incidente registrado (H-06).

### 3.3 Criterio de prueba de fallo inyectado (PROPUESTA de criterio; ejecuta `SC-004`)

Parametrizar la prueba sobre **cada** escritura del commit (borrado de cada colección, borrado de asignaciones, borrado de mascotas, cada inserción de mascota, cada inserción de registro, inserción de la fila `IMPORT`, y el propio `COMMIT`), con un sobre válido que incluya las 6 colecciones y mascotas del usuario asignadas a un hogar compartido. Para cada punto de fallo, la prueba **pasa** solo si se cumplen **todas**:

1. La respuesta es `ERR-BACKUP-ATOMIC-ROLLBACK` con `finalState: "ROLLED_BACK"`; el error original no queda sustituido por el del rollback (`INV-BACKUP-001`).
2. El volcado lógico del usuario posterior es **idéntico** al anterior (incluidas las asignaciones a hogares, que **no** se pierden en un fallo).
3. La tabla de auditoría no tiene filas nuevas (US6 AC2) y el conteo de filas es el mismo.
4. Las filas de los demás usuarios y hogares tienen la misma suma de verificación (`SC-003`).
5. Sin archivos temporales ni tablas de preparación residuales.
6. Una importación inmediata posterior con el mismo archivo y sin fallo tiene éxito y deja el estado esperado (el fallo no dejó bloqueos ni medio estado).
7. Ningún mensaje de error ni log contiene datos del archivo (nombres, microchips, colegiados) ni identificadores de otro usuario (R-08).

Casos adicionales obligatorios:
- **Fallo del rollback:** respuesta `ERR-INTERNAL-UNEXPECTED` con `finalState: "UNKNOWN"` e incidente registrado.
- **Corte de proceso (SIGKILL) a mitad del commit:** al reabrir la base, el volcado lógico es exactamente el **anterior** o exactamente el **nuevo**, nunca una mezcla. Requiere un hijo de proceso que se mata en un punto controlado; es la prueba real de «byte a byte» ante caída.
- **Carrera con otro usuario:** otro usuario crea un ID del sobre entre la validación y el commit; el resultado es `ERR-BACKUP-REFERENTIAL-INTEGRITY` con el estado intacto (I-5).
- **Eliminación de cuenta (mismo patrón, PROPUESTA):** inyectar el fallo en cada sentencia de B3 a B10: la cuenta, mascotas, sesiones y auditoría quedan idénticas, el token **sigue vigente** (su consumo se revirtió) y no hay fila `ACCOUNT_DELETE` ni reemplazo de seudónimos parcial.

---

## 4. Riesgos de privacidad no cubiertos por la spec (todo **PROPUESTA**) y decisiones para Neo

| ID | Riesgo | Por qué importa | Propuesta |
|---|---|---|---|
| **R-01** | Los logs operativos no están regulados más allá de «sin secretos» (`INV-AUTH-003`). `username`, `email` y `userId` no son secretos pero son datos personales | Un log con `userId` en claro anula el HMAC de la auditoría tras la eliminación (`SC-014` solo mide la base de datos) | Prohibir `userId`, `username`, `email` y valores del respaldo en logs; usar un identificador de correlación sin relación con el usuario. Prueba: escanear logs de la suite de seguridad buscando los valores sembrados |
| **R-02** | La zona de peligro admite intentar la contraseña sin límite si no se vincula al limitador del login | Un atacante con una sesión robada podría adivinar la contraseña para eliminar la cuenta (`REQ-ACC-002` (4)) | Los fallos de contraseña en la eliminación cuentan para el mismo limitador y tiempo uniforme que el login (`INV-AUTH-006`); el token no se consume si falla la contraseña |
| **R-03** | `previousStateHash`/`newStateHash` son SHA-256 **sin clave** (`REQ-AUD-001`) de la vista pública de entidades. En `USER`, si la vista incluye `email` o `displayName`, y en `PET`, si incluye `name` o `microchipId`, son datos de baja entropía: quien lea la auditoría puede **confirmar por diccionario** que un correo o un microchip estuvo en la base, incluso tras la eliminación | Contradice el espíritu de «sin identificadores» de `SC-014`, aunque la letra se cumple. Es dato personal pseudonimizado de forma débil | **Opción mínima (dentro de la spec):** al definir en F4 la «vista pública» para el hash (`SC-012`), excluir `email` del usuario y `microchipId` de la mascota, y mantener el resto. **Opción fuerte (requiere decisión de Neo, no encaja con «y solo este campo» de `REQ-AUD-001`):** al eliminar la cuenta, poner a `null` los hashes de las filas `USER` y `PET` del usuario eliminado |
| **R-04** | La spec dice que la eliminación borra «sus invitaciones» pero no distingue invitaciones **recibidas** de las **emitidas** por el usuario en hogares que siguen existiendo | Una invitación pendiente emitida por un `ADMIN` eliminado quedaría con un emisor inexistente, o conservaría su `userId` | Borrar ambas (B9d). Las invitaciones `PENDING` emitidas pasan a cancelarse y desaparecen. Debe quedar explícito en el contrato de F4 |
| **R-05** | El respaldo es un documento al portador sin cifrar: contiene `microchipId`, datos de veterinarios (P-TERCERO), `ownerUserId` y, según el esquema 3.0.0, posiblemente `exportedByUserId` | Si el archivo se pierde, filtra datos de terceros y el `userId` en claro. Además, cualquiera con el archivo puede importarlo en otra cuenta mientras los IDs estén libres (p. ej. tras eliminar la cuenta de origen) | Que el esquema 3.0.0 **omita** `exportedByUserId` y todo `userId` (el dueño se deriva al importar, `REQ-BACKUP2-002`); aviso en la interfaz al descargar. Cifrado con contraseña queda fuera de la 002 (Feature 003) |
| **R-06** | Texto libre (notas, nombre de hogar, `breed`, `veterinarian`) sin validación de contenido personal | Puede alojar datos sensibles de terceros que acaban en el respaldo | Sin filtrado automático (no es viable). Texto de ayuda en los campos de veterinario y colegiado indicando que es dato de otra persona; el colegiado y el nombre no se escriben en logs ni en errores |
| **R-07** | `avatarUrl` apunta a un recurso externo: cada miembro del hogar que ve la ficha envía su IP y su navegador a ese servidor, y la URL puede ser `javascript:` o `data:` | Rastreo de terceros y XSS almacenado (`SC` de seguridad, vector 9 de la constitución) | Aceptar solo `https://`; en la interfaz, `referrerpolicy="no-referrer"`; mantener la CSP. No cambia el contrato `≤ 2048` |
| **R-08** | `ERR-BACKUP-REFERENTIAL-INTEGRITY` por «IDs ajenos» confirma a quien importa que un ID existe en otra cuenta. La spec evita revelarlo con 404 en lectura (constitución V.4) | Un oráculo de existencia entre usuarios (`SC-003`). Con identificadores aleatorios el riesgo es bajo; con identificadores predecibles no | El mensaje del problema no incluye el ID ni el propietario; se devuelve el mismo error para «ID ajeno» que para otros conflictos de integridad referencial. Verificar con Trinity/Sentinels que los IDs no son enumerables |
| **R-09** | Invitar por `username` (`REQ-HOUSE2-001`, D1) distingue «el usuario existe» de «no existe» | Enumeración de cuentas desde un hogar (`INV-AUTH-006` solo cubre el login). Además, tras eliminar una cuenta su `username` queda libre y podría ocuparlo otra persona | Respuesta uniforme al invitar (sea o no un usuario existente) con limitación de ritmo; invitaciones a un `username` inexistente quedan inertes. PROPUESTA de operación: reserva del `username` eliminado durante 30 días. No cambia ningún `REQ` aprobado |
| **R-10** | Reemplazo por importación: el dueño puede borrar sin aviso mascotas compartidas con un hogar, porque la importación (a diferencia de la eliminación de cuenta) no está bloqueada por mascotas compartidas (edge case de la spec) | Los miembros pierden datos que veían, sin trazas más allá de una fila `IMPORT` | La previsualización (`REQ-BACKUP2-002`) incluye, además de los conteos, el número de mascotas propias **asignadas a hogares** que se retirarán de esos hogares y se reemplazarán. No cambia el comportamiento, solo lo informa |
| **R-11** | Rotar `ARGOS_AUDIT_HMAC_SECRET` impide correlacionar los HMAC anteriores (`REQ-AUD-001`); filtrarlo permitiría reversión si los `userId` fueran enumerables (p. ej. enteros) | Debilita la seudonimización de `SC-014` | Decisión operativa documentada: no rotar salvo compromiso; si se rota, conservar el valor anterior solo para los HMAC antiguos. Confirmar en F4 que `userId` es un identificador aleatorio no enumerable |

### Decisiones para Neo (Nivel 2)

- **D-1 — Retención de la auditoría:** ¿24 meses (propuesta) o el plazo que Neo fije? Incluye si la purga es automática. (`REQ-AUD-001`, C-17.)
- **D-2 — Hashes de la auditoría tras la eliminación (R-03):** ¿opción mínima (excluir `email` y `microchipId` de la vista hasheada, sin tocar la spec) o opción fuerte (poner a `null` los hashes de las filas del usuario eliminado, lo que requiere enmendar «y solo este campo» de `REQ-AUD-001`)? Se recomienda la mínima.
- **D-3 — Invitar por `username` (R-09):** ¿respuesta uniforme con limitación de ritmo (recomendada) o se acepta que revele la existencia del usuario?
- **D-4 — Residuos físicos (NA-4):** ¿se autoriza `secure_delete` + truncado del WAL como parte de F4? (No añade dependencias.)
- **D-5 — Retención de membresías e invitaciones terminales (§1):** ¿90 días (propuesta) o conservarlas hasta que se elimine el hogar?
- **D-6 — Respaldo sin `userId` (R-05):** ¿el esquema 3.0.0 omite `exportedByUserId`? Lo decide el Architect al fijar el contrato; si Neo prefiere mantenerlo, se documenta como dato personal en el archivo.
- **D-7 — Previsualización ampliada (R-10):** ¿se añade el conteo de mascotas compartidas que se retirarán de sus hogares?

---

## 5. Trazabilidad con la spec (resumen)

| Requisito de la spec | Dónde se atiende aquí |
|---|---|
| `REQ-ACC-002` (1)–(5), US7 AC4–AC7 | §2 pasos B3–B5, B9; A2–A3 |
| `REQ-HOUSE2-002` (cascada con único `ACTIVE`, bloqueo con otros) | §2 B4, B6, B9 |
| `REQ-AUD-001`, US6 AC3, `SC-012`, `SC-014` (HMAC, sin identificadores) | §2 A4, B7, B8, B10; §1 auditoría; R-03, R-11 |
| `REQ-BACKUP2-001` (token al exportar) | §2 NA-1, NA-2 |
| `REQ-BACKUP2-002`, `INV-BACKUP-001`, `STATE-BACKUP-001`, `SC-003`, `SC-004` | §3 |
| C-17, C-24 (F2) | §1, R-03, R-08 |
| Constitución V (`INV-AUTH-003`, 404 en lugar de 403) | §1 SECRETO, R-01, R-08 |
