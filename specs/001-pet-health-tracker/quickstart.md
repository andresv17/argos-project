# Quickstart: Argos Pet Health & Biometric Tracker

**Feature**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Date**: 2026-11-09

Guía de arranque y validación de extremo a extremo. Los comandos y umbrales son los de `README.md` y `package.json`; el detalle de configuración está en `README.md`.

## Prerequisites

- Node.js 22 (`.nvmrc` = `22.23.4`; `engines` admite `>=22.18 <23`) y npm
- Todo corre en `127.0.0.1`; no hace falta ningún servicio externo
- Para las pruebas E2E, el navegador de Playwright: `npx playwright install chromium`
- Configuración regional UTF-8 (`LANG=C.UTF-8`) al ejecutar las pruebas

## Setup

```bash
nvm use        # opcional: Node 22.23.4
npm ci         # dependencias exactas del lockfile
```

## Run

```bash
npm run dev    # API en http://127.0.0.1:3000 y SPA en http://127.0.0.1:5173
```

## Validation Scenarios

Cada escenario corresponde a una historia de [spec.md](./spec.md).

| Historia | Pasos | Resultado esperado |
| :--- | :--- | :--- |
| US1 | Abrir `http://127.0.0.1:5173`, crear una cuenta, cerrar sesión e iniciar sesión | La sesión se inicia tras el registro; tras cerrar, las rutas protegidas redirigen al inicio de sesión |
| US2 | Registrar dos mascotas, filtrar por nombre, abrir una ficha, editarla y eliminar una escribiendo su nombre | La lista queda ordenada por nombre; la mascota eliminada y sus registros desaparecen |
| US3 | En una ficha, añadir un registro en cada uno de los 6 módulos y dos pesos | Cada historial aparece del más reciente al más antiguo; el segundo peso muestra su variación |
| US4 | Registrar una vacuna con refuerzo vencido, otra con refuerzo dentro de 0 a 15 días y otra con refuerzo a más de 15 días | Insignia roja con días de retraso (`OVERDUE`), ámbar (`DUE_SOON`) y verde (`UP_TO_DATE`), respectivamente; la tarjeta cuenta la alerta vencida |
| US5 | Con dos usuarios en navegadores separados: crear un hogar, invitar, aceptar | Antes de aceptar, el invitado no ve el hogar; después, ambos ven las mascotas con su dueño identificado |
| US6 | Exportar el respaldo, importarlo de nuevo e intentar importar un archivo inválido | La importación válida reemplaza los datos; la inválida devuelve su código de error y no cambia nada |

## Automated Gate

```bash
npm run test:gate
```

Se detiene en el primer fallo. Resultado esperado: salida 0 con trazabilidad del 100 % de los IDs vigentes y 0 violaciones de pureza, 0 oráculos débiles, `tsc --noEmit` sin errores, cobertura de líneas y ramas ≥ 95 % en `src/domain/` y `src/application/`, puntuación de mutación ≥ 85 % y 0 violaciones `critical` o `serious` de axe-core.

Compuertas parciales:

```bash
bash scripts/verify-traceability.sh                  # compuerta final de trazabilidad y pureza
bash scripts/verify-traceability.sh --task T019      # compuerta de una tarea de tasks.md
bash scripts/verify-oracles.sh                       # oráculos débiles
npm test                                             # Vitest sin cobertura
npm run test:e2e                                     # Playwright (requiere los puertos 3000 y 5173 libres)
```
