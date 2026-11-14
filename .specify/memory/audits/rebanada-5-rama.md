# Informe de privacidad y respaldos — Rebanada 5 (T281, REQ-BACKUP2-001, SC-003)

Autora: Rama (/rama). Fecha: 2026-11-13. HEAD auditado: 304ed41 (rama 002-plataforma-v21). Solo lectura de src/, tests/ y contratos; no se ejecutó test:gate ni compile-contracts.

## 1. Alcance
`src/application/use-cases/backup-use-cases.ts`, `src/domain/backup/{backup-migration,file-digest,import-hardening}.ts`, `src/infrastructure/http/routes/backup.routes.ts`, `src/infrastructure/persistence/sqlite/sqlite-unit-of-work.ts`, `src/domain/audit/sha256.ts`, `src/presentation/web/pages/BackupPage.tsx`, adaptador del token (`sha256-backup-token.adapter.ts`), auditoría (`audit-support.ts`), `spec.md` (REQ-BACKUP2-001/002, REQ-AUD-001, INV-AUD-001, SC-003/004), contrato `backup-envelope.schema.json`.

## 2. Verificaciones

**(1) La exportación solo lleva lo del usuario que exporta — CUMPLE.**
- Selección: `repositories.pets.listByOwners([userId])` (backup-use-cases.ts:166) y registros solo de esas mascotas por `records.listForPet(pet.id)` (:168-170). No se consulta ningún otro usuario, hogar ni asignación.
- `ownerUserId` se elimina por desestructuración (:175). El sobre se construye con solo 4 claves (`schemaVersion, exportedAt, pets, records`) y se valida contra el esquema cerrado (`additionalProperties:false`; BackupPetProfileV3 sin userId/householdId/ownerUserId) antes de emitir el token (:179-182). Los `userId/householdId` que aparecen en el esquema están solo en esquemas Legacy (lectura) y en descripciones.
- Pruebas: backup-export.api.spec.ts:22 (sin userId/ownerUserId), :63 (Andrés 5 mascotas sin Luna; María solo Luna, sin Argos), :94 (claves exactas `exportedAt,pets,records,schemaVersion`; sin `household|assignment|session|password|hash`; sin la cookie de sesión).
- Pruebas cruzadas: access-control.security.spec.ts:86 (María no contiene a Argos ni credenciales) y :100 (importar el respaldo de María como Lucía: 409 ERR-BACKUP-REFERENTIAL-INTEGRITY, base idéntica byte a byte).
- Nombres de terceros: el sobre no contiene usuarios ni miembros; el único texto libre son `name`, `breed` y registros de las mascotas propias.

**(2) Token de confirmación — CUMPLE.**
- Sale solo por cabecera `x-argos-confirmation-token` (routes:34-40; use-case:149,190) y nunca entra al sobre (el sobre se arma antes de emitirlo; :195-205).
- En base solo el SHA-256: `confirmationTokenHash` (sha256-backup-token.adapter.ts:17) y `replaceForUser(userId, hash, ...)` (:26; sqlite-repositories.ts:546). Pruebas: backup-export.api.spec.ts:37 (el token no está en `r.text`) y :44 (`api.dump()` no contiene el token y sí su SHA-256).
- Respuestas con `Cache-Control: no-store` también en error (routes:29-32).
- UI: BackupPage.tsx:33-37 lee la cabecera; en :64 solo usa `blob` y `fileName`; no hay localStorage/sessionStorage/console en `src/presentation`.

**(3) Vista previa e importación no revelan IDs ni nombres ajenos — CUMPLE (con observación O-1).**
- Vista previa: no consulta IDs ajenos; las colisiones se miden solo contra mascotas propias (use-case:350-362). Devuelve solo conteos, `fileDigest` y números de mascotas/hogares afectados (sin IDs ni nombres de hogares). Pruebas: backup-import-preview.api.spec.ts:51 y :62 (Lucía sin mascotas: colisiones 0, `r.text` sin LUNA_ID).
- Importación: el rechazo por ID ajeno usa detalle genérico fijo "El archivo contiene un identificador que no se puede importar." (:314,:320); el detalle de duplicado/huérfano solo cita IDs del propio archivo (:276,:282,:286). `assertNoForeignIds` corre dentro de la transacción antes de cualquier escritura.
- O-1 (informativa, diseño de spec/INV-ACC-002): el 409 de la importación confirma que un UUID existe en otra cuenta. Es el comportamiento exigido por STATE-BACKUP-001 y la previsualización no lo ofrece; UUID v4 no enumerable. Sin acción.

**(4) Mascotas compartidas y hogares — CUMPLE.**
- Spec (REQ-BACKUP2-001): solo Propietario Legal; sin hogares ni asignaciones. La exportación no lee `assignments` ni `households` (use-case:159-190); las mascotas de otros compartidas conmigo no se exportan (María no exporta Argos).
- Importación (REQ-BACKUP2-002): las mascotas quedan con `ownerUserId = userId` y sin asignaciones (use-case:230 `prepare`; commit borra `assignments.deleteForPet` y no inserta ninguna); la vista previa avisa con conteos (`affectedSharedPets`) de las propias mascotas compartidas que perderán la asignación. Sin datos de hogares ajenos.

**(5) Fila IMPORT y auditoría — CUMPLE según spec/INV-AUD-001.**
- Una fila `IMPORT` (`USER`, `entityId = userId`) con `previousStateHash`/`newStateHash` = SHA-256 del JSON canónico (audit-support.ts:40-51; use-case:449-457). No guarda contenido de mascotas, tokens ni cookies.
- Matiz: `executorUserId` y `entityId` llevan el `userId` (UUID opaco, no nombre/correo) mientras la cuenta existe; REQ-AUD-001 lo reemplaza por HMAC-SHA256 solo al eliminar la cuenta (cubierto en la auditoría de la Rebanada 4, rebanada-4-rama.md). No es una desviación; se declara para que Neo no lo lea como "solo HMAC" en vida de la cuenta.
- El token no se audita (spec: "las sesiones y los tokens de confirmación no se auditan"); `api.dump()` en :44 confirma que no queda en claro.

**(6) Pruebas ejecutadas** (`npx vitest run` de los 4 archivos pedidos): 4/4 archivos, 76/76 pruebas en verde (backup-export 13, backup-import-preview 12, access-control 13, backup-hostile-input-red 38). Duración 1,74 s.

**(7) Logs — CUMPLE.** `grep -E "console\.|logger|\.log\(|pino|request\.log"` sobre use-cases/backup-use-cases.ts, domain/backup/, routes/backup.routes.ts, BackupPage.tsx, sha256.ts y audit-support.ts: 0 coincidencias. El log global (server.ts:30) usa el serializador por defecto de Fastify (método, URL, estado; no cuerpo ni cabeceras) y problem-details.ts:51 registra solo errores no previstos. La cabecera `X-Argos-Confirmation-Token` de la respuesta no la serializa pino por defecto.

## 3. Hallazgos
- **H-1 (baja, oráculo débil de prueba; no es defecto de producción)**: `tests/security/exploits/access-control.security.spec.ts:86-98` (INV-ACC-001) sigue comparando `ownerUserId` y `exportedByUserId` del sobre, campos que el 3.0.0 ya no tiene: ambos lados valen `undefined` y la aserción `[undefined]` = `[undefined]` pasa de forma vacía. La ausencia de esos campos sí queda cubierta por backup-export.api.spec.ts:22 y :94, así que no hay brecha de cobertura de SC-003, pero la prueba de seguridad debería afirmar ausencia explícita (`'ownerUserId' in p === false`, `'exportedByUserId' in envelope === false`). Propuesta: Keymaker/Trinity la endurecen en tests/ (Rama no toca tests/).
- O-1 (informativa): ver (3).
- O-2 (informativa, fuera de alcance): BackupPage descarta el token tras exportar; el consumo en la pantalla de eliminación de cuenta pertenece a su propia tarea.

## 4. Decisiones abiertas para Neo
Ninguna nueva. (D-1 y D-2 de la Rebanada 4 siguen vigentes y no cambian aquí.)

## 5. Veredicto
**SIN HALLAZGOS ABIERTOS de producción** para T281 (exportación sin datos ajenos, token solo en cabecera y hash, vista previa e importación genéricas, auditoría sin secretos, sin logs). Queda H-1 como mejora baja de un oráculo de prueba que no bloquea el cierre; si Oracle exige "informe sin hallazgos", H-1 debe liquidarse (cambio de 2 líneas en tests/) o aceptarse expresamente. T281 no se marca; el cierre es de Neo.
