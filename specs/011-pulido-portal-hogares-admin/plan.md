# Implementation Plan: Pulido del portal, Hogares unificados y roles de /admin (Feature 011)

**Branch**: `011-pulido-portal-hogares-admin` (a crear por Neo/Morpheus) | **Date**: 2026-11-25 | **Spec**: `specs/011-pulido-portal-hogares-admin/spec.md`
**Estado**: `DRAFT` (techo de agente `REVIEW`). **Input**: `spec.md` con 13 decisiones pendientes de Neo (`D11-01..D11-13`); el plan solo fija lo que no depende de ellas y marca explícitamente dónde la arquitectura final se **condiciona** a una decisión.

## Summary
Nueve ítems en nueve bloques, cada uno con **prueba local manual antes de las compuertas** (regla de Neo). Orden propuesto (`D11-ORDEN`, reordenable por Neo): P1 primero (`#64`, `#72`, `#73`, `#63`), luego P2 (`#31`, `#59`, `#62`, `#74`, `#78`). `#64` precede a `#59` y `#62` porque los tres tocan la página de Hogares. `#72` y `#73` comparten la superficie de la escena y se hacen contiguos.

## Technical Context
**Language/Version**: TypeScript 5 estricto, Node 22.23.4, React (Vite). **Testing**: Vitest + Playwright (`es-CO`); Google y Vertex simulados (sin red en CI). **Storage**: SQLite y Postgres con paridad; la numeración de la siguiente migración se verifica en disco al editar (última vista: SQLite `0029_about_content`, Postgres equivalente). **Dependencias**: ninguna nueva. Sin `git push`, sin despliegue.

## Constitution Check
- **Nivel 2 (requieren a Neo)**: migraciones nuevas (tabla de delegados `#63`, columnas/tablas de `#74`, `#78` y eventualmente `#64` si `D11-06` = B), enmienda de contratos vigentes (vista pública `#31` con foto, `share` con subconjunto `#64`), y cualquier enmienda constitucional (la cookie/auth de `/admin` fue la 009-A; los roles son MINOR sobre ella si se considera cambio de Autenticación — a confirmar por `/mouse`).
- **Principio II (hexagonal)**: reglas de rol en `domain/` (conjunto cerrado y matriz operación→roles, sin I/O), casos de uso en `application/`, repositorios en `infrastructure/persistence` con paridad SQLite/Postgres/Memoria, rutas finas en `infrastructure/http`.
- **Principio IV (TDD)** y **VI (sin dependencias)** respetados. **INV-ARCH-006**: números (topes, tamaños de miniatura) en un solo lugar (`app-config.ts` o `domain/` según su naturaleza).

## Topología por bloque (hexagonal)

| Bloque | Capa y pieza | Notas |
| --- | --- | --- |
| `#64` Hogares | `presentation/web`: `HouseholdsPage.tsx` pasa a ser la página única; `ShareLinks.tsx` se parametriza (`mode: 'PET' | 'HOUSEHOLD'`) y oculta la leyenda cuando no hay elección; `AppShell.tsx` ajusta la navegación según `D11-05` | Sin cambio de dominio si `D11-06` = A. Si = B: puerto de enlaces y esquema con lista de `petIds` (contrato 005 MINOR, migración N2) |
| `#72` Etiqueta IA | `presentation/web`: `HomeSceneImage.tsx` y toda superficie de la imagen; si `D11-07` incluye marca de agua: transformación de bytes en un servicio de `application/` (puerto de imagen) | Texto único en una constante (`scene-notice.ts` o archivo hermano; versionado si cambia el consentimiento). Revisión de `/rama` |
| `#73` Prompts | `application/use-cases/scene-run-use-case.ts` (el prompt vive solo en memoria, jamás sale de la función); `fake-scene-image-generator.adapter.ts` (modo `echo` solo en pruebas, nunca en `real`); `inputs_snapshot` según `D11-08`; guarda en `tests/security` que prohíbe `prompt` en persistencia y respuestas | Auditoría de superficies en `T1520` antes de cambiar nada |
| `#63` Roles | `domain/admin/` (nuevo, un archivo: tipo `PlatformRole` cerrado + matriz operación→roles + reglas de bloqueo); `application/use-cases/admin-*-use-cases.ts` leen el rol por petición; puerto `AdminDelegateRepository`; migración con tabla de delegados + auditoría ampliada (acciones nuevas en `admin_audit_entries`); rutas `/api/admin/administrators*`; panel `AdministratorsPanel.tsx` en `presentation/admin` | `admin_identities` se reutiliza (anclaje de `sub`); revalidación por petición = lista de configuración ∪ delegado `ACTIVE`; contratos: `admin.openapi.yaml` nuevo MINOR, catálogo de errores, esquema del delegado, máquina de estados `STATE-ADM11-001` (`ACTIVE ↔ DISABLED`) |
| `#31` Informe | `presentation/web/components/SharedSummary.tsx` y `SharedPage.tsx`; foto: solo si `D11-09` ≠ C (contrato de la vista pública + endpoint de imagen por token) | La vista pública sigue fuera de sesión (`credentials: 'omit'`) |
| `#59` Foto hogar | `HouseholdPhoto.tsx`; miniatura bajo demanda o indicador según `D11-10` | Sin cambio de contrato si es solo de presentación |
| `#62` Álbum | caso de uso de lectura `listHouseholdAlbum` (`application/`) con filtro por permisos efectivos de cada mascota; ruta de solo lectura; `HouseholdAlbum.tsx` reutiliza `PhotoAlbum` | Sin tablas nuevas; sin copiar objetos |
| `#74` Tope | regla en `domain/households/household-policies.ts`; chequeo transaccional en crear/aceptar; error de catálogo; valor en `app-config.ts` o `platform_parameters` según `D11-12` | Si `D11-12` = A: solo registro de la decisión (sin código) |
| `#78` Perfil | puerto de avatar de usuario, tabla/columna nueva (N2), reutiliza `AvatarCropper`/`avatar-crop.ts`; si Google: lectura de `picture` en `google-oidc-verify.ts`/`google-auth-use-cases.ts` | Eliminación de cuenta (`account-deletion`) debe borrarla (`INV-PRF11-001`) |

## Decisiones de arquitectura (ADR) condicionadas
- **ADR-011-01** (rol de plataforma por petición): el rol se resuelve en el middleware de `/api/admin/*` consultando lista de configuración y tabla de delegados en cada petición (sin caché de rol), porque la revocación inmediata es requisito (`REQ-ADM11-004`). Descartado: guardar el rol en la sesión (revocación diferida).
- **ADR-011-02** (separación de dominios de rol): `PlatformRole` en un módulo propio sin importar de `domain/access`; una prueba de arquitectura garantiza que `domain/access` y `domain/households` no importan `PlatformRole` y viceversa (`REQ-ADM11-002`).
- **ADR-011-03** (prompt solo en memoria): el prompt se construye, se envía y se descarta; no se pasa a repositorios, auditoría, logs ni a la imagen. El modo `echo` del generador de prueba se mantiene **solo** si el controlador real jamás puede instanciarlo (guardia de configuración).
- **ADR-011-04** (álbum del hogar por consulta, no por copia): agregación en lectura por `pet_assignments` vigentes; ver `EDGE-011-006`.
- Cada ADR queda **sujeto** a la decisión de Neo indicada en `spec.md`; si Neo elige otra opción, `/architect` enmienda el plan antes de que `/keymaker` empiece el bloque.

## Contratos (se redactan en tareas `[ARCH]` tras las decisiones; ver `contracts/README.md`)
Nuevos o enmendados: `admin.openapi.yaml` (011, MINOR de 009), `admin-delegate.schema.json`, `STATE-ADM11-001`, `error-catalog.json` (011), enmienda de la vista pública (`#31`/`D11-09`), esquema de avatar de usuario (`#78`), parámetro/constante de tope (`#74`). Ninguno se escribe antes de resolver su decisión: evitar contratos DRAFT sobre premisas no firmadas.

## Riesgos
1. **2FA (`D11-02`)** puede resultar no verificable en cuentas personales de Google: la investigación `T1505` debe concluir antes de comprometer promesas a Neo.
2. **Etiqueta IA en bytes (`D11-07` B/C)** altera huella y almacenamiento de la imagen (006): puede reabrir pruebas de 006/009.
3. **Foto de mascota en vista pública (`D11-09`)** abre superficie de privacidad en una ruta anónima: requiere `/rama` y `/trinity`.
4. **Reorganizar Hogares (`#64`)** toca pruebas E2E existentes de navegación: `/oracle` debe vigilar que no se relajen oráculos.
