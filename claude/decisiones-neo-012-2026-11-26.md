# Acta de decisiones de Neo — Feature 012 (Multidueño, Microchip y Cuidador)

**Fecha:** 2026-11-26 · **Autoridad:** `Neo` (Andrés Vallejo, Nivel 2) · **Transcribe:** `/architect` por directiva de `/morpheus` (aprobada por Neo en Logos).
**Estado del acta:** transcripción de resoluciones **cerradas (no se reabren)**. La firma/lectura final y el marcado `[x]`/`APPROVED`/`LOCKED` corresponden solo a Neo; este documento no cambia ningún estado normativo.
**Aplicada a:** `specs/012-multiduenio-microchip-cuidador/{spec,plan,tasks,data-model,quickstart,research}.md` y `contracts/README.md` (todo en `DRAFT`, sin `[x]`).

## 1. Resoluciones

| ID | Resolución | Artefactos donde se aplicó |
| --- | --- | --- |
| D12-ORDEN | **A**: `#22` → `#23` → `#26` → `#32` → `#81` | plan.md (Summary, riesgo 7), tasks.md (cabecera, Bloque E), quickstart.md |
| D12-01 | Tope de 3 propietarios por mascota (principal incluido); máximo 2 aprobaciones | REQ-OWN12-003, SC-012-004, data-model `pet_co_owners` |
| D12-02 | `owner_user_id` principal + tabla `pet_co_owners` | REQ-OWN12-001, ADR-012-01 |
| D12-03 | Aprobación de TODOS los demás para eliminar, transferir, invitar y cambiar principal | REQ-OWN12-004 |
| D12-04 | Nunca expulsión (ni unilateral ni por aprobación); solo salida voluntaria o disputa | REQ-OWN12-004/006, SC-012-007 |
| D12-05 | Cada co-propietario gestiona solo sus asignaciones; respaldo solo del principal | REQ-OWN12-007/008 |
| D12-06 | Unicidad global entre mascotas vivas, índice parcial | REQ-CHP12-006, data-model |
| D12-07 | Cola de disputas en `/admin` (`SUPER_ADMIN`/`OPERATOR`), evidencia documental, cero transferencia automática | REQ-CHP12-004, SC-012-020, ADR-012-08, T1632/T1636 |
| D12-08 | Duplicados legados `CHIP_CONFLICT`, ambos conservados, aviso a ambos dueños | REQ-CHP12-006, SC-012-023, T1635 |
| D12-09 | Cuidador = miembro `CAREGIVER` del hogar + `careUntil` opcional | REQ-CAR12-006 |
| D12-10 | `VIEW_ONLY`/`BASIC_LOG` por mascota y cuidador; conserva permisos clínicos vigentes de `CAREGIVER` | REQ-CAR12-004 |
| D12-11 | Dosis estructurada + instrucciones, sujeta a `/maggie` | REQ-CAR12-001, T1606 |
| D12-12 | `America/Bogota` fija en Escalón 1 + `DEUDA-012-TZ` | REQ-CAR12-003, alcance |
| D12-13 | `OVERDUE_GRACE_MINUTES=60`, `CARE_LOG_UNDO_MINUTES=10`, `CARE_LOG_BACKFILL_HOURS=24`, `MAX_ROUTINES_PER_PET=20`, `CARE_LOG_RETENTION_DAYS=365` | REQ-CAR12-001..003/007 |
| D12-14 | Teléfono E.164 opcional con opt-in; máx. 2 de propietarios distintos; activar QR exige teléfono visible o alergias | REQ-QR12-001/003/004, SC-012-041/047, `ERR-QR12-ACTIVATION-REQUIREMENTS` |
| D12-15 | 0-5 textos de 1-60, revisión de `/maggie` | REQ-QR12-002 |
| D12-16 | Contenido público: nombre + alergias críticas + teléfono | REQ-QR12-004 |
| D12-17 | Codificador QR propio y puro en `src/domain/`, sin dependencias npm; `package.json` intacto (Principio VI) | REQ-QR12-005, NFR-012-003, SC-012-070, ADR-012-07, T1672 |
| D12-18 | `last_scanned_at` sin IP | REQ-QR12-007, data-model |
| D12-19 | Alcance `PETS` estático; revoca parcialmente `D11-06 = A` | REQ-VET12-001 |
| D12-20 | Enlace vivo con las restantes; `404` uniforme con 0 elegibles | REQ-VET12-003, SC-012-057/058 |
| D12-21 | `MAX_SHARE_LINK_PETS=20`; cuenta como 1 enlace del hogar de origen (REQ-VET-012) | REQ-VET12-001, SC-012-066 |

**Constantes** en el módulo nuevo `src/domain/platform/feature-012-limits.ts`; `app-config.ts` no se toca (`H-01`). Se añadieron como derivadas de las resoluciones: `MAX_CO_OWNERS_PER_PET=3`, `MAX_CRITICAL_ALLERGIES=5`, `MAX_EMERGENCY_PHONES=2`, `QR_URL_MAX_BYTES=106`.

## 2. Enmiendas pendientes (no aplicadas a contratos `APPROVED`/`LOCKED`; solo las firma Neo)
1. **ENM-002-MINOR-012** — `INV-ACC-002` («`U` es propietario principal o co-propietario `ACTIVE`»), filas críticas de `REQ-RBAC-001` (eliminar/transferir pasan a aprobación conjunta), `REQ-OWN-001` (transferencia pasa por `TRANSFER_PRINCIPAL`/`CHANGE_PRINCIPAL`), invariante de hogar de 002 (por `assigned_by_user_id`) y eliminación de cuenta (`ERR-ACCOUNT-OWNS-SHARED-PETS`). Origen: D12-02/03/04/05. Tarea `T1611`.
2. **ENM-002-MINOR-012-CHIP** — fin de la exclusión de «unicidad global de microchip» de 002; `ERR-PET-MICROCHIP-DUPLICATE` convive con `ERR-CHP12-MICROCHIP-REGISTERED`; `chip_conflict`. Origen: D12-06/08. Tarea `T1631`.
3. **ENM-005-MINOR-012** — alcance `PETS` en `share-link`, `clinical-summary` y OpenAPI de 005; **revocación parcial de `D11-06 = A`** (D12-19); `REQ-VET-002` (elegibilidad por co-propiedad), `REQ-VET-011` (creador principal o co-propietario `ACTIVE`), `REQ-VET-012` (el enlace `PETS` cuenta como 1 del hogar de origen, D12-21). Tarea `T1690`.
4. **Anexo a `admin-roles-annex.md` de 011** (documento nuevo `admin-disputes-annex.md`): cola de disputas para `SUPER_ADMIN`/`OPERATOR`. Origen D12-07. Tarea `T1632`.
5. **`REQ-RBAC-001` NO se enmienda por D12-10 = A**: `VIEW_ONLY`/`BASIC_LOG` son una concesión adicional por mascota que gobierna rutinas y registros de cuidado y nunca resta permisos de `CAREGIVER`. (Enmienda pendiente solo por el punto 1.)
6. **Aditivos de contrato de cuenta/mascota** (`phone`, `showPhoneOnEmergencyCard`, `criticalAllergies`) y, si Neo lo pide después, del sobre de respaldo: anexo de 012 en `DRAFT` (T1670), sin editar 002/004.

## 3. Correcciones técnicas del arquitecto (Nivel 1, derivadas de las resoluciones)
- **QR versión máxima:** `research.md` R-4 decía «versión 1-4, URL ~60 caracteres». Versión 4-M admite 62 bytes; token de 43 caracteres + dominio los supera. Con `D12-17 = B` el codificador propio cubre **versiones 1-6, nivel M, modo byte (106 bytes en 6-M)**; `QR_URL_MAX_BYTES = 106`, falla cerrada al activar si la URL lo supera.
- Nuevo error `ERR-QR12-ACTIVATION-REQUIREMENTS` (D12-14). Nueva constante `MAX_EMERGENCY_PHONES = 2`.

## 4. Puntos de detalle que las resoluciones no cubren (para las auditorías previas; no son decisiones D12 nuevas ni se reabren)
1. **QR ya `ON` que pierde la condición D12-14** (el titular borra su teléfono visible, se elimina su cuenta —`EDGE-012-020`— o se vacían las alergias): ¿pasa a `OFF` automáticamente o se tolera? Sugerido a `/lock`/`/trinity`: pasar a `OFF` (falla cerrada). Hoy la spec no lo fija.
2. **Desempate con 3 propietarios que optaron por mostrar teléfono** (máx. 2): valor de trabajo «principal primero, luego por `joined_at`»; confirmar con `/rama`.
3. **Mecanismo del aviso a ambos dueños en `CHIP_CONFLICT` (D12-08)**: no existe canal de notificación; se asume aviso dentro de la aplicación + auditoría. `/mifune` valida el costo; `/rama` valida que el aviso no filtre la identidad del otro dueño.
4. **Evidencia documental de disputas (D12-07)**: tipos, tamaño, retención y base legal los dictamina `/rama`; almacén de 004.
5. **Parámetros sin resolución de Neo** (valores de trabajo): `CO_OWNER_INVITE_TTL_DAYS=7`, `OWNER_APPROVAL_TTL_DAYS=7`, `CHIP_CLAIM_TTL_DAYS=14`, `CHIP_CLAIM_COOLDOWN_DAYS=30`, `MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY=5` (superada por `N2-R4`: 10), `QR_SCAN_MAX_PER_IP_PER_MINUTE=30`, `CHIP_TIMING_TOLERANCE_MS=20` (retirada); los fijan `/trinity` y `/rama`.
6. **Interacción D12-10 y `careUntil` con rol `CAREGIVER` sin fila de nivel**: el diseño dice «sin fila, conserva permisos actuales y el Modo Cuidador por defecto es `VIEW_ONLY`»; `/kid` y `/seraph` lo verifican en el cierre del Bloque C.
7. **D12-05 y disputas/aprobaciones cuando un co-propietario ausente bloquea acciones críticas**: falla cerrada; la salida es la salida voluntaria del ausente o la disputa (ya documentado en `research.md` R-1).

## 5. Estado para las auditorías previas
Paquete listo para `/trinity`, `/rama`, `/maggie`, `/lock`, `/merovingian` y `/mifune`: sin decisiones D12 abiertas en `spec.md`; contratos aún sin redactar (se redactan tras las auditorías, `T1610..`); ningún contrato `LOCKED`/`APPROVED`, `src/`, `package.json`, `H-01` ni `specs/005/tasks.md` tocado; cero `[x]` nuevos; sin commit ni push.


---

# Adenda 2026-11-26 — Resoluciones de Fase 0 `Neo-A..Neo-Q` (directiva de Neo por Logos vía `/morpheus`)

**Transcribe:** `/architect` (pase único, subagente). **Estado:** resoluciones **cerradas (no se reabren)**; no cambian ningún estado normativo (todo sigue `DRAFT`, sin `[x]`, sin `APPROVED`/`LOCKED`). Aplicadas en `specs/012-multiduenio-microchip-cuidador/{spec,plan,data-model,tasks,research,quickstart}.md` y `contracts/README.md`. Insumos: `.specify/memory/audits/{maggie,rama,lock,merovingian,mifune,trinity}-012-fase0-2026-11-26.md`.

## A. Resoluciones

| ID | Resolución de Neo | Dónde se aplicó |
| --- | --- | --- |
| **Neo-A** | Cero expulsión unilateral (`D12-04`). Válvula 1: el principal sale (`LEAVE`) sin aprobación si queda ≥ 1 co-propietario `ACTIVE`; el más antiguo pasa a principal en la misma transacción. Válvula 2: abandono o bloqueo malicioso → disputa formal en `/admin` (`D12-07`). | `REQ-OWN12-006/009`, `EDGE-012-005/036`, `SC-012-071/072`, ADR-012-09 (precisada por `N2-R1` y `N2-R3`, adenda `N2-R` más abajo) |
| **Neo-B** | Confirmado: `VIEW_ONLY` limita solo rutinas y registros de cuidado; no restringe permisos clínicos heredados de `CAREGIVER` (`D12-10 = A`). | US3.3, `REQ-CAR12-004`, `SC-012-030/077`, `EDGE-012-049` |
| **Neo-C** | Contar todo intento de alta o edición con `microchipId` por usuario e IP (tras `ARGOS_TRUST_PROXY_HOPS`); eliminar el oráculo por `429`. | `REQ-CHP12-005`, `SC-012-021/078`, `EDGE-012-046` |
| **Neo-D** | Confirmado: QR a `OFF` automático en la misma transacción al perder `D12-14`; hash invalidado, `404` uniforme, auditoría `EMERGENCY_CARD_AUTO_DEACTIVATED`, aviso en UI; regenerar desde `OFF` exige guarda + consentimiento + token nuevo. | `REQ-QR12-010`, `EDGE-012-023..025`, `SC-012-083`, ADR-012-10 |
| **Neo-E** | Máx. 1 disputa abierta por usuario y por chip; máx. 3 simultáneas por usuario; SLA 15 días hábiles; congelación automática caduca a 30 días si `/admin` no la prorroga. | `REQ-CHP12-004`, `SC-012-080`, `EDGE-012-039` |
| **Neo-F+L** | El chip sigue bloqueado al fallecer la mascota; índice global de 004 (SQLite 0008, PG 0004) intacto; la enmienda es solo split de error (`ERR-PET-MICROCHIP-DUPLICATE` mismo dueño / `ERR-CHP12-MICROCHIP-REGISTERED` otro dueño). | `REQ-CHP12-001/006`, `ENM-002-MINOR-012-CHIP`, `SC-012-079`, `EDGE-012-050` |
| **Neo-G+Q** | Sin duplicados legados (índice de 004); precheck estricto (`SC-CAT-025`) se mantiene; `CHIP_CONFLICT` se retira (cierra `merovingian H-04/H-05`, `lock H-05/H-11`). `D12-08` queda **retirada**. | `REQ-CHP12-006`, `SC-012-023` |
| **Neo-H** | Aprobado: IDs de 002 (`INV-ACC2-001/002`, `INV-OWN2-001`); `ENM-005` dividida en `ENM-005-A` (Bloque A) y `ENM-005-E` (Bloque E). | `REQ-OWN12-005/008`, `T1611`, `T1624`, `T1690` |
| **Neo-I** | Teléfono por mascota (opt-in explícito por tarjeta QR); máx. 2: principal primero, luego co-propietario más antiguo, deduplicado. | `REQ-QR12-004/006`, `SC-012-084`, ADR-012-11 |
| **Neo-J** | Evidencias de disputa: 365 días tras `RESOLVED` (purga en mantenimiento). Deuda `DEUDA-012-LEGAL-DISPUTAS-QR` (revisión legal externa de `0.1.0` a `1.0.0`: QR, teléfono, disputas). | `REQ-CHP12-008`, `SC-012-082`, `T1643`, `T1682` |
| **Neo-K** | Jamás exponer la identidad del otro dueño en avisos o disputas. | `REQ-CHP12-010`, `SC-012-090`, `T1645` |
| **Neo-M** | `redactSecrets` en código (Bloque D) para `/e/` y `/api/emergency/`; exclusión en `terraform/logging.tf` = `DEUDA-012-TERRAFORM-LOGS-QR` (rama de infra antes de activar el QR en producción); no se toca `terraform/`. | `REQ-QR12-008`, `SC-012-086`, `T1680`, `T1681` |
| **Neo-N** | Token QR visible una sola vez al activar o regenerar (descarga inmediata SVG, PNG o A6); solo hash SHA-256 en BD; sin KMS. | `REQ-QR12-003`, `SC-012-052/085` |
| **Neo-O** | Vectores externos como fixtures; cero devDependency; `package.json` intacto. | `REQ-QR12-005`, `SC-012-049/070` |
| **Neo-P** | Aprobadas `P-01`, `P-03`, `P-04`, `P-09`, `P-10`, `P-12`, `P-15`, `P-17`; incorporar `lock H-03, H-04, H-07, H-10, H-13, H-14, H-16, H-20..H-22`. | todo el paquete |
| **Neo-Maggie 1-5** | `UNIT` retirado, `MCG` añadido; QR a `OFF` con texto de alergias inequívoco; textos de aviso del QR; umbrales de captura (`DEUDA-012-VALIDACION-VET-UMBRALES`); retención `MEDICATION` 1095 días, `MEAL`/`WALK`/`OTHER` 365. Correcciones `M-2`, `M-3`, `M-4`, `M-6`, `M-7`, `m-1`, `m-5`. | `REQ-CAR12-*`, `REQ-QR12-002/004/006` |

## B. Valores de trabajo confirmados (de `/trinity` §5) y nuevos
`CO_OWNER_INVITE_TTL_DAYS = 7`, `OWNER_APPROVAL_TTL_DAYS = 7`, `CHIP_CLAIM_TTL_DAYS = 14`, `CHIP_CLAIM_COOLDOWN_DAYS = 30`, `MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY = 5`, `QR_SCAN_MAX_PER_IP_PER_MINUTE = 30`, `MAX_OPEN_DISPUTES_PER_USER = 3`, `DISPUTE_EVIDENCE_MAX_FILES = 5`, `ARBITRATION_DELAY_HOURS = 72`, `QR_LAST_SCANNED_GRANULARITY_MINUTES = 60`, `CO_OWNER_INVITES_PER_USER_PER_DAY = 5`. (`MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY = 5` de esta lista queda **superada por `N2-R4`: 10**.) Derivadas de las resoluciones: `DISPUTE_SLA_BUSINESS_DAYS = 15`, `DISPUTE_FREEZE_MAX_DAYS = 30`, `DISPUTE_EVIDENCE_RETENTION_DAYS = 365`, `CARE_LOG_RETENTION_DAYS_MEDICATION = 1095`, `MAX_OPEN_DISPUTES_PER_USER_PER_CHIP = 1`. Valores propuestos por `/trinity` que **Neo fijó en `N2-R4`**: `MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY = 10`, `MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY = 30`, `MICROCHIP_LOOKUP_GLOBAL_MAX_PER_DAY = 1000` (alerta al 70 %). **Retirada** `CHIP_TIMING_TOLERANCE_MS` (ni constante ni gate).

## C. Enmiendas (todas en `DRAFT`, anexos nuevos; solo Neo las aprueba)
`ENM-002-MINOR-012` (Bloque A, `T1611`), `ENM-005-A` (Bloque A, `T1624`), `ENM-002-MINOR-012-CHIP` (Bloque B, `T1631`, reencuadrada como split de error), `ENM-005-E` (Bloque E, `T1690`), `admin-disputes-annex.md` (`T1632`). El punto 3 de §2 de esta acta (`ENM-005-MINOR-012`) queda **sustituido** por `ENM-005-A` + `ENM-005-E`; el punto 2 (`ENM-002-MINOR-012-CHIP`) queda **reencuadrado**: ya no habla de fin de una exclusión de unicidad global (premisa falsa).

## D. Decisiones del arquitecto (Nivel 1) para resolver conflictos entre actas, a confirmar en la re-auditoría
1. **Escaneo QR por IP**: contador en memoria acotado por instancia (`trinity H-17`) y `ip_rate_events` solo para el límite de chip (24 h); si `/trinity` exige persistencia, se usa la tabla (`rama F-08`).
2. **Tope de rutinas** (`maggie m-1`): cuenta solo rutinas activas (20), con techo absoluto de 100 filas por mascota, porque el versionado de dosis (`M-7`) crea filas nuevas.
3. **`UNDER_REVIEW` no expira** (`trinity`) pero la **congelación** caduca a los 30 días (`Neo-E`).
4. **Supresión de cuenta del principal** (`trinity H-01` + `rama F-05`): sucesión automática; nunca se destruyen mascotas con co-propietarios; `ERR-ACCOUNT-OWNS-SHARED-PETS` solo donde no hay sucesor.
5. **Desenlace `END_CO_OWNERSHIP`** (solo disputa `CO_OWNER_ABSENT_OR_BLOCKING`): derivado de `Neo-A` Válvula 2 y `INV-OWN12-002`; control dual o ventana de 72 h. Confirmado y acotado por `N2-R1` (disparador objetivo).
6. **Formato del chip** (`lock H-21`): el cliente normaliza espacios y guiones; el servidor exige `^\d{15}$` y un valor inválido no cuenta como intento.
7. **`SKIPPED`** (`lock EDGE-012-048`): lo marcan propietarios, co-propietarios, `ADMIN` y cuidadores `BASIC_LOG`; dictamen de `/maggie` pendiente.
8. **Avisos** sin tabla de notificaciones: estado derivado en la interfaz (banner por disputa abierta, por ficha apagada o rotada).

## E. Puntos que quedan sin resolver
- ~~Cifras de `MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY` y `MICROCHIP_LOOKUP_GLOBAL_MAX_PER_DAY`~~ (resueltas por `N2-R4`).
- Texto exacto de `INV-HOUSE-004` (002) y confirmación de IDs en `ENM-002-MINOR-012` (`/mouse`).
- `P-07`, `P-08`, `P-11`, `P-13` y `P-18` de `/mifune`: no aprobados por Neo; no aplicados (estados de co-propietario, `version` de filas, nivel de cuidador como concesión, `position`, job de purga).
- Calendario de festivos para el SLA de 15 días hábiles (Escalón 1: lunes a viernes, sin festivos).
- Dictamen de `/maggie` sobre `SKIPPED` y validación veterinaria humana de los umbrales (`DEUDA-012-VALIDACION-VET-UMBRALES`); revisión legal externa (`DEUDA-012-LEGAL-DISPUTAS-QR`); exclusión de logs en la plataforma (`DEUDA-012-TERRAFORM-LOGS-QR`) antes de activar el QR en producción.
- `/sati`: lectura física del QR de 30 mm en A6 y PNG en cliente.

---

# Adenda 2026-11-26 (II) — Resoluciones `N2-R1..N2-R5` y registro de residuales de las re-auditorías

**Autoridad:** `Neo` (Nivel 2, directiva por Logos vía `/morpheus`, definitivas, no se reabren). **Transcribe y aplica:** `/architect` (pase correctivo único, subagente). **Estado normativo:** sin cambio; todo sigue `DRAFT`, sin `[x]`, sin `APPROVED`/`LOCKED`. Insumos: `.specify/memory/audits/{lock,trinity,rama}-012-reauditoria-2026-11-26.md`. Aplicadas en `specs/012-multiduenio-microchip-cuidador/{spec,plan,data-model,tasks,quickstart,research}.md` y `contracts/README.md`.

## F. Resoluciones de Neo `N2-R1..N2-R5`

| ID | Resolución definitiva | Dónde se aplicó |
| --- | --- | --- |
| **N2-R1** | Disparador objetivo para `END_CO_OWNERSHIP` (disputa por abandono o bloqueo del co-propietario) y para el principal ausente (`R-07`): ≥ 2 solicitudes críticas expiradas en 60 días con el `target` en `approver_set`, sin voto ni rechazo suyo; `target` ≠ principal (en `END`); ancla única `(pet_id, target_user_id)`; congelación por `pet_id` que permite el `LEAVE` voluntario del `target`; resuelve la cola de `/admin` con aviso y respuesta de 280 caracteres. | `REQ-OWN12-009`, `INV-OWN12-006`, `EDGE-012-036/055..057`, `SC-012-091..093`, `T1627` |
| **N2-R2** | Supresión de cuenta del único propietario con disputa `UNDER_REVIEW`: el chip queda reservado/congelado mientras la disputa esté abierta (sin liberar ni bypass); datos personales borrados o seudonimizados según `/rama`. | `REQ-OWN12-008` (c), `REQ-CHP12-004`, `INV-CHP12-009`, `EDGE-012-053/054`, `SC-012-096/097`, `T1646` |
| **N2-R3** | Sucesión híbrida confirmada: `LEAVE` del principal con designación opcional de co-propietario `ACTIVE`; si no designa (o por eliminación de cuenta) hereda el `ACTIVE` más antiguo por `joined_at ASC, user_id ASC`, en la misma transacción con bloqueo por mascota (`R-02`), aviso en la aplicación y auditoría `PRINCIPAL_AUTO_PROMOTED`. **Alinea esta adenda con `spec.md` (`R-04`)**: el criterio es `joined_at` (no `created_at`) y no existe columna `created_at` en `pet_co_owners`. | `REQ-OWN12-006`, `REQ-OWN12-011`, `INV-OWN12-007`, `EDGE-012-051/052/058`, `SC-012-094/095` |
| **N2-R4** | `MICROCHIP_LOOKUP_MAX_PER_USER_PER_DAY = 10`, `MICROCHIP_LOOKUP_MAX_PER_IP_PER_DAY = 30`, `MICROCHIP_LOOKUP_GLOBAL_MAX_PER_DAY = 1000` con alerta al 70 %; se cuenta todo intento con `microchipId`; oráculo `201`/`409` residual **aceptado explícitamente** (`409` uniforme sin PII y sin endpoint de consulta). **Divergencia registrada:** `/trinity` propuso 5 por usuario; Neo fija 10 y prevalece (IP y global coinciden con `/trinity`). | `REQ-CHP12-005`, `SC-012-100`, `T1640` |
| **N2-R5** | Máximo 1 prórroga de congelación de 30 días por `/admin` (techo absoluto 60 días calendario); cooldown de 90 días tras rechazo de disputa por par `(solicitante, chip)`: `DISPUTE_REJECTED_COOLDOWN_DAYS = 90`. | `REQ-CHP12-004`, `EDGE-012-061/064`, `SC-012-098` |

Constantes nuevas (`feature-012-limits.ts`): `MICROCHIP_LOOKUP_GLOBAL_ALERT_PCT = 70`, `DISPUTE_FREEZE_EXTENSION_DAYS = 30`, `DISPUTE_FREEZE_MAX_EXTENSIONS = 1`, `DISPUTE_FREEZE_ABSOLUTE_MAX_DAYS = 60`, `DISPUTE_REJECTED_COOLDOWN_DAYS = 90`, `ABSENCE_MIN_EXPIRED_REQUESTS = 2`, `ABSENCE_WINDOW_DAYS = 60`, `ABSENCE_RESPONSE_MAX_CHARS = 280`.

## G. Registro de residuales de `/lock` (`R-01..R-16`) — estado tras el pase

| R | Sev. | Cierre | Dónde |
| --- | --- | --- | --- |
| R-01 | ALTA | **CERRADO** (`N2-R1`): precondición objetiva, ancla `(pet_id, target_user_id)` con `chip_*` `NULL`, congelación por `pet_id`, `LEAVE` permitido | `REQ-OWN12-009`, `data-model` (`owner_requests`) |
| R-02 | ALTA | **CERRADO**: bloqueo por mascota (`FOR UPDATE` PG, `BEGIN IMMEDIATE` SQLite), revalidación y `UPDATE … WHERE` en `LEAVE`, designación, promoción, aceptación, `END` y supresión; orden `pet_id ASC` | `REQ-OWN12-011`, `NFR-012-008`, `EDGE-012-051/052`, `SC-012-095` |
| R-03 | ALTA | **CERRADO** (`N2-R2` + reserva): alta o edición con chip en disputa = mismo `409`, aunque caduque la congelación o la mascota ya no exista | `REQ-CHP12-004`, `INV-CHP12-009`, `SC-012-096/097` |
| R-04 | ALTA | **CERRADO** (`N2-R3`): adenda alineada; auditoría `PRINCIPAL_AUTO_PROMOTED` (y `PRINCIPAL_SUCCESSOR_DESIGNATED` para la designada); el nombre `CO_OWNER_PROMOTED` se retira | esta adenda, `REQ-OWN12-006`, `data-model` |
| R-05 | MEDIA | **CERRADO** (`N2-R5`): una prórroga, techo 60 días, cooldown 90 días | `REQ-CHP12-004`, `SC-012-098` |
| R-06 | MEDIA | **CERRADO**: índice de claims `(requester, chip_hmac)`; cooldown con la misma ancla; la disputa por ausencia cuenta para las 3 simultáneas | `data-model`, `REQ-CHP12-003`, `SC-012-102` |
| R-07 | MEDIA | **CERRADO** (`N2-R1`): variante `PRINCIPAL_ABSENT` con `REQUEST_CHANGE_PRINCIPAL` (rotación del ancla, no expulsión) | `REQ-OWN12-009`, `SC-012-093` |
| R-08 | MEDIA | **CERRADO en texto**: desactivar rutas de transferencia de 002 antes de migrar o ventana de mantenimiento; ejecuta `/link` | `NFR-012-010`, `plan` riesgo 12, `T1626`, `SC-012-105` |
| R-09 | MEDIA | **CERRADO** (`N2-R4`) | `REQ-CHP12-005`, `SC-012-100` |
| R-10 | BAJA | **CERRADO**: límite efectivo N × 30/min documentado; `ip_rate_events` `QR_SCAN` si se exige exactitud | `REQ-QR12-007`, `SC-012-109` |
| R-11 | BAJA | **CERRADO**: listado autenticado «mis solicitudes»; el `202` no lleva `claimId` | `REQ-CHP12-003`, `SC-012-101` |
| R-12 | BAJA | **CERRADO**: unificado en `CANCELLED` (conserva auditoría 90 días) | `EDGE-012-034`, `data-model` |
| R-13 | BAJA | **CERRADO**: árbitro `SUPER_ADMIN`/`OPERATOR` | `EDGE-012-043`, `REQ-CHP12-009` |
| R-14 | BAJA | **CERRADO**: el temporizador de 72 h solo ejecuta una decisión humana registrada y es cancelable | `REQ-CHP12-009`, `EDGE-012-060`, `SC-012-104` |
| R-15 | BAJA | **CERRADO**: expiración perezosa y frontera `[created_at, expires_at)` | `REQ-OWN12-004` (e), `EDGE-012-059`, `SC-012-103` |
| R-16 | BAJA | **ABIERTO (no bloquea el texto, sí la aprobación)**: dictamen de `/maggie` sobre `SKIPPED`/`DONE` tardío y dictamen legal de `/rama` (`DEUDA-012-LEGAL-DISPUTAS-QR`) | `REQ-CAR12-003`, `EDGE-012-048` |

## H. Residuales de `/trinity` (`R-01..R-09`) y `/rama` (`R-01..R-10`) no cubiertos arriba

| Fuente | Cierre | Dónde |
| --- | --- | --- |
| trinity R-01 | cubierto por `N2-R1` (incluye aviso y respuesta del `target`, `moot_reason`) | `REQ-OWN12-009` |
| trinity R-02 | cifras en `N2-R4`; alerta 70 % y no bloqueo de altas sin chip como criterio de `T1640` | `REQ-CHP12-005`, `T1640` |
| trinity R-03 | cubierto por `N2-R3` (designación opcional) | `REQ-OWN12-006` |
| trinity R-04 | evento persistido antes de resolver y fuera de la transacción de negocio; falla cerrada | `REQ-CHP12-005`, `data-model`, `SC-012-100` |
| trinity R-05 | reserva del chip + clave HMAC con etiqueta de dominio distinta; la supresión del principal con co-propietarios nunca borra mascotas (con o sin disputa) | `REQ-CHP12-004/005`, `REQ-OWN12-008` (c), `SC-012-099` |
| trinity R-06 | fila de consentimiento borrada al `LEFT`/`ENDED`/cuenta; consentimiento ligado a `phone_hmac` | `REQ-QR12-006`, `data-model`, `SC-012-106` |
| trinity R-07 | respuesta del token con `no-store`, sin almacén de idempotencia, registros ni medios | `REQ-QR12-003`, `SC-012-109` |
| trinity R-08 | `DEUDA-012-TERRAFORM-LOGS-QR` como criterio bloqueante (`T1685`); retención de `ip_rate_events` aclarada | `REQ-QR12-008`, `data-model`, `SC-012-107` |
| trinity R-09 | `username` sellado en `INVITE_CO_OWNER`, borrado al decidir | `REQ-OWN12-002`, `data-model`, `SC-012-110` |
| rama R-01 | criterio de release bloqueante | `T1685`, `SC-012-107` |
| rama R-02 | bloqueo en la supresión de cuenta | `REQ-OWN12-008` (c), `REQ-OWN12-011` |
| rama R-03 | `ERR-ACCOUNT-OWNS-SHARED-PETS`: supuesto exacto (principal sin co-propietario `ACTIVE`, mascota compartida según 002) | `REQ-OWN12-008` (c), `SC-012-099`, `T1611` |
| rama R-04 | `rejected_by` con FK `SET NULL` y seudónimo; `approver_set`; `share_links.pet_owner_user_id_at_creation` | `data-model`, `SC-012-108`, `T1622` |
| rama R-05 | sin cascada en ningún estado | `REQ-CHP12-008`, `data-model` |
| rama R-06 | matriz de retención de `ip_rate_events` corregida | `data-model` |
| rama R-07 | SC de paridad E.164 | `SC-012-110`, `T1674` |
| rama R-08 | fallecida → ficha `OFF` (`AUTO_PET_DECEASED`); aviso de «no escribir datos de terceros» en alergias; riesgo residual del texto libre a confirmar por `/rama` y `/maggie` | `REQ-QR12-010`, `REQ-QR12-002`, `SC-012-106` |
| rama R-09 | ratificada por `N2-R3` | esta adenda |
| rama R-10 | aviso derivado al sucesor (`promotion_notice_ack_at`) | `REQ-OWN12-006`, `data-model` |
| rama (disputa y supresión) | expediente y evidencia conservados con identidad seudonimizada hasta `RESOLVED` + 365 días; la supresión del reclamante no adelanta el borrado; `target_response` se borra al resolver | `REQ-CHP12-008`, `data-model` |

## I. Decisiones del arquitecto (Nivel 1) tomadas en este pase, a confirmar en la revisión dirigida
1. **Principal ausente** (`N2-R1` dice «target ≠ principal»): para `END_CO_OWNERSHIP` el `target` nunca es el principal; para el principal ausente se usa la variante `PRINCIPAL_ABSENT` con único desenlace `REQUEST_CHANGE_PRINCIPAL` (el principal pasa a co-propietario `ACTIVE`, conserva su derecho a salir; nadie pierde la co-propiedad). Si Neo prefiere no cubrir el principal ausente, se retira la variante.
2. **Revalidación de la disputa por ausencia** sobre el sujeto, el solicitante y el disparador (no sobre `ownership_version` global), para que las salidas voluntarias de terceros durante la congelación no la anulen (precisión sobre el texto de `/lock`).
3. **Reserva del chip derivada** de la disputa (sin tabla nueva): al eliminarse la mascota por la supresión del único propietario, la mascota se borra según `REQ-PET-004` y el chip queda reservado; con la mascota inexistente el único desenlace es `REJECT` (`moot_reason = PET_GONE`, sin cooldown). Queda abierto, sin decidir, si el reclamante tiene preferencia para registrar el chip al liberarse la reserva.
4. **Designación inválida en `LEAVE`**: no bloquea la salida; cae a la herencia automática.
5. **`moot_reason`** (cierre sin efecto) no activa el cooldown de 90 días.

## Pendientes de decisión N2 (pase de texto) — RESUELTOS por Neo
**2026-11-26 — `/architect` (DRAFT).** Neo resolvió `P-1..P-7` por Logos vía `/morpheus` (definitivas, no se reabren). `/architect` aplicó el texto en `spec.md`, `data-model.md` y `tasks.md` y eliminó los marcadores `[PENDIENTE DE DECISIÓN N2 — P-n]`. Nada se marca `APPROVED`/`LOCKED`; la firma formal sigue siendo de Neo.

| P | Resolución de Neo | Aplicado en |
| --- | --- | --- |
| **P-1** | `DISPUTE_MAX_OPEN_DAYS = 60` días calendario desde la apertura; vencida sin resolución de `/admin`, la disputa pasa a `EXPIRED` **sin cooldown** para el solicitante (`resolution` `NULL`; libera reserva y congelación; retención desde el estado terminal) | `REQ-CHP12-004`, constantes, `SC-012-098`, `data-model` (`owner_requests`, retención) |
| **P-2** | Disputas por ausencia: **90 días** tras `RESOLVED` (`DISPUTE_ABSENCE_RETENTION_DAYS = 90`); disputas de apropiación de microchip con evidencia documental: **365 días** | `REQ-CHP12-008`, `SC-012-082`, `data-model` (matriz de retención) |
| **P-3** | `PRINCIPAL_ABSENT` **ratificado**, solo con expediente completo ante `/admin`: el principal ausente pasa a co-propietario `ACTIVE`; otro co-propietario `ACTIVE` hereda el principal; nadie pierde la co-propiedad | `REQ-OWN12-009` (ii), `SC-012-093`, `data-model`, `T1627` |
| **P-4** | No se almacena preferencia del reclamante; sin ventana privilegiada de 72 h | `REQ-CHP12-004`, `data-model` |
| **P-5** | Endurecimiento de `N2-R1` **aprobado**: además, el `target` no tuvo sesión activa desde la primera solicitud crítica expirada (se evalúa y sella al abrir; `ERR-CHP12-ABSENCE-NOT-ELIGIBLE` si falla) | `REQ-OWN12-009`, `SC-012-093`, `data-model`, `T1627` |
| **P-6** | Alerta del 70 % del límite global de chip = **solo log estructurado de servidor** (`warn`, sin PII ni número de chip), sin UI nueva en `/admin` | `REQ-CHP12-005`, `SC-012-100`, `data-model` (`ip_rate_events`), `T1640` |
| **P-7** | Se conserva la cascada vigente de 005: los enlaces de veterinario se eliminan con el creador o la mascota; `ENM-005-A` no relaja `NOT NULL` | `REQ-OWN12-008` (a), `SC-012-108`, `data-model` (2 sitios) |

Nivel 1 confirmado por Neo: `MICROCHIP_IMPORT_MAX_PETS = 10`; `OWNERSHIP_LOCK_TIMEOUT_MS` se fija en `T1616`; `target_last_active_at` se deriva en lectura (sin columna nueva).

### Aplicado en este pase (sin decisión pendiente)
- `trinity C-1`: `REQ-OWN12-011`, `NFR-012-008`, `SC-012-095`, `EDGE-012-051/052` (apertura de disputa por ausencia, `ADD_CO_OWNER(claimant)` y ejecución de solicitudes aprobadas bajo bloqueo; una sola reevaluación con rollback reintentable; `lock_timeout`).
- `trinity C-2`: `REQ-CHP12-004`, `INV-CHP12-009`, `REQ-OWN12-008` (b), `EDGE-012-044/053/054/066/067/068`, `SC-012-097/111/112/113`, `T1646`.
- `trinity C-3`: `REQ-CHP12-005`, `SC-012-100/117`, `T1640`, `data-model` (`ip_rate_events`).
- `trinity C-4`: `REQ-OWN12-009`, `SC-012-091/092/114/115`, `EDGE-012-056/057/069`, `T1627`, `data-model` (`owner_requests`: `trigger_request_ids`, `target_response`).
- `trinity C-5`: `REQ-OWN12-006`, `SC-012-094`, `EDGE-012-058`.
- `rama R-A2`, `R-A4`, `R-A5`: `REQ-CHP12-008`, `data-model` (seudonimización no es anonimización), `REQ-QR12-006`, `SC-012-116`, `T1682`.
- Decisiones de Nivel 1 del arquitecto a confirmar: constantes `MICROCHIP_IMPORT_MAX_PETS = 10` y `OWNERSHIP_LOCK_TIMEOUT_MS` (valor en `T1616`); `target_last_active_at` derivado en lectura sin columna nueva en `users` (fuente fijada en `T1627`); el regex `[0-9]{15}` se aplica en el comprobador nuevo sin tocar el `^\d{15}$` citado de 004 (`REQ-CHP12-002`).

## Resoluciones de Neo sobre T1612 (H-02, H-09, H-16) — aplicadas en DRAFT
**2026-11-26 — `/architect` (DRAFT), cierre de `trinity` T1612 (Bloque A).** `H-01, H-03..H-08, H-10..H-15` aplicados como texto de contrato (sin `[x]`). Neo resolvió los tres restantes el 2026-11-26 y se aplicaron en `spec.md`, `data-model.md`, `tasks.md` y `contracts/` (sin `[x]`, sin firmar nada nuevo):

| ID | Resolución de Neo | Aplicado en |
| --- | --- | --- |
| **H-02** | **Opción (a) APROBADA**: contar **todo intento** de invitación en `CO_OWNER_INVITES_PER_USER_PER_DAY` (atómico, antes de resolver el `username`), sin filas ficticias; **residual aceptado explícitamente** (mismo criterio que `REQ-HOUSE2-001`) | `REQ-OWN12-002`, `INV-OWN12-004`, `SC-012-075` |
| **H-09** | **Propuesta reforzada APROBADA**: `ABSENCE_MIN_INACTIVE_DAYS = 14` y las 2 solicitudes críticas expiradas en 60 días deben ser **secuenciales** (no paralelas; `DELETE_PET` no cuenta, según la propuesta de `trinity`) | `REQ-OWN12-009`, `SC-012-091..093`, `EDGE-012-056/057`, `data-model`, `T1627`, constantes |
| **H-16** | **Reconciliado con la firma APPROVED de Neo (2026-11-26)**: `ENM-002-MINOR-012` y `ENM-005-A` `APPROVED` en cabeceras de anexos, `contracts/README.md` y tabla del anexo §1; contratos máquina `DRAFT` hasta superar `T1612` | anexos, README, `spec.md` |

`H-17` (INFO): regla Semgrep contra comparar `ownerUserId` fuera de `canActOnPet` (T1621) sigue sin existir; es bloqueante de `T1620`.
