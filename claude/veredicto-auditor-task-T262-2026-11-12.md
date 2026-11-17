# Veredicto Oracle T262 — CONDICIONADO (2026-11-12)
Rama 002-plataforma-v21 @ d296cf2, cambios sin commit.

## Verificación en disco
- git: 22 modificados + 8 sin seguimiento. NO tocados: specs/**, src/generated/**, tasks.md, logos.json (sin diff; logos.json y scripts/logos.py ya estaban sin seguimiento).
- Suite completa ahora: 1482 pruebas, 1379 pasan, 103 fallan. Base HEAD (worktree temporal, ya retirado): 1480, 1365 pasan, 115 fallan.
- Comparación por prueba: 0 regresiones (ninguna que pasaba falla), 12 corregidas, 0 pruebas nuevas fallando. Confirma lo dicho por Keymaker.
- audit-log-adapter.spec 2/2; account-deletion 26/26; audit.api 13/18 (restan 5 rojos de T263/T265/T266: DELETE weights, 2 de cuenta, 2 de purga).
- tsc exit 0; verify-oracles CUMPLE (89 archivos, 0 débiles); verify-traceability T262 CUMPLE 3/3, pureza 0 violaciones.
- Transacción: la fila se escribe con el mismo RepositorySet de la UoW (recordAudit recibe `repositories`; ADR-002-05). Las pruebas audit.api L180 (falla de insert revierte la mutación, 500, base idéntica) y L190 (falla de la mutación tras preparar auditoría no deja fila) pasan. La de eliminación de cuenta (L199) sigue roja: es T265.

## Dictámenes
- D2 (api-harness borra la fila MIGRATION): ARREGLO LEGÍTIMO. audit.api parte de `count==0` (L36) y la fila MIGRATION es de la migración 0005 (REQ-MIG-001), no de una mutación de usuario. La fila MIGRATION se prueba aparte en roles-migration.spec con su propia base (no pasa por createApi). No relaja ninguna aserción. Nota: toca tests/, requiere visto bueno de Neo por ser edición de arnés.
- D3 (aceptar invitación = 1 fila UPDATE/HOUSEHOLD_INVITATION): la spec lo permite pero NO fija la entidad en aceptar. spec L250: UPDATE «incluye cambios de estado de membresía e invitación: aceptar, rechazar, cancelar, abandonar, expulsar»; L249: «una fila por operación... entidades hijas o en cascada no generan fila propia». Rechazar y cancelar solo cambian la invitación: UPDATE/INVITATION es exacto. Aceptar crea además una membresía: la spec no dice si la fila es sobre invitación o sobre membresía. Elección razonable (1 fila, SC-012), pero es elección. Ninguna prueba la cubre.
- D4 (una fila UNASSIGN por asignación podada al abandonar/expulsar): la spec lo PERMITE y es lectura coherente, pero no lo enumera. L249: «Excepción única: las asignaciones podadas generan una fila cada una, porque cambian lo que ven terceros»; la lista «Aplicación» solo cita transferencia (1) y cuenta (2). REQ-HOUSE2-002 dice que al expulsar o abandonar «se retiran también las asignaciones», sin llamarlas «podadas». data-model L213 solo habla de transferencia. Sin prueba que lo cubra (ningún test de leave/remove audita UNASSIGN). La alternativa (cero filas, por cascada) también es defendible: ambigüedad real de la spec, Caso B.
- D5 (invitación inerte escribe fila): NO filtra existencia. INV-AUTH-006 trata de tiempo uniforme y error genérico en login; no exige ni prohíbe filas de auditoría. La respuesta es idéntica `{received:true}`; no existe endpoint de lectura de audit_log. La fila replica la invitación que la spec ya manda guardar inerte (data-model L181). El único caso sin fila es usuario existente no elegible (tampoco se guarda invitación), distinción solo visible en la base, ya presente antes. Contenido de la fila: entityId = id de invitación, hash; sin username. Riesgo residual de tiempo (un insert extra solo en ramas que ya guardan) no medible por umbral (D-02).

## Hallazgos
- H-T262-1 (menor): sin prueba para aceptar/rechazar/cancelar invitación ni UNASSIGN por abandono/expulsión; D3/D4 quedan sin oráculo. Recomendado añadir en T263 o T267.
- H-T262-2 (info): IMPORT diferido a T278; 5 rojos de audit.api pertenecen a T263/T265/T266.
- Sin bloqueantes.

## Condiciones para Neo
1. Firmar D2 (edición del arnés de pruebas).
2. Decidir D3 y D4 (o remitir a Architect para fijarlos en spec/data-model: aceptar = UPDATE sobre invitación vs CREATE sobre membresía; UNASSIGN por abandono/expulsión sí o no). Recomendación del Oracle: mantener ambas como están.
3. CC-T262-1 (generador de ids aparte para auditoría): aceptable, sin impacto en spec.
