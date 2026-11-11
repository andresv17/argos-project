# BORRADOR PENDIENTE DE FIRMA NIVEL 2 de Neo — Enmienda de la constitución para la Feature 002

**Estado**: BORRADOR. No aplicado a `.specify/memory/constitution.md`. Solo Neo (Andrés Vallejo, Nivel 2) puede aprobarlo y ordenar su aplicación con `/speckit-constitution`.
**Fecha**: 2026-11-10 | **Autor**: Architect | **Origen**: decisión N-3 = A de Neo | **Spec relacionada**: `specs/002-plataforma-v21/spec.md` (DRAFT)
**Versión actual**: 3.0.0 | **Versión propuesta**: **3.1.0 (MINOR)**

## Justificación del tipo de versión

La gobernanza (SemVer de la constitución, sección Governance) reserva MAJOR para un cambio incompatible de gobernanza o la retirada o redefinición de un principio, y MINOR para un principio o una sección nuevos; PATCH, para aclaraciones sin cambio de alcance (cita literal de la v3.0.0: «MAJOR para un cambio incompatible de gobernanza o la retirada o redefinición de un principio; MINOR para un principio o una sección nuevos; PATCH para aclaraciones sin cambio de alcance»). Esta enmienda no crea ningún principio ni sección nuevos, y no retira ni redefine los principios I a VI: modifica texto de secciones existentes (Sistema, Autenticación, Principio IV) con ampliación de dominio, de roles y de anchos. Por la regla exacta no encaja limpiamente en MINOR («nuevos») ni es PATCH (cambia el alcance), y tampoco es MAJOR (no hay cambio incompatible de gobernanza ni redefinición de principio). **Propuesta: 3.1.0 (MINOR)**, con la justificación de que el cambio de reglas del Sistema (hogares con roles) y del dominio equivale a una sección funcional nueva en la práctica; es una interpretación y se declara como tal. Alternativa si Neo prefiere el literal estricto: PATCH queda descartado por cambiar el alcance, así que la única otra opción es 4.0.0, que solo se justifica si Neo considera que el cambio de TTL (7 días a 24 h/30 min) y de modelo de permisos es «incompatible». El texto de la enmienda no cambia con ninguna de las versiones.

## (a) Especies: de `DOG | CAT` a 8 especies

**Cambio**: el dominio de mascotas pasa de `DOG` | `CAT` a `CANINE`, `FELINE`, `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER` (`speciesOther` obligatorio con `OTHER`), según `REQ-PET2-001`.

**Migración** (`REQ-MIG-001`): `DOG` → `CANINE`, `CAT` → `FELINE`, sin pérdida y repetible (idempotente); los respaldos 1.0.0 y 2.0.0 se leen y migran en la importación (`REQ-BACKUP2-002`). Sin alertas automáticas de peso ni geriátricas para las especies nuevas hasta que Maggie entregue reglas clínicas aprobadas.

**Sección afectada**: «Technology Stack & Repository Structure», párrafo **Sistema** (línea 129 de la v3.0.0).

Texto actual: «… para administrar el expediente clínico, físico y sanitario de mascotas (`DOG` | `CAT`) sin límite de cantidad. …»

Texto nuevo: «… para administrar el expediente clínico, físico y sanitario de mascotas (`CANINE` | `FELINE` | `RABBIT` | `FERRET` | `BIRD` | `REPTILE` | `SMALL_MAMMAL` | `OTHER`) sin límite de cantidad. …» (el resto del párrafo no cambia).

## (a bis) Hogares y permisos: roles de la 002 y asignación mascota-hogar

**Cambio**: la 002 sustituye «los miembros ven las mascotas de todos los miembros y solo el dueño puede modificar» por roles por membresía (Propietario del hogar con rol Administrador, Administrador del hogar, Cuidador, Lector) y por una asignación explícita mascota-hogar hecha por el Propietario Legal (`REQ-HOUSE2-001` a `REQ-HOUSE2-004`, `REQ-RBAC-001`, `REQ-OWN-001`). La visibilidad ya no es automática por ser miembro, y modificar ya no es exclusivo del dueño.

**Sección afectada**: «Technology Stack & Repository Structure», párrafo **Sistema** (línea 129 de la v3.0.0), segunda mitad (se suma al cambio de especies de (a)).

Texto actual: «Cada mascota pertenece exactamente a un usuario (`ownerUserId`) y cada usuario gestiona solo lo suyo. Un usuario puede crear hogares e invitar a otros; los miembros activos de un hogar ven las mascotas de todos los miembros, siempre con su dueño identificado, y solo el dueño puede modificar una mascota y sus registros.»

Texto nuevo: «Cada mascota tiene exactamente un Propietario Legal (`ownerUserId`), que decide a qué hogares la asigna; un usuario solo gestiona por sí mismo sus mascotas y las que un hogar le permite según su rol. Un usuario puede crear hogares e invitar a otros con un rol por membresía (Administrador, Cuidador o Lector; el propietario del hogar es siempre Administrador). Los miembros activos de un hogar ven únicamente las mascotas asignadas a ese hogar, siempre con su Propietario Legal identificado, y lo que pueden hacer sobre ellas lo decide su rol mediante una matriz de permisos; solo el Propietario Legal transfiere la propiedad o elimina la mascota.»

(El «solo el Propietario Legal elimina» refleja `REQ-RBAC-001`; si la matriz cambia en la fase F4, el texto se ajusta en la misma enmienda antes de la firma.)

## (b) TTL de sesión: 24 h absolutas y 30 min de inactividad

**Cambio**: se sustituye el TTL único de 7 días por dos límites que se cumplen a la vez: la sesión expira a las **24 horas absolutas** desde su creación o a los **30 minutos de inactividad**, lo que ocurra primero (`SC-009`). Las sesiones existentes se revocan en la migración (`REQ-MIG-001`).

**Sección afectada**: «Technology Stack & Repository Structure», viñeta **Autenticación** (línea 140 de la v3.0.0).

Texto actual: «… entregadas en cookie `argos_session` (`HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` obligatorio en Cloud). TTL de 7 días.»

Texto nuevo: «… entregadas en cookie `argos_session` (`HttpOnly`, `SameSite=Strict`, `Path=/`; `Secure` obligatorio en Cloud). La sesión expira a las 24 horas absolutas desde su creación o a los 30 minutos sin actividad, lo que ocurra primero; recargar la página dentro de la vigencia no la cierra.»

## (c) Verificación de diseño: 320, 1024 y 1280 px más 768 px

**Cambio**: se añade 768 px (tableta y punto de quiebre del App Shell, `REQ-UI2-001`) a los anchos verificados (`REQ-UI2-008`, `SC-005`).

**Sección afectada**: Principio IV, viñeta **Accesibilidad**.

Texto actual: «**Accesibilidad:** cero violaciones `critical`/`serious` de axe-core en todas las pantallas (login, registro, mis mascotas, hogar, ficha, respaldo) a 320 px, 1024 px y 1280 px.»

Texto nuevo: «**Accesibilidad:** cero violaciones `critical`/`serious` de axe-core en todas las pantallas (login, registro, mis mascotas, hogar, ficha, respaldo, cuenta) a 320 px, 768 px, 1024 px y 1280 px.»

(La pantalla «cuenta», `/cuenta` de `REQ-UI2-004`, se añade a la lista porque la 002 la crea; si Neo prefiere no ampliar la lista, basta quitar esa palabra.)

## (d) Cambios de propagación obligatorios (Governance, Enmiendas)

1. Sync Impact Report de la cabecera: «Version change: 3.0.0 -> 3.1.0», bump rationale MINOR (resumen de a, a bis, b y c), principios modificados: IV (viñeta de accesibilidad); secciones modificadas: Technology Stack & Repository Structure (Sistema, Autenticación).
2. Línea final: `**Version**: 3.1.0 | **Ratified**: 2026-11-05 | **Last Amended**: <fecha de firma>`.
3. Revisar `spec-system.md` y las plantillas del Spec Kit por referencias a `DOG | CAT`, 7 días y tres anchos (la enmienda se propaga en el mismo cambio, Governance). Nota: la feature 001 queda vigente con sus propios contratos; su cumplimiento se mide contra la constitución vigente en su rama, y la 002 reemplaza las reglas afectadas según la hoja de ruta, sin editar documentos de la 001.
4. No se añade ninguna dependencia nueva a la sección de Stack: la variable `ARGOS_AUDIT_HMAC_SECRET` (nombre provisional, decisión N-1) se lee dentro de `src/infrastructure/config/` conforme al principio II, regla 6 (`INV-ARCH-006`) y no requiere enmienda.

## Firma

- [ ] Neo (Andrés Vallejo, Nivel 2) aprueba el texto: ______  Fecha: ______
- Tras la firma: `/speckit-constitution` aplica el texto y la versión; solo entonces la 002 puede pasar de `Draft` a `Review`/`Approved`.

PARA: Neo (Andrés Vallejo — Nivel 2)
