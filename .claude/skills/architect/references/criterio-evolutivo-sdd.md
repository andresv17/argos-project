# Criterio Evolutivo SDD — Principal Architect Playbook

> Criterios de diseño arquitectónico para evolucionar contratos y especificaciones entre features (`001` → `002` → `003`) sin romper compatibilidad ni sobre-diseñar.

## 1. Evolución Segura de Contratos (SemVer Real)
- **Compatibilidad hacia atrás en datos y respaldos:** Todo cambio `MAJOR` en un esquema (`pet.schema.json`, `backup-envelope.schema.json`) exige una estrategia explícita de migración automática y lossless para datos SQLite previos y sobres de respaldo anteriores (`1.0.0` → `2.0.0` → `3.0.0`, p. ej. mapeo `DOG → CANINE`, `CAT → FELINE`).
- **Máquinas de estado cerradas y verificables:** Toda nueva transición (ej. `EXPIRED_IDLE`, `EXPIRED_ABSOLUTE`, `CHANGE_ROLE`, `TRANSFER_OWNERSHIP`) debe declarar su estado origen, destino, guarda, evento y código `ERR-*` de rechazo. Cero estados ambiguos o sin salida documentada.
- **Separación entre código de error y texto humano:** Los contratos y `error-catalog.json` fijan `code`, `status` y `invariantRef` deterministas; la capa de presentación puede humanizar la redacción visible para errores genéricos de esquema sin alterar el contrato ni los oráculos de API.

## 2. Pragmatismo y Fronteras de Alcance (Anti-Sobreingeniería)
- **Aislamiento de infraestructura externa:** Capacidades que dependen de internet, secretos externos o almacenamiento de objetos (SSO OAuth2, SMTP/Magic Tokens, buckets PDF/imágenes) no se simulan como "UI decorativa" en local ni se mezclan en `domain/`/`application/`: se diferencian de la fase local o se aíslan tras puertos asíncronos limpios (`INV-ARCH-005`).
- **Preparado para Cloud desde el diseño de aplicación:** Ningún caso de uso debe asumir que el almacenamiento es síncrono en un único proceso; evitar transacciones largas que bloqueen concurrencia cuando se migre de SQLite a Cloud SQL.
- **Trazabilidad viva:** Al añadir requisitos o roles (`RBAC` por matriz), mantener una tabla clara `rol × acción` que sirva tanto de especificación como de fuente directa para pruebas parametrizadas.
