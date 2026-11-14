# Bitácora de Smith (Red Team Master & Chaos Engineering)

## 2026-11-13 — T280 [US7] inicio: caos en el respaldo (SC-004, INV-BACKUP-001, STATE-BACKUP-001)
- Despacho de Morpheus. Alcance: solo archivos NUEVOS bajo tests/security/; sin tocar src/, specs/, src/generated/, logos.*.
- Vectores: (1) fallo inyectado en cada escritura del commit (DeterministicFaultInjector, memoria y SQLite); (2) corrupción
  del archivo/base (bytes alterados, digest inválido); (3) SIGKILL real en proceso hijo; (4) volcado byte a byte.
- Prohibido test:gate y compile-contracts. Reutilizo tests/fixtures/backup-harness.ts y api-harness.

## 2026-11-13 — T280 entrega (Validación requerida)
- Nuevos: tests/security/exploits/backup-chaos.security.spec.ts (10 pruebas) y backup-chaos-child.ts (hijo SIGKILL, no es suite).
- Resultado: 10/10 verde, 3 corridas estables, sin temporales argos-smith-* ni procesos hijos vivos. Grietas: 0.
- Vectores: fallo en cada escritura del commit por HTTP (CommitScopedInjector sobre DeterministicFaultInjector), imagen
  serializada byte a byte (memoria y archivo WAL), corrupción de archivo (byte, truncado, 0xFF, NUL, digest inválido,
  40 mutaciones fast-check seed 280), fila JSON corrupta, página SQLite corrupta, cabecera destruida, SIGKILL en
  escritura 1/mitad/última (ANTERIOR) y tras COMMIT (NUEVO), integrity_check ok.
- Compuertas: tsc 0; verify-oracles CUMPLE (0 débiles); traza T280 CUMPLE 2/2; src/generated sin cambios.
