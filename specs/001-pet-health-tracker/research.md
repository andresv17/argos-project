# Research: Argos Pet Health & Biometric Tracker

**Feature**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Date**: 2026-11-09

Decisiones técnicas ya tomadas y registradas en la constitución, en el plan y en `tasks.md` («Deuda técnica registrada» y «Cambios de criterio registrados»), reunidas en el formato de Spec Kit. No se añade ninguna decisión nueva. Donde el registro no recoge alternativas, se indica. Los documentos de decisión completos del Arquitecto y los veredictos del Auditor están en el proyecto ARGOS de claude.ai (`claude/decisiones-arquitecto-*.md`, `claude/veredicto-auditor-*.md`).

## Persistencia

- **Decision**: SQLite en archivo local mediante `better-sqlite3`, detrás de puertos de repositorio asíncronos con `runInTransaction`.
- **Rationale**: la fase actual corre en el computador del arquitecto y la fase Cloud debe sustituir solo adaptadores de infraestructura (constitución §1.1 y §3, regla 5).
- **Alternatives considered**: `LocalStorageTransactionalRepository` de la v1, eliminado en TASK-110 (plan §4).

## Generación desde contratos

- **Decision**: validadores con Ajv 8 en modo standalone, tipos con `json-schema-to-typescript` y `openapi-typescript`, y cliente con `openapi-fetch`, todo derivado de `contracts/` por `scripts/compile-contracts.sh`.
- **Rationale**: cambiar un valor en un contrato debe cambiar `src/generated/` (constitución §2).
- **Alternatives considered**: reglas de validación escritas a mano en plantillas del generador, como en la v1; prohibido por la constitución §2.

## Formato de los validadores generados

- **Decision**: `src/generated/schemas/validators.cjs` con `validators.d.cts` (CC-102-D3).
- **Rationale**: `package.json` declara `"type": "module"` y el código standalone de Ajv es CommonJS.
- **Alternatives considered**: validadores `.js` con `.d.ts`; un `.js` se interpretaría como ESM y fallaría.

## Modo estricto de Ajv

- **Decision**: `strictTypes: true` en `scripts/codegen.mjs`; los contratos declaran `"type": "string"` local junto a `maxLength` (CC-102-D1).
- **Rationale**: el tipo deja de depender del `$ref`.
- **Alternatives considered**: `strictTypes: false`, rechazada por el Arquitecto el 2026-11-05.

## Precisión decimal en la frontera

- **Decision**: `multipleOfPrecision: 10` en `scripts/codegen.mjs` (cierre de DEUDA-VAL-001 en TASK-108).
- **Rationale**: con precisión 2 la frontera aceptaba pesos y medidas con más de 2 decimales, como `32.85001`.
- **Alternatives considered**: `multipleOfPrecision: 2`, valor inicial de TASK-102.

## Herramientas de prueba

- **Decision**: Vitest, fast-check, Stryker, Playwright y `@axe-core/playwright` oficiales.
- **Rationale**: la entrega v1 reportó resultados en verde que no eran ciertos (informe de auditoría del 2026-11-05); la constitución §2 prohíbe sustitutos que emulen estas herramientas.
- **Alternatives considered**: harness propio (`scripts/run-tests.mjs`, `tests/support/`), eliminado en TASK-101.

## Sesiones y CSRF

- **Decision**: sesiones opacas guardadas solo como SHA-256, entregadas en cookie `HttpOnly` con `SameSite=Strict`, más la cabecera `X-Argos-Request: 1` en toda petición que modifica estado (constitución §2 y §6).
- **Rationale**: defensa CSRF en dos capas y ningún token en claro en la base de datos.
- **Alternatives considered**: no registradas.

## Verificación del tiempo uniforme de login

- **Decision**: `INV-AUTH-006` se verifica con un espía sobre `PasswordHasherPort` (una invocación en ambas ramas), sin umbral temporal (D-02).
- **Rationale**: una medición de tiempo no es determinista.
- **Alternatives considered**: umbral temporal provisional, retirado en la spec v2.2.0.

## Precedencia entre acceso y validación

- **Decision**: en rutas con identificador de recurso, el acceso (`404` o `403`) se comprueba después de la sesión y antes del esquema del cuerpo (D-108-4, CC-111-4, spec §5.1).
- **Rationale**: es el orden implementado y probado desde TASK-108, y no revela la existencia de recursos ajenos.
- **Alternatives considered**: no registradas.

## Parámetro de ruta con formato inválido

- **Decision**: un identificador que no es UUID devuelve el `404` de la ruta (CC-111-2).
- **Rationale**: un id no UUID no existe, y la spec trata la inexistencia como `404` (`INV-ACC-001`).
- **Alternatives considered**: responder `422`; descartado.

## Filtro de mascotas en contexto de hogar

- **Decision**: `q` y `species` como parámetros de `getHouseholdPets` (OpenAPI 2.4.0); la SPA filtra por la API (cierre de DEUDA-UI-FILTRO-001 en TASK-113).
- **Rationale**: `REQ-UI-001` pide el filtro en todo contexto y con la misma normalización que `REQ-PET-005`.
- **Alternatives considered**: filtro en cliente (`filterHouseholdCards`), usado en TASK-112 y retirado en TASK-113.
