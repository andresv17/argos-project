# Plan de implementación: Plataforma ARGOS v2.1 (Feature 002)

**Rama**: `002-plataforma-v21` | **Fecha**: 2026-11-10 | **Spec**: [spec.md](./spec.md) (APPROVED, 2026-11-10) | **Constitución**: 3.1.0 | **Estado del plan**: `REVIEW` (redactado por `/architect` en F4; la aprobación es de Neo)

**Entradas**: spec aprobada; insumos F4 de Maggie (`f4-insumo-maggie-especies.md`), Trinity (`f4-insumo-trinity-seguridad.md`) y Rama (`f4-insumo-rama-privacidad.md`); decisiones de Neo del 2026-11-10 (M1, T1–T8, R1–R7, secuencia de eliminación y criterio de fallo inyectado), registradas en `claude/log-morpheus.md`.

**Artefactos de diseño**: [data-model.md](./data-model.md) · [contracts/](./contracts/README.md) · [quickstart.md](./quickstart.md). `tasks.md` no existe todavía: lo genera F6.

## Resumen

La 002 evoluciona la 001 sin editarla: endurece la cuenta (contraseña 10–128 con política, sesión de 30 min de inactividad y 24 h absolutas, perfil, eliminación con salvaguardas), añade roles reales por membresía y asignación explícita mascota-hogar con transferencia de propiedad, amplía a 8 especies con peso por especie, completa los registros clínicos con historial inmutable, registra auditoría de mutaciones con seudonimización y pasa el respaldo a 3.0.0 con previsualización. El enfoque técnico mantiene la arquitectura concéntrica de la 001: reglas puras y deterministas en `domain/`, orquestación en `application/` detrás de puertos asíncronos, adaptadores SQLite en `infrastructure/`. Todo lo nuevo que toca tiempo, entropía o secretos entra por un puerto (`ClockPort`, `IdGeneratorPort`, `SecureTokenPort`, puerto de HMAC con la clave por parámetro).

## Contexto técnico

- **Lenguaje y compilador**: TypeScript `~5.6` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns` (sin cambios).
- **Dependencias**: **ninguna nueva**. El HMAC, el SHA-256 y los tokens usan `node:crypto` (ya autorizado); la validación de zona horaria usa `Intl` del runtime; el hash de contraseña sigue siendo `scrypt`. F4 no detectó ninguna dependencia de Nivel 2 nueva. La decisión sobre el conjunto de iconos (F2b) queda fuera de este plan.
- **Persistencia**: SQLite en archivo local mediante `better-sqlite3`, con `PRAGMA foreign_keys = ON` y `PRAGMA secure_delete = ON`; transacciones con bloqueo de escritura desde el inicio (`BEGIN IMMEDIATE`) detrás de `runInTransaction` (`INV-ARCH-005`).
- **API**: Fastify; contrato OpenAPI 3.1 de 40 operaciones; errores `application/problem+json` (RFC 9457).
- **Pruebas**: Vitest + fast-check (propiedades de peso, hash canónico, matriz), Stryker (≥ 85 %), Playwright con axe-core a 320, 768, 1024 y 1280 px, batería de seguridad en `tests/security/` ampliada de 9 a 16 vectores.
- **Plataforma**: `127.0.0.1`, API en el puerto 3100; la fase Cloud no forma parte de esta feature.
- **Metas medibles**: las del Success Criteria de la spec (`SC-001` a `SC-017`). Sin metas de rendimiento nuevas: la lectura de visibilidad usa índices sobre `pet_assignments` y `household_members`.
- **Restricciones**: sesión derivada sin temporizadores; ningún secreto en base, respaldo, auditoría ni logs; ningún `userId` en claro en la auditoría tras eliminar la cuenta.
- **Escala**: sin límite de mascotas por usuario; un respaldo de cuenta se arma completo en memoria y se limita a 10 MB al importar.

## Principios de la constitución aplicados

| Principio | Cómo lo aplica el plan |
|---|---|
| **I. Spec y contratos como fuente de verdad** | Los contratos de `contracts/` prevalecen sobre la prosa. Cada operación de OpenAPI y cada requisito de los esquemas cita su `REQ-*` o `INV-*`. Los IDs nuevos que no figuran en la spec se marcan como pendientes (sección «IDs pendientes»). |
| **II. Determinismo y aislamiento de entropía** | `ClockPort` para vigencia de sesión, caducidad del token, edad, fechas no futuras y ventanas de frecuencia; `IdGeneratorPort` para UUID; `SecureTokenPort` para tokens; el HMAC de auditoría recibe la clave por parámetro y el dominio nunca lee `process.env`. `src/generated/` solo se regenera con el compilador (F6). |
| **III. Trazabilidad verificable por máquina** | Cada contrato lleva `x-sdd-metadata.traceability`. Los archivos de implementación declararán `@implements` en F6; `verify-traceability.sh` debe seguir en CUMPLE. |
| **IV. Test Gate con umbrales fijos** | Sin cambio de umbrales. Se añaden pruebas de matriz (44 casos), inyección de fallos y 7 vectores de seguridad; accesibilidad a 4 anchos (enmienda 3.1.0). |
| **V. Seguridad y privacidad por defecto** | Credenciales solo como hash; `X-Argos-Request` también en la exportación; 404 en lugar de 403 sin permiso de lectura; RFC 9457 sin trazas; datos de otro usuario solo con membresía `ACTIVE` y asignación; auditoría sin FK a `users`. |
| **VI. Stack autorizado y estructura estándar** | Sin dependencias nuevas; las carpetas nuevas de `src/` caben en el árbol estándar. Ajustar los scripts de compilación para leer la 002 es un cambio de Nivel 2 (ver «Puntos para Neo»). |

## Estructura de la documentación (esta feature)

```text
specs/002-plataforma-v21/
├── spec.md              # APPROVED
├── plan.md              # este archivo
├── data-model.md
├── quickstart.md
├── checklists/
├── contracts/
│   ├── schemas/         # common, identity, pet, medical-records, backup-envelope, audit-entry
│   ├── openapi/         # pet-tracker-api.openapi.yaml (3.0.0, 40 operaciones)
│   ├── state-machines/  # auth-session, household-membership, account-deletion, backup-import, sanitary-alert
│   └── errors/          # error-catalog.json (35 errores)
└── tasks.md             # lo crea F6 (no existe aún)
```

## Estructura de `src/` que cambia con la 002 (solo plan; no se genera código en F4)

```text
src/
├── domain/                              # puro: sin Date, sin entropía, sin I/O
│   ├── auth/        password-policy.ts, session-policy.ts          # INV-AUTH2-001, INV-AUTH2-002
│   ├── access/      rbac.ts (can), effective-role.ts               # REQ-RBAC-001, INV-ACC2-001/002
│   ├── pet/         species.ts, pet-invariants.ts, ownership-transfer.ts, estimated-age.ts
│   ├── records/     weight-limits.ts, superseded-guard.ts, record-invariants.ts   # INV-REC2-002
│   ├── households/  household-policies.ts (roles, propietario, poda de asignaciones)
│   ├── audit/       canonical-json.ts, state-hash.ts, canonical-view.ts            # REQ-AUD-001
│   ├── backup/      backup-migration.ts (1.0.0/2.0.0 a 3.0.0), import-hardening.ts # T7
│   └── account/     account-deletion-guards.ts
├── application/
│   ├── ports/       audit-log.port.ts (append, pseudonymizeUser), audit-pseudonym.port.ts (hmacUserId),
│   │                rate-limiter.port.ts, backup-token.port.ts, assignment/invitation en repositories.port.ts
│   └── use-cases/   account-use-cases.ts, assignment-use-cases.ts, ownership-use-cases.ts,
│                    migration-use-case.ts; cambios en auth, pet, record, household, backup
├── infrastructure/
│   ├── config/      app-config.ts (+ ARGOS_AUDIT_HMAC_SECRET, retención, límites de frecuencia)
│   ├── adapters/    hmac-audit-pseudonym.adapter.ts
│   ├── persistence/ sqlite/ (migración 002, repos nuevos, audit_log, secure_delete, checkpoint WAL)
│   │                memory/ (réplicas deterministas con inyector de fallos)
│   └── http/        routes/{account,assignments,ownership,records-edit}.routes.ts; plugin de sesión con inactividad
├── presentation/web/                    # /cuenta, App Shell 768 px, directorio, insignias, Centro de Respaldos
└── generated/                           # solo por scripts/compile-contracts.sh
tests/ unit, property, integration, security (V10–V16), e2e (4 anchos), mutation
scripts/ compile-contracts.sh y codegen.mjs: leer la 002 (Nivel 2, F6)
```

## Decisiones arquitectónicas

| ID | Decisión | Fuente |
|---|---|---|
| **ADR-002-01** | Los contratos de la 002 conservan los `$id` de la 001 y los sustituyen (`supersedes`). Versiones: esquemas de identidad, mascota, registros y respaldo, OpenAPI, sesión, membresía y catálogo en **3.0.0**; `common` 2.3.0, `STATE-BACKUP-001` 2.3.0 y `STATE-ALERT-001` 2.1.0 (cambios aditivos). La spec dice «v2» y la 001 ya estaba en 2.2.0; el archivo lleva 3.0.0. | Spec, T6 |
| **ADR-002-02** | **Sesión derivada**: se persiste `created_at`, `last_activity_at` y `revoked_at`; `EXPIRED` y `EXPIRED_IDLE` se evalúan en cada petición con `ClockPort`, primero el tope absoluto. Solo una petición autenticada **válida** renueva la inactividad; CSRF, sesión inválida y contraseña errónea no renuevan. Estados `LOGGED_OUT` y `REVOKED` separados. Token de 32 bytes en la cookie; en base solo `SHA-256`. | T6, `INV-AUTH2-002` |
| **ADR-002-03** | **Matriz como función pura** `can(rol, acción)` sobre 11 acciones (`RbacAction`) y rol efectivo = Propietario Legal o el mayor rol `ACTIVE` entre los hogares con la mascota asignada. Cada respuesta de mascota devuelve `myRole` y `permissions` (9 booleanos); reemplaza `canEdit`. La prueba de matriz recorre 11 × 4 = 44 casos contra el servidor y la interfaz. | `REQ-RBAC-001`, `SC-008` |
| **ADR-002-04** | **Invitación como entidad propia** (`household_invitations`) distinta de la membresía: `INVITED`, `DECLINED`, `CANCELLED` viven en la invitación; `ACTIVE`, `LEFT`, `REMOVED` en la membresía. Permite que invitar a un `username` inexistente deje una fila inerte indistinguible. La máquina `STATE-HOUSE-MEMBERSHIP-001` modela el ciclo completo de la relación. | R3 |
| **ADR-002-05** | **Auditoría**: puerto `AuditLogPort` con solo `append` y `pseudonymizeUser`; tabla sin FK a `users`; escritura en la misma transacción que la mutación; retención de 24 meses con purga que registra solo un conteo; hashes sobre la **vista pública canónica** que excluye `email`, `displayName` y `microchipId`; `hmacUserId(userId, key)` detrás de un puerto que recibe la clave por parámetro; **sin** columna `auditKeyVersion`. | R1, T1, T2 + R2 |
| **ADR-002-06** | **Eliminación de cuenta en dos fases** (`STATE-ACCOUNT-DELETE-001`): fase A sin escrituras (sesión, frase literal, contraseña, HMAC); fase B en una sola transacción con bloqueo de escritura (consumo condicional del token, relectura de bloqueos, fila `ACCOUNT_DELETE` con HMAC, seudonimización, borrado de hoja a raíz, poscondiciones, commit). Si fallan los bloqueos, el rollback revierte el consumo y el token sigue vigente. Un token ausente o mal formado da `ERR-ACCOUNT-CONFIRMATION-MISMATCH` (opcional en el esquema, forma validada en A2). `pet_assignments.assigned_by_user_id` se reasigna al nuevo dueño en la transferencia (`REQ-OWN-001`) y se seudonimiza en B8 si aún conserva el `userId` (F4-A3). | Secuencia aprobada, T3 |
| **ADR-002-07** | **Token de respaldo**: 32 bytes base64url, solo `SHA-256` en base, una fila por usuario, caducidad de 10 min, un solo uso. Se entrega en la cabecera `X-Argos-Confirmation-Token` con `Cache-Control: no-store`, **nunca dentro del archivo**; se emite solo cuando la generación terminó bien. La exportación es `POST` con `X-Argos-Request` y límite de frecuencia. El token prueba la solicitud, no el guardado (riesgo residual aceptado, T5). **Exportación por `POST`: pendiente de decisión de Neo (F4-M5).** | T3, T5, P-09 a P-12 |
| **ADR-002-08** | **Importación**: previsualización sin estado que devuelve `fileDigest`; la importación definitiva exige ese digest en `X-Argos-Import-Confirm` (mismo archivo). Endurecimiento P-14: propiedad, rol y asignación del archivo nunca son autoridad; esquemas con `additionalProperties: false`; rechazo de `__proto__`, `constructor`, `prototype`; 10 MB sobre bytes leídos; profundidad y claves duplicadas rechazadas; las migraciones ejecutan la misma validación final. La previsualización muestra mascotas compartidas afectadas (T4, R7). Criterio de fallo inyectado de `SC-004` en `STATE-BACKUP-001` 2.3.0. **`fileDigest` y `X-Argos-Import-Confirm`: pendientes de decisión de Neo (F4-M5).** | T4, T7, R6, R7 |
| **ADR-002-09** | **Peso en gramos enteros** (`weight_grams`): `deltaKg` exacto sin aritmética de coma flotante; tabla por especie en el dominio (`CANINE`/`FELINE` 0.05–150.00 con 2 decimales; resto 0.001–150.000 con 3); cota de 150 kg **provisional, a validar por veterinario**; sin alertas automáticas de peso ni de edad. | M1 |
| **ADR-002-10** | **Migración `REQ-MIG-001`** en una transacción, repetible gracias a `schema_migrations`: `DOG`/`CAT` a `CANINE`/`FELINE`; `OWNER` a `ADMIN` + propietario del hogar, `MEMBER` a `READER`; una asignación por cada mascota en cada hogar donde su dueño es `ACTIVE`; revoca todas las sesiones; 1 fila `MIGRATION`. **Invitaciones de la 001 (F4-A2)**: las filas `INVITED`, `DECLINED` y `CANCELLED` de `household_members` se convierten a `household_invitations` antes de reconstruir la membresía: `INVITED` pasa a invitación pendiente con `role_on_join = READER` (así lo fija la migración de miembros), `invitee_username` = `username` del usuario, `invited_by_user_id` = `invitedByUserId` (la 001 sí lo guarda), `created_at` = `invitedAt`; `DECLINED` y `CANCELLED` pasan a invitación en su estado terminal con `responded_at` = `updatedAt`. Después se borran esas filas de `household_members`, cuyo `CHECK` no las admite (detalle en `data-model.md` §2.10). | `REQ-MIG-001`, `SC-011` |
| **ADR-002-11** | **Edición y borrado de registros** por ruta genérica `/pets/{petId}/records/{collection}/{recordId}` (`PATCH`, `DELETE`) en lugar de 12 rutas; la variante del cuerpo la fija `collection`. Un registro `SUPERSEDED` responde `ERR-REC-SUPERSEDED-IMMUTABLE` con cualquier rol. | `REQ-REC2-003`, `SC-015` |
| **ADR-002-12** | **Límites de frecuencia configurables** (`rate_limit_events`): exportación (`EXPORT_MAX_PER_WINDOW` por `EXPORT_WINDOW_MINUTES`) e invitación (`INVITE_MAX_PER_WINDOW`) por actor. Valores iniciales sugeridos: 5 exportaciones y 20 invitaciones por 15 min; viven en `src/infrastructure/config/`, no en el contrato. Error `ERR-RATE-LIMITED`. Los fallos de contraseña actual usan el limitador existente de `INV-AUTH-005`. Nombres provisionales de configuración: `EXPORT_MAX_PER_WINDOW`, `EXPORT_WINDOW_MINUTES`, `INVITE_MAX_PER_WINDOW` e **`INVITE_WINDOW_MINUTES`** (F4-B1; 15 por defecto sugerido, igual que la exportación). | T3, R3 |
| **ADR-002-13** | **Borrado físico en SQLite**: `PRAGMA secure_delete = ON` al abrir y checkpoint del WAL con truncado **después** del commit de eliminación o importación; si falla no se revierte, se registra un aviso sin identificadores y se reintenta. | R4 |
| **ADR-002-14** | **Mantenimiento**: purga de sesiones expiradas o revocadas con más de 7 días, tokens vencidos, membresías e invitaciones terminales con más de 90 días y auditoría de más de 24 meses. Registra solo conteos; no es una mutación del usuario ni genera fila de auditoría. | T8 (P-03), R1, R5 |
| **ADR-002-15** | **`SUPERSEDED` se calcula** (no existe `supersedesId`); la próxima fecha es opcional y un registro sin ella y sin registro posterior de la misma clave queda fuera del semáforo (`alert: null`), aunque sí puede reemplazar a uno anterior. **Si tiene uno posterior queda `SUPERSEDED`** (inmutable, acordeón de reemplazados), no `null` (F4-M4): **a validar por Maggie** (no es decisión de Neo). | Spec |
| **ADR-002-16** | **Edad estimada**: el servidor convierte `estimatedAge` (años y meses) a `birthDate` con `ClockPort` y marca `birthDateIsEstimate = true`. Edad en años reales, sin «años humanos equivalentes». | `REQ-PET2-001`, Maggie |
| **ADR-002-17** | **Zona horaria**: `timezone` del perfil solo formatea horas de pantalla; el día civil de alertas, edades y fechas no futuras usa siempre `APP_TIMEZONE` vía `ClockPort`. | `REQ-TIME-001`, `SC-006` |

## Check de constitución (3.1.0)

| Puerta | Resultado | Evidencia |
|---|---|---|
| Spec aprobada y contratos como fuente de verdad (I) | CUMPLE | Spec `APPROVED`; contratos en `REVIEW`, no se promueven a `APPROVED` ni `LOCKED` |
| Sin reloj, entropía ni `process.env` en dominio y aplicación (II, `INV-ARCH-001/002/006`) | CUMPLE por diseño | Puertos listados en la estructura; HMAC con clave por parámetro |
| Dependencias de Nivel 2 | CUMPLE | Ninguna dependencia nueva (`node:crypto`, `Intl`) |
| Persistencia lista para Cloud (`INV-ARCH-005`) | CUMPLE por diseño | Repositorios asíncronos con `runInTransaction`; las particularidades SQLite (`secure_delete`, checkpoint) quedan en el adaptador |
| Seguridad y privacidad (V) | CUMPLE por diseño | Ver ADR-002-02, 05, 06, 07, 08 y vectores V10–V16 |
| Test Gate con umbrales fijos (IV) | Pendiente de F6 | Sin cambio de umbrales |
| Cambio de scripts o contratos requiere Nivel 2 (VI) | **Requiere decisión de Neo** | `scripts/compile-contracts.sh` y `scripts/codegen.mjs` leen la 001; F6 necesita autorización para apuntarlos a la 002 |
| Anchos de verificación 320, 768, 1024 y 1280 px (IV, 3.1.0) | CUMPLE por diseño | `REQ-UI2-008`, `SC-005` |

## IDs pendientes (sin equivalente en la lista de IDs de la spec)

No se inventaron requisitos. Se necesitaron tres identificadores que la spec no nombra; quedan **pendientes** de que Neo o `/mouse` los incorporen a la trazabilidad:

1. **`STATE-ACCOUNT-DELETE-001`**: nombre propuesto para la máquina de eliminación de cuenta (la spec cubre el comportamiento en `REQ-ACC-002` y `SC-014`, pero no nombra la máquina).
2. **`ERR-PET-MICROCHIP-DUPLICATE`**: la spec exige microchip único por propietario (`REQ-PET2-001`) pero no nombra el error.
3. **`ERR-RATE-LIMITED`**: la spec aprueba límites de frecuencia (T3, R3) pero no nombra el error.

También son nombres provisionales de configuración: `ARGOS_AUDIT_HMAC_SECRET` (nombre de la spec, provisional hasta F4, **fijado aquí**), `ARGOS_AUDIT_RETENTION_DAYS` (retención de 24 meses; **unidad: días**, valor por defecto provisional 730) y los parámetros de límite de frecuencia de `ADR-002-12` (incluido `INVITE_WINDOW_MINUTES`). Los tres IDs de esta lista están marcados también como pendientes en el catálogo de errores y en la máquina de eliminación; no se leen como oficiales hasta que Neo los apruebe. Los identificadores `ADR-002-NN` son propios de este plan y no son requisitos.

## Puntos para Neo (Nivel 2)

**PARA: Neo (Andrés Vallejo — Nivel 2)**

1. **Scripts de compilación**: autorizar que F6 modifique `scripts/compile-contracts.sh` y `scripts/codegen.mjs` para leer los contratos de la 002 (hoy están fijos a la 001). Sin esto no se puede regenerar `src/generated/`.
2. **IDs pendientes**: aprobar `STATE-ACCOUNT-DELETE-001`, `ERR-PET-MICROCHIP-DUPLICATE` y `ERR-RATE-LIMITED`, o indicar otros nombres.
3. **Errores retirados**: `ERR-AUTH-USER-NOT-FOUND` y `ERR-HOUSE-MEMBER-ALREADY-EXISTS` desaparecen del catálogo porque invitar es uniforme (R3). Confirmar que no se necesita ninguno.
4. **Valores de frecuencia**: 5 exportaciones y 20 invitaciones por 15 min son un valor inicial sugerido por el arquitecto (no estaba aprobado).
5. **Invitaciones inertes sin vencimiento**: Rama propuso vencer las invitaciones `INVITED` a los 30 días; esa propuesta no entró en el bloque aprobado y no se adoptó. Una invitación inerte o sin respuesta permanece hasta que se cancele, se elimine el hogar o la cuenta de quien invitó.
6. **Riesgo residual de la vista canónica**: R2 excluye solo `email`, `displayName` y `microchipId`. `username`, `inviteeUsername` y el nombre de la mascota siguen en la vista y son datos de baja entropía confirmables por diccionario mediante hashes sin clave. Se aplicó R2 tal cual.
7. **`avatarUrl` solo `https://`** (R-07 de Rama) no estaba en el bloque aprobado: el contrato conserva la regla de la 001 (`http(s)` o `data:image`).
8. **Invariante de referencia de errores**: `ERR-ACCOUNT-CONFIRMATION-MISMATCH` cita `REQ-ACC-002` como referencia porque no existe un `INV-*` aplicable; `ERR-AUTH-INVALID-CREDENTIALS` se reutiliza para «contraseña actual incorrecta» (el cliente no debe tratarla como pérdida de sesión).
9. **Inconsistencia menor de la spec (corregida)**: la frase «La spec sigue en `DRAFT`» de «Open Questions» (L380) quedó obsoleta tras la aprobación y se sustituyó por «Spec APPROVED (2026-11-10)».
10. **Pendiente de decisión de Neo (F4-M5)**: la exportación por `POST` (`ADR-002-07`), la cabecera `X-Argos-Import-Confirm` y el `fileDigest` de la previsualización (`ADR-002-08`) no figuran de forma literal en el bloque aprobado (los inspiran T4, T7 y P-09 a P-12). Se dejan tal cual en los contratos hasta que Neo los apruebe o los cambie.
11. **A validar por Maggie (no es decisión de Neo)**: un registro sin próxima fecha con otro posterior de la misma clave queda `SUPERSEDED` (`ADR-002-15`).

## Riesgos y mitigaciones

| Riesgo | Mitigación en el plan |
|---|---|
| Carrera entre comprobación y borrado al eliminar la cuenta | Bloqueos releídos dentro de la transacción; consumo condicional del token (`V10`) |
| Estado corrupto borra datos de un tercero en cascada | Aserción B6: abortar con `ERR-INTERNAL-UNEXPECTED` sin borrar datos ajenos |
| `userId` en claro tras eliminar la cuenta | Fila `ACCOUNT_DELETE` nace con el HMAC; tablas con `userId` (incluida `rate_limit_events`) se vacían; prueba de búsqueda en el volcado (`V15`) |
| Importación manipulada (escalada, prototype pollution, ID ajeno) | P-14, esquemas cerrados, mismo error genérico para ID ajeno (`V16`, `R-08`) |
| Pérdida de visibilidad al importar mascotas compartidas | La previsualización avisa del conteo; el reemplazo las deja sin asignaciones (T4, R7) |
| Sondeo en segundo plano anula la expiración por inactividad | Regla de interfaz: ninguna petición autenticada en segundo plano (P-04) |
| Cota de peso de 150 kg sin base clínica | Marcada «provisional, a validar por veterinario»; pendiente de revisión profesional, no bloquea |
