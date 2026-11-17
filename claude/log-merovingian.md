# Bitácora de /merovingian

## 2026-11-15 — Gate 003 (Exiled Programs y causa-efecto)
- Lectura: SKILL, bus (10 últimas líneas), constitución (dependencias autorizadas), informes /lock, /mifune, /rama de la 003, specs/003-cloud-gcp.
- Consultas: npm view, npm audit, OSV, Terraform Registry, GitHub Releases, nodejs.org (sin instalar nada).
- Propuesta de versiones (Neo decide): pg 8.23.1, @types/pg 8.23.1, @fastify/static 10.1.8, esbuild 0.28.2 (dev); proveedor google ~>5.20 resuelve a 5.45.2 (línea congelada).
- 18 hallazgos: 3 altos (H-MERO-001 proveedor/lockfile, 002 HOST=0.0.0.0 rompe app-config.spec.ts:59, 003 compile-contracts solo 001/002 y misma src/generated), 10 medios, 5 bajos.
- Informe: .specify/memory/audits/gate-merovingian-003.md. Sin ediciones de specs/código/package.json ni commit.
