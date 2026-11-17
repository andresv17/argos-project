# Veredicto Oracle T269 con D-1 — 2026-11-13 (base HEAD 14a9b3d, cambios sin commit)
Veredicto: APTO (H-1 baja aceptada por Neo en D-4, diferida)
## Medido en disco
- git: cambios en src/ y tests/ = 8 archivos, todos de T268, T269 o D-1 (sanitary-alert-evaluator.ts, app-config.ts, pets-records.api, server.api, audit-pseudonym, app-config.spec, pet-and-alerts, app-config-audit-secret nuevo). Ninguno ajeno.
- D-1: app-config.ts `invalidSecret = null ? NODE_ENV !== 'test' : !patrón`. Sin variable y NODE_ENV distinto de test (development, production, ausente) lanza AppConfigError con variables ['ARGOS_AUDIT_HMAC_SECRET']; mensaje exacto "Configuración inválida: ARGOS_AUDIT_HMAC_SECRET. Revisa .env.example." sin valor. Probado con valor inválido: no se copia. Con NODE_ENV=test carga con null.
- Ajustes de pruebas: server.api.spec solo añade NODE_ENV:'test' al env; app-config.spec solo antepone NODE_ENV:'test' (sin tocar aserciones); audit-pseudonym.spec reescribe la prueba de "sin secreto": ahora afirma error en development y sin NODE_ENV (más estricta que antes) y conserva sin error en test y rechazo de inválido. No se debilita ninguna aserción.
- traza T268 CUMPLE 3/3; T269 CUMPLE 1/1; pureza 0 violaciones; oráculos CUMPLE 93 archivos, 0 débiles; tsc 0 errores.
- 4 archivos dirigidos: 31/31 en verde.
- Suite completa: 94 fallos de 1502 (15 archivos), igual que lo esperado; ninguno en archivos de D-1 ni T269 (backup, presentación, contratos, seguridad, scrypt preexistentes). 0 nuevos.
## Hallazgos
- H-1 (baja): ARGOS_AUDIT_RETENTION_DAYS sin uso. D-4 de Neo: diferida, aceptada.
- H-T269-D1-I1 (informativo): scripts/despliegues que arranquen sin NODE_ENV=test necesitan ya la variable; .env.example debería documentarla como obligatoria (verificar en commit).
