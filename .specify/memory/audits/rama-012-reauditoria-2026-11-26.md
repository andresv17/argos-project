# Acta /rama — Re-auditoría dirigida de Fase 0, Feature 012 (privacidad y ciclo de vida de datos)

**Fecha:** 2026-11-26 · **Rama:** `012-multiduenio-microchip-cuidador` · **Acta previa:** `.specify/memory/audits/rama-012-fase0-2026-11-26.md` (F-01..F-14) · **Adenda de Neo:** `claude/decisiones-neo-012-2026-11-26.md` (Neo-A..Neo-Q, Nivel 1 §D).
**Modo:** solo lectura sobre `specs/012/**`. No se editó spec, data-model, contrato, código ni `tasks.md`. Sin `git add`, sin commit, sin push, sin `[x]`, sin `APPROVED`/`LOCKED`. Escritos solo esta acta y las líneas de bitácora.
**Insumos leídos:** `~/.claude/skills/rama/SKILL.md`, adenda de Neo, acta previa, `specs/012/data-model.md` (completo), `specs/012/spec.md` (líneas de REQ/SC/EDGE/INV relevantes y adenda), `research.md` (R-2), `plan.md` (§9), `quickstart.md` (escenarios 1 y 7), `tasks.md` (conteo de `[x]`), y `specs/002/spec.md` (REQ-PET-004, REQ-ACC-002).

## 1. Veredicto

**CUMPLE CON RESERVAS.**

Los 14 hallazgos F-01..F-14 están cerrados en el texto nuevo. Los cambios principales son: índice de microchip intacto (F-01, F-02), matriz de retención por dato (F-09, F-12, F-13, F-14), matriz de borrado de cuenta y 8 columnas con `ON DELETE SET NULL` (F-05, F-06), `dispute_evidence` y `owner_requests` sin cascada (F-07), `ip_rate_events` sin FK (F-08), consentimiento del teléfono por mascota (F-04, D-P1 = I) y la decisión de sucesión del principal (Nivel 1, §D.4).

Quedan **10 hallazgos residuales** (sección 4). Ninguno reabre un hallazgo original ni deja un estado de privacidad inseguro. Cuatro piden una corrección de texto antes de sellar: R-02 (bloqueo explícito en supresión de cuenta), R-03 (disparo de `ERR-ACCOUNT-OWNS-SHARED-PETS`), R-08 (QR `OFF` al fallecer y texto libre de alergias) y R-01 (compuerta verificable de la exclusión de logs de Terraform).

## 2. Cierre de F-01..F-14

| ID | Hallazgo original | Estado | Evidencia en el texto nuevo |
| --- | --- | --- | --- |
| F-01 | Premisa falsa de unicidad global del microchip | **CERRADO** | `research.md` R-2 ya dice «Hoy (corregido por `rama F-01`)»: unicidad desde 004 (SQLite 0008, PG 0004). `spec.md` §Premisas (fila `#23`), REQ-CHP12-006, `ENM-002-MINOR-012-CHIP` reencuadrada como split de error (no como fin de exclusión). D12-08 retirada (Neo-G+Q). |
| F-02 | Índice parcial con `chip_conflict` y `deceased_at` deja huecos | **CERRADO** | `data-model.md` Bloque `#23`: `pets_microchip_global` **no cambia**; no existe `chip_conflict` (data-model líneas 9 y 63). Fallecidas siguen bloqueadas (Neo-F+L, EDGE-012-050, SC-012-079). D-P5 queda resuelta. |
| F-03 | Token QR en URL dentro de logs de plataforma | **CERRADO CON RESERVA** | REQ-QR12-008 (`redactSecrets` en código para `/e/` y `/api/emergency/`, prueba SC-012-086); exclusión en `terraform/logging.tf` como `DEUDA-012-TERRAFORM-LOGS-QR`, condición para activar el QR en producción. **Reserva:** la condición no aparece como SC ni como puerta verificable (R-01). |
| F-04 | Consentimiento del teléfono a nivel de cuenta | **CERRADO** | `users.show_phone_on_emergency_card` eliminado (data-model Bloque `#32`). `pet_emergency_phone_consents` (PK `pet_id, user_id`); `contactPhones` se calcula en lectura; REQ-QR12-006 «no hay opt-in global de cuenta»; `LEFT` retira el teléfono (EDGE-012-024, INV-OWN12-005). Neo-I = D-P1 = I. |
| F-05 | Borrado del principal destruye mascotas de terceros; co-propietario sale sin limpiar asignaciones | **CERRADO CON RESERVA** | Sucesión (REQ-OWN12-008(c), EDGE-012-005, SC-012-076). Matriz de borrado de `data-model.md` (filas «Principal con co-propietario ACTIVE» y «Co-propietario ACTIVE»): `LEFT`, retiro de `assigned_by_user_id = userId`, cancelación de invitaciones emitidas, consentimiento fuera. **Reserva:** el bloqueo transaccional explícito de la supresión no está escrito (R-02) y el disparo de `ERR-ACCOUNT-OWNS-SHARED-PETS` es ambiguo (R-03). |
| F-06 | Ocho columnas de usuario sin FK ni regla de borrado | **CERRADO CON RESERVA** | Las 8 columnas tienen `ON DELETE SET NULL` y son NULLables: `invited_by_user_id`, `requester_user_id`, `created_by_user_id`, `performed_by_user_id`, `granted_by_user_id`, `assigned_by_user_id`, `consented_by_user_id`, y el votante (`approvals` JSON, seudonimizado). `requester_pseudonym` conserva el HMAC; NFR-012-009 y SC-012-076 lo verifican. Interfaz «Usuario eliminado» (REQ-CAR12-009). **Reserva:** `owner_requests.rejected_by` queda fuera (R-04). |
| F-07 | Evidencia de disputa sin ciclo de vida | **CERRADO CON RESERVA** | Tabla `dispute_evidence` con FK `request_id` sin cascada (RESTRICT); `object_key` no derivable; `delete_after = resolved_at + 365 d`; cola `media_deletion_queue` al vencer, al borrar mascota o cuenta del reclamante; EXIF y metadatos al subir; URL firmada ≤ 5 min; lectura auditada (REQ-CHP12-008, SC-012-082). **Reserva:** la spec dice «sin cascada mientras `UNDER_REVIEW`» y el data-model dice «sin cascada» sin condición (R-05). |
| F-08 | Límite por IP incompatible con `rate_limit_events` | **CERRADO CON RESERVA** | `ip_rate_events (scope, ip_hmac, occurred_at)` sin FK a `users`; ventana 24 h; purga a las 25 h; contador global con `ip_hmac = '*'` (data-model Bloque `#23`). **Reserva:** la matriz de retención dice «1 min (QR)» en esta tabla, pero el Bloque limita el scope a `CHIP_LOOKUP` y REQ-QR12-007 usa memoria acotada (R-06). |
| F-09 | Retención incompleta de cuidado | **CERRADO** | `CARE_LOG_RETENTION_DAYS` desglosado: `MEDICATION` 1095 d, `MEAL`/`WALK`/`OTHER` 365 d desde `occurrence_date`; revertidos 30 d; fallecida igual; `idempotency_key` retirada (P-10); `note` sin salida a enlace ni QR; `reverted_at`/`revert_reason` en la tabla (data-model Bloques `#26`, matriz). |
| F-10 | Teléfono sin base legal, retención ni portabilidad del CHECK | **CERRADO CON RESERVA** | Base de consentimiento, borrable, se borra con `users` (matriz). Sin CHECK regex: validación en dominio (REQ-QR12-001; data-model, §Reglas transversales). **Reserva:** no hay SC de paridad E.164 en los tres motores; SC-012-024 cubre solo unicidad y split (R-07). |
| F-11 | Alergias y consentimiento de la ficha QR | **CERRADO CON RESERVA** | REQ-QR12-006 registra versión del aviso, fecha y quién consintió (`consent_notice_version`, `activated_at`, `consented_by_user_id`); textos en `legal-texts.md` antes de activar. **Reserva:** la regla de «mascota fallecida → ficha OFF» existe solo en el data-model y el texto de alergias no excluye nombres de terceros (R-08). |
| F-12 | Mensajes de reclamación y avisos sin ciclo de vida | **CERRADO** | `owner_requests.message` ≤ 280 se borra al decidir (data-model). Avisos como estado derivado sin tabla de notificaciones ni identidad del otro dueño (REQ-CHP12-010, Neo-K, SC-012-090). |
| F-13 | `last_scanned_at` infiere actividad | **CERRADO** | Granularidad de 60 min (`QR_LAST_SCANNED_GRANULARITY_MINUTES`); `NULL` al desactivar; sin IP (data-model, Bloque `#32`; D12-18). |
| F-14 | Respaldo con alergias y teléfono sin decidir | **CERRADO** | El teléfono no entra en el respaldo; `criticalAllergies` solo como aditivo opcional si Neo lo pide (data-model, Bloque `#32`, última línea; REQ-OWN12-008(b)). |

## 3. Decisión de Nivel 1: supresión del principal con sucesión

**Confirmada, con condición de ratificación explícita por Neo.** Motivos:

- **Privacidad:** evita destruir mascotas y datos de terceros (el fallo que motivó F-05). Los co-propietarios conservan su historial y sus registros.
- **Coherencia:** encaja con D12-04 (cero expulsión) y con REQ-OWN12-006 (la sucesión determinista ya está definida para la salida voluntaria del principal). La matriz de borrado y SC-012-076 la reflejan.
- **Condición (R-10):** la sucesión transfiere facultades de principal (eliminar la mascota, transferirla, invitar, respaldar) a un co-propietario que aceptó solo la co-propiedad, sin pedírselo. Es una decisión de producto sobre poder, no solo de privacidad. Por eso debe constar como resolución de Neo y no solo como §D.4 del arquitecto. Hay además un hueco de aviso: el sucesor no recibe ninguna indicación de que ahora es principal (R-10).

## 4. Hallazgos residuales

**R-01 · MEDIA · Compuerta de la exclusión de logs no verificable.** `DEUDA-012-TERRAFORM-LOGS-QR` es condición para activar el QR en producción (REQ-QR12-008, plan §9), pero no existe SC, checklist ni tarea que la bloquee. `T1681` solo la registra. Propuesta: añadir SC o un criterio de release que impida activar en producción sin esa exclusión aplicada por Neo. No es responsabilidad de `/rama` editarlo.

**R-02 · MEDIA · Supresión de cuenta sin bloqueo transaccional explícito.** NFR-012-008 y EDGE-012-004 exigen `pets.ownership_version` con `FOR UPDATE`/`IMMEDIATE` para transiciones de `owner_requests` y acciones críticas. La supresión de cuenta (`eraseAccountInTransaction`) no aparece en esos requisitos. Sin bloqueo, una aprobación concurrente o una invitación en curso podría dejar una co-propiedad huérfana. Propuesta: una frase en REQ-OWN12-008(c) o NFR-012-008: la supresión toma bloqueo sobre las mascotas afectadas y revalida `ownership_version` dentro de la misma transacción.

**R-03 · MEDIA · Disparo de `ERR-ACCOUNT-OWNS-SHARED-PETS` no definido.** REQ-OWN12-008(c) lo conserva «solo para los supuestos vigentes de la 002 donde no hay sucesor posible». Sin co-propietario `ACTIVE` no hay sucesor, pero REQ-OWN12-006(c) remite a REQ-PET-004, que elimina la mascota. Con ese flujo no queda claro cuándo dispara el error. Propuesta: enumerar el supuesto exacto (o declarar que 012 no lo emite) y reflejarlo en `ENM-002-MINOR-012`.

**R-04 · MEDIA · Identificadores de usuario fuera de las 8 columnas.** `owner_requests.rejected_by` (TEXT NULL, `data-model.md` línea 43) no tiene FK ni pseudonimización. `share_links.pet_owner_user_id_at_creation` (005, conservado por ENM-005-A) tampoco aparece en la matriz. Propuesta: FK `ON DELETE SET NULL` en `rejected_by` y regla de pseudonimización o `NULL` para la columna de 005 en `eraseAccountInTransaction`.

**R-05 · BAJA · Condición de cascada en evidencia.** REQ-CHP12-008 dice «no usan `ON DELETE CASCADE` desde `pets` ni `users` mientras el caso esté `UNDER_REVIEW`». El data-model dice «sin cascada» sin condición. Propuesta: unificar en «sin cascada» (el texto más estricto).

**R-06 · BAJA · Retención de `ip_rate_events` inconsistente.** La matriz de retención da «24 h (chip) / 1 min (QR)» para `ip_rate_events`. El Bloque `#23` limita la tabla a `CHIP_LOOKUP` y deja el QR en memoria acotada (REQ-QR12-007). Propuesta: quitar «1 min (QR)» de la matriz o declarar `QR_SCAN` como scope si `/trinity` exige persistencia.

**R-07 · BAJA · Sin prueba de paridad E.164.** La validación de teléfono es de dominio (correcto), pero el acta previa pedía una prueba de paridad en SQLite, PG y memoria (NFR-012-006). SC-012-024 cubre solo unicidad y split. Propuesta: SC de paridad para `^\+[1-9]\d{7,14}$` y la normalización.

**R-08 · MEDIA · Muerte de la mascota y texto libre de alergias.** (a) El data-model dice «al fallecer, ficha `OFF`» (matriz de `pets.critical_allergies`), pero la spec solo fija `404` uniforme (EDGE-012-017, SC-012-044) y no la transición a `OFF` ni la invalidación del hash. (b) Las alergias son texto libre de 1–60 caracteres y pueden incluir nombres de terceros (F-11 b); no hay regla de validación ni de aviso. Propuesta: fijar en la spec la transición `ON/OFF → OFF` al fallecer con `status_reason` y, para (b), decidir con `/maggie` y `/rama` si se acepta el riesgo residual con aviso.

**R-09 · BAJA · Procedencia de la regla de sucesión.** La decisión de §3 está en §D.4 de la adenda (Nivel 1). Si Neo no la ratifica, la matriz de borrado de `data-model.md` y REQ-OWN12-006/008 deben reescribirse. Pendiente de Neo, no de `/architect`.

**R-10 · MEDIA · Notificación al sucesor.** El principal sucesor adquiere facultades sin aviso específico. El aviso derivado de REQ-CHP12-010 cubre solo disputas. Propuesta: estado derivado en la interfaz («ahora eres propietario principal de {mascota}») sin tabla de notificaciones, consistente con Neo-K.

## 5. Decisiones pendientes para Neo (Nivel 2)

1. Ratificar la sucesión automática del principal (§3, R-09, R-10). Es la única decisión nueva que surge de esta re-auditoría.
2. Confirmar que R-01 se resuelve como criterio de release de producción y no solo como deuda registrada.

## 6. Pruebas que deben existir antes de sellar (adición a la acta previa §8)

- Supresión de principal con co-propietario `ACTIVE` concurrente a una aprobación: una sola ejecución y sin mascota huérfana (R-02).
- Supresión de principal sin sucesor pero con `INVITED`: comportamiento exacto de `ERR-ACCOUNT-OWNS-SHARED-PETS` o su ausencia (R-03).
- `owner_requests.rejected_by` tras borrar al rechazante: `NULL` o seudonimizado, nunca ID en claro (R-04).
- Ficha de mascota fallecida: transición a `OFF` y hash `NULL` (R-08a).
- Paridad E.164 en SQLite, PG y memoria (R-07).

## 7. Límites de esta re-auditoría

No ejecuté pruebas, `terraform plan` ni consultas a bases de datos. No verifiqué bases legales (siguen en `DEUDA-012-LEGAL-DISPUTAS-QR`). No revisé `contracts/` porque solo contiene `README.md` y los anexos aún no existen. No comprobé las migraciones nuevas porque aún no están escritas.
