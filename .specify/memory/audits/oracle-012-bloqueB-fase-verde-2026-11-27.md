# Acta /oracle — Bloque B fase VERDE (012), rango 206e80b..49243e7 — 2026-11-27

Veredicto: CUMPLE CON RESERVAS.

## Compuertas
- npx tsc --noEmit: rc=0
- verify-traceability.sh --feature 012: rc=0 (CUMPLE, pureza 0 violaciones)
- verify-oracles.sh: rc=0 (649 archivos, 0 oraculos debiles)
- compile-contracts.sh (sin --feature): rc=0; git status src/generated vacio => sin deriva en v31..v37 ni otros features.
- vitest (PG17 efimero puerto 55499, removido): chip-*-012, co-ownership-parity-012, t1633-t1648, media-004, unit/media*, integration/media: 413 pass, 4 fail (todas aceptadas).

## Verificaciones
(a) Ningun commit del rango toca app-config, server.ts, app.ts, origin-verify*, deploy-argos.yml, terraform/**, .env.example, specs/005/tasks.md, logos.*.
(b) codegen.mjs (2ae1303): (1) alias de $defs solo se emite cuando el tipo NO fue declarado (antes era fail), por lo que no altera contratos que ya compilaban; (2) './' solo a refs "x.schema.json#" sin prefijo (las demas ya llevaban './'). Sin deriva en src/generated.
(c) media-keys.ts: OBJECT_KEY solo anade rama exacta claims/<uuidv4>/<uuidv4>; DOWNLOAD_FILENAME anade argos-evidencia.(pdf|png|jpg|webp) con anclas; LIST_PREFIXES anade claims/ acotado. RECONCILED_PREFIXES intacto (claims/ fuera de la conciliacion diaria, con rutina propia). No debilita guardas 004. tests/ en el rango: solo +chip-evidence-arbitration-012.spec.ts (nuevo), concurrent-engines.ts (anade media al arnes), postgres-repositories-part3 29->31 claves (listado como necesario). Ningun assert existente relajado.
(d) Puertos nuevos en application/ports, casos de uso en application/use-cases, adaptadores en infrastructure (persistence memory/sqlite/postgres, deterministic-malware-scanner), sanitizador en domain/media. Ningun archivo de src/infrastructure/http cambiado en el rango (sin logica en controladores). Pureza 0.
(e) chip-claim-012.spec.ts (T1634) y demas specs de T1634 sin cambios en el rango.

## Rojas (suite completa unit+integration+security: 35 fallos, 17 archivos)
Aceptadas por causa del commit/decision Neo:
1. SC-012-017 x3 (memoria/SQLite/PG) en chip-claim-012: el aserto espera {role:'CO_OWNER'} y OwnershipState no tiene `role` (devuelve coOwners[]); aserto fuera de contrato.
2. media-004 T591 V6 (1) y el resto de pinados a ERR-PET-MICROCHIP-DUPLICATE cross-owner: ahora ERR-CHP12-MICROCHIP-REGISTERED por el split de error (T1635): t552-microchip-global x3 (x3 motores), use-cases.spec, backup-use-cases.spec, t556-limite-duplicados.api x7, pets-records.api. Son ~17-20 casos.
Ajenas al rango (causa: arbol de trabajo sucio con cambios H-01 sin commit):
3. terraform-iam/iam-secrets/labels/secret-manager, deploy-argos-workflow, t951 (GEMINI), server-composition-sqlite, postgres-vacuum-sentinel, verify-ci-ready: pasan en worktree limpio de 49243e7 (273/275); fallan solo en el arbol sucio (terraform/*, deploy-argos.yml, app.ts, archivos sin seguimiento).
4. t1517 (2): fallan igual en 206e80b (preexistente: espera migracion 0030/0026, hoy 0032/0028).

## Reservas
R1. Las ~17-20 rojas de DUPLICATE cross-owner y SC-012-017 siguen rojas: hay que reconciliarlas (Nivel 2 / architect: reapuntar asertos 004 al split, o corregir aserto role) antes de cerrar bloque B; no relajar sin decision de Neo.
R2. t1517 preexistente (conteo de migraciones) pendiente de dueno.
R3. Las rojas de terraform/deploy/etc. se resolveran al commitear H-01; verificar en limpio despues.
R4. Comentario duplicado de DOWNLOAD_FILENAME (dos JSDoc consecutivos) en media-storage-guards.ts: cosmetico.
