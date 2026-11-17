# Veredicto Oracle: Rebanada 5 [US7], frente rojo T271 a T275 (2026-11-13)

VEREDICTO: APTO CONDICIONADO (fase roja legítima; H-R5-1..H-R5-6 a cerrar en la fase verde; decisión de Neo pendiente sobre la prueba de 403)

## Mediciones en disco
- tsc --noEmit: 0 errores. verify-oracles.sh: CUMPLE (98 archivos, 0 débiles). verify-traceability --feature 002 T271, T272, T273, T274, T275: las 5 CUMPLE.
- git status --short -- src: vacío. HEAD sigue en 45649fc (sin commits nuevos). src/generated, logos.json y scripts/logos.py sin tocar por esta auditoría. No se ejecutó test:gate ni compile-contracts.
- vitest sobre los 6 archivos (153 pruebas): 7 grupos de razón, todas por funcionalidad ausente o por heredado 3.0.0/2.0.0; ninguna por sintaxis, tipos o importación.

| Archivo | Rojas | Verdes | Razón |
|---|---|---|---|
| access-control.security.spec.ts | 2 | 11 | POST /api/backup/export no declarado en contrato (ruta ausente) |
| backup-use-cases.spec.ts | 52 | 14 | 49 heredadas (2.0.0 vs 3.0.0, ERR-INTERNAL-UNEXPECTED en 5, VERSION-UNSUPPORTED en 7, aserciones de forma) + 3 de T271 |
| backup-import-preview.api.spec.ts | 12 | 0 | 11 por 404 export no declarado, 1 por 404 preview |
| backup-atomicity-red.spec.ts (T273) | 19 | 0 | 15 importación devuelve 200 sin fila IMPORT/ROLLED_BACK; SIGKILL: señal null (el disparador nunca actúa); resto de comportamiento |
| backup-hostile-input-red.spec.ts (T274) | 38 | 0 | 422/413/400/409 esperados, hoy 200 o código distinto |
| backup-envelope-migration-red.spec.ts (T275) | 26 | 0 | importación de 1.0.0/2.0.0 hoy 422 (migración ausente) |
Total nuevas rojas T273-T275: 83 (coincide con Keymaker). Conteos de Keymaker (52/14, 2, 12) confirmados.

## Punto 1: enmascaramiento (confirmado parcialmente)
- Las 3 rojas T271 de backup-use-cases son rojas reales, pero: (1) 403 por rol y (2) token caen por ERR-INTERNAL-UNEXPECTED: el arnés `createHarness()` por defecto produce datos que ExportBackupUseCase no valida como 3.0.0 (el mismo fallo de las 5 heredadas). Fallan antes de llegar a la aserción de fondo: ENMASCARAMIENTO CONFIRMADO en esas 2. (3) la de token de eliminación usa identityState, llega a la aserción y falla por token ausente (primer y segundo token vacíos): roja limpia.
- Las 49 heredadas son deuda de fixtures 2.0.0, no de T271; se resuelven al migrar el arnés en la fase verde.

## Punto 2: prueba de 403 (DECISIÓN DE NEO, no decidida aquí)
- `ExportBackupUseCase.execute(userId)` (src/application/use-cases/backup-use-cases.ts:133) NO recibe rol. La firma `execute(userId, { role })` NO existe; la prueba la inventa por cast `as unknown as`.
- rbac.ts:29 concede EXPORT_IMPORT_BACKUP a los 4 roles (OWNER, ADMIN, CAREGIVER, READER). Ningún rol real recibe 403; la prueba usa un rol inexistente 'SIN_ACCION_EXPORT'. No es alcanzable con roles reales y fija una firma de aplicación no pactada.
- Opciones para Neo: (a) retirar D-T271-2 segunda mitad (403 por rol) por inalcanzable y documentarlo; (b) conservar una prueba de la matriz can(rol,'EXPORT_IMPORT_BACKUP') sobre los 4 roles (pura, sin inventar firma) más 401 sin sesión por API; (c) enmendar spec/plan para definir dónde se aplica el rol. Recomendación: (b). Mientras no decida, la prueba de 403 no debe contarse como cobertura de D-T271-2.

## Punto 3: token
- Contrato: el token viaja en cabecera X-Argos-Confirmation-Token (openapi líneas 210-214). Las pruebas API (backup-export.api.spec.ts, ya commiteado) leen la cabecera: correcto. Las unitarias afirman un campo interno `confirmationToken` del resultado del caso de uso: no contradice el contrato (el adaptador lo mapea a cabecera) pero fija un nombre interno no pactado. H-R5-2 (menor): declararlo en plan/tasks o aceptarlo como decisión de diseño explícita de Keymaker.

## Punto 4: archivos de T273-T275
- tasks.md nombra backup-import-atomicity.spec.ts, backup-import-hardening.spec.ts, backup.property.spec.ts y backup-migration.spec.ts; Keymaker creó 3 archivos `*-red` en integration/api, security/exploits e integration/persistence. Los IDs de las 5 tareas están cubiertos (trazabilidad CUMPLE 5/5; hostile incluye propiedades con fast-check). Hallazgo H-R5-3 (no bloqueante): corregir rutas en tasks.md (como se hizo con T272) y renombrar sin sufijo `-red` en la fase verde; falta cobertura nominal de tests/unit para atomicidad y endurecimiento (solo integración/seguridad): aceptable si el verde las deja en esas rutas.
- Ya corregida la ruta de T272 en tasks.md (único cambio, 1 línea): coherente con H-T272-1.

## Punto 5: oráculos
- Barrido manual de los 3 archivos nuevos y los diffs: sin .skip, .only, .todo, toBeDefined, toBeTruthy ni toThrow; igualdades profundas sobre tuplas con valores concretos. Único try/finally: atomicidad líneas 140-176 (SIGKILL), solo limpia el directorio temporal con rmSync, no traga errores: ACEPTABLE (confirmado).
- Nota H-R5-4: en el SIGKILL la aserción `child.signal === 'SIGKILL'` evita el falso verde si el disparador nunca actúa; bien. Depende de process.cwd() y de --experimental-transform-types; fragilidad menor.

## Punto 6: contrato
- Pruebas coinciden con spec/contrato: digest Sha256Hex en minúscula (el caso en mayúsculas se rechaza 422 ERR-SCHEMA-VALIDATION-FAILED), digest ausente/ajeno/mal formado 422, fila IMPORT entity_type USER, entity_id = userId (ANDRES), executor_user_id = userId. Sin contradicciones. En confirm() se retiró contract:false (cierra H-T272-2); queda sujeto a validación de esquema en verde.

## Hallazgos
- H-R5-1: T271 incompleta como prueba de 403 (ver punto 2); decisión de Neo.
- H-R5-2: nombre interno `confirmationToken` no pactado (punto 3).
- H-R5-3: rutas de T273-T275 en tasks.md difieren de los archivos reales (punto 4).
- H-R5-4: las 2 pruebas T271 con ERR-INTERNAL-UNEXPECTED enmascaran su aserción; Keymaker debe ponerlas en verde con fixture 3.0.0 válida y evidencia.
- H-R5-5: 49 rojas heredadas en backup-use-cases (deuda de fixtures 2.0.0): la fase verde debe migrarlas, no borrarlas.
- H-R5-6: sin D-T271-3 (retirar excepción deleteRecord) ni 401 sin sesión en archivos de este frente: verificar en el export.api.spec ya commiteado o cubrir en verde.
- Heredados abiertos: H-T271-1 (parcial: unit añadido, 403 pendiente), H-T271-2, H-T271-3, H-T271-4.

## Siguiente paso
Morpheus: aceptar la fase roja y escalar a Neo la decisión del punto 2. No marcar [x]. Keymaker pasa a fase verde cerrando H-R5-2 a H-R5-6.
