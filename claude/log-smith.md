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

## 2026-11-18 — Asedio cadena de intentos 006 (T1, claim, T2, arrendamiento, cancelación, purga)
- 2026-11-18 | Prueba nueva tests/chaos/smith-006-cadena-intentos.spec.ts (fuera de vite include, no entra en test:gate): 12 casos, 9 verdes y 3 rojos; tsc 0 y verify-oracles CUMPLE.
- 2026-11-18 | CUBIERTO: proveedor lento que ignora la señal, arrendamiento vencido durante el put, SIGKILL dentro de T2, tres entregas concurrentes, entrega tardía tras tomar B la escena, revocación durante el put, encolado ambiguo y frontera mensual (EDGE-ESC6-031): sin doble cobro ni sobrescritura.
- 2026-11-18 | BRECHAS: ALTA SMITH-01 arrastre de cuota no aplicado sin escena de propietario (scene-lifecycle-hooks.ts:120-124, scene-use-cases.ts:206-212); MEDIA SMITH-02 purgeObjects borra la fila de cola antes del put (media-use-cases.ts:67); BAJA SMITH-03 gRPC numéricos en classifyEnqueueError (scene-use-cases.ts:293-300). Informe: .specify/memory/audits/smith-006-cadena-intentos.md.
