# Acta /merovingian — T1504 (Feature 011): dependencias externas e impacto aguas abajo

**Fecha**: 2026-11-25 | **Rama**: `011-pulido-portal-hogares-admin` | **Autor**: `/merovingian` (subagente, modelo `haiku`) | **Solicitado por**: `/morpheus`
**Tipo**: solo lectura. Sin commit, sin push, sin `[x]`, sin instalación, sin edición de `spec.md`, `plan.md`, `tasks.md`, contratos ni código.
**Fuentes leídas**: `specs/011-pulido-portal-hogares-admin/{plan,spec,tasks}.md`, `claude/decisiones-neo-011-2026-11-25.md`, `package.json`, `.specify/memory/constitution.md` (Principio VI y Technology Stack), `specs/005-album-archivos-clinicos/contracts/**`, `src/domain/images/image-metadata-stripper.ts`, `src/presentation/web/avatar-crop.ts`, `src/presentation/web/components/AvatarCropper.tsx`, `src/presentation/web/photo-reexport.ts`, `src/domain/summary/clinical-summary.ts`, `tests/unit/summary/t770-t774-*.spec.ts`, `tests/unit/summary/t778-*.spec.ts`, `tests/security/t750-enlace-publico.security.spec.ts`.

## Veredicto

**PASS CON CAMBIOS.**

- **(a) Dependencias externas**: el plan no propone ninguna dependencia npm, pip ni servicio nuevo, y `package.json` está intacto respecto a lo autorizado. Las necesidades implícitas (copia de `picture` de Google, limpieza EXIF, recorte del avatar de usuario, miniatura de 96 px) se resuelven reutilizando código existente o `fetch` nativo. **Única excepción a vigilar**: la miniatura de 96 px (`#59`) tentaría a añadir un procesador de imagen en servidor (`sharp`, `jimp` o similar); eso sería una dependencia nueva y requiere autorización Nivel 2. Se recomienda no hacerlo.
- **(b) Impacto en contratos 005**: **hay un bloqueante de diseño para `D11-09`**. La resolución de Neo (avatar de la mascota en la vista pública del veterinario) contradice de forma explícita el contrato del resumen clínico de 005 y tres pruebas vigentes de 005 que lo fijan. Una enmienda que simplemente amplíe el contrato dejaría esas pruebas en rojo, y **relajarlas no está permitido** (Nivel 3 de la constitución: «eliminar o relajar pruebas»). `D11-06` = A no toca contratos 005, pero hay que cerrar una definición de «mascota elegible» y una fila obsoleta en el README de contratos 011.

## (a) Dependencias y servicios propuestos o implícitos

| Necesidad (bloque) | Fuente en plan/spec | Propuesta de librería/servicio | Evaluación | Veredicto |
| --- | --- | --- | --- | --- |
| Ninguna declarada | `plan.md` «Technical Context»: «Dependencias: ninguna nueva»; `spec.md` NFR-011-003; `tasks.md` línea 16 | ninguna | `package.json` sin diff respecto a la rama base; coincide con la regla de Neo de verificar por `git diff` en cada cierre | **OK** |
| Copia de `picture` de Google (`#78`, `D11-13` = D) | `spec.md` REQ-PRF11-001; `plan.md` fila `#78` | Descarga HTTP de `lh3.googleusercontent.com` | No requiere librería: `fetch` nativo de Node 22 (Principio VI lo admite). Patrón de referencia ya aprobado: `redirect: 'error'`, host y ruta constantes, sin reintento interno (Enmienda 009-C, e). **No usar `jose`** para esto: su autorización es solo para `google-oidc-verify.ts` (Enmiendas 003/008/009-A) | **OK, reutilizar patrón** |
| Limpieza EXIF de la copia de Google (`#78`) | `spec.md` REQ-PRF11-001; `plan.md` fila `#78`, `EDGE-011-007` | Librería de metadatos (p. ej. `exifr`, `piexifjs`, `sharp`) | **No necesaria**. Ya existe `stripImageMetadata` en `src/domain/images/image-metadata-stripper.ts` (lista blanca sin dependencia npm, sin recodificar, verifica CRC y cierre de segmentos; usado por `about-use-cases.ts` y por `scene-composition.ts`). Limitación: acepta solo `image/png`, `image/webp` e `image/jpeg`; cualquier otro tipo debe caer a iniciales (fail-closed, ya previsto en `EDGE-011-007`) | **OK, reutilizar**. Añadir en la tarea de pruebas rojas: caso «`picture` con tipo no admitido → iniciales» |
| Recorte y exportación del avatar de usuario (`#78`) | `spec.md` REQ-PRF11-001; `D11-13` | Librería de recorte o de canvas | **No necesaria**. `AvatarCropper.tsx` y `avatar-crop.ts` existen (`AVATAR_OUTPUT_SIZE = 512`, `AVATAR_JPEG_QUALITY = 0.85`, `exportAvatar` con `AvatarCanvasPort`). `exportAvatar` re-codifica en canvas y elimina EXIF en el cliente | **OK, reutilizar**. Nota: `AvatarCropper` hoy solo lo usa `PetsPage.tsx`; reutilizarlo desde `AccountPage.tsx` no cambia contratos |
| Miniatura de máx. 96 px de la foto del hogar (`#59`, `D11-10` = C) | `spec.md` REQ-HOG11-003; `plan.md` fila `#59` («si la miniatura... exige variante del endpoint, `/architect` lo documenta en `T1538`») | Redimensionado en servidor (`sharp`, `jimp`, `image-size` o similar) | **Riesgo de dependencia implícita**. No hay librería de procesado de imagen autorizada; la constitución la prohíbe sin Nivel 2. Alternativas sin dependencia: (1) redimensionado en cliente con `canvas`, mismo patrón que `photo-reexport.ts` y `exportAvatar`, que solo descarga el objeto al pulsar «Ver foto» (cumple «cero descarga en la carga inicial»); (2) escalar la imagen original en CSS (cumple la UX pero no ahorra ancho de banda) | **Recomendación**: opción 1. Si `/architect` pide una variante de servidor, **escalar a Neo como Nivel 2** antes de tocar `package.json` |
| Validación de firma y dimensiones de la imagen (`#78`, `#59`) | `plan.md`; `constitution` Principio VI | Librería de detección de tipo | **No necesaria**: `readImageDimensions` y `stripImageMetadata` ya validan firma y tamaño en `src/domain/images/` | **OK, reutilizar** |
| Etiqueta IA (`#72`) | `D11-07` = A | ninguna | Solo texto visible (`figcaption`/`aria-describedby`); sin transformación de bytes | **OK** |
| Prompt en memoria y `inputs_snapshot` (`#73`) | `D11-08` = A | ninguna | Sin dependencia; el riesgo es de persistencia, no de librería | **OK** |
| Álbum del hogar (`#62`) y miniaturas | `plan.md` fila `#62` (reutiliza `PhotoAlbum`) | ninguna | Reutiliza componente existente; sin tabla ni copia de objetos (ADR-011-04) | **OK** |
| Roles de plataforma (`#63`) | `plan.md` fila `#63`, ADR-011-01/02 | ninguna | Tipo cerrado y matriz en `domain/admin/`, sin I/O | **OK** |
| Tope de hogares (`#74`) | `D11-12` | ninguna | Constante en `app-config.ts` | **OK** |
| Enlaces de la vista pública (`#31`) | `D11-09` | ninguna nueva | Ver sección (b). No requiere librería, pero sí enmienda | **Ver (b)** |
| Pruebas nuevas | `tasks.md` NFR-011-004 | ninguna | Vitest, Playwright y `@axe-core/playwright` ya están en `package.json` | **OK** |

**Servicios externos**: la única llamada de red nueva es a `lh3.googleusercontent.com` (`#78`). No es un servicio de pago ni un proveedor nuevo. Debe **mockearse en CI** (la tarea `tasks.md` línea 16 ya prohíbe llamadas reales). Ninguna tarea prevista debe añadir tráfico a Google Vertex ni a `gemini-api`.

**Dependencias ya presentes con riesgo de uso indebido**: `jose` 6.2.17 está autorizada solo en `google-oidc-verify.ts`. Usarla para validar la imagen o la descarga de `picture` sería un uso no autorizado.

## (b) Cambios a contratos existentes con impacto aguas abajo

### b.1 `D11-09` = A (avatar de la mascota en la vista pública de 005): BLOQUEANTE DE DISEÑO

Hechos verificados en disco:

1. `specs/005-album-archivos-clinicos/contracts/schemas/clinical-summary.schema.json` declara en su `description` «sin avatar, sin identificadores de usuario» y, en el perfil de la mascota, «sin avatar [REQ-SUM-003]».
2. `specs/005-album-archivos-clinicos/contracts/openapi/share-links.openapi.yaml`, operación `getSharedFile` (línea ~327): «nunca PHOTO, nunca el avatar». Y `specs/005-album-archivos-clinicos/contracts/README.md` §2 nota 2: «Dos rutas públicas, no una».
3. `src/domain/summary/clinical-summary.ts` excluye avatar, correo, ids y claves de objeto.
4. El contrato de `ClinicalSummary` es la **entrada prevista de la Fase 5 de IA** (`REQ-SUM-006`). Su prueba `tests/unit/summary/t778-contrato-entrada-ia.spec.ts` prohíbe la clave `avatar` y `photo` con una expresión regular (línea 85).
5. Pruebas vigentes que fallarían con una enmienda que meta el avatar en el resumen o en la ruta pública:
   - `tests/unit/summary/t770-t774-resumen-clinico.spec.ts` (líneas 95-116): `SENTINEL-AVATAR` no debe aparecer; el texto serializado no debe contener `avatar` ni `photo`.
   - `tests/unit/summary/t778-contrato-entrada-ia.spec.ts` (línea 85).
   - `tests/security/t750-enlace-publico.security.spec.ts` (línea 104, `SC-005-016`, `INV-005-002`): el avatar nunca se sirve por la ruta pública.
6. Estado de 005: `DRAFT` (su propia cabecera), con decisiones `D5-*` y `PN-*` asentadas. Sus contratos 004 y 002 sí son `LOCKED`. Este es un punto a confirmar por `/mouse`.

**Cadena de causa y efecto**:
- Causa: `D11-09` = A pide el avatar en el encabezado de la sección de cada mascota en el informe público (`REQ-VET11-002`, `INV-VET11-001`).
- Efecto 1 (contrato del resumen): si el avatar entra en `ClinicalSummary` o en `SharedSummaryView`, cambia `summaryVersion` y el esquema cerrado, y se contradice `REQ-SUM-003` y `REQ-SUM-006`. Además, el avatar se convertiría en entrada de IA sin pasar por `/rama`.
- Efecto 2 (ruta pública): si el avatar se sirve por `getSharedFile` o por un `mediaId`, se viola `INV-005-002` y la prueba `t750`.
- Efecto 3 (pruebas): `t770`, `t778` y `t750` quedarían en rojo. **Relajarlas está prohibido** (Nivel 3 de la constitución). Cualquier cambio de esas pruebas exige autorización Nivel 2 por escrito.
- Efecto 4 (generado): `src/generated/v33/` contiene los tipos de la superficie de 005 (`SharedSummaryView`). Un cambio de contrato exige `bash scripts/compile-contracts.sh --feature 005` (o el que corresponda) y regenerar `src/generated/`, sin editarlo a mano.

**Ruta de diseño menos invasiva (recomendación para `/architect`, `/rama` y `/trinity`, no decidida aquí)**:
- Mantener `ClinicalSummary` y `SharedSummaryView` **sin avatar**. Así `REQ-SUM-003`, `REQ-SUM-006`, `t770`, `t778` y `INV-005-004` no se tocan.
- Servir el avatar mediante una **ruta pública nueva y dedicada** (p. ej. `GET /shared/{token}/pet-avatar`) con las mismas reglas que `getSharedSummary`: 404 uniforme, contador de fallos compartido, `no-store`, `noindex`, sin clave de objeto en la respuesta, TTL igual a `min(300 s, restante)`, auditoría fail-closed. Esto **sí** es una enmienda MINOR de 005 (y de la nota «dos rutas públicas» del README), pero no relaja ninguna prueba: `t750` sigue cumpliéndose para `getSharedFile`, y `t770`/`t778` siguen cumpliéndose para el resumen.
- Hay que añadir pruebas nuevas (no relajar las existentes) que fijen que la ruta de avatar solo sirve el avatar de la mascota del alcance y nunca `PHOTO` ni archivos clínicos.
- Esta ruta es una excepción al `INV-005-007` y a `REQ-HOG11-007` (esta última acota el bloque `#64`, no `#31`). Requiere la enmienda firmada que ya prevé `T1534`.

**Recomendación de orden**: `T1534` debe fijar primero la forma de la ruta y el texto de la enmienda; sin eso, `T1535` no puede empezar. Ningún `/keymaker` debe tocar `clinical-summary.ts` antes de esa enmienda.

### b.2 `D11-06` = A (compartir por hogar con todas las mascotas elegibles): sin cambio de contrato 005, con dos precisiones

- Verificado: `specs/005-album-archivos-clinicos/contracts/README.md` §2 define `POST /households/{householdId}/share-links` con conjunto = «mascotas asignadas ahora **y** propias del creador». Eso ya es el conjunto de «todas las mascotas elegibles» del 005. **No hay enmienda de `share-links.openapi.yaml`** y `T1507` puede cerrarse sin cambio.
- Precisión 1: `spec.md` y `D11-06` deben usar **la misma definición de «elegible»** que 005 («asignadas ahora y propias del creador»). Si `#64` lo lee como «todas las asignadas», el contrato 005 devolverá 403 por conjunto vacío o por un conjunto distinto. Recomiendo que `/architect` registre la definición literal en `T1507`.
- Precisión 2: la fila `Enmienda de enlaces de veterinario (005, MINOR) | D11-06 = B | T1507` de `specs/011-pulido-portal-hogares-admin/contracts/README.md` **está obsoleta** (la resolución es A). Hay que retirarla o marcarla «no aplica», para no abrir una enmienda que Neo ya descartó.

### b.3 Otros contratos y superficies (sin impacto en contratos 005)

- `admin.openapi.yaml` (011, MINOR sobre 009), `STATE-ADM11-001` y `error-catalog.json` (011): sin impacto en 005.
- Álbum del hogar (`#62`, `T1542`): ruta de solo lectura nueva en 011; no altera 005 ni la 004 (`media.schema.json`, `MediaPage` 24). Revisar que el filtro de `PHOTO` de mascotas asignadas no reutilice la ruta pública de 005.
- Tope de hogares (`#74`): sin impacto en contratos de 005 (`createHouseholdShareLink` no cambia). Aviso: el 409 de 005 (`ERR-SHARE-LINK-LIMIT`) es un tope distinto del de hogares y no debe confundirse con él en el catálogo 011.
- Perfil con avatar de usuario (`#78`): contrato nuevo en 011 (`T1553`). Necesita cuidado con `lh3`, pero no toca 005.

## Grafo de impacto resumido (requerido por T1504)

- **Raíz**: `D11-09` (avatar en vista pública) → `REQ-VET11-002` → `T1534` → `SharedSummary.tsx`/`SharedPage.tsx` (`T1535`).
  - Contrato 005: `clinical-summary.schema.json` → `src/domain/summary/clinical-summary.ts` → `src/generated/v33/**`.
  - Ruta 005: `share-links.openapi.yaml` (`getSharedFile`, `getSharedSummary`) → `src/infrastructure/http/routes/share-links.routes.ts`, `src/application/use-cases/shared-view-use-cases.ts`, `src/presentation/web/share-api.ts`.
  - Pruebas en riesgo: `t750`, `t770`, `t774`, `t778`, `tests/security/exploits/enlace-veterinario-005.security.spec.ts`.
- **`ShareLinks.tsx`** (parametrización `PET`/`HOUSEHOLD`, `T1508`): sin cambio de contrato; las pruebas de presentación `t767-t775-t777-enlace-ui.spec.ts` y `t1196-ayuda-rol-008.spec.ts` fijan la leyenda y el texto de ayuda. La leyenda «¿Qué quieres compartir?» se oculta según `D11-06`, así que esas pruebas deben actualizarse por archivo y con autorización de `/oracle`, no relajarse.
- **`HouseholdsPage.tsx` / `AppShell.tsx`** (`#64`): `tests/unit/presentation/t919-hogar-owner-sin-hogar.spec.ts`, `t1260-caja-deshabilitada-009.spec.ts`, `t1188-invitee-search-008.spec.ts` y las pruebas E2E de navegación dependen de la navegación actual. Riesgo ya señalado en `plan.md` (riesgo 4).
- **`admin-use-cases`** (`#63`): `src/application/use-cases/admin-use-cases.ts`, `admin-parameter-use-cases.ts` y `admin-registration-use-cases.ts`. La matriz de roles nueva afecta a todos los casos de uso de `/api/admin/*`. Sin relación con 005.

## Estado de compuertas y restricciones

- `package.json` y `package-lock.json`: sin cambio (verificado con `git diff --stat` y `git status --short`, vacíos en esta sesión).
- No se ejecutó `npm audit` ni `pip-audit`: la auditoría de vulnerabilidades queda para la tarea de dependencias de la compuerta final (`T1559`), y el plan no añade paquetes que auditar.
- No se marcó ninguna tarea `[x]`. `T1501` sigue `[ ]` hasta que Neo firme.

## Hallazgos para el registro

- **MER-11-01 (ALTO, bloqueante de diseño)**: `D11-09` = A contradice `REQ-SUM-003`, `REQ-SUM-006`, `INV-005-002`, `INV-005-007` y las pruebas `t750`, `t770`, `t778`. Requiere enmienda MINOR firmada por Neo (Nivel 2) con la ruta dedicada de avatar, sin tocar el resumen. No se debe relajar ninguna prueba (Nivel 3).
- **MER-11-02 (MEDIO)**: la miniatura de 96 px de `#59` puede arrastrar una librería de imagen. Recomendado: redimensionado en canvas en cliente. Cualquier dependencia nueva exige Nivel 2.
- **MER-11-03 (MEDIO)**: `T1507` y la fila de `contracts/README.md` (`D11-06 = B`) están desalineados con `D11-06 = A`. Definir «elegible» con la misma regla de 005.
- **MER-11-04 (BAJO)**: `stripImageMetadata` solo admite PNG, WebP y JPEG; `picture` de Google en otro formato debe caer a iniciales.
- **MER-11-05 (BAJO)**: la descarga de `lh3.googleusercontent.com` debe mockearse en CI; cualquier prueba que la llame en red es una infracción de `tasks.md` línea 16.

## Registro

- Bitácora: `claude/log-merovingian.md` (entrada T1504).
- Bus: `claude/registro-proceso-argos.md` (una línea).
- Sin commit, sin push.
