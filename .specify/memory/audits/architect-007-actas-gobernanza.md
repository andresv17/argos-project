# Notas de cierre de gobernanza 007 (T1011, T1012, T1030) y contrato includeDeceasedAt (T1026)

- Autor: /architect, 2026-11-19, rama 007-ux-ficha-mascota-fallecimiento (base f070ba2). Estado: REVIEW. Sin commit, sin [x], sin APPROVED/LOCKED. La firma es de Neo.

## Contrato (Caso B de T1026, SC-007-016)
- Revisado antes de editar: `CreateShareLinkInput` y `ShareLinkView` (share-link.schema.json 1.0.0), query de las dos vistas previas (share-links.openapi.yaml 3.3.0), `disclosure` de `clinical-summary.schema.json` 1.1.0, regla `immutableOptions` de share-link.machine.json.
- Cambios (todos opcionales, `additionalProperties: false` conservado): share-link.schema 1.0.0 a 1.1.0 MINOR (+`includeDeceasedAt` default false en la entrada y opcional en la vista); share-links.openapi 3.3.0 a 3.4.0 MINOR (query `includeDeceasedAt` en dos vistas previas); clinical-summary sigue 1.1.0 (DRAFT sin publicar; +`disclosure.deceasedAtIncluded` opcional, plegado sin nuevo bump); state machine: solo texto de `immutableOptions`.
- Justificacion del bump: campos nuevos opcionales y no requeridos = compatibilidad hacia atras (MINOR); `required` de `ShareLinkView` intacto para no romper consumidores 1.0.0.
- Compilacion: `compile-contracts.sh --feature 005` rc 0 (v33 regenerado, guarda `git diff src/generated/api` vacia OK); `--feature 006` rc 0 (v34 sin diferencias, 006 no consume share-link).

## T1011 (merovingian)
- Evidencia en disco (repo principal): `.specify/memory/audits/merovingian-007-impacto.md` (16287 B, 2026-11-19) emitida; condiciones C1..C6 asentadas.
- Pendiente para cerrar: revalidar el grafo tras la enmienda 002 y la nueva MINOR de 005. Evidencia objetiva de esta pasada: 004 (v31) y 006 (v34) no cambian con la enmienda de 005; v33 cambia solo por los campos opcionales listados. Falta que /merovingian emita la revalidacion y que Neo firme. Tarea se mantiene [ ].

## T1012 (rama)
- Evidencia: `.specify/memory/audits/rama-007-privacidad.md` (10447 B, 2026-11-19) y entrada en claude/log-rama.md. Pendiente de revalidar con /rama: C1 con la implementacion contractual de includeDeceasedAt (desmarcado por defecto, inmutable, ausente en el JSON si false) y la verificacion de la enmienda MINOR de ClinicalProfile/005 (ahora aplicada en REVIEW). Tarea se mantiene [ ]; firma de Neo.

## T1030 (lock + rama)
- No cerrable: depende de T1029 (implementacion del Bloque C sin hacer). Evidencia previa: `.specify/memory/audits/lock-007-edge.md` (20465 B) sobre la especificacion, no sobre codigo. Se mantiene [ ] con nota.
