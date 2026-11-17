# Data Model: Mapeo físico SQLite → PostgreSQL (Feature 003)

**Estado**: `APPROVED` (Aprobada por Neo (Level 2) el 2026-11-15, bajo condiciones R1 a R5 del veredicto Oracle). El modelo lógico NO cambia (ver `specs/002-plataforma-v21/data-model.md` y los contratos de la 002). Este documento fija solo el mapeo físico para `src/infrastructure/persistence/postgres/migrations/0001_baseline.sql` (baseline único con el esquema final, D-20; REQ-PG-001, REQ-PG-003).

## 1. Reglas de traducción de tipos y construcciones

| SQLite (001/002) | PostgreSQL | Motivo |
|---|---|---|
| `TEXT` clave/ID/estado | `TEXT` | Mismos UUID v4 generados por `IdGeneratorPort` |
| `data TEXT` (JSON validado con Ajv) | `data JSONB NOT NULL` | Se conserva el objeto del contrato; Ajv sigue validando en la frontera (el adaptador pasa objeto a `pg`, que serializa) |
| Marcas de tiempo `TEXT` ISO-8601 UTC | `TEXT` (igual) | INV-ARCH-001: mismo texto determinista, comparaciones léxicas idénticas; evita conversión de zona del driver |
| `INTEGER` 0/1 (`neutered`, `birth_date_is_estimate`) | `SMALLINT` con el mismo `CHECK (… IN (0,1))` | Sin lógica de conversión booleana en repositorios |
| `INTEGER` (`weight_grams`) | `INTEGER` con `CHECK BETWEEN 1 AND 150000` | Igual |
| `STRICT` | (no existe) | Se compensa con tipos y `CHECK` explícitos |
| `CHECK (… IN (…))` | igual | Idéntico |
| `GLOB '*[^0-9]*'` | `microchip_id ~ '^[0-9]{15}$'` | Equivalente |
| `json_extract(data,'$.x')` | `data->>'x'` (o `data #>> '{a,b}'`) | Operadores JSONB |
| `json_set(...)`, `json_object(...)` | `jsonb_set(...)`, `jsonb_build_object(...)` | Conversiones de 0002-0005 |
| `INSERT OR IGNORE` | `INSERT … ON CONFLICT DO NOTHING` | |
| `strftime('%Y-%m-%dT%H:%M:%fZ', @now, '-7 days')` | `to_char((@now::timestamptz - interval '7 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` | Misma cadena ISO que usa el dominio |
| `ALTER TABLE … ADD COLUMN … CHECK` | igual (válido en PG) | |
| Reconstrucción de tabla (0003 `weights`, 0004 `household_members`/`household_invitations`) | `ALTER TABLE … ADD/DROP CONSTRAINT` donde sea posible; si no, la misma reconstrucción dentro de la transacción | PG permite `ALTER … SET NOT NULL`/`ADD CONSTRAINT`; se prefiere ALTER (menos riesgo) |
| `PRAGMA foreign_keys=ON`, `secure_delete`, `journal_mode=WAL`, `busy_timeout` | No aplica (claves foráneas siempre activas) | Ver ADR-003-09 para borrado |
| `BEGIN IMMEDIATE` | `BEGIN` + `pg_advisory_xact_lock(<K>)` | ADR-003-04 |
| `schema_migrations(version TEXT PK, applied_at TEXT DEFAULT strftime…)` | `version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` | |

## 2. Baseline único `0001_baseline.sql` (D-20, resuelta por Neo)

Postgres nace sobre una base vacía: un único archivo crea el **esquema final** que SQLite alcanza tras sus migraciones `0001..0005`. `schema_migrations` registra una sola fila (`0001_baseline`). Las migraciones futuras se numeran `0002_*` en adelante y siguen *expand/contract* (REQ-CICD-005). El traslado de datos usa el respaldo v3 (REQ-PG-007, D-23), no un `UPDATE` de conversión, por lo que desaparecen las sentencias de conversión de datos legados.

| Parte del esquema final | Origen en SQLite | Notas específicas |
|---|---|---|
| Tablas `users` (con `email`, `preferred_language CHECK ('es','en','pt')`, `timezone`), `sessions` (con `created_at/last_activity_at/revoked_at`), `login_attempts`, `rate_limit_events`, `backup_confirmation_tokens` | 0001, 0002 | `ON DELETE CASCADE` (INV-PET-005, C5); índices `*_user_id` |
| `pets` (con `species CHECK` de 8 especies, `species_other`, `neutered`, `microchip_id CHECK`, `birth_date_is_estimate`), `weights` (`weight_grams INTEGER NOT NULL CHECK`), `body_measurements`, `vaccinations`, `dewormings`, `medical_visits`, `custom_parameters` | 0001, 0003, 0005 (columnas clínicas) | Índice único parcial `pets_owner_microchip ... WHERE microchip_id IS NOT NULL`; REQ-MIG-001, INV-PET2-001, ADR-002-09 |
| `households`, `household_members` (roles ADMIN/CAREGIVER/READER, `is_household_owner`, estados ACTIVE/LEFT/REMOVED), `household_invitations`, `pet_assignments(pet_id, household_id)` (`assigned_by_user_id` sin FK) | 0001, 0002, 0004 | Índices únicos parciales de miembro abierto y de propietario del hogar; INV-HOUSE2-001, REQ-HOUSE2-003 |
| `audit_log` **sin claves foráneas** (REQ-AUD-001) y fila `MIGRATION` única | 0005 | `auditRowsPurged` filtra por `timestamp` TEXT ISO |

**Regla de verificación**: una prueba compara el esquema final de Postgres con el de SQLite tras sus 5 migraciones (nombre de tablas, columnas, nulabilidad, `CHECK` e índices) mediante una lista canónica `tests/integration/persistence/schema-parity.*` (tarea T419). Cualquier diferencia exige justificación en este documento.

## 3. Ejemplo representativo (no normativo)

```sql
CREATE TABLE pets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  species TEXT NOT NULL DEFAULT 'CANINE'
    CHECK (species IN ('CANINE','FELINE','RABBIT','FERRET','BIRD','REPTILE','SMALL_MAMMAL','OTHER')),
  species_other TEXT CHECK ((species = 'OTHER') = (species_other IS NOT NULL)),
  neutered SMALLINT CHECK (neutered IN (0, 1)),
  microchip_id TEXT CHECK (microchip_id IS NULL OR microchip_id ~ '^[0-9]{15}$'),
  birth_date_is_estimate SMALLINT NOT NULL DEFAULT 0 CHECK (birth_date_is_estimate IN (0, 1))
);
CREATE INDEX pets_owner_user_id ON pets (owner_user_id);
CREATE UNIQUE INDEX pets_owner_microchip ON pets (owner_user_id, microchip_id) WHERE microchip_id IS NOT NULL;
```

## 4. Roles de base de datos (Neon)

| Rol | Uso | Privilegios |
|---|---|---|
| `argos_migrator` | `scripts/migrate-postgres.ts` y flujo `vacuum-argos.yml` (conexión directa) | DDL y DML sobre el esquema `public`; propietario de las tablas (único que puede vacunarlas en PG < 17) |
| `argos_app` | Cloud Run (conexión `-pooler`) | `SELECT, INSERT, UPDATE, DELETE` en tablas y `USAGE` en secuencias; sin DDL; sin `CREATE`; **no ejecuta `VACUUM`** (lo hace el propietario, REQ-PG-015); `ALTER ROLE argos_app SET idle_in_transaction_session_timeout='15s'` aplicado por el migrador (REQ-PG-012) |

`ALTER DEFAULT PRIVILEGES` del migrador concede automáticamente a `argos_app` los privilegios de las tablas nuevas.

## 5. Estado de la sesión de base de datos
Modo transacción de PgBouncer: ninguna sentencia depende de estado de sesión. Prohibidos en `postgres/`: `SET` (usar `SET LOCAL` dentro de la transacción), `LISTEN`, `PREPARE` SQL, advisory locks de sesión (salvo el ejecutor de migraciones en conexión directa), tablas temporales y `DISCARD`. Una prueba estática (grep en la tarea de compuerta de Fase 3) rechaza esas palabras en `src/infrastructure/persistence/postgres/**` fuera de `scripts/`.

## 6. Matriz de retención por tipo de dato (H-RAMA-010)

Vida máxima de cada copia de los datos personales. Valores entre paréntesis = propuestos por `/architect` (la spec callaba); `[verificar]` = a confirmar en T402. Ventana de borrado físico tras eliminar una cuenta: `max(PITR 6 h, VACUUM <= 7 d, dumps 14 d)` (REQ-PG-011; ratificación en D-22).

| Dato | Lugar | Vida | Fuente / verificación |
|---|---|---|---|
| Cuenta, mascotas, registros clínicos | Neon | hasta eliminación; físico <= 14 d | REQ-PG-011 |
| Historia de Neon | Neon PITR | <= 6 h (máx. 1 GB de cambios) | `research.md §2` (verificado 2026-11-15) |
| Rama de respaldo creada por una restauración | Neon | hasta el paso 5 del runbook | REQ-PG-016 |
| Ramas `pre-<sha>` | Neon | no existen (D-19: sin rama automática ni `NEON_API_KEY`) | D-19 |
| Sesiones expiradas, tokens, invitaciones terminales | Neon | 7 d / 7 d / 90 d | ADR-002-14 |
| Auditoría (HMAC) | Neon | 730 d; HMAC rotado = no correlaciona | REQ-AUD-001, REQ-CLD-005 |
| Dumps lógicos | GCS `dumps/` | 14 d; soft delete 0 s (sin él ~21 d) | REQ-IAC-008; soft delete por defecto de 7 d verificado el 2026-11-15, 0 lo desactiva |
| Estado de Terraform no vigente | GCS (bucket de estado) | 30 d; soft delete 0 s (sin él ~37 d) | REQ-SEC-006 |
| Logs de aplicación (sin PII por REQ-CLD-008) | Cloud Logging `_Default` | (30 d, fijar explícito) `[verificar]` | no confirmado: la página de enrutamiento no cita el valor |
| Registro de petición de Cloud Run (`run.googleapis.com/requests`: método, URL, estado, latencia, IP, user-agent) | Cloud Logging `_Default` | (30 d, valor por defecto de `_Default`; no suprimible) `[verificar]` que este log se enruta a `_Default` | REQ-CLD-008 (c); `research.md §10` (fuente oficial consultada 2026-11-16) |
| Auditoría de administración de GCP | Cloud Logging `_Required` | (400 d, fijo de Google) `[verificar]` | no confirmado |
| Registros de GitHub Actions | GitHub | (<= 30 d en la configuración del repositorio; el valor por defecto es 90 d) `[verificar]` | REQ-CICD-008 |
| Artefactos de GitHub Actions | GitHub | (1 d; sin `tfplan`) | REQ-CICD-002, REQ-CICD-008 |
| Archivo SQLite local de la 002 (`.db`, `-wal`, `-shm`) | equipo de Neo | hasta que Neo lo borre tras verificar T430 | H-RAMA-014 (`research.md §8`) |
