# Privacidad, Habeas Data y Ciclo de Vida — Playbook de Rama-Kandra

> Criterios de custodia de datos personales, eliminación atómica de cuenta y portabilidad determinista.

## 1. Minimización y Ciclo de Vida de Datos (Zero Data Hoarding)
- **Limpieza de rastros temporales:** Las sesiones revocadas/expiradas (`sessions`), intentos fallidos antiguos (`login_attempts`) y tokens de intención de borrado deben purgarse periódicamente; nunca acumular datos muertos de autenticación sin caducidad.
- **Redacción estricta en logs y auditoría:** Jamás persistir contraseñas, hashes, tokens opacos de sesión, cookies ni correos personales en logs de aplicación ni en trazas de errores RFC 9457.

## 2. Derecho al Olvido — Eliminación de Cuenta (`DELETE /users/me`)
- **Precondiciones obligatorias antes de borrar:**
  1. Verificar que el usuario no sea propietario único de un hogar con otros miembros activos (bloqueo explícito hasta transferir propiedad `TRANSFER_OWNERSHIP` o vaciar/eliminar el hogar).
  2. Ofrecer/exigir respaldo JSON previo (`deletion-intent`) + re-autenticación + confirmación textual explícita (`"ELIMINAR MI CUENTA"`).
- **Cascada atómica y auditoría anónima:** La eliminación de cuenta, sus sesiones, mascotas propias y registros ocurre en una única transacción; cualquier fallo en el camino restaura todo byte a byte. Si el sistema conserva registro de auditoría operativa tras el borrado del usuario, debe guardar **únicamente el hash canónico irreversible del `userId`** (sin nombre, correo ni username).

## 3. Portabilidad y Respaldos Multi-Versión
- Al exportar según rol en hogares compartidos (`RBAC`), el respaldo contiene únicamente entidades visibles para el usuario dentro de las fronteras permitidas y **nunca** incluye datos personales o credenciales de terceros.
- Al importar (`Merge Idempotente` o `Reemplazo Destructivo`), el paso previo de validación debe reportar conteos y colisiones (IDs, microchips) antes de mutar la base, garantizando rollback byte a byte ante fallo.
