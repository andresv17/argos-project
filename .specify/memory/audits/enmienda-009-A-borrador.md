# Enmienda constitucional 009-A (BORRADOR) — Administración de plataforma: cookies, Google verificado y `jose`

**Estado**: `DRAFT` — **pendiente de firma de Neo (Andrés Vallejo, Nivel 2)**. No aplicada a `.specify/memory/constitution.md`. Ningún agente la pasa a `APPROVED` ni `LOCKED` (CLAUDE.md §1).
**Redactada por**: `/architect`, 2026-11-23, tarea `T1224` (`[ARCH][N2][GH:#19]`). La firma es `T1225` (`[HUM]`) y ratifica además `D9-19` y `D9-20`.
**Traza**: `REQ-ADM9-002`, `REQ-ADM9-003`, `REQ-ADM9-006`, `NFR-009-005`; `SC-009-015`; `ADR-009-15` (límite `429` de `/admin`, `D9-25`); `D9-02` = B, `D9-19`, `D9-20`; contrato `specs/009-aprobacion-admin-correo/contracts/openapi/admin.openapi.yaml` 1.1.0 (`T1226`).
**Bloquea**: la implementación de cookie y sesión de administración de la Fase 3 (`T1228..T1231`, `T1285`, `T1286` y siguientes). Las pruebas rojas pueden redactarse contra el contrato; el código no.

## 1. Versión propuesta

**MINOR** sobre la vigente `3.8.0` (Enmienda 008, `APPROVED` por Neo el 2026-11-23): **`3.8.0` → `3.9.0`**, «Last Amended» = fecha de la firma.

Justificación MINOR (Gobernanza, «Versionado»): se añade una excepción nueva y acotada en una sección existente (cookies de administración) y se extiende el alcance de una dependencia ya autorizada; no se retira ni se redefine ningún principio, no se añade ninguna dependencia npm y `argos_session` y `argos_oauth` no cambian.

**Numeración**: `plan.md` fija que `3.9.0` y `3.10.0` se asignan por orden de firma entre 009-A (esta) y 009-B (`T1254`, Principio VI, modelos de Vertex AI). Si 009-B se firma antes, esta enmienda pasa a `3.10.0`; el texto de las cláusulas no cambia.

## 2. Secciones afectadas

| Sección de la constitución | Tipo de cambio |
|---|---|
| Technology Stack & Repository Structure → **Autenticación** | Se añade una segunda excepción acotada (cookies de administración) tras la de la Enmienda 008 |
| Technology Stack & Repository Structure → **Dependencias autorizadas** (`jose` 6.2.17) | Se extiende el alcance de `google-oidc-verify.ts` al `id_token` del flujo de administración |
| Cabecera «SYNC IMPACT REPORT» y línea final «Versión 3.9.0 …» | Se añaden al aplicarla |
| Principios I a VI | Sin cambio (Principio V, `V.3`, se aplica tal cual: la cabecera `X-Argos-Request` sigue siendo exigible; la administración añade además verificación de origen, `REQ-ADM9-005`) |

## 3. Texto de cada cambio de cláusula

### Cambio 1 — Autenticación: cookies de administración (sección «Stack», viñeta «Autenticación»)

**Se conserva íntegro** el texto vigente de la viñeta (incluida la excepción de la Enmienda 008). **Se añade al final de la viñeta**:

> **Excepción acotada de la feature 009 (Enmienda 009-A, 2026-11-23):** la administración de plataforma (`/admin` y `/api/admin/*`) es un portal separado con sesión propia y distinta de la de usuarios (`INV-ADM9-002`). (a) **Sesión de administración:** cookie `argos_admin_session` (`HttpOnly`, `SameSite=Strict`, `Path=/api/admin`, `Secure` obligatorio en Cloud), con identificador opaco de 32 bytes (base64url) almacenado en la base solo como SHA-256 y **rotado en el *callback***; expira a los 30 minutos absolutos desde su creación o a los 10 minutos sin actividad, lo que ocurra primero. Una cookie solo admite un `Path`: se fija `/api/admin` y la pantalla estática `GET /admin` no la necesita (`D9-20`). No es válida en la API de usuarios y `argos_session` no es válida en `/api/admin/*`. (b) **Estado del flujo OIDC de administración:** cookie `argos_admin_oauth` (`HttpOnly`, `SameSite=Lax`, `Path=/api/admin/auth/google`, `Max-Age` 900 s, `Secure` obligatorio en Cloud), de un solo uso y portadora solo de un identificador opaco (el estado real —`state`, `nonce`, verificador PKCE `S256`, `expires_at`— vive en servidor en un almacén propio de administración, distinto del de usuarios); `SameSite=Lax` se admite únicamente para esta cookie y por la misma razón que `argos_oauth`: una cookie `Strict` no viaja en la navegación que vuelve desde Google; `argos_admin_session` sigue siendo `SameSite=Strict` y se establece en una respuesta `200` del *callback*, no en un `302` cross-site. (c) **URI de redirección** fija por entorno: `/api/admin/auth/google/callback`, nunca derivada de `Host`. (d) **Identidad de administración:** es administrador quien entra con Google (OIDC) con `email_verified = true` y correo incluido en una **lista cerrada de correos en configuración** (`src/infrastructure/config/app-config.ts`, Secret Manager o variable de entorno; no editable desde ninguna interfaz); la identidad se ancla en el `sub` de Google tras el primer acceso y el acceso exige correo en la lista **y** `sub` igual al anclado; quitar el correo de la lista revoca la sesión en la petición siguiente. El rol de administración de plataforma no es un rol de hogar y no existe en `can(rol, acción)` (`INV-ADM9-001`). (e) **Respuesta uniforme:** sin sesión de administración, `/api/admin/*` y toda ruta del portal distinta de `GET /admin` y del inicio del flujo responden como una ruta inexistente, y todo fallo del *callback* responde igual sin revelar la lista. (f) **Límite de intentos:** los fallos del flujo de Google de administración se limitan por IP efectiva (`trustProxy` de 1 salto), no por cuenta, con valores solo en `app-config.ts` (`ADR-009-15`). `argos_session` (`SameSite=Strict`, `Path=/`, 24 h absolutas / 30 min de inactividad) y `argos_oauth` (Enmienda 008) **no cambian**.

### Cambio 2 — Dependencias autorizadas: alcance de `jose` 6.2.17

**Texto vigente (extracto, Enmienda 008):** «…`jose` 6.2.17 se autoriza además en `src/infrastructure/http/google-oidc-verify.ts`, exclusivamente para verificar el `id_token` de Google del flujo de acceso (firma por JWKS de Google, `iss` = `https://accounts.google.com`, `aud` = *client id* de ARGOS, `exp`, `nonce` y `email_verified`); no se importa desde `src/domain/` ni `src/application/` y cualquier otro uso requiere una autorización nueva (Nivel 2). Autorizada por Neo (Level 2), 2026-11-20.»

**Texto propuesto (se sustituye «del flujo de acceso» y se añade la frase final):**

> …exclusivamente para verificar el `id_token` de Google del flujo de acceso **de usuarios y del flujo de administración de plataforma** (firma por JWKS de Google, `iss` = `https://accounts.google.com`, `aud` = *client id* de ARGOS, `exp`, `nonce` y `email_verified`); no se importa desde `src/domain/` ni `src/application/` y cualquier otro uso requiere una autorización nueva (Nivel 2). Autorizada por Neo (Level 2), 2026-11-20. **Enmienda 009-A (2026-11-23):** la verificación del `id_token` del flujo de administración reutiliza el mismo archivo y la misma versión exacta `6.2.17` (sin `^` ni `~`); no se añade ningún archivo importador ni ninguna dependencia nueva, y la pertenencia a la lista cerrada de correos y la comparación del `sub` se evalúan fuera de `jose`, en `src/infrastructure/` y `src/application/` sin importarlo.

Sin cambio de versión de `jose`, de `package.json` ni de `package-lock.json` (`NFR-009-005`).

### Cambio 3 — Cabecera y pie (al aplicarla)

Añadir un `SYNC IMPACT REPORT (3.8.0 -> 3.9.0)` con: «Bump rationale: MINOR», «Modified principles: ninguno», «Modified sections: Technology Stack & Repository Structure (Autenticación, Dependencias autorizadas)», «Added/Removed sections: ninguna», «Follow-up TODOs: lista de correos de administración por `/link` (Secret Manager o variable de entorno) sin `terraform apply`; ninguna dependencia npm nueva». Línea de versión: `**Version**: 3.9.0 | **Ratified**: 2026-11-05 | **Last Amended**: <fecha de la firma>`, y al pie: «Versión 3.9.0 (Enmienda 009-A, …) autorizada y firmada (`APPROVED`) por Andrés Vallejo (Nivel 2) el <fecha>» (solo cuando Neo firme).

## 4. Qué NO cambia

- Principios I a VI y su numeración; `V.3` (CSRF por cabecera) y `V.4` (`404` en lugar de `403`) se cumplen y se refuerzan.
- `argos_session` y `argos_oauth`: atributos, `Path` y vigencias idénticos a los vigentes.
- Dependencias: ninguna nueva; `jose` 6.2.17 y su exclusión de `src/domain/` y `src/application/`.
- Estructura del repositorio y scripts de verificación.
- Sin llamadas reales a Google en CI (pruebas con Google simulado, `T1230`).

## 5. Compatibilidad con otras enmiendas

- **008** (`3.8.0`): se apoya en ella (misma verificación OIDC y mismo patrón `Lax` acotado). No la edita.
- **009-B** (`T1254`, Principio VI): independiente; solo comparten la asignación de número por orden de firma.
- **006 / 006-bis**: sin interacción.

## 6. Decisiones que esta firma de Neo ratifica

- `D9-19`: expiración **30 min absolutos y 10 min de inactividad** para `argos_admin_session`.
- `D9-20`: `Path=/api/admin` para la sesión de administración (una cookie no admite dos `Path`) y `Path=/api/admin/auth/google` para la cookie de flujo.
- `D9-02` = B: administración por Google con correo verificado en lista cerrada de configuración, sin MFA propia (la aporta Google).

### Resoluciones de Neo para `T1225` (aprobadas; la firma formal sigue pendiente, estado `DRAFT`)

- **`GET /api/admin/session` sin *keep-alive*: APROBADO.** Es una consulta de estado y **no renueva** la inactividad de 10 min; la inactividad solo se renueva con acciones reales del portal.
- **Callback fallido de `/api/admin/auth/google/callback` con `404` uniforme: APROBADO.** Mismo `404` que una ruta inexistente (`REQ-ADM9-001`, `EDGE-009-008`); no revela si el correo está en `ARGOS_ADMIN_EMAILS`.
- **Origen de `adminId`: APROBADO.** UUID v4 generado por `IdGeneratorPort` (Principio II), clave primaria de `admin_identities`, creado en el primer acceso verificado (anclado a `provider='GOOGLE'` + `sub`); nunca derivado del correo ni del `sub` de Google. Cero PII en `admin_audit_entries` y en las respuestas.

Estas tres ya no figuran como decisiones abiertas.

## 7. Verificación al aplicarla (para `/oracle`)

1. `grep` de `argos_admin_session`, `argos_admin_oauth` y `/api/admin/auth/google/callback` en la constitución y en `admin.openapi.yaml` coincide en nombre, `Path`, `SameSite` y `Max-Age`.
2. `package.json` intacto; `jose` = `6.2.17` exacto.
3. Ningún cambio en `argos_session`/`argos_oauth` (diff de los textos vigentes).
4. Estado de este borrador y de la constitución sin `APPROVED`/`LOCKED` hasta la firma de Neo.

---
**Firma de Neo (Level 2):** Andrés Vallejo (Neo, Nivel 2) — fecha: 2026-11-23 — Estado de la enmienda: `APPROVED` (aplicada a `.specify/memory/constitution.md` v3.9.0, tarea `T1225`).
