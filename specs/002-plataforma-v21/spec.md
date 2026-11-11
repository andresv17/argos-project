# Feature Specification: Plataforma ARGOS v2.1 (cuentas, roles, hogares con asignación, multi-especie y auditoría)

**Feature Branch**: `002-plataforma-v21`

**Created**: 2026-11-10

**Status**: APPROVED (2026-11-10). Aprobada por Neo (Andrés Vallejo, Nivel 2) tras la auditoría F5 40/40

**Input**: Especificación Técnica de UI/UX y Pantallas v2.1 ("Argos - Especificación Técnica de UI_UX y Pantallas"), contrastada con la Feature 001 (v1.0.0, aprobada) y resuelta con las decisiones de Neo (Nivel 2) del 2026-11-10: D1–D6 (hoja de ruta) y 1A–7B (clarificación F2).

**Relación con la Feature 001**: esta feature evoluciona la 001 sin editarla. Un requisito de la 001 que sigue vigente conserva su identificador. Un requisito que cambia recibe un identificador nuevo (sufijo `2` o prefijo nuevo) y declara a cuál reemplaza (sección «Trazabilidad con la Feature 001»). Los contratos formales se definen en F4 y declaran lo que reemplazan con `supersedes` en `x-sdd-metadata`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cuenta segura y sesión con inactividad (Priority: P1)

Una persona crea su cuenta con una contraseña fuerte, completa su perfil (nombre visible, correo opcional, idioma, zona horaria para mostrar), puede cambiar su contraseña, y su sesión se cierra sola tras 30 minutos sin actividad o 24 horas desde que inició. Recargar la página no la desconecta; cerrar sesión la revoca al instante.

**Why this priority**: Es la puerta de entrada de todo lo demás y endurece la seguridad que la 001 dejó en 8 caracteres y 7 días de sesión.

**Independent Test**: Registrar un usuario con una contraseña que incumple cada regla (debe rechazarse) y otra válida; iniciar sesión con una cuenta antigua de 8 caracteres (debe entrar); avanzar el reloj 31 minutos sin actividad (la sesión expira) y 24 horas con actividad continua (expira); recargar a los 10 minutos (sigue activa).

**Acceptance Scenarios**:

1. **Given** una persona en el registro, **When** envía una contraseña de 9 caracteres, o sin mayúscula, sin número o sin símbolo, **Then** se rechaza con el error de contraseña débil y no se crea la cuenta.
2. **Given** una cuenta creada en la 001 con contraseña de 8 caracteres, **When** inicia sesión con la contraseña correcta, **Then** entra (el inicio de sesión no aplica la política).
3. **Given** una sesión activa, **When** pasan 30 minutos sin ninguna petición autenticada, **Then** la siguiente petición responde sesión no autenticada y la sesión queda en `EXPIRED_IDLE`.
4. **Given** una sesión con actividad continua, **When** se cumplen 24 horas desde su creación, **Then** expira aunque haya actividad reciente.
5. **Given** una sesión activa, **When** la persona cierra sesión, **Then** la credencial deja de funcionar de inmediato en cualquier pestaña.
6. **Given** el perfil, **When** la persona guarda un `timezone` IANA válido, **Then** las horas se muestran en esa zona pero el día civil de alertas, edades y fechas no futuras sigue calculándose con `APP_TIMEZONE`.

---

### User Story 2 - Permisos por rol en un hogar compartido (Priority: P2)

Un hogar tiene roles reales: Administrador de Hogar, Cuidador y Lector, además del Propietario Legal de cada mascota. El Cuidador registra pesos, eventos sanitarios y medidas, pero no edita el perfil básico ni elimina la mascota. El Lector solo consulta. El Administrador gestiona miembros y datos básicos según la matriz.

**Why this priority**: Convierte los hogares de «solo mirar» (001) en colaboración real, que es el valor central de la v2.1.

**Independent Test**: Una prueba de matriz completa que, para cada rol y cada acción del cuadro de permisos, afirma el resultado esperado en el servidor, más un e2e con tres usuarios (dueño, cuidador, lector) en contextos de navegador separados.

**Acceptance Scenarios**:

1. **Given** un Cuidador de un hogar donde la mascota está asignada, **When** registra un peso o un evento sanitario, **Then** se guarda; **When** intenta editar el nombre de la mascota o eliminarla, **Then** recibe acceso denegado y la interfaz ni siquiera muestra esas acciones.
2. **Given** un Lector, **When** intenta cualquier escritura, **Then** recibe acceso denegado; sí puede consultar, y exportar e importar el respaldo de sus propias mascotas (operación de cuenta, `REQ-RBAC-001`).
3. **Given** un Administrador de Hogar, **When** edita los datos básicos de una mascota asignada al hogar, **Then** se guarda; **When** intenta eliminarla o transferirla, **Then** recibe acceso denegado.
4. **Given** un Administrador, **When** intenta expulsar o degradar al propietario del hogar, o cambiar su propio rol, **Then** se rechaza.
5. **Given** una invitación con `roleOnJoin = CAREGIVER`, **When** el invitado acepta, **Then** queda `ACTIVE` con ese rol.
6. **Given** una persona que no puede ver una mascota, **When** la pide por identificador, **Then** responde como inexistente (nunca revela que existe).

---

### User Story 3 - Compartir solo las mascotas que el dueño elige y transferirlas (Priority: P3)

El Propietario Legal decide a qué hogares asigna cada mascota. Solo las asignadas se comparten. Puede transferir la propiedad de una mascota a otro miembro activo de un hogar donde esté asignada, de forma inmediata.

**Why this priority**: Sin relación mascota-hogar la matriz de roles no tiene dónde aplicarse (decisión 5B), y evita la pérdida de datos al borrar cuentas.

**Independent Test**: Asignar una de dos mascotas a un hogar con otro miembro: ese miembro ve solo esa. Transferir la propiedad: el nuevo dueño edita, el anterior pasa a su rol del hogar y los registros conservan su historial.

**Acceptance Scenarios**:

1. **Given** un dueño con dos mascotas y un hogar con otro miembro, **When** asigna solo la mascota A, **Then** el otro miembro ve A y no ve B.
2. **Given** un usuario que es Cuidador en un hogar y Lector en otro, y la misma mascota está asignada a ambos hogares, **When** consulta la mascota, **Then** su rol efectivo es el mayor de los dos (Cuidador).
3. **Given** el Propietario Legal, **When** transfiere la mascota a un miembro `ACTIVE` de un hogar donde está asignada, **Then** la propiedad cambia de inmediato, los 6 tipos de registro pasan al nuevo dueño y se audita la operación.
4. **Given** un destinatario que no es miembro `ACTIVE` de un hogar con esa mascota, **When** se intenta transferir, **Then** se rechaza.
5. **Given** un dueño que desasigna la mascota de un hogar, **When** un miembro de ese hogar la consulta, **Then** responde como inexistente.
6. **Given** datos de la 001 con hogares compartidos, **When** se aplica la migración, **Then** cada mascota queda asignada a todos los hogares comunes de su dueño, así que nadie pierde la visibilidad que tenía, y los antiguos miembros pasan a Lector.

---

### User Story 4 - Mascotas de varias especies con peso adecuado (Priority: P4)

La persona registra perros, gatos, conejos, hurones, aves, reptiles, pequeños mamíferos u otra especie. Para especies distintas de perro y gato acepta pesos desde 1 gramo con tres decimales.

**Why this priority**: Amplía el producto de 2 especies a 8 (decisión D3) y cierra el hueco de las especies pequeñas (decisión 7B).

**Independent Test**: Crear una mascota por cada especie; registrar 0.030 kg en un ave (válido) y en un perro (inválido); migrar datos antiguos `DOG`/`CAT`.

**Acceptance Scenarios**:

1. **Given** el formulario de mascota, **When** elige cualquiera de las 8 especies, **Then** se guarda; si elige `OTHER`, puede indicar el nombre de la especie.
2. **Given** un ave, **When** registra 0.030 kg, **Then** se guarda con tres decimales; **Given** un perro, **When** registra 0.030 kg, **Then** `ERR-REC-WEIGHT-OUT-OF-RANGE`.
3. **Given** una persona que solo conoce la edad aproximada, **When** la ingresa en años y meses, **Then** el sistema guarda una fecha de nacimiento marcada como estimada y calcula la edad con la regla de siempre.
4. **Given** una especie distinta de perro y gato, **When** se muestran alertas, **Then** las vacunas y desparasitaciones se evalúan igual, pero no hay alertas automáticas de peso ni de edad hasta que existan reglas clínicas aprobadas.
5. **Given** una base con `DOG` y `CAT`, **When** se migra, **Then** pasan a `CANINE` y `FELINE` sin pérdida.

---

### User Story 5 - Registros clínicos completos e historial inmutable (Priority: P5)

Al registrar vacunas y desparasitaciones, la persona anota lote, veterinario y colegiado, y decide si requiere próxima dosis. Un registro ya reemplazado por uno posterior no se puede modificar; se corrige registrando uno nuevo. Los reemplazados se ven en un acordeón aparte.

**Why this priority**: Es la integridad clínica que pide la v2.1 §5.3, pero depende de P1–P3 para los permisos.

**Independent Test**: Registrar dos vacunas de la misma clave; el primero queda `SUPERSEDED` y su edición se rechaza; borrar el segundo devuelve el primero a vigente.

**Acceptance Scenarios**:

1. **Given** una vacuna «Rabia» registrada, **When** se registra otra «Rabia» posterior, **Then** la primera aparece en el acordeón de reemplazados con el texto «Reemplazada por registro posterior».
2. **Given** un registro cuyo estado calculado es `SUPERSEDED`, **When** alguien intenta editarlo, **Then** se rechaza con `ERR-REC-SUPERSEDED-IMMUTABLE`.
3. **Given** que el registro posterior se elimina (con permiso), **When** se recalcula, **Then** el anterior vuelve a estar vigente y se puede editar.
4. **Given** un registro sin próxima dosis, **When** se evalúa el semáforo, **Then** no genera alerta.
5. **Given** una desparasitación, **When** se registra, **Then** indica si es interna o externa; el veterinario y su colegiado se guardan en campos separados y opcionales.

---

### User Story 6 - Registro de auditoría de cambios (Priority: P6)

Cada creación, edición o borrado de datos deja una huella: cuándo, quién, qué tipo de cambio y una firma del estado antes y después, sin guardar secretos.

**Why this priority**: Requisito de trazabilidad de la v2.1 §5.3; no cambia lo que ve el usuario, pero respalda a las demás historias.

**Independent Test**: Ejecutar una mutación de cada tipo y comprobar que se crea exactamente una fila; serializar el mismo estado con claves en distinto orden y verificar el mismo hash; buscar contraseñas, tokens o cookies en las filas (no debe haber).

**Acceptance Scenarios**:

1. **Given** cualquier mutación exitosa, **When** termina, **Then** existe una fila de auditoría con `timestamp` UTC, `executorUserId`, `mutationType`, `previousStateHash` y `newStateHash`.
2. **Given** una mutación fallida o revertida, **When** termina, **Then** no queda fila de auditoría.
3. **Given** una cuenta eliminada, **When** se consulta la auditoría, **Then** su identificador de usuario aparece solo como un HMAC-SHA256 con el secreto de la aplicación (`REQ-AUD-001`; también en `entityId` de la fila de eliminación), sin nombre ni correo, y el mismo usuario eliminado produce siempre el mismo hash dentro de una instalación.

---

### User Story 7 - Respaldo v3 y eliminación de cuenta con salvaguardas (Priority: P7)

La persona descarga un respaldo de sus mascotas (formato 3.0.0), puede restaurarlo (acepta 1.0.0, 2.0.0 y 3.0.0) con previsualización y reemplazo atómico, y puede eliminar su cuenta solo después de transferir o desasignar lo que afecte a otros.

**Why this priority**: Cierra el ciclo de datos del usuario y la protección contra mascotas huérfanas, pero se apoya en P2 y P3.

**Independent Test**: Exportar con un Lector sin mascotas (archivo válido, sin mascotas); importar un respaldo 1.0.0 y uno 2.0.0 (migran); forzar fallo en la importación (estado anterior idéntico byte a byte); intentar eliminar la cuenta con una mascota compartida (bloqueada) y luego de transferirla (permitida).

**Acceptance Scenarios**:

1. **Given** cualquier usuario autenticado, **When** exporta, **Then** el archivo contiene solo las mascotas de las que es Propietario Legal, nunca datos de otros, hogares, sesiones ni credenciales.
2. **Given** un archivo 1.0.0, 2.0.0 o 3.0.0 válido, **When** se importa, **Then** se muestra la previsualización (conteos y colisiones con datos propios) y, tras confirmar, reemplaza atómicamente los datos del usuario.
3. **Given** cualquier fallo en la importación, **When** termina, **Then** los datos previos quedan idénticos byte a byte.
4. **Given** un usuario propietario único de un hogar con otros miembros `ACTIVE`, **When** intenta eliminar su cuenta, **Then** se bloquea hasta que transfiera el hogar o lo vacíe o elimine. Si es el único miembro `ACTIVE`, el hogar se elimina en cascada con la cuenta (membresías, invitaciones y asignaciones).
5. **Given** un usuario con mascotas asignadas a hogares con otros miembros `ACTIVE`, **When** intenta eliminar su cuenta, **Then** se bloquea hasta transferir o desasignar esas mascotas; las no compartidas se eliminan en cascada.
6. **Given** que no hay bloqueos, **When** el usuario descarga el respaldo (el servidor emite el token de confirmación), escribe `ELIMINAR MI CUENTA`, confirma con su contraseña y presenta el token vigente, **Then** la cuenta, sus mascotas, registros, membresías y sesiones se eliminan.
7. **Given** un token de confirmación caducado, ya usado, ajeno o ausente, **When** se intenta eliminar la cuenta, **Then** se rechaza sin cambios (`ERR-ACCOUNT-CONFIRMATION-MISMATCH`).

---

### User Story 8 - Interfaz alineada con la v2.1 (Priority: P8)

La navegación, el directorio, las insignias de propiedad y el perfil siguen la v2.1, adaptados a lo aprobado (login por `username`, sin SSO ni correo), con accesibilidad verificada a 320, 768, 1024 y 1280 px.

**Why this priority**: Es la capa visible; se construye sobre las reglas de P1–P7.

**Independent Test**: E2E y axe-core a los cuatro anchos; pruebas de que cada rol ve solo las acciones que la matriz permite.

**Acceptance Scenarios**:

1. **Given** una pantalla de 1024 px, **When** la persona abre el menú del avatar, **Then** ve «Perfil» y «Cerrar sesión».
2. **Given** una pantalla de 320 px, **When** navega, **Then** ve la barra inferior con Mascotas, Hogares, Respaldo y Perfil, cada zona táctil de al menos 48 × 48 px.
3. **Given** el directorio, **When** filtra, **Then** dispone de Todos, Perros, Gatos, Otros y Con alertas sanitarias, con búsqueda con espera de 300 ms.
4. **Given** una mascota ajena, **When** se muestra, **Then** lleva «Dueño: [Nombre]» con su color; el Lector además ve «Solo lectura». Las acciones que su rol no permite no existen en la interfaz.
5. **Given** la importación, **When** corre, **Then** la barra muestra fases (Validando, Previsualizando, Aplicando, Terminada o Revertida), no un porcentaje.

---

### Edge Cases

- Una cuenta de la 001 con contraseña de 8 caracteres inicia sesión, pero al cambiarla debe cumplir la política nueva.
- Un usuario en dos hogares con roles distintos sobre la misma mascota: rol efectivo = el mayor; el dueño siempre manda.
- El propietario del hogar es expulsado, degradado o abandona: bloqueado por `INV-HOUSE2-001` (amplía `INV-HOUSE-001`).
- Un miembro es retirado o abandona un hogar: pierde de inmediato la visibilidad de las mascotas asignadas por ese hogar (la mascota sigue visible si otro hogar común la comparte).
- Un dueño de mascotas es expulsado de un hogar, o abandona: se retiran sus asignaciones a ese hogar, de modo que ninguna mascota queda asignada a un hogar en el que su dueño no es miembro `ACTIVE`.
- Se transfiere la propiedad de una mascota: se podan sus asignaciones a hogares donde el nuevo dueño no es miembro `ACTIVE` (decisión del arquitecto, regla por defecto más segura, ver `REQ-OWN-001`).
- El dueño abandona un hogar: no deja huérfana a ninguna mascota; solo se retiran sus asignaciones a ese hogar (el mismo efecto aplica si lo expulsan, ver `REQ-HOUSE2-002`).
- Se elimina un hogar: se borran sus membresías y asignaciones; las mascotas no se tocan.
- Transferir una mascota a quien ya tiene una mascota con el mismo microchip: la unicidad es por propietario, así que se rechaza solo si hay colisión con sus propias mascotas.
- Importar un respaldo cuyos identificadores pertenecen a otro usuario: se rechaza (`INV-BACKUP-001`).
- Importar con reemplazo elimina las asignaciones mascota-hogar de las mascotas reemplazadas; las importadas quedan sin asignar.
- Peso de 0.0005 kg en un ave (3 decimales exigidos): se rechaza; 0.001 es válido.
- Registro sin próxima dosis: sin alerta; con próxima dosis anterior o igual a la aplicación: se rechaza.
- Editar un registro `SUPERSEDED` siendo Administrador o dueño: se rechaza igual (la inmutabilidad no depende del rol).
- Hay 31 minutos de inactividad pero se recarga: la sesión ya expiró y pide iniciar sesión.
- Dos pestañas: cerrar sesión en una invalida la otra en su próxima petición.
- Zona horaria del perfil distinta de `APP_TIMEZONE`: un evento «de hoy» se decide con `APP_TIMEZONE`; la hora mostrada usa la del perfil.
- Eliminar cuenta sin haber descargado un respaldo (sin token), o con el token caducado (10 min) o ya usado: el servidor rechaza la eliminación y el botón sigue deshabilitado; descargar otro respaldo emite un token nuevo.
- Payload mayor de 10 MB o JSON malformado: rechazo sin cambios.

## Requirements *(mandatory)*

### Functional Requirements

Cada requisito tiene un identificador inmutable. Las invariantes (`INV-*`) y las máquinas de estado (`STATE-*`) son requisitos verificables del mismo nivel que los `REQ-*`. Los nombres de errores nuevos son provisionales hasta que F4 fije el catálogo. «Vigente» significa que el requisito de la 001 se mantiene sin cambios y conserva su identificador.

**Cuentas, perfil y sesión**

- **REQ-AUTH2-001** (Registro de Usuario; reemplaza `REQ-AUTH-001`): Crea una cuenta con `username` (3–30 chars, `^[a-z0-9._-]+$`, en minúsculas), `displayName` (1–60 chars, sin espacios extremos), `password` y `confirmPassword` iguales, y `email` opcional (formato válido; no se verifica ni se envía correo). **Decisión del arquitecto (H-F5-08):** un `username` con mayúsculas se **rechaza** (`ERR-SCHEMA-VALIDATION-FAILED`) y no se normaliza en silencio, para que lo que la persona escribe sea lo que se guarda y no existan dos formas del mismo nombre; el inicio de sesión aplica la misma comparación exacta. El `email` **no es único** ni identifica a nadie: no se usa para iniciar sesión ni para invitar, y exigir unicidad crearía un canal de enumeración de cuentas (`INV-AUTH-006`). La contraseña cumple `INV-AUTH2-001`. Tras registrarse inicia sesión automáticamente. Salida: `SessionView` + credencial de sesión.
- **REQ-AUTH2-002** (Inicio de Sesión; reemplaza `REQ-AUTH-002`): Verifica `username` + `password`. La contraseña solo debe ser no vacía y de máximo 128 caracteres (sin política). Crea una sesión con `STATE-AUTH-SESSION-001` v2 (`INV-AUTH2-002`). Error genérico y tiempo uniforme ante usuario inexistente o contraseña incorrecta (`INV-AUTH-006`).
- **REQ-AUTH2-003** (Cambio de Contraseña): Con sesión activa, exige la contraseña actual y una nueva que cumpla `INV-AUTH2-001`. Revoca las demás sesiones del usuario y conserva la actual.
- **REQ-AUTH-003** (Cierre de Sesión): Vigente. Revoca la sesión; idempotente.
- **REQ-AUTH-004** (Sesión Actual): Vigente. Devuelve `UserPublicProfile` o `ERR-AUTH-UNAUTHENTICATED`. El perfil público añade `email`, `preferredLanguage` y `timezone` solo para el propio usuario; nunca el correo de otro.
- **REQ-ACC-001** (Perfil de Usuario): Edita `displayName`, `email` (opcional), `preferredLanguage` (conjunto cerrado de etiquetas: `es`, `en`, `pt`; valor por defecto `es`, que es el idioma de la interfaz actual; `en` y `pt` son los idiomas de mayor uso esperado y cualquier otro se amplía en la 003) y `timezone` (IANA válida). El `timezone` solo afecta cómo se muestran las horas (`REQ-TIME-001`).
- **REQ-ACC-002** (Eliminación de Cuenta): Permite eliminar la cuenta propia si, y solo si: (1) el usuario no es propietario de un hogar con otros miembros `ACTIVE` (debe transferirlo, vaciarlo o eliminarlo); si es el **único** miembro `ACTIVE` de un hogar (N-5), el hogar se elimina en cascada con la cuenta, junto con sus membresías, invitaciones y asignaciones; (2) ninguna mascota suya está asignada a un hogar con otros miembros `ACTIVE` (debe transferirla o desasignarla), (3) escribe literalmente `ELIMINAR MI CUENTA`, (4) confirma con su contraseña actual, y (5) presenta un **token efímero de confirmación** (N-2) emitido por el servidor al generar el respaldo JSON de la cuenta (`REQ-BACKUP2-001`): de un solo uso, ligado al usuario y con caducidad de **10 minutos** (tiempo suficiente para guardar el archivo y completar el formulario, y corto para que el respaldo sea reciente); un token nuevo invalida el anterior, y un token caducado, usado, ajeno o ausente se rechaza con `ERR-ACCOUNT-CONFIRMATION-MISMATCH`. La interfaz deshabilita el botón hasta tener el token, pero la verificación es del servidor. Elimina en una transacción la cuenta, sus mascotas con sus 6 colecciones, sus asignaciones, membresías, invitaciones, sesiones, el token y los hogares del caso (1). La auditoría conserva solo el HMAC-SHA256 del `userId` (`REQ-AUD-001`). Errores: `ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD`, `ERR-ACCOUNT-OWNS-SHARED-PETS`, `ERR-ACCOUNT-CONFIRMATION-MISMATCH`.
- **REQ-TIME-001** (Día Civil y Zona Horaria): El día civil de alertas, edades y fechas no futuras se calcula con la `APP_TIMEZONE` única de la aplicación (`ClockPort.todayIsoDate()`); las marcas de tiempo se serializan en UTC. El `timezone` del perfil solo formatea horas para mostrar y nunca altera un cálculo ni un estado.

**Mascotas**

- **REQ-PET2-001** (Registro y Edición de Perfil; reemplaza `REQ-PET-001`): Crea o edita una mascota con `name` (1–50), `species` (`CANINE`, `FELINE`, `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER`), `speciesOther` (1–60, obligatorio solo con `OTHER`), `breed` (1–60), `birthDate`, `birthDateIsEstimate` (booleano), `sex`, `neutered` opcional, `microchipId` opcional (`^\d{15}$`, único por propietario) y `avatarUrl` opcional (≤ 2048). La edad estimada ingresada en años y meses se convierte a `birthDate` con `birthDateIsEstimate = true`. `ownerUserId` es el usuario autenticado y solo cambia con `REQ-OWN-001`. Sin límite de cantidad. La edición exige el permiso «Editar datos básicos» (`REQ-RBAC-001`).
- **REQ-PET2-002** (Listado de Mis Mascotas; reemplaza `REQ-PET-005`): Lista las mascotas propias y las visibles por asignación a hogares (`REQ-HOUSE2-004`), con edad, peso más reciente, semáforo global (el estado más grave entre sus vacunas y desparasitaciones; orden de gravedad `OVERDUE` > `DUE_SOON` > `UP_TO_DATE`; los `SUPERSEDED` y los registros sin próxima fecha no cuentan; una mascota sin registros evaluables no muestra insignia global) y contadores de alertas. Orden: `name` ASC (comparación `localeCompare` con locale `es`, sensibilidad `base`), desempate por `createdAt` ASC e `id` ASC (regla heredada de la `REQ-PET-005` de la 001, ahora definida aquí). Filtros: texto (con las reglas de normalización D-03), Todos, Perros (`CANINE`), Gatos (`FELINE`), Otros (resto) y Con alertas sanitarias.
- **REQ-PET2-003** (Ficha Técnica; reemplaza `REQ-PET-003`): Devuelve perfil, edad, dueño y las 6 colecciones con el orden de `INV-SORT-001`, más los permisos del usuario sobre cada acción (reemplaza `canEdit`) y los registros `SUPERSEDED` separados de los vigentes. Aísla 100 % los datos de esa mascota.
- **REQ-PET-002** (Cálculo Determinista de Edad): Vigente.
- **REQ-PET-004** (Eliminación de Mascota): Vigente, ahora condicionado a la matriz: solo el Propietario Legal. Se elimina también su asignación a hogares.
- **REQ-OWN-001** (Transferencia de Propiedad Legal): El Propietario Legal transfiere la mascota a otro usuario que sea miembro `ACTIVE` de un hogar al que la mascota está asignada. Es inmediata (sin aceptación del destinatario; el doble paso queda para la 003). Los 6 tipos de registro pasan al nuevo dueño; el dueño anterior conserva el rol que tenga en cada hogar; las asignaciones se conservan salvo las de hogares donde el nuevo dueño no sea miembro `ACTIVE`, que se podan en la misma transacción (**decisión del arquitecto**, regla por defecto más segura: mantiene el invariante «el dueño de una mascota es miembro `ACTIVE` de todo hogar donde está asignada» y evita compartir con un hogar al que el nuevo dueño no pertenece); la microchip no debe chocar con las mascotas del destinatario. Se audita. Errores: `ERR-ACC-FORBIDDEN`, `ERR-OWN-TRANSFER-INVALID-TARGET`.

**Registros clínicos y biométricos**

- **REQ-REC2-001** (Control de Peso; reemplaza `REQ-REC-001`): Registra `weightKg` con la serie y `deltaKg` exacto respecto a la medición anterior (la primera devuelve `null`). Rango por especie en `INV-REC2-002`. `deltaKg` se calcula en la unidad entera más fina de la especie (centésimas para `CANINE`/`FELINE`, milésimas para las demás) sin redondeo.
- **REQ-REC2-002** (Vacunación y Desparasitación; reemplaza `REQ-REC-003` y `REQ-REC-004`): Registra `category` (`VACCINE` o `DEWORMING`; en `DEWORMING`, `dewormingType` = `INTERNAL` o `EXTERNAL`, como en la 001), el nombre (`vaccineName` en vacunas, `productBrand` en desparasitaciones; 1–100), `appliedAt`, la próxima fecha opcional (`nextBoosterAt` en vacunas, `nextSuggestedDoseAt` en desparasitaciones; en esta spec se nombra de forma genérica «próxima fecha»), `batchOrClinic` opcional (≤ 120), `veterinarianName` opcional (≤ 120), `veterinarianLicense` opcional (≤ 60) y `notes`. **«Requiere próxima dosis» es un indicador de la interfaz derivado, no un campo persistido:** requiere próxima dosis si y solo si la próxima fecha no es nula. Si la persona marca que la requiere, la fecha es obligatoria; si no la marca, la fecha es nula. Se aplican `INV-REC-004` (`nextBoosterAt > appliedAt`), `INV-REC-005` (`nextSuggestedDoseAt > appliedAt`) y `INV-REC-006` (textos no vacíos, incluido `vaccineName`). Un registro con próxima fecha nula no entra en la evaluación del semáforo. Maggie valida los campos clínicos en F4.
- **REQ-REC2-003** (Historial Inmutable de Reemplazados): Un registro cuyo estado calculado es `SUPERSEDED` (`STATE-ALERT-001`) no se puede editar (`ERR-REC-SUPERSEDED-IMMUTABLE`), con cualquier rol. Solo se supera registrando uno nuevo de la misma clave. Eliminar el registro posterior (con permiso) devuelve el anterior a vigente. No existe un vínculo persistido `supersedesId` (ver «Decisión sobre `supersedesId`»).
- **REQ-REC-002** (Medidas Corporales), **REQ-REC-005** (Citas y Controles) y **REQ-REC-006** (Parámetros Adicionales): Vigentes en contenido; los permisos de escritura pasan a la matriz de `REQ-RBAC-001`.

**Roles, hogares y asignación**

- **REQ-RBAC-001** (Matriz de Permisos): La función pura `can(rol, acción)` decide cada acción con el rol efectivo del usuario sobre la mascota (Propietario Legal, o el mayor rol de membresía `ACTIVE` entre los hogares donde la mascota está asignada: `ADMIN` > `CAREGIVER` > `READER`). Matriz (S = sí, N = no):

  | Acción | Propietario Legal | Admin Hogar | Cuidador | Lector |
  |---|---|---|---|---|
  | Editar datos básicos de la mascota | S | S | N | N |
  | Eliminar expediente de la mascota | S | N | N | N |
  | Registrar y editar eventos sanitarios | S | S | S | N |
  | Eliminar eventos sanitarios | S | S | N | N |
  | Añadir y editar pesos y medidas corporales | S | S | S | N |
  | Registrar y editar citas médicas y parámetros adicionales | S | S | N | N |
  | Eliminar cualquier otro registro (peso, medidas, citas, parámetros) | S | S | N | N |
  | Invitar, expulsar y cambiar rol de miembros del hogar (acción sobre el hogar; aquí la primera columna es «Propietario del hogar») | S | S | N | N |
  | Transferir propiedad legal de una mascota | S | N | N | N |
  | Asignar y desasignar mascotas a hogares | S | N | N | N |
  | Exportar e importar respaldo (de cuenta, solo sobre mascotas propias; `REQ-BACKUP2-001/002`) | S | S | S | S |

  **Lectura de las dos filas de hogar y de cuenta (cierra H-F5-02, N-4):**
  - *Invitar, expulsar y cambiar rol* es una acción sobre el hogar, no sobre una mascota. Su primera columna es el **propietario del hogar** (quien lo creó o lo recibió por `TRANSFER_OWNERSHIP`), que siempre tiene rol `ADMIN`: puede en cualquier caso. Un `ADMIN` que no es propietario del hogar también puede, salvo expulsar o degradar al propietario del hogar o cambiar su propio rol (`REQ-HOUSE2-002`). Cuidador y Lector no pueden. Ser Propietario Legal de una mascota no concede por sí solo esta acción.
  - *Exportar e importar respaldo* es una operación de cuenta, no de hogar: los cuatro roles (incluido el Lector) pueden, **siempre y solo sobre las mascotas propias** del usuario. El reemplazo es atómico y no toca mascotas ajenas ni hogares; las mascotas importadas entran sin asignaciones a hogares. **Excepción declarada frente a la v2.1 §5.2** (decisión N-4 de Neo): la v2.1 no concede importar al Lector; esta spec lo permite porque el Lector solo reemplaza sus propios datos y no obtiene ningún acceso a datos ajenos.
  - Las filas de «Eliminar...» y las de citas y parámetros siguen la regla por defecto aceptada por Neo (la más restrictiva coherente con la matriz).
- **REQ-HOUSE-001** (Crear Hogar) y **REQ-HOUSE-003** (Responder Invitación): Vigentes. El creador queda `ACTIVE`, con rol `ADMIN` y condición de propietario del hogar.
- **REQ-HOUSE2-001** (Invitar Miembro; reemplaza `REQ-HOUSE-002`): El propietario del hogar o un `ADMIN` invita por `username` indicando `roleOnJoin` (`ADMIN`, `CAREGIVER` o `READER`). La invitación guarda el rol. No se invita por correo.
- **REQ-HOUSE2-002** (Gestionar Membresías; reemplaza `REQ-HOUSE-004`): El propietario del hogar o un `ADMIN` cancela invitaciones, expulsa y cambia el rol de miembros (`CHANGE_ROLE`); un miembro abandona el hogar (`LEFT`). Cuando un miembro es expulsado (`REMOVED`) o abandona (`LEFT`), se retiran también las asignaciones a ese hogar de las mascotas de las que es Propietario Legal; la expulsión y el abandono tienen el mismo efecto sobre las asignaciones. Un `ADMIN` no puede expulsar ni degradar al propietario del hogar ni cambiar su propio rol. Solo el propietario del hogar ejecuta `TRANSFER_OWNERSHIP` (el destinatario es un miembro `ACTIVE`; el anterior conserva `ADMIN`) o elimina el hogar. Eliminar el hogar borra sus membresías, invitaciones y asignaciones; las mascotas no se ven afectadas. Si el propietario del hogar elimina su cuenta siendo el único miembro `ACTIVE`, el hogar se elimina en cascada con la cuenta con el mismo efecto (N-5, `REQ-ACC-002`); si hay otros miembros `ACTIVE`, la eliminación de la cuenta se bloquea hasta transferir la propiedad (`TRANSFER_OWNERSHIP`) o eliminar el hogar.
- **REQ-HOUSE2-003** (Asignación Mascota–Hogar): El Propietario Legal asigna o desasigna sus mascotas a hogares donde es miembro `ACTIVE` (muchos a muchos). «Hogar base» al crear una mascota es una asignación inicial opcional. Solo las mascotas asignadas se comparten.
- **REQ-HOUSE2-004** (Vista de Hogar; reemplaza `REQ-HOUSE-005`): Devuelve las mascotas **asignadas** al hogar, cada una con `owner = { userId, displayName, colorToken }` (`INV-HOUSE-005`), el rol efectivo del usuario y sus permisos. Orden: dueño por `firstJoinedAt` ASC y `userId` ASC, y luego el orden de `REQ-PET2-002` (regla heredada de la `REQ-HOUSE-005` de la 001, ahora definida aquí). Muestra a cada miembro con `displayName`, `username` y rol; nunca su correo.
- **REQ-MIG-001** (Migración de Datos desde la 001): Transforma una base de la 001 sin pérdida: `DOG`→`CANINE`, `CAT`→`FELINE`; membresía `OWNER`→`ADMIN` + propietario del hogar, `MEMBER`→`READER`; una asignación por cada hogar común de cada dueño (conserva la visibilidad actual); todas las sesiones existentes se revocan, por lo que no necesitan `lastActivityAt` (si el esquema lo exige no nulo, se rellena con `createdAt` sin significado funcional). Es repetible sin duplicar (idempotente).

**Auditoría**

- **REQ-AUD-001** (Registro de Auditoría de Mutaciones): Toda creación, edición, borrado, cambio de rol, asignación, transferencia o eliminación de cuenta que termine con éxito registra, en la misma transacción, `timestamp` (UTC), `executorUserId`, `mutationType`, `entityType`, `entityId`, `previousStateHash` y `newStateHash` (`null` en creación o borrado). `previousStateHash` y `newStateHash` son SHA-256 **sin clave** sobre JSON canónico (claves ordenadas) de la vista pública de la entidad (`SC-012`); no usan el secreto de abajo. Nunca se guardan contraseñas, hashes de contraseña, tokens ni cookies. Al eliminar la cuenta (N-1), `executorUserId` (y solo este campo, en todas las filas donde aparezca ese usuario) se reemplaza por `HMAC-SHA256(secreto, userId)` en hexadecimal. El secreto es único de la aplicación, **no** una sal por usuario, y vive solo en configuración de despliegue: la variable de entorno `ARGOS_AUDIT_HMAC_SECRET` (nombre provisional, fijado en F4), leída únicamente en `src/infrastructure/config/` (`INV-ARCH-006`) y validada contra el esquema de configuración (mínimo 32 bytes de entropía). Nunca se guarda en la base de datos ni en los respaldos ni se registra en logs. **Si falta o es inválida, la aplicación no arranca en producción**; en desarrollo y pruebas se admite un valor fijo de prueba explícito. Rotar el secreto impide correlacionar hashes anteriores: se documenta como decisión operativa. **`entityId` en la eliminación de cuenta (N-A, opción elegida: HMAC, sin excepción):** la fila `ACCOUNT_DELETE` guarda `entityId = HMAC-SHA256(secreto, userId)` con el mismo secreto y formato que `executorUserId`, de modo que ambos campos coinciden y no existe ningún `userId` en claro; se elige el HMAC y no una excepción en `SC-014` porque mantiene un solo mecanismo y cumple «sin identificadores en claro». Por la misma razón, al eliminar la cuenta se reemplaza también por su HMAC cualquier `entityId` que sea el `userId` eliminado (filas con `entityType = USER`); las demás entidades usan identificadores propios (`petId`, `householdId`, etc.) que no contienen el `userId`.
**Filas por mutación (H-F5-05).** Regla general: **una fila por operación del usuario, sobre la entidad raíz afectada; las entidades hijas o en cascada de esa misma operación no generan fila propia.** Excepción única: las asignaciones podadas generan una fila cada una, porque cambian lo que ven terceros. Aplicación: (1) transferencia de propiedad (`REQ-OWN-001`, `TRANSFER_OWNERSHIP` de hogar): 1 fila `OWNERSHIP_TRANSFER` sobre la mascota (`PET`) o el hogar (`HOUSEHOLD`), más 1 fila `UNASSIGN` (`PET_ASSIGNMENT`) por cada asignación podada; (2) eliminación de cuenta (`REQ-ACC-002`): 1 fila `ACCOUNT_DELETE` (`USER`); las mascotas, registros, membresías, invitaciones, sesiones, token y hogares en cascada no generan fila; (3) importación por reemplazo (`REQ-BACKUP2-002`): 1 fila `IMPORT` (`USER`, `entityId` = `userId`), con `previousStateHash` y `newStateHash` sobre el JSON canónico de las mascotas propias del usuario con sus 6 colecciones antes y después; (4) migración de respaldo: la conversión de un respaldo `1.0.0` o `2.0.0` ocurre dentro de la importación y **no** genera fila propia (es la misma fila `IMPORT`); la migración de base de datos de `REQ-MIG-001` genera 1 fila `MIGRATION` por ejecución (`SYSTEM`, `entityId` = identificador de la versión de migración, `executorUserId` = `SYSTEM`, hashes `null`), sin filas por entidad. Las sesiones y los tokens de confirmación no se auditan.
**Valores cerrados.** `mutationType`: `CREATE`, `UPDATE` (incluye cambios de estado de membresía e invitación: aceptar, rechazar, cancelar, abandonar, expulsar), `DELETE`, `ROLE_CHANGE` (`CHANGE_ROLE`), `ASSIGN`, `UNASSIGN`, `OWNERSHIP_TRANSFER`, `IMPORT`, `MIGRATION`, `ACCOUNT_DELETE`. `entityType`: `USER`, `PET`, `WEIGHT_RECORD`, `BODY_MEASUREMENT`, `VACCINATION_RECORD`, `DEWORMING_RECORD`, `APPOINTMENT_RECORD`, `CUSTOM_PARAMETER`, `HOUSEHOLD`, `HOUSEHOLD_MEMBERSHIP`, `HOUSEHOLD_INVITATION`, `PET_ASSIGNMENT`, `SYSTEM`. F4 los fija en el esquema como enumeraciones.
Retención y puerto de auditoría: F4.

**Respaldo y restauración**

- **REQ-BACKUP2-001** (Exportación de Cuenta; reemplaza `REQ-BACKUP-001`): Serializa **solo** las mascotas de las que el usuario es Propietario Legal y sus 6 colecciones en un sobre `schemaVersion: "3.0.0"` validado contra su esquema. Nunca incluye datos de otros usuarios, hogares, asignaciones, sesiones ni credenciales. Un usuario sin mascotas propias obtiene un archivo válido sin mascotas. Pueden exportar los cuatro roles de hogar (N-4). Al terminar la generación, el servidor emite el token efímero de confirmación de `REQ-ACC-002` (10 minutos, un solo uso) y lo entrega junto con el archivo.
- **REQ-BACKUP2-002** (Importación Atómica por Reemplazo; reemplaza `REQ-BACKUP-002`): Valida el archivo (≤ 10 MB) y todas las invariantes; acepta `1.0.0`, `2.0.0` y `3.0.0` (migra las anteriores, con `DOG`/`CAT` a `CANINE`/`FELINE`). Antes de aplicar muestra una previsualización (conteos por entidad y colisiones solo contra los datos propios) y exige confirmación explícita. El único modo es el reemplazo atómico: sustituye los datos del usuario autenticado en una sola transacción; ante cualquier fallo el estado previo queda intacto byte a byte. No hay modo Merge (Feature 003). Pueden importar los cuatro roles de hogar (N-4), con efecto solo sobre las mascotas propias del usuario: el reemplazo no afecta a mascotas ajenas, hogares ni membresías. Las mascotas importadas quedan con `ownerUserId` = usuario actual y sin asignaciones a hogares.
- **INV-BACKUP-001** (Atomicidad e Integridad del Backup): Vigente.
- **STATE-BACKUP-001**: Vigente; ahora también reconoce el sobre `3.0.0`. La previsualización no persiste nada.

**Interfaz y experiencia de usuario**

- **REQ-UI-001** (Selector de Contexto y Mascotas), **REQ-UI-002** (Vistas Históricas y Evolución de Peso), **REQ-UI-003** (Semáforo de Alertas Sanitarias) y **REQ-UI-005** (Pantallas de Registro e Inicio de Sesión): Vigentes. El semáforo añade para `SUPERSEDED` el texto «Reemplazada por registro posterior».
- **REQ-UI2-001** (App Shell y Navegación; aporta a `REQ-UI-001`): Escritorio (≥ 768 px): encabezado con Mascotas, Hogares (insignia de invitaciones pendientes) y Respaldo, y a la derecha el `displayName` y un menú del avatar con «Perfil» (`/cuenta`) y «Cerrar sesión». Móvil (< 768 px): barra superior compacta y barra inferior con Mascotas, Hogares, Respaldo y Perfil, zonas táctiles ≥ 48 × 48 px. Se conserva el contador neutro de hogares.
- **REQ-UI2-002** (Directorio de Mascotas): Cumple `REQ-PET2-002` con búsqueda con espera de 300 ms, grilla de 1, 2 o 3 columnas y estados vacío y de carga.
- **REQ-UI2-003** (Distinción Visual del Dueño; reemplaza `REQ-UI-007`): Toda mascota ajena muestra «Dueño: [Nombre]» con su `colorToken` (mapeo de los 8 tonos de la v2.1 a `OWNER_COLOR_1..8`, contraste ≥ 4.5:1 con texto blanco). El Lector además ve «Solo lectura». Las acciones que la matriz niega no existen en la interfaz; la validación real sigue en el servidor.
- **REQ-UI2-004** (Perfil y Zona de Peligro): Pantalla `/cuenta` con datos de perfil, cambio de contraseña y la zona de peligro con el flujo de `REQ-ACC-002`. Sin cuentas vinculadas (SSO fuera de alcance).
- **REQ-UI2-005** (Gestión de Hogares con Roles; reemplaza `REQ-UI-006`): Crear hogar, invitar por `username` con rol, cambiar rol, expulsar, abandonar, transferir y eliminar hogar, y asignar o desasignar mascotas, con insignia de rol por miembro.
- **REQ-UI2-006** (Formularios Clínicos): Formularios de evento sanitario (con lote, veterinario y colegiado) y de peso (decimales según especie), visibles solo si el rol los permite; el acordeón «Registros anteriores / Reemplazados» separa los `SUPERSEDED`.
- **REQ-UI2-007** (Centro de Respaldos): Exportar e importar con selección por arrastre, previsualización y barra de fases (Validando, Previsualizando, Aplicando, Terminada o Revertida); sin porcentaje, porque no existe estado parcial.
- **REQ-UI2-008** (Diseño Responsivo y Accesible; reemplaza `REQ-UI-004`): Verificación a 320, 768, 1024 y 1280 px, WCAG 2.1 AA, sin depender solo del color; cero violaciones `critical`/`serious` de axe-core.

**Invariantes de dominio nuevas y modificadas**

- **INV-AUTH2-001** (Política de Contraseña; reemplaza `INV-AUTH-002`): Al registrar o cambiar: `10 <= length <= 128`, al menos una mayúscula, un número y un símbolo. La longitud se cuenta en caracteres Unicode (puntos de código), sin recortar ni normalizar la cadena. Mayúscula: letra Unicode de categoría `Lu`. Número: dígito ASCII `0-9`. **Símbolo:** uno de estos 32 caracteres ASCII: ``! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~``; el espacio no cuenta como símbolo. El inicio de sesión no la aplica. Error: `ERR-AUTH-WEAK-PASSWORD`.
- **INV-AUTH2-002** (Vigencia de Sesión; reemplaza `INV-AUTH-004`): Válida si no fue revocada, `ahora < createdAt + 24 h` y `ahora < lastActivityAt + 30 min`. Cada petición autenticada válida renueva `lastActivityAt`. Error: `ERR-AUTH-UNAUTHENTICATED`.
- **INV-PET2-001** (Especie Soportada): `species` pertenece a las 8 aprobadas; `speciesOther` solo con `OTHER`. Error: `ERR-SCHEMA-VALIDATION-FAILED`.
- **INV-REC2-002** (Rango de Peso por Especie; reemplaza `INV-REC-002`): `CANINE` y `FELINE`: `0.05 <= weightKg <= 150.00`, máx. 2 decimales. Resto: `0.001 <= weightKg <= 150.000`, máx. 3 decimales; El mínimo (0.001) y los decimales están decididos; **la cota superior de 150 kg es provisional** y se delega a Maggie, que fija en F4 la tabla definitiva por especie (sin cambiar esta spec). Error: `ERR-REC-WEIGHT-OUT-OF-RANGE`.
- **INV-OWN2-001** (Propiedad Única; reemplaza `INV-OWN-001`): Toda mascota tiene exactamente un `ownerUserId`; solo cambia con `REQ-OWN-001`.
- **INV-ACC2-001** (Autorización de Lectura; reemplaza `INV-ACC-001`): `U` lee la mascota `P` si `P.ownerUserId == U.id` o existe un hogar `H` con `P` asignada y `U` miembro `ACTIVE`. Si no, se responde como inexistente (`ERR-PET-NOT-FOUND`).
- **INV-ACC2-002** (Autorización de Escritura; reemplaza `INV-ACC-002`): Cada escritura exige `can(rol efectivo, acción)`. Si `U` puede leer pero la matriz lo niega → `ERR-ACC-FORBIDDEN`; si no puede leer → `ERR-PET-NOT-FOUND`.
- **INV-HOUSE2-001** (Propietario Único del Hogar; amplía `INV-HOUSE-001`): Exactamente un propietario del hogar `ACTIVE`, con rol `ADMIN`; solo cambia con `TRANSFER_OWNERSHIP`.
- **INV-AUD-001** (Auditoría Sin Secretos): Ninguna fila de auditoría ni salida contiene contraseña, hash de contraseña, token ni cookie; el hash es independiente del orden de claves.
- **Vigentes sin cambio**: `INV-AUTH-001`, `INV-AUTH-003`, `INV-AUTH-005`, `INV-AUTH-006`, `INV-AUTH-007`, `INV-PET-002`, `INV-PET-003`, `INV-PET-005`, `INV-PET-006`, `INV-HOUSE-003`, `INV-HOUSE-004` (ahora sobre mascotas asignadas), `INV-HOUSE-005`, `INV-REC-001`, `INV-REC-003`, `INV-REC-004` y `INV-REC-005` (solo cuando existe la fecha opcional), `INV-REC-006`, `INV-SORT-001`.

**Máquinas de estado**

- **STATE-ALERT-001**: Vigente. `SUPERSEDED` sigue calculándose (registro posterior de la misma clave); un registro sin fecha objetivo queda fuera de la evaluación.
- **STATE-AUTH-SESSION-001** v2 (reemplaza la 001): `ANONYMOUS` → `AUTHENTICATED` → `EXPIRED_IDLE` | `EXPIRED` (tope de 24 h) | `LOGGED_OUT`. `LOGOUT` sigue idempotente en cualquier estado.
- **STATE-HOUSE-MEMBERSHIP-001** v2 (reemplaza la 001): añade el rol por membresía y los eventos `CHANGE_ROLE` y `TRANSFER_OWNERSHIP`; el resto de estados y transiciones se conservan. Transiciones nuevas: (a) `CHANGE_ROLE`: `ACTIVE(rol A)` → `ACTIVE(rol B)`, ejecutada por el propietario del hogar o un `ADMIN`; el destino no es el propietario del hogar ni el propio ejecutor; no aplica a membresías que no estén `ACTIVE`. (b) `TRANSFER_OWNERSHIP`: ejecutada por el propietario del hogar sobre un miembro `ACTIVE` que no lo sea; en una sola transacción el destino pasa a propietario con rol `ADMIN` y el anterior queda `ADMIN` sin condición de propietario (se mantiene exactamente un propietario, `INV-HOUSE2-001`). F4 formaliza el contrato de la máquina.

### Decisión sobre `supersedesId`

**Se calcula, no se persiste.** Mantener `SUPERSEDED` como estado calculado (`STATE-ALERT-001`) evita migrar datos y un vínculo manual que pueda quedar inconsistente, y la inmutabilidad se logra rechazando la edición del registro calculado como reemplazado (`REQ-REC2-003`), tal como recomendó la auditoría C-16.

### Trazabilidad con la Feature 001

| Requisito de la 001 | Estado en la 002 |
|---|---|
| `REQ-AUTH-001`, `REQ-AUTH-002` | Reemplazados por `REQ-AUTH2-001`, `REQ-AUTH2-002` |
| `REQ-AUTH-003`, `REQ-AUTH-004` | Vigentes |
| `REQ-PET-001`, `REQ-PET-003`, `REQ-PET-005` | Reemplazados por `REQ-PET2-001`, `REQ-PET2-003`, `REQ-PET2-002` |
| `REQ-PET-002`, `REQ-PET-004` | Vigentes (el segundo condicionado a la matriz) |
| `REQ-REC-001`, `REQ-REC-003`, `REQ-REC-004` | Reemplazados por `REQ-REC2-001`, `REQ-REC2-002` |
| `REQ-REC-002`, `REQ-REC-005`, `REQ-REC-006` | Vigentes (permisos por matriz) |
| `REQ-HOUSE-001`, `REQ-HOUSE-003` | Vigentes |
| `REQ-HOUSE-002`, `REQ-HOUSE-004`, `REQ-HOUSE-005` | Reemplazados por `REQ-HOUSE2-001`, `REQ-HOUSE2-002`, `REQ-HOUSE2-004` |
| `REQ-BACKUP-001`, `REQ-BACKUP-002` | Reemplazados por `REQ-BACKUP2-001`, `REQ-BACKUP2-002` |
| `REQ-UI-001/002/003/005` | Vigentes |
| `REQ-UI-004`, `REQ-UI-006`, `REQ-UI-007` | Reemplazados por `REQ-UI2-008`, `REQ-UI2-005`, `REQ-UI2-003` |
| `INV-AUTH-002`, `INV-AUTH-004` | Reemplazadas por `INV-AUTH2-001`, `INV-AUTH2-002` |
| `INV-REC-002`, `INV-OWN-001`, `INV-ACC-001`, `INV-ACC-002` | Reemplazadas por `INV-REC2-002`, `INV-OWN2-001`, `INV-ACC2-001`, `INV-ACC2-002` |
| `INV-HOUSE-001` | Ampliada por `INV-HOUSE2-001` |
| `INV-HOUSE-002` | Gestión de miembros: absorbida por `REQ-HOUSE2-001` y `REQ-HOUSE2-002` (propietario o `ADMIN`), y por la fila «Invitar, expulsar y cambiar rol» de `REQ-RBAC-001`. Eliminar el hogar: queda solo para el propietario (`REQ-HOUSE2-002`). El error `ERR-ACC-FORBIDDEN` se mantiene |
| `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001` | Versión 2 |
| `STATE-ALERT-001`, `STATE-BACKUP-001`, `INV-BACKUP-001` | Vigentes |

**IDs nuevos sin equivalente en la 001**: `REQ-AUTH2-003`, `REQ-ACC-001`, `REQ-ACC-002`, `REQ-TIME-001`, `REQ-OWN-001`, `REQ-REC2-003`, `REQ-RBAC-001`, `REQ-HOUSE2-003`, `REQ-MIG-001`, `REQ-AUD-001`, `REQ-UI2-001`, `REQ-UI2-002`, `REQ-UI2-004`, `REQ-UI2-006`, `REQ-UI2-007`, `INV-PET2-001`, `INV-AUD-001`.

### Fuera de alcance (Feature 003)

SSO (Google, Apple, SAML), recuperación de acceso y envío de correos, invitaciones por correo, adjuntos PDF y subida de archivos, importación Merge, transferencia en dos pasos, JWT sin estado, día civil por usuario, color por hash de `user_id`, persistir `supersedesId`, unicidad global de microchip, despliegue Cloud.

### Key Entities *(include if feature involves data)*

- **Usuario** (`UserPublicProfile`): `username` único, `displayName`, `email` opcional, `preferredLanguage`, `timezone`, `lastActivityAt` de sesión. Contrato: `identity.schema.json` v2.
- **Sesión** (`SessionView`): `createdAt`, `lastActivityAt`, tope de 24 h e inactividad de 30 min. Máquina `STATE-AUTH-SESSION-001` v2.
- **Mascota** (`PetProfile`): 8 especies, `speciesOther`, `birthDateIsEstimate`, `microchipId` opcional. Un Propietario Legal; propiedad transferible solo por operación explícita.
- **Asignación Mascota–Hogar**: relación muchos a muchos creada por el Propietario Legal; define qué se comparte.
- **Registros históricos**: 6 colecciones; vacunación y desparasitación con lote, veterinario y colegiado; peso con precisión por especie.
- **Alerta sanitaria** (`AlertStatus`): calculada; `SUPERSEDED` no persiste vínculos.
- **Hogar** y **Membresía**: rol por membresía (`ADMIN`, `CAREGIVER`, `READER`), propietario del hogar, `roleOnJoin`.
- **Entrada de auditoría**: `timestamp`, `executorUserId` (o su HMAC-SHA256 tras eliminar la cuenta), `mutationType`, `entityType`, `entityId`, `previousStateHash`, `newStateHash`.
- **Sobre de respaldo** (`BackupEnvelopeV3`, más lectura de V1 y V2): mascotas propias y sus colecciones. Contrato: `backup-envelope.schema.json` 3.0.0.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (vigente): Una persona nueva completa registro → sesión → cierre de sesión → nuevo inicio de sesión sin ayuda con la política de contraseña nueva (`REQ-UI-005`, `REQ-AUTH2-001`).
- **SC-002** (vigente): El 100 % de los requisitos, invariantes, máquinas de estado y errores vigentes de la 002 tiene al menos una implementación y una prueba que los citan por identificador.
- **SC-003** (vigente, ampliado): Cero accesos cruzados: ningún usuario obtiene ni modifica datos de otro sin membresía `ACTIVE` y asignación que lo permitan, en la batería de seguridad con todos los roles (`INV-ACC2-001`, `INV-ACC2-002`).
- **SC-004** (vigente): Tras una importación fallida, los datos anteriores quedan idénticos byte a byte en el 100 % de los casos probados (`REQ-BACKUP2-002`).
- **SC-005** (vigente, ampliado): Todas las pantallas son utilizables a 320, 768, 1024 y 1280 px con cero violaciones críticas o serias de accesibilidad (`REQ-UI2-008`).
- **SC-006** (vigente): Los mismos datos y la misma fecha producen siempre la misma edad, el mismo orden y el mismo estado de alerta, independientemente del `timezone` del perfil (`REQ-TIME-001`).
- **SC-007** (vigente): Un usuario registra cualquier número de mascotas y la lista y la ficha siguen navegables por teclado y sin recarga.
- **SC-008**: La prueba de matriz cubre las 11 filas × 4 roles de `REQ-RBAC-001` (44 casos) y el 100 % coincide con el servidor y con las acciones visibles en la interfaz.
- **SC-009**: Una sesión expira el 100 % de las veces a los 30 min de inactividad y a las 24 h absolutas, con reloj controlado, y recargar la página dentro de la vigencia no la cierra.
- **SC-010**: El 100 % de las contraseñas que incumplen `INV-AUTH2-001` se rechaza al registrar o cambiar, y el 100 % de las cuentas con contraseña válida de la 001 sigue iniciando sesión.
- **SC-011**: La migración desde una base de la 001 conserva el 100 % de las mascotas, registros y visibilidades (cada miembro ve las mismas mascotas que antes) y es repetible sin duplicar.
- **SC-012**: Cada mutación exitosa genera exactamente una fila de auditoría; ninguna fila contiene secretos; el hash es idéntico para el mismo estado con distinto orden de claves.
- **SC-013**: Los pesos se aceptan o rechazan correctamente en los límites de cada especie (0.05 y 0.001 inclusivos, por debajo rechazados) con verificación por propiedades.
- **SC-014**: Eliminar la cuenta con hogar o mascotas compartidas queda bloqueado el 100 % de las veces hasta transferir o desasignar, y una eliminación válida no deja datos del usuario ni identificadores en claro en la auditoría: `executorUserId` y el `entityId` de la fila `ACCOUNT_DELETE` quedan como HMAC-SHA256 con el secreto de la aplicación (idéntico para el mismo usuario, no reversible sin el secreto), la aplicación no arranca en producción sin `ARGOS_AUDIT_HMAC_SECRET`, y una eliminación sin token de confirmación vigente (caducado a los 10 min, usado, ajeno o ausente) se rechaza el 100 % de las veces. Si el usuario era el único miembro `ACTIVE` de un hogar, el hogar desaparece en cascada.
- **SC-015**: Editar un registro `SUPERSEDED` se rechaza el 100 % de las veces con cualquier rol.
- **SC-016** (`REQ-OWN-001`): En la batería de transferencia, el 100 % de las transferencias a un miembro `ACTIVE` de un hogar con la mascota asignada cambia el dueño de la mascota y de sus 6 tipos de registro en una sola transacción, genera una fila de auditoría y poda las asignaciones a hogares donde el nuevo dueño no es miembro; el 100 % de las transferencias a un destino no válido se rechaza sin cambios.
- **SC-017** (`REQ-HOUSE2-003`): Un miembro de un hogar ve exactamente las mascotas asignadas a él y ninguna otra en el 100 % de los casos de asignar, desasignar, expulsar, abandonar y eliminar hogar; asignar a un hogar donde el dueño no es miembro `ACTIVE` se rechaza el 100 % de las veces.

## Assumptions

- **Decisiones aprobadas por Neo** (no se reabren): D1 `username` como login e invitación, correo opcional sin envío; D2 sesión de 30 min de inactividad y 24 h absolutas; D3 ocho especies con migración DOG→CANINE y CAT→FELINE y lectura de respaldos 1.0.0 y 2.0.0; D4 matriz de permisos §5.2; D5 SSO, recuperación por correo y adjuntos PDF a la 003; D6 eliminación de cuenta bloqueada; 1A contraseña 10–128 con mayúscula, número y símbolo (login sin política); 2A respaldo de cuenta con solo mascotas propias; 3A solo reemplazo atómico en la 002 (Merge en la 003); 4A una sola `APP_TIMEZONE`; 5B asignación explícita mascota-hogar con migración de la visibilidad actual; 6A eliminación de cuenta bloqueada hasta transferir o desasignar; 7B peso mínimo 0.001 kg con 3 decimales para especies distintas de perro y gato.
- **Criterios por defecto aceptados por Neo**: los miembros actuales migran a Lector; la transferencia de propiedad es inmediata; permisos de consultas, parámetros y medidas según la matriz (regla más restrictiva coherente).
- **Resueltas por regla de consistencia (clase b)**: el creador del hogar es su propietario con rol Admin (puede haber más Admin); microchip único por propietario, no global; edad estimada como `birthDate` + indicador; los JSON de ejemplo de la v2.1 son ilustrativos (camelCase y rutas de los contratos, la contraseña viaja por TLS y se hashea en el servidor, sin `terms_accepted` hasta que exista un texto de términos); color del dueño por posición (`INV-HOUSE-005`); el avatar abre «Perfil» en escritorio; 768 px se añade a la verificación (con enmienda de la constitución, N-3); `full_name` equivale a `displayName`.
- **Campos opcionales de la v2.1 P-07**: `neutered` y `microchipId` se incorporan como campos aditivos opcionales de la mascota.
- **Tabla de Maggie**: el mínimo de 0.001 kg y los 3 decimales están decididos; el máximo por especie y la validación clínica de los campos de eventos los entrega Maggie como parte de los contratos en F4, sin cambiar esta especificación.
- **Sin alertas automáticas de peso ni de edad geriátrica** para especies distintas de perro y gato hasta que existan reglas clínicas aprobadas.
- **Constitución** (N-3): requiere enmienda Nivel 2 de la constitución (DOG|CAT → 8 especies; TTL de sesión → 24 h absolutas con 30 min de inactividad; verificación de diseño 320/1024/1280 px más 768 px); la enmienda se prepara en la tarea B y la firma Neo. Borrador: `.specify/memory/audits/enmienda-constitucion-002-borrador.md`. Si F2b (iconos Lucide o Heroicons) o F4 detectan una dependencia de Nivel 2 nueva, se escala a Neo en esa fase.
- **Despliegue**: sigue siendo local (`127.0.0.1`, API en el puerto 3100); la fase Cloud no forma parte de esta feature.
- **Contratos**: ante una diferencia entre esta prosa y un contrato formal de `specs/002-plataforma-v21/contracts/` (a definir en F4), prevalece el contrato.
- **Código compartido**: `src/` es común a las features; las pruebas de la 001 que afirmen reglas reemplazadas se sustituyen según la hoja de ruta, sin editar los documentos de la 001.

## Open Questions

Todas las preguntas de la clarificación F2 (C-02, C-08, C-11, C-12, C-13, C-15, C-18) tienen respuesta de Neo, y `supersedesId` se resolvió en este documento. Las cinco preguntas de la auditoría F5 de `/mouse` (N-1 a N-5) **quedan resueltas** con la decisión de Neo (Nivel 2) del 2026-11-10:

- **N-1 resuelta (A)**: el `executorUserId` de una cuenta eliminada se guarda como HMAC-SHA256 con un secreto de la aplicación en configuración de despliegue (`ARGOS_AUDIT_HMAC_SECRET`, nombre provisional), nunca en base de datos ni en respaldo; no es una sal por usuario. `previousStateHash` y `newStateHash` siguen siendo SHA-256 sin clave (`REQ-AUD-001`, US6 AC3, `SC-012`, `SC-014`).
- **N-2 resuelta (A)**: el servidor exige un token efímero de confirmación, emitido al descargar el respaldo, de un solo uso y con caducidad de 10 minutos (`REQ-ACC-002` punto 5, `REQ-BACKUP2-001`, `SC-014`).
- **N-3 resuelta (A)**: la 002 requiere enmendar la constitución antes de aprobarse; el borrador está en `.specify/memory/audits/enmienda-constitucion-002-borrador.md` y la firma Neo (Assumptions).
- **N-4 resuelta (B)**: los cuatro roles de hogar exportan e importan a nivel de cuenta, solo sobre mascotas propias, con reemplazo atómico y sin asignaciones a hogares; excepción declarada frente a la v2.1 §5.2 (`REQ-RBAC-001`, `REQ-BACKUP2-002`).
- **N-5 resuelta (A)**: si el usuario es el único miembro `ACTIVE` de un hogar, el hogar se elimina en cascada con la cuenta; con otros miembros `ACTIVE`, la eliminación se bloquea (`REQ-ACC-002`, `REQ-HOUSE2-002`).

Queda un único requisito previo a la aprobación: la firma de Neo sobre la enmienda de la constitución (N-3). Spec APPROVED (2026-11-10).

Neo puede objetar cualquier regla por defecto o decisión del arquitecto durante la revisión.
