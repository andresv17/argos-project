# Acta /oracle: validación en disco de ENM-005-E DRAFT 0.2.2 (feature 012, Bloque E, #81)

- Fecha: 2026-11-28. Auditor: /oracle (solo lectura sobre contratos y código; HEAD 3dffe50 más cambios sin commitear).
- Alcance: `share-link-subset-annex.md`, `share-links-pets.openapi.yaml`, `share-link-pets.schema.json`, `error-catalog.json`, `contracts/README.md`, `spec.md` (REQ-VET12-003/007, EDGE-012-070..077), `data-model.md`, `quickstart.md`, `claude/deuda-012-terraform-logs-qr.md`, `tasks.md` (T1693/T1695/T1696).
- **Veredicto: CUMPLE CON RESERVAS** (0 CRITICA, 0 ALTA, 0 MEDIA; 3 BAJA; 4 INFO). Ninguna reserva bloquea la re-auditoría ni la firma de Neo; son arreglos de texto.

## Gates (salida real)
| Gate | Resultado |
| --- | --- |
| `bash scripts/compile-contracts.sh --feature 012` | rc=0; validadores 257, errores 108, máquinas 2; `git diff --stat -- src/generated/api` vacío: OK |
| `bash scripts/verify-oracles.sh` | rc=0; 693 archivos, 0 oráculos débiles, CUMPLE |
| `npx tsc --noEmit` | rc=0 (sin salida) |
| `bash scripts/verify-traceability.sh --feature 012` | rc=0; 364 IDs vigentes; spec→tasks 317/317 mapeados; pureza 0 violaciones; CUMPLE |

## 1. Decisiones de Neo
| Decisión | Estado | Evidencia |
| --- | --- | --- |
| MEDIA-6 = (a) MINOR (share-link 1.3.0, OpenAPI 3.6.0) | Aplicada, sin contradicción | annex front-matter `change_type: MINOR`, §1 fila `SummaryScope` (a)-(d) y (c) exige `change_note` con el cambio de semántica de `activeCount`; §10.2; OpenAPI y esquema `change_type: MINOR`; `activeCount` del esquema declara el cambio de semántica |
| R2-04 = (B) borrar fila de la mascota que sale, sin retención 30 d para esa fila | Aplicada | annex §2 (último párrafo), §5.1 fila 1, §9 (t), §10.2; data-model.md:138; OpenAPI `withdrawPetFromShareLink` («La desasignación... borra su fila en el acto»). Las filas de las demás mascotas sí se conservan 30 d (coherente en todos) |
| R2-03 = (a) BAJA documentada | Aplicada | annex §5.5 («BAJA documentada y aceptada por Neo»), §10.2; esquema `activeCount` (alcance documentado) |
| Precondición bloqueante de la Fase 1 (filtro de logs) | Aplicada en las 4 piezas | annex §8.6.1 (previa a la Fase 1, no a la bandera), quickstart «Despliegue en dos fases» paso 1, deuda (Ampliación 2026-11-28), OpenAPI descripción general («Precondicion bloqueante de la Fase 1») y descripción de la vista previa |
| EDGE-012-077 documentado sin canal | Aplicada | spec.md:423, annex §5.1 (aviso solo al actor) y §10.9; esquema/OpenAPI lo trazan; tasks.md T1696 lo cita |

## 2. Correcciones de texto r3
Todas cerradas y consistentes entre annex, OpenAPI, esquema y catálogo:
- Recortes KISS: sin `uniqueItems` en entrada (esquema `PetIdList`, annex §3.3), orden sin posición, sin motivo persistido. OK.
- UUID en minúsculas con `422 ERR-SCHEMA-VALIDATION-FAILED`, sin normalización: annex §3.3, esquema (`Uuid` de 001 con patrón `[0-9a-f]`, verificado en `specs/002-plataforma-v21/contracts/schemas/common.schema.json:22`), OpenAPI, catálogo y spec.md:125. OK. En todo el árbol 012 no quedan menciones activas de «normalizados»/«deduplicar» (solo negaciones).
- Bandera OFF fail-closed, parseo exacto `true`, lectura al arrancar: annex §8.2.2, §9 (s), OpenAPI descripción general, quickstart paso 2. Coherente. Aún no hay código (`grep ARGOS_SHARE_PETS` en `src/` y `.env.example` vacío): es trabajo futuro de T1695, no defecto del contrato.
- Posición en el orden de errores: annex §3.4 (tras sesión/CSRF, antes de `Idempotency-Key`) idéntico a `x-sdd-error-order` de OpenAPI para crear y para la vista previa (antes del `422` por `petIds` ausente).
- `?petIds=` vacío: annex §4.7, OpenAPI (`oneOf` Uuid | maxLength 0), esquema `PetIdList` y catálogo: vacío = `ERR-VET12-PETS-EMPTY`, ausente = `ERR-SCHEMA-VALIDATION-FAILED`. Coherente.
- `activeCount` en `ListShareLinksUseCase`: annex §5.5, §8.5 y §10.10. OK.
- EDGE-012-076 cota de dominio: annex §4.9 y spec.md:422 coinciden con el código real: `signedUrlTtlSeconds` = `min(PUBLIC_SIGNED_URL_MAX_SECONDS = 300, restante)` en `src/domain/sharing/share-link.ts:67-70`.
- B-01..B-03 y M-02a (tabla de autoridad §5.2): presentes; ver coherencia en §3.

## 3. Coherencia cruzada
- Revocación: el owner/ADMIN del hogar que no es titular ni creador **no revoca** (`404 ERR-SHARE-NOT-FOUND`): annex §5.2 (tabla), OpenAPI descripción general («el propietario u ADMIN del hogar no titular recibe 404») y §10.5; consistente con `D5-19`. spec.md REQ-VET12-007 **no lo contradice pero tampoco lo dice** (ver BAJA-2).
- Orden de errores crear/vista previa: annex = OpenAPI. Códigos de respuesta OpenAPI (`401/403/404/409/422/429/500` en crear) todos reutilizan el catálogo; `ERR-VET12-PETS-EMPTY` único nuevo (annex §7 = catálogo = OpenAPI).
- `PetsShareLinkView` sin `householdId` y `petIds` filtrados: annex §5.3/§5.5 = esquema = OpenAPI.
- tasks.md: T1693 cita EDGE-012-070..075, T1695 cita 076, T1696 cita 077 (3 coincidencias ya presentes); la compuerta de trazabilidad lo confirma (rc=0).
- No encontré contradicciones concretas entre annex, OpenAPI, esquema, catálogo y spec.

## Hallazgos
### BAJA
- **BAJA-1** Residuos de versión: annex §10.2 dice «sigue pendiente (`DRAFT` 0.2.1)» (debe ser 0.2.2); `error-catalog.json` nota de `ERR-VET12-PETS-EMPTY` cita «share-links-pets.openapi.yaml 0.2.1» (debe ser 0.2.2). Texto, sin efecto funcional. A `/architect`.
- **BAJA-2** `spec.md` REQ-VET12-007 (y T1701) dice «cualquier co-propietario `ACTIVE` ... puede revocarlo» sin recoger la regla de §5.2 (el creador siempre; el owner/ADMIN no titular recibe `404`). La regla solo está normativa en el annex/OpenAPI; un implementador que lea solo spec/tasks podría permitir al ADMIN no titular revocar. Añadir una frase a REQ-VET12-007 o citar «annex §5.2» en T1701 (esto último lo hace `/morpheus`).
- **BAJA-3** data-model.md fila de retención de `share_link_pets` («Igual que `share_links`») no refleja `R2-04 = (B)` (la fila de la mascota que sale se borra en el acto); el matiz sí está en data-model.md:138. Alinear la fila de la matriz.

### INFO
- **INFO-1** quickstart «Criterio de release bloqueante» (línea 94) describe `DEUDA-012-TERRAFORM-LOGS-QR` solo con `/e/` y `/api/emergency/`; la ruta `/clinical-summary/pets` solo consta en el runbook de dos fases y en la deuda (Ampliación). Sin contradicción, mejora de visibilidad.
- **INFO-2** `contracts/README.md` resume solo `E-1..E-5` y no las decisiones de la r3 (MEDIA-6, R2-04, R2-03, filtro de logs); el detalle vive en el annex.
- **INFO-3** `createPetsShareLink` declara `429` en OpenAPI pero annex §3 no define su limitador (hereda de 005); y el orden del `429` de la vista previa solo consta en OpenAPI (`403 → 429 → 422`), no en annex §4.7. Fijarlo en T1693.
- **INFO-4** La bandera `ARGOS_SHARE_PETS_CREATE_ENABLED` no existe aún en `app-config.ts` ni `.env.example`; es esperado (T1695), pero T1693 debe incluir su prueba roja (§9 (s)).

## Estado de aprobación
El anexo y los contratos siguen `DRAFT`. La firma de `ENM-005-E` es exclusiva de Neo (Nivel 2). Ningún cambio de código ni de contratos por parte de `/oracle`.
