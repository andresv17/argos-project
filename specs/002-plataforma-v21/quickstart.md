# Quickstart de validación: Plataforma ARGOS v2.1 (Feature 002)

**Rama**: `002-plataforma-v21` | **Plan**: [plan.md](./plan.md) | **Contratos**: [contracts/](./contracts/README.md)

Guía para **validar** la feature con las compuertas del proyecto. Este documento no ejecuta nada: indica qué correr, en qué orden y qué resultado esperar. En F4 solo existen documentos y contratos; las compuertas de código (pruebas, mutación, e2e) se vuelven aplicables cuando F6 genere `tasks.md` y se implemente. Las rutas son relativas a la raíz del repositorio.

## 1. Lectura previa

1. [spec.md](./spec.md) (APPROVED) y `.specify/memory/constitution.md` (3.1.0).
2. [plan.md](./plan.md) (decisiones `ADR-002-01` a `ADR-002-17`, IDs pendientes y puntos para Neo).
3. [data-model.md](./data-model.md) (tablas y dónde se hace cumplir cada `INV-*`).
4. Contratos en [contracts/](./contracts/README.md).

## 2. Validación de los contratos (F4, ahora)

Revisión de estructura, sin generar `src/generated/`:

| Qué comprobar | Cómo | Resultado esperado |
|---|---|---|
| Todo `$ref` resuelve | Recorrer los 6 esquemas y la OpenAPI buscando cada `$ref` (script de revisión con `ajv` o `yaml`) | 0 referencias rotas |
| Los esquemas compilan en modo estricto | Cargar `contracts/schemas/*.json` en Ajv 2020 con `strict: true`, `strictTypes: true`, `multipleOfPrecision: 10`, `ajv-formats` y las palabras clave `x-sdd-metadata`, `x-sdd-status`, `x-sdd-error` registradas | Compilan sin error; no se usa ninguna otra palabra `x-sdd-*` en los esquemas |
| La OpenAPI cumple la forma | 40 operaciones, `operationId` únicos, cada una con `x-sdd-requirements` no vacío, `X-Argos-Request` en toda petición que cambia estado | 40 operaciones: 13 `NEW`, 21 `CHANGED`, 6 `UNCHANGED` |
| Los códigos de error existen | Todo `ERR-*` citado en OpenAPI, máquinas y `x-sdd-error` está en `errors/error-catalog.json` | 0 códigos desconocidos; 35 entradas con `type`, `status`, `title`, `invariantRef`, `detailTemplate` |
| Casos de contrato | `Password`: `Abcdefgh1!` válida; sin mayúscula, sin número, sin símbolo, o de 9 caracteres inválida. `CreatePetInput`: `OTHER` exige `speciesOther`; `BIRD` con `speciesOther` falla; `birthDate` y `estimatedAge` son excluyentes. Peso: 0.0005 falla, 0.001 y 150 pasan. Respaldo 3.0.0 con `exportedByUserId` falla. `ACCOUNT_DELETE` con `executorUserId` en claro falla | Todos como se indica |

## 3. Compuertas del proyecto (cuando exista código de F6)

Orden de `npm run test:gate` (constitución, principio IV). Cada paso debe terminar en verde antes del siguiente:

```bash
bash scripts/compile-contracts.sh   # regenera src/generated/ desde los contratos de la 002
bash scripts/verify-traceability.sh # 100 % de REQ, INV, STATE y ERR vigentes con implementación y prueba
bash scripts/verify-oracles.sh      # sin oráculos débiles
npx tsc --noEmit                    # estricto, sin errores
npm run test:coverage               # vitest con umbrales de cobertura
npm run test:mutation               # Stryker >= 85 %
npm run test:e2e                    # Playwright + axe-core a 320, 768, 1024 y 1280 px
```

Requisito previo para el primer paso: Neo autoriza el cambio de `scripts/compile-contracts.sh` y `scripts/codegen.mjs` para leer `specs/002-plataforma-v21/contracts/` (plan, punto 1). Hasta entonces el compilador sigue leyendo la 001.

## 4. Mapa de criterios de éxito a pruebas

| Criterio | Qué prueba debe existir | Contrato implicado |
|---|---|---|
| `SC-001`, `SC-010` | Registro, login y logout con contraseñas válidas e inválidas; cuenta de 8 caracteres de la 001 inicia sesión | `Password`, `LoginPassword`, `registerUser`, `login` |
| `SC-003`, `SC-008` | Matriz de 11 acciones × 4 roles (44 casos) contra el servidor y la interfaz; cero accesos cruzados con todos los roles | `RbacAction`, `PetPermissions`, `STATE-HOUSE-MEMBERSHIP-001` |
| `SC-004` | Fallo inyectado en cada escritura de la importación; volcado lógico idéntico, cero filas de auditoría nuevas, error `ERR-BACKUP-ATOMIC-ROLLBACK` con `ROLLED_BACK`; casos extra de rollback fallido y `SIGKILL` | `STATE-BACKUP-001` 2.3.0 (`injectedFailureCriterion`) |
| `SC-005`, `REQ-UI2-008` | axe-core sin violaciones `critical` ni `serious` a 320, 768, 1024 y 1280 px | Interfaz |
| `SC-006`, `SC-009` | Reloj controlado: expira a los 30 min de inactividad y a las 24 h absolutas; recarga a los 10 min no cierra; el `timezone` del perfil no altera edades ni alertas | `STATE-AUTH-SESSION-001` 3.0.0 |
| `SC-011` | Migración desde una base de la 001: misma visibilidad, repetible sin duplicar, 1 fila `MIGRATION` | `REQ-MIG-001`, ADR-002-10 |
| `SC-012` | Una fila por mutación; hash idéntico con claves en distinto orden; sin secretos; vista canónica sin `email`, `displayName` ni `microchipId` | `audit-entry.schema.json` |
| `SC-013` | Propiedades (fast-check) de límites de peso por especie: 0.05 y 0.001 inclusivos, por debajo rechazados | `SpeciesWeightLimits` |
| `SC-014` | Eliminación bloqueada con hogar o mascotas compartidas; sin token vigente se rechaza; `executorUserId` y `entityId` de `ACCOUNT_DELETE` son HMAC; la app no arranca en producción sin `ARGOS_AUDIT_HMAC_SECRET`; hogar de un solo `ACTIVE` desaparece | `STATE-ACCOUNT-DELETE-001` |
| `SC-015` | Editar un registro `SUPERSEDED` se rechaza con cualquier rol | `ERR-REC-SUPERSEDED-IMMUTABLE` |
| `SC-016`, `SC-017` | Transferencia de propiedad con poda de asignaciones y una fila de auditoría; visibilidad exacta tras asignar, desasignar, expulsar, abandonar y eliminar hogar | `transferPetOwnership`, `assignPetToHousehold` |

## 5. Batería de seguridad ampliada (`tests/security/`)

Los 9 vectores de la constitución se ejecutan con los 4 roles; se añaden 7:

| Vector | Qué ataca | Referencia |
|---|---|---|
| V10 | Token de respaldo reutilizado o en dos peticiones simultáneas: solo una gana | `REQ-ACC-002`, `SC-014` |
| V11 | Token caducado (10 min exactos), ajeno, ausente o sustituido: mismo error y mismo cuerpo | `ERR-ACCOUNT-CONFIRMATION-MISMATCH` |
| V12 | `ARGOS_AUDIT_HMAC_SECRET` ausente, de menos de 32 bytes o con el valor de prueba en producción: no arranca; el valor nunca aparece en logs | `REQ-AUD-001` |
| V13 | Cookie de otra sesión reutilizada tras cambiar la contraseña | `STATE-AUTH-SESSION-001` (`REVOKED`) |
| V14 | Actividad constante no supera las 24 h; peticiones rechazadas no renuevan | `INV-AUTH2-002` |
| V15 | Búsqueda del `userId` eliminado en filas de auditoría y en el volcado de la base: cero apariciones en claro | `INV-AUD-001`, `SC-014` |
| V16 | Importación con `ownerUserId`, `role` o asignaciones falsos (1.0.0, 2.0.0 y 3.0.0): la propiedad es la de la sesión o el archivo se rechaza | P-14, `ERR-BACKUP-SCHEMA-INVALID` |

Pruebas adicionales: la interfaz no hace peticiones autenticadas en segundo plano (P-04); la invitación devuelve el mismo cuerpo y un tiempo similar exista o no el `username` (R3); un escáner de logs no encuentra `userId`, `username`, `email`, token ni cookie sembrados (R-01).

## 6. Recorrido manual de aceptación (después de F6)

1. Registrar un usuario con contraseña de 10 caracteres con mayúscula, número y símbolo; confirmar que `Abcdefgh1` (sin símbolo) se rechaza.
2. Crear una mascota de cada una de las 8 especies; registrar 0.030 kg en un ave (válido) y en un perro (`ERR-REC-WEIGHT-OUT-OF-RANGE`).
3. Crear un hogar, invitar con rol `CAREGIVER`, aceptar desde otro navegador y asignar una de dos mascotas: el invitado ve solo esa.
4. Como `CAREGIVER`, registrar un peso (permitido) e intentar editar el nombre de la mascota (denegado y sin botón).
5. Registrar dos vacunas «Rabia»: la primera pasa al acordeón «Reemplazados» y su edición se rechaza.
6. Exportar el respaldo (el servidor emite el token en la cabecera), importarlo con previsualización y observar el aviso de mascotas compartidas.
7. Intentar eliminar la cuenta con una mascota compartida (bloqueada); transferirla; eliminar con frase `ELIMINAR MI CUENTA`, contraseña y token vigente.

## 7. Qué NO validar todavía

Valores clínicos definitivos del peso máximo de las seis especies pequeñas (provisional, a validar por veterinario), reglas de peso ideal o alerta geriátrica (fuera de la spec), SSO, recuperación de acceso por correo, importación Merge y despliegue Cloud (Feature 003).
