# Oracle 012 Bloque D (#32) 0.3.0 r2 revalidacion puntual (MAX_RETRY=1), 2026-11-27
Rama 012-multiduenio-microchip-cuidador. Gates: compile-contracts --feature 012 rc=0; verify-traceability --feature 012 rc=0 (CUMPLE).
- H-A CUMPLE: tasks.md:126 (T1675) traza SC-012-122 y SC-012-127; T1673 (tasks.md:124) traza SC-012-127.
- H-B CUMPLE: emergency-card.schema.json:421 y annex §9 (l.124 aprox.) con la misma frase "antes de reabrir trafico a la ficha o inmediatamente tras el despliegue (ventana de mantenimiento, runbook §9)".
- H-C CUMPLE: spec.md:301 SC-012-086 (43/42/44/200, sufijo, barra final, /e/ y /api/emergency/, logs/auditoria/cabeceras, req.url y Route not found); tasks.md:134 T1680 redactado por forma sin anclar.
- H-D CUMPLE: data-model.md:126 remite a x-sdd-constants.TEXT_POLICY como fuente unica.
- H-E CUMPLE: error-catalog.json:11 change_note con "NOTA PARA LA FIRMA DE NEO"; status raiz APPROVED (l.6) intacto (heredado 0.3.0); amendment_status 0.4.1 DRAFT; schema/openapi/annex en DRAFT 0.3.0; nada pasa a APPROVED.
- H-F CUMPLE: annex §8 (l.87) antes de §9 (l.118).
- INFO CUMPLE: annex l.64 fija que GET /e/{token} cuenta para QR_SCAN, a confirmar en T1675.
Veredicto: CUMPLE. Bloque D 0.3.0 listo para la firma de Neo (no se marca nada; solo Neo aprueba).
