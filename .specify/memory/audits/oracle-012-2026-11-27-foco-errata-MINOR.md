# Acta /oracle — foco T1619 (1b80b71) y errata MINOR (2026-11-27)
STATUS: CUMPLE CON RESERVAS

## A. Commit 1b80b71 (sobre 1dcc063)
- Archivos: CoOwners.tsx, PetDashboard.tsx, t1617-propietarios-012.spec.ts. Nada de H-01, specs, contracts ni tasks.md. OK.
- Prueba t1617: +16 / -0 lineas; ningun aserto previo modificado. OK.
- Boton «Pedir eliminar» en `<span ref={deleteTriggerRef} className="contents">`; efecto `[confirmDelete]` enfoca `querySelector('button')`. OK.
- «Ir a Propietarios»: marca focusOwnersPending, cambia pestana, efecto enfoca #owners-title (h3 tabIndex=-1, CoOwners.tsx:154). OK.
- RESERVA 1 (funcional): el segundo efecto corre en el mismo commit tras el primero, que en el montaje inicial pone deleteMounted=true; el segundo ve `deleteMounted && !confirmDelete` y enfoca el boton «Pedir eliminar» al MONTAR el panel (si el boton existe), robando el foco sin accion del usuario (WCAG 3.2.1/2.4.3). Los tests de cableado no lo detectan. Fix sugerido: ref propia `deleteWasOpen` (true al abrir) y enfocar solo en la transicion true->false.
- RESERVA 2 (conocida): foco verificado solo por cableado, sin DOM real.

## B. spec.md sin commit
- 3 hunks exactos: (1) REQ-OWN12-011 l.85 (dos candados, 3000 ms solo sobre candado global, 503 ERR-OWN12-RETRYABLE, residual 503 tras 3 s declarado); (2) NFR-012-008 l.413; (3) RES1 l.419 (OWNER_REQUESTS_PER_USER_PER_DAY, 10). Sin otros cambios.
- errata-MINOR-REQ-OWN12-011-candado.md y acta architect coinciden con spec.md (antes/despues, residual, 3 hunks).
- RESERVA 3 (menor): la errata se declara APPROVED/Neo pero el cambio de estado normativo es potestad de Neo; confirmar que consta firma suya (la acta cita aprobacion 2026-11-27).

## Gates
- npx tsc --noEmit: rc=0
- verify-traceability.sh --feature 012: CUMPLE (295/295, pureza 0) rc=0
- vitest tests/unit/presentation: 94 archivos, 981 tests verdes
Bloque B (chip-claim, T1631/T1632, ERR-CHP12-*): excluido por mandato.
