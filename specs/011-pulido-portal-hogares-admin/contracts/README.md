# Contratos de la Feature 011 (DRAFT)

`errors/error-catalog.json` (011) existe desde `6d8ca54` y T1524 lo amplió a 1.1.0 (+10 `ERR-ADM11-*`). T1524 (2026-11-25, `DRAFT`, lo fija solo Neo) redactó además `openapi/admin.openapi.yaml` 1.8.0, `schemas/admin-delegate.schema.json`, `state-machines/admin-delegate.machine.json` (`STATE-ADM11-001`) y `admin-roles-annex.md` (matriz operación→roles y diseño de las migraciones 0031/0027); el resto de contratos sigue sin redactar. `scripts/compile-contracts.sh` aún no admite `--feature 011` (rc=2): la compilación a `src/generated/` queda para `/keymaker`. Las decisiones de Neo están resueltas (ver `../spec.md`, «Decisiones de Neo», y `claude/decisiones-neo-011-2026-11-25.md`); los hallazgos ORA/MIF/MER/H/F quedan **resuelto por directiva Neo 2026-11-25**. Cada contrato nace en una tarea `[ARCH]` de `../tasks.md` con `additionalProperties: false`, límites numéricos explícitos y `x-sdd-metadata`.

Hallazgos de Fase 0 ORA/MIF/MER/H/F (`F-03`, `F-05`, `F-11`, `H-1`, `H-6`, `MIF-011-03/04/10`, `MER-11-01`, paginación de `D11-11`, `D11-02`): **resuelto por directiva Neo 2026-11-25** (detalle en el acta).

| Contrato previsto | Depende de | Tarea `[ARCH]` | Notas |
| --- | --- | --- | --- |
| `openapi/admin.openapi.yaml` (011, MINOR sobre 009) + `schemas/admin-delegate.schema.json` | `D11-01`, `D11-03`, `D11-04` | `T1524` | Rutas `/api/admin/administrators*`; matriz operación→roles |
| `state-machines/admin-delegate.machine.json` (`STATE-ADM11-001`, `INVITED` → `ACTIVE` ↔ `DISABLED`; `D11-04` = A: bidireccional; `H-1`: `INVITED` caduca a las 72 h, constante en `app-config.ts`, `DENIED` uniforme y re-invitación explícita) | `D11-04`, `H-1` (cerradas) | `T1524` | Sin transiciones implícitas; `H-6`: solo el raíz concede `SUPER_ADMIN` |
| `errors/error-catalog.json` (011) | todas | por bloque | Códigos `ERR-ADM11-*`, `ERR-HOG11-*`, `ERR-PRF11-*` |
| Enmienda de la vista pública con foto + ruta `GET /api/shared/:token/pets/:petId/avatar` | `D11-09` (cerrada = A), `MER-11-01` (aprobado) | `T1534` | Excepción al invariante de privacidad de 005 (solo avatar de la mascota); `credentials: 'omit'`, sin claves de objeto ni EXIF, 404 si no aplica; `clinical-summary` y pruebas de 005 intactos |
| ~~Lectura del álbum del hogar~~ **No aplica** | `D11-11` (24 fotos por mascota), `MIF-011-03` = SÍ | `T1542` (N/A) | Sin contrato ni ruta nuevos: el álbum se compone en la UI sobre los endpoints de fotos por mascota de 004 |
| Avatar de usuario | `D11-13` | `T1553` | Migración Nivel 2, separada de la del Bloque D (`MIF-011-10` = NO) |
| Tope de hogares | `D11-12` (cerrada = B+C; máximo 5 hogares) | `T1548` | Constante o parámetro (INV-ARCH-006) |
