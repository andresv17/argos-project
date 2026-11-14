# Veredicto Oracle: enmiendas H-A-2, H-B-1 e I de la Rebanada 5 (2026-11-13)

VEREDICTO: H-A-2 APTO | H-B-1 APTO | I APTO CONDICIONADO (H-E-1, H-E-2; no bloquean). D1: ACEPTAR. D2: ACEPTAR.

## Mediciones (base HEAD 37772a2, solo lectura)
- git status: cambios solo en los archivos listados y en los de T276-T279 ya en disco. `git status --short -- src/generated` vacío. No se ejecutó test:gate ni compile-contracts. logos.* sin tocar.
- tsc --noEmit: 0 errores. verify-oracles: CUMPLE (103 archivos, 0 débiles). verify-traceability --feature 002 T271..T279: CUMPLE las 9.
- 3 archivos de las enmiendas: 66/66 verdes (hostile-input 38, envelope-migration 26, backup-client 2).
- Suite de respaldo (api/backup-*, exploits/backup-*, persistence/backup-*, unit/backup-*): 11 archivos, 265/265 verdes. Confirmado.
- tests/unit/presentation: 55 pruebas, 11 fallos. En el worktree 37772a2 (eliminado y podado): 11 fallos idénticos. Clasificación: los 11 son HEREDADOS, 0 nuevos.
  - components.spec.ts: 8 (tarjetas listbox, tarjeta especie/nombre, insignia ajena, ficha ajena, ficha propia 6 pestañas, pestaña peso, pestaña vacunas, OWNER ve miembros).
  - validation.spec.ts: 1 (ERR-REC-WEIGHT-OUT-OF-RANGE).
  - view-model.spec.ts: 2 (tabla de peso con variación; OWNER cancela invitaciones).
  - Coinciden con las heredadas ya listadas en el veredicto de fase verde (components 8, validation 1, view-model 2); ninguna toca respaldo. Fuera de alcance R5 (decisión J de Neo).

## H-A-2 (ID ajeno) APTO
Prueba backup-hostile-input-red.spec.ts:124-160: preview 200 (pet y registro ajenos) con `collisions` idéntico a la vista previa del archivo limpio (baseline medido en la propia prueba); import 409 ERR-BACKUP-REFERENTIAL-INTEGRITY, ROLLED_BACK, un solo detail, sin LUNA_ID/MARIA_ID/ID de registro/"Luna" en las 4 respuestas, base intacta (dump igual). Oráculo fuerte (toEqual con valores exactos). Cumple spec REQ-BACKUP2-002 y STATE-BACKUP-001 (PREVIEW_READY no escribe).

## H-B-1 (900 kg en 2.0.0) APTO
Fila esperada ahora 422 ERR-BACKUP-SCHEMA-INVALID (max 150 del esquema 2.0.0); verde. Coherente con la máquina (SCHEMA_INVALID).

## I (BackupPage) APTO CONDICIONADO
Sin GET /backup/export. requestBackupExport: POST con X-Argos-Request y token de X-Argos-Confirmation-Token. importBackupFile: X-Argos-Import-Confirm = SHA-256 hex minúscula de los bytes. backup-client.spec.ts (2 pruebas) contra API real: método, cabecera CSRF, digest igual a sha256HexOfBytes; verde, oráculos fuertes.
- H-E-1 (menor): la SPA calcula el digest del propio archivo y lo envía sin pasar por la vista previa ni mostrar conteos/colisiones; la "confirmación explícita" de REQ-BACKUP2-002 queda satisfecha a nivel de protocolo pero no de UX. Cubrir en T292 (UI) o deuda.
- H-E-2 (menor): requestBackupExport devuelve `token` pero BackupPage no lo usa ni lo muestra; la prueba solo verifica que existe y que NO está en el cuerpo del archivo. Aceptable hasta T292.

## D1 (colisiones 5/5 en vista previa con ID ajeno): ACEPTAR
- Verificado en disco: la prueba compara `collisions` de la vista previa con ID ajeno contra la del archivo limpio, para mascota ajena y para registro ajeno: iguales. Por tanto el ajeno no se enumera ni suma; las 5/5 son las mascotas propias de Andrés (petsReplacedCount/sameIdPetsCount) que el propio archivo limpio ya colisiona. Y no hay fuga de IDs (aserción leaks vacía en preview e import).
- Cita: spec.md REQ-BACKUP2-002 "colisiones solo contra los datos propios"; STATE-BACKUP-001 PREVIEW_READY "colisiones solo contra datos propios". El 0/0 de Lucía (backup-import-preview.api.spec.ts:62) sigue verde porque Lucía no tiene mascotas propias. La intención aprobada ("sin colisión, sin enumerar IDs ajenos") se respeta en su sustancia (cero efecto del ajeno); 0/0 literal solo es posible si el usuario no tiene mascotas propias. No es cambio de criterio sino precisión de la expectativa; la prueba actual (relativa al baseline) es más robusta que fijar 0/0.

## D2 (digest con Web Crypto): ACEPTAR
- tests/unit/presentation/presentation-architecture.spec.ts:24 [INV-ARCH-004]: src/presentation/web solo importa de sí misma, src/generated y react*; verde en la corrida de presentación (no está entre los 11 fallos). Importar domain violaría la regla.
- backup-client.spec.ts compara el valor enviado y fileDigestOf con sha256HexOfBytes del dominio sobre los mismos bytes: idéntico (hex minúscula). Aceptable. Nota: crypto.subtle exige contexto seguro (https/localhost); correcto para 127.0.0.1 y para Fase 3 en https.

## Hallazgos
H-E-1, H-E-2 (menores, no bloquean). Ningún hallazgo nuevo de regresión.
Pendiente de Neo (no de agentes): marcar [x] T271-T279 y commits locales (decisión K). Los agentes no marcan COMPLETED.
