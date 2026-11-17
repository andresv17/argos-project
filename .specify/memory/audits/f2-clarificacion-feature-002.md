# F2 — Clarificación de la Especificación Técnica v2.1 (Feature 002)

Autor: Mouse (Auditor de Especificaciones) · Fecha: 2026-11-10 · Estado: PROPUESTA (documentación; sin cambios en `specs/**`, `contracts/**`, `src/**`, `tests/**`, `tasks.md`, constitución ni spec 001).
Equivale a `/speckit-clarify` sobre la v2.1, pero el destino es este documento (no existe `specs/002-*`; crearlo requiere autorización de Neo en F3).
Fuentes: `hoja-de-ruta-feature-002.md` (A, B), `fase-2-analisis-v21.md`, spec v2.1 en texto, `specs/001-pet-health-tracker/spec.md` (Approved), `.specify/memory/constitution.md`.

Clases: **(a)** resuelta por una decisión aprobada de Neo (D1 username, D2 sesión 30 min/24 h, D3 especies, D4 matriz §5.2, D5 diferidos a la 003, D6 bloqueo de eliminación); **(b)** propuesta, se resuelve sin Neo con una regla de consistencia (Neo puede objetar); **(c)** requiere a Neo.

Resumen: 27 incoherencias. (a) = 5, (b) = 15, (c) = 7.

Hallazgo de base que corrige el análisis previo: la 001 **no** usa UTC para el día civil. La constitución (`INV-ARCH-001`) define `ClockPort.todayIsoDate()` en la zona `APP_TIMEZONE` (por defecto `America/Bogota`) y `nowIsoTimestamp()` en UTC. Ver C-12.

---

## 1. Tabla de incoherencias

| ID | v2.1 (sección) | 001 / constitución en conflicto | Resolución propuesta | Clase |
|----|----------------|----------------------------------|----------------------|-------|
| C-01 | P-01: contraseña "mínimo 8" al iniciar sesión; P-02: mínimo 10 con complejidad. La v2.1 se contradice. | `INV-AUTH-002` (8–128, letra y dígito) aplica solo al registro. | El login no aplica política: valida solo "no vacía, máx. 128". La política rige al registrar y al cambiar contraseña. Así las cuentas creadas con 8 caracteres siguen entrando. | (b) |
| C-02 | P-02: min 10, 1 mayúscula, 1 número, 1 carácter especial, confirmación. | `INV-AUTH-002`, `ERR-AUTH-WEAK-PASSWORD`, `REQ-AUTH-001`. | Valor de la política para cuentas nuevas. Ver Pregunta 1. | (c) |
| C-03 | P-14: roles "Admin / Miembro"; P-15/P-16: "Administrador, Cuidador, Lector"; §5.1: cuatro roles incl. "Propietario Legal". | `OWNER`/`MEMBER` en el hogar; `INV-ACC-002` solo el dueño escribe. | D4 fija la matriz §5.2. Vocabulario único: **Propietario Legal** (por mascota), y por membresía de hogar **ADMIN**, **CAREGIVER**, **READER**. "Miembro" de P-14 se sustituye por el rol real. `OWNER`/`MEMBER` de la 001 se migran (ver C-04). | (a) D4 |
| C-04 | P-05 y §5.1 usan "Propietario Único" y "Administrador de Hogar" sin decir quién es quién; la matriz no tiene filas para cambiar rol ni transferir el hogar; P-16 elige rol inicial sin definir si una invitación lo guarda. | `INV-HOUSE-001` (exactamente un `OWNER`), `INV-HOUSE-002` (solo el `OWNER` invita o retira). | Regla: el creador del hogar es el **propietario del hogar** (conserva `INV-HOUSE-001`) y tiene rol ADMIN; puede haber más ADMIN. El término "Propietario Legal" se reserva a mascotas. Invitar, expulsar y cambiar rol usan la fila "Invitar / Expulsar" (ADMIN y propietario del hogar). Un ADMIN no puede expulsar ni degradar al propietario del hogar ni cambiar su propio rol; solo el propietario del hogar ejecuta `TRANSFER_OWNERSHIP` (D6). La invitación guarda `roleOnJoin` (ADMIN, CAREGIVER o READER). Migración: `OWNER`→ADMIN+propietario, `MEMBER`→READER (la 001 no les daba escritura). | (b) |
| C-05 | P-01: "JWT firmados o sesiones mediante SSO/OAuth2"; P-02: SSO Google, Apple, "SAML enterprise" (producto doméstico). | `STATE-AUTH-SESSION-001`, `INV-AUTH-004`, REQ-AUTH-003 (revocación inmediata). | D2 mantiene sesión de servidor con cookie HttpOnly; JWT descartado. D5 difiere SSO/SAML a la 003. Se eliminan de la 002 el selector de proveedor y el campo `provider`. | (a) D2, D5 |
| C-06 | P-01 envía `"password": "string_argon2id_hash"` (hash en el cliente); payloads en snake_case (`full_name`, `terms_accepted`), rutas `/api/v1/user/profile`; `terms_accepted` sin texto legal definido. | `INV-AUTH-003` (el secreto solo existe como hash en servidor); contratos de la 001 en camelCase. | La contraseña viaja en claro por TLS y el servidor la hashea; un hash enviado por el cliente se convertiría en la contraseña. Los JSON de la v2.1 son ilustrativos: la 002 usa camelCase y las rutas de los contratos (`PATCH /users/me`). `terms_accepted` queda fuera hasta que exista un texto de términos; Neo puede pedirlo. | (b) |
| C-07 | P-01/P-02/P-16/P-15: login, registro e invitación por correo; P-15 muestra "correo" de cada miembro. | `INV-AUTH-001`, `INV-HOUSE-003` (`username`); `ERR-AUTH-USERNAME-TAKEN`. | D1: `username` sigue como login e invitación; `email` opcional en perfil, sin verificar ni enviar correos. P-15 muestra `username`, nunca el email de otros miembros (privacidad; Rama revisa). `full_name`→`displayName`. | (a) D1 |
| C-08 | §5.2: "Exportar Respaldo JSON" Sí para los 4 roles; "Ejecutar Importación" solo Propietario y Admin. | `REQ-BACKUP-001` exporta solo las mascotas del usuario; `REQ-BACKUP-002` reemplaza solo sus datos; `SC-003` cero accesos cruzados. | Alcance del respaldo del Lector y semántica de la fila de importación. Ver Pregunta 2. | (c) |
| C-09 | §2.3: 8 colores por hash de `user_id`. | `INV-HOUSE-005`: `OWNER_COLOR_{(i mod 8)+1}` por posición en miembros `ACTIVE`. Un hash puede repetir color con 3 personas. | Se conserva `INV-HOUSE-005` (posición): sin colisiones hasta 8 miembros y determinista. Los 8 hex de §2.3 se mapean a `OWNER_COLOR_1..8` (Sati verifica contraste con texto blanco; la constitución exige no depender solo del color). El color sigue sin existir fuera de un hogar. | (b) |
| C-10 | P-19: barra de progreso 0–100 % durante la inserción. | `REQ-BACKUP-002`, `INV-BACKUP-001`, `STATE-BACKUP-001`: una sola transacción con rollback. | La barra muestra fases, no porcentaje: Validando → Previsualizando → Aplicando (indeterminada) → Terminada o Revertida. No hay progreso parcial visible, porque no existe estado parcial. | (b) |
| C-11 | P-19/§1.2: modo "Merge Idempotente (recomendado)" por fecha de modificación y detección de colisiones de ID y microchip, junto a "Reemplazo". Sobre "snapshot v2.1". | `REQ-BACKUP-002` solo reemplaza. Los registros clínicos de la 001 **no tienen `updatedAt`** (solo identidad y mascota); `INV-BACKUP-001` rechaza IDs ajenos; sobre `2.0.0`. | Merge exige `updatedAt` en seis colecciones, regla de conflictos y nueva máquina de estados. Ver Pregunta 3. Sea cual sea la respuesta, el sobre es `3.0.0` (D3) y se importan 1.0.0 y 2.0.0; el nombre "v2.1" de la v2.1 es la versión del documento, no del sobre. | (c) |
| C-12 | §1.3: fechas en UTC y transiciones "al cambio del día civil del usuario"; P-07: fecha no futura "respecto al día actual UTC"; P-09: re-evaluación a la medianoche del huso del usuario; P-04: `timezone` por usuario. Tres criterios distintos. | Constitución `INV-ARCH-001`: `ClockPort.todayIsoDate()` en `APP_TIMEZONE` (defecto `America/Bogota`); `nowIsoTimestamp()` UTC; `INV-PET-002`, `STATE-ALERT-001` usan `diffInCalendarDays`. | Qué zona define el "hoy". Ver Pregunta 4. | (c) |
| C-13 | P-07: `household_id` "Hogar base"; P-14: "total de mascotas asociadas"; P-15: "Mascotas asignadas" con permisos por miembro; matriz del Admin sobre mascotas de otros. | `INV-OWN-001` (una mascota es de un usuario); `INV-ACC-001` y `REQ-HOUSE-005`: todas las mascotas de todos los miembros `ACTIVE` son visibles en cualquier hogar común; no hay relación mascota-hogar. | Sin modelo mascota-hogar la matriz no tiene dónde aplicarse. Ver Pregunta 5. | (c) |
| C-14 | §5.2 y §5.1: "Transferir Propiedad Legal" solo Propietario, hacia "otro miembro del hogar activo". | `INV-OWN-001`: `ownerUserId` inmutable vía API. | Se crea la operación explícita `TransferPetOwnership`; `INV-OWN-001` pasa a "inmutable salvo esa operación". Reglas: solo el Propietario Legal; el destinatario debe ser miembro `ACTIVE` de un hogar al que la mascota esté asignada (C-13); inmediata, sin segundo paso de aceptación (dos pasos queda para la 003); sus registros heredan el nuevo dueño; se audita (C-17); el dueño anterior pasa a ser lector/rol que tenga en ese hogar. | (b) |
| C-15 | §5.3 "Protección contra huérfanos": el Propietario Legal que elimina su cuenta **o abandona el hogar** debe transferir antes. P-05 solo bloquea por hogar propio con miembros. | D6 bloquea solo por hogar con miembros; `REQ-PET-004`/`INV-PET-005`: eliminar mascota la borra con registros; `INV-HOUSE-001` impide al propietario abandonar. | "Abandonar el hogar" no deja huérfana a ninguna mascota (el dueño no cambia; solo se retira la asignación mascota-hogar, regla b). El caso abierto es eliminar la cuenta con mascotas compartidas. Ver Pregunta 6. | (c) |
| C-16 | §5.3: un evento `SUPERSEDED` no se modifica; solo se supera con un nuevo registro que establece "supersección". Acordeón de histórico. | `STATE-ALERT-001`: `SUPERSEDED` se **calcula** (hay registro posterior de la misma clave); la 001 permite editar o borrar. | Se conserva el estado calculado (sin `supersedesId` persistido, que obligaría a migrar datos y a un vínculo manual). Regla: editar un registro cuyo estado calculado es `SUPERSEDED` se rechaza con un error nuevo; borrar sigue la matriz (si se borra el posterior, el anterior vuelve a estar vigente). Nota: la hoja de ruta (F4) lista `supersedesId`; Mouse recomienda no incluirlo. | (b) |
| C-17 | §5.3: log de toda mutación con `executor_user_id`, `previous_state_hash`, `new_state_hash`. | `INV-AUTH-003` (sin secretos en logs); eliminación de cuenta (D6); Habeas Data. | Hash SHA-256 sobre JSON canónico (claves ordenadas) de la vista pública de la entidad, nunca de campos secretos. Al eliminar la cuenta, `executor_user_id` se reemplaza por un hash con sal; sin nombres ni emails. Retención y puerto de auditoría los define Architect con Rama en F4. | (b) |
| C-18 | P-13: peso `0.05 < W ≤ 150.00` (cota inferior exclusiva); sin distinguir especie, con D3 que añade ave, roedor, reptil. | `INV-REC-002`: `0.05 <= weightKg <= 150.00`, máx. 2 decimales; `deltaKg` en centésimas. | Cota exclusiva vs inclusiva y rango para especies pequeñas. Ver Pregunta 7. (Si no se cambia, se adopta la cota inclusiva de la 001: un peso de exactamente 0.05 es válido.) | (c) |
| C-19 | §1.1 limita el producto a caninos y felinos; P-06: filtros "Perros, Gatos"; P-07: select "Canino, Felino". | `Species` = `DOG|CAT`. | D3: ocho especies con migración DOG→CANINE, CAT→FELINE. Filtros: Todos, Perros, Gatos, Otros, Con alertas. §1.1 se reescribe. Sin alertas automáticas de peso/edad fuera de CANINE/FELINE hasta que Maggie defina reglas. | (a) D3 |
| C-20 | §2.4 y P-08: Cuidador/Lector sin edición ni eliminación ("Cuidador sin permisos de edición" sin definir). | Matriz §5.2: Cuidador registra/edita eventos y pesos. | D4: el Cuidador no edita el perfil básico ni elimina la mascota, pero ve los formularios de eventos y pesos. "Cuidador sin permisos de edición" desaparece (el rol no varía). Se suprimen del DOM solo las acciones que la matriz niega. Esto no sustituye la validación en servidor. | (a) D4 |
| C-21 | §2.4: la insignia "Solo lectura · Dueño: [Nombre]" se aplica a Cuidador y Lector; el Admin edita datos básicos de mascotas ajenas pero no tiene regla visual. | `REQ-UI-007` (color y nombre del dueño). | Toda mascota ajena muestra "Dueño: [Nombre]" con su color; "Solo lectura" se añade solo al Lector. Cuidador y Admin ven las acciones que su rol permite. | (b) |
| C-22 | §5.2 solo cubre eventos sanitarios y pesos; sin fila para eliminar mediciones de peso, medidas corporales, citas médicas ni parámetros adicionales (4 de las 6 colecciones de la 001). | `INV-ACC-002`: todas las colecciones. | Regla por defecto, la más restrictiva coherente con la matriz: añadir/editar peso y medidas corporales = fila "Mediciones de peso" (Propietario, Admin, Cuidador); citas médicas y parámetros adicionales = solo Propietario y Admin; eliminar cualquier registro = fila "Eliminar Eventos" (Propietario, Admin). Cambiar rol = fila "Invitar/Expulsar". `can(rol, acción)` cubre así 9 filas más estas extensiones, todas con prueba de matriz completa. | (b) |
| C-23 | P-07: "Fecha Nacimiento (o Edad Estimada)". | `REQ-PET-002`, `INV-PET-002`, `INV-PET-006`: edad calculada de `birthDate`. | La edad estimada (años+meses) se convierte en `birthDate` y se marca `birthDateIsEstimate: true`; el cálculo determinista no cambia. Campo aditivo. | (b) |
| C-24 | P-07/P-19: microchip único y "detección de colisiones". | `INV-BACKUP-001` rechaza IDs de otro usuario; `SC-003`. | Unicidad por propietario (no global): comprobar un microchip entre usuarios revelaría que existe en otra cuenta. En importación, las colisiones se detectan solo contra los datos propios. | (b) |
| C-25 | §3.1: el header muestra "Andrés Vallejo" fijo. | `UserPublicProfile.displayName`. | Es `displayName` del usuario autenticado. | (b) |
| C-26 | §3.1: el header de escritorio tiene Mascotas, Hogares, Respaldo; el bottom-bar móvil añade Perfil (`/cuenta`). Quiebre 768 px frente a verificación en 320/1024/1280. | Constitución: verificación a 320, 1024 y 1280. | Escritorio: el avatar del extremo derecho abre un menú con "Perfil" (`/cuenta`) y "Cerrar sesión". Se añade 768 px a la verificación (Sati/Seraph); no requiere enmienda. | (b) |
| C-27 | P-12: categoría con "Desparasitante Interno/Externo", "¿Requiere próxima dosis?", lote, `veterinarian` (nombre + colegiado en una sola cadena), payload solo ilustra `VACCINE`. | `REQ-REC-003/004`: `batchOrClinic` (≤120), `dewormingType` INTERNAL/EXTERNAL; vacunación sin campo de veterinario. | Cambio aditivo: categoría = vacunación o desparasitación + `dewormingType`; `nextDue` opcional; lote → `batchOrClinic`; `veterinarianName` y `veterinarianLicense` opcionales por separado. Maggie valida. | (b) |

---

## 2. Detalle de las incoherencias de clase (c)

### C-02 Política de contraseña
- Pregunta: ¿qué política rige para cuentas nuevas y cambios de contraseña?
- Opción A (recomendada): la de la v2.1 P-02 (10–128 caracteres, mayúscula, número y carácter especial) solo al registrar o cambiar; el login no aplica política (C-01). Sin recuperación por correo hasta la 003, endurecer reduce riesgo de fuerza bruta junto al bloqueo `INV-AUTH-005`. Reemplaza `INV-AUTH-002` y `ERR-AUTH-WEAK-PASSWORD` por regla 002.
- Opción B: conservar la de la 001 (8–128, letra y dígito) y tratar los 10 de P-02 como error de la v2.1.

### C-08 Alcance de exportación e importación
- Pregunta: ¿qué contiene el respaldo que descarga un Cuidador o Lector, y qué significa "Ejecutar importación: No" para ellos?
- Opción A (recomendada): exportar e importar son operaciones **de cuenta** sobre las mascotas de las que el usuario es Propietario Legal (igual que la 001). La matriz regula acciones por mascota/hogar; en estas dos filas se documenta que no concede acceso a datos ajenos. Un Lector sin mascotas propias exporta un archivo válido sin mascotas. Cumple `REQ-BACKUP-001` y `SC-003` sin enmienda.
- Opción B: el respaldo incluye las mascotas compartidas que el rol permite ver. Rompe `SC-003`, exige enmendar `REQ-BACKUP-001` (sobre con datos de otros usuarios) y una nueva política de privacidad; no recomendado.

### C-11 Importación Merge
- Pregunta: ¿entra el modo Merge Idempotente en la 002?
- Opción A (recomendada): no; la 002 mantiene solo reemplazo atómico (el "Reemplazo destructivo" de P-19), con previsualización de conteos y colisiones. Merge pasa a la 003. Evita añadir `updatedAt` a las seis colecciones, regla de conflictos y una máquina nueva.
- Opción B: incluir Merge: `updatedAt` obligatorio en las seis colecciones (migración), gana el `updatedAt` mayor, empate conserva el existente, nueva máquina validar → previsualizar → aplicar, pruebas de idempotencia por propiedades y mutación. Alto costo.

### C-12 Zona horaria del día civil
- Pregunta: ¿qué zona define "hoy" para alertas, edad y fechas no futuras?
- Opción A (recomendada): se mantiene `APP_TIMEZONE` único (constitución sin cambios). `timezone` del perfil se guarda (IANA válida) y se usa para mostrar horas; no altera el cálculo. La inconsistencia "UTC" de §1.3/P-07 se reescribe como "serialización UTC y día civil en la zona de la aplicación".
- Opción B: día civil por usuario. Exige enmendar la constitución (`ClockPort.todayIsoDate` pasa a recibir la zona, `INV-ARCH-001`, Nivel 2), regenerar pruebas de propiedades de `STATE-ALERT-001` y definir el "hoy" en hogares donde viven personas en zonas distintas.

### C-13 Modelo mascota-hogar
- Pregunta: ¿cómo se relaciona una mascota con un hogar?
- Opción A: sin cambios de modelo. Todas las mascotas de un miembro se ven en todos sus hogares comunes y el rol del observador (ADMIN/CAREGIVER/READER en ese hogar) se aplica a todas ellas. Un ADMIN podría editar todas las mascotas de cualquier miembro; sin control por mascota.
- Opción B (recomendada): asignación explícita en tabla mascota↔hogar (muchos a muchos). Solo las mascotas asignadas se comparten; el Propietario Legal elige cuáles; el rol efectivo del observador es el máximo entre los hogares donde la mascota está asignada y él es `ACTIVE`; el dueño siempre manda. Migración de datos 001: crear una asignación por cada hogar común del dueño para no perder la visibilidad actual. "Hogar base" de P-07 pasa a asignación inicial opcional. Reemplaza `INV-ACC-001` y `REQ-HOUSE-005`.

### C-15 Eliminar cuenta con mascotas compartidas
- Pregunta: ¿qué ocurre con las mascotas asignadas a hogares con otros miembros `ACTIVE` cuando su dueño elimina la cuenta (D6 solo bloquea por hogar propio)?
- Opción A (recomendada): ampliar el bloqueo: la eliminación se rechaza (`ERR-ACCOUNT-OWNS-SHARED-HOUSEHOLD` y nuevo `ERR-ACCOUNT-OWNS-SHARED-PETS`) hasta transferir o desasignar esas mascotas; las no compartidas se eliminan en cascada. Cumple "protección contra huérfanos" y evita pérdida de datos ajenos.
- Opción B: eliminar siempre todas las mascotas del usuario, también las compartidas; sin transferencia obligatoria. Más simple, pero los otros miembros pierden expedientes sin aviso y contradice §5.3.

### C-18 Rango de peso por especie
- Pregunta: ¿se amplía el rango de `weightKg` para especies pequeñas?
- Opción A: mantener 0.05–150.00 kg, 2 decimales, para todas las especies, y documentar que aves y roedores menores de 50 g no se pueden registrar (periquito: 30–40 g).
- Opción B (recomendada): para especies distintas de CANINE/FELINE, mínimo 0.001 kg con 3 decimales (`deltaKg` en milésimas); CANINE/FELINE sin cambios. La tabla definitiva por especie la fija Maggie. Cambia `INV-REC-002` y el tipo numérico de peso.

---

## 3. Preguntas para Neo (responda por número)

1. **Contraseña (C-02).** ¿Política para cuentas nuevas y cambios: **A** (recomendada) 10–128 con mayúscula, número y carácter especial, solo al registrar/cambiar, login sin política; o **B** conservar 8–128 con letra y dígito de la 001?
2. **Respaldo del Lector (C-08).** ¿**A** (recomendada) exportar/importar son de cuenta y solo cubren las mascotas propias, sin enmienda; o **B** el respaldo incluye mascotas compartidas visibles por rol (rompe `SC-003`, requiere enmienda)?
3. **Merge en importación (C-11).** ¿**A** (recomendada) solo reemplazo atómico en la 002 y Merge en la 003; o **B** incluir Merge ahora con `updatedAt` en las seis colecciones?
4. **Zona horaria (C-12).** ¿**A** (recomendada) una sola `APP_TIMEZONE` y el `timezone` del perfil solo para mostrar horas; o **B** día civil por usuario (enmienda de la constitución)?
5. **Mascota y hogar (C-13).** ¿**A** sin cambios (todas las mascotas del miembro visibles en cada hogar común) o **B** (recomendada) asignación explícita mascota↔hogar elegida por el Propietario Legal, con migración de la visibilidad actual?
6. **Eliminar cuenta con mascotas compartidas (C-15).** ¿**A** (recomendada) bloquear hasta transferir o desasignar esas mascotas; o **B** eliminar todo sin transferencia?
7. **Peso de especies pequeñas (C-18).** ¿**A** mantener 0.05–150 kg para todas; o **B** (recomendada) mínimo 0.001 kg con 3 decimales para las especies distintas de CANINE/FELINE, con tabla de Maggie?

Las 15 incoherencias (b) quedan aplicadas por defecto salvo objeción de Neo; las más sensibles para revisar son C-04 (propietario del hogar y migración `MEMBER`→READER), C-14 (transferencia inmediata) y C-22 (permisos de las colecciones que la matriz no nombra).

---

## 4. Cambios que tocarían la 001 (la 001 se queda como está)

La 002 no edita la 001: cada punto se declara en contratos y spec de la 002 con `supersedes` en `x-sdd-metadata`. Los marcados con **ENMIENDA** no pueden resolverse dentro de la 002 y requieren autorización de Neo sobre la constitución (Nivel 2). El código comparte `src/`, así que las pruebas de la 001 que afirman reglas reemplazadas se sustituyen según la sección C de la hoja de ruta.

| Elemento de la 001 | Cambio en la 002 | Origen | Condición |
|--------------------|------------------|--------|-----------|
| `INV-AUTH-002`, `ERR-AUTH-WEAK-PASSWORD` | Nueva política en registro/cambio | C-01, C-02 | Si Neo elige A en P1 |
| `INV-AUTH-004`, `REQ-AUTH-002`, `STATE-AUTH-SESSION-001` | 30 min inactividad y 24 h absoluto, `lastActivityAt`, `EXPIRED_IDLE` | D2 | Aprobado |
| `identity.schema.json`, `RegisterUserInput`, `UserPublicProfile` | `email` opcional, `preferredLanguage`, `timezone` (campos aditivos) | D1, C-07 | Aprobado |
| `Species` (`DOG|CAT`), `pet.schema.json`, `backup-envelope` 2.0.0 | Enum de 8, `speciesOther`, `birthDateIsEstimate`; sobre 3.0.0 | D3, C-19, C-23 | Aprobado |
| `INV-OWN-001` | Inmutable salvo `TransferPetOwnership` | C-14 | Por defecto |
| `INV-ACC-002`, `REQ-REC-*` (escritura) | Permisos por `can(rol, acción)` | D4, C-20, C-22 | Aprobado |
| `INV-HOUSE-001/002`, `household-membership.machine.json`, `HouseholdMemberView` | Rol por membresía, `CHANGE_ROLE`, `TRANSFER_OWNERSHIP`, `roleOnJoin` | D4, D6, C-04 | Aprobado |
| `INV-ACC-001`, `REQ-HOUSE-005` | Visibilidad por asignación mascota↔hogar | C-13 | Solo si P5 = B |
| `REQ-BACKUP-001/002`, `SC-003` | Sin cambio con P2 = A; **enmienda** de `REQ-BACKUP-001` y `SC-003` con P2 = B | C-08 | Depende de P2 |
| `REQ-BACKUP-002`, `STATE-BACKUP-001` | Máquina nueva y `updatedAt` en 6 colecciones | C-11 | Solo si P3 = B |
| `INV-REC-002`, `ERR-REC-WEIGHT-OUT-OF-RANGE` | Rango por especie | C-18 | Solo si P7 = B |
| Constitución `INV-ARCH-001` (`ClockPort`) | **ENMIENDA** (firma con zona) | C-12 | Solo si P4 = B |
| Constitución §2 (stack): librería de iconos Lucide/Heroicons, correo, SSO | **ENMIENDA** si se añade librería; correo y SSO prohibidos en la 002 (D5) | §1.3 de la v2.1 | Neo decide la librería en F2b |
| `REQ-HOUSE-002/003`, invitaciones por `username` | Sin cambio (D1); se prohíbe invitar por correo en la 002 | C-07 | Aprobado |
| `STATE-ALERT-001` | Sin cambio con la regla C-16 (estado calculado) | C-16 | Por defecto |
| `INV-HOUSE-005` | Sin cambio (C-09) | C-09 | Por defecto |

Prohibido en la 002 (sin enmienda): enviar correos o recuperar acceso por correo, SSO/SAML, JWT sin estado, adjuntos PDF y subida de archivos, invitar por correo, Merge de importación (salvo P3 = B), color por hash de `user_id`, persistir `supersedesId`, y comprobar unicidad de microchip entre usuarios.
