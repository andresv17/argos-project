# Acta Oracle 012 — Revalidación MEDIA-1 (aviso previo en transferencia) — 2ade05c — 2026-11-28
Solo lectura. Ciclo MAX_RETRY reiniciado por Neo (Nivel 2) para este mini-lote.

## Veredicto: CUMPLE (0 ALTA, 0 MEDIA, 1 BAJA, 1 INFO)

## Verificaciones
1. Disparo: guardPetsRevocation(listPetPets(petId).items) reutiliza hasActivePetsLinks (solo status ACTIVE) sobre enlaces visibles al actor; catch => affected=false (fail-open, decisión de Neo 3). Texto: PetsRevocationConfirm -> PETS_ACTION_REVOCATION_NOTICE (mismo módulo; sin duplicado en TransferOwnership.tsx). CUMPLE.
2. Orden: confirm() llama guardPetsRevocation antes; el POST ownership-transfer vive solo en transfer(), invocado únicamente vía proceed (directo si no hay enlaces; en onConfirm si los hay). onCancel solo limpia petsNotice: el POST no se ejecuta; botón principal oculto mientras el aviso está montado. CUMPLE.
3. Prueba t1696-aviso-transferencia-012 (3 tests): reuso (import + 3 símbolos), orden por indexOf guard < POST, ausencia de texto propio (/revoca entero/). Roja real: en 2ade05c^ los 5 símbolos (pets-link-notice, guardPetsRevocation, listPetPets, PetsRevocationConfirm, petsNotice) tienen 0 ocurrencias, por lo que los 3 tests fallaban antes. La semántica fail-open/cancel está cubierta por t1696-aviso-previo-revocacion-012 (lógica pura).
4. Contrato: git show --stat 2ade05c = solo TransferOwnership.tsx (+27/-2) y t1696-aviso-transferencia-012.spec.ts (+32). Sin contratos/OpenAPI.
5. Gates: tsc rc=0; verify-oracles 707 archivos, 0 débiles, CUMPLE; verify-traceability --feature 012 CUMPLE rc=0 (pureza 0); vitest dirigido 4 archivos / 28 tests verdes.

## Hallazgos
- BAJA-1: la prueba nueva es de lectura de fuente (sin jsdom); no ejercita el clic Cancelar de PetTransferPanel. Mitigado por lectura de código y por la prueba de lógica pura. No bloquea.
- INFO: el aviso usa el confirmLabel "Transferir igualmente".

## Efecto
MEDIA-1 y ALTA-1 (flujo TRANSFER) cerradas. Desbloquea la firma de T1695..T1702 por Neo. Oracle no marca [x].
