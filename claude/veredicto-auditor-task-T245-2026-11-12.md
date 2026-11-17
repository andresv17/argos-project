# Veredicto Oracle — T245 (2026-11-12)

**Veredicto forense en disco: CONDICIONADO** (no bloqueante para cerrar la rebanada; dos hallazgos antes de T246).

Rama 002-plataforma-v21 @ 9af6f0b (sin commit nuevo). Cambios sin confirmar en:
- src/domain/households/household-policies.ts (+195 líneas, 0 eliminadas; verificado con git diff --stat)
- src/domain/pet/ownership-transfer.ts (nuevo)
- tests/unit/ownership-transfer.spec.ts (nuevo)

## Comprobaciones en disco
- vitest ownership-transfer + household-policies: 36/39. Los 3 fallos son los declarados fuera de T245 (T246 crear hogar, T247 roleOnJoin, T248 permissions).
- tsc --noEmit: 2 errores, ambos en tests/unit/household-policies.spec.ts (T248). Ninguno en src/.
- verify-traceability --feature 002 --task T245: CUMPLE. verify-oracles: CUMPLE.
- Reglas comparadas con REQ-HOUSE2-002 (spec.md:241): ADMIN no expulsa ni degrada al propietario ni cambia su propio rol (cumplido); solo el propietario hace TRANSFER_OWNERSHIP y borra el hogar (cumplido); expulsión y abandono podan asignaciones (cumplido).

## Hallazgos
- **H-T245-1 (MEDIO, latente):** household-policies.ts:587 usa `command.nowIsoTimestamp ?? NOW_FALLBACK` con NOW_FALLBACK = 1970-01-01 (línea 626). Si el caso de uso de T246 omite la marca de tiempo, firstJoinedAt quedaría en 1970 y alteraría el orden de colores (INV-HOUSE-005) sin error. Corrección: exigir nowIsoTimestamp en MembershipEventCommand y pasarlo fijo en los tests.
- **H-T245-2 (MEDIO, latente):** household-policies.ts en applyMembershipEvent, rama LEAVE/REMOVE, usa `command.pets ?? []`. Si el llamador omite pets, la poda de asignaciones no ocurre y no falla nada (incumple REQ-HOUSE2-002). Corrección: pets requerido para LEAVE y REMOVE.

Ningún llamador de producción existe hoy (grep sin resultados en src/), así que no hay daño en disco. Ambos riesgos se cierran antes de que T246 cablee el caso de uso.

## Decisión para Neo (PARA: Neo (Andrés Vallejo — Nivel 2))
1. Pedir a Keymaker H-T245-1 y H-T245-2 (MAX_RETRY = 1 disponible), y luego re-auditar.
2. O aceptar T245 con esos dos riesgos registrados como deuda para T246.
Este veredicto no marca T245 como [x]; tasks.md queda como está.
