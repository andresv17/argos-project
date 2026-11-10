# QA y Verificación Real — Playbook de Seraph

> Más allá de "pasar scripts": probar el sistema como falla en el mundo real.

## 1. Anti-Falsos Positivos en E2E (Playwright)
- **Recarga y ciclo de vida de sesión:** Toda prueba crítica de autenticación debe cubrir: *login → recargar página (`page.reload()`) sigue autenticado → logout → reusar ruta protegida o cookie previa redirige/devuelve 401 → volver a iniciar sesión funciona*.
- **Edición completa y borrado de opcionales:** Probar editar mascota modificando campos y limpiando campos opcionales (ej. `avatarUrl`), verificando persistencia real tras recarga.
- **Actualización reactiva en hogares:** Al crear hogar o aceptar invitación, comprobar en UI real que el contador, la lista y el selector de contexto se actualizan sin recarga manual.
- **Multi-actor en contextos aislados:** Abrir `BrowserContext` separados por rol (`Propietario`, `Admin`, `Cuidador`, `Lector`, `INVITED`, externo) para validar fronteras reales.

## 2. Verificación Computada de Diseño y Accesibilidad
- Verificar a `320px`, `1024px` y `1280px` con `@axe-core/playwright` (`0` violaciones `critical`/`serious`), **más** aserciones reales de layout (`document.documentElement.scrollWidth <= window.innerWidth`, sin solapamiento de controles ni botones táctiles `< 44px` en móvil).
- **Oráculos estrictos:** Prohibido relajar aserciones o dejar `test.skip` / timeouts inflados para esconder colgamientos reales (como un timeout de 5s en `scrypt` que delata un bug DoS).

## 3. Pruebas de Concurrencia y Estrés Real
- Ejercitar llamadas concurrentes (`Promise.all`) contra `SqliteUnitOfWork` (logins simultáneos intercalados con lecturas de dashboard y altas de registros) para detectar contención de bloqueos (`SQLITE_BUSY` o head-of-line blocking).
