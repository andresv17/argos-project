# Informe de privacidad, Rebanada 1 (T224) — Rama

Fecha: 2026-11-11 · Rama git: `002-plataforma-v21` · Estado: REVIEW (la marca `[x]` de T224 es potestad exclusiva de Neo).
Base de clasificación: `.specify/memory/audits/f4-insumo-rama-privacidad.md` §1.

## 1. Alcance
Rebanada 1 (cuenta e identidad, T208-T222), verificación de privacidad T224: que ningún dato personal ni secreto sembrado aparezca donde no debe (logs, respuestas, base, auditoría) en los flujos de registro, login, sesión, perfil, cambio de contraseña, token de confirmación, eliminación de cuenta, hogar y exportación.

## 2. Datos cubiertos y clasificación
| Dato | Clase | Dónde se vigila en la rebanada |
|---|---|---|
| `username` | P-DIRECTO | logs (solo en el flujo de eliminación) |
| `displayName` | P-DIRECTO | sin aserción en logs (brecha B1) |
| `email` | P-DIRECTO | logs, respuestas de registro/login/sesión; no en export, hogar, respaldo ni hash de auditoría (brechas B2, B4) |
| `userId` | P-INDIRECTO | logs y volcado de base tras eliminación |
| hash de contraseña | SECRETO | logs, respuestas, volcado |
| contraseña en claro | SECRETO | logs, respuestas, base |
| token de confirmación | SECRETO | logs, respuestas |
| cookie / credencial de sesión | SECRETO | logs (`cookie` y `set-cookie` como `[Redacted]`) |

## 3. Pruebas que los cubren
Resultado conjunto: 14 de 14 pasan.

`tests/security/exploits/log-redaction.security.spec.ts` (3 pruebas):
- Registro, login, petición autenticada y logout no dejan token, cookie, contraseña, correo ni hash en los logs (INV-AUTH-003, INV-AUTH-007).
- Con serializadores que exponen cabeceras, `cookie` y `set-cookie` salen `[Redacted]` y el token no aparece.
- Flujo completo (perfil, contraseña vieja y nueva, token, eliminación, sesión vencida) sin valores sembrados en logs (INV-AUD-001).

`tests/security/exploits/credentials.security.spec.ts` (11 pruebas), las relevantes a privacidad:
- Línea 123: la base guarda solo el hash con salt, nunca el texto plano.
- Línea 136: ninguna respuesta (registro, login, sesión, hogar con miembros, invitaciones, exportación) contiene la contraseña ni secretos.
- Línea 160: cambiar contraseña y eliminar cuenta no devuelven ni guardan secretos.
- El resto (login uniforme, bloqueo, política de contraseña, unicidad) es seguridad de acceso, no privacidad, y se cuenta solo en el total.

Mutante: hook temporal en `src/infrastructure/http/app.ts` que registraba el cuerpo de la petición. Las 3 pruebas de `log-redaction` fallaron (detectado). Archivo restaurado: `shasum` coincide y `git diff` de `src/` vacío. Un primer intento con `Buffer` sin convertir a texto no filtraba nada y se descartó por no ser mutante válido.

## 4. Brechas y plan
| # | Brecha | Qué se añade | Tarea destino |
|---|---|---|---|
| B1 | `displayName` sin aserción en logs | Sembrar un `displayName` único y buscarlo en los logs del flujo completo | T225 |
| B2 | `email` sin aserción en respuestas de exportación y de hogar | Aserción de ausencia del correo ajeno/propio no autorizado en ambas respuestas (`REQ-AUTH-004`: solo el propio usuario lo ve) | T225 |
| B3 | `username` en logs solo se busca en eliminación | Extender la búsqueda de `username` a registro, login y perfil | T225 |
| B4 | `email` sin prueba en el respaldo ni en el hash de auditoría (R-03) | Aserción de que el respaldo no contiene el correo y de que el hash de auditoría no es reproducible a partir de él | T225 (hash de auditoría puede requerir tarea de rebanada posterior si el respaldo aún no existe; lo confirma Keymaker) |

Las tres aserciones principales (B1-B3) son baratas y entran en T225. Gravedad: baja; ninguna brecha muestra una fuga real, solo ausencia de prueba que la detectaría.

## 5. Límite del alcance
- No es asesoría legal ni dictamen de cumplimiento de Habeas Data.
- No se revisó retención real (purgas de sesiones, tokens, invitaciones y membresías terminales siguen como PROPUESTA del insumo).
- No se auditó producción, logs reales ni infraestructura; solo las suites en entorno de prueba.
- No se cubren recursos fuera de la rebanada 1 (mascotas, registros clínicos, importación, atomicidad del respaldo).
