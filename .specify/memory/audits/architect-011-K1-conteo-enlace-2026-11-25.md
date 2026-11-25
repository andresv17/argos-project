# Acta /architect — 011 K-1 (conteo de mascotas por enlace de hogar) — 2026-11-25

## Hallazgo
K-1 (MEDIA, acta kid-011-T1510-bloqueA): `scopeText` (ShareLinks.tsx:93) imprime `household.petCount` (mascotas del VISOR, `HouseholdsPage.tsx:373` pasa `mine.length`) en cada fila de la lista, aunque cada enlace sirve las mascotas del CREADOR (`ownedAssignedPets`, share-access.ts:26-30, calculado por petición, D5-19).

## Evidencia en disco
- `ListShareLinksUseCase` (share-link-use-cases.ts:125-138) lista todos los enlaces del alcance (`listByScope`), sin filtrar por creador.
- `toShareLinkView` (share-link-use-cases.ts:33-47) devuelve: id, scope, petId, householdId, status, createdAt, expiresAt, revokedAt, include*. NO expone `createdByUserId` ni conteo servido.
- Por tanto el cliente NO puede saber ni el creador ni cuántas mascotas sirve cada enlace. El conteo servido además es dinámico (EDGE-011-014): cualquier número guardado/derivado sería potencialmente obsoleto.

## Decisión
(a) Sin cambio de contrato: la API no puede devolver el conteo por enlace, pero la solución correcta mínima es PRESENTACIÓN: dejar de afirmar un número en la fila. Un número fiable exigiría campo nuevo (opción b), desproporcionado frente a un rótulo que ya es dinámico por diseño (D11-06 = A, aviso aprobado por Neo en ShareLinks.tsx:81).

### Cambio exacto (lo implementa /keymaker, dentro de T1508)
- `src/presentation/web/components/ShareLinks.tsx:93`: `return link.scope === 'PET' ? props.petName : 'Hogar compartido';` (sin conteo). `props.household` deja de usarse en `scopeText`; no tocar líneas 194 y 219 (ahí `petCount` es del usuario que va a CREAR el enlace: correcto).
- `HouseholdsPage.tsx:373`: sin cambio (`petCount` sigue alimentando leyenda/botón de creación).
- Opcional BAJA: bajo la lista, reutilizar `HOUSEHOLD_SCOPE_DYNAMIC_NOTICE` ya existente; no es obligatorio.

### Prueba (T1508, unit de presentación, patrón de tests/unit/presentation/t767-t775-t777-enlace-ui.spec.ts)
Renderizar `ShareLinksView` con un enlace `scope: 'HOUSEHOLD'` y `household: { petCount: 1 }`: afirmar que el markup contiene «Hogar compartido» y NO contiene «mascotas» dentro de la fila (regresión K-1: nunca el conteo del visor). Mantener la afirmación de «Todo el hogar (N mascotas)» en el formulario de creación. Sin prueba nueva en T1525 (es de administración).

## Contratos
Sin cambio en contrato 005 ni migración. No requiere Neo (Nivel 2).

## Opción (b) diferida (solo si Neo la quiere)
Enmienda MINOR 005 propuesta: añadir a `ShareLinkView` (share-link.schema.json y share-links.openapi.yaml) el campo opcional `servedPetCount: integer | null` (solo HOUSEHOLD, calculado por petición con `ownedAssignedPets` del creador) y/o `createdByMe: boolean`. REQUIERE NEO (Nivel 2). No recomendada ahora.
