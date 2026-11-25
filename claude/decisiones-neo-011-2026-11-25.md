# Acta de decisiones de Neo — Feature 011 (T1501)

**Fecha**: 2026-11-25 | **Autoridad**: `Neo (Andrés Vallejo — Nivel 2)` | **Redactó**: `/architect` por directiva firmada de Neo (dictada en la sesión; transcrita sin añadir requisitos).
**Estado del acta**: `REVIEW` (la firma formal de cierre de `T1501` y cualquier `[x]` son potestad exclusiva de Neo).
**Alcance**: `specs/011-pulido-portal-hogares-admin/{spec,plan,tasks}.md`. Rama `011-pulido-portal-hogares-admin`, HEAD `6d8ca54`.

| ID | Resolución de Neo | Toca (REQ / SC / INV / ADR / EDGE) |
| --- | --- | --- |
| `D11-01` = **A** (enmendada por `H-6`) | 3 roles de plataforma: `SUPER_ADMIN` (todo), `OPERATOR` (parámetros, escenas, cuotas, Acerca de, aprobaciones), `SUPPORT` (solo aprobaciones). La gestión de delegados es exclusiva de `SUPER_ADMIN`; **solo el administrador raíz concede o revoca `SUPER_ADMIN`**; los delegados `SUPER_ADMIN` gestionan solo `OPERATOR` y `SUPPORT`; sin autopromoción ni auto-modificación. `REQ-ADM11-005` se mantiene: `ARGOS_ADMIN_EMAILS` intocable desde la UI; bloqueo transaccional contra eliminar/degradar al último `SUPER_ADMIN`. | REQ-ADM11-001, 002, 003, 005; SC-011-021..034; ADR-011-01, ADR-011-02; EDGE-011-002 |
| `D11-02` = **D (cerrada)** | Se admiten delegados `@gmail.com` además de Workspace; sin 2FA técnico en código; control operativo (2SV/passkey de Google por política para `ARGOS_ADMIN_EMAILS` y delegados) + controles compensatorios; sin credenciales propias; `T1532` cerrada sin tareas adicionales. | REQ-ADM11-008; INV-ADM11-001; T1505, T1532 |
| `D11-03` = **B+A** | Tope de **20** delegados activos (nota ORA-2: la extensión a `INVITED` vigentes es **DERIVADA — para revisión de Neo**, ver ORA-1a; constante en `app-config.ts`, INV-ARCH-006), sin lista cerrada de dominios. Cero revelación de si un correo ya es usuario (anti-enumeración, INV-ADM9-002). | REQ-ADM11-001, REQ-ADM11-006; NFR-011-002; SC-011-021..034 |
| `D11-04` = **A** | Un delegado `DISABLED` puede reactivarse a `ACTIVE` (`STATE-ADM11-001` bidireccional); conserva `admin_id` y `sub`. | REQ-ADM11-001, REQ-ADM11-006, REQ-ADM11-007; STATE-ADM11-001 |
| `D11-05` = **A** | «Hogares» única en el menú principal, con lista y detalle por hogar con pestañas internas (Resumen, Miembros, Mascotas, Compartir, Álbum, Escena). `T1503` confirma el rol de `ContextSelector` sin duplicar entradas. | REQ-HOG11-001, REQ-HOG11-002; SC-011-001..009; T1503 |
| `D11-06` = **A** | Compartir por hogar incluye todas las mascotas elegibles (sin subconjunto; sin migración ni cambio de contrato 005; `T1507` se cierra sin cambio). En la ficha de mascota se oculta «¿Qué quieres compartir?» y se muestra el nombre de la mascota. | REQ-HOG11-005, REQ-HOG11-006, REQ-HOG11-007; SC-011-002, SC-011-003; T1507 |
| `D11-07` = **A** | Texto visible y accesible junto a la imagen de escena (sin marca de agua en los bytes de descarga; etiqueta visible y accesible en todas las superficies web donde se muestre la escena, `F-11`). Texto propuesto para dictamen `/rama` (`T1513`): «Imagen generada con inteligencia artificial» (constante única, AA, `figcaption`/`aria-describedby`, nunca en fotos subidas). Regla `INV-IA11-002` para futuros puertos LLM. | REQ-IA11-001, REQ-IA11-002; INV-IA11-001, INV-IA11-002; SC-011-010..014; T1513 |
| `D11-08` = **A** | Cero persistencia del prompt de usuario (ni hash), solo en memoria (ADR-011-03). La plantilla genérica de `/admin` (`scene.prompt.blocks`) es visible/editable para `SUPER_ADMIN` y `OPERATOR`. `inputs_snapshot` se reduce a metadatos no-PII (conteo de mascotas, booleano de foto del hogar, versión de plantilla, modo/modelo/región/resultado/timestamps), sin nombres ni biografías. Blindar o retirar el modo `echo` (sin `tEXt` en PNG en producción). | REQ-IA11-003, REQ-IA11-004; INV-IA11-002; ADR-011-03; SC-011-015..020; T1517..T1521 |
| `D11-09` = **A** | Solo el avatar de la mascota en el encabezado de su sección del informe público; excepción acotada a 005 vía enmienda MINOR en `T1534` (dictamen `/rama` + `/trinity`), sin claves de objeto, IDs internos ni EXIF. | REQ-VET11-002; INV-VET11-001; SC-011-035..040; T1534 |
| `D11-10` = **C** | Indicador compacto «Ya hay una foto del hogar guardada» + botón «Ver foto» que carga bajo demanda una miniatura de máx. 96 px (cero descarga del objeto en carga inicial); se mantienen ampliar/reemplazar/borrar. | REQ-HOG11-003; SC-011-041..044 |
| `D11-11` | Solo `PHOTO` (archivos clínicos fuera) de mascotas asignadas al hogar, incluidas fallecidas mientras sigan asignadas; foto del hogar excluida (`#59`). Agrupadas por mascota (alfabético; más recientes primero). Visibilidad: solo miembros activos y mascotas que ya puede ver (`REQ-RBAC-001`). Paginación de 24 fotos **por mascota** con carga progresiva por mascota sobre el endpoint de 004; álbum compuesto en la UI sin contrato ni ruta nuevos. | REQ-ALB11-001, 002, 003; SC-011-045..052; ADR-011-04; EDGE-011-006 |
| `D11-12` = **B+C** | Se confirma por escrito que **no existía tope** de hogares. Máximo **5** hogares activos por usuario (creados/propios + invitaciones aceptadas; `MAX_HOUSEHOLDS_PER_USER = 5` en `app-config.ts`), validado transaccionalmente al crear hogar y al aceptar invitación (`EDGE-011-008`: sin expulsar existentes). Sin tope separado de invitaciones pendientes. | REQ-HOG11-004; EDGE-011-008; SC-011-053..056 |
| `D11-13` = **D** | Subida propia con recorte reutilizando `AvatarCropper`, con copia opcional de `picture` de Google como valor inicial (SSRF: host cerrado `lh3.googleusercontent.com` + timeout + límite de tamaño + limpieza EXIF; fallback a iniciales `EDGE-011-007`; visible solo para la propia cuenta `REQ-PRF11-002`; borrada al eliminar la cuenta `INV-PRF11-001`). | REQ-PRF11-001, REQ-PRF11-002; INV-PRF11-001; EDGE-011-007; SC-011-057..062; T1553, T1555 |
| `D11-ORDEN` | Aprobado el orden de `plan.md`: Fase 0 → P1 (A `#64`, B `#72`, C `#73`, D `#63`) → P2 (E `#31`, F `#59`, G `#62`, H `#74`, I `#78`) → Fase final. | plan.md «Summary»; tasks.md |

## Derivadas ratificadas por Neo (Logos iter 226)
Ratificadas por Neo 2026-11-25 junto con ORA-1 (b) (Logos iter 226, mensaje registrado en `claude/log-morpheus.md`, entrada «Neo (Logos, iter 226)»).
- (a) El tope de 20 delegados cuenta `ACTIVE` + `INVITED` vigentes (no caducadas), comprobado en alta, anclaje y reactivación (`REQ-ADM11-001`; el acta `D11-03` dice «20 activos»).
- (b) Cancelar una invitación pendiente = `INVITED` → `DISABLED` (`STATE-ADM11-001`).
- (c) `REQ-ADM11-005` incluido en la Dep de `T1524`.
- (d) `ADMIN_DELEGATE_ROW_LIMIT = 100` como tope de filas totales (incluidas `DISABLED`).
- (e) Transición `REINVITE` (`INVITED` → `INVITED` y `DISABLED` sin `sub` → `INVITED`) para la re-invitación explícita (`H-1`).
- (f) `AdminSelfView` y la operación `getAdminSelf` (`GET /api/admin/me`).
- (g) Mismo `admin_id` en `admin_delegates` y `admin_identities`.
- (h) Tope evaluado antes de resolver el correo (anti-enumeración).

| Letra | Estado | Referencia |
| --- | --- | --- |
| ORA-1 (b) | ratificada (UNIQUE parcial por estado ACTIVE/INVITED, SQLite+PG) | Logos iter 226 |
| (a) | ratificada | Logos iter 226 |
| (b) | ratificada | Logos iter 226 |
| (c) | ratificada | Logos iter 226 |
| (d) | ratificada | Logos iter 226 |
| (e) | ratificada | Logos iter 226 |
| (f) | ratificada | Logos iter 226 |
| (g) | ratificada | Logos iter 226 |
| (h) | ratificada | Logos iter 226 |

## Hallazgo pendiente para `T1503`
La premisa «NOMBRE-HOGAR como pestaña propia» sigue sin confirmar en disco; `T1503` (prueba local de Neo) la cierra y registra aquí su resultado: `PENDIENTE`. Aclaración (ORA-3): es una **verificación de prueba local, no una decisión abierta**; no contradice «ninguna decisión de Neo queda abierta».


## Hallazgos de Fase 0 — resuelto por directiva Neo 2026-11-25

| Hallazgo | Estado | Resolución aplicada (spec / tasks) |
| --- | --- | --- |
| ORA-1..5 (`/oracle`, acta oracle-011-fase0) | resuelto por directiva Neo 2026-11-25 | Ya aplicados como texto (OBS-1..4 y ORA-1..5); la sección «Pendientes de Neo» se retira de `spec.md` |
| `F-03` (`/lock`) + `H-2a`/`H-2b` (`/trinity`) | resuelto por directiva Neo 2026-11-25 | `EDGE-011-011`: los correos de `ARGOS_ADMIN_EMAILS` cuentan como `SUPER_ADMIN` efectivos; total = \|`ARGOS_ADMIN_EMAILS`\| + \|delegados `SUPER_ADMIN` `ACTIVE`\|; en `NODE_ENV=production` el arranque rechaza la lista vacía (dev/test se permite); guarda serializada en un único servicio de dominio (`SELECT … FOR UPDATE` en PostgreSQL, `BEGIN IMMEDIATE` en SQLite) que cubre degradación, desactivación y alta/reactivación; prueba `T1525` |
| `F-05` (`/lock`) | resuelto por directiva Neo 2026-11-25 | `D11-06` = A aceptada sin reabrir; alcance dinámico de hogar = comportamiento vigente de 005 (`EDGE-011-005`); `EDGE-011-014` + aviso de UI «Incluye todas las mascotas asignadas a este hogar mientras esté activo»; prueba en `T1506`, implementación en `T1508` |
| `F-11` (`/lock`) | resuelto por directiva Neo 2026-11-25 | US2.1 y `REQ-IA11-002`: etiqueta de IA visible y accesible en todas las superficies web donde se muestre la escena, sin marca de agua en los bytes de descarga |
| `H-1` (`/trinity`) | resuelto por directiva Neo 2026-11-25 (aprobado) | Estado `INVITED` en `STATE-ADM11-001` (`INVITED` → `ACTIVE` ↔ `DISABLED`); caduca a las 72 h (constante en `app-config.ts`); tras caducar `DENIED` uniforme y re-invitación explícita; confirmación explícita del correo en el alta; alta y primer anclaje auditados; `REQ-ADM11-001`, `T1524`..`T1527` |
| `H-6` (`/trinity`) | resuelto por directiva Neo 2026-11-25 (aprobado; enmienda a `D11-01`) | Solo el administrador raíz (`ARGOS_ADMIN_EMAILS`) concede o revoca `SUPER_ADMIN`; los `SUPER_ADMIN` delegados gestionan solo `OPERATOR` y `SUPPORT`; no tocan a otros `SUPER_ADMIN` ni la lista raíz; autopromoción y auto-modificación prohibidas para cualquier rol; `REQ-ADM11-005` |
| `MIF-011-03` (`/mifune`) | resuelto por directiva Neo 2026-11-25 (SÍ) | Álbum del hogar compuesto en la UI sobre los endpoints de fotos por mascota de 004; sin contrato ni ruta nuevos ni cursor compuesto global; `T1542` queda N/A sin cambio |
| `MIF-011-04` (`/mifune`) | resuelto por directiva Neo 2026-11-25 (SÍ) | Se retira la incrustación del prompt en el `tEXt` del PNG de `FakeSceneImageGenerator` (modo `echo`); las pruebas de 006 verifican en memoria/espía; `T1517`, `T1521` |
| `MIF-011-10` (`/mifune`) | resuelto por directiva Neo 2026-11-25 (NO) | Migraciones SQLite y Postgres separadas por bloque (#63 en el Bloque D, #78 en el Bloque I) |
| `MER-11-01` (`/merovingian`) | resuelto por directiva Neo 2026-11-25 (aprobado) | `clinical-summary` y pruebas de 005 (`t750`/`t770`/`t778`) intactos; ruta dedicada `GET /api/shared/:token/pets/:petId/avatar`; enmienda MINOR de 005 en `T1534`; `credentials: 'omit'`, sin claves de objeto ni EXIF, `404` si no aplica; sujeta a `/rama` + `/trinity` |
| Paginación de `D11-11` | resuelto por directiva Neo 2026-11-25 | 24 fotos **por mascota**; orden alfabético por mascota, más recientes primero; carga progresiva por mascota sobre el endpoint de 004; `EDGE-011-017`, `T1543` sin condicionales |
| `D11-02` (2FA) | resuelto por directiva Neo 2026-11-25 (Opción D) | Delegados `@gmail.com` admitidos además de Workspace (coherente con `D11-03`); sin 2FA técnico en código; control operativo (2SV/passkey de Google obligatorio por política para `ARGOS_ADMIN_EMAILS` y delegados) más controles compensatorios (`H-1`, `H-6`, sin autopromoción, revocación inmediata en BD, sesión 30/10 min, auditoría); `T1532` cerrada sin tareas adicionales |

## Fuera de esta acta
- No se marca ninguna tarea `[x]`; `T1501` queda `[ ]` hasta que Neo firme el cierre formal.
- Constantes nuevas (`MAX_DELEGATES = 20`, `MAX_HOUSEHOLDS_PER_USER = 5`, miniatura 96 px, página 24) las implementa `/keymaker` en `app-config.ts` (Nivel 2 ya autorizado por esta directiva para su valor; las migraciones nuevas siguen requiriendo la autorización de cada tarea `[N2]`).

## Deuda operativa — Bloque C (ORA-3, 2026-11-25)
- **DEUDA-011-RETENCION-CONSOLA**: evidencia de retención en Cloud SQL y Cloud Logging, aportada manualmente por Neo fuera de agentes (consola de GCP). No bloquea el Bloque C; se revisa en el cierre de Feature (`T1559`). Relacionada con `EDGE-011-018`.
- **Pendiente de ratificación de Neo (ORA-2)**: con `D-1`, editar solo `speciesOther` o `breed` ya no genera cambio pendiente de escena (RABBIT/OTHER: raza libre no refresca la imagen). Recogido en `REQ-IA11-004`.


## Directiva de Neo 2026-11-25 (Logos iter 228) — ratificación de (i) y retención/privacidad de delegados

| Letra | Resolución de Neo | Aplicada en |
| --- | --- | --- |
| (i) | Índice único parcial `admin_delegates_active_subject`: **RATIFICADA** (se retira la etiqueta «DERIVADA»; queda «ratificada por Neo 2026-11-25») | spec `REQ-ADM11-006`, `EDGE-011-019`; anexo |
| D-1 | Conservación de delegados `DISABLED` = 12 meses (365 días), `ADMIN_DELEGATE_DISABLED_RETENTION_DAYS`; al vencer, anonimizar correo y `sub`, conservando `admin_id` opaco para `admin_audit_entries` | spec «Retención de delegados»; anexo |
| D-2 | Invitaciones `INVITED` caducadas: 30 días tras la caducidad de las 72 h, `ADMIN_DELEGATE_EXPIRED_INVITATION_RETENTION_DAYS`; al vencer, purga de la fila | ídem |
| D-3 | `admin_identities` (`sub` y correo) de un `DISABLED` se retiran/anonimizan al vencer el plazo de D-1; durante los 12 meses se conservan para reactivación (`D11-04`) | ídem |
| D-4 | Filtro en servidor del listado para `SUPER_ADMIN` delegado (solo `OPERATOR` y `SUPPORT`; nunca correos de otros `SUPER_ADMIN` delegados ni de la raíz); lo implementa `/keymaker` | `REQ-ADM11-003`, `NFR-011-002` |
| `DEUDA-011-PURGA-DELEGADOS` | Job de purga (D-1..D-3) en `/internal/maintenance` fuera de #63; hoy no se purga nada | spec; anexo |
| OBS-5 / `DEUDA-011-PRIVACIDAD-DELEGADOS` | `/privacidad` y `legal-texts.md` §3 sin tratamiento de delegados; ligada a revisión legal externa (0.1.0 DRAFT → 1.0.0); no dar de alta delegados externos en producción hasta actualizar `/privacidad`; no bloquea el cierre de código del Bloque D | spec; anexo |
