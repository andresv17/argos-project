# Gate /merovingian — Feature 003 (Argos en Cloud Run + Neon Postgres)

**Fecha**: 2026-11-15 · **Autor**: /merovingian · **Estado**: `DRAFT` (informe; sin aprobación; las autorizaciones de dependencias son de Neo, Nivel 2).
**Objeto**: `specs/003-cloud-gcp/{spec,plan,tasks,data-model,research,quickstart}.md`, `contracts/README.md`. Sin ediciones de specs, código ni `package.json`; nada instalado (solo `npm view`, `npm audit`, OSV, Terraform Registry, GitHub API).
**No repite**: H-LOCK-001..029, H-MIF-001..016, H-RAMA-001..014 (solo remite a H-RAMA-011).

Regla de edad: hoy 2026-11-15; corte de 14 días = 2026-11-01.

## 1. Tabla de dependencias y versión propuesta (para T404, decisión de Neo)

| Paquete / proveedor | Última publicada | Versión propuesta (exacta) | Fecha publicación | Edad | Licencia | Mantenimiento | CVE/GHSA conocidos en la versión propuesta |
|---|---|---|---|---|---|---|---|
| `pg` (dependencies) | 8.23.1 (2026-09-30) | **8.23.1** | 2026-09-30 | 46 d | MIT | brianc; 8 publicaciones en 2026 | 0 (OSV; única GHSA histórica GHSA-wc9v-mj63-m9g5 corregida en 2.11.2) |
| `@types/pg` (devDependencies) | 8.23.1 | **8.23.1** (alineada con `pg`) | 2026-08-17 | 90 d | MIT | DefinitelyTyped | 0 |
| `@fastify/static` (dependencies) | 10.1.11 (2026-11-13) | **10.1.8** (10.1.9, 10.1.10 y 10.1.11 tienen < 14 d) | 2026-10-27 | 19 d | MIT | Fastify core (Collina); 8 versiones en 2 meses | 0 en 10.1.8; 4 GHSA históricas (path traversal / route guard), todas corregidas en <= 10.1.2 |
| `esbuild` (devDependencies, solo etapa de build) | 0.28.2 (2026-08-08) | **0.28.2** (ya presente en el árbol como dependencia de `tsx`) | 2026-08-08 | 99 d | MIT | un mantenedor (evanw) | 0 en 0.28.2; la GHSA de servidor de desarrollo afecta a 0.21.5 (copia de `vite`), no a 0.28.2 |
| Terraform CLI | 1.17.2 | decisión de Neo (ver H-MERO-001); la spec fija **1.9.0** (existe en releases.hashicorp.com) | 1.9.0 = 2024 | > 12 m | BUSL-1.1 | línea 1.9 sin parches probablemente [verificar política de soporte] | n/c |
| `hashicorp/google` | 8.11.0 (2026-11-10) | spec: `~> 5.20` → resuelve a **5.45.2** (última 5.x, 2025-02-10). Alternativas con >= 14 d: 6.50.0 (2025-09-19), 7.46.2 (2026-10-23, 23 d) | ver col. propuesta | 5.x: 21 m | MPL-2.0 | HashiCorp oficial; la 5.x no recibe cambios | n/c [verificar en el tracker del proveedor] |

Notas: `pg` arrastra `pg-pool 3.14.0`, `pg-protocol`, `pg-connection-string`, `pgpass 1.0.5`, `pg-types 2.2.0`, `pg-cloudflare` (transitivas, MIT; se autorizan por arrastre y quedan fijadas en `package-lock.json`). `@fastify/static` arrastra `glob ^14`, `@fastify/send ^4.2`, `content-disposition`, `fastq`, `fastify-plugin ^6` (sin `peerDependencies` declaradas; compatibilidad con Fastify 5.12.8 **[verificar]** con una prueba de arranque antes de fijar). Convención del repositorio: versiones **exactas** sin `^` (todas las actuales lo son); `esbuild` 0.x debe fijarse exacta porque el `^` en 0.x admite cambios de minor.

## 2. Resumen de hallazgos

| Severidad | Cantidad |
|---|---|
| Alta | 3 (H-MERO-001..003) |
| Media | 10 (H-MERO-004..013) |
| Baja / informativa | 5 (H-MERO-014..018) |
| **Total** | **18** |

## 3. Hallazgos altos

### H-MERO-001 (alto) — Proveedor `hashicorp/google ~> 5.20` sobre una línea congelada, sin lockfile ni versión exacta
- **Ref**: plan.md línea 4 y spec.md REQ-IAC-002 («Proveedor `hashicorp/google ~> 5.20`, Terraform `1.9.0`, iguales a Mirror»).
- **Evidencia** (2026-11-15): `curl https://registry.terraform.io/v1/providers/hashicorp/google/versions` → 5.x termina en **5.45.2 (2025-02-10)**; vigente **8.11.0 (2026-11-10)**; 6.x termina en 6.50.0 (2025-09-19); 7.x en 7.46.2 (2026-10-23). `checkpoint-api.hashicorp.com` → Terraform vigente **1.17.2**. `grep -n -i "terraform.lock\|lock.hcl" specs/003-cloud-gcp/*.md` → 0 coincidencias.
- **Efecto**: `~> 5.20` resuelve hoy a 5.45.2 y lo hará siempre (línea muerta, sin correcciones de seguridad ni nuevos campos [verificar política de soporte de HashiCorp]); sin `.terraform.lock.hcl` versionado, el `plan` de CI no es reproducible ni protege contra un proveedor manipulado (hashes). La paridad con Mirror es la única razón y arrastra su deuda.
- **Propuesta (decide Neo, Nivel 2)**: (a) conservar paridad pero fijar `version = "5.45.2"` exacta y versionar `.terraform.lock.hcl` (con `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`); o (b) subir a 7.46.2 (o 6.50.0 si se prefiere un salto menor) con prueba de `plan` limpio en T4xx, y registrar la deuda en Mirror. Terraform: fijar `required_version = "1.9.0"` o subir (1.17.2 exige leer su changelog; **[verificar]** compatibilidad con backend `gcs`). Añadir a T404 la autorización del proveedor y del lockfile. Alternativa a informar: OpenTofu (MPL-2.0) por la licencia BUSL de Terraform (H-MERO-016).

### H-MERO-002 (alto) — Habilitar `HOST=0.0.0.0` rompe el oráculo de la 002 y exige relajar una prueba (Nivel 3)
- **Ref**: `tests/unit/app-config.spec.ts:59` (`[{ HOST: '0.0.0.0' }, ['HOST']]`, caso que exige el rechazo); `src/infrastructure/config/app-config.ts:4, 27, 56, 74, 142` (tipo literal `host: '127.0.0.1'`, `enum: ['127.0.0.1']`); tests/unit/app-config.spec.ts:26 y :42 usan `127.0.0.1`; plan.md línea 92 y REQ-CLD-003; T409/T410.
- **Evidencia** (2026-11-15): `grep -nE "127\.0\.0\.1|0\.0\.0\.0|HOST" tests/unit/app-config.spec.ts tests/integration/api/server.api.spec.ts tests/security`. La prueba `tests/security/exploits/audit-secret.security.spec.ts:48` fija `HOST: '127.0.0.1'` explícito (no se rompe). `server.api.spec.ts` no depende del host (usa `inject`/puerto 0 [verificar]).
- **Efecto**: la enmienda II.6 invierte una aserción negativa de la 002; T409 dice «pruebas primero: HOST admite 0.0.0.0» pero no indica qué pasa con el caso existente. Quitar o invertir ese caso es «relajar pruebas» (Nivel 3 de la constitución, línea 165) salvo que se **sustituya** por una aserción más fuerte. Además el tipo literal `'127.0.0.1'` se propaga a quienes lean `config.host`.
- **Propuesta**: T409 debe decir explícitamente: el caso `HOST: '0.0.0.0'` pasa de «rechazado» a «aceptado solo si `NODE_ENV=production`» (o con `ARGOS_DB_DRIVER=postgres`), y se **añaden** casos de rechazo para `HOST` = `::`, `localhost`, `10.0.0.1`, vacío; el valor por defecto sigue siendo `127.0.0.1` (INV-ARCH-006: un `.env` olvidado en desarrollo no debe exponer la API a la red local). Esa sustitución, y la edición del oráculo existente, requieren la firma de Neo junto con la enmienda II.6 (T403).

### H-MERO-003 (alto) — Los scripts de compuerta conocen solo las features 001/002 y compilan a la misma `src/generated/`
- **Ref**: `scripts/compile-contracts.sh` líneas 5, 12, 41-43 (`001|002`, «Feature desconocida»), 58 y 74 (lista fija `openapi/pet-tracker-api.openapi.yaml`), 94-98 (salida `src/generated/`); `package.json` `test:gate` (`--feature 002` fijo); T406, T408; contracts/README.md.
- **Evidencia**: lectura de los archivos citados, 2026-11-15; `ls src/generated` → `api errors index.ts machines schemas`; `tests/integration/contracts/openapi-conformance.spec.ts:16,36` cuentan «las 40 operaciones» del OpenAPI de la 002.
- **Efecto (cadena REQ → contrato → generado → pruebas)**: `ops.openapi.yaml` (REQ-CLD-004/007) no toca el contrato de dominio, pero al compilar `--feature 003` hacia el mismo `src/generated/` se corre el riesgo de que (a) sobrescriba o mezcle `src/generated/api` y `errors` de la 002 y cambie el conteo de 40 operaciones que valida el test de conformidad, (b) `test:gate` (que hoy compila 002) deje la 003 sin compilar o, al revés, genere un `src/generated/` distinto según el orden, rompiendo `git diff --exit-code` de deriva de `drift-detection.yml` [verificar]. T406 dice que los scripts «aceptan `--feature 003` sin romper 001/002», pero no fija **dónde** escribe ni el orden.
- **Propuesta**: T406/T408 deben exigir: salida de 003 en un subdirectorio propio (`src/generated/ops/`), sin tocar `api/` ni `errors/` de la 002 salvo adición aditiva de `ERR-*` con SemVer MINOR; `test:gate` compila 002 y 003 en secuencia; criterio de aceptación: `git diff --stat src/generated/api` vacío tras compilar 003. Si se añade `ERR-*` de readiness al catálogo, debe ser en `contracts/errors/` de la 003, y el compilador debe fusionarlo de forma determinista.

## 4. Hallazgos medios

### H-MERO-004 (medio) — `@fastify/static`: historial de bypass de ruta, cadencia alta y fallback SPA
- **Ref**: ADR-003-01, REQ-CLD-001 (estáticos de `dist/` + fallback SPA), T411/T432.
- **Evidencia**: OSV (2026-11-15): GHSA-83w8-p2f5-377r y GHSA-8pvw-jcv7-9cmj (julio 2026; corregidas en 10.1.1 y 10.1.2), GHSA-pr96-94w5-mx2h y GHSA-x428-ghpx-8j92 (abril 2026; corregidas en 9.1.1). `npm view @fastify/static time`: 8 publicaciones entre 2026-09-17 y 2026-11-13.
- **Propuesta**: fijar 10.1.8 exacta (sin `^`); `dotfiles: 'deny'`, sin `list`, `wildcard` acotado; añadir a T411 casos de path traversal codificado (`%2e%2e`, `%2f`, `//`, `\`) sobre estáticos y sobre el fallback (reutilizar el vector 9 de `/sentinels`); reevaluar la versión justo antes de implementar (T404) porque el rango «>= 14 d» se desplaza.

### H-MERO-005 (medio) — `esbuild`: 0.x, binario nativo y alternativas que Neo debe conocer
- **Ref**: D-07 = A, T432, REQ-CLD-001.
- **Evidencia**: `npm ls esbuild` → `tsx@4.23.15 → esbuild@0.28.2` y `vite@5.4.21 → esbuild@0.21.5` (dos copias); `npm view esbuild` → `postinstall: node install.js` y binario por plataforma en `@esbuild/*` (optionalDependencies).
- **Efecto**: el binario del build debe coincidir con la plataforma (`linux-x64` en CI); `npm ci --ignore-scripts` puede romperlo o no según el empaquetado [verificar]. Debe ser **devDependency** (solo etapa de build, no entra en la imagen final), coherente con «sin devDependencies».
- **Alternativas para Neo (informativo)**: (1) `tsc` con emisión: sin dependencia nueva, pero el proyecto usa `~5.6` y los imports `.ts` requieren `rewriteRelativeImportExtensions` (TS >= 5.7), es decir, un salto de TypeScript (Nivel 2); (2) type stripping nativo de Node 22 (`node --experimental-strip-types`; el repositorio ya ejecuta `.ts` con Node 22.18+): cero dependencias, pero sin soporte para `enum`/propiedades de parámetro y emite avisos experimentales [verificar en 22.23.4]; (3) `tsx` en producción: descartado por D-07. D-07 = esbuild es razonable; solo se pide fijar exacta y confirmar que `better-sqlite3` queda `external` (ver H-MERO-006).

### H-MERO-006 (medio) — `better-sqlite3` (módulo nativo) sigue en la imagen de producción por importación estática
- **Ref**: `src/infrastructure/http/server.ts:20-21` importa estáticamente `openSqliteDatabase`/`SqliteUnitOfWork` (→ `better-sqlite3`); REQ-CLD-001 («sin devDependencies»), REQ-SEC-005 («sin `npm` ni compiladores en la etapa final»), NFR-CLD-011 (imagen <= 200 MB), REQ-PG-010 (elige el adaptador por `ARGOS_DB_DRIVER`).
- **Efecto**: aunque `ARGOS_DB_DRIVER=postgres`, el servidor carga `better-sqlite3` al arrancar; un módulo nativo no se puede empaquetar con esbuild (debe quedar `external` y copiarse con su `.node`); en `slim`/`distroless` con glibc distinto al de la etapa de build puede fallar al cargar. Aumenta peso y superficie de la imagen.
- **Propuesta**: T431/T432 deben exigir carga **dinámica** (`await import()`) del adaptador elegido (solo en `infrastructure`/composición, sin tocar `domain`/`application`) o dejar `better-sqlite3` explícitamente en `dependencies` con prueba de arranque de la imagen. Medir el tamaño real en T434. Alternativa: `npm ci --omit=dev` en la etapa de build con la misma base glibc que la de ejecución.

### H-MERO-007 (medio) — GitHub Actions: la spec no nombra ninguna; el repositorio usa `@v4` por etiqueta mayor
- **Ref**: plan.md §5-6, REQ-CICD-003/006/007, tasks.md T116-T133 (menciones a `hadolint`, `actionlint`, `gitleaks`, `gcloud`); `.github/workflows/*.yml`.
- **Evidencia** (GitHub API, 2026-11-15): vigentes `actions/checkout v7.0.1`, `actions/setup-node v7.1.0` (2026-10-08), `actions/upload-artifact v7.0.2`, `actions/setup-python v7.1.0`, `google-github-actions/auth v3` (2025-09-03), `google-github-actions/setup-gcloud v3.0.1` (2025-08-28), `hashicorp/setup-terraform v4.0.1` (2026-05-12), `docker/setup-buildx-action v4.4.1`, `docker/build-push-action v7.4.0`, `docker/login-action v4.8.0` (2026-11-05, < 14 d), `hadolint/hadolint-action v3.5.0`, `rhysd/actionlint v1.7.12`, `gitleaks/gitleaks-action v3.0.0`. Los flujos actuales usan `actions/checkout@v4`, `setup-node@v4`, `setup-python@v5` (etiqueta mayor, no SHA). No hay `dependabot.yml`.
- **Clasificación**: primera parte (GitHub, Google, HashiCorp): `actions/*`, `google-github-actions/*`, `hashicorp/setup-terraform`. Terceros **no verificados por GitHub ni Google**: `hadolint/hadolint-action`, `rhysd/actionlint`, `gitleaks/gitleaks-action` (v3 puede exigir `GITLEAKS_LICENSE` en repos de organización **[verificar]**). `docker/*` es del editor Docker (verificado) pero es tercero.
- **Propuesta**: (1) T116 debe listar cada acción con versión y SHA de 40 caracteres; fijar **por SHA** todas las que manejan credenciales (`google-github-actions/auth`, `docker/login-action`, `setup-terraform`) y los terceros; etiqueta mayor aceptable solo para `actions/*`. (2) Evitar las tres acciones de terceros de lint/escaneo: ejecutar `hadolint`, `actionlint` y `gitleaks` como binarios descargados con versión y `sha256` fijos, o como contenedor con digest. (3) `permissions:` mínimos por trabajo (`id-token: write` solo en `deploy`/`terraform apply`; `contents: read` el resto). (4) Si Neo lo autoriza (CI = Nivel 2), añadir `dependabot.yml` solo para `github-actions` y `docker`. Cualquier acción nueva requiere autorización de Neo.

### H-MERO-008 (medio) — Imagen base sin fijar por digest y sin análisis de vulnerabilidades tras retirar `trivy`
- **Ref**: REQ-CLD-001 («imagen `slim`/`distroless`»), REQ-SEC-005, H-MIF-012 (retira `trivy`), plan.md fila `code-quality.yml`.
- **Evidencia**: `ls Dockerfile` → no existe aún; `.nvmrc` = 22.23.4; `curl https://nodejs.org/dist/index.json` → 22.23.5 (2026-11-11, 4 d) y 22.23.4 (2026-10-20).
- **Propuesta**: fijar `FROM node:22.23.4-slim@sha256:<digest>` (digest tomado y registrado en T431; **[verificar]** que la etiqueta exista), o `gcr.io/distroless/nodejs22-debian12` también por digest; incluir `npm audit --omit=dev --audit-level=high` como compuerta del despliegue (hoy: 0 vulnerabilidades en producción, `npm audit --omit=dev` 2026-11-15) y como sustituto barato de `trivy` mientras Neo mantenga el recorte. Artifact Registry ofrece escaneo (cobro por imagen) **[verificar]**: no activar.

### H-MERO-009 (medio) — Deuda existente de `npm audit` (solo desarrollo) que el pipeline de despliegue ejecutará
- **Evidencia** (`npm audit --json`, 2026-11-15, en el árbol actual, sin las dependencias nuevas): 15 (11 moderadas, 1 alta, 3 críticas). Directas: `vite@5.4.21` (alta: path traversal en `.map` de dependencias optimizadas), `vitest@2.1.9` (crítica: lectura/ejecución de archivos con UI activa), `@vitest/coverage-v8` (crítica, vía `test-exclude`/`vitest`), `@stryker-mutator/*` (moderada, vía `minimatch`); transitivas: `tinypool` (crítica: contaminación de prototipo), `esbuild 0.21.5` (moderada: servidor de desarrollo), `qs`, `glob`. `npm audit --omit=dev` = 0.
- **Efecto**: el servidor de desarrollo de vite/vitest UI no se usa en CI ni en la imagen, pero `test-gate.yml` ejecuta `vitest`/`stryker` con permisos de despliegue si se reutiliza vía `workflow_call` (REQ-CICD-003). Los arreglos son saltos de major (vitest 2 → 3/4, vite 5 → 6+; Nivel 2).
- **Propuesta**: no bloquea la 003. Abrir `DEUDA-*` para `/dojo`; en el flujo de despliegue ejecutar la compuerta de pruebas en un trabajo **sin** `id-token: write` ni secretos (aísla `vitest`/`tinypool` de las credenciales de GCP), y usar `--omit=dev` para la auditoría de producción.

### H-MERO-010 (medio) — Exilio: dependencias existentes que la 003 usaría de forma nueva
- **Ref**: constitución línea 147 (`tsx` y `concurrently` «solo desarrollo»); T429 (`scripts/migrate-postgres.ts` ejecutado en CI con `node` en el paso `migrate`, plan.md línea 147), T432 («bundle `esbuild` o `tsx` de producción», texto obsoleto frente a D-07 = A); `package.json` `dev` usa `tsx watch --env-file-if-exists=.env`.
- **Evidencia**: `npm ls tsx dotenv` → `tsx@4.23.15` (dev, directa) y `dotenv` **no** presente (Node carga `.env` con `--env-file`; sin paquete nuevo). `npm ls` muestra `tsx` también como dependencia de `postcss-load-config`.
- **Efecto**: (a) si el paso `migrate`, `vacuum-argos.yml` o el trabajo de mantenimiento ejecutan `tsx scripts/*.ts` en CI, se usa `tsx` fuera de «solo desarrollo» → requiere autorización explícita; (b) `@types/node` 22.20.5 y los demás `devDependencies` siguen en el árbol de CI pero no en la imagen: sin cambio; (c) `better-sqlite3` ya autorizado, ver H-MERO-006; (d) `yaml` está autorizado «solo si el generador lo importa»: si el compilador de contratos 003 lo usa, queda dentro de lo autorizado.
- **Propuesta**: T404 debe decir que `tsx` y `concurrently` **no** se usan en CI de despliegue ni en la imagen; el migrador y el script de mantenimiento se ejecutan con Node nativo o se empaquetan con el mismo `esbuild` (un único mecanismo, D-07). Eliminar «o `tsx` de producción» de T432. Sin `dotenv`: no autorizar ni añadir.

### H-MERO-011 (medio) — Términos de servicio, tratamiento de datos y transferencia internacional (cierra el seguimiento de H-RAMA-011)
- **Ref**: D-02 (Cloud Run `us-central1`, Neon `aws-us-east-2`), research.md §1-2, spec Supuestos, H-RAMA-011.
- **Evidencia** (2026-11-15): `https://neon.com/terms-of-service` (HTTP 308 → sitio vigente) indica que Neon es una oferta de **Databricks, Inc.** (matriz de Neon, LLC), que incorpora un DPA y remite a listas de subencargados (`databricks.com/legal/databricks-subprocessors`, Grafana Labs en EE. UU. para servicios de plataforma); el SLA citado es el «Business SLA»: el plan **Free no tiene SLA** (no encontrado SLA para Free **[verificar]**). Google Cloud: términos y DPA de Cloud en `cloud.google.com/terms` **[verificar]**; GitHub: ToS y DPA **[verificar]**.
- **Neo debe revisar**: (1) ToS + DPA de Neon (qué datos, subencargados, derecho de auditoría, retención al cancelar o suspender, política de proyectos inactivos del plan Free **[verificar]**); (2) ToS y DPA de Google Cloud y condiciones del Free Tier (los límites gratuitos pueden cambiar sin aviso); (3) GitHub (Actions procesa secretos y logs); (4) mecanismos de transferencia a EE. UU. bajo la Ley 1581 de 2012 y el régimen de transferencias de la SIC **[verificar con asesoría jurídica; no es dictamen]**; (5) aviso de privacidad y finalidad si la 003 se abre a terceros. Con usuarios conocidos y consentimiento directo de Neo el riesgo es bajo.
- **Propuesta**: añadir a Supuestos la lista de encargados (Google, Neon/Databricks, GitHub) con URL y fecha de lectura, y una decisión D-25 «sí / no se abre a terceros» (Neo). No se recomienda cambiar de proveedor por esto.

### H-MERO-012 (medio) — «Solo gratuito» depende de cuenta de facturación y de cupos compartidos con Mirror
- **Ref**: constitución VI (solo servicios gratuitos), NFR-CLD-001, research.md §1 (Scheduler, Artifact Registry, GCS, Secret Manager).
- **Evidencia**: research.md línea 22 reconoce que el precio de Cloud Scheduler fue «de memoria» (3 jobs gratis por cuenta de facturación, Mirror ya usa 2); líneas 13-15 (cupos compartidos). Cloud Run, Artifact Registry, Secret Manager y Scheduler **requieren cuenta de facturación habilitada** [verificar] aunque estén dentro del cupo gratuito.
- **Propuesta**: Neo confirma (a) que acepta una tarjeta vinculada con tope de presupuesto; (b) alerta de presupuesto en USD 1 en la misma cuenta de facturación (Terraform `google_billing_budget` requiere permisos de facturación, así que lo crea Neo a mano o queda como paso del runbook); (c) verificar contra la página de precios vigente de cada servicio antes de T404 (marcado [verificar] en research.md). El cupo de Scheduler queda en 0 de margen tras Argos.

### H-MERO-013 (medio) — Servir HTML y estáticos desde la API añade superficie sin cabeceras de seguridad definidas
- **Ref**: REQ-CLD-001, REQ-CLD-004, REQ-SEC-*; `grep -rn "content-security-policy\|nosniff\|helmet" src` → 0; `grep CSP specs/003-cloud-gcp/spec.md` → 0.
- **Efecto**: en la 001/002 la API respondía JSON; con el fallback SPA el mismo origen entrega HTML y JS (XSS, clickjacking, MIME sniffing pasan a ser relevantes). No cambia ninguna respuesta de la 002, pero sí el modelo de amenazas de los 9 vectores.
- **Propuesta**: T411 añade `Content-Security-Policy` (por defecto `default-src 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'` y `Cache-Control` distinto para `/assets/*` (inmutable) e `index.html` (sin caché); todo con código propio en `infrastructure/http`, sin `@fastify/helmet` (dependencia no autorizada).

## 5. Hallazgos bajos e informativos

### H-MERO-014 (bajo) — `pg`: alternativas y puntos de atención
`postgres` (porsager, versión 4.1.1, Unlicense) y `@neondatabase/serverless` 1.2.1 (MIT, API específica de Neon/WebSocket) existen; ADR-003-02 ya descarta API propietaria de Neon y `pg` es la opción más difundida, compatible con PgBouncer en modo transacción siempre que no se usen sentencias preparadas con nombre ni `SET` de sesión fuera de `SET LOCAL`. Atención: `pg-types 2.2.0` (transitiva) está sin mantenimiento activo; la conversión de `numeric`/`bigint`/`timestamptz` devuelve cadenas o `Date`: T424 debe registrar parsers explícitos y probar que las marcas `TEXT` ISO-8601 no se reinterpretan. Sin acción de autorización adicional.

### H-MERO-015 (bajo) — Texto obsoleto entre artefactos
research.md R-01 (línea 104) sigue diciendo «conservar 2 versiones, borrar > 7 d», contradice REQ-IAC-004 (N=5, solo `keep`, H-MIF-013). T432 conserva «o `tsx`». plan.md línea 4 fija «Node 22.23.4»; existe 22.23.5 (2026-11-11, < 14 d): mantener 22.23.4 y reevaluar.

### H-MERO-016 (bajo) — Licencia de Terraform
Terraform >= 1.6 es BUSL-1.1 (uso interno permitido; sin restricción práctica para un proyecto propio **[verificar con lectura de la licencia]**). OpenTofu (MPL-2.0) es la alternativa; se informa por transparencia, no se recomienda cambiar por paridad con Mirror.

### H-MERO-017 (informativo, positivo) — `ops.openapi.yaml` no toca contratos de dominio ni cambia respuestas de la 002
Cadena trazada: REQ-CLD-004/007 → `ops.openapi.yaml` (`/healthz`, `/readyz`, `/internal/maintenance`) → ruta nueva `ops-routes.ts` → pruebas nuevas. Ninguna ruta coincide con las 40 operaciones de `specs/002-plataforma-v21/contracts/openapi/pet-tracker-api.openapi.yaml`; no hay `/healthz`, `/readyz` ni `/internal/` en `src/`, `tests/` ni en los contratos 001/002 (`grep -rlE "healthz|readyz|/internal/"`). Los códigos `ERR-*` de readiness reutilizan `ERR-INTERNAL-UNEXPECTED` (existente): sin cambio de catálogo. Tabla impactada: ninguna de dominio; `schema_migrations` es nueva en Postgres. Únicas excepciones: el conteo de operaciones en `openapi-conformance.spec.ts` (ver H-MERO-003) y el nuevo esquema de autenticación Bearer OIDC en `/internal/maintenance`, ajeno al esquema de cookies y a CSRF de los 9 vectores (T411 y la suite deben excluirlo explícitamente de la matriz de CSRF y probarlo aparte).

### H-MERO-018 (bajo) — La regla SAST `argos-no-process-env` alcanza a los scripts nuevos
`tests/security/sast-rules/argos-no-process-env.yml` prohíbe `process.env` fuera de `src/infrastructure/config/`; semgrep en `test-gate.yml` solo escanea `src/`. `scripts/migrate-postgres.ts` y el script de mantenimiento leen `DATABASE_URL_DIRECT` fuera de `src/` (no los cubre la regla); T410 debe decidir si centralizan la lectura en `loadAppConfig` para no abrir un segundo punto de entrada de configuración (INV-ARCH-006) y que el valor nunca se imprima (REQ-SEC-003).

## 6. Proveedores y servicios (resumen)

| Servicio | Plan | Tema para Neo | Estado |
|---|---|---|---|
| Neon (Databricks, Inc.) | Free, `aws-us-east-2` | ToS, DPA, subencargados, sin SLA en Free, política de inactividad | H-MERO-011 [verificar] |
| Cloud Run | Free tier | requiere facturación; ToS Google Cloud | H-MERO-011/012 |
| Secret Manager, Artifact Registry | Free tier | límites 6 versiones activas / 0,5 GB; compartido con facturación Mirror | H-MERO-012 |
| Cloud Scheduler | 3 jobs gratis por cuenta de facturación | a Argos le queda 1 | H-MERO-012 [verificar] |
| GitHub Actions | gratuito | secretos y logs en un tercero; cron deshabilitado a 60 d (ya en H-RAMA) | H-MERO-011 |

## 7. Decisiones que solo Neo puede tomar (Nivel 2)

1. Autorizar o rechazar, con versión exacta: `pg 8.23.1`, `@types/pg 8.23.1`, `@fastify/static 10.1.8`, `esbuild 0.28.2` (dev). Registrar las versiones definitivas el día de T404.
2. Elegir la línea del proveedor de Google y de Terraform y aprobar el lockfile (H-MERO-001).
3. Firmar la sustitución de la aserción negativa de `HOST` (H-MERO-002) junto con la enmienda II.6.
4. Decidir si se autoriza CI/`dependabot.yml` y la lista de acciones por SHA (H-MERO-007).
5. Aceptar la nota de encargados y transferencia internacional (H-MERO-011) y el presupuesto de cuenta de facturación (H-MERO-012).

## 8. Cobertura y límites

Verificado en disco o por consulta pública el 2026-11-15: registro npm, OSV, Terraform Registry, Checkpoint de HashiCorp, GitHub Releases, nodejs.org, `npm audit`, `npm ls`. **No verificado** (marcado [verificar]): política de soporte de HashiCorp para 5.x, compatibilidad runtime de `@fastify/static` 10 con Fastify 5.12.8, términos completos del plan Free de Neon, requisitos de licencia de `gitleaks-action` v3, condiciones de facturación del Free Tier de GCP, existencia de la etiqueta de imagen `node:22.23.4-slim` y análisis jurídico de transferencia internacional. Sin ediciones de código, specs ni `package.json`; sin instalaciones; sin commit; sin marcar nada `APPROVED`.
