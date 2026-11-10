# Implementation Plan: Argos Pet Health & Biometric Tracker

**Branch**: `001-pet-health-tracker` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-pet-health-tracker/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Plataforma web multiusuario para el expediente clínico y biométrico de mascotas: una SPA React consume una API HTTP local que aplica casos de uso sobre un dominio puro y persiste en SQLite. Los tipos, los validadores y el cliente de la API se generan desde los contratos formales de `specs/001-pet-health-tracker/contracts/`, y el reloj y la entropía se inyectan por puertos para que todo cálculo sea determinista.

```text
Navegador (React SPA, Vite :5173)  ──/api (proxy)──►  API Fastify (127.0.0.1:3000)  ──►  SQLite ./data/argos.sqlite
        src/presentation/web/                          src/infrastructure/http/            src/infrastructure/persistence/
                     │                                           │
                     └──── cliente tipado generado (src/generated/api/client.ts) ──► src/application/ (casos de uso) ──► src/domain/
```

Para Cloud solo se sustituyen adaptadores de `src/infrastructure/` (persistencia, configuración, cookie `Secure`, host).

## Technical Context

**Language/Version**: TypeScript `~5.6` en modo `strict`, sobre Node.js 22 LTS (`.nvmrc` = `22.23.4`; `engines` `>=22.18 <23`)

**Primary Dependencies**: Fastify 5 y `@fastify/cookie` (API), React 18 con `react-router-dom`, Vite 5 y Tailwind CSS 3 (SPA), Ajv 8 standalone con `ajv-formats`, `openapi-fetch`; generación con `json-schema-to-typescript` y `openapi-typescript`

**Storage**: SQLite en archivo local (`./data/argos.sqlite`) mediante `better-sqlite3`, con migraciones SQL versionadas; adaptador en memoria para pruebas

**Testing**: Vitest 2 con `@vitest/coverage-v8`, fast-check 3 (`seed: 20261105`), Stryker con `vitest-runner`, Playwright con `@axe-core/playwright`, Semgrep en CI

**Target Platform**: ejecución local en `127.0.0.1` (API Node en el puerto 3000 y SPA en navegador); fase Cloud posterior sustituyendo solo adaptadores de `src/infrastructure/`

**Project Type**: aplicación web (SPA + API HTTP) en un único proyecto organizado por capas concéntricas

**Performance Goals**: N/A. La especificación no fija metas de rendimiento.

**Constraints**: determinismo total (reloj, identificadores, tokens y hash por puertos inyectados); sin exposición a la red en la fase local; importación de respaldo de hasta 10 MB; WCAG 2.1 AA a 320, 1024 y 1280 px; solo dependencias gratuitas y autorizadas

**Scale/Scope**: multiusuario en una instalación local; mascotas sin límite por usuario; 6 módulos de registro histórico; 6 pantallas (login, registro, mis mascotas, hogar, ficha, respaldo); 96 identificadores vigentes en la compuerta de trazabilidad

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra `.specify/memory/constitution.md` v3.0.0.

| Principio | Compuerta | Resultado | Evidencia |
| :--- | :--- | :--- | :--- |
| I. Especificación y Contratos como Fuente de Verdad | `src/generated/` se deriva solo de `contracts/` | PASS | `tests/integration/contracts/codegen-drift.spec.ts`; `checklists/code-review.md`, CHK001 |
| II. Determinismo Total y Aislamiento de Entropía | Reloj y entropía solo por puertos; `process.env` solo en `src/infrastructure/config/` | PASS | `scripts/verify-traceability.sh`: 0 violaciones de pureza; `checklists/code-review.md`, CHK002 y CHK005 |
| II. Determinismo Total y Aislamiento de Entropía | Dependencia concéntrica y puertos asíncronos transaccionales | PASS | `tests/unit/layer-dependencies.spec.ts`; `checklists/code-review.md`, CHK003 y CHK004 |
| III. Trazabilidad Verificable por Máquina | 100 % de los identificadores vigentes | PASS | `scripts/verify-traceability.sh`: 96/96 |
| IV. Test Gate con Umbrales Fijos | Cero oráculos débiles | PASS | `scripts/verify-oracles.sh`: 0 |
| IV. Test Gate con Umbrales Fijos | Cobertura de líneas y ramas ≥ 95 % | PASS | `checklists/oracle-validation.md`, CHK007: 99,57 % y 99,70 % |
| IV. Test Gate con Umbrales Fijos | Puntuación de mutación ≥ 85 % | PASS | `checklists/oracle-validation.md`, CHK007: 99,69 % |
| IV. Test Gate con Umbrales Fijos | Accesibilidad sin violaciones graves | PASS | `checklists/oracle-validation.md`, CHK006 |
| V. Seguridad y Privacidad por Defecto | Batería de seguridad | PASS | `checklists/oracle-validation.md`, CHK008 |
| VI. Stack Autorizado y Estructura de Repositorio Estándar | Stack autorizado | PASS con desviación registrada | `react-router-dom` 6 con avisos de `npm audit` (ver «Complexity Tracking») |
| VI. Stack Autorizado y Estructura de Repositorio Estándar | TypeScript `strict` del stack autorizado, sin escapes de tipo en `src/` ni `tests/` | Desviación ratificada por Neo (Nivel 2, 2026-11-10); se cierra con T056 | `checklists/code-review.md`, CHK009 (ver «Complexity Tracking») |
| VI. Stack Autorizado y Estructura de Repositorio Estándar | Estructura de repositorio | PASS | Árbol de «Project Structure» |

## Project Structure

### Documentation (this feature)

```text
specs/001-pet-health-tracker/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── schemas/             # JSON Schema 2020-12: common, identity, pet, medical-records, backup-envelope
│   ├── openapi/             # OpenAPI 3.1: pet-tracker-api.openapi.yaml
│   ├── state-machines/      # sanitary-alert, backup-import, auth-session, household-membership
│   ├── errors/              # error-catalog.json (RFC 9457)
│   └── examples/            # canonical-fixtures.json
├── checklists/          # requirements.md, code-review.md, oracle-validation.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── generated/                          # Derivado de contracts/ por scripts/compile-contracts.sh; no se edita a mano
│   ├── api/                            # openapi-types.ts, client.ts (cliente tipado con openapi-fetch)
│   ├── errors/                         # error-codes.ts (ErrorCode, ERROR_CATALOG, DomainError), field-errors.ts
│   ├── machines/                       # *.machine.ts: estados y transiciones de las 4 máquinas
│   ├── schemas/                        # types.ts, validators.cjs/.mjs con .d.cts/.d.mts (Ajv standalone)
│   └── index.ts
├── domain/                             # Puro y síncrono
│   ├── shared/date-utils.ts            # Aritmética ISO, diffInCalendarDays, calculatePetAge
│   ├── sorting/deterministic-sorter.ts # Orden de historiales y de la lista de mascotas
│   ├── pet/                            # pet-invariants.ts, pet-deletion.ts
│   ├── records/record-invariants.ts    # Invariantes de los 6 módulos, deltaKg y deltaPercent
│   ├── alerts/sanitary-alert-evaluator.ts
│   ├── access/access-policy.ts         # canRead / canWrite
│   ├── auth/                           # auth-policies.ts, utc-timestamp.ts
│   ├── households/household-policies.ts
│   └── backup/backup-migration.ts      # Transformación pura del sobre 1.0.0 al 2.0.0
├── application/
│   ├── ports/                          # clock, id-generator, secure-token, password-hasher, repositories, unit-of-work
│   └── use-cases/                      # auth, pet, record, household y backup; use-case-support.ts
├── infrastructure/
│   ├── config/app-config.ts            # Única lectura de process.env
│   ├── adapters/                       # system-clock, fixed-clock, crypto-uuid, deterministic-id, crypto-secure-token, scrypt-password-hasher
│   ├── persistence/memory/             # in-memory-unit-of-work.ts
│   ├── persistence/sqlite/             # sqlite-database.ts, sqlite-repositories.ts, sqlite-unit-of-work.ts, migrations/0001_init.sql
│   └── http/                           # app.ts, server.ts, request-input.ts
│       ├── plugins/                    # csrf-guard.ts, session-auth.ts, problem-details.ts
│       └── routes/                     # auth, pets, households, backup; use-cases.ts
└── presentation/web/                   # SPA React
    ├── main.tsx, App.tsx, api.ts, session.tsx, validation.ts, use-contract-form.ts, view-model.ts, records.ts, styles.css
    ├── components/                     # AlertBadge, ContextSelector, Field, OwnerBadge, PetCards, PetDashboard, PetForm, RecordForm, WeightChart
    └── pages/                          # AppShell, AuthPages, PetsPage, HouseholdsPage, BackupPage

tests/
├── unit/                               # Vitest: dominio, casos de uso con repositorios en memoria y presentación
├── property/                           # fast-check con seed 20261105
├── integration/
│   ├── contracts/                      # Fixtures canónicos, conformidad OpenAPI, deriva del generador
│   ├── api/                            # Fastify inject sobre SQLite temporal
│   ├── persistence/                    # Suite de contratos de repositorio sobre SQLite
│   ├── presentation/                   # Cliente web contra la API
│   └── gates/                          # Pruebas negativas de los scripts de compuerta
├── security/                           # exploits/ (Vitest) y sast-rules/ (Semgrep)
├── e2e/                                # visual/ y accessibility/ (Playwright + axe-core)
├── mutation/stryker.conf.json
└── fixtures/                           # Dobles, arneses y la suite de contratos de repositorio

scripts/                                # compile-contracts.sh, codegen.mjs, verify-traceability.sh, verify-oracles.sh
```

**Structure Decision**: proyecto único por capas concéntricas (constitución, principio II, regla 4). `src/domain/` depende solo de `src/generated/`; `src/application/` define los puertos y los casos de uso, que reciben el `userId` autenticado y aplican la política de acceso antes de leer o escribir; `src/infrastructure/` implementa los puertos y valida toda frontera con los validadores generados; `src/presentation/web/` consume la API solo con el cliente generado. Los contratos formales viven en `specs/001-pet-health-tracker/contracts/` y `scripts/compile-contracts.sh` los compila hacia `src/generated/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 3 `any` en `tests/unit/backup-use-cases.spec.ts` y 1 aserción no nula en `src/domain/backup/backup-migration.ts` (`checklists/code-review.md`, CHK009) | Ratificada por Neo (Nivel 2) el 2026-11-10; no bloquea la compuerta final | Corregirlo dentro de la compuerta final exigía tocar archivos fuera de su alcance; se cierra en la tarea T056 |
| `react-router-dom` 6.30.6 con 2 avisos moderados de `npm audit` en runtime | La corrección exige react-router 7 | Es un cambio mayor del stack de la constitución; se cierra en la tarea T057 |
