# Auditoría Forense de Riesgos — Playbook de The Oracle

> Un veredicto `APTO` no significa solo "las pruebas verdes que escribió el autor pasaron"; significa que los invariantes reales de negocio, concurrencia y seguridad resisten en disco.

## 1. Lista de Control Forense Antes de Emitir `APTO`
1. **¿Se escondió trabajo CPU-pesado dentro de bloqueos de persistencia?** Verificar que `hash`, `verify` o parseos grandes no bloqueen transacciones exclusivas de base de datos (`SqliteUnitOfWork`).
2. **¿Existen límites superiores contra DoS de recursos?** Revisar cotas en parámetros criptográficos (`scrypt` $N, r, p$ y `maxmem`), tamaños de payload en bytes UTF-8 y consultas $N+1$ no acotadas.
3. **¿Hay crecimiento infinito sin limpieza (Storage Leaks)?** Confirmar ciclo de vida de sesiones expiradas/revocadas, registros de intentos fallidos y tokens temporales.
4. **¿Se silencian errores reales en la frontera cliente?** Revisar `api.ts`, `session.tsx` y `use-contract-form.ts` para garantizar que un fallo de red o proxy nunca finja éxito (ej. en `logout()`) ni muestre mensajes engañosos.
5. **¿Evidencia literal y reproducibilidad en checkout limpio?** Comparar `git diff --stat`, hashes y salidas reales de compuertas sin confiar en reportes resumidos de terceros; si una prueba falla por timeout o flakiness, marcar `RECHAZADO` o hallazgo bloqueante `H-*` sin minimizarlo como "preexistente".
