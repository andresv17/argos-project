# Veredicto Oracle: T271 y T272, fase roja Rebanada 5 [US7] (2026-11-13)

VEREDICTO: APTO CONDICIONADO (la fase roja es legítima; hallazgos de cobertura a cerrar antes o durante la fase verde)

## Mediciones en disco
- vitest (2 archivos): 25 rojas, 0 verdes (13 T271 + 12 T272). Nada de sintaxis, tipos ni importaciones rotas.
- Clasificación de razones:
  - 23 pruebas: `contrato OpenAPI de POST /api/backup/export: "exportBackup: estado 404 no declarado"` (ruta ausente; 404 vía arnés de contrato). T271: 12 de 13; T272: 11 de 12 (todas las que llaman a exportText).
  - 1 prueba T272 (digest cambia/2.0.0 heredado): `previewBackupImport: estado 404 no declarado` (ruta /backup/import/preview ausente).
  - 1 prueba T271 (GET heredado): `expected [404,405] to include 200` (el GET legado aún exporta; aserción de comportamiento ausente).
  Las 25 fallan por funcionalidad ausente.
- tsc --noEmit: 0 errores.
- verify-oracles.sh: CUMPLE, 95 archivos, 0 oráculos débiles. Revisión manual: sin .skip/.only/.todo, sin try/catch, sin toBeDefined; aserciones de igualdad profunda sobre tuplas con valores concretos.
- verify-traceability --task T271: 5/5 CUMPLE; --task T272: 3/3 CUMPLE.
- git status --short -- src tests: solo los 2 archivos nuevos (??); git diff --stat src tests vacío. Sin cambios a producción ni pruebas existentes. src/generated sin tocar.
- Alineación con contrato (openapi): Content-Disposition, Cache-Control no-store, X-Argos-Confirmation-Token, esquema ImportPreviewResult/ImportBackupResult, X-Argos-Import-Confirm, 422 ERR-SCHEMA-VALIDATION-FAILED, 429, 401, 403: sin contradicciones con spec/contratos. Límite 5/15 min coincide con ADR-002-12 (valor sugerido, configurable).

## Hallazgos
- H-T271-1 (cobertura): T271 exige también `tests/unit/backup-use-cases.spec.ts`, 403 por rol sin EXPORT_IMPORT_BACKUP (D-T271-2, segunda mitad), ERR-ACCOUNT-CONFIRMATION-MISMATCH, D-T271-1 (migrar tests de access-control a POST y retirar contract:false) y D-T271-3 (retirar excepción deleteRecord). Solo está el archivo API; la tarea no debe pasar a REVIEW como completa sin esto.
- H-T271-2 (enmascaramiento): 23 de 25 caen en el chequeo de contrato del arnés antes de evaluar las aserciones de fondo (fechas 2026-11-05, 5 mascotas, 8 registros, llaves del sobre, recuperación de ventana). Esos valores solo se verificarán en verde; riesgo de que la fase verde destape pruebas mal calibradas. Mitigar: Keymaker revisa cada una al ponerla en verde con evidencia.
- H-T271-3 (ruido de keys): la prueba de "nunca incluye hogares..." usa regex /household|assignment|session|password|hash/i sobre el texto completo; un campo legítimo (p.ej. nota con "hash" o "session") daría falso rojo. Bajo riesgo.
- H-T271-4 (orden/aislamiento): la prueba de ventana usa api.clock.setClock; confirmar que la fase verde use reloj inyectado (no Date) en el limitador.
- H-T272-1 (archivo): tasks.md cita `tests/integration/api/backup-import.api.spec.ts`; el entregable es `backup-import-preview.api.spec.ts`. Corregir la ruta en tasks.md (Morpheus/Architect) o justificar el nombre.
- H-T272-2 (contrato débil en confirmación): `confirm()` usa `contract:false` siempre, incluido el caso 200 COMPLETED y 422, que sí están declarados en OpenAPI; se pierde validación de esquema de ImportBackupResult/Problem. Recomendado retirarlo en la ruta feliz y 422.
- Nota T272: faltan 413 (>10 MB), 409 y colisión por rol en confirmación; no exigido por el texto de T272, quedan para T273 en adelante.

## Siguiente paso
Morpheus: aceptar la fase roja, registrar H-T271-1 y H-T272-1 en tasks.md, y entregar a Keymaker la fase verde (T273+) exigiendo cerrar H-T271-1/2 y H-T272-2. No marcar [x]: potestad de Neo.
