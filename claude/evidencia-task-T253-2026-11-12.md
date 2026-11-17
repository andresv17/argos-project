# Evidencia T253 [US6] — fase ROJA (Keymaker, 2026-11-12)

Archivos creados (solo pruebas; sin tocar src/, specs/, contratos, tasks.md):
- tests/unit/audit-canonical.spec.ts (11 pruebas: orden de claves, exclusión email/displayName/microchipId a cualquier profundidad, sin secretos, hash SHA-256 sin clave)
- tests/property/audit.property.spec.ts (4 propiedades fast-check, semilla 20261112)

Contrato esperado de la implementación (T254+): canonicalJson(valor), toCanonicalView(entidad), stateHash(entidad) en src/domain/audit/{canonical-json,canonical-view,state-hash}.ts.

## Causas rojas literales
vitest:
Error: Failed to load url ../../src/domain/audit/canonical-json.ts (resolved id: ../../src/domain/audit/canonical-json.ts) in .../tests/property/audit.property.spec.ts. Does the file exist?
Test Files  2 failed (2) | Tests  no tests

tsc --noEmit (solo 6 errores, todos de módulo ausente en estos dos archivos; cero en el resto):
tests/property/audit.property.spec.ts(4,31): error TS2307: Cannot find module '../../src/domain/audit/canonical-json.ts'
tests/property/audit.property.spec.ts(5,27): error TS2307: Cannot find module '../../src/domain/audit/state-hash.ts'
tests/property/audit.property.spec.ts(6,33): error TS2307: Cannot find module '../../src/domain/audit/canonical-view.ts'
tests/unit/audit-canonical.spec.ts(3,31) / (4,27) / (5,33): idem

## Oráculos
verify-oracles.sh: Archivos analizados: 85; oráculos débiles: 0 -> CUMPLE
verify-traceability.sh --feature 002 --task T253: FALLA esperado en rojo: REQ-AUD-001 OK (tests trazados); INV-AUD-001 "sin @implements en src/" (aún no hay implementación). Purity: 0 violaciones.
