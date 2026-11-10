# Research: Argos Pet Health & Biometric Tracker

**Feature**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Date**: 2026-11-09

Decisiones técnicas de la feature, en el formato de `/speckit-plan`. Donde no se evaluaron alternativas, se indica.

## Persistencia

- **Decision**: SQLite en archivo local mediante `better-sqlite3`, detrás de puertos de repositorio asíncronos con `runInTransaction`.
- **Rationale**: la fase actual corre en el computador del arquitecto y la fase Cloud debe sustituir solo adaptadores de infraestructura (constitución, principio II, regla 5).
- **Alternatives considered**: `LocalStorageTransactionalRepository` de la v1, eliminado al implementar la persistencia SQLite.

## Generación desde contratos

- **Decision**: validadores con Ajv 8 en modo standalone, tipos con `json-schema-to-typescript` y `openapi-typescript`, y cliente con `openapi-fetch`, todo derivado de `specs/001-pet-health-tracker/contracts/` por `scripts/compile-contracts.sh`.
- **Rationale**: cambiar un valor en un contrato debe cambiar `src/generated/` (constitución, «Technology Stack & Repository Structure»).
- **Alternatives considered**: reglas de validación escritas a mano en plantillas del generador, como en la v1; prohibido por la constitución.

## Formato de los validadores generados

- **Decision**: `src/generated/schemas/validators.cjs` con `validators.d.cts`.
- **Rationale**: `package.json` declara `"type": "module"` y el código standalone de Ajv es CommonJS.
- **Alternatives considered**: validadores `.js` con `.d.ts`; un `.js` se interpretaría como ESM y fallaría.

## Modo estricto de Ajv

- **Decision**: `strictTypes: true` en `scripts/codegen.mjs`; los contratos declaran `"type": "string"` local junto a `maxLength`.
- **Rationale**: el tipo deja de depender del `$ref`.
- **Alternatives considered**: `strictTypes: false`, rechazada por el Arquitecto el 2026-11-05.

## Precisión decimal en la frontera

- **Decision**: `multipleOfPrecision: 10` en `scripts/codegen.mjs`.
- **Rationale**: con precisión 2 la frontera aceptaba pesos y medidas con más de 2 decimales, como `32.85001`.
- **Alternatives considered**: `multipleOfPrecision: 2`, valor inicial del generador.

## Herramientas de prueba

- **Decision**: Vitest, fast-check, Stryker, Playwright y `@axe-core/playwright` oficiales.
- **Rationale**: la entrega v1 reportó resultados en verde que no eran ciertos (informe de auditoría del 2026-11-05); la constitución (principio IV) prohíbe sustitutos que emulen estas herramientas.
- **Alternatives considered**: harness propio (`scripts/run-tests.mjs`, `tests/support/`), eliminado al sanear el repositorio.

## Sesiones y CSRF

- **Decision**: sesiones opacas guardadas solo como SHA-256, entregadas en cookie `HttpOnly` con `SameSite=Strict`, más la cabecera `X-Argos-Request: 1` en toda petición que modifica estado (constitución, principio V).
- **Rationale**: defensa CSRF en dos capas y ningún token en claro en la base de datos.
- **Alternatives considered**: no registradas.

## Verificación del tiempo uniforme de login

- **Decision**: `INV-AUTH-006` se verifica con un espía sobre `PasswordHasherPort` (una invocación en ambas ramas), sin umbral temporal.
- **Rationale**: una medición de tiempo no es determinista.
- **Alternatives considered**: umbral temporal provisional, descartado.

## Precedencia entre acceso y validación

- **Decision**: en rutas con identificador de recurso, el acceso (`404` o `403`) se comprueba después de la sesión y antes del esquema del cuerpo (spec.md, «Edge Cases»: precedencia de validación en la frontera).
- **Rationale**: es el orden implementado y probado en los casos de uso, y no revela la existencia de recursos ajenos.
- **Alternatives considered**: no registradas.

## Parámetro de ruta con formato inválido

- **Decision**: un identificador que no es UUID devuelve el `404` de la ruta.
- **Rationale**: un id no UUID no existe, y la spec trata la inexistencia como `404` (`INV-ACC-001`).
- **Alternatives considered**: responder `422`; descartado.

## Filtro de mascotas en contexto de hogar

- **Decision**: `q` y `species` como parámetros de `getHouseholdPets` (OpenAPI 2.4.0); la SPA filtra por la API.
- **Rationale**: `REQ-UI-001` pide el filtro en todo contexto y con la misma normalización que `REQ-PET-005`.
- **Alternatives considered**: filtro en cliente (`filterHouseholdCards`), descartado.

## Ruta inexistente

- **Decision**: una ruta que no es una operación del contrato OpenAPI devuelve el `404` por defecto de Fastify (JSON simple).
- **Rationale**: no es una operación de la API y el catálogo de errores no tiene un código genérico de «no encontrado».
- **Alternatives considered**: crear un código de catálogo para rutas inexistentes; descartado por exceder el alcance de la feature.

## Ubicación de los contratos

- **Decision**: los contratos formales viven en `specs/001-pet-health-tracker/contracts/` y `scripts/codegen.mjs` los lee de ahí por defecto.
- **Rationale**: es la ubicación de los contratos de una feature en GitHub Spec Kit (salida de la fase 1 de `/speckit-plan`).
- **Alternatives considered**: `contracts/` en la raíz del repositorio con un índice en la feature; descartado porque dejaba dos ubicaciones para un mismo artefacto.
