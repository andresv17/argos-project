# Veredicto de Oracle — Reconfirmación documental v2.3 (H-V22-2, 3, 4, 5)

Fecha: 2026-11-14. Modo auditoría: solo lectura de src/tests/specs/contratos. Sin commits.
Fuera de alcance (siguen pendientes de Neo): H-V22-1, H-V22-6, INV-HOUSE-001.

## Veredictos
| Hallazgo | Veredicto |
|---|---|
| H-V22-2 (MEDIA) | CUMPLE |
| H-V22-3 (MEDIA) | CUMPLE |
| H-V22-4 (MEDIA) | CUMPLE |
| H-V22-5 (BAJA) | CUMPLE |

## Evidencia
**H-V22-2.** `ui_blueprint.md:220`: "Cuatro `NavLink` (Mascotas, Hogares, Respaldo, Perfil)". `grep -n "Tres .NavLink" ui_blueprint.md` devuelve cero líneas.

**H-V22-3.** `grep -n "decisión 7" ui_blueprint.md` devuelve cero líneas. Texto vigente:
- L31 (C15): "navegación directa de cuatro enlaces sin menú de avatar ni barra inferior, conforme a REQ-UI2-001 enmendado".
- L45 (fila 7, Apéndice B): "Decisión cerrada: navegación directa de cuatro enlaces ... sin menú de avatar ni barra inferior fija".
- L226: "Decisión cerrada ... sin menú del avatar ni barra inferior".
- L240: "decisión cerrada ... Sin discrepancia abierta con REQ-UI2-001".
Ninguna describe una discrepancia abierta.

**H-V22-4.** `git diff -U0 -- specs/002-plataforma-v21/spec.md` muestra exactamente 4 líneas cambiadas (L154, L155, L263, L361):
- L154: cuatro enlaces dentro de `<nav aria-label="Principal">`, displayName y "Cerrar sesión" a la derecha, "sin menú del avatar".
- L155: misma navegación en el flujo superior, "sin barra inferior", zonas de 48 x 48 px.
- L263 (REQ-UI2-001): navegación directa de cuatro enlaces, sin menú del avatar, barra inferior descartada (WCAG 2.4.3).
- L361: "«Perfil» es un enlace directo de la cabecera (sin menú del avatar)".
`tasks.md:243` (T287) dice lo mismo: cuatro enlaces, sin menú del avatar, sin barra inferior. Coherencia total entre L154/155/361, L263, T287 y blueprint §3.2/§4.
Nota: el diff de spec.md contiene solo esas 4 líneas; esto cubre el alcance de H-V22-4.

**H-V22-5.** Apéndice C (L698-707): orden 1.0, 1.1, 2.0, 2.1, 2.2, 2.3 (ascendente, con fila v2.2 en L706 y v2.3 en L707). Apéndice E (§8, bloque "E. Textos y nombres accesibles"): L625 lista "Mascotas", "Hogares", "Respaldo", "Perfil". L609 también dice 4 enlaces. Aclaración: el "Apéndice E" del hallazgo original es el bloque E del checklist de §8, no un apéndice titulado.

## Contradicciones nuevas (menores, no bloquean)
- **N-1 (BAJA):** `ui_blueprint.md:201` (esquema ASCII del marco, §3) muestra `<nav aria-label="Principal">Mascotas · Hogares · Respaldo</nav>` sin "Perfil", mientras L220, L248 y L609 dicen cuatro enlaces. Corregir añadiendo "· Perfil".
- **N-2 (BAJA, informativa, ya señalada en v2.2):** la tabla §0 (L15-31) no registra cambios v2.2 (C16+). No era parte de los cuatro puntos reconfirmados; no se evalúa como NO CUMPLE.

## Conclusión
Los cuatro puntos reconfirmados CUMPLEN. Pendientes para Neo: H-V22-1, H-V22-6, INV-HOUSE-001. Recomendable corregir N-1 en un microcambio de Sati (sin cambio de versión mayor).
