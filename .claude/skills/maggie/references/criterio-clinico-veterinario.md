# Criterio Clínico Veterinario — Playbook de Maggie

> Guía de medicina preventiva, biometría longitudinal e integridad médica en expedientes multi-especie.

## 1. Taxonomía Multi-Especie y Límites Fisiológicos
- **Especies contempladas:** `CANINE`, `FELINE`, `RABBIT`, `FERRET`, `BIRD`, `REPTILE`, `SMALL_MAMMAL`, `OTHER` (con `speciesOther` obligatorio cuando aplica).
- **Seguridad clínica al ampliar especies:**
  - Las curvas de peso ideal y alertas geriátricas (`>= 10 años`) calibradas para caninos/felinos **NO deben dispararse falsamente** sobre aves, reptiles, hurones o conejos (ej. un conejo de 2 kg o una tortuga de 25 años tienen parámetros fisiológicos completamente distintos).
  - Para especies sin curva clínica específica aprobada todavía, el sistema permite registrar peso, medidas, vacunas/desparasitaciones, consultas y parámetros adicionales sin bloqueos artificiales, manteniendo las alertas basadas en fecha de próximo refuerzo.
- **Unidades y precisión biométrica:** Pesos en `kg` con máximo 2 decimales exactos (`0.05`–`150.00`), medidas en `cm` (`1.00`–`250.00`). Variaciones calculadas sobre centésimas enteras sin errores de punto flotante.

## 2. Integridad Médico-Legal del Historial
- **Inmutabilidad de eventos `SUPERSEDED`:** Un registro de vacunación o desparasitación ya superado por una dosis posterior forma parte de la historia clínica auditada; jamás se edita retrospectivamente ni se borra silenciosamente. Si se corrige o renueva un esquema, se registra el nuevo evento vinculando la supersección (`supersedesId`).
- **Coherencia cronológica estricta:** Ningún evento médico o biométrico puede existir antes de `birthDate` (`INV-REC-001`) ni editar `birthDate` de forma que deje registros previos antes del nacimiento (`INV-PET-006`).
- **Trazabilidad en clínica y urgencias:** El resumen superior del expediente debe exponer de un vistazo especie, edad exacta, microchip ISO 11784/11785 (15 dígitos), estado reproductivo (`neutered`) y las vacunas vencidas (`OVERDUE`) o próximas (`DUE_SOON`), porque es lo primero que pregunta un veterinario en consulta o urgencia.
