# Runbook Cloudflare — Feature 010, Bloque C (`[GH:#66]`)

- Tarea: `T1419` (`/link`) · Requisitos: `REQ-EDG10-001`, `REQ-EDG10-002`, `REQ-EDG10-004`, `REQ-EDG10-005` · Invariante: `INV-EDG10-001` · Decisiones: `D10-03` (APPROVED), `D10-04` (APPROVED), `H-01` y `H-02` (APPROVED, opción A), `H-04` (confirmado).
- Ejecuta: **Neo** (`T1420`). Este documento no cambia infraestructura: no hay Terraform nuevo, no hay `terraform apply` y no hay proveedor de Cloudflare (`D10-04`). Costo objetivo: **$0** (plan Free de Cloudflare, Email Routing gratuito, Cloud Run sin cambios de dimensionamiento).
- Estado: `APPROVED` (2026-11-25, Nivel 2 Neo). Ningún paso se considera hecho hasta que Neo lo ejecute y registre la evidencia en `T1420`.

---

## 0. Orden obligatorio de activación (no alterar)

1. **Activar el proxy naranja con `ARGOS_TRUST_PROXY_HOPS` aún en `1`** (valor por defecto).
2. Verificar que el tráfico pasa por Cloudflare (sección 1 y 7).
3. **Solo entonces** fijar `ARGOS_TRUST_PROXY_HOPS=2` (sección 6).

Motivo: `EDGE-010-002`. Con `HOPS=2` y sin proxy naranja, `request.ip` pasa a ser la IP del borde de Google, y todos los usuarios comparten contador; el límite de registro bloquea al sexto usuario del conjunto. Con `HOPS=1` detrás de Cloudflare sucede lo mismo en sentido inverso (todos ven la IP de Cloudflare). Ninguno de los dos valores debe quedar en producción sin proxy coherente.

---

## 1. Proxy naranja (DNS)

1. En Cloudflare, zona `tipi.pet`, crear o editar el registro del nombre público (`tipi.pet` y, si aplica, `www`) como **CNAME** hacia el host público de Cloud Run del servicio (`<servicio>-<hash>.<región>.run.app`, el que muestra `gcloud run services describe` o la consola).
   - Nota: en `terraform/` no existe mapeo de dominio (`google_cloud_run_domain_mapping`) ni referencia a `tipi.pet`. Si Neo prefiere mapeo de dominio nativo de Cloud Run, debe crearse fuera de este runbook y conviene provisionar el certificado con la nube gris (solo DNS) y pasar a naranja después.
2. Estado del registro: **Proxied (nube naranja)**.
3. Con el CNAME a `*.run.app`, Cloudflare conserva el `Host` del destino, por lo que Cloud Run recibe su propio nombre de servicio y no hay que sobrescribir cabeceras de host.
4. Verificación inmediata: `curl -sI https://tipi.pet` debe devolver cabecera `server: cloudflare` y `cf-ray`.

## 2. SSL/TLS

1. **SSL/TLS → Overview → Full (strict)** (`REQ-EDG10-004`). No usar *Flexible* ni *Full* sin estricto.
2. Como el origen es `*.run.app` con certificado válido de Google, *Full (strict)* funciona sin certificado de origen propio. No crear certificados de origen de Cloudflare: añadirían un secreto nuevo.
3. **Always Use HTTPS**: activado. **Minimum TLS Version**: 1.2.
4. Comprobación de cookies: el cambio de proxy no debe alterar `Secure`/`SameSite`; verificar en T1420 que las cookies de sesión siguen llegando con `Secure` (`REQ-EDG10-005`).

## 3. Protección DDoS

1. **Security → DDoS**: la protección HTTP DDoS gestionada está activa por defecto en el plan Free. Dejarla en automático.
2. **No activar *Under Attack Mode*** de forma permanente (`REQ-EDG10-004`). Si hay un ataque activo, activarlo temporalmente y desactivarlo al terminar, anotando la hora en la bitácora.

## 4. Rate limiting para `/api/auth/*` y `/api/admin/*` (una sola regla)

Regla única en **Security → WAF → Rate limiting rules** (plan Free admite una regla; la expresión combina ambas rutas con `or`):

- Nombre: `argos-auth-admin-rate`
- Expresión (Wirefilter):

```text
(starts_with(http.request.uri.path, "/api/auth/")) or (starts_with(http.request.uri.path, "/api/admin/"))
```

- Característica de conteo: **IP** (`ip.src`).
- Umbral y periodo: **verificar en el panel** los valores que admite el plan Free para el periodo y el tiempo de mitigación antes de fijarlos (las opciones del plan cambian con el tiempo). Propuesta inicial: periodo 10 s, umbral 30 solicitudes, acción **Block** con duración de mitigación de 10 s. Neo puede ajustar.
- Propósito: complementa, no sustituye, los límites de la aplicación (`REGISTRATION_LIMIT` 5/24 h; `/admin` 10 fallos/15 min). La regla de borde evita ráfagas antes de llegar a Cloud Run.
- Prueba de humo (T1420): desde una sola IP, ráfaga de peticiones a `/api/auth/` por encima del umbral debe devolver `429` **desde el borde** (cabecera `cf-ray`, sin cabeceras de Cloud Run). Las peticiones normales no deben recibir `429`.

## 5. Caché de `/assets/*` con exclusión de `/api/admin/*` (`INV-EDG10-001`)

Reglas de caché en **Caching → Cache Rules**, en este orden exacto:

1. **Regla de exclusión (primera)**
   - Expresión: `starts_with(http.request.uri.path, "/api/admin/")`
   - Acción: **Bypass cache**.
2. **Regla de caché**
   - Expresión: `starts_with(http.request.uri.path, "/assets/")`
   - Acción: **Eligible for cache** (Cache Everything), Edge TTL 7 días, Browser TTL respetar origen.
3. Por defecto Cloudflare no cachea `/api/*`; no añadir ninguna regla que cachee `/api/*`.

Verificación (T1420): `curl -sI https://tipi.pet/assets/<archivo-con-hash>` debe mostrar `cf-cache-status: HIT` tras la segunda petición. `curl -sI https://tipi.pet/api/admin/<ruta-get>` debe mostrar `cf-cache-status: DYNAMIC` o `BYPASS`, nunca `HIT` ni `MISS` con almacenamiento.

## 6. Mapeo de IP real: `ARGOS_TRUST_PROXY_HOPS=2` con `ARGOS_HOST=0.0.0.0` (`H-04`)

- `server.ts:240-242` fija `trustProxy` a `false` si `ARGOS_HOST !== '0.0.0.0'`. Por eso el número de saltos solo tiene efecto con **`ARGOS_HOST=0.0.0.0`**. La imagen (`Dockerfile`) ya fija `HOST=0.0.0.0` y `NODE_ENV=production`.
- Valores válidos: entero `0..3`; `HOPS=2` es el valor para Cloudflare + Cloud Run. `trustProxy: true` está prohibido.
- Aplicar **solo después de la sección 1 verificada**:

```text
gcloud run services update <servicio> --region <región> \
  --update-env-vars ARGOS_HOST=0.0.0.0,ARGOS_TRUST_PROXY_HOPS=2
```

- Verificación en la revisión activa: `gcloud run services describe <servicio> --region <región> --format='value(spec.template.spec.containers[0].env)'` debe listar `ARGOS_TRUST_PROXY_HOPS=2`.
- **Riesgo de regresión (acción para Morpheus/Keymaker, no de este runbook):** `deploy-argos.yml` despliega con `--set-env-vars` y no fija `ARGOS_TRUST_PROXY_HOPS`. Si `--set-env-vars` reemplaza el conjunto completo, un despliegue futuro devolvería el valor por defecto `1` y reabriría `EDGE-010-002`. Tras cada despliegue, repetir la comprobación anterior; la solución definitiva es añadir la variable al workflow (cambio de CI, fuera del alcance de `T1419`).
- Prueba local previa (sin Cloudflare): `ARGOS_HOST=0.0.0.0 ARGOS_TRUST_PROXY_HOPS=2 npm run dev` y `curl -H "X-Forwarded-For: 203.0.113.9, 198.51.100.7" http://127.0.0.1:3100/...`.
- Condición de producción (`T1420`): dos clientes reales desde redes distintas deben tener contadores independientes. Si ambos aparecen con la misma IP, `HOPS` está un salto por debajo y hay que revisar el número real de saltos antes de seguir.

## 7. Email Routing `contacto@tipi.pet` con SPF/TXT

1. **Email → Email Routing → Enable** en la zona `tipi.pet`. Cloudflare añade automáticamente los registros MX.
2. Crear la dirección personalizada `contacto@tipi.pet` con destino a la bandeja personal de Neo, y **verificar la dirección de destino** (correo de confirmación de Cloudflare).
3. SPF: si la zona ya tiene un TXT SPF (por ejemplo de otro proveedor), **combinarlos en un único registro**; no crear dos registros SPF. Si no existe, el asistente de Email Routing propone el valor habitual `v=spf1 include:_spf.mx.cloudflare.net ~all`. Confirmar el valor exacto que muestra el panel.
4. Verificación (T1420): enviar un correo de prueba a `contacto@tipi.pet` desde una cuenta externa y comprobar la recepción. Consultar el SPF con `dig TXT tipi.pet +short` y confirmar que aparece una sola línea `v=spf1`.
5. Enlace de contacto de `/privacidad` y `/terminos`: debe usar la misma dirección (`REQ-LEG10-002`).

## 8. Access opcional para beta

- Opcional, **no activar sin decisión de Neo**. Si se usa, **Zero Trust → Access → Applications**: aplicación *self-hosted* sobre `tipi.pet/*`, política *Allow* solo a los correos de la lista beta. Plan gratuito (hasta 50 usuarios).
- Riesgo: Access delante de las páginas públicas (`/privacidad`, `/terminos`, `/login`) y de los callbacks OAuth (`/api/auth/google/callback`, `/api/admin/auth/google/callback`) puede romper el inicio de sesión y las páginas legales. Si se activa, excluir esas rutas con una política *Bypass* y verificar `REQ-EDG10-005` antes de dar acceso a beta.

## 9. Escena (`ARGOS_SCENE_WORKER_URL`)

- Sin cambios: el worker de escena sigue siendo `*.run.app` (`INV-ESC6-018`). No se pasa por Cloudflare. Verificar en T1420 que la escena funciona tras activar el proxy.

---

## 10. Riesgo residual (documentado; no es verde por defecto)

Fuentes: `spec.md` (`D10-03`, `H-01`, `H-02`, `EDGE-010-008`, `EDGE-010-009`) y dictamen `.specify/memory/audits/trinity-010-T1418-ip-xff-2026-11-24.md`.

### 10.1 `H-01` — acceso directo a `*.run.app` anula el límite de registro (APPROVED, opción A)

- `terraform/cloud_run.tf:28` mantiene `INGRESS_TRAFFIC_ALL`. Cualquiera puede llamar al `*.run.app` sin pasar por Cloudflare.
- Con `HOPS=2`, un cliente que envíe su propio `X-Forwarded-For` controla `request.ip`, y puede cambiarlo en cada petición. El tope de registro (`REQ-EDG10-003`, 5/24 h) deja de aplicarse en ese camino (`EDGE-010-008`). Coste para el atacante: $0.
- Mitigación aceptada: aprobación manual de cuentas `PENDING` en `/admin`.
- Alternativa no adoptada: restringir el ingress a tráfico de balanceador/Cloudflare. Requiere cambio de Terraform (N2, `D10-04`). Queda como decisión abierta para Neo; **no se ejecuta en este runbook**.

### 10.2 `H-02` — el límite es por instancia (APPROVED, opción A)

- El contador de registro vive en memoria (`registration-rate-limit.ts`). Con `max_instance_count = 2` y reinicio al escalar a cero, el límite efectivo es **hasta 10 cuentas por IP real en 24 h**, no 5 (`EDGE-010-009`).
- Mitigación: rate limiting de Cloudflare (sección 4) y aprobación manual de `PENDING`.
- Dos clientes distintos detrás de Cloudflare no comparten contador (`REQ-EDG10-003`).

### 10.3 `H-T1418-03` — denegación dirigida de `/admin` por el camino directo (riesgo BAJO, aceptado por Neo 2026-11-25)

- Quien conozca la IP pública de un administrador puede fijar su `X-Forwarded-For` en el camino directo `*.run.app` y agotar el límite de `/admin` (10 fallos/15 min) del administrador real.
- Requiere el camino directo y conocer la IP. La autenticación es OAuth con lista de correos, sin contraseña: agotar el límite no permite fuerza bruta útil.
- Mitigado por la regla de borde (sección 4) para tráfico que pasa por Cloudflare, y por la misma restricción del `H-01` en el camino directo.

### 10.4 `H-T1418-01` y `H-T1418-02` — resueltos en la spec (APPROVED, Neo, 2026-11-25)

- **H-T1418-01 (IPv6 /64).** La clave de cada contador pasa por `ipLimitKey(ip)`: IPv6 se agrega por prefijo /64, IPv4 sin puerto, `::ffff:` normalizado a IPv4. Así un cliente con prefijo IPv6 no evade `REQ-EDG10-003` rotando direcciones dentro de su /64.
- **H-T1418-02 (memoria).** Los cinco mapas en memoria (`registration`, `admin`, `google`, `invitee-search`, `scene`) tienen tope duro con descarte de la entrada más antigua, y las claves inválidas van al cubo único `invalid`.
- Ambas son alcance de implementación (Keymaker, verificación por Oracle; pruebas `SEN-IP-04..09`). No requieren Terraform. Este runbook no las ejecuta: solo deja constancia de que, hasta que el código esté verificado, el límite de registro por IPv6 no es fiable.
- Referencia: `specs/010-tipi-identidad-legal-borde/spec.md` (`REQ-EDG10-003`, `SC-010-016`, tabla de decisiones) y `.specify/memory/audits/trinity-010-T1418-ip-xff-2026-11-24.md`.

---

## 11. Checklist para `T1420` (Neo)

- [ ] Sección 1: `server: cloudflare` en `https://tipi.pet`; `tipi.pet` en nube naranja.
- [ ] Sección 2: SSL/TLS *Full (strict)*; sin errores de certificado.
- [ ] Sección 3: DDoS automático; *Under Attack Mode* apagado.
- [ ] Sección 4: ráfaga de `/api/auth/*` produce `429` en el borde; uso normal sin `429`.
- [ ] Sección 5: `/assets/*` con `HIT`; `/api/admin/*` nunca `HIT`.
- [ ] Sección 6 (después de 1 a 5): `ARGOS_TRUST_PROXY_HOPS=2` en la revisión activa; dos clientes reales con contadores independientes.
- [ ] Sección 7: correo a `contacto@tipi.pet` recibido; una sola línea SPF.
- [ ] Login Google de usuarios y de `/admin` funcionan; escena funciona; cookies `Secure`.
- [ ] Costo del mes sin cargos nuevos ($0).
- [ ] Registro de la fecha, la revisión y las capturas en la bitácora. Ninguna tarea se marca `[x]` por este runbook.

## 12. Rollback

- DNS: poner la nube en gris (solo DNS) para quitar Cloudflare del camino.
- Variable: `gcloud run services update <servicio> --region <región> --update-env-vars ARGOS_TRUST_PROXY_HOPS=1` **en el mismo momento** en que se quita la nube naranja. Dejar `HOPS=2` sin proxy reabre `EDGE-010-002`.
- Regla de caché y de rate limiting: desactivar en el panel; no afectan a la aplicación si se retiran.
