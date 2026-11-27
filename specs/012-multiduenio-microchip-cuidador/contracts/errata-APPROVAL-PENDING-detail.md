# Errata APPROVAL-PENDING-detail — texto de `ERR-OWN12-APPROVAL-PENDING`

- **Estado:** APPROVED (Nivel 2, Neo, 2026-11-27).
- **Autor:** /architect, 2026-11-27. **Origen:** hallazgo H-K2 de /keymaker (texto único en `co-ownership-api.ts`) y propuesta H-K1 (`propuesta-UI-H-K1.md`).
- **Contrato afectado:** `errors/error-catalog.json`, clave `ERR-OWN12-APPROVAL-PENDING`, solo `detailTemplate`. Sin cambio de código, `status` (409), `title`, `invariantRef` ni `requirementRef`; sin cambio en `spec.md`.

## Diagnóstico
El código se devuelve en dos situaciones: (a) ya hay una solicitud pendiente de esa acción (UNIQUE parcial, EDGE-012-030) y (b) rechazo directo de Eliminar/Transferir con más de un propietario `ACTIVE` (REQ-OWN12-004), sin solicitud previa. El texto vigente solo era veraz en (a).

## Antes / después
- **Antes:** «Ya existe una solicitud pendiente de esta acción para esta mascota. Espera su resolución o cancélala.»
- **Después:** «Esta acción necesita la aprobación de los demás propietarios de la mascota. Si ya hay una solicitud en curso, espera su resolución o cancélala; si no, pídela desde «Acciones que necesitan la aprobación…».»

Cubre (a) espera/cancela y (b) necesita aprobación y cómo pedirla. El cliente (`co-ownership-api.ts:69`) conserva su copia propia más corta; ambos son compatibles (el `detail` del servidor no se muestra tal cual en la UI).

## Impacto
`src/generated/` debe regenerarse con `bash scripts/compile-contracts.sh` (a cargo de /keymaker). Pruebas que comparen el `detail` literal deben actualizarse.
