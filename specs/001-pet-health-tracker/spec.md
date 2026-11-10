# Feature Specification: Argos Pet Health & Biometric Tracker

**Feature Branch**: `001-pet-health-tracker`

**Created**: 2026-11-05

**Status**: Approved

**Input**: User description: "Plataforma web para la gestión clínica, biométrica y sanitaria de mascotas (`DOG` | `CAT`) sin límite de cantidad, usada por varios usuarios con cuenta propia. Cada usuario es dueño de sus mascotas y de sus historiales. Un usuario puede crear hogares e invitar a otros usuarios; cuando la invitación es aceptada, todos los miembros activos ven las mascotas de todos los miembros, con indicación visual inequívoca del dueño de cada una. Solo el dueño puede crear, editar o eliminar sus mascotas y registros. El sistema calcula la edad y el estado de vacunas y desparasitaciones con reglas deterministas y con la fecha y hora de referencia del sistema, y permite respaldar y restaurar los datos del usuario de forma atómica en un archivo de respaldo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear cuenta e iniciar sesión (Priority: P1)

Una persona que cuida mascotas crea su cuenta con nombre de usuario, nombre visible y contraseña, y queda con la sesión iniciada. Puede cerrar la sesión y volver a entrar. Sin sesión no accede a ningún dato.

**Why this priority**: toda la información pertenece a un usuario autenticado; ninguna otra historia funciona sin una sesión (`REQ-AUTH-001`, `REQ-AUTH-002`, `REQ-AUTH-003`, `REQ-AUTH-004`, `REQ-UI-005`).

**Independent Test**: se prueba completa con el recorrido registro → sesión → cierre de sesión → inicio de sesión, sin crear mascotas (regla de verificación de `REQ-UI-005`).

**Acceptance Scenarios**:

1. **Given** que no existe una cuenta con ese `username`, **When** la persona se registra con datos válidos, **Then** la cuenta se crea y queda autenticada sin tener que iniciar sesión aparte (`REQ-AUTH-001`).
2. **Given** una cuenta existente, **When** inicia sesión con usuario y contraseña correctos, **Then** obtiene una sesión válida durante 7 días (`REQ-AUTH-002`, `INV-AUTH-004`).
3. **Given** un usuario inexistente o una contraseña incorrecta, **When** intenta iniciar sesión, **Then** recibe el mismo error genérico en ambos casos, `ERR-AUTH-INVALID-CREDENTIALS` (`INV-AUTH-006`).
4. **Given** 5 o más intentos fallidos de ese `username` en los últimos 15 minutos, **When** intenta iniciar sesión de nuevo, **Then** el intento se rechaza con `ERR-AUTH-TOO-MANY-ATTEMPTS` (`INV-AUTH-005`).
5. **Given** una sesión iniciada, **When** cierra la sesión, **Then** la sesión queda revocada y las pantallas protegidas redirigen al inicio de sesión; repetir el cierre no produce error (`REQ-AUTH-003`, `REQ-UI-005`).

---

### User Story 2 - Gestionar mis mascotas (Priority: P2)

Un usuario registra sus perros y gatos sin límite de cantidad, edita su perfil, ve la lista con la edad, el peso más reciente y los contadores de alertas, abre la ficha de cada mascota y puede eliminarla.

**Why this priority**: la mascota es el núcleo del producto; el historial, las alertas, los hogares y el respaldo dependen de ella (`REQ-PET-001`, `REQ-PET-002`, `REQ-PET-003`, `REQ-PET-004`, `REQ-PET-005`, `REQ-UI-001`).

**Independent Test**: con una cuenta, se crean dos mascotas, se comprueba el orden por nombre y el filtro, se abre una ficha, se edita y se elimina una escribiendo su nombre.

**Acceptance Scenarios**:

1. **Given** una sesión iniciada, **When** el usuario registra una mascota con nombre, especie, raza, fecha de nacimiento y sexo válidos, **Then** la mascota queda a su nombre y aparece en «Mis mascotas» (`REQ-PET-001`, `INV-OWN-001`).
2. **Given** una mascota nacida el `2024-02-29`, **When** se consulta su edad el `2025-02-28`, **Then** la edad es 1 año y 0 meses, con 365 días en total (`{1, 0, 365}`, `REQ-PET-002`).
3. **Given** una fecha de nacimiento posterior a hoy, **When** intenta guardar la mascota, **Then** se rechaza con `ERR-PET-FUTURE-BIRTHDATE` (`INV-PET-002`).
4. **Given** varias mascotas, **When** filtra por un texto escrito sin tildes ni mayúsculas, **Then** ve las coincidencias ordenadas por nombre (`REQ-PET-005`).
5. **Given** una mascota con registros, **When** su dueño confirma la eliminación escribiendo el nombre de la mascota, **Then** la mascota y todos sus registros desaparecen en una sola operación (`REQ-PET-004`, `INV-PET-005`).
6. **Given** una mascota de otro usuario con quien no comparte hogar, **When** intenta abrir su ficha, **Then** la respuesta es la misma que si la mascota no existiera, `ERR-PET-NOT-FOUND` (`INV-ACC-001`).

---

### User Story 3 - Registrar el historial clínico y biométrico (Priority: P3)

El dueño de una mascota registra pesos, medidas corporales, vacunas, desparasitaciones, citas médicas y parámetros adicionales. Consulta cada historial ordenado y la evolución del peso con su variación.

**Why this priority**: es lo que convierte el perfil en un expediente; necesita que exista la mascota (`REQ-REC-001`, `REQ-REC-002`, `REQ-REC-003`, `REQ-REC-004`, `REQ-REC-005`, `REQ-REC-006`, `REQ-UI-002`).

**Independent Test**: sobre una mascota propia, se da de alta un registro en cada uno de los 6 módulos y se comprueban el orden de cada historial y la variación de peso.

**Acceptance Scenarios**:

1. **Given** una mascota propia con un peso anterior, **When** el dueño registra un peso nuevo, **Then** la serie muestra la diferencia exacta en kg respecto a la medición anterior, y la primera medición no muestra diferencia (`REQ-REC-001`).
2. **Given** una fecha de evento anterior al nacimiento o posterior a hoy, **When** intenta guardar cualquier registro, **Then** se rechaza con `ERR-REC-DATE-BEFORE-BIRTH` o `ERR-REC-FUTURE-EVENT-DATE` (`INV-REC-001`).
3. **Given** un peso fuera de 0.05–150.00 kg o una medida fuera de 1.00–250.00 cm, **When** intenta guardar, **Then** se rechaza con `ERR-REC-WEIGHT-OUT-OF-RANGE` o `ERR-REC-MEASUREMENT-OUT-OF-RANGE` (`INV-REC-002`, `INV-REC-003`).
4. **Given** varios registros de un mismo módulo, **When** consulta el historial, **Then** aparecen del más reciente al más antiguo, con un desempate que no depende del orden de inserción (`INV-SORT-001`).
5. **Given** un usuario que ve la mascota por un hogar pero no es su dueño, **When** intenta añadir un registro, **Then** se rechaza con `ERR-ACC-FORBIDDEN` y la ficha no le muestra formularios de alta (`INV-ACC-002`, `REQ-UI-002`).

---

### User Story 4 - Ver las alertas de vacunas y desparasitaciones (Priority: P4)

El usuario ve en las tarjetas y en la ficha un semáforo por cada vacuna y desparasitación: vencida, próxima, al día o sustituida, con los días restantes o de retraso.

**Why this priority**: aporta el valor preventivo del producto, pero requiere que existan registros de vacunación y desparasitación (`REQ-REC-003`, `REQ-REC-004`, `STATE-ALERT-001`, `REQ-UI-003`).

**Independent Test**: se registran vacunas con refuerzos en fechas distintas y se comprueba el estado de cada insignia frente a la fecha actual.

**Acceptance Scenarios**:

1. **Given** una vacuna cuyo refuerzo ya pasó, **When** consulta la ficha, **Then** la insignia es roja (`OVERDUE`) e indica los días de retraso (`STATE-ALERT-001`, `REQ-UI-003`).
2. **Given** un refuerzo dentro de los próximos 0 a 15 días, **When** consulta la ficha, **Then** la insignia es ámbar (`DUE_SOON`); con más de 15 días es verde (`UP_TO_DATE`).
3. **Given** un registro posterior de la misma vacuna o del mismo tipo de desparasitación, **When** consulta el historial, **Then** el registro anterior aparece en gris (`SUPERSEDED`).
4. **Given** la lista de mascotas, **When** el usuario la abre, **Then** cada tarjeta muestra cuántas alertas `OVERDUE` y `DUE_SOON` tiene la mascota (`REQ-UI-001`).

---

### User Story 5 - Compartir mascotas en un hogar (Priority: P5)

Un usuario crea un hogar e invita a otros por su nombre de usuario. Quien acepta la invitación ve las mascotas de todos los miembros activos, cada una con su dueño identificado. Solo el dueño edita sus mascotas. El propietario del hogar gestiona las membresías.

**Why this priority**: amplía el producto a familias y cuidadores, pero no es necesario para que un usuario gestione sus propias mascotas (`REQ-HOUSE-001`, `REQ-HOUSE-002`, `REQ-HOUSE-003`, `REQ-HOUSE-004`, `REQ-HOUSE-005`, `REQ-UI-006`, `REQ-UI-007`).

**Independent Test**: con dos usuarios en navegadores separados, uno crea un hogar e invita al otro; se comprueba qué ve cada uno antes y después de aceptar (regla de verificación de `REQ-UI-006`).

**Acceptance Scenarios**:

1. **Given** un usuario con sesión, **When** crea un hogar, **Then** queda como propietario (`OWNER`) en estado `ACTIVE` (`REQ-HOUSE-001`, `INV-HOUSE-001`).
2. **Given** una invitación que el invitado aún no ha aceptado, **When** el invitado intenta abrir el hogar, **Then** recibe `ERR-HOUSE-NOT-FOUND` y no ve datos del hogar ni de sus mascotas (`REQ-HOUSE-002`, `INV-HOUSE-004`).
3. **Given** una invitación aceptada, **When** cualquier miembro activo abre el hogar, **Then** ve las mascotas de todos los miembros activos, cada una con el nombre y el color de su dueño, y solo puede editar las propias (`REQ-HOUSE-005`, `INV-HOUSE-005`, `REQ-UI-007`).
4. **Given** un miembro que no es el propietario, **When** intenta invitar o retirar a alguien, **Then** se rechaza con `ERR-ACC-FORBIDDEN` (`INV-HOUSE-002`).
5. **Given** el propietario de un hogar, **When** intenta abandonarlo, **Then** se rechaza con `ERR-HOUSE-OWNER-CANNOT-LEAVE`; sí puede eliminar el hogar, y las mascotas de los miembros no se ven afectadas (`REQ-HOUSE-004`).
6. **Given** un miembro que fue retirado o que abandonó el hogar, **When** el propietario lo invita de nuevo, **Then** se crea una invitación nueva que el usuario debe aceptar (`STATE-HOUSE-MEMBERSHIP-001`).

---

### User Story 6 - Respaldar y restaurar mis datos (Priority: P6)

Un usuario descarga un archivo con todas sus mascotas y registros, y puede restaurarlo más tarde. Una restauración fallida no altera sus datos.

**Why this priority**: protege los datos y permite moverlos, pero solo tiene sentido cuando ya hay mascotas y registros (`REQ-BACKUP-001`, `REQ-BACKUP-002`).

**Independent Test**: se exporta el respaldo de un usuario con datos, se importa de nuevo y se compara; después se importa un archivo inválido y se comprueba que los datos no cambiaron.

**Acceptance Scenarios**:

1. **Given** un usuario con mascotas y registros, **When** exporta su respaldo, **Then** descarga un archivo con solo sus mascotas y sus 6 colecciones, sin datos de otros usuarios, hogares, sesiones ni credenciales (`REQ-BACKUP-001`).
2. **Given** un respaldo válido, **When** lo importa, **Then** sus datos se reemplazan por los del archivo en una sola operación y las mascotas quedan a su nombre (`REQ-BACKUP-002`).
3. **Given** un archivo mal formado, de versión no soportada, con identificadores duplicados, huérfanos o ajenos, o de más de 10 MB, **When** intenta importarlo, **Then** se rechaza con el código de error específico y sus datos anteriores quedan intactos (`INV-BACKUP-001`, `STATE-BACKUP-001`).
4. **Given** un respaldo en el formato `1.0.0`, **When** lo importa, **Then** se convierte al formato vigente antes de validarse y aplicarse (`STATE-BACKUP-001`).

---

### Edge Cases

- **ERR-SCHEMA-VALIDATION-FAILED**: Formato, tipos, longitudes o propiedades no autorizadas.
- **ERR-AUTH-USERNAME-TAKEN**: `username` ya registrado.
- **ERR-AUTH-WEAK-PASSWORD**: Contraseña incumple `INV-AUTH-002`.
- **ERR-AUTH-INVALID-CREDENTIALS**: Usuario o contraseña incorrectos (mensaje genérico).
- **ERR-AUTH-UNAUTHENTICATED**: Sin sesión, sesión revocada o expirada.
- **ERR-AUTH-TOO-MANY-ATTEMPTS**: Bloqueo de `INV-AUTH-005`.
- **ERR-AUTH-CSRF-REJECTED**: Petición mutante sin marca de petición propia del cliente.
- **ERR-AUTH-USER-NOT-FOUND**: Invitación a un `username` inexistente.
- **ERR-ACC-FORBIDDEN**: Recurso visible pero sin permiso de escritura/gestión.
- **ERR-PET-NOT-FOUND**: Mascota inexistente o no visible para el usuario.
- **ERR-PET-FUTURE-BIRTHDATE**: `birthDate` posterior a hoy.
- **ERR-PET-BIRTHDATE-AFTER-RECORDS**: Nuevo `birthDate` posterior a algún registro existente.
- **ERR-REC-DATE-BEFORE-BIRTH**: Evento anterior a `birthDate`.
- **ERR-REC-FUTURE-EVENT-DATE**: Evento posterior a hoy.
- **ERR-REC-WEIGHT-OUT-OF-RANGE**: Peso fuera de `[0.05, 150.00]`.
- **ERR-REC-MEASUREMENT-OUT-OF-RANGE**: Medida fuera de `[1.00, 250.00]`.
- **ERR-REC-INVALID-BOOSTER-DATE**: `nextBoosterAt <= appliedAt`.
- **ERR-REC-INVALID-NEXT-DOSE-DATE**: `nextSuggestedDoseAt <= appliedAt`.
- **ERR-HOUSE-NOT-FOUND**: Hogar inexistente o sin membresía `ACTIVE`.
- **ERR-HOUSE-MEMBER-ALREADY-EXISTS**: Ya existe membresía `INVITED`/`ACTIVE`.
- **ERR-HOUSE-OWNER-CANNOT-LEAVE**: El `OWNER` intenta abandonar su hogar.
- **ERR-HOUSE-INVITATION-NOT-FOUND**: No hay invitación `INVITED` para el usuario.
- **ERR-HOUSE-MEMBERSHIP-NOT-FOUND**: El `userId` objetivo de una baja no tiene membresía `INVITED` o `ACTIVE` en el hogar.
- **ERR-BACKUP-MALFORMED-JSON**: contenido sintácticamente inválido.
- **ERR-BACKUP-PAYLOAD-TOO-LARGE**: Archivo > 10 MB.
- **ERR-BACKUP-VERSION-UNSUPPORTED**: `schemaVersion` presente con un valor distinto de `"1.0.0"` o `"2.0.0"` (incluidos `null`, `2` o `"2.0"`). Si falta `schemaVersion` o la raíz no es un objeto, la respuesta es `ERR-BACKUP-SCHEMA-INVALID` (v2.3.0).
- **ERR-BACKUP-SCHEMA-INVALID**: Incumple `backup-envelope.schema.json`.
- **ERR-BACKUP-REFERENTIAL-INTEGRITY**: IDs duplicados, huérfanos o pertenecientes a otro usuario.
- **ERR-BACKUP-ATOMIC-ROLLBACK**: Fallo de persistencia en el commit; estado previo restaurado.
- **ERR-INTERNAL-UNEXPECTED**: Error no previsto (sin trazas en la respuesta).
- **Precedencia de validación en la frontera.** Si una misma petición incumple varias reglas, se devuelve el primer fallo en este orden:

  1. Petición que modifica estado sin la marca de origen propia del cliente → `ERR-AUTH-CSRF-REJECTED` (acceso denegado) (`INV-AUTH-007`; constitución, principio V, regla 3).
  2. Sesión, si la ruta la exige → `ERR-AUTH-UNAUTHENTICATED` (no autenticado).
  3. Normalización de `username` (recortar espacios y pasar a minúsculas) antes de validar.
  4. Esquema formal. El alcance del código de error por campo (anotación del contrato) es el valor del campo anotado: un fallo de `type`, `minimum`, `maximum`, `multipleOf`, `pattern`, `minLength` o `maxLength` sobre ese campo devuelve el código anotado (p. ej. `weightKg` → `ERR-REC-WEIGHT-OUT-OF-RANGE`; `password` → `ERR-AUTH-WEAK-PASSWORD`). Un campo obligatorio ausente o una propiedad no autorizada devuelve `ERR-SCHEMA-VALIDATION-FAILED` (datos inválidos), aunque el campo esté anotado. Cualquier otro fallo sin anotación devuelve también `ERR-SCHEMA-VALIDATION-FAILED`.
  5. Dominio: invariantes `INV-*` con sus códigos específicos. **Orden entre invariantes de un mismo registro (D-107-2, v2.2.1):** (a) decimales máximos de `INV-REC-002` / `INV-REC-003`; (b) ventana temporal de `INV-REC-001` (`birthDate ≤ fecha del evento ≤ hoy`); (c) fecha siguiente de `INV-REC-004` / `INV-REC-005`. Si la petición incumple varias, se devuelve el primer fallo de esta lista.

  **Acceso por recurso (D-108-4, v2.3.1).** En las rutas con identificador de mascota, registro, hogar o invitación, la comprobación de acceso al recurso va después de la sesión (punto 2) y antes del esquema del cuerpo (punto 4): si el recurso no existe o no es visible para el actor, no encontrado; si es visible pero el actor no tiene permiso, acceso denegado. Por eso un cuerpo inválido sobre una mascota ajena da acceso denegado y sobre una inexistente da no encontrado. Esta regla se sitúa entre los puntos 2 y 4 sin renumerarlos.

  Si una misma petición incumple varias reglas, se devuelve el primer fallo en este orden. Todo error devuelto durante una importación que termina en `ROLLED_BACK` incluye `finalState: "ROLLED_BACK"` en el problema, sea `ERR-BACKUP-*`, `ERR-PET-*`, `ERR-REC-*` o `ERR-SCHEMA-VALIDATION-FAILED`. La definición única de `ProblemDetails` está en `contracts/schemas/common.schema.json#/$defs/ProblemDetails`; `error-catalog.json` la referencia. Durante una importación de respaldo la anotación de código por campo no se aplica: cualquier fallo de esquema del sobre devuelve `ERR-BACKUP-SCHEMA-INVALID` (manda `STATE-BACKUP-001`).

## Requirements *(mandatory)*

### Functional Requirements

Cada requisito tiene un identificador inmutable. Las invariantes de dominio (`INV-*`) y las máquinas de estado (`STATE-*`) son requisitos verificables del mismo nivel que los `REQ-*`.

**Cuentas y sesión**

- **REQ-AUTH-001** (Registro de Usuario): Crea una cuenta con `username` (3–30 chars, `^[a-z0-9._-]+$`, almacenado en minúsculas), `displayName` (1–60 chars, sin espacios extremos) y `password` (8–128 chars, al menos 1 letra y 1 dígito). Tras registrarse, inicia sesión automáticamente. Entradas: `RegisterUserInput`, `reloj del sistema`, `generador de identificadores`, `verificador de contraseña`, `generador de token seguro`. Salida: `SessionView` + credencial de sesión.
- **REQ-AUTH-002** (Inicio de Sesión): Verifica `username` + `password`; si son correctos crea una sesión con expiración a 7 días (`STATE-AUTH-SESSION-001`). Error genérico ante usuario inexistente o contraseña incorrecta, con tiempo de respuesta uniforme (`INV-AUTH-006`). Entradas: `LoginInput`, `reloj del sistema`, `verificador de contraseña`, `generador de token seguro`. Salida: `SessionView` + credencial de sesión.
- **REQ-AUTH-003** (Cierre de Sesión): Revoca la sesión actual y invalida la credencial de sesión. Idempotente. Entradas: Sesión actual. Salida: sin contenido.
- **REQ-AUTH-004** (Sesión Actual): Devuelve el usuario autenticado (`UserPublicProfile`) o `ERR-AUTH-UNAUTHENTICATED`. Entradas: Credencial de sesión. Salida: `SessionView`.

**Perfiles de mascotas**

- **REQ-PET-001** (Registro y Edición de Perfil): Crea o actualiza una mascota del usuario autenticado con `name` (1–50), `species` (`DOG` | `CAT`), `breed` (1–60), `birthDate` (`YYYY-MM-DD`), `sex` (`MALE` | `FEMALE`) y `avatarUrl` opcional (≤ 2048). `ownerUserId` = usuario autenticado; no es editable. **Sin límite de cantidad ni de especie.**. Entradas: `CreatePetInput` / `UpdatePetInput`, `reloj del sistema`, `generador de identificadores`. Salida: `PetProfile`.
- **REQ-PET-002** (Cálculo Determinista de Edad): Calcula `{ years, months, totalDays }` entre `birthDate` y `fecha actual`. `years`/`months` cuentan aniversarios completos; si el día de nacimiento no existe en el mes evaluado (29-feb, día 31), el aniversario cae en el **último día** de ese mes. Ej.: `2024-02-29` → `2025-02-28` = `{1, 0, 365}`; `2026-01-31` → `2026-02-28` = `{0, 1, 28}`. Entradas: `birthDate`, `currentDate`. Salida: `ComputedAge`.
- **REQ-PET-003** (Ficha Técnica Individual): Devuelve el perfil, la edad, el dueño (`owner`) y las 6 colecciones ordenadas (`INV-SORT-001`) con resumen de alertas activas, aislando 100% los datos de esa mascota. Accesible para el dueño y para miembros activos de un hogar compartido con el dueño (`INV-ACC-001`); `canEdit = true` solo para el dueño. Entradas: `petId`, sesión, `reloj del sistema`. Salida: `PetDashboardView`.
- **REQ-PET-004** (Eliminación de Mascota): El dueño elimina una mascota y, en la misma transacción, sus 6 colecciones (`INV-PET-005`). La UI exige confirmación escribiendo el nombre de la mascota. Operación irreversible (se recomienda exportar respaldo antes). Entradas: `petId`, sesión. Salida: sin contenido.
- **REQ-PET-005** (Listado de Mis Mascotas): Lista todas las mascotas del usuario autenticado con edad, peso más reciente y contadores de alertas, ordenadas por `name` ASC (comparación `localeCompare` con locale `es`, sensibilidad `base`), desempate por `createdAt` ASC e `id` ASC. Sin paginación obligatoria; filtro opcional por texto en `name` y por `species`. El filtro de texto no distingue mayúsculas ni tildes: ambas cadenas se normalizan a NFD y se eliminan las marcas combinantes (`\p{M}`) antes de comparar por subcadena (D-03). Entradas: sesión, `reloj del sistema`, filtros opcionales. Salida: `PetCardView[]`.

**Registros históricos.** Toda operación de escritura exige que el usuario autenticado sea el dueño de la mascota (`INV-ACC-002`).

- **REQ-REC-001** (Control de Peso): Registra un peso en kg y devuelve la serie cronológica con `deltaKg` respecto a la medición inmediata anterior. `deltaKg` es la diferencia exacta en centésimas de kg, sin redondeo; la primera medición devuelve `null`. Campos y rangos: `recordedAt` (`YYYY-MM-DD`), `weightKg` (`0.05`–`150.00`, máx. 2 decimales), `notes` opcional (≤ 1000). Salida: `WeightEntryView`.
- **REQ-REC-002** (Medidas Corporales): Registra 4 dimensiones en cm. Campos y rangos: `recordedAt`, `neckCm`, `chestCm`, `backLengthCm`, `waistCm` (cada una `1.00`–`250.00`, máx. 2 decimales), `notes` opcional. Salida: `BodyMeasurementRecord`.
- **REQ-REC-003** (Vacunación): Registra una dosis y su próximo refuerzo; calcula `STATE-ALERT-001`. Campos y rangos: `appliedAt`, `vaccineName` (1–100), `nextBoosterAt`, `batchOrClinic` opcional (≤ 120), `notes` opcional. Salida: `VaccinationEntryView`.
- **REQ-REC-004** (Desparasitación): Registra aplicación `INTERNAL` | `EXTERNAL` y próxima dosis; calcula `STATE-ALERT-001`. Campos y rangos: `appliedAt`, `productBrand` (1–100), `dewormingType`, `nextSuggestedDoseAt`, `notes` opcional. Salida: `DewormingEntryView`.
- **REQ-REC-005** (Citas y Controles): Registra consulta con diagnóstico y tratamiento. Campos y rangos: `visitDate`, `reason` (1–200), `diagnosis` (1–500), `treatment` (1–500), `clinicOrVet` (1–120), `observations` opcional (≤ 1000). Salida: `MedicalVisitRecord`.
- **REQ-REC-006** (Parámetros Adicionales): Registra eventos categorizados. Campos y rangos: `recordedAt`, `category` (`DIET_CHANGE` | `ALLERGY` | `SURGERY` | `BEHAVIOR` | `OTHER`), `title` (1–120), `description` (1–1000), `notes` opcional. Salida: `CustomParameterRecord`.

**Hogares compartidos**

- **REQ-HOUSE-001** (Crear Hogar): Cualquier usuario crea un hogar con `name` (1–60). El creador queda como miembro `OWNER` en estado `ACTIVE`. Un usuario puede pertenecer a varios hogares. Entradas: `CreateHouseholdInput`, sesión. Salida: `HouseholdView`.
- **REQ-HOUSE-002** (Invitar Miembro): El `OWNER` invita a otro usuario existente por `username`. Se crea una membresía en estado `INVITED` (`STATE-HOUSE-MEMBERSHIP-001`). El invitado **no** ve ni expone datos hasta aceptar. Entradas: `InviteMemberInput`, sesión. Salida: `HouseholdMemberView`.
- **REQ-HOUSE-003** (Responder Invitación): El invitado lista sus invitaciones pendientes y las acepta (`ACTIVE`) o rechaza (`DECLINED`). Sin invitación `INVITED` responde no encontrado `ERR-HOUSE-INVITATION-NOT-FOUND`; nunca acceso denegado. Entradas: `householdId`, sesión. Salida: `HouseholdMemberView`.
- **REQ-HOUSE-004** (Gestionar Membresías): El `OWNER` puede retirar a un miembro (`REMOVED`) o cancelar una invitación; un `MEMBER` puede abandonar el hogar (`LEFT`); el `OWNER` puede eliminar el hogar (borrado físico en cascada de sus membresías; las mascotas no se ven afectadas, solo deja de compartirse). Si `userId` no tiene membresía `INVITED` o `ACTIVE`, responde no encontrado `ERR-HOUSE-MEMBERSHIP-NOT-FOUND`. Entradas: `householdId`, `userId`, sesión. Salida: sin contenido.
- **REQ-HOUSE-005** (Vista de Hogar): Devuelve las mascotas de **todos los miembros `ACTIVE`** del hogar, cada una con `owner = { userId, displayName, colorToken }` (`INV-HOUSE-005`) y `canEdit` (solo `true` para las propias). Orden: dueño por `firstJoinedAt` ASC y `userId` ASC, y luego la regla de `REQ-PET-005`. `colorToken` es `null` fuera de contexto de hogar. Entradas: `householdId`, sesión, `reloj del sistema`. Salida: `HouseholdPetsView`.

**Interfaz y experiencia de usuario**

- **REQ-UI-001** (Selector de Contexto y Mascotas): Barra superior con selector de contexto (**"Mis mascotas"** + cada hogar `ACTIVE`) y lista/cuadrícula de tarjetas de mascota (especie, nombre, edad, dueño, contador de alertas `OVERDUE`/`DUE_SOON`), con filtro por nombre y especie. Escala a cualquier número de mascotas (scroll, sin pestañas fijas). Verificación: Navegación completa por teclado; patrón ARIA listbox o tablist según WAI-ARIA APG (flechas, Inicio/Fin); sin recarga de página.
- **REQ-UI-002** (Vistas Históricas y Evolución de Peso): Pestañas por módulo en la ficha de la mascota activa, con gráfico SVG determinista y tabla de evolución con variación absoluta (kg) y porcentual respecto a la medición anterior. La variación porcentual se redondea half-away-from-zero a 2 decimales, incluidos los valores negativos, calculada sobre centésimas enteras. Formularios de alta para los 6 módulos visibles solo si `canEdit`. Verificación: Renderizado aislado para el `activePetId`.
- **REQ-UI-003** (Semáforo de Alertas Sanitarias): Insignias Rojo (`OVERDUE`), Ámbar (`DUE_SOON`), Verde (`UP_TO_DATE`), Gris (`SUPERSEDED`) con días restantes/retraso. Verificación: Mapeo 1:1 con `STATE-ALERT-001`.
- **REQ-UI-004** (Diseño Responsivo y Accesible): Layout adaptable a `>= 320px`, verificado a 320 px, 1024 px y 1280 px, WCAG 2.1 AA. Verificación: Cero violaciones `critical`/`serious` en `@axe-core/playwright` en todas las pantallas.
- **REQ-UI-005** (Pantallas de Registro e Inicio de Sesión): Formularios de registro y login con validación en cliente derivada de los contratos, mensajes de error del catálogo y botón de cierre de sesión siempre visible estando autenticado. Rutas protegidas redirigen a login. Verificación: E2E: registro → sesión → logout → login.
- **REQ-UI-006** (Gestión de Hogares): Pantalla para crear hogar, invitar por `username`, ver miembros con su estado, aceptar/rechazar invitaciones (con contador de pendientes), retirar miembros, abandonar y eliminar hogar. Verificación: E2E con 2 usuarios en contextos de navegador separados.
- **REQ-UI-007** (Distinción Visual del Dueño): En contexto de hogar, cada tarjeta y ficha muestra el `displayName` del dueño y una insignia con su `colorToken`; las mascotas ajenas muestran "Solo lectura" y ocultan acciones de edición/eliminación. La distinción no depende solo del color (incluye texto). Verificación: E2E + axe-core (contraste ≥ 4.5:1).

**Respaldo y restauración**

- **REQ-BACKUP-001** (Exportación del Usuario): Serializa **solo** las mascotas del usuario autenticado y sus 6 colecciones en un sobre `schemaVersion: "2.0.0"` validado contra `backup-envelope.schema.json`. Nunca incluye datos de otros usuarios, hogares, sesiones ni credenciales. Entradas: sesión, `reloj del sistema`. Salida: Archivo de respaldo descargable.
- **REQ-BACKUP-002** (Importación Atómica con Rollback): Valida el archivo de respaldo (≤ 10 MB) y todas las invariantes; acepta `2.0.0` y migra `1.0.0` (`STATE-BACKUP-001`). Si es 100% válido, **reemplaza atómicamente solo los datos del usuario autenticado** (las mascotas importadas quedan con `ownerUserId` = usuario actual). Ante cualquier fallo, el estado previo queda intacto byte a byte. **Reglas de la importación (v2.3.0):** el límite de 10 MB se mide en bytes, y los bytes no válidos son `ERR-BACKUP-MALFORMED-JSON`. Migración v1: la fracción de segundos se trunca a milisegundos; los desfases `±HH:MM`, `±HHMM` o `±HH` se restan para obtener UTC; `23:59:60Z` pasa al minuto siguiente. La migración solo cambia `ownerUserId`, `exportedByUserId`, `updatedAt` y los timestamps. Entradas: Archivo de respaldo, sesión, `reloj del sistema`. Salida: `ImportBackupResult` o `ERR-*`.

**Invariantes de dominio**

- **INV-PET-002** (Fecha de Nacimiento No Futura): `birthDate <= fecha actual`. Error: `ERR-PET-FUTURE-BIRTHDATE`.
- **INV-PET-003** (Integridad de Identidad): Todo registro (`REQ-REC-*`) referencia un `petId` existente. Error: `ERR-PET-NOT-FOUND`.
- **INV-PET-005** (Eliminación en Cascada Atómica): Eliminar una mascota elimina en la misma transacción todos sus registros de las 6 colecciones; tras el borrado no existe ningún registro con ese `petId`. Si falla cualquier paso, no se elimina nada. Error: `ERR-PET-NOT-FOUND` / `ERR-INTERNAL-UNEXPECTED`.
- **INV-PET-006** (Coherencia de `birthDate` con Historial): Al editar `birthDate`: `nuevoBirthDate <= min(fecha de evento de todos los registros de la mascota)`. Error: `ERR-PET-BIRTHDATE-AFTER-RECORDS`.
- **INV-OWN-001** (Propiedad Única): Toda mascota tiene exactamente un `ownerUserId` que referencia un usuario existente; `ownerUserId` es inmutable vía API. Los registros heredan la propiedad de su mascota. Error: `ERR-SCHEMA-VALIDATION-FAILED`.
- **INV-ACC-001** (Autorización de Lectura): El usuario `U` puede leer la mascota `P` si `P.ownerUserId == U.id` **o** existe un hogar `H` donde `U` y `P.ownerUserId` tienen membresía `ACTIVE`. En otro caso, se responde como inexistente. Error: `ERR-PET-NOT-FOUND`.
- **INV-ACC-002** (Autorización de Escritura): Crear, editar o eliminar una mascota o cualquiera de sus registros exige `P.ownerUserId == U.id`. Si `U` puede leer pero no es dueño → `ERR-ACC-FORBIDDEN`; si no puede leer → `ERR-PET-NOT-FOUND`. Error: `ERR-ACC-FORBIDDEN` / `ERR-PET-NOT-FOUND`.
- **INV-AUTH-001** (Unicidad de Usuario): `lower(username)` es único en el sistema. Error: `ERR-AUTH-USERNAME-TAKEN`.
- **INV-AUTH-002** (Política de Contraseña): `8 <= length(password) <= 128`, contiene `[A-Za-z]` y `[0-9]`. Error: `ERR-AUTH-WEAK-PASSWORD`.
- **INV-AUTH-003** (Secreto de Credenciales): La contraseña solo existe como hash irreversible con sal; ningún contrato de salida, log ni respaldo contiene `password`, hash ni token de sesión en claro. Error: N/A (verificado en `tests/security/`).
- **INV-AUTH-004** (Vigencia de Sesión): Una sesión es válida si no fue revocada y `instante actual < expiresAt`, con `expiresAt = createdAt + 7 días`. Error: `ERR-AUTH-UNAUTHENTICATED`.
- **INV-AUTH-005** (Bloqueo por Intentos Fallidos): Ventana deslizante de 15 minutos: si existen 5 o más fallos registrados de ese `username` en los últimos 15 minutos, el login se rechaza sin verificar la contraseña. Los intentos rechazados no se registran. Un login exitoso elimina los fallos registrados de ese `username`. Aplica también a usuarios inexistentes. Error: `ERR-AUTH-TOO-MANY-ATTEMPTS`.
- **INV-AUTH-006** (Tiempo Uniforme en Login): El tiempo de respuesta de `LoginUseCase` no depende de que el `username` exista: si no existe, se ejecuta `verificación de contraseña` contra un hash ficticio de igual coste. Verificado con espía sobre `verificador de contraseña` (una invocación en ambas ramas), sin umbral temporal (D-02). Error: `ERR-AUTH-INVALID-CREDENTIALS` (respuesta idéntica).
- **INV-AUTH-007** (Protección CSRF en Peticiones Mutantes): Toda petición que modifica estado exige la marca de petición propia del cliente, validada antes que la sesión (ver «Precedencia de validación en la frontera»; constitución, principio V, regla 3). Error: `ERR-AUTH-CSRF-REJECTED`.
- **INV-HOUSE-001** (Propietario Único del Hogar): Todo hogar tiene exactamente un miembro con rol `OWNER` y estado `ACTIVE` (su creador). Error: `ERR-HOUSE-OWNER-CANNOT-LEAVE`, que el catálogo enlaza a esta invariante (`invariantRef`): el propietario no puede abandonar el hogar mientras sea el único.
- **INV-HOUSE-002** (Gestión Exclusiva del Propietario): Solo el `OWNER` invita, cancela invitaciones, retira miembros o elimina el hogar. Error: `ERR-ACC-FORBIDDEN`.
- **INV-HOUSE-003** (Membresía Única): Por cada par (`householdId`, `userId`) existe a lo sumo una membresía en estado `INVITED` o `ACTIVE`. Invitar a un usuario inexistente falla. Error: `ERR-HOUSE-MEMBER-ALREADY-EXISTS` / `ERR-AUTH-USER-NOT-FOUND`.
- **INV-HOUSE-004** (Visibilidad Solo por Membresía Activa): Un hogar y sus mascotas solo son visibles para miembros `ACTIVE`. Un invitado (`INVITED`) recibe no encontrado `ERR-HOUSE-NOT-FOUND` al leer el hogar o sus mascotas, sin datos del hogar. En `members` se devuelven solo membresías `ACTIVE`, salvo para el `OWNER`, que además recibe las `INVITED` (D-01). **Orden de `members` (D-106-6, v2.2.1):** primero las `ACTIVE`, en el orden de `INV-HOUSE-005` (`firstJoinedAt` ASC, `userId` ASC); después, solo para el `OWNER`, las `INVITED` por `invitedAt` ASC y `userId` ASC. Error: `ERR-HOUSE-NOT-FOUND`.
- **INV-HOUSE-005** (Color Determinista de Dueño): `colorToken = OWNER_COLOR_{(i mod 8) + 1}` donde `i` es la posición (base 0) del dueño en la lista de miembros `ACTIVE` ordenada por `firstJoinedAt` ASC, `userId` ASC. Fuera de contexto de hogar, `colorToken = null`. Error: N/A.
- **INV-REC-001** (Ventana Temporal de Eventos): `pet.birthDate <= eventDate <= fecha actual`. Error: `ERR-REC-DATE-BEFORE-BIRTH` / `ERR-REC-FUTURE-EVENT-DATE`.
- **INV-REC-002** (Rango de Peso): `0.05 <= weightKg <= 150.00`, máx. 2 decimales. Error: `ERR-REC-WEIGHT-OUT-OF-RANGE`.
- **INV-REC-003** (Rango de Medidas): Cada dimensión en `[1.00, 250.00]` cm, máx. 2 decimales. Error: `ERR-REC-MEASUREMENT-OUT-OF-RANGE`.
- **INV-REC-004** (Refuerzo de Vacuna): `nextBoosterAt > appliedAt`. Error: `ERR-REC-INVALID-BOOSTER-DATE`.
- **INV-REC-005** (Próxima Desparasitación): `nextSuggestedDoseAt > appliedAt`. Error: `ERR-REC-INVALID-NEXT-DOSE-DATE`.
- **INV-REC-006** (Textos No Vacíos): Todo string obligatorio (`name`, `breed`, `displayName`, `vaccineName`, `productBrand`, `reason`, `diagnosis`, `treatment`, `clinicOrVet`, `title`, `description`, `household.name`) cumple `trim().length >= 1` y no tiene espacios extremos. Error: `ERR-SCHEMA-VALIDATION-FAILED`.
- **INV-SORT-001** (Orden Cronológico Determinista): Todo historial se ordena por fecha de evento DESC, luego `createdAt` DESC, luego `id` ASC. `createdAt` es **siempre** UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ` (garantiza que la comparación lexicográfica equivale a la cronológica). Error: N/A (propiedad en `tests/property/`).
- **INV-BACKUP-001** (Atomicidad e Integridad del Backup): El sobre importado no puede contener IDs duplicados, registros con `petId` ausente de `pets[]`, IDs que ya pertenezcan a entidades de **otro** usuario, ni violar `INV-PET-*` / `INV-REC-*`. Cualquier violación aborta en `ROLLED_BACK` propagando el código específico (`ERR-BACKUP-*`, `ERR-PET-*` o `ERR-REC-*`). Un fallo de persistencia durante el commit produce `ERR-BACKUP-ATOMIC-ROLLBACK`. El rollback nunca reemplaza el error original. Excepción: si el rollback del almacenamiento falla, la postcondición de byte-identidad no está garantizada; se reporta `ERR-INTERNAL-UNEXPECTED` con `finalState: "UNKNOWN"` y se registra como incidente (H-06). **Orden de comprobación y unicidad (v2.3.0):** los IDs son únicos en todo el sobre, porque mascotas y registros de los 6 módulos comparten espacio. Dentro de `CHECKING_DOMAIN_INVARIANTS` se comprueban, en este orden: duplicados y huérfanos del sobre; después `INV-PET-*`; después `INV-REC-*` por módulo; por último, los IDs de otros usuarios (`ERR-BACKUP-REFERENTIAL-INTEGRITY`), comprobados en la misma transacción que el commit para que ningún usuario cree ese ID entre la comprobación y la escritura. Un error detectable sin almacenamiento nunca depende de él. Error: `ERR-BACKUP-*`, `ERR-PET-*`, `ERR-REC-*`.

**Máquinas de estado y flujos**

- **STATE-ALERT-001** (contrato `contracts/state-machines/sanitary-alert.machine.json`): Sea `daysRemaining = diffInCalendarDays(targetDate, fecha actual)`: `SUPERSEDED` si existe un registro posterior de la misma clave (`vaccineName` normalizado con `trim().toLowerCase()`, o mismo `dewormingType`) para la misma mascota; si no, `OVERDUE` si `< 0`, `DUE_SOON` si `0..15`, `UP_TO_DATE` si `> 15`.
- **STATE-BACKUP-001** (contrato `contracts/state-machines/backup-import.machine.json`): `IDLE` → `CHECKING_PAYLOAD_SIZE` (≤ 10 MB; si no, `ROLLED_BACK` con `ERR-BACKUP-PAYLOAD-TOO-LARGE`) → `PARSING_JSON` (si falla, `ROLLED_BACK` con `ERR-BACKUP-MALFORMED-JSON`) → `VALIDATING_VERSION_AND_SCHEMA` (versión no soportada → `ERR-BACKUP-VERSION-UNSUPPORTED`; esquema inválido → `ERR-BACKUP-SCHEMA-INVALID`) → [`MIGRATING_LEGACY_ENVELOPE` si `schemaVersion == "1.0.0"`] → `CHECKING_DOMAIN_INVARIANTS` (IDs huérfanos, duplicados o ajenos → `ERR-BACKUP-REFERENTIAL-INTEGRITY`; otras violaciones → código específico propagado) → `COMMITTING_SNAPSHOT` (fallo de almacenamiento → `ERR-BACKUP-ATOMIC-ROLLBACK`) → `COMPLETED` | `ROLLED_BACK`. Ningún cambio se persiste antes de `COMMITTING_SNAPSHOT`; el commit es una única transacción. Todo error de importación que termina en `ROLLED_BACK` se devuelve con `finalState: "ROLLED_BACK"`, sea `ERR-BACKUP-*`, `ERR-PET-*`, `ERR-REC-*` o `ERR-SCHEMA-VALIDATION-FAILED` propagado. Si el propio rollback del almacenamiento falla (`ROLLBACK_FAILED`), la respuesta es `ERR-INTERNAL-UNEXPECTED` con `finalState: "UNKNOWN"` (H-06).
- **STATE-AUTH-SESSION-001** (contrato `contracts/state-machines/auth-session.machine.json`): `ANONYMOUS` → `AUTHENTICATED` → `EXPIRED` | `LOGGED_OUT`. `LOGOUT` responde sin contenido en cualquier estado sin cambiar el estado ni registrar error (idempotente, D-04). `EXPIRED` y `LOGGED_OUT` no son estados finales: admiten `LOGOUT` (H-05).
- **STATE-HOUSE-MEMBERSHIP-001** (contrato `contracts/state-machines/household-membership.machine.json`): `INVITED` → `ACTIVE` | `DECLINED` | `CANCELLED`; `ACTIVE` → `LEFT` | `REMOVED`. Desde `DECLINED`, `CANCELLED`, `LEFT` o `REMOVED` el `OWNER` reinvita mediante el evento `INVITE`, que crea una fila nueva con `membershipId` nuevo y hereda `firstJoinedAt` del par (D-05). `DECLINED`, `CANCELLED`, `LEFT` y `REMOVED` no son estados finales: admiten `INVITE` del `OWNER` (H-05). El `OWNER` nace en `ACTIVE` y no puede transitar a `LEFT`. Cada invitación es una fila con `membershipId` propio; `firstJoinedAt` se fija en el primer paso a `ACTIVE` del par y no cambia al reingresar; `joinedAt` registra el último paso a `ACTIVE` de la fila. Eliminar el hogar borra físicamente sus membresías.

### Key Entities *(include if feature involves data)*

- **Usuario** (`UserPublicProfile`): cuenta con `username` único y `displayName`. Es dueño de sus mascotas. Sus credenciales nunca forman parte de ninguna salida. Contrato: `contracts/schemas/identity.schema.json`.
- **Sesión** (`SessionView`): acceso autenticado de un usuario, con vigencia de 7 días. Ciclo de vida: `STATE-AUTH-SESSION-001`.
- **Mascota** (`PetProfile`): nombre, especie (`DOG` | `CAT`), raza, fecha de nacimiento, sexo y avatar opcional. Pertenece a exactamente un usuario y su dueño no cambia. Contrato: `contracts/schemas/pet.schema.json`.
- **Registros históricos**: seis colecciones por mascota (peso, medidas corporales, vacunación, desparasitación, cita médica y parámetro adicional). Cada registro pertenece a una mascota y hereda su dueño. Contrato: `contracts/schemas/medical-records.schema.json`.
- **Alerta sanitaria** (`AlertStatus`): estado calculado para cada vacunación y desparasitación a partir de su fecha objetivo y de la fecha actual. Reglas: `STATE-ALERT-001`.
- **Hogar** (`Household`) y **membresía** (`HouseholdMember`): un hogar agrupa usuarios; cada membresía tiene rol (`OWNER` o miembro) y estado. Ciclo de vida: `STATE-HOUSE-MEMBERSHIP-001`.
- **Sobre de respaldo** (`BackupEnvelopeV2`, y `BackupEnvelopeV1Legacy` para la migración): las mascotas de un usuario y sus seis colecciones. Contrato: `contracts/schemas/backup-envelope.schema.json`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona nueva completa el recorrido registro → sesión → cierre de sesión → nuevo inicio de sesión de principio a fin, sin ayuda (`REQ-UI-005`).
- **SC-002**: El 100 % de los requisitos, invariantes, máquinas de estado y errores vigentes tiene al menos una implementación y una prueba que lo citan por su identificador (constitución, principios III y IV).
- **SC-003**: Ningún usuario obtiene datos de otro sin una membresía activa compartida: cero accesos cruzados en la batería de seguridad (`INV-ACC-001`, constitución, principio V).
- **SC-004**: Tras una importación de respaldo fallida, los datos anteriores del usuario quedan idénticos byte a byte en el 100 % de los casos probados (`REQ-BACKUP-002`, `INV-BACKUP-001`).
- **SC-005**: Todas las pantallas son utilizables a 320, 1024 y 1280 px de ancho con cero violaciones de accesibilidad de severidad crítica o seria (`REQ-UI-004`).
- **SC-006**: Los mismos datos y la misma fecha producen siempre la misma edad, el mismo orden de historiales y el mismo estado de alerta (`REQ-PET-002`, `INV-SORT-001`, `STATE-ALERT-001`).
- **SC-007**: Un usuario puede registrar cualquier número de mascotas, y la lista y la ficha siguen siendo navegables por teclado y sin recarga de página (`REQ-PET-001`, `REQ-UI-001`).

## Assumptions

- **Fuera de alcance v2.1.0:** recuperación de contraseña por correo, transferencia de propiedad de mascotas o de hogares, roles de edición compartida, notificaciones push, despliegue Cloud (fase posterior), y edición o borrado de registros históricos (`REQ-REC-*` solo permiten alta en v2.x).
- **Trade-offs aceptados:** (a) el bloqueo de `INV-AUTH-005` permite a un tercero bloquear durante 15 minutos a un `username` conocido; (b) `ERR-AUTH-USER-NOT-FOUND` revela a un usuario autenticado si un `username` existe (`INV-HOUSE-003`), porque invitar a un usuario inexistente debe poder distinguirse.
- **Despliegue.** La fase actual es local (`127.0.0.1`), sin exposición a la red; la fase Cloud es posterior y no forma parte de esta feature (constitución, «Technology Stack & Repository Structure»).
- **Contratos.** Ante una diferencia entre la prosa de este documento y un contrato formal de `contracts/` de esta feature, prevalece el contrato (constitución, principio I).
