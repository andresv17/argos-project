# Entorno Local y Lecciones Permanentes (ARGOS)

> Archivo curado de consulta rápida (< 40 líneas) para evitar releer bitácoras extensas al arrancar sesión.

- **Puertos de desarrollo y E2E:** La API local usa `127.0.0.1:3100` y Vite `127.0.0.1:5173` (el puerto `3000` suele estar ocupado por Grafana en la máquina de Neo). En `vite.config.ts` y `playwright.config.ts` los puertos se pueden sobrescribir con `E2E_API_PORT` y `E2E_WEB_PORT`.
- **Runtime y Locale:** Node.js `22.23.4` (`.nvmrc`), zona horaria `America/Bogota`, locale Playwright `es-CO` (requiere UTF-8 para cadenas con tildes en pruebas).
- **Fases del Proyecto:**
  - `001`: Base funcional local (`specs/001-pet-health-tracker/`).
  - `002` (Fase 2): Especificación v2.1 (cuentas/eliminación, 8 especies, RBAC, timeout 30 min / 24 h, rediseño visual sin AI Slop).
  - `003` (Fase 3): Cloud en GCP + Terraform + GitHub Actions + diferidos (SSO, correo real, adjuntos PDF).
- **Regla de Artefactos y UI (`/sati`, `/architect`, `/link`, `/neb`):**
  - `/sati` prototipa pantallas en artefactos HTML + Tailwind (`320px`, `1024px`, `1280px`) para aprobación de Neo antes de que `/keymaker` implemente en `src/presentation/web/`. Prohibido "AI Slop" (cero UI muerta o decorativa sin respaldo real).
  - `/architect`, `/link` y `/neb` pueden emitir diagramas Mermaid para revisión rápida sin sustituir los archivos normativos.
- **Compuerta Final:** `bash scripts/verify-traceability.sh`, `bash scripts/verify-oracles.sh`, `npx tsc --noEmit` y `npm run test:gate`.
