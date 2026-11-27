# Trinity 011 K-2 — Revocación y visibilidad de enlaces entre gestores (2026-11-25)
Solo lectura. Sin cambios de código, sin commit, sin [x].

## Dictamen
K-2 NO es un fallo de autorización. Es comportamiento vigente de 005, firmado y cubierto por contrato. Severidad AppSec real: INFO (sin hallazgo). No hay elevación de privilegios. NO bloquea el cierre del Bloque A.

## Evidencia
- spec 005 REQ-VET-005 (spec.md:111): "El creador, el propietario legal (alcance PET) y el propietario o ADMIN del hogar (alcance HOUSEHOLD) pueden revocarlo en cualquier momento" (D5-12 firmada). Un actor sin autoridad recibe 404 ERR-SHARE-NOT-FOUND, sin revelar existencia (SC-005-046).
- Contrato openapi 005, DELETE /share-links/{id}, x-sdd-rbac-action: "El creador, el propietario legal de la mascota (PET) o el propietario o ADMIN del hogar (HOUSEHOLD)".
- Código `mayRevoke` (share-link-use-cases.ts:140-144) implementa exactamente esa regla (creador OR dueño legal PET OR gestor HOUSEHOLD). El comentario del código la declara.
- Listado (:127-135): requireShareAuthority antes de listar; REQ-VET-001/005 y contrato "lista los enlaces del hogar (solo metadatos, nunca el token)". `ShareLinkView` (:33-47) expone solo id, scope, ids, estado, fechas y flags; no hay token, hash ni createdByUserId.
- Reglas de coherencia: REQ-VET-011 y EDGE-005-20 ya asumen que el nuevo propietario revoca enlaces heredados de otro creador; es un caso de uso deliberado.
- Acceso cruzado: solo OWNER/ADMIN ACTIVE del hogar (ya con autoridad de gestión); un MEMBER o ajeno recibe 404. La revocación es de baja capacidad (reduce acceso, no lo amplía) y queda con auditoría REVOKED con actor_user_id.

## Residuo (UX, no seguridad)
La UI no muestra "Creado por". Ni 005 ni el contrato lo exigen y `ShareLinkView` no trae el campo; añadirlo es cambio de contrato 005 (y exposición de identidad entre gestores, con implicación de privacidad: decisión de /architect y /rama).

## Clasificación
(a) Comportamiento vigente y aceptado de 005 (REQ-VET-005, D5-12). No es de 011 ni del Bloque A.
(c) Recomendación: registrar como DEUDA-011-K2 (mejora de producto, severidad INFO/BAJA UX), fuera de #64: "mostrar creador en la lista de enlaces" con evaluación de privacidad. Mínimo cambio si Neo lo quiere: añadir `createdByDisplayName` a ShareLinkView (contrato 005 + test) solo para gestores del mismo hogar.
No bloquea el cierre del Bloque A.
