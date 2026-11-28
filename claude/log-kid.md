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

## 2026-11-25 T1510 (parte /kid) · Bloque A #64 «Hogares»
- Auditoría de código (sin navegador, sin editar src/tests/specs; sin commit, sin [x]). Acta: .specify/memory/audits/kid-011-T1510-bloqueA-2026-11-25.md
- Verificado: 6 pestañas en orden; aviso «Incluye todas las mascotas…» (ShareLinks.tsx:81,196); sin «¿Qué quieres compartir?» con una mascota; Compartir solo para propietario/ADMIN con mascota propia (UI y servidor coinciden); escena solo lectura de conteos.
- Hallazgos: K-1 MEDIA (la lista de enlaces de hogar muestra el conteo del visor, no el del creador); K-2 BAJA (gestores ven y revocan enlaces ajenos); K-3 BAJA (error de carga de mascotas se muestra como vacío); K-4 BAJA (sin prueba de RBAC de Compartir); K-5 OBS (nombres de hogar como pestañas en Mascotas).
- Veredicto: PASS CON OBS. Sin fuga de datos hacia quien no debe.

## 2026-11-27 T1619 (parte /kid) · Bloque A · co-propietario ACTIVE
- Auditoria de codigo + vitest dirigido (sin navegador, sin editar src/specs/tasks, sin commit). Acta: .specify/memory/audits/kid-012-T1619-2026-11-27.md
- Verificado: myRole OWNER para ACTIVE (pet-use-cases.ts:228); INVITED y terceros 404 uniforme; invitar con >1 propietario deriva a solicitud sellada.
- Hallazgos: H-K1 MEDIA (UI ofrece Eliminar/Transferir a co-propietario y el servidor lo rechaza, ERR-OWN12-APPROVAL-PENDING); H-K2 MEDIA (texto del catalogo engañoso); H-K3 MEDIA (sin prueba del rol ni del rechazo directo); H-K4..K6 BAJA/OBS.
- Veredicto: CUMPLE CON RESERVAS. Vitest: 4 de 5 archivos verdes; 2 rojas B-2 (EDGE-012-044) fuera de alcance.
- 2026-11-27 [kid] T1658: acta escrita (CUMPLE CON RESERVAS; H-1 MEDIA CarePanel.tsx:82 revert fuera de plazo; H-2/H-3 BAJA). No commit, no [x].
