---
document_id: SPEC-ARGOS-001
version: 2.2.0
status: REVIEW
feature: pet-health-tracker
supersedes: 2.1.0
change_type: MINOR
approved_by: Andrés Vallejo, 2026-11-05
spec_review: .specify/checklists/spec-review.md (re-auditoría v2.2.0 pendiente de firma)
contracts_ref:
  - contracts/schemas/identity.schema.json
  - contracts/schemas/pet.schema.json
  - contracts/schemas/medical-records.schema.json
  - contracts/schemas/backup-envelope.schema.json
  - contracts/openapi/pet-tracker-api.openapi.yaml
  - contracts/state-machines/sanitary-alert.machine.json
  - contracts/state-machines/backup-import.machine.json
  - contracts/state-machines/auth-session.machine.json
  - contracts/state-machines/household-membership.machine.json
  - contracts/errors/error-catalog.json
  - contracts/examples/canonical-fixtures.json
---

# Especificación Funcional: Argos Pet Health & Biometric Tracker (v2.2.0)

## 0. Registro de cambios respecto a v1.0.0
| Cambio | Detalle | IDs afectados |
| :--- | :--- | :--- |
| Eliminado el cupo fijo | Ya no existe el límite de 4 mascotas (2 `DOG` + 2 `CAT`). Número ilimitado de mascotas por usuario. | Retirados: `INV-PET-001`, `INV-PET-004`, `STATE-PET-QUOTA-001`, `ERR-PET-QUOTA-EXCEEDED` |
| Eliminación de mascotas | Nueva operación de borrado con cascada atómica. | Nuevos: `REQ-PET-004`, `INV-PET-005` |
| Cuentas de usuario | Registro, login, logout y sesión. | Nuevos: `REQ-AUTH-*`, `INV-AUTH-*`, `STATE-AUTH-SESSION-001`, `ERR-AUTH-*` |
| Propiedad y hogares | Cada mascota tiene dueño; hogares compartidos con invitación aceptada. | Nuevos: `REQ-HOUSE-*`, `INV-OWN-001`, `INV-ACC-*`, `INV-HOUSE-*`, `STATE-HOUSE-MEMBERSHIP-001`, `ERR-HOUSE-*`, `ERR-ACC-FORBIDDEN` |
| **v2.2.0 (MINOR): resolución del reporte del Desarrollador (D-01…D-12) y defectos de contratos.** Visibilidad de hogar: un `INVITED` recibe `404` y el `OWNER` ve las membresías `INVITED` en `members` (D-01); `INV-AUTH-006` se verifica con espía sobre `PasswordHasherPort`, sin umbral temporal (D-02); búsqueda por `q` sin distinguir tildes (D-03); `LOGOUT` idempotente (D-04); re-invitación como evento `INVITE` con fila nueva (D-05); referencias de catálogo corregidas (D-09); `STATE-ALERT-001` sin estado inicial transitorio; esquemas explícitos para registros v1 del respaldo; `finalState` documentado como regla de la máquina de importación. | `INV-HOUSE-004`, `REQ-PET-005`, `INV-AUTH-006`, `REQ-AUTH-003`, `REQ-HOUSE-002`, `REQ-HOUSE-003`, `STATE-ALERT-001`, `STATE-BACKUP-001`, `STATE-AUTH-SESSION-001`, `STATE-HOUSE-MEMBERSHIP-001`, `ERR-AUTH-INVALID-CREDENTIALS`, `ERR-AUTH-CSRF-REJECTED`, §4, §5 |
| Correcciones de auditoría | Regla de edad en fin de mes / 29-feb, `birthDate` vs. registros existentes, `createdAt` canónico, zona horaria, nombres de estados de backup alineados al contrato, `ERR-BACKUP-ATOMIC-ROLLBACK` documentado, propagación de errores de dominio en importación. | `REQ-PET-002`, `INV-PET-006`, `INV-SORT-001`, `STATE-BACKUP-001`, `INV-BACKUP-001` |
| Respaldo por usuario | El respaldo exporta/importa solo los datos del usuario autenticado; sobre v2.0.0 con migración desde v1.0.0. | `REQ-BACKUP-001`, `REQ-BACKUP-002`, `INV-BACKUP-001` |
| **v2.1.0 (MINOR): correcciones tras auditoría de contratos.** Precedencia de validación en frontera y mapa campo→código (C1); bloqueo de login con ventana deslizante, reinicio en éxito y tiempo uniforme (C2, anti-enumeración); `finalState: ROLLED_BACK` en todo error de importación que termina en rollback (C3; la máquina de backup se transcribe completa); `colorToken` solo en contexto de hogar (C4); una fila por invitación, `firstJoinedAt` y borrado físico de hogar (C5); redondeo de deltas (C13); edición y borrado de registros fuera de alcance. | `INV-AUTH-005`, `INV-AUTH-006` (nuevo), `INV-HOUSE-005`, `REQ-AUTH-002`, `REQ-HOUSE-003`, `REQ-HOUSE-004`, `REQ-HOUSE-005`, `REQ-REC-001`, `REQ-UI-002`, `REQ-UI-004`, `STATE-BACKUP-001`, `STATE-HOUSE-MEMBERSHIP-001`, §5.1 (nuevo), `ERR-HOUSE-MEMBERSHIP-NOT-FOUND` (nuevo) |

**Justificación de SemVer (v2.2.0, MINOR).** Los cambios de visibilidad y de máquinas se fijan antes de implementación y sin datos persistidos en producción; el cambio es MINOR por la misma razón que v2.1.0. Si se implementara v2.1.0 antes de aprobar v2.2.0, el cambio pasaría a MAJOR con migración.

**Justificación de SemVer (MINOR, no MAJOR), v2.1.0.** `HouseholdMember` gana `membershipId` y `firstJoinedAt` como campos obligatorios y nuevos. No es un cambio incompatible porque no existe implementación ni datos persistidos de la v2.0.0: la v1.0.0 no tiene hogares y la v2.0.0 no se ha implementado. Ningún consumidor ni migración depende de la forma anterior. Si esa premisa cambiara antes de la implementación, el cambio pasa a MAJOR con estrategia de migración (`spec-system.md` §1).

## 1. Contexto y Alcance (What & Why)
Plataforma web para la gestión clínica, biométrica y sanitaria de mascotas (`DOG` | `CAT`) **sin límite de cantidad**, usada por **varios usuarios** con cuenta propia. Cada usuario es dueño de sus mascotas y de sus historiales. Un usuario puede crear **hogares** e invitar a otros usuarios; cuando la invitación es aceptada, todos los miembros activos ven las mascotas de todos los miembros, con indicación visual inequívoca del dueño de cada una. Solo el dueño puede crear, editar o eliminar sus mascotas y registros.

El sistema calcula la edad y el estado de vacunas/desparasitaciones con reglas deterministas e inyección de reloj (`ClockPort`), y permite respaldar/restaurar los datos del usuario de forma atómica en JSON.

**Fuera de alcance v2.1.0:** recuperación de contraseña por correo, transferencia de propiedad de mascotas o de hogares, roles de edición compartida, notificaciones push, despliegue Cloud (fase posterior), y edición o borrado de registros históricos (`REQ-REC-*` solo permiten alta en v2.x).

**Trade-offs aceptados:** (a) el bloqueo de `INV-AUTH-005` permite a un tercero bloquear durante 15 minutos a un `username` conocido; (b) `ERR-AUTH-USER-NOT-FOUND` revela a un usuario autenticado si un `username` existe (`INV-HOUSE-003`), porque invitar a un usuario inexistente debe poder distinguirse.

## 2. Requisitos Funcionales (`REQ-XXX`)

### 2.1 Cuentas y Sesión (`REQ-AUTH`)
| ID | Nombre | Descripción Determinista | Entradas | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-AUTH-001` | Registro de Usuario | Crea una cuenta con `username` (3–30 chars, `^[a-z0-9._-]+$`, almacenado en minúsculas), `displayName` (1–60 chars, sin espacios extremos) y `password` (8–128 chars, al menos 1 letra y 1 dígito). Tras registrarse, inicia sesión automáticamente. | `RegisterUserInput`, `ClockPort`, `IdGeneratorPort`, `PasswordHasherPort`, `SecureTokenPort` | `SessionView` + cookie `argos_session` |
| `REQ-AUTH-002` | Inicio de Sesión | Verifica `username` + `password`; si son correctos crea una sesión con expiración a 7 días (`STATE-AUTH-SESSION-001`). Error genérico ante usuario inexistente o contraseña incorrecta, con tiempo de respuesta uniforme (`INV-AUTH-006`). | `LoginInput`, `ClockPort`, `PasswordHasherPort`, `SecureTokenPort` | `SessionView` + cookie |
| `REQ-AUTH-003` | Cierre de Sesión | Revoca la sesión actual y borra la cookie. Idempotente. | Sesión actual | `204` |
| `REQ-AUTH-004` | Sesión Actual | Devuelve el usuario autenticado (`UserPublicProfile`) o `ERR-AUTH-UNAUTHENTICATED`. | Cookie | `SessionView` |

### 2.2 Perfiles de Mascotas (`REQ-PET`)
| ID | Nombre | Descripción Determinista | Entradas | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-PET-001` | Registro y Edición de Perfil | Crea o actualiza una mascota del usuario autenticado con `name` (1–50), `species` (`DOG` \| `CAT`), `breed` (1–60), `birthDate` (`YYYY-MM-DD`), `sex` (`MALE` \| `FEMALE`) y `avatarUrl` opcional (≤ 2048). `ownerUserId` = usuario autenticado; no es editable. **Sin límite de cantidad ni de especie.** | `CreatePetInput` / `UpdatePetInput`, `ClockPort`, `IdGeneratorPort` | `PetProfile` |
| `REQ-PET-002` | Cálculo Determinista de Edad | Calcula `{ years, months, totalDays }` entre `birthDate` y `ClockPort.todayIsoDate()`. `years`/`months` cuentan aniversarios completos; si el día de nacimiento no existe en el mes evaluado (29-feb, día 31), el aniversario cae en el **último día** de ese mes. Ej.: `2024-02-29` → `2025-02-28` = `{1, 0, 365}`; `2026-01-31` → `2026-02-28` = `{0, 1, 28}`. | `birthDate`, `currentDate` | `ComputedAge` |
| `REQ-PET-003` | Ficha Técnica Individual | Devuelve el perfil, la edad, el dueño (`owner`) y las 6 colecciones ordenadas (`INV-SORT-001`) con resumen de alertas activas, aislando 100% los datos de esa mascota. Accesible para el dueño y para miembros activos de un hogar compartido con el dueño (`INV-ACC-001`); `canEdit = true` solo para el dueño. | `petId`, sesión, `ClockPort` | `PetDashboardView` |
| `REQ-PET-004` | Eliminación de Mascota | El dueño elimina una mascota y, en la misma transacción, sus 6 colecciones (`INV-PET-005`). La UI exige confirmación escribiendo el nombre de la mascota. Operación irreversible (se recomienda exportar respaldo antes). | `petId`, sesión | `204` |
| `REQ-PET-005` | Listado de Mis Mascotas | Lista todas las mascotas del usuario autenticado con edad, peso más reciente y contadores de alertas, ordenadas por `name` ASC (comparación `localeCompare` con locale `es`, sensibilidad `base`), desempate por `createdAt` ASC e `id` ASC. Sin paginación obligatoria; filtro opcional por texto en `name` y por `species`. El filtro de texto no distingue mayúsculas ni tildes: ambas cadenas se normalizan a NFD y se eliminan las marcas combinantes (`\p{M}`) antes de comparar por subcadena (D-03). | sesión, `ClockPort`, filtros opcionales | `PetCardView[]` |

### 2.3 Registros Históricos (`REQ-REC`)
Todas las operaciones de escritura exigen que el usuario autenticado sea el dueño de la mascota (`INV-ACC-002`).

| ID | Nombre | Descripción Determinista | Campos Obligatorios y Rangos | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-REC-001` | Control de Peso | Registra un peso en kg y devuelve la serie cronológica con `deltaKg` respecto a la medición inmediata anterior. `deltaKg` es la diferencia exacta en centésimas de kg, sin redondeo; la primera medición devuelve `null`. | `recordedAt` (`YYYY-MM-DD`), `weightKg` (`0.05`–`150.00`, máx. 2 decimales), `notes` opcional (≤ 1000) | `WeightEntryView` |
| `REQ-REC-002` | Medidas Corporales | Registra 4 dimensiones en cm. | `recordedAt`, `neckCm`, `chestCm`, `backLengthCm`, `waistCm` (cada una `1.00`–`250.00`, máx. 2 decimales), `notes` opcional | `BodyMeasurementRecord` |
| `REQ-REC-003` | Vacunación | Registra una dosis y su próximo refuerzo; calcula `STATE-ALERT-001`. | `appliedAt`, `vaccineName` (1–100), `nextBoosterAt`, `batchOrClinic` opcional (≤ 120), `notes` opcional | `VaccinationEntryView` |
| `REQ-REC-004` | Desparasitación | Registra aplicación `INTERNAL` \| `EXTERNAL` y próxima dosis; calcula `STATE-ALERT-001`. | `appliedAt`, `productBrand` (1–100), `dewormingType`, `nextSuggestedDoseAt`, `notes` opcional | `DewormingEntryView` |
| `REQ-REC-005` | Citas y Controles | Registra consulta con diagnóstico y tratamiento. | `visitDate`, `reason` (1–200), `diagnosis` (1–500), `treatment` (1–500), `clinicOrVet` (1–120), `observations` opcional (≤ 1000) | `MedicalVisitRecord` |
| `REQ-REC-006` | Parámetros Adicionales | Registra eventos categorizados. | `recordedAt`, `category` (`DIET_CHANGE` \| `ALLERGY` \| `SURGERY` \| `BEHAVIOR` \| `OTHER`), `title` (1–120), `description` (1–1000), `notes` opcional | `CustomParameterRecord` |

### 2.4 Hogares Compartidos (`REQ-HOUSE`)
| ID | Nombre | Descripción Determinista | Entradas | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-HOUSE-001` | Crear Hogar | Cualquier usuario crea un hogar con `name` (1–60). El creador queda como miembro `OWNER` en estado `ACTIVE`. Un usuario puede pertenecer a varios hogares. | `CreateHouseholdInput`, sesión | `HouseholdView` |
| `REQ-HOUSE-002` | Invitar Miembro | El `OWNER` invita a otro usuario existente por `username`. Se crea una membresía en estado `INVITED` (`STATE-HOUSE-MEMBERSHIP-001`). El invitado **no** ve ni expone datos hasta aceptar. | `InviteMemberInput`, sesión | `HouseholdMemberView` |
| `REQ-HOUSE-003` | Responder Invitación | El invitado lista sus invitaciones pendientes y las acepta (`ACTIVE`) o rechaza (`DECLINED`). Sin invitación `INVITED` responde `404` `ERR-HOUSE-INVITATION-NOT-FOUND`; nunca `403`. | `householdId`, sesión | `HouseholdMemberView` |
| `REQ-HOUSE-004` | Gestionar Membresías | El `OWNER` puede retirar a un miembro (`REMOVED`) o cancelar una invitación; un `MEMBER` puede abandonar el hogar (`LEFT`); el `OWNER` puede eliminar el hogar (borrado físico en cascada de sus membresías; las mascotas no se ven afectadas, solo deja de compartirse). Si `userId` no tiene membresía `INVITED` o `ACTIVE`, responde `404` `ERR-HOUSE-MEMBERSHIP-NOT-FOUND`. | `householdId`, `userId`, sesión | `204` |
| `REQ-HOUSE-005` | Vista de Hogar | Devuelve las mascotas de **todos los miembros `ACTIVE`** del hogar, cada una con `owner = { userId, displayName, colorToken }` (`INV-HOUSE-005`) y `canEdit` (solo `true` para las propias). Orden: dueño por `firstJoinedAt` ASC y `userId` ASC, y luego la regla de `REQ-PET-005`. `colorToken` es `null` fuera de contexto de hogar. | `householdId`, sesión, `ClockPort` | `HouseholdPetsView` |

### 2.5 Interfaz y Experiencia de Usuario (`REQ-UI`)
| ID | Nombre | Descripción Determinista | Regla de Verificación |
| :--- | :--- | :--- | :--- |
| `REQ-UI-001` | Selector de Contexto y Mascotas | Barra superior con selector de contexto (**"Mis mascotas"** + cada hogar `ACTIVE`) y lista/cuadrícula de tarjetas de mascota (especie, nombre, edad, dueño, contador de alertas `OVERDUE`/`DUE_SOON`), con filtro por nombre y especie. Escala a cualquier número de mascotas (scroll, sin pestañas fijas). | Navegación completa por teclado; patrón ARIA listbox o tablist según WAI-ARIA APG (flechas, Inicio/Fin); sin recarga de página. |
| `REQ-UI-002` | Vistas Históricas y Evolución de Peso | Pestañas por módulo en la ficha de la mascota activa, con gráfico SVG determinista y tabla de evolución con variación absoluta (kg) y porcentual respecto a la medición anterior. La variación porcentual se redondea half-away-from-zero a 2 decimales, incluidos los valores negativos, calculada sobre centésimas enteras. Formularios de alta para los 6 módulos visibles solo si `canEdit`. | Renderizado aislado para el `activePetId`. |
| `REQ-UI-003` | Semáforo de Alertas Sanitarias | Insignias Rojo (`OVERDUE`), Ámbar (`DUE_SOON`), Verde (`UP_TO_DATE`), Gris (`SUPERSEDED`) con días restantes/retraso. | Mapeo 1:1 con `STATE-ALERT-001`. |
| `REQ-UI-004` | Diseño Responsivo y Accesible | Layout adaptable a `>= 320px`, verificado a 320 px, 1024 px y 1280 px, WCAG 2.1 AA. | Cero violaciones `critical`/`serious` en `@axe-core/playwright` en todas las pantallas. |
| `REQ-UI-005` | Pantallas de Registro e Inicio de Sesión | Formularios de registro y login con validación en cliente derivada de los contratos, mensajes de error del catálogo y botón de cierre de sesión siempre visible estando autenticado. Rutas protegidas redirigen a login. | E2E: registro → sesión → logout → login. |
| `REQ-UI-006` | Gestión de Hogares | Pantalla para crear hogar, invitar por `username`, ver miembros con su estado, aceptar/rechazar invitaciones (con contador de pendientes), retirar miembros, abandonar y eliminar hogar. | E2E con 2 usuarios en contextos de navegador separados. |
| `REQ-UI-007` | Distinción Visual del Dueño | En contexto de hogar, cada tarjeta y ficha muestra el `displayName` del dueño y una insignia con su `colorToken`; las mascotas ajenas muestran "Solo lectura" y ocultan acciones de edición/eliminación. La distinción no depende solo del color (incluye texto). | E2E + axe-core (contraste ≥ 4.5:1). |

### 2.6 Respaldo y Restauración (`REQ-BACKUP`)
| ID | Nombre | Descripción Determinista | Entradas | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-BACKUP-001` | Exportación JSON del Usuario | Serializa **solo** las mascotas del usuario autenticado y sus 6 colecciones en un sobre `schemaVersion: "2.0.0"` validado contra `backup-envelope.schema.json`. Nunca incluye datos de otros usuarios, hogares, sesiones ni credenciales. | sesión, `ClockPort` | Archivo JSON descargable |
| `REQ-BACKUP-002` | Importación Atómica con Rollback | Valida el JSON (≤ 10 MB) y todas las invariantes; acepta `2.0.0` y migra `1.0.0` (`STATE-BACKUP-001`). Si es 100% válido, **reemplaza atómicamente solo los datos del usuario autenticado** (las mascotas importadas quedan con `ownerUserId` = usuario actual). Ante cualquier fallo, el estado previo queda intacto byte a byte. | Archivo JSON, sesión, `ClockPort` | `ImportBackupResult` o `ERR-*` |

## 3. Invariantes de Dominio (`INV-XXX`)

| ID | Regla Invariante | Condición Formal | Error Disparado |
| :--- | :--- | :--- | :--- |
| `INV-PET-002` | Fecha de Nacimiento No Futura | `birthDate <= ClockPort.todayIsoDate()`. | `ERR-PET-FUTURE-BIRTHDATE` |
| `INV-PET-003` | Integridad de Identidad | Todo registro (`REQ-REC-*`) referencia un `petId` existente. | `ERR-PET-NOT-FOUND` |
| `INV-PET-005` | Eliminación en Cascada Atómica | Eliminar una mascota elimina en la misma transacción todos sus registros de las 6 colecciones; tras el borrado no existe ningún registro con ese `petId`. Si falla cualquier paso, no se elimina nada. | `ERR-PET-NOT-FOUND` / `ERR-INTERNAL-UNEXPECTED` |
| `INV-PET-006` | Coherencia de `birthDate` con Historial | Al editar `birthDate`: `nuevoBirthDate <= min(fecha de evento de todos los registros de la mascota)`. | `ERR-PET-BIRTHDATE-AFTER-RECORDS` |
| `INV-OWN-001` | Propiedad Única | Toda mascota tiene exactamente un `ownerUserId` que referencia un usuario existente; `ownerUserId` es inmutable vía API. Los registros heredan la propiedad de su mascota. | `ERR-SCHEMA-VALIDATION-FAILED` |
| `INV-ACC-001` | Autorización de Lectura | El usuario `U` puede leer la mascota `P` si `P.ownerUserId == U.id` **o** existe un hogar `H` donde `U` y `P.ownerUserId` tienen membresía `ACTIVE`. En otro caso, se responde como inexistente. | `ERR-PET-NOT-FOUND` |
| `INV-ACC-002` | Autorización de Escritura | Crear, editar o eliminar una mascota o cualquiera de sus registros exige `P.ownerUserId == U.id`. Si `U` puede leer pero no es dueño → `ERR-ACC-FORBIDDEN`; si no puede leer → `ERR-PET-NOT-FOUND`. | `ERR-ACC-FORBIDDEN` / `ERR-PET-NOT-FOUND` |
| `INV-AUTH-001` | Unicidad de Usuario | `lower(username)` es único en el sistema. | `ERR-AUTH-USERNAME-TAKEN` |
| `INV-AUTH-002` | Política de Contraseña | `8 <= length(password) <= 128`, contiene `[A-Za-z]` y `[0-9]`. | `ERR-AUTH-WEAK-PASSWORD` |
| `INV-AUTH-003` | Secreto de Credenciales | La contraseña solo existe como hash `scrypt` con salt; ningún contrato de salida, log ni respaldo contiene `password`, hash ni token de sesión en claro. | N/A (verificado en `tests/security/`) |
| `INV-AUTH-004` | Vigencia de Sesión | Una sesión es válida si no fue revocada y `ClockPort.nowIsoTimestamp() < expiresAt`, con `expiresAt = createdAt + 7 días`. | `ERR-AUTH-UNAUTHENTICATED` |
| `INV-AUTH-005` | Bloqueo por Intentos Fallidos | Ventana deslizante de 15 minutos: si existen 5 o más fallos registrados de ese `username` en los últimos 15 minutos, el login se rechaza sin verificar la contraseña. Los intentos rechazados no se registran. Un login exitoso elimina los fallos registrados de ese `username`. Aplica también a usuarios inexistentes. | `ERR-AUTH-TOO-MANY-ATTEMPTS` |
| `INV-AUTH-006` | Tiempo Uniforme en Login | El tiempo de respuesta de `LoginUseCase` no depende de que el `username` exista: si no existe, se ejecuta `PasswordHasherPort.verify` contra un hash ficticio de igual coste. Verificado con espía sobre `PasswordHasherPort` (una invocación en ambas ramas), sin umbral temporal (D-02). | `ERR-AUTH-INVALID-CREDENTIALS` (respuesta idéntica) |
| `INV-AUTH-007` | Protección CSRF en Peticiones Mutantes | Toda petición que modifica estado exige la cabecera `X-Argos-Request: 1`, validada antes que la sesión (§5.1; constitución §6, regla 3). | `ERR-AUTH-CSRF-REJECTED` |
| `INV-HOUSE-001` | Propietario Único del Hogar | Todo hogar tiene exactamente un miembro con rol `OWNER` y estado `ACTIVE` (su creador). | `ERR-HOUSE-OWNER-CANNOT-LEAVE` |
| `INV-HOUSE-002` | Gestión Exclusiva del Propietario | Solo el `OWNER` invita, cancela invitaciones, retira miembros o elimina el hogar. | `ERR-ACC-FORBIDDEN` |
| `INV-HOUSE-003` | Membresía Única | Por cada par (`householdId`, `userId`) existe a lo sumo una membresía en estado `INVITED` o `ACTIVE`. Invitar a un usuario inexistente falla. | `ERR-HOUSE-MEMBER-ALREADY-EXISTS` / `ERR-AUTH-USER-NOT-FOUND` |
| `INV-HOUSE-004` | Visibilidad Solo por Membresía Activa | Un hogar y sus mascotas solo son visibles para miembros `ACTIVE`. Un invitado (`INVITED`) recibe `404` `ERR-HOUSE-NOT-FOUND` al leer el hogar o sus mascotas, sin datos del hogar. En `members` se devuelven solo membresías `ACTIVE`, salvo para el `OWNER`, que además recibe las `INVITED` (D-01). | `ERR-HOUSE-NOT-FOUND` |
| `INV-HOUSE-005` | Color Determinista de Dueño | `colorToken = OWNER_COLOR_{(i mod 8) + 1}` donde `i` es la posición (base 0) del dueño en la lista de miembros `ACTIVE` ordenada por `firstJoinedAt` ASC, `userId` ASC. Fuera de contexto de hogar, `colorToken = null`. | N/A |
| `INV-REC-001` | Ventana Temporal de Eventos | `pet.birthDate <= eventDate <= ClockPort.todayIsoDate()`. | `ERR-REC-DATE-BEFORE-BIRTH` / `ERR-REC-FUTURE-EVENT-DATE` |
| `INV-REC-002` | Rango de Peso | `0.05 <= weightKg <= 150.00`, máx. 2 decimales. | `ERR-REC-WEIGHT-OUT-OF-RANGE` |
| `INV-REC-003` | Rango de Medidas | Cada dimensión en `[1.00, 250.00]` cm, máx. 2 decimales. | `ERR-REC-MEASUREMENT-OUT-OF-RANGE` |
| `INV-REC-004` | Refuerzo de Vacuna | `nextBoosterAt > appliedAt`. | `ERR-REC-INVALID-BOOSTER-DATE` |
| `INV-REC-005` | Próxima Desparasitación | `nextSuggestedDoseAt > appliedAt`. | `ERR-REC-INVALID-NEXT-DOSE-DATE` |
| `INV-REC-006` | Textos No Vacíos | Todo string obligatorio (`name`, `breed`, `displayName`, `vaccineName`, `productBrand`, `reason`, `diagnosis`, `treatment`, `clinicOrVet`, `title`, `description`, `household.name`) cumple `trim().length >= 1` y no tiene espacios extremos. | `ERR-SCHEMA-VALIDATION-FAILED` |
| `INV-SORT-001` | Orden Cronológico Determinista | Todo historial se ordena por fecha de evento DESC, luego `createdAt` DESC, luego `id` ASC. `createdAt` es **siempre** UTC canónico `YYYY-MM-DDTHH:mm:ss.sssZ` (garantiza que la comparación lexicográfica equivale a la cronológica). | N/A (propiedad en `tests/property/`) |
| `INV-BACKUP-001` | Atomicidad e Integridad del Backup | El sobre importado no puede contener IDs duplicados, registros con `petId` ausente de `pets[]`, IDs que ya pertenezcan a entidades de **otro** usuario, ni violar `INV-PET-*` / `INV-REC-*`. Cualquier violación aborta en `ROLLED_BACK` propagando el código específico (`ERR-BACKUP-*`, `ERR-PET-*` o `ERR-REC-*`). Un fallo de persistencia durante el commit produce `ERR-BACKUP-ATOMIC-ROLLBACK`. El rollback nunca reemplaza el error original. Excepción: si el rollback del almacenamiento falla, la postcondición de byte-identidad no está garantizada; se reporta `ERR-INTERNAL-UNEXPECTED` con `finalState: "UNKNOWN"` y se registra como incidente (H-06). | `ERR-BACKUP-*`, `ERR-PET-*`, `ERR-REC-*` |

## 4. Máquinas de Estado y Flujos (`STATE-XXX`)
1. **`STATE-ALERT-001`** (`contracts/state-machines/sanitary-alert.machine.json`). Sea `daysRemaining = diffInCalendarDays(targetDate, ClockPort.todayIsoDate())`: `SUPERSEDED` si existe un registro posterior de la misma clave (`vaccineName` normalizado con `trim().toLowerCase()`, o mismo `dewormingType`) para la misma mascota; si no, `OVERDUE` si `< 0`, `DUE_SOON` si `0..15`, `UP_TO_DATE` si `> 15`.
2. **`STATE-BACKUP-001`** (`contracts/state-machines/backup-import.machine.json`): `IDLE` → `CHECKING_PAYLOAD_SIZE` (≤ 10 MB; si no, `ROLLED_BACK` con `ERR-BACKUP-PAYLOAD-TOO-LARGE`) → `PARSING_JSON` (si falla, `ROLLED_BACK` con `ERR-BACKUP-MALFORMED-JSON`) → `VALIDATING_VERSION_AND_SCHEMA` (versión no soportada → `ERR-BACKUP-VERSION-UNSUPPORTED`; esquema inválido → `ERR-BACKUP-SCHEMA-INVALID`) → [`MIGRATING_LEGACY_ENVELOPE` si `schemaVersion == "1.0.0"`] → `CHECKING_DOMAIN_INVARIANTS` (IDs huérfanos, duplicados o ajenos → `ERR-BACKUP-REFERENTIAL-INTEGRITY`; otras violaciones → código específico propagado) → `COMMITTING_SNAPSHOT` (fallo de almacenamiento → `ERR-BACKUP-ATOMIC-ROLLBACK`) → `COMPLETED` | `ROLLED_BACK`. Ningún cambio se persiste antes de `COMMITTING_SNAPSHOT`; el commit es una única transacción. Todo error de importación que termina en `ROLLED_BACK` se devuelve con `finalState: "ROLLED_BACK"` (§5.1), sea `ERR-BACKUP-*`, `ERR-PET-*`, `ERR-REC-*` o `ERR-SCHEMA-VALIDATION-FAILED` propagado. Si el propio rollback del almacenamiento falla (`ROLLBACK_FAILED`), la respuesta es `ERR-INTERNAL-UNEXPECTED` con `finalState: "UNKNOWN"` (H-06).
3. **`STATE-AUTH-SESSION-001`** (`contracts/state-machines/auth-session.machine.json`): `ANONYMOUS` → `AUTHENTICATED` → `EXPIRED` | `LOGGED_OUT`. `LOGOUT` responde `204` en cualquier estado sin cambiar el estado ni registrar error (idempotente, D-04). `EXPIRED` y `LOGGED_OUT` no son estados finales: admiten `LOGOUT` (H-05).
4. **`STATE-HOUSE-MEMBERSHIP-001`** (`contracts/state-machines/household-membership.machine.json`): `INVITED` → `ACTIVE` | `DECLINED` | `CANCELLED`; `ACTIVE` → `LEFT` | `REMOVED`. Desde `DECLINED`, `CANCELLED`, `LEFT` o `REMOVED` el `OWNER` reinvita mediante el evento `INVITE`, que crea una fila nueva con `membershipId` nuevo y hereda `firstJoinedAt` del par (D-05). `DECLINED`, `CANCELLED`, `LEFT` y `REMOVED` no son estados finales: admiten `INVITE` del `OWNER` (H-05). El `OWNER` nace en `ACTIVE` y no puede transitar a `LEFT`. Cada invitación es una fila con `membershipId` propio; `firstJoinedAt` se fija en el primer paso a `ACTIVE` del par y no cambia al reingresar; `joinedAt` registra el último paso a `ACTIVE` de la fila. Eliminar el hogar borra físicamente sus membresías.

## 5. Catálogo de Casos de Borde y Errores (`ERR-XXX`)
Formalizados en `contracts/errors/error-catalog.json` v2.1.1 (RFC 9457):

| Código | HTTP | Causa |
| :--- | :--- | :--- |
| `ERR-SCHEMA-VALIDATION-FAILED` | 422 | Formato, tipos, longitudes o propiedades no autorizadas. |
| `ERR-AUTH-USERNAME-TAKEN` | 409 | `username` ya registrado. |
| `ERR-AUTH-WEAK-PASSWORD` | 422 | Contraseña incumple `INV-AUTH-002`. |
| `ERR-AUTH-INVALID-CREDENTIALS` | 401 | Usuario o contraseña incorrectos (mensaje genérico). |
| `ERR-AUTH-UNAUTHENTICATED` | 401 | Sin sesión, sesión revocada o expirada. |
| `ERR-AUTH-TOO-MANY-ATTEMPTS` | 429 | Bloqueo de `INV-AUTH-005`. |
| `ERR-AUTH-CSRF-REJECTED` | 403 | Petición mutante sin cabecera `X-Argos-Request: 1`. |
| `ERR-AUTH-USER-NOT-FOUND` | 404 | Invitación a un `username` inexistente. |
| `ERR-ACC-FORBIDDEN` | 403 | Recurso visible pero sin permiso de escritura/gestión. |
| `ERR-PET-NOT-FOUND` | 404 | Mascota inexistente o no visible para el usuario. |
| `ERR-PET-FUTURE-BIRTHDATE` | 422 | `birthDate` posterior a hoy. |
| `ERR-PET-BIRTHDATE-AFTER-RECORDS` | 422 | Nuevo `birthDate` posterior a algún registro existente. |
| `ERR-REC-DATE-BEFORE-BIRTH` | 422 | Evento anterior a `birthDate`. |
| `ERR-REC-FUTURE-EVENT-DATE` | 422 | Evento posterior a hoy. |
| `ERR-REC-WEIGHT-OUT-OF-RANGE` | 422 | Peso fuera de `[0.05, 150.00]`. |
| `ERR-REC-MEASUREMENT-OUT-OF-RANGE` | 422 | Medida fuera de `[1.00, 250.00]`. |
| `ERR-REC-INVALID-BOOSTER-DATE` | 422 | `nextBoosterAt <= appliedAt`. |
| `ERR-REC-INVALID-NEXT-DOSE-DATE` | 422 | `nextSuggestedDoseAt <= appliedAt`. |
| `ERR-HOUSE-NOT-FOUND` | 404 | Hogar inexistente o sin membresía `ACTIVE`. |
| `ERR-HOUSE-MEMBER-ALREADY-EXISTS` | 409 | Ya existe membresía `INVITED`/`ACTIVE`. |
| `ERR-HOUSE-OWNER-CANNOT-LEAVE` | 409 | El `OWNER` intenta abandonar su hogar. |
| `ERR-HOUSE-INVITATION-NOT-FOUND` | 404 | No hay invitación `INVITED` para el usuario. |
| `ERR-HOUSE-MEMBERSHIP-NOT-FOUND` | 404 | El `userId` objetivo de una baja no tiene membresía `INVITED` o `ACTIVE` en el hogar. |
| `ERR-BACKUP-MALFORMED-JSON` | 400 | JSON sintácticamente inválido. |
| `ERR-BACKUP-PAYLOAD-TOO-LARGE` | 413 | Archivo > 10 MB. |
| `ERR-BACKUP-VERSION-UNSUPPORTED` | 422 | `schemaVersion` distinto de `"1.0.0"` o `"2.0.0"`. |
| `ERR-BACKUP-SCHEMA-INVALID` | 422 | Incumple `backup-envelope.schema.json`. |
| `ERR-BACKUP-REFERENTIAL-INTEGRITY` | 409 | IDs duplicados, huérfanos o pertenecientes a otro usuario. |
| `ERR-BACKUP-ATOMIC-ROLLBACK` | 500 | Fallo de persistencia en el commit; estado previo restaurado. |
| `ERR-INTERNAL-UNEXPECTED` | 500 | Error no previsto (sin trazas en la respuesta). |

**Retirado en v2.0.0:** `ERR-PET-QUOTA-EXCEEDED`.

### 5.1 Precedencia de validación en la frontera (C1)
1. Cabecera `X-Argos-Request: 1` en peticiones que modifican estado → `ERR-AUTH-CSRF-REJECTED` (403) [INV-AUTH-007; constitución §6, regla 3].
2. Sesión, si la ruta la exige → `ERR-AUTH-UNAUTHENTICATED` (401).
3. Normalización de `username` (recortar espacios y pasar a minúsculas) antes de validar.
4. Esquema formal. El alcance de `x-sdd-error` es el valor del campo anotado: un fallo de `type`, `minimum`, `maximum`, `multipleOf`, `pattern`, `minLength` o `maxLength` sobre ese campo devuelve el código anotado (p. ej. `weightKg` → `ERR-REC-WEIGHT-OUT-OF-RANGE`; `password` → `ERR-AUTH-WEAK-PASSWORD`). Un campo obligatorio ausente o una propiedad no autorizada (`additionalProperties: false`) devuelve `ERR-SCHEMA-VALIDATION-FAILED` (422), aunque el campo esté anotado. Cualquier otro fallo sin anotación devuelve también `ERR-SCHEMA-VALIDATION-FAILED`.
5. Dominio: invariantes `INV-*` con sus códigos específicos.

Si una misma petición incumple varias reglas, se devuelve el primer fallo en este orden. Todo error devuelto durante una importación que termina en `ROLLED_BACK` incluye `finalState: "ROLLED_BACK"` en el problema, sea `ERR-BACKUP-*`, `ERR-PET-*`, `ERR-REC-*` o `ERR-SCHEMA-VALIDATION-FAILED`. La definición única de `ProblemDetails` está en `contracts/schemas/common.schema.json#/$defs/ProblemDetails`; `error-catalog.json` la referencia. Durante una importación de respaldo la anotación `x-sdd-error` no se aplica: cualquier fallo de esquema del sobre devuelve `ERR-BACKUP-SCHEMA-INVALID` (manda `STATE-BACKUP-001`).
