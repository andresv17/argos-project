# Contratos de la Feature 008 (delta normativo; sin esquemas ejecutables propios)

**Estado**: `DRAFT`. Resolución de Nivel 2 de Neo del 2026-11-20: los contratos de 008 **se enmendaron en las líneas existentes 002, 004 y 006** (MINOR aditivas, commit `86fad83`, con `src/generated/` regenerado) en lugar de abrir una línea nueva; esta carpeta solo lleva el índice de contratos y el catálogo incremental vacío que necesita la compuerta `verify-traceability.sh`. Nada de `/api/admin`, `PENDING` ni correo real (todo eso es Feature 009).

| Contrato | Origen | Tarea | Archivos y versión |
| --- | --- | --- | --- |
| Rutas `startGoogleLogin`, `completeGoogleLogin`, `chooseGoogleUsername`, `startGoogleLink`; `GoogleChooseUsernameInput`, `GoogleLinkStartInput`, `GoogleAuthorizationView`, `AuthMethods`; `ERR-AUTH-GOOGLE-FAILED` y `ERR-AUTH-GOOGLE-LINK-CONFLICT` | `[GH:#16]`, `[GH:#17]` | T1110 | 002: `pet-tracker-api.openapi.yaml` 3.3.0, `identity.schema.json` 3.1.0, `error-catalog.json` 3.2.0. 004: openapi 3.4.0, `identity.schema.json` 3.2.0, `error-catalog.json` 3.2.0 |
| Cookie `argos_oauth` (`SameSite=Lax`, 900 s) y `jose` en `google-oidc-verify.ts` | `[GH:#16]` | T1111 | `.specify/memory/constitution.md` 3.8.0 (`c8e59e7`) |
| Parámetro `download=1` y `Content-Disposition: attachment` en la imagen de escena | `[GH:#54]` | T1167 | 006: `home-scene.openapi.yaml` 3.5.0 |
| `Biography`, `PetProfile.biography`, `UpdatePetInput.biography`; sobre de respaldo `BackupEnvelopeV33` (3.3.0) | `[GH:#21]` | T1178 | 002 y 004: `pet.schema.json` 3.2.0, `backup-envelope.schema.json` 3.3.0; `exportBackup` responde `BackupEnvelopeV33` |
| Ruta `searchInvitees` (`GET /households/{householdId}/invitees?q=`), `InviteeSearchPrefix`, `InviteeSuggestion`, `InviteeSearchResult` | `[GH:#24]` | T1187 | 002 y 004: openapi e `identity.schema.json` (mismas versiones de arriba) |
| Textos de ayuda de rol y aviso de hogar (catálogo cerrado; sin contrato ejecutable) | `[GH:#25]` | T1195 | — |

**Diferido a 009** (sin contrato en 008): `STATE-ACCT8-001` y `accountStatus` (`[GH:#18]`, T1135), `/api/admin/*` y sesión de administración (`[GH:#19]`, T1144), parámetros de plataforma (`[GH:#20]`, T1156), enmienda de `STATE-AUTH-SESSION-001` (`[GH:#18]`, T1200), rutas de registro con correo, verificación y reenvío (`[GH:#16]` en 009), `identity_link_requests` (T1127) y desvincular (T1130).

Sin cambio: `STATE-AUTH-SESSION-001` (004 y 002), `ScenePayload` de 006 (`D8-12` = A), `REQ-HOUSE2-001` (`D8-10` = A), `AuditEntityType` (la vinculación se audita como `USER` / `UPDATE` con detalle opaco).

`errors/error-catalog.json` de esta carpeta es un **índice incremental vacío** (sin códigos) que solo existe para que la compuerta `verify-traceability.sh` encuentre su fuente; los dos códigos nuevos de 008 viven en los catálogos 002 y 004 porque sus rutas viven allí. Rojos esperados hasta `/keymaker`: la compuerta `verify-traceability.sh --feature 002` falla por los dos códigos nuevos sin `@implements` ni prueba, y las pruebas que fijan versiones (`contracts-004-*`, `canonical-fixtures*`, `generated-contracts`) y la conformidad OpenAPI deben actualizarse al implementar.
