# Checklist de calidad de la especificación: Plataforma ARGOS v2.1 (Feature 002)

**Propósito**: Validar calidad, consistencia y completitud de `spec.md` antes de pasar a F4 (plan y contratos).
**Creada**: 2026-11-10 por `/mouse` (F5, equivale a `/speckit-analyze` + `/speckit-checklist`)
**Reauditada**: 2026-11-10 por `/mouse` (F5 bis, tras aplicar N-1 a N-5)
**Feature**: `specs/002-plataforma-v21/spec.md` (estado DRAFT; esta checklist no la aprueba)
**Leyenda**: `[x]` cumple, `[ ]` no cumple o cumple con observación (se indica el hallazgo). Hallazgos nuevos de la reauditoría: N-A a N-E.

## 1. Contenido y estructura

- [x] CHK001 La spec no prescribe librerías, frameworks ni código; los nombres técnicos citados son contratos o puertos ya existentes.
- [x] CHK002 Tiene las secciones obligatorias: historias con prioridad y prueba independiente, requisitos, criterios de éxito, supuestos.
- [x] CHK003 Cada historia (P1 a P8) tiene escenarios Given/When/Then y una prueba independiente.
- [x] CHK004 Los casos borde cubren sesión, doble hogar, propietario del hogar, transferencia, importación, zona horaria y payload.
- [x] CHK005 La sección «Open Questions» refleja la realidad: N-1 a N-5 resueltas; queda un único requisito previo (firma de la enmienda, N-3). (Cerrado H-F5-01.)

## 2. Decisiones aprobadas por Neo

- [x] CHK010 D1 (`username` como login, correo opcional sin envío) está en `REQ-AUTH2-001`/`REQ-HOUSE2-001`.
- [x] CHK011 D2 (30 min de inactividad, 24 h absolutas, recarga no cierra) está en `INV-AUTH2-002` y SC-009.
- [x] CHK012 D3 (8 especies, DOG→CANINE, CAT→FELINE, lectura de 1.0.0 y 2.0.0) está en `INV-PET2-001`, `REQ-MIG-001`, `REQ-BACKUP2-002`.
- [x] CHK013 D4 (matriz §5.2) está en `REQ-RBAC-001`, con las extensiones por defecto y la excepción N-4 declaradas.
- [x] CHK014 D5 (SSO, recuperación por correo, adjuntos PDF a la 003) está en «Fuera de alcance».
- [x] CHK015 D6/6A (eliminación bloqueada hasta transferir o desasignar) está en `REQ-ACC-002` y SC-014.
- [x] CHK016 1A (contraseña 10–128, mayúscula, número y símbolo; login sin política) está en `INV-AUTH2-001` y `REQ-AUTH2-002`.
- [x] CHK017 2A (respaldo con solo mascotas propias) está en `REQ-BACKUP2-001`.
- [x] CHK018 3A (solo reemplazo atómico; Merge a la 003) está en `REQ-BACKUP2-002`.
- [x] CHK019 4A (una `APP_TIMEZONE`; el `timezone` del perfil solo muestra) está en `REQ-TIME-001` y SC-006.
- [x] CHK020 5B (asignación explícita mascota-hogar con migración de visibilidad) está en `REQ-HOUSE2-003` y `REQ-MIG-001`.
- [x] CHK021 7B (peso mínimo 0.001 kg con 3 decimales fuera de perro y gato) está en `INV-REC2-002` y SC-013.
- [x] CHK022 Criterios por defecto: miembros actuales a Lector, transferencia inmediata, permisos de citas, parámetros y medidas por la matriz.
- [x] CHK023 Ninguna decisión aprobada (incluidas N-1 a N-5) es contradicha por otro texto de la spec; verificado con grep.
- [x] CHK024 La precondición «descarga previa del respaldo» de D6 es verificable en el servidor: token efímero de 10 min, un solo uso (N-2; `REQ-ACC-002` punto 5, `REQ-BACKUP2-001`, SC-014). (Cerrado H-F5-04.)

## 3. Verificabilidad de requisitos

- [x] CHK030 Los `REQ-*` clínicos, de sesión, de contraseña y de respaldo tienen valores medibles (rangos, tiempos, tamaños).
- [x] CHK031 Los criterios de éxito SC-001 a SC-017 son medibles y sin tecnología.
- [x] CHK032 `REQ-RBAC-001` tiene resultado S/N en las 44 celdas (11 filas por 4 roles); ninguna dice «cuenta». (Cerrado H-F5-02.) Observación menor N-D, no bloqueante.
- [x] CHK033 `REQ-AUD-001` define filas por mutación compuesta y valores cerrados de `mutationType`/`entityType`, coherentes en toda la spec; `entityId` de `ACCOUNT_DELETE` es HMAC-SHA256 (N-A, H-F5-05 cerrados en la reauditoría ter).
- [x] CHK034 `REQ-ACC-002` cubre el hogar propio sin otros miembros activos: cascada (N-5; `REQ-ACC-002`, `REQ-HOUSE2-002`, US7 AC4, SC-014). (Cerrado H-F5-03.)
- [x] CHK035 `REQ-AUTH2-001` e `INV-AUTH2-001` definen «símbolo» (32 caracteres), conteo de caracteres, rechazo de `username` con mayúsculas y no unicidad de `email`. (Cerrado H-F5-08, H-F5-09.)
- [x] CHK036 `REQ-REC2-002` resuelve «requiere próxima dosis» como indicador derivado, y los nombres de campo frente a `INV-REC-004/005/006`. (Cerrado H-F5-10.)
- [x] CHK037 `REQ-OWN-001` conserva el invariante «el propietario es miembro activo de los hogares donde su mascota está asignada» con poda en la misma transacción. (Cerrado H-F5-06.)
- [x] CHK038 `REQ-HOUSE2-002` dice qué pasa con las asignaciones de un dueño expulsado o que abandona. (Cerrado H-F5-07.)
- [x] CHK039 `STATE-*` nuevos o modificados nombran estados y eventos; el detalle de transiciones se difiere a F4 de forma explícita.

## 4. Trazabilidad con la Feature 001

- [x] CHK040 Los 60 identificadores `REQ/INV/STATE` detectados en la 001 aparecen en la tabla o en «Vigentes sin cambio»; ninguno queda huérfano.
- [x] CHK041 Cada reemplazo declara el identificador que sustituye; no hay IDs definidos dos veces.
- [x] CHK042 Los IDs vigentes conservan su identificador sin sufijo.
- [x] CHK043 Referencias internas apuntan a IDs vigentes o a «amplía/reemplaza»; la fila de `INV-HOUSE-002` está aclarada. (Cerrado H-F5-12.) Observación menor N-E: `REQ-PET2-002` y `REQ-HOUSE2-004` citan el orden de IDs reemplazados.
- [x] CHK044 Existe una lista de IDs nuevos sin equivalente en la 001. (Cerrado H-F5-15.)

## 5. Alcance, dependencias y constitución

- [x] CHK050 La spec no introduce librerías, servicios de correo ni almacenamiento nuevos; SSO, correo y adjuntos están fuera de alcance. El secreto `ARGOS_AUDIT_HMAC_SECRET` es configuración, no dependencia.
- [x] CHK051 La spec es compatible con la constitución una vez enmendada: la enmienda incluye (a bis) con el texto actual verificado contra la línea 129 y la cita literal de la regla MINOR (N-B, N-C cerrados).
- [x] CHK052 El alcance excluye con claridad lo de la Feature 003.
- [x] CHK053 Los errores nuevos están marcados como provisionales hasta F4.
- [x] CHK054 La política del hash de auditoría está definida: HMAC-SHA256 con secreto de aplicación para `executorUserId` tras eliminar la cuenta (N-1); SHA-256 sin clave para los estados. (Cerrado H-F5-13.)

## 6. Resultado

Cumple 40 de 40 criterios; 0 abiertos (reauditoría ter, 2026-11-10: N-A, N-B, N-C, N-E y H-F5-05 cerrados). Observación sin bloqueo: la versión 3.1.0 MINOR se declara en la enmienda como interpretación (la regla literal dice «principio o sección nuevos»); Neo decide en la firma. La spec sigue en DRAFT; ninguna aprobación implícita. Pendiente de Neo: firma de spec y enmienda.
