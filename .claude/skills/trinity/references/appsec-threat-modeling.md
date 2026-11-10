# Playbook de AppSec y Threat Modeling — Trinity

> Más allá de los 9 exploits base de la Constitución §5: vectores reales que tumban sistemas en producción.

## 1. Amenazas de Disponibilidad y Cómputo (DoS)
- **DoS algorítmico en hashing:** Verificar siempre que los adaptadores de contraseña (`scrypt` o equivalentes) validen cotas máximas de coste ($N, r, p$) y `maxmem` acotado antes de ejecutar C/libuv. Un parámetro $N$ arbitrario en un hash malformado puede congelar todo el servidor.
- **Password Spraying y abuso volumétrico:** El bloqueo por `username` (`INV-AUTH-005`) no protege contra un atacante que prueba 1 clave contra 5,000 usuarios distintos o satura el hasher ficticio (`INV-AUTH-006`). Exigir rate limiting por IP/origen en rutas públicas de autenticación y registro.
- **Contención transaccional como vector DoS:** Auditar que el cálculo criptográfico lento nunca ocurra dentro de bloqueos globales de base de datos (`BEGIN IMMEDIATE`).

## 2. Autorización Multi-Rol (RBAC) e IDOR Profundo
- **Prueba exhaustiva de matriz `rol × acción`:** En hogares con múltiples roles (`Propietario Legal`, `Admin Hogar`, `Cuidador`, `Lector`), cada celda denegada debe devolver el código exacto del catálogo (`404` si el recurso no es visible para el actor, `403` si es visible pero carece de permiso), evaluado **antes** del esquema del cuerpo.
- **Protección contra escalada y huérfanos:** Un `Admin Hogar` no puede eliminar al `Propietario Legal`, transferir propiedad legal que no posee ni auto-asignarse permisos superiores. Al eliminar cuenta o salir de un hogar, verificar atomicidad y bloqueo si es propietario único con otros miembros.

## 3. Ciclo de Vida de Sesión y Superficie de Entrada
- **Revocación real e inmediata:** `POST /auth/logout` y `DELETE /users/me` deben invalidar el token en almacenamiento antes de responder; reusar la cookie inmediatamente después debe devolver `401`.
- **Ventanas deslizantes + tope absoluto:** Verificar con reloj inyectado que el `idleTimeout` caduca tras inactividad exacta (`30m + 1ms → 401`) y que la actividad continua jamás extiende la sesión más allá del tope absoluto (`24h`).
- **Nuevos vectores de inyección:** Auditar todo campo nuevo (`speciesOther`, `email`, `microchip_id`, notas de auditoría) contra XSS almacenado, inyección SQL, prototype pollution y fuga en logs redactados.
