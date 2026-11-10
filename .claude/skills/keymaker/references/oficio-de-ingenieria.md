# Oficio de Ingeniería — Estándar Staff Engineer para Keymaker

> Guía táctica de implementación en `src/` y `tests/`. Complementa las reglas SDD sin repetir el papeleo.

## 1. Concurrencia, Transacciones y SQLite (`SqliteUnitOfWork`)
- **Jamás retengas un bloqueo transaccional durante trabajo lento:** `SqliteUnitOfWork` serializa operaciones con `BEGIN IMMEDIATE`. Nunca ejecutes derivación de claves (`scrypt` / `PasswordHasherPort.hash` o `verify`), compresión ni E/S externa dentro de `runInTransaction` si puede calcularse antes o fuera de la ventana de escritura.
- **Sin consultas $N+1$:** Al construir vistas de resumen (`ListMyPets`, `GetHouseholdPets`), evita disparar `6 * N` sentencias SQL en bucle + validaciones Ajv completas por cada registro histórico pasado; usa métodos agregados o por lotes detrás de los puertos del repositorio.
- **Cero almacenamiento infinito (Storage Leak):** Toda entidad efímera (`sessions`, `login_attempts`, tokens de borrado) debe contemplar limpieza de registros caducados o revocados, no solo acumulación perpetua.

## 2. Fronteras Defensivas y Criptografía
- **Límites duros en adaptadores criptográficos:** En `ScryptPasswordHasherAdapter.verify`, valida explícitamente cotas máximas ($N \le 65536$, $r \le 16$, $p = 1$, $N$ potencia de 2) y fija `maxmem` en una constante segura (ej. 32 MB) **antes** de invocar `node:crypto.scrypt`. Nunca calcules `maxmem` multiplicando parámetros no acotados que vengan del string almacenado (vector crítico de DoS / hang en worker threads).
- **Frontera HTTP (`src/infrastructure/http/`):** Aplica el orden estricto de precedencia de la especificación (CSRF → Sesión → Recurso 404/403 → Normalización → Esquema → Dominio). Jamás captures errores devolviendo 200 falso ni filtres stack traces en `ProblemDetails`.

## 3. Presentación React Pura (`src/presentation/web/`)
- **Cero ocultamiento de fallos críticos:** En `logout()`, si el servidor no respondió o falló el cierre, no finjas un cierre exitoso en silencio dejando la cookie viva; informa claramente o limpia con diagnóstico transparente.
- **Distinguir fallos de red/proxy de fallos de negocio:** En `api.ts` (`toProblem`), una respuesta HTTP ajena al contrato (ej. proxy caído `502` o servicio distinto en el puerto) no debe presentarse con `"No se realizaron cambios parciales"` si la petición ni siquiera alcanzó a Argos.
- **Formularios de edición fieles al contrato:** Al editar (`PATCH`), distingue claramente entre *"campo sin tocar"* y *"usuario borró un campo opcional"* (ej. enviar `null` al vaciar `avatarUrl` si el contrato lo admite) y asegura `key` estables en React (`key={edit-${id}}`) más objetos estables (`useMemo`) en Context Providers como `AppShell`.
- **Cero lógica de negocio en UI:** Edad, deltas, alertas, permisos RBAC y `colorToken` llegan siempre de la API o de vistas puras derivadas de `src/generated/`.
