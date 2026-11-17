# Veredicto Oracle — T251 (matriz IDOR cuatro roles) con corrección 05b5267 — 2026-11-12

VEREDICTO: CONDICIONADO

## Evidencia
- Alcance 05b5267: solo record-use-cases.ts, tests/unit/use-cases.spec.ts, evidencia y bitácoras. Sin specs/**, contracts/**, src/generated/**, migraciones ni tasks.md.
- Código: solo NULLABLE_DEFAULTS (vacunas: category 'VACCINE'; desparasitaciones: 'DEWORMING'; batchOrClinic, veterinarianName, veterinarianLicense en null). Coincide con VaccinationRecord/DewormingRecord de src/generated/schemas/types.ts (category literal, campos string|null obligatorios).
- Pruebas unit: 3 toEqual añaden category/veterinarianName/veterinarianLicense con valores concretos; es cambio de forma (registro persistido 002), no de intención; sin toContain ni skip.
- Corridas: idor-matrix 61/61; use-cases.spec 36/36; pets-records.api 32/35 (3 fallas = GET /pets, ajenas); tests/unit 72 fallas / 469 verdes (base 72, sin regresión); tsc exit 0; verify-oracles CUMPLE (82 archivos, 0 débiles); verify-traceability --feature 002 --task T251 CUMPLE (2/2, pureza 0).

## Residuo H-T251-2 (nextBoosterAt / nextSuggestedDoseAt)
- Esquema 002: en VaccinationRecord/DewormingRecord son obligatorios y nulables (IsoDate | null). En CreateVaccinationInput/CreateDewormingInput son opcionales (?:).
- validateCreateVaccinationInput({vaccineName, appliedAt}) = true (la entrada sin el campo es válida; la ruta no lo exige). El registro armado sin el campo falla validateVaccinationRecord (missingProperty nextBoosterAt; igual en desparasitaciones).
- Resultado: POST que omite el campo pasa 422 de entrada, pero falla al persistir en sqlite-repositories.ts:98 -> 500 ERR-INTERNAL-UNEXPECTED (falla cerrado, no guarda). Es defecto: el contrato declara el campo opcional y "Nulo = no requiere próxima dosis"; debe ser 201.
- Fix (no aplicado): añadir nextBoosterAt: null y nextSuggestedDoseAt: null a NULLABLE_DEFAULTS de cada colección. Requiere autorización de Neo.

## Decisión
No bloquea el objetivo de T251 (matriz IDOR 61/61, cero accesos cruzados, la prueba envía esos campos). Condicionado: pasa a rebanada 4 (T260/T263) o a micro-corrección autorizada por Neo/Architect antes de firmar. T251 no es COMPLETED; solo Neo firma.
