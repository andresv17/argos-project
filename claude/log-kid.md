# Bitácora de Kid (co-cuidador, multi-navegador)

## 2026-11-12 T250
- Reescribí household.spec.ts a 002 (Ana, Bruno ADMIN, Carla CAREGIVER, Dario READER) y amplié household-counter.spec.ts; helper apiCall en e2e-support.ts.
- Resultado: 15 pasan, 1 roja intencional por brechas reales: H-T250-1 (ADMIN no propietario no puede invitar, requireOwner) y H-T250-2 (UI muestra Eliminar a ADMIN).
- Compuertas: tsc 0, verify-oracles CUMPLE, verify-traceability T250 CUMPLE. Evidencia: claude/evidencia-task-T250-2026-11-12.md

## 2026-11-14 T308 (Zee + Kid, recorrido manual quickstart §6)
- Recorrí los 7 flujos contra la app real (API 3100 + Vite 5173, base SQLite temporal en scratchpad, navegador Playwright con 2 contextos aislados: Zee y Kid). No edité src/, tests/ ni specs/.
- Resultado: F1, F3, F4, F5, F6 PASA; F2 y F7 FALLA parcial por defectos de interfaz (H-T308-1: PetForm solo ofrece Perro/Gato; H-T308-2: sin UI de transferencia de propiedad de mascota/hogar ni cambio de rol; la API sí cumple).
- Informe: .specify/memory/audits/recorrido-aceptacion-quickstart-002.md. Apps detenidas (3100 y 5173 libres).

## 2026-11-14 T308 repetido (Zee + Kid, recorrido manual quickstart §6, solo interfaz)
- Repetí los 7 flujos contra la app real (API 3100 + Vite 5173, SQLite temporal en scratchpad, 2 contextos Playwright). No edité src/, tests/ ni specs/; sin commit.
- H-T308-1 cerrado en UI: 8 especies, speciesOther, fecha estimada, esterilizado y microchip; RABBIT y OTHER («Axolote») dadas de alta y releídas en Editar. H-T308-2 cerrado en UI: transferencia de mascota, transferencia de hogar y selector de rol de miembro funcionan desde la pantalla (POST/PATCH 200).
- Resultado: 7/7 PASA, con observaciones menores (el directorio muestra «Otro» y no «Axolote»; sin mensaje al invitar ni al descargar en /backup).
- Informe: .specify/memory/audits/recorrido-aceptacion-quickstart-002-repeticion.md. Apps detenidas.
