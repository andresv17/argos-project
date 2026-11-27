# Anexo T1632 — Cola de disputas en `/admin`: trazabilidad y contrato operativo (Bloque B, #23)

Estado: `DRAFT` (redactó `/architect` el 2026-11-27; **la aprobación a `APPROVED` es de Neo — Nivel 2**). Documento **nuevo** de la 012, **anexo a** `specs/011-*/contracts/admin-roles-annex.md` (`APPROVED`, 011): **no edita** 011 ni su `admin.openapi.yaml` (1.8.0). Describe qué debe cumplir la cola de disputas; **no** es todavía un OpenAPI (ver §10, decisión de Neo). Trazabilidad: `REQ-CHP12-004`, `REQ-CHP12-007`, `REQ-CHP12-008`, `REQ-CHP12-009`, `REQ-CHP12-010`, `REQ-OWN12-009`, `INV-CHP12-004`, `INV-CHP12-005`, `INV-CHP12-006`, `INV-CHP12-007`, `INV-CHP12-009`, `STATE-OWNREQ12-001`, `D12-07`, `EDGE-012-043`, `EDGE-012-060`, `EDGE-012-061`, `EDGE-012-064`, `SC-012-020`, `SC-012-080`, `SC-012-082`, `SC-012-098`, `SC-012-104`. Pendiente de revisión de `/trinity` (enumeración, evidencia, arbitraje) y `/rama` (evidencias y retención) dentro de `T1632`/`T1644`.

## 1. Alcance y principios

1. La cola gestiona filas de `owner_requests` con `action = CHIP_DISPUTE` (`CHIP_APPROPRIATION`, `CO_OWNER_ABSENT_OR_BLOCKING`, `PRINCIPAL_ABSENT`) en `UNDER_REVIEW`. La máquina es `STATE-OWNREQ12-001`; este anexo **no** añade estados.
2. **Cero transferencia automática** (`INV-CHP12-006`): ninguna ruta, temporizador, vencimiento ni cierre sin efecto cambia propietario ni co-propiedad. Un temporizador solo **ejecuta una decisión ya registrada por un humano** (§6).
3. **Sin cruce de identidad** (`INV-CHP12-007`, `Neo-K`): la cola ve el expediente; **ningún** aviso a propietarios, reclamante o `target` contiene la identidad ni la evidencia del otro.
4. Anti-enumeración: toda ruta de la cola responde según la política de `admin-roles-annex.md` §1 (sesión de administrador por `argos_admin_session`, nunca la de usuario; sin sesión: `404` uniforme; rol no autorizado: `403 ERR-ADM11-ROLE-NOT-AUTHORIZED` antes de leer el cuerpo).

## 2. Matriz de roles (deny-by-default, extiende la de 011 §1)

| Operación (nombre propuesto) | Ruta propuesta | `SUPER_ADMIN` | `OPERATOR` | `SUPPORT` |
| --- | --- | :-: | :-: | :-: |
| `listAdminDisputes` (cola, filtros, SLA) | `GET /api/admin/disputes` | sí | sí | **no** |
| `getAdminDispute` (expediente) | `GET /api/admin/disputes/{id}` | sí | sí | **no** |
| `getAdminDisputeEvidence` (URL firmada) | `GET /api/admin/disputes/{id}/evidence/{evidenceId}` | sí, si no es parte | sí, si no es parte | **no** |
| `extendAdminDisputeFreeze` (prórroga única) | `POST /api/admin/disputes/{id}/extend-freeze` | sí | sí | **no** |
| `resolveAdminDispute` (registra decisión) | `POST /api/admin/disputes/{id}/resolve` | sí | sí | **no** |
| `confirmAdminDisputeDecision` (segundo administrador) | `POST /api/admin/disputes/{id}/confirm` | sí | sí | **no** |
| `cancelAdminDisputeExecution` (cancela ventana de 72 h) | `POST /api/admin/disputes/{id}/cancel-execution` | sí | sí (solo el árbitro principal) | **no** |
| `closeAdminDisputeMoot` (cierre sin efecto) | `POST /api/admin/disputes/{id}/close-moot` | sí | sí | **no** |

Reglas: (a) **solo `SUPER_ADMIN` y `OPERATOR`**; `SUPPORT` queda fuera (no ve ni conoce la cola) y el `ADMIN` de **hogar** nunca arbitra (`lock R-13`); (b) el rol se lee **desde BD en cada petición y de nuevo dentro de la transacción de escritura** (`EDGE-011-015`), nunca de la cookie; (c) la cola figura en el **registro central** de rutas de 011 (prueba meta `T1525`: ruta montada y ausente del registro = falla); (d) `X-Argos-Request` obligatorio en toda escritura.

## 3. Quién puede arbitrar: el árbitro no es parte (`EDGE-012-043`)

Un administrador **no puede** abrir el expediente para decidir, confirmar, prorrogar ni cancelar si es, para esa disputa: propietario principal o co-propietario (cualquier estado ≠ `LEFT` ajeno al caso) de la mascota o de una mascota con ese chip, **reclamante**, `target` o solicitante de la disputa o de una solicitud sellada. La comprobación se hace por la cuenta de usuario vinculada al correo del administrador (si existe) y se repite **dentro de la transacción** de cada escritura. Incumplimiento: `403 ERR-CHP12-DISPUTE-ARBITRATION-CONFLICT` (cuerpo: «No puedes resolver este caso porque eres parte de él»), **sin** indicar el vínculo; la lectura de la evidencia por una parte se rechaza igual. El intento queda auditado (§8). La **recusación** es no discrecional: no existe «renuncia a la recusación».

## 4. Expediente: qué ve el árbitro

Por disputa: ancla (`chip_last4` + referencia interna del chip, o `pet_id` y `target_user_id` en las de ausencia), `dispute_reason`, estado, `created_at`, `frozen_until`, prórroga concedida, `expires_at` (60 días), SLA vencido o no, `slaDueAt`, `resolution`, `moot_reason`, historial de auditoría; **evidencia** (solo `CHIP_APPROPRIATION`): lista de archivos con tipo y tamaño, **sin** contenido en el listado. En ausencia: por cada solicitud sellada **creador, `created_at` y `expires_at`**, `target_last_active_at` (derivado, fuente fijada en `T1627`), `trigger_request_ids` y la **respuesta única del `target`** (≤ 280 puntos de código, texto plano, **escapada de salida**; se borra al resolver). Cuentas de los intervinientes: **seudonimizadas** cuando proceda (`rama`); el árbitro ve lo mínimo para decidir (`NFR-012-002`), **no** correo ni teléfono del reclamante ni de los propietarios.

## 5. Evidencia documental (`REQ-CHP12-008`, `INV-CHP12-004`)

1. **Tipos y topes**: PDF, JPEG, PNG, WebP (firma de contenido; nunca SVG ni HTML); `DISPUTE_EVIDENCE_MAX_FILES = 5` por disputa (mínimo 1 para `CHIP_APPROPRIATION`); topes de bytes por archivo y cuota de 004; EXIF y metadatos eliminados al subir; clave de almacén no derivable (`claims/{uuid}/{uuid}`).
2. **Descarga** (`getAdminDisputeEvidence`): solo `SUPER_ADMIN`/`OPERATOR` que **no sean parte** (§3); respuesta `302`/JSON con **URL firmada de ≤ 5 minutos**, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; **cada lectura se audita** (quién, disputa, archivo; **sin contenido**). Los propietarios actuales y el `target` **nunca** ven la evidencia.
3. **Retención**: `DISPUTE_EVIDENCE_RETENTION_DAYS = 365` desde el estado terminal (`RESOLVED` o `EXPIRED`) en disputas de chip; `DISPUTE_ABSENCE_RETENTION_DAYS = 90` en las de ausencia (sin chip ni evidencia obligatoria). Purga en el mantenimiento existente con borrado vía `media_deletion_queue`. Borrar la mascota o la cuenta del reclamante **no adelanta** el borrado; la identidad se seudonimiza y el expediente se conserva hasta `RESOLVED` + retención (`N2-R2`, `INV-CHP12-005`). La evidencia es **dato personal también en su contenido**: la interfaz de subida pide solo documentos que acrediten el chip (`rama R-A2`; texto del aviso en `legal-texts.md`, `T1643`).

## 6. Límites, SLA, congelación, vencimiento y cooldown

| Regla | Valor | Fuente | Comportamiento contractual |
| --- | --- | --- | --- |
| Disputas abiertas por usuario y ancla | 1 (chip, o `(pet_id, target_user_id)`) | `Neo-E` | `409 ERR-CHP12-DISPUTE-LIMIT`, solo tras las precondiciones de apertura |
| Simultáneas por usuario | `MAX_OPEN_DISPUTES_PER_USER = 3`, todas las clases | `Neo-E` | ídem; una de ausencia (sin chip) cuenta |
| SLA operativo | `DISPUTE_SLA_BUSINESS_DAYS = 15` días hábiles (lunes–viernes, sin festivos en el Escalón 1) | `Neo-E` | Vencido: el caso **escala a `SUPER_ADMIN`**, se marca vencido en la cola; **no cambia de estado** |
| Congelación inicial | `DISPUTE_FREEZE_MAX_DAYS = 30` desde la apertura (`frozen_until`) | `N2-R5` | Caduca sola; el caso **sigue `UNDER_REVIEW`** y la reserva del chip **no** caduca con ella |
| Prórroga de congelación | **Una sola** de `DISPUTE_FREEZE_EXTENSION_DAYS = 30` (`DISPUTE_FREEZE_MAX_EXTENSIONS = 1`) con **motivo obligatorio y auditado**; techo absoluto `DISPUTE_FREEZE_ABSOLUTE_MAX_DAYS = 60` desde la apertura | `N2-R5`, `EDGE-012-061` | Segunda prórroga o superar 60 días: rechazada (`409`, problema genérico de `/admin`); no hay efecto automático |
| Vencimiento del caso | `DISPUTE_MAX_OPEN_DAYS = 60` días calendario sin resolución | `P-1` | Pasa a `EXPIRED` (materialización perezosa y en el mantenimiento), `resolution = NULL`, **libera reserva y congelación**, **sin cooldown**, sin cambio de titularidad ni co-propiedad; auditoría y aviso en la aplicación sin identidad |
| Cooldown tras rechazo | `DISPUTE_REJECTED_COOLDOWN_DAYS = 90` | `N2-R5`, `EDGE-012-064` | Solo tras `REJECT` **decidido por `/admin`**, por `(solicitante, chip)` o `(solicitante, pet_id, target_user_id)`; **no** lo activan `moot_reason` ni `EXPIRED` |

## 7. Desenlaces cerrados y ejecución (`REQ-CHP12-009`, `INV-CHP12-006`)

**Desenlaces** (`resolution`, lista cerrada): `REJECT`; `ADD_CO_OWNER(claimant)`; `REQUEST_CHANGE_PRINCIPAL` (en `CHIP_APPROPRIATION` y `PRINCIPAL_ABSENT`); `END_CO_OWNERSHIP(target)` (**solo** `CO_OWNER_ABSENT_OR_BLOCKING`, con el disparador sellado de `REQ-OWN12-009`). No existe «eliminar mascota», «transferir» ni «expulsar al principal». Con la mascota inexistente el **único** desenlace es `REJECT` (cierre `moot_reason = PET_GONE`, sin cooldown; libera la reserva).

**Cierre sin efecto** (`closeAdminDisputeMoot`, o automático al revalidar): `resolution = REJECT` con `moot_reason` ∈ {`TARGET_LEFT`, `TARGET_NOT_ACTIVE`, `REQUESTER_NOT_ACTIVE`, `TRIGGER_LOST`, `PET_GONE`}; **no** activa el cooldown. El paso del tiempo no cuenta como `TRIGGER_LOST`.

**Control dual o ventana** — todo desenlace que **cambia titularidad** (`ADD_CO_OWNER`, `REQUEST_CHANGE_PRINCIPAL`, `END_CO_OWNERSHIP`) exige **una de dos** vías, elegidas al decidir:

1. **Control dual**: la decisión la registra el árbitro principal (`resolve`) y la **confirma un segundo administrador distinto** (`confirm`), que tampoco es parte (§3); ejecuta al confirmar.
2. **Ventana de aviso** `ARBITRATION_DELAY_HOURS = 72`: `resolve` registra la decisión humana con **motivo obligatorio**, fija `executes_after = now + 72 h` y deja el caso visible. **El temporizador no decide**: solo **ejecuta la decisión ya registrada**. Es **cancelable** por el árbitro principal hasta `executes_after` (`cancel-execution`): el caso vuelve a `UNDER_REVIEW` sin cambiar nada (`EDGE-012-060`, `SC-012-104`). **Antes de ejecutar** se **revalida bajo el bloqueo por mascota** (`REQ-OWN12-011`): sujeto (el `target` sigue siendo co-propietario `ACTIVE` no principal, o el principal en la variante `PRINCIPAL_ABSENT`), solicitante `ACTIVE`, solicitudes selladas siguen `EXPIRED` sin voto ni rechazo del `target`, y que ninguno de los participantes es hoy el árbitro. Si algo falla: cierre sin efecto con `moot_reason`, nunca ejecución parcial.

`REJECT` no cambia titularidad y **no** requiere control dual ni ventana (activa el cooldown de 90 días). Toda ejecución se hace en **una transacción** con `ownership_version + 1`, invalida solicitudes obsoletas (`STALE`) y registra auditoría. Tras `ENDED` rige `INV-OWN12-005`; la mascota **nunca** queda sin propietario `ACTIVE`.

## 8. Auditoría (`REQ-CHP12-007`)

Fila de auditoría por: apertura, lectura de evidencia, prórroga (con motivo), decisión (`resolve`, con motivo), confirmación, cancelación de ventana, ejecución, cierre sin efecto, vencimiento, **intento recusado**, escalado por SLA y `CHIP_CHANGED_DURING_DISPUTE`. Campos: administrador (id interno), disputa, acción, instante, resultado; **nunca** correo, chip completo (últimos 4), contenido de evidencia ni identidad cruzada. Registros de aplicación sin esos datos.

## 9. Avisos derivados (`REQ-CHP12-010`, sin tabla de notificaciones ni correo)

Propietarios actuales: «se abrió un caso de revisión sobre el microchip terminado en {últimos 4} de una de tus mascotas». Reclamante: estado de su solicitud por `listMyChipRequests` (`chip-claim.openapi.yaml`). `Target` de ausencia: aviso sobre su participación en la mascota compartida, durante la apertura y la ventana de 72 h, sin identidad del solicitante, evidencia ni chip. Una prueba verifica la ausencia de cuenta, hogar, nombre de mascota ajena, fecha y evidencia en el payload (`EDGE-012-028`, `T1645`).

## 10. Decisiones para Neo y deuda

1. **Aprobar** `DRAFT → APPROVED` de este anexo.
2. **¿Redactar `admin-disputes.openapi.yaml`?** `T1632` pide solo este anexo; la cola es una superficie nueva de `/admin` que `T1636` implementa. Recomendación del architect: una tarea `[ARCH]` posterior (p. ej. `T1648`, no existe) que traduzca §2–§8 a OpenAPI/schema sin editar 011. Sin ella, `keymaker` implementaría rutas sin contrato máquina.
3. **Conjunto de rutas y nombres de §2** son **propuestos** (no hay precedente en 011): quedan fijados al aprobar.
4. La **base legal** del tratamiento de la evidencia y el aviso del QR siguen en `DEUDA-012-LEGAL-DISPUTAS-QR` (`T1643`); la cola **no se habilita en producción** sin ella.
