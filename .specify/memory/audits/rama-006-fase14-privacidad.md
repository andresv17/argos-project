# Acta Rama - Feature 006, Fase 14 (T955 parte privacidad) - 2026-11-19

Rama 006-escena-hogar-pixel-art. Alcance: aviso final de Vertex (`src/domain/scene/notice.ts`, `src/presentation/web/scene-notice.ts`, `SCENE_NOTICE_VERSION = '2'`). Sin edición de specs, src ni tests; sin commit, sin push, sin `[x]`. `.env` no leído.

## Verificaciones en disco
- Sin «BORRADOR» ni «usa solo imágenes de prueba» en `src/` (grep vacío). El único rastro es `specs/006-escena-hogar-pixel-art/aviso-consentimiento-borrador.md` (documento de spec, no UI; ver C5).
- `tests/unit/presentation/t949-aviso-final-escena-006.spec.ts`: 19/19 verdes (vitest, ejecución local).
- Región: el texto declara `us-central1` (Iowa) y transferencia internacional. La región real es parametrizable (`platform_parameters`, D6-23 (c)); el texto no la lee de config.
- Reenvío en cada regeneración: declarado en §1 de ambos avisos (Vertex y gemini-api). Coherente con REQ-ESC6-026 y DEUDA-006-AVISO-REGENERACION.
- Datos enviados: `src/domain/scene/inputs-snapshot.ts` solo incluye `id`, `species`, `speciesOther`, `breed`, `breedCode`, `sex` y avatar. No hay nombre, microchip, fecha de nacimiento ni datos clínicos: §1 es correcto en esas exclusiones.
- `speciesOther` (texto libre) viaja, saneado por lista blanca (INV-ESC6-011, `build-image-prompt.ts`). El aviso solo menciona «especie» (ver O2).
- Cuota global (`src/infrastructure/persistence/scene-global-quota.ts`): una fila mensual `scene.global_quota_used.YYYY-MM` en `platform_parameters`, sin identificador de usuario ni de hogar; errores sin eco del mensaje (falla cerrado). Sin datos personales. Cumple lo pedido.
- PITR 6 h: fuente en `claude/log-architect.md` (003, D-22 / R-14). Dumps 14 d: `terraform/buckets.tf` y `REQ-PG-011`. Ventana residual `RR-06-07` documentada en `terraform/README.md:248`.
- Fuentes de entrenamiento y DPA: solo registradas por Neo (`research.md` §2.3-bis, 2026-11-19). Los agentes no las han verificado en red.

## Evaluación por punto
1. Región us-central1 con transferencia internacional: declarada (§3). Se marca pendiente que el modelo procese solo en esa región. OK con observación.
2. Reenvío de foto del hogar y fotos vigentes en cada regeneración: declarado (§1). OK.
3. No entrenamiento con datos del cliente según DPA y Service Specific Terms: declarado (§4) como condición de Google Cloud. Fuente registrada por Neo, no verificada por agentes. OBS hasta que Neo confirme la URL en la firma.
4. Retención y borrado: «pendientes de confirmar» (D6-23 (d)). El mínimo de REQ-ESC6-028 («sin retención de entradas más allá del procesamiento») NO queda afirmado ni sourced. Es condición de T885, no bloquea el texto.
5. Cuota global y contador: sin datos personales. OK.
6. «BORRADOR» y «usa solo imágenes de prueba»: ausentes en el texto. OK.

## Dictamen: PASS CON OBS

### Condiciones numeradas
- C1 (Neo, antes de firmar T958): confirmar que las URL de DPA y Service Specific Terms citadas en `research.md` §2.3-bis son las vigentes y que el «no entrenamiento» es la cláusula real. Hoy no hay verificación en red.
- C2 (Neo, al firmar): aceptar que el elemento 4 del aviso («cuánto retiene el proveedor») sigue sin cifra, pendiente de confirmar, según D6-23 (d). No se declara como cumplido.
- C3 (`/keymaker`, antes de T955 cierre): añadir al test T949 la comprobación de que `us-central1` del texto coincide con el valor por defecto de `platform_parameters`, o documentar que cambiar la región exige subir `SCENE_NOTICE_VERSION`.
- C4 (`/architect`): mientras el texto diga «pendiente de confirmar», no activar `ARGOS_SCENE_DRIVER=real` en producción (T885 sigue bloqueada; REQ-ESC6-028 mínimo sin fuente).
- C5 (`/architect`, menor): archivar o renombrar `aviso-consentimiento-borrador.md` para que no contenga el rótulo BORRADOR en la spec.

### Observaciones
- O1: PITR 6 h y dumps 14 d se declaran como hechos en el aviso; sus fuentes son internas (003 y `terraform/buckets.tf`). Correcto.
- O2: §1 menciona «especie», pero también viaja `speciesOther` (texto libre saneado). Conviene decir «la especie (incluida la especie escrita por ti si elegiste «otra»)» en una próxima versión. No bloquea.
- O3: el texto se publicaría con `noticeVersion '2'`. Cualquier cambio posterior de región o de proveedor exige nueva versión (ya contemplado en EDGE-ESC6-018).

## Firma (T958): es decisión de Neo
La firma del texto final del aviso es de Neo (Nivel 2, `TO: Neo (Andrés Vallejo — Level 2)`). Rama no firma ni decide. Rama no marca `[x]`. T955 queda para `/oracle` y `/trinity`/`/merovingian` según su alcance.
